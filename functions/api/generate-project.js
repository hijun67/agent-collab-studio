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
const TOTAL_BUDGET = 45000;
const PER_ATTEMPT = 16000;

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
  const messages = [
    { role: "system", content: prompts.system },
    { role: "user", content: prompts.user },
  ];

  let poolResult = { ok: false, tried: [], exhausted: [], warnings: [] };
  if (attempts.length) {
    poolResult = await runPool({
      attempts,
      messages,
      deadline: started + TOTAL_BUDGET,
      perAttemptMs: PER_ATTEMPT,
      maxTokens: 3800,
      temperature: 0.5,
      fetchImpl: typeof fetch === "function" ? fetch : null,
      env,
      transform: (text) => {
        const project = normalizeProject(parseJsonObject(text), mission, Date.now());
        return project ? { ok: true, data: project } : { ok: false, reason: "파일 세트 형식 불일치" };
      },
      repair: (original, text) => [
        original[0],
        original[1],
        { role: "assistant", content: String(text || "").slice(0, 3000) },
        {
          role: "user",
          content:
            "위 응답이 지정한 JSON 형식이 아닙니다. 설명 없이 {\"name\",\"title\",\"summary\",\"files\":[{\"path\",\"content\"}]} 형태의 JSON 하나만 다시 출력하세요. " +
            "files 에는 index.html, style.css, app.js, README.md 가 반드시 있어야 하고, 각 content 는 실제 동작하는 완성 코드여야 합니다.",
        },
      ],
    });
  } else {
    poolResult.warnings.push("사용할 수 있는 AI가 없어 로컬 생성기로 프로젝트를 만들었습니다.");
  }

  if (poolResult.ok) {
    return json({
      ok: true,
      provider: poolResult.provider,
      providerLabel: providerLabel(poolResult.provider),
      model: poolResult.model,
      fallback: false,
      project: poolResult.data,
      tried: poolResult.tried,
      exhausted: poolResult.exhausted,
      warnings: poolResult.warnings,
      ms: Date.now() - started,
    });
  }

  const project = fallbackProject(mission, report, Date.now());
  const reason = describeTried(poolResult.tried) || poolResult.reason || "AI 미연결";
  return json({
    ok: true,
    provider: "local",
    providerLabel: "로컬 생성기",
    model: "",
    fallback: true,
    project,
    tried: poolResult.tried,
    exhausted: poolResult.exhausted,
    warnings: (poolResult.warnings || []).concat([reason ? "AI 대신 로컬 생성기가 파일을 만들었습니다 — " + reason : ""]).filter(Boolean),
    ms: Date.now() - started,
  });
}

/* 테스트에서 개별 함수를 쓰기 위한 export */
export { normalizeMission, normalizeReport, AI_POOL };
