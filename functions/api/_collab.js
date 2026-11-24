/* Agent Collab Studio | 🤖 에이전트 협업 — AI 턴 · 최종 리포트 생성 공용 모듈
 *
 *  /api/collab 이 Workers AI(또는 사용자 BYOK 키)에 보낼 프롬프트를 만들고,
 *  모델이 돌려준 JSON 을 화면이 그대로 그릴 수 있는 형태로 검증·정규화한다.
 *
 *  - 모델이 없거나, 할당량이 없거나, 형식이 깨지면 브라우저는 기존 결정론적 엔진으로 폴백한다.
 *    (그래서 이 모듈은 "성공"만 책임지고, 실패는 null 로 돌려준다.)
 *  - HTML 은 여기서 만들지 않는다. 텍스트만 돌려주고 브라우저가 escape 해서 그린다.
 *  - Cloudflare Functions 와 Node 테스트에서 함께 쓰는 순수 함수 모음.
 */

/* 무료 Workers AI 텍스트 모델 — 앞에서부터 시도한다.
 * 2026-11 모델 카탈로그에서 제공 중인 것만 쓴다(@cf/meta/llama-3.1-8b-instruct-fp8 은 2026-11-20 폐기).
 * 한국어 협업 발언에 필요한 지시 따르기·JSON 형식·속도를 기준으로 고른 순서다. */
export const COLLAB_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/qwen/qwen3.8-27b",
  "@cf/google/gemma-4-26b-a4b-it",
];

export const BYOK_PROVIDERS = {
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    base: "https://generativelanguage.googleapis.com/v1beta/models/",
  },
  openrouter: {
    label: "OpenRouter",
    defaultModel: "openai/gpt-4o-mini",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
  },
};

export const LIMITS = {
  title: 180,
  goal: 700,
  context: 1100,
  agentName: 60,
  role: 60,
  team: 8,
  history: 10,
  historyText: 320,
  directives: 4,
  directive: 300,
  model: 80,
};

/* ── 텍스트 다듬기 ─────────────────────────────────────────────── */

const TAG = /<[^>]*>/g;

/** 한 줄 텍스트: 태그·제어문자 제거, 공백 정리, 길이 제한. */
export function cleanLine(value, max) {
  const text = String(value == null ? "" : value)
    .replace(TAG, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max - 1).trim() + "…";
}

/** 여러 줄 텍스트(마크다운 산출물): 태그만 제거하고 줄바꿈은 살린다. */
export function cleanBlock(value, max) {
  const text = String(value == null ? "" : value)
    .replace(TAG, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max - 1).trim() + "…";
}

export function hasHangul(text) {
  return /[가-힣]/.test(String(text || ""));
}

/** 응답에서 JSON 객체 하나를 꺼낸다 (코드블록·머리말·꼬리말 허용). */
export function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fences = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fences ? fences[1].trim() : raw;
  const candidates = [body];
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(body.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (error) {
      /* 다음 후보 시도 */
    }
  }
  /* 마지막 시도: 문자열 안의 중괄호 때문에 잘린 경우를 위한 균형 맞추기 */
  const start = body.indexOf("{");
  if (start < 0) return null;
  const slice = body.slice(start);
  for (let cut = slice.length; cut > 2; cut -= 1) {
    if (slice[cut - 1] !== "}") continue;
    try {
      const parsed = JSON.parse(slice.slice(0, cut));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (error) {
      /* 계속 */
    }
  }
  return null;
}

/* ── 요청 정규화 ───────────────────────────────────────────────── */

function cleanStringList(value, limit, max) {
  if (!Array.isArray(value)) return [];
  const out = [];
  value.slice(0, limit).forEach((item) => {
    const text = cleanLine(item, max);
    if (text && !out.includes(text)) out.push(text);
  });
  return out;
}

function cleanObjectList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

