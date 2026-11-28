/* /api/collab — 🤖 에이전트 협업 탭의 실제 AI 응답 (무료 AI 풀 · 자동 로테이션)
 *
 *  POST {
 *    mode: "turn" | "report",
 *    mission: {title, goal, context, audience, deadline, deliverable, keywords, constraints, kpis, checks, steps, risks, plan},
 *    stage: 1~10, stageName,
 *    agent: {id, name, role, sub, badge, limit, extra},
 *    team: [{name, role, badge}],
 *    history: [{agent, stage, text}],
 *    directives: ["..."], directive: "이번 턴에 반영할 사용자 지시",
 *    keys:  {groq, gemini, openrouter, cerebras, mistral, openai},   // 무료 AI 풀 키(BYOK, 선택)
 *    skip:  ["groq:llama-3.3-70b-versatile", "workers-ai"],          // 오늘 소진된 AI
 *    prefer: "auto" | "groq" | "workers-ai" ...,                     // 선택
 *    byok: {provider: "openai"|"gemini"|"openrouter", key, model}     // 예전 단일 엔진 형식
 *  }
 *  → {ok, mode, provider, providerLabel, model, ms, turn|report, tried[], exhausted[], warnings[]}
 *
 *  - 기본은 무료 AI 풀: 협업 턴은 사용자 무료 키 → Workers AI 경량 모델 순서(빌드 몫을 남긴다).
 *    모델은 라운드 로빈으로 섞여, Workers AI 가 4006/quota 로 막혀도 남은 무료 AI 의 모든 모델까지
 *    예산 안에서 시도한다. 유료(OpenAI)는 자동 순환에서 완전히 제외된다(BYOK 로 직접 고를 때만).
 *  - 한 프로바이더/모델이 하루 한도(4006·quota)를 돌려주면 exhausted 에 담아 알려 주고, 그 턴은
 *    다음 AI 가 이어서 만든다. 브라우저는 exhausted 를 오늘 하루 건너뛴다(localStorage).
 *  - 429(분당 제한)는 하루 소진이 아니다 — 서버가 짧게 쉬었다가 다시 시도하고 cooling 에 담는다.
 *  - 모두 실패하면 ok:false + 429/503 과 안내 문구를 돌려준다(v2.5.0 — 로컬 폴백 없음).
 *  - 키는 요청에만 쓰고 저장하지 않는다.
 *  - GET 은 기능 확인용(모델 목록·Workers AI 유무·풀 현황).
 */
import {
  BYOK_PROVIDERS,
  COLLAB_MODELS,
  buildCollabPrompts,
  normalizeReportPayload,
  normalizeRequest,
  normalizeTurnPayload,
  parseJsonObject,
  validateRequest,
} from "./_collab.js";
import {
  buildAttempts,
  collectKeys,
  describeTried,
  normalizeSkip,
  providerLabel,
  publicPool,
  runPool,
} from "./_aiPool.js";

/* 무료 한도 안에서 끝까지 돌린다.
   브라우저의 요청 타임아웃(38초)보다 짧게 두어, 풀을 다 돌린 뒤의 exhausted 목록을
   브라우저가 반드시 받게 한다(중간에 끊기면 소진 표시가 유실된다). */
const TURN_TIMEOUT = 14000;
const REPORT_TIMEOUT = 16000;
const TOTAL_BUDGET = 30000;
const MAX_BODY = 80 * 1024;

/* v2.5.0 — 로컬 결정론적 엔진을 폐기했으므로, 모든 AI 가 실패하면 이 문구를 그대로 보여 준다.
   (가짜/템플릿 결과물을 만들지 않는다.) */
