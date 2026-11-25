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
 *  - 기본은 무료 AI 풀: Workers AI → Groq → Gemini → OpenRouter → Cerebras → Mistral.
 *    모델은 라운드 로빈으로 섮여, Workers AI 가 4006/quota 로 막혀도 남은 무료 AI 의 모든 모델까지
 *    예산 안에서 시도한다. 유료(OpenAI)는 자동 순환에서 완전히 제외된다(BYOK 로 직접 고를 때만).
 *  - 한 프로바이더/모델이 429·4006·quota 를 돌려주면 exhausted 에 담아 알려 주고, 그 턴은
 *    다음 AI 가 이어서 만든다. 브라우저는 exhausted 를 오늘 하루 건너뛴다(localStorage).
 *  - 모두 실패하면 ok:false 를 돌려주고 브라우저는 결정론적 로컬 엔진으로 폴백한다.
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
      version: "2.3.0",
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
  let attemptProviders = [];
  if (req.byok) {
    result = await callByok(req, messages, fallbackTitle);
  } else {
    const keys = collectKeys(body, env);
    const skip = normalizeSkip(body.skip);
    const prefer = String(body.prefer || "auto").slice(0, 30);
    const model = String(req.model || "").slice(0, 80);
    const models = model && prefer !== "auto" ? { [prefer]: model } : {};
    const attempts = buildAttempts({ keys, skip, prefer, models, env, includeWorkersAi: true });
    attemptProviders = attempts.reduce((list, item) => (list.includes(item.provider) ? list : list.concat(item.provider)), []);
    if (!attempts.length) {
      return json({
        ok: false,
        mode: req.mode,
        stage: req.stage,
        code: "ai_unavailable",
        message: "사용할 수 있는 무료 AI가 없습니다(Workers AI 미연결·키 없음). 이 턴은 로컬 엔진으로 만듭니다.",
        provider: "workers-ai",
        ms: Date.now() - started,
        tried: [],
        exhausted: [],
        warnings: [],
      }, 200);
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
    let message = result.message || "AI 응답을 만들지 못했습니다.";
    const exhausted = result.exhausted || [];
    if (exhausted.length && joined) {
      message = "무료 AI 할당량이 소진되었습니다 — " + joined + ". 00:00 UTC(한국 09:00)에 리셋되며, 이 턴은 로컬 엔진으로 만듭니다.";
      if (attemptProviders.length <= 1) {
        message += " 지금은 Workers AI만 등록되어 있습니다 — Groq·Gemini·OpenRouter 등 무료 키를 넣으면 자동으로 이어서 시도합니다.";
      }
    } else if (/4006|free allocation|neurons|quota/i.test(joined)) {
      message = "Workers AI 무료 일일 할당량(10,000 neurons)이 소진되어, 남은 무료 AI를 모두 시도했지만 이 턴은 만들지 못했습니다. 00:00 UTC(한국 09:00)에 리셋됩니다.";
      if (attemptProviders.length <= 1) message += " 다른 무료 AI 키(Groq·Gemini 등)를 넣으면 소진 직후 자동으로 이어받습니다.";
    } else if (/deprecated|5028|model_gone/i.test(joined)) {
      message = "이 모델은 제공이 종료되었습니다. 다음 모델로 다시 시도해 주세요.";
    } else if (/JSON|형식 불일치/i.test(joined) && !result.message) {
      message = "AI가 정한 형식으로 답하지 않아 이 턴은 로컬 엔진으로 만들었습니다.";
    } else if (result.code === "bad_output" && joined) {
      message = "AI 응답을 해석하지 못했습니다 — " + joined.slice(0, 120);
    }
    return json({
      ok: false,
      mode: req.mode,
      stage: req.stage,
      code: result.code || "ai_unavailable",
      message,
      provider: result.provider || (req.byok ? "byok-" + req.byok.provider : "workers-ai"),
      ms,
      tried,
      exhausted: exhausted,
      warnings: result.warnings || [],
    }, 200);
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
    byok: Boolean(req.byok),
  };
  payload[req.mode === "report" ? "report" : "turn"] = result.data;
  return json(payload, 200);
}