/** 클라이언트가 보낸 협업 요청을 안전한 크기로 정리한다. */
export function normalizeRequest(body) {
  const src = body && typeof body === "object" ? body : {};
  const mode = src.mode === "report" ? "report" : "turn";
  const mission = src.mission && typeof src.mission === "object" ? src.mission : {};
  const stage = Math.max(1, Math.min(10, Math.round(Number(src.stage) || 1)));
  const agent = src.agent && typeof src.agent === "object" ? src.agent : {};
  const title = cleanLine(mission.title, LIMITS.title);
  if (!title) return { ok: false, code: "empty_mission", message: "과제 제목이 필요합니다." };

  const directives = cleanStringList(src.directives, LIMITS.directives, 120);
  const directive = cleanLine(src.directive, LIMITS.directive);
  const byok = src.byok && typeof src.byok === "object" && src.byok.key
    ? {
        provider: String(src.byok.provider || "").toLowerCase(),
        key: String(src.byok.key).slice(0, 400),
        model: cleanLine(src.byok.model, LIMITS.model),
      }
    : null;

  const request = {
    mode,
    stage,
    stageName: cleanLine(src.stageName, 40),
    mission: {
      title,
      goal: cleanLine(mission.goal, LIMITS.goal),
      context: cleanLine(mission.context, LIMITS.context),
      audience: cleanLine(mission.audience, 80),
      deadline: cleanLine(mission.deadline, 60),
      deliverable: cleanLine(mission.deliverable, 120),
      keywords: cleanStringList(mission.keywords, 6, 40),
      constraints: cleanStringList(mission.constraints, 6, 90),
      kpis: cleanStringList(mission.kpis, 5, 90),
      checks: cleanStringList(mission.checks, 8, 120),
      plan: mission.plan === "B" ? "B" : "A",
      steps: cleanObjectList(mission.steps, 6).map((step) => ({
        name: cleanLine(step.name, 80),
        detail: cleanLine(step.detail, 220),
        when: cleanLine(step.when, 40),
        owner: cleanLine(step.owner, 40),
        output: cleanLine(step.output, 100),
      })),
      risks: cleanObjectList(mission.risks, 5).map((risk) => ({
        r: cleanLine(risk.r, 120),
        i: cleanLine(risk.i, 120),
        m: cleanLine(risk.m, 160),
      })),
    },
    agent: {
      id: cleanLine(agent.id, 40),
      name: cleanLine(agent.name, LIMITS.agentName),
      role: cleanLine(agent.role, LIMITS.role),
      sub: cleanLine(agent.sub, 100),
      badge: cleanLine(agent.badge, 60),
      limit: cleanLine(agent.limit, 90),
      extra: agent.extra === true,
    },
    team: cleanObjectList(src.team, LIMITS.team).map((member) => ({
      name: cleanLine(member.name, LIMITS.agentName),
      role: cleanLine(member.role, LIMITS.role),
      badge: cleanLine(member.badge, 60),
    })).filter((member) => member.name),
    history: cleanObjectList(src.history, LIMITS.history).map((message) => ({
      agent: cleanLine(message.agent, 40),
      stage: Math.max(0, Math.min(10, Math.round(Number(message.stage) || 0))),
      text: cleanLine(message.text, LIMITS.historyText),
    })).filter((message) => message.text),
    directives,
    directive,
    byok,
    model: cleanLine(src.model, LIMITS.model),
  };
  if (!request.agent.name) request.agent.name = "피클";
  if (request.byok && !BYOK_PROVIDERS[request.byok.provider]) {
    request.byok = null;
  }
  return { ok: true, request };
}

/* ── 프롬프트 ─────────────────────────────────────────────────── */

const PERSONA = {
  pickle:
    "피클(Lead · 총괄). 목표·제약·성공 기준을 붙잡고, 동료의 결과를 조율해 결정을 내린다. " +
    "차분한 리드 말투. 반드시 '채택 / 수정 / 보류' 같은 결정을 분명히 말하고, 누가 다음에 무엇을 하는지 지정한다.",
  gemini:
    "제미나이 태스크(실행). 실행 단계·일정·리소스·체크리스트를 숫자와 순서로 만든다. " +
    "막연한 조언 대신 '무엇을, 언제까지, 어떤 산출물로'를 적는다. 빠른 실행을 좋아한다.",
  codex:
    "코덱스(검증). 논리적 허점·리스크·반증 조건·품질 게이트를 날카롭게 지적한다. " +
    "칭찬보다 검증이 먼저다. 대안 A/B와 '이 신호가 보이면 접는다' 같은 판정 기준을 제시한다.",
};

