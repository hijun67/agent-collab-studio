/* /api/generate-project — 협업 과제·최종 리포트 → 실제 프로젝트 파일 세트
 *
 *  POST {
 *    mission: {title, goal, context, audience, deadline, deliverable, steps[], checks[], risks[]},
 *    report:  {summary, roadmap[], risks[], checklist[], gates[], next[]},   // 선택
 *    keys:    {groq, gemini, openrouter, cerebras, mistral, openai},          // 선택(BYOK)
 *    skip:    ["workers-ai", "groq:llama-3.3-70b-versatile", ...],            // 오늘 소진된 AI
 *    prefer:  "groq" | "auto",                                                // 선택
 *    model:   "모델명"                                                         // 선택
 *  }
 *  → 200 { ok, project:{name,title,summary,files:[{path,content,bytes,mime}]}, provider, model, tried[], exhausted[], cooling[], ms }
 *    429 { ok:false, code:"ai_quota",  message }  — 무료 한도 소진
 *    503 { ok:false, code:"ai_unavailable", message } — AI 미연결·응답 없음
 *
 *  - v2.5.0: 로컬 결정론적 생성기를 폐기했다. 프로젝트는 **실제 AI 응답으로만** 만든다.
 *  - 모든 AI 가 실패하면 가짜/템플릿 앱을 만들지 않고 명시적 오류와 안내 문구를 돌려준다.
 *  - 두 단계(마크업 → 로직)로 나눠 만들고, 두 단계 모두 성공해야 프로젝트를 돌려준다.
 *  - 키는 요청에만 쓰고 저장하지 않는다.
 */
import {
  AI_POOL,
  buildAttempts,
  collectKeys,
  describeTried,
  normalizeSkip,
  providerLabel,
  publicPool,
  runPool,
} from "./_aiPool.js";
import {
  ARCHETYPE_HINTS,
  PROJECT_LIMITS,
  buildProjectPrompt,
  detectArchetype,
  extractIds,
  normalizeProject,
} from "./_project.js";
import { parseJsonObject } from "./_collab.js";

export const AI_FAIL_NOTICE =
  "사용 가능한 무료 AI 한도가 모두 소진되었거나 응답이 없습니다. 🔑 API 키(Groq·Gemini 등)를 추가하거나 한도 초기화 후 다시 시도해 주세요.";

const MAX_BODY = 120 * 1024;
/* 두 단계를 합쳐 50초 안에서 끝낸다. 한 번의 시도는 20초까지 주되, 남은 무료 프로바이더가 있으면
   그 몫을 남겨 두고 배분한다(_aiPool.allocateTimeout) — Workers AI 가 막혀도 Mistral 까지 간다. */
const TOTAL_BUDGET = 70000;
const PER_ATTEMPT = 24000;

/* 한 번에 4파일을 만들면 모델이 16초 안에 끝내지 못한다(실측).
   두 단계로 나눠 각 단계의 출력을 작게 유지한다.
   v2.2 — "실행 대시보드" 하드코딩을 없애고, 과제가 요구하는 실제 앱을 만들게 한다.
   (계획·점검 성격 과제일 때만 대시보드를 결과물로 지시한다.) */