export const AI_FAIL_NOTICE =
  "사용 가능한 무료 AI 한도가 모두 소진되었거나 응답이 없습니다. 🔑 API 키(Groq·Gemini 등)를 추가하거나 한도 초기화 후 다시 시도해 주세요.";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error((label || "timeout") + " after " + ms + "ms")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function providerText(data) {
  if (!data || typeof data !== "object") return "";
  if (Array.isArray(data.choices) && data.choices[0]) {
    const choice = data.choices[0];
    return (choice.message && choice.message.content) || choice.text || "";
  }
  if (Array.isArray(data.candidates) && data.candidates[0]) {
    const parts = (data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.map((part) => part && part.text).filter(Boolean).join("");
  }
  return "";
}

/** 모델이 형식을 깨뜨렸을 때 한 번만 다시 요청하는 메시지. */
function repairMessages(messages, rawText) {
  return [
    messages[0],
    messages[1],
    { role: "assistant", content: String(rawText || "").slice(0, 4000) },
    {
      role: "user",
      content:
        "위 응답이 지정한 JSON 형식과 맞지 않습니다. 설명·인사말·코드블록 없이, 지정한 키를 가진 JSON 객체 하나만 다시 출력하세요. " +
        "값은 모두 한국어이고, 빈 배열이라도 키는 반드시 포함하세요.",
    },
  ];
}

function finish(value, fallbackTitle, mode) {
  return mode === "report" ? normalizeReportPayload(value) : normalizeTurnPayload(value, fallbackTitle);
}

/** 예전 단일 BYOK 형식 — 사용자가 고른 엔진 하나로만 호출한다(자동 전환 없음). */
async function callByok(request, messages, fallbackTitle) {
  const byok = request.byok;
  const def = BYOK_PROVIDERS[byok.provider];
  if (!def) return { ok: false, code: "byok_provider", message: "지원하지 않는 BYOK 제공자입니다." };
  const model = byok.model || def.defaultModel;
  const maxTokens = request.mode === "report" ? 1600 : 950;
  const headers = { "content-type": "application/json" };
  let body;
  let url;
  if (byok.provider === "gemini") {
    url = def.base + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(byok.key);
    body = {
      contents: [{ role: "user", parts: [{ text: messages[0].content + "\n\n" + messages[1].content }] }],
      generationConfig: { temperature: 0.55, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
    };
  } else {
    url = def.endpoint;
    headers.authorization = "Bearer " + byok.key;
    if (byok.provider === "openrouter") {
      headers["HTTP-Referer"] = "https://agent-collab-studio.pages.dev";
      headers["X-Title"] = "Agent Collab Studio";
    }
    body = {
      model,
      messages: [
        { role: "system", content: messages[0].content },
        { role: "user", content: messages[1].content },
      ],
      temperature: 0.55,
      max_tokens: maxTokens,
    };
  }
  try {
    const response = await withTimeout(
      fetch(url, { method: "POST", headers, body: JSON.stringify(body) }),
      request.mode === "report" ? REPORT_TIMEOUT : TURN_TIMEOUT,
      byok.provider
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, code: "byok_error", message: def.label + " " + response.status + " " + text.slice(0, 160) };
    }
    const payload = await response.json().catch(() => null);
    const text = providerText(payload);
    let data = finish(parseJsonObject(text), fallbackTitle, request.mode);
    if (!data) {
      return { ok: false, code: "bad_output", message: def.label + " 응답을 해석하지 못했습니다.", tried: [model] };
    }
    return { ok: true, provider: "byok-" + byok.provider, model, data, warnings: [], tried: [model] };
  } catch (error) {
    return { ok: false, code: "byok_error", message: String((error && error.message) || error).slice(0, 160) };
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  if (method === "GET") {
    return json({
      ok: true,
      service: "agent-collab-studio",
      endpoint: "collab",
      version: "2.7.0",
      workersAi: Boolean(env && env.AI && typeof env.AI.run === "function"),
      models: COLLAB_MODELS,
      byok: Object.keys(BYOK_PROVIDERS),
      pool: publicPool(env),
      rotation: true,
      modes: ["turn", "report"],
      stages: 10,
    });
  }
  if (method !== "POST") return json({ ok: false, code: "method_not_allowed", message: "POST 로 호출해 주세요." }, 405);

  let raw;
  try {
    raw = await request.text();
  } catch (error) {
    return json({ ok: false, code: "bad_body", message: "요청 본문을 읽지 못했습니다." }, 400);
  }
  if (raw.length > MAX_BODY) {
    return json({ ok: false, code: "too_large", message: "요청이 너무 큽니다." }, 413);
  }
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch (error) {
    return json({ ok: false, code: "bad_json", message: "요청 JSON 을 해석하지 못했습니다." }, 400);
  }

  const normalized = normalizeRequest(body);
  if (!normalized.ok) return json({ ok: false, code: normalized.code, message: normalized.message }, 400);
  const req = normalized.request;
  const checked = validateRequest(req);
  if (!checked.ok) return json({ ok: false, code: checked.code, message: checked.message }, 400);

  const started = Date.now();
  const prompts = buildCollabPrompts(req);
  const messages = [
    { role: "system", content: prompts.system },
    { role: "user", content: prompts.user },
  ];
  const fallbackTitle = req.mode === "report" ? "최종 결과물 리포트" : "";

  let result;
  if (req.byok) {
    result = await callByok(req, messages, fallbackTitle);
  } else {
    const keys = collectKeys(body, env);
    const skip = normalizeSkip(body.skip);
    const prefer = String(body.prefer || "auto").slice(0, 30);
    const model = String(req.model || "").slice(0, 80);
    const models = model && prefer !== "auto" ? { [prefer]: model } : {};
    const attempts = buildAttempts({ keys, skip, prefer, models, env, includeWorkersAi: true, profile: "collab" });
    if (!attempts.length) {
      return json({
        ok: false,
        mode: req.mode,
        stage: req.stage,
        code: "ai_unavailable",
        message: AI_FAIL_NOTICE,
        provider: "",
        ms: Date.now() - started,
        tried: [],
        exhausted: [],
        cooling: [],
        warnings: [],
      }, 503);
    }
    const pool = await runPool({
      attempts,
      messages,
      deadline: started + TOTAL_BUDGET,
      perAttemptMs: req.mode === "report" ? REPORT_TIMEOUT : TURN_TIMEOUT,
      maxTokens: req.mode === "report" ? 1600 : 950,
      temperature: 0.55,
      fetchImpl: typeof fetch === "function" ? fetch : null,
      env,
      transform: (text) => {
        const data = finish(parseJsonObject(text), fallbackTitle, req.mode);
        return data ? { ok: true, data } : { ok: false, reason: "JSON 형식 불일치" };
      },
      repair: repairMessages,
    });
    result = pool;
  }

  const ms = Date.now() - started;

  if (!result.ok || !result.data) {
    const tried = result.tried || [];
    const joined = typeof tried[0] === "string" ? tried.join(" ") : describeTried(tried);
    const exhausted = result.exhausted || [];
    const cooling = result.cooling || [];
    /* v2.5.0 — 로컬 결정론적 엔진 폐기. 이제 실패는 실패로 돌려주고 브라우저가 안내한다. */
    let message = result.message || AI_FAIL_NOTICE;
    if (exhausted.length) {
      message = AI_FAIL_NOTICE + (joined ? " (" + joined + ")" : "");
    } else if (cooling.length) {
      message = "분당 요청 제한(429)으로 잠시 막혔습니다 — 몇 초 뒤 다시 시도해 주세요." + (joined ? " (" + joined + ")" : "");
    } else if (/deprecated|5028|model_gone/i.test(joined)) {
      message = "이 모델은 제공이 종료되었습니다. 다음 모델로 다시 시도해 주세요." + (joined ? " (" + joined + ")" : "");
    } else if (tried.length && tried.every((t) => t && typeof t === 'object' && t.kind === 'auth')) {
      message = "무료 AI 키를 인증하지 못했습니다 — " + joined + ". AI 설정에서 각 프로바이더 키를 다시 확인해 주세요.";
    } else if (joined) {
      message = "AI가 정한 형식으로 답하지 않았습니다 — " + joined.slice(0, 160) + ". 다시 시도해 주세요.";
    }
    return json({
      ok: false,
      mode: req.mode,
      stage: req.stage,
      code: exhausted.length ? "ai_quota" : result.code || "ai_unavailable",
      message,
      provider: result.provider || (req.byok ? "byok-" + req.byok.provider : ""),
      ms,
      tried,
      exhausted,
      cooling,
      warnings: result.warnings || [],
    }, exhausted.length ? 429 : 503);
  }

  const payload = {
    ok: true,
    mode: req.mode,
    stage: req.stage,
    stageName: req.stageName,
    provider: result.provider,
    providerLabel: providerLabel(result.provider),
    model: result.model,
    ms,
    warnings: result.warnings || [],
    tried: result.tried || [],
    exhausted: result.exhausted || [],
    cooling: result.cooling || [],
    byok: Boolean(req.byok),
  };
  payload[req.mode === "report" ? "report" : "turn"] = result.data;
  return json(payload, 200);
}