const ROLE_LENS = {
  code: "코드 구현/PR 관점 — 저장소 구조, 변경 파일, 커밋·PR 단위, 테스트로 확인할 것.",
  ide: "IDE/CLI 실행 관점 — 로컬 명령, 실행 순서, 환경 변수, 실패 시 되돌릴 지점.",
  browser: "브라우저 검증 관점 — 실제 화면에서 확인할 경로, 체크 항목, 스크린샷으로 남길 증거.",
  local: "로컬 추론/초안 관점 — 오프라인에서 돌릴 초안, 프라이버시, 모델 한도.",
  research: "리서치/비교 관점 — 비교 기준, 출처 신뢰도, 결론이 뒤집힐 조건.",
  spec: "스펙 설계 관점 — 요구사항, 경계 조건, 인터페이스, 완료 정의.",
  docs: "문서/정리 관점 — 독자, 목차, 남길 기록, 재현 가능한 절차.",
  qa: "테스트/QA 관점 — 회귀 범위, 경계값, 통과 기준, 실패 재현 절차.",
};

const STAGE_TASKS = {
  1: {
    focus:
      "미션 브리핑. 과제 목표를 자기 언어로 다시 정의하고, 이 과제에서만 통하는 성공 기준 3개를 세운다. " +
      "제약을 어떻게 지킬지, 팀(피클·제미나이 태스크·코덱스·투입 에이전트)이 각각 무엇을 맡는지 정한다. " +
      "아직 계획을 길게 쓰지 말고 '무엇을 성공으로 볼지'를 분명히 한다.",
    artifact: false,
  },
  2: {
    focus:
      "과제 분해. 5단계 실행 계획을 단계명·기간·담당·산출물로 만든다. 오늘 30분 안에 할 수 있는 첫 행동, " +
      "계획 전에 사실로 확인해야 할 것 2개, 필요한 리소스를 적는다. 단계는 과제 내용에 맞게 구체적으로 이름 붙인다.",
    artifact: "실행 단계 초안",
  },
  3: {
    focus:
      "심층 검증. 제미나이 태스크의 5단계 계획에서 무너질 지점 3~4개를 지적하고(일정·범위·의존성·측정), " +
      "A안(좁고 빠르게)과 B안(넓고 완성도)을 비교해 하나를 권한다. 품질 검증 기준 3개를 제시한다.",
    artifact: false,
  },
  4: {
    focus:
      "중간 조율. 두 에이전트의 결과를 합쳐 결정 3개(채택·수정·보류)를 내린다. " +
      "사용자 지시가 있으면 무엇을 어떻게 바꿨는지 첫 문단에서 밝힌다. 다음 담당과 순서를 지정한다.",
    artifact: false,
  },
  5: {
    focus:
      "수정 실행안. 코덱스 지적을 반영해 단계 순서와 시간 배분을 다시 짠다. 이번 판에서 잘라낼 일과 " +
      "이번 판의 완료 약속 1개, 측정 지표 2개를 정한다.",
    artifact: "수정 실행 체크리스트",
  },
  6: {
    focus:
      "품질 게이트. 지표 3개의 측정 방법(표본·주기)과 기준 미달 시 행동을 정한다. " +
      "계획을 접어야 하는 반증 조건과, 없애지 못하고 계속 볼 리스크 하나를 적는다.",
    artifact: false,
  },
  7: {
    focus:
      "산출물 작성. 범위·일정·완료 조건이 한 문서에 들어간 실행 브리프를 만든다. " +
      " Markdown 으로 바로 복사해 쓸 수 있게 제목·소제목·체크리스트를 갖춘다.",
    artifact: "실행 브리프",
  },
  8: {
    focus:
      "실행 체크리스트. 첫 3일을 시간 단위로 잘라 오늘·내일·모레 할 일과 완료 판단을 만든다. " +
      "루틴을 고정하는 방법과 30분 이상 막힐 때의 규칙을 적는다.",
    artifact: "첫 3일 실행표",
  },
  9: {
    focus:
      "최종 검증. 결과물이 성공 기준을 통과하는지 항목별로 판정하고, 남은 리스크와 재검토 트리거를 적는다. " +
      "누가 어떤 방법으로 측정하면 되는지 한 문장으로 지정한다.",
    artifact: false,
  },
  10: {
    focus:
      "최종 종합. 10턴의 합의를 하나의 실행 계획으로 묶는다. 실행 로드맵·리스크 대응·바로 실행할 체크리스트·" +
      "품질 검증 기준·다음 단계를 실제로 쓸 수 있는 문장으로 정리한다.",
    artifact: false,
  },
};