function buildPhases(mission) {
  const arche = detectArchetype(mission, null);
  const hint = ARCHETYPE_HINTS[arche.id] || ARCHETYPE_HINTS.todo;
  const appStyle = arche.id === "dashboard"
    ? "이 과제는 계획·점검 성격입니다. 실행 대시보드(진행률·단계·체크리스트·리스크·메모)를 만들되 체크·메모·테마는 실제로 동작해야 합니다."
    : arche.id === "board"
      ? "이 과제는 **사용자가 직접 항목을 넣고 관리하는 개인 보드**입니다 — 제목·링크(URL)·카테고리·마감일을 넣는 추가 폼, 항목 추가, 항목별 삭제, D-day 자동 계산, 마감 임박 순 자동 정렬, 카테고리 필터, 검색, localStorage 저장이 모두 실제로 동작해야 합니다(읽기 전용 목록으로 대체 금지)."
      : "결과물은 이 과제가 요구하는 **동작하는 앱**입니다 — " + hint + ". 기획서·로드맵·점검표 화면으로 대체하지 마세요.";
  const boardLogic = arche.id === "board"
    ? " 특히 (1) 추가 폼 submit → 항목 배열에 push → localStorage 저장 → 즉시 다시 그리기, (2) 항목별 삭제 버튼 → 배열에서 제거 → 저장, (3) 마감일로 D-day 계산(오늘= D-DAY, 지난 날짜=마감, 남은 날= D-N) 후 **임박한 항목이 위로 오도록 정렬**, (4) 카테고리 필터 + 검색어 필터, (5) 제목을 누르면 링크를 새 탭으로 여는 동작을 반드시 넣으세요. 샘플 항목은 3~4개만 넣고 나머지는 사용자가 추가합니다."
    : "";
  return [
    {
      key: "markup",
      files: ["index.html", "style.css"],
      tokens: 2600,
      ask:
        "지금은 index.html 과 style.css 두 파일만 만드세요. " + appStyle + " " +
        "index.html 은 앱 화면(입력·버튼·목록·결과 영역)을 담고, <h1> 에는 과제 제목만 넣으며 목표 문장은 <p class=\"lead\"> 로 따로 쓰세요. " +
        "제목과 목표를 붙여 쓰지 마세요. style.css 를 상대경로로 연결하고 app.js 도 <script src=\"app.js\"></script> 로 연결하세요(내용은 다음 단계). " +
        "다음 단계의 app.js 가 쓸 id 를 지금 정해 모두 실제로 넣으세요 — id=\"themeBtn\"(테마 버튼)은 반드시 포함하고, " +
        "조작 요소(입력창·추가/시작 버튼·목록 컨테이너·결과 표시)마다 id 를 붙이세요. " +
        (arche.id === "board" ? "추가 폼에는 id=\"itemForm\", 제목 입력 id=\"itemTitle\", 링크 입력 id=\"itemUrl\", 카테고리 선택 id=\"itemCat\", 마감일 입력 id=\"itemDue\"(type=date), 목록 컨테이너 id=\"itemList\", 검색 id=\"search\", 필터 id=\"filterCat\", 빈 상태 id=\"emptyState\" 를 넣으세요. " : "") +
        "각 파일은 220줄 이내로 쓰되 실제로 보기 좋고 390px 에서 가로로 넘치지 않아야 합니다.",
    },
    {
      key: "logic",
      files: ["app.js", "README.md"],
      tokens: 2600,
      ask:
        "지금은 app.js 와 README.md 두 파일만 만드세요. app.js 는 아래에 붙은 index.html 의 실제 id/class 만 사용해 " +
        "모든 버튼·입력을 실제 동작으로 연결하고(예: " + hint + "), 상태를 localStorage 에 저장하며 #themeBtn 로 다크/라이트 테마를 바꿉니다. " + boardLogic + " " +
        "모든 요소 접근에 null 확인을 넣어 요소가 없어도 오류로 멈추지 않게 하세요. " +
        "README.md 는 앱 소개·기능 목록·파일 목록·실행 방법·GitHub Pages/Cloudflare Pages 배포 방법을 적습니다. 각 160줄 이내.",
    },
  ];
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function clean(value, max) {
  return String(value == null ? "" : value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value, limit, max) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => clean(item, max)).filter(Boolean);
}

function rows(value, limit, keys) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).filter((item) => item && typeof item === "object").map((item) => {
    const out = {};
    keys.forEach((key) => { out[key] = clean(item[key], 220); });
    return out;
  });
}

function normalizeMission(src) {
  const m = src && typeof src === "object" ? src : {};
  return {
    title: clean(m.title, 180),
    goal: clean(m.goal, 700),
    context: clean(m.context, 900),
    audience: clean(m.audience, 80),
    deadline: clean(m.deadline, 60),
    deliverable: clean(m.deliverable, 120),
    steps: Array.isArray(m.steps)
      ? m.steps.slice(0, 6).filter((s) => s && typeof s === "object").map((s) => ({
          name: clean(s.name, 80),
          detail: clean(s.detail, 220),
          when: clean(s.when, 40),
          owner: clean(s.owner, 40),
          output: clean(s.output, 100),
        }))
      : [],
    checks: list(m.checks, 8, 160),
    risks: rows(m.risks, 4, ["r", "i", "m"]),
  };
}

