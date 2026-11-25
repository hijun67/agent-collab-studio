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
 *  → { ok, project:{name,title,summary,files:[{path,content,bytes,mime}]},
 *      provider, model, fallback, tried[], exhausted[], ms, warnings[] }
 *
 *  - 무료 AI 풀을 순서대로 시도하고, 할당량이 소진된 프로바이더는 결과의 exhausted 로 알려 준다.
 *  - 모든 AI 가 실패/미연결이어도 과제 맞춤형으로 실제 동작하는 파일 세트를 폴백 생성한다(fallback:true).
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
  PROJECT_LIMITS,
  buildProjectPrompt,
  fallbackProject,
  normalizeProject,
} from "./_project.js";
import { parseJsonObject } from "./_collab.js";

const MAX_BODY = 120 * 1024;
const TOTAL_BUDGET = 62000;
const PER_ATTEMPT = 22000;

/* 한 번에 4파일을 만들면 모델이 16초 안에 끝내지 못한다(실측).
   두 단계로 나눠 각 단계의 출력을 작게 유지한다. */
const PHASES = [
  {
    key: "markup",
    files: ["index.html", "style.css"],
    tokens: 1800,
    ask:
      "지금은 index.html 과 style.css 두 파일만 만드세요. index.html 은 실행 대시보드 화면(헤더·진행률·단계·체크리스트·리스크·메모)을 담고, " +
      "style.css 를 상대경로로 연결하며 app.js 도 <script src=\"app.js\"></script> 로 연결하세요(내용은 다음 단계에서 만듭니다). " +
      "다음 단계의 app.js 가 쓰도록 아래 id 를 index.html 에 반드시 넣으세요: " +
      "id=\"progress\"(진행률 텍스트), id=\"progress-bar\"(진행률 막대), id=\"theme-toggle\"(테마 버튼), id=\"memo\"(메모 textarea), " +
      "그리고 체크리스트의 각 input 에 class=\"check\" 를 붙이세요. 각 파일은 130줄 이내로 간결하게 쓰되 실제로 보기 좋은 완성 화면이어야 합니다.",
  },
  {
    key: "logic",
    files: ["app.js", "README.md"],
    tokens: 1400,
    ask:
      "지금은 app.js 와 README.md 두 파일만 만드세요. app.js 는 아래에 그대로 붙은 index.html 의 id/class 만 사용해 " +
      "체크박스(class=\"check\") 토글·진행률(#progress·#progress-bar) 계산·localStorage 저장·테마 전환(#theme-toggle)·메모 자동 저장(#memo)을 구현합니다. " +
      "모든 요소 접근에 null 확인을 넣어, 요소가 없어도 오류로 멈추지 않게 하세요. README.md 는 프로젝트 소개·파일 목록·실행 방법·GitHub Pages/Cloudflare Pages 배포 방법을 적습니다. 각 120줄 이내.",
  },
];

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
  const models = model ? { [prefer]: model } : {};
  const attempts = buildAttempts({ keys, skip, prefer, models, env, includeWorkersAi: true });

  const prompts = buildProjectPrompt(mission, report);

  const tried = [];
  const exhausted = [];
  const warnings = [];
  let usedProvider = "";
  let usedModel = "";
  let title = "";
  let summary = "";
  let name = "";
  const collected = {};
  let failedReason = "";

  if (attempts.length) {
    let remaining = attempts.slice();
    for (const phase of PHASES) {
      if (!remaining.length) break;
      if (started + TOTAL_BUDGET - Date.now() < 6000) {
        warnings.push("시간이 부족해 남은 단계는 로컬 생성기로 채웁니다.");
        failedReason = "시간 초과";
        break;
      }
      const phaseUser = [
        prompts.user,
        "",
        "이번 단계에서 만들 파일: " + phase.files.join(", "),
        phase.ask,
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
    warnings.push("사용할 수 있는 AI가 없어 로컬 생성기로 프로젝트를 만들었습니다.");
  }

  const merged = normalizeProject(
    { name, title, summary, files: Object.keys(collected).map((path) => ({ path, content: collected[path] })) },
    mission,
    Date.now(),
    { partial: true, required: ["index.html", "style.css", "app.js", "README.md"] }
  );
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
      warnings,
      ms: Date.now() - started,
    });
  }

  const project = fallbackProject(mission, report, Date.now());
  const reason = failedReason || describeTried(tried) || "AI 미연결";
  return json({
    ok: true,
    provider: "local",
    providerLabel: "로컬 생성기",
    model: "",
    fallback: true,
    project,
    tried,
    exhausted,
    warnings: warnings.concat([reason ? "AI 대신 로컬 생성기가 파일을 만들었습니다 — " + reason : ""]).filter(Boolean),
    ms: Date.now() - started,
  });
}

/* 테스트에서 개별 함수를 쓰기 위한 export */
export { normalizeMission, normalizeReport, AI_POOL };