function personaOf(agent) {
  if (PERSONA[agent.id]) return PERSONA[agent.id];
  const lens = ROLE_LENS[agent.id] || "";
  return (
    agent.name + "(" + (agent.role || "투입 에이전트") + "). " +
    (lens ? lens + " " : "") +
    "맡은 역할의 관점에서만 말하고, 한도(" + (agent.limit || "무료 범위") + ") 안에서 할 수 있는 일을 제안한다."
  );
}

function missionBlock(mission) {
  const lines = [
    "과제 제목: " + mission.title,
    "목표: " + (mission.goal || "제목에서 목표를 추론"),
    mission.context ? "배경·제약: " + mission.context : "",
    mission.audience ? "대상: " + mission.audience : "",
    mission.deadline ? "기간: " + mission.deadline : "기간: 정해지지 않음(2주 기본)",
    mission.deliverable ? "최종 결과물: " + mission.deliverable : "",
    mission.keywords.length ? "핵심 키워드: " + mission.keywords.join(", ") : "",
    mission.constraints.length ? "지켜야 할 제약: " + mission.constraints.join(" / ") : "",
    mission.steps.length
      ? "참고 실행 단계(로컬 분석): " + mission.steps.map((step, i) => (i + 1) + ") " + step.name + (step.when ? "(" + step.when + ")" : "") + " → " + (step.output || "")).join("; ")
      : "",
    mission.kpis.length ? "참고 지표: " + mission.kpis.join(", ") : "",
    mission.risks.length ? "참고 리스크: " + mission.risks.map((risk) => risk.r).join(" / ") : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function historyBlock(history) {
  if (!history.length) return "이전 발언: 없음(첫 턴)";
  return (
    "이전 발언(최근 " + history.length + "개):\n" +
    history.map((message) => "- [" + (message.stage ? "STEP " + message.stage + " " : "") + message.agent + "] " + message.text).join("\n")
  );
}

function directiveBlock(request) {
  const lines = [];
  if (request.directive) lines.push("이번 턴에 바로 반영해야 하는 사용자 지시: \"" + request.directive + "\"");
  if (request.directives.length) lines.push("앞선 사용자 지시: " + request.directives.map((text) => "\"" + text + "\"").join(" / "));
  return lines.join("\n");
}

const JSON_RULES =
  "출력은 JSON 객체 하나만. 코드블록·설명·인사말 금지. 모든 값은 한국어 문자열. " +
  "숫자·기간·산출물 이름을 실제 과제 내용에 맞게 넣고, 없는 사실을 지어내지 않는다. " +
  "같은 문장을 반복하지 않는다.";

const TURN_SHAPE =
  '{"say":["문단1","문단2"],"points":[{"t":"항목","d":"설명"}],"callout":{"label":"판단","text":"한 문장"},"artifact":{"title":"산출물 이름","markdown":"# 제목\\n- 항목"}}';

const REPORT_SHAPE =
  '{"say":["문단1","문단2"],"points":[{"t":"항목","d":"설명"}],"callout":{"label":"최종 판단","text":"한 문장"},' +
  '"summary":{"goal":"한 문장","context":"제약 요약","criteria":["기준1","기준2","기준3"]},' +
  '"roadmap":[{"step":"단계명","detail":"할 일","owner":"담당","when":"기간","output":"산출물"}],' +
  '"risks":[{"r":"리스크","i":"영향","m":"대응","s":"조기 신호"}],' +
  '"checklist":["바로 실행할 항목"],"gates":[{"name":"지표","method":"측정 방법","fail":"기준 미달 시"}],"next":["다음 단계"]}';

export function buildCollabPrompts(request) {
  const stage = STAGE_TASKS[request.stage] || STAGE_TASKS[1];
  const agent = request.agent;
  const teamLine = request.team.length
    ? "팀 구성: " + request.team.map((member) => member.name + "(" + member.role + (member.badge ? " · " + member.badge : "") + ")").join(", ")
    : "팀 구성: 피클 · 제미나이 태스크 · 코덱스";
  const system =
    "당신은 한국어 협업 시뮬레이터 'Agent Collab Studio'의 한 에이전트입니다. " +
    "사용자가 넣은 실제 과제를 두고 피클(Lead)·제미나이 태스크(실행)·코덱스(검증)와 함께 10턴 협업을 이어갑니다. " +
    "지금은 " + request.stage + "턴 '" + (request.stageName || stage.focus.split(".")[0]) + "'이고, 당신은 " + personaOf(agent) + " " +
    "동료 발언을 존중하되 같은 말을 되풀이하지 말고 한 걸음 더 나아간 내용을 씁니다. " +
    JSON_RULES;

  const lines = [
    missionBlock(request.mission),
    "",
    teamLine,
    "이번 턴 담당: " + agent.name + " — " + (agent.role || "") + (agent.sub ? " / " + agent.sub : ""),
    agent.extra ? "당신은 가이드에서 투입된 에이전트입니다. 부여된 역할(" + (agent.role || "실행") + ")의 관점에서만 발언하고, 자기 산출물을 하나 맡습니다." : "",
    "",
    historyBlock(request.history),
    "",
    directiveBlock(request),
    "",
    "이번 턴에 할 일: " + stage.focus,
    request.directive
      ? "사용자 지시를 첫 문단에서 인용하고, 이번 턴 내용이 그 지시 때문에 어떻게 달라졌는지 분명히 밝힙니다."
      : "",
    "",
    request.mode === "report"
      ? "지금까지의 협업을 하나의 최종 결과물로 종합합니다. 실행 로드맵은 3~5단계, 리스크는 3~4개, 체크리스트는 5~7개, 품질 게이트는 2~3개, 다음 단계는 2~3개로 실제 실행 가능한 문장을 씁니다."
      : stage.artifact
        ? "산출물도 함께 만듭니다. artifact.title 은 '" + stage.artifact + "'로 하고, artifact.markdown 은 복사해서 바로 쓸 수 있는 Markdown 문서로 씁니다."
        : "산출물은 만들지 않습니다(artifact 는 null).",
    "",
    "응답 형식(이 키만): " + (request.mode === "report" ? REPORT_SHAPE : TURN_SHAPE),
    "say 는 2~3문단, 각 1~3문장. points 는 2~4개. callout 은 결정·판단 한 문장.",
    request.mode === "report"
      ? "say 에는 최종 요약을, 나머지 키에는 실행에 바로 쓰는 구체 내용을 넣습니다."
      : "artifact 가 필요 없는 턴이면 artifact 를 null 로 둡니다.",
  ];
  return { system, user: lines.filter((line) => line !== "").join("\n") };
}

/* ── 응답 정규화 ───────────────────────────────────────────────── */

function cleanPoints(value, limit) {
  if (!Array.isArray(value)) return [];
  const out = [];
  value.slice(0, limit).forEach((item) => {
    if (typeof item === "string") {
      const text = cleanLine(item, 220);
      if (text) out.push({ t: "", d: text });
      return;
    }
    if (!item || typeof item !== "object") return;
    const title = cleanLine(item.t || item.title, 60);
    const detail = cleanLine(item.d || item.detail || item.text, 240);
    if (title || detail) out.push({ t: title, d: detail });
  });
  return out;
}

function cleanCallout(value) {
  if (!value || typeof value !== "object") return null;
  const label = cleanLine(value.label, 30);
  const text = cleanLine(value.text || value.d, 260);
  if (!text) return null;
  return { label: label || "판단", text };
}

function cleanSay(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => cleanLine(item, 480)).filter(Boolean);
}

function cleanArtifact(value, fallbackTitle) {
  if (!value || typeof value !== "object") return null;
  const markdown = cleanBlock(value.markdown || value.content, 3200);
  if (markdown.length < 40) return null;
  return { title: cleanLine(value.title, 60) || fallbackTitle || "AI 산출물", markdown };
}

/** 모델의 턴 응답 → 화면용 데이터. 너무 빈약하면 null(폴백). */
export function normalizeTurnPayload(value, fallbackArtifactTitle) {
  if (!value || typeof value !== "object") return null;
  const say = cleanSay(value.say || value.paragraphs, 4);
  const points = cleanPoints(value.points || value.bullets, 5);
  const callout = cleanCallout(value.callout);
  if (!say.length && !points.length) return null;
  /* 한국어가 거의 없으면(영어로 새는 경우) 폴백한다. */
  const joined = say.join(" ") + points.map((point) => point.t + " " + point.d).join(" ");
  if (!hasHangul(joined)) return null;
  return {
    say,
    points,
    callout,
    artifact: cleanArtifact(value.artifact, fallbackArtifactTitle),
  };
}

/** 모델의 최종 리포트 응답 → 부분 병합용 데이터. 쓸 만한 섹션이 3개 미만이면 null. */
export function normalizeReportPayload(value) {
  if (!value || typeof value !== "object") return null;
  const roadmap = Array.isArray(value.roadmap)
    ? value.roadmap.slice(0, 6).map((item) => ({
        step: cleanLine(item && (item.step || item.name), 60),
        detail: cleanLine(item && (item.detail || item.what), 240),
        owner: cleanLine(item && (item.owner || item.who), 40),
        when: cleanLine(item && (item.when || item.period), 40),
        output: cleanLine(item && (item.output || item.deliverable), 100),
      })).filter((row) => row.step && row.detail)
    : [];
  const risks = Array.isArray(value.risks)
    ? value.risks.slice(0, 6).map((item) => ({
        r: cleanLine(item && item.r, 120),
        i: cleanLine(item && item.i, 120),
        m: cleanLine(item && item.m, 200),
        s: cleanLine(item && item.s, 120),
      })).filter((row) => row.r && row.m)
    : [];
  const checklist = cleanStringList(value.checklist, 10, 160);
  const gates = Array.isArray(value.gates)
    ? value.gates.slice(0, 4).map((item) => ({
        name: cleanLine(item && item.name, 80),
        method: cleanLine(item && (item.method || item.how), 160),
        fail: cleanLine(item && (item.fail || item.fallback), 160),
      })).filter((row) => row.name && row.method)
    : [];
  const next = cleanStringList(value.next || value.nextSteps, 4, 180);
  const summary = value.summary && typeof value.summary === "object"
    ? {
        goal: cleanLine(value.summary.goal, 300),
        context: cleanLine(value.summary.context, 300),
        criteria: cleanStringList(value.summary.criteria, 5, 160),
      }
    : null;
  const say = cleanSay(value.say || value.paragraphs, 4);
  const points = cleanPoints(value.points || value.bullets, 5);
  const callout = cleanCallout(value.callout);
  const sections = [roadmap.length >= 2, risks.length >= 2, checklist.length >= 3, gates.length >= 1, next.length >= 1, summary && (summary.goal || summary.criteria.length)].filter(Boolean).length;
  if (sections < 3) return null;
  if (!hasHangul(say.join(" ") + roadmap.map((row) => row.step + row.detail).join(" "))) return null;
  return { say, points, callout, summary, roadmap, risks, checklist, gates, next };
}

/** 요청 하한 검사: 협업 턴을 만들 정보가 있는지. */
export function validateRequest(request) {
  if (!request || !request.mission || !request.mission.title) {
    return { ok: false, code: "empty_mission", message: "과제 제목이 필요합니다." };
  }
  if (request.mode === "turn" && !request.agent.name) {
    return { ok: false, code: "no_agent", message: "발언할 에이전트가 지정되지 않았습니다." };
  }
  return { ok: true };
}