function normalizeReport(src) {
  const r = src && typeof src === "object" ? src : null;
  if (!r) return null;
  return {
    summary: r.summary && typeof r.summary === "object"
      ? { goal: clean(r.summary.goal, 400), context: clean(r.summary.context, 400) }
      : null,
    roadmap: rows(r.roadmap, 6, ["step", "detail", "owner", "when", "output"]),
    risks: rows(r.risks, 5, ["r", "i", "m"]),
    checklist: list(r.checklist, 10, 200),
    gates: rows(r.gates, 4, ["name", "method", "fail"]),
    next: list(r.next, 4, 200),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  if (method === "GET") {
    return json({
      ok: true,
      endpoint: "generate-project",
      pool: publicPool(env),
      files: ["index.html", "style.css", "app.js", "README.md"],
      limits: PROJECT_LIMITS,
      archetypes: ["board", "pomodoro", "calculator", "todo", "quiz", "notes", "directory", "dashboard"],
    });
  }
  if (method !== "POST") return json({ ok: false, code: "method_not_allowed", message: "POST 로 호출해 주세요." }, 405);

  let raw;
  try { raw = await request.text(); } catch (error) {
    return json({ ok: false, code: "bad_body", message: "요청 본문을 읽지 못했습니다." }, 400);
  }
  if (raw.length > MAX_BODY) return json({ ok: false, code: "too_large", message: "요청이 너무 큽니다." }, 413);
  let body;
  try { body = JSON.parse(raw || "{}"); } catch (error) {
    return json({ ok: false, code: "bad_json", message: "요청 JSON 을 해석하지 못했습니다." }, 400);
  }

  const mission = normalizeMission(body.mission);
  if (!mission.title) return json({ ok: false, code: "empty_mission", message: "과제 제목이 필요합니다." }, 400);
  const report = normalizeReport(body.report);

  const started = Date.now();
  const keys = collectKeys(body, env);
  const skip = normalizeSkip(body.skip);
  const prefer = clean(body.prefer, 30) || "auto";
  const model = clean(body.model, 80);
  const models = model && prefer !== "auto" ? { [prefer]: model } : {};
  /* 빌드는 Workers AI 의 큰 모델부터 — 협업(collab)이 경량 모델로 남겨 둔 여유를 쓴다. */
  const attempts = buildAttempts({ keys, skip, prefer, models, env, includeWorkersAi: true, profile: "build", maxModelsPerProvider: 1 });

  const prompts = buildProjectPrompt(mission, report);

  const tried = [];
  const exhausted = [];
  const cooling = [];
  const warnings = [];
  let usedProvider = "";
  let usedModel = "";
  let title = "";
  let summary = "";
  let name = "";
  const collected = {};
  let failedReason = "";

  const phases = buildPhases(mission);
  if (attempts.length) {
    let remaining = attempts.slice();
    for (const phase of phases) {
      if (!remaining.length) break;
      if (started + TOTAL_BUDGET - Date.now() < 6000) {
        warnings.push("시간이 부족해 남은 단계는 로컬 생성기로 채웁니다.");
        failedReason = "시간 초과";
        break;
      }
      const markupIds = phase.key === "logic" ? extractIds(collected["index.html"] || "") : [];
      const phaseUser = [
        prompts.user,
        "",
        "이번 단계에서 만들 파일: " + phase.files.join(", "),
        phase.ask,
        markupIds.length ? "index.html 에 실제로 들어 있는 id (app.js 는 이것만 사용하세요): " + markupIds.join(", ") : "",
        Object.keys(collected).length
          ? "이미 만든 파일: " + Object.keys(collected).join(", ") + "\n앞 단계 index.html 전체:\n```html\n" +
            String(collected["index.html"] || "").slice(0, 3500) + "\n```"
          : "",
        '응답은 {"name","title","summary","files":[{"path","content"}]} 형태의 JSON 하나만. files 에는 이번 단계 파일만 넣으세요.',
      ].filter(Boolean).join("\n");
      const messages = [
        { role: "system", content: prompts.system },
        { role: "user", content: phaseUser },
      ];
      const result = await runPool({
        attempts: remaining,
        messages,
        deadline: started + TOTAL_BUDGET,
        perAttemptMs: PER_ATTEMPT,
        maxTokens: phase.tokens,
        temperature: 0.45,
        fetchImpl: typeof fetch === "function" ? fetch : null,
        env,
        transform: (text) => {
          const value = parseJsonObject(text);
          const part = normalizeProject(value, mission, Date.now(), { partial: true, required: phase.files });
          return part ? { ok: true, data: part } : { ok: false, reason: "파일 묶음 형식 불일치" };
        },
        repair: (original, text) => [
          original[0],
          original[1],
          { role: "assistant", content: String(text || "").slice(0, 2500) },
          {
            role: "user",
            content:
              "위 응답이 지정한 JSON 형식이 아닙니다. 설명 없이 {\"name\",\"title\",\"summary\",\"files\":[{\"path\",\"content\"}]} JSON 하나만 다시 출력하세요. " +
              "files 에는 " + phase.files.join(", ") + " 만 넣고, content 는 실제로 동작하는 완성 코드여야 합니다.",
          },
        ],
      });
      tried.push.apply(tried, result.tried || []);
      (result.exhausted || []).forEach((key) => { if (!exhausted.includes(key)) exhausted.push(key); });
      (result.cooling || []).forEach((key) => { if (!cooling.includes(key)) cooling.push(key); });
      (result.warnings || []).forEach((text) => warnings.push(text));
      if (!result.ok) {
        failedReason = "AI 응답 실패: " + (describeTried(result.tried) || result.reason || "");
        break;
      }
      usedProvider = usedProvider || result.provider;
      usedModel = usedModel || result.model;
      const project = result.data;
      title = title || project.title;
      summary = summary || project.summary;
      name = name || project.name;
      project.files.forEach((file) => { collected[file.path] = file.content; });
      /* 이번 단계에서 소진된 AI는 다음 단계에서 건너뛴다. */
      const skipSet = new Set(result.exhausted || []);
      remaining = remaining.filter((attempt) => {
        const key = attempt.provider + ":" + attempt.model;
        return !skipSet.has(key) && !skipSet.has(attempt.provider);
      });
    }
  } else {
    warnings.push("사용할 수 있는 AI 가 없습니다(Workers AI 미연결·키 없음).");
  }

  const merged = collected["index.html"]
    ? normalizeProject(
        { name, title, summary, files: Object.keys(collected).map((path) => ({ path, content: collected[path] })) },
        mission,
        Date.now(),
        { partial: true, required: ["index.html", "style.css", "app.js", "README.md"] }
      )
    : null;
  if (merged && usedProvider) {
    return json({
      ok: true,
      provider: usedProvider,
      providerLabel: providerLabel(usedProvider),
      model: usedModel,
      fallback: false,
      project: merged,
      tried,
      exhausted,
      cooling,
      warnings,
      ms: Date.now() - started,
    });
  }

  /* v2.5.0 — 로컬 생성기로 대신 만들지 않는다. 명시적 실패 + 안내만 돌려준다. */
  const detail = failedReason || describeTried(tried) || "AI 미연결";
  const partial = Object.keys(collected).length
    ? " (일부 파일만 받아 프로젝트로 묶지 않았습니다: " + Object.keys(collected).join(", ") + ")"
    : "";
  return json(
    {
      ok: false,
      code: exhausted.length ? "ai_quota" : "ai_unavailable",
      message: AI_FAIL_NOTICE,
      detail: detail + partial,
      provider: "",
      model: "",
      tried,
      exhausted,
      cooling,
      warnings,
      ms: Date.now() - started,
    },
    exhausted.length ? 429 : 503
  );
}

/* 테스트에서 개별 함수를 쓰기 위한 export */
export { normalizeMission, normalizeReport, AI_POOL };
