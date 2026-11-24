/* /api/collab — 🤖 에이전트 협업 탭의 실제 AI 응답
 *
 *  POST {
 *    mode: "turn" | "report",
 *    mission: {title, goal, context, audience, deadline, deliverable, keywords, constraints, kpis, checks, steps, risks, plan},
 *    stage: 1~10, stageName,
 *    agent: {id, name, role, sub, badge, limit, extra},
 *    team: [{name, role, badge}],
 *    history: [{agent, stage, text}],
 *    directives: ["..."], directive: "이번 턴에 반영할 사용자 지시",
 *    byok: {provider: "openai"|"gemini"|"openrouter", key, model}   // 선택
 *  }
 *  → {ok:true, mode, provider:"workers-ai"|"byok-openai"|..., model, ms, turn|report, warnings}
 *
 *  - 기본은 Workers AI(env.AI) 무료 텍스트 모델. 키 입력 없이 바로 동작한다.
 *  - 사용자가 자기 키(BYOK)를 넣으면 그 키로만 호출하고, 키는 저장하지 않는다.
 *  - 모델이 없거나·할당량이 없거나·형식이 깨지면 ok:false 를 돌려주고,
 *    브라우저는 기존 결정론적 로컬 엔진으로 폴백한다(앱이 멈추지 않는다).
 *  - GET 은 기능 확인용(모델 목록·Workers AI 유무).
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

const TURN_TIMEOUT = 15000;
const REPORT_TIMEOUT = 18000;
const TOTAL_BUDGET = 26000;
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

function modelOutputText(output) {
  if (!output) return "";
  if (typeof output === "string") return output;
  if (typeof output.response === "string") return output.response;
  if (output.result && typeof output.result.response === "string") return output.result.response;
  if (Array.isArray(output.choices) && output.choices[0]) {
    const choice = output.choices[0];
    return (choice.message && choice.message.content) || choice.text || "";
  }
  return "";
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

async function callWorkersAi(env, request, messages, fallbackTitle, deadline) {
  if (!env || !env.AI || typeof env.AI.run !== "function") {
    return { ok: false, provider: "workers-ai", code: "ai_unavailable", data: null, warnings: ["Workers AI 바인딩이 없습니다."], tried: [] };
  }
  const warnings = [];
  const tried = [];
  const models = request.model && COLLAB_MODELS.includes(request.model)
    ? [request.model, ...COLLAB_MODELS.filter((m) => m !== request.model)]
    : COLLAB_MODELS.slice();
  const maxTokens = request.mode === "report" ? 1600 : 950;
  const timeout = request.mode === "report" ? REPORT_TIMEOUT : TURN_TIMEOUT;

  for (const model of models.slice(0, 2)) {
    const remaining = deadline - Date.now();
    if (remaining < 3500) {
      warnings.push("남은 시간이 부족해 다음 모델은 시도하지 않았습니다.");
      break;
    }
    try {
      const output = await withTimeout(
        env.AI.run(model, {
          messages,
          max_tokens: maxTokens,
          temperature: 0.55,
        }),
        Math.min(timeout, remaining),
        model
      );
      const text = modelOutputText(output);
      if (!text || !text.trim()) {
        tried.push(model + ": 빈 응답");
        continue;
      }
      let data = finish(parseJsonObject(text), fallbackTitle, request.mode);
      if (!data) {
        /* 형식만 깨진 경우 같은 모델에 한 번 더 요청한다. */
        const left = deadline - Date.now();
        if (left > 4000) {
          const retry = await withTimeout(
            env.AI.run(model, {
              messages: repairMessages(messages, text),
              max_tokens: maxTokens,
              temperature: 0.2,
            }),
            Math.min(timeout, left),
            model + " repair"
          ).catch(() => null);
          const retryText = modelOutputText(retry);
          if (retryText) data = finish(parseJsonObject(retryText), fallbackTitle, request.mode);
        }
      }
      if (data) return { ok: true, provider: "workers-ai", model, data, warnings, tried };
      tried.push(model + ": JSON 형식 불일치");
    } catch (error) {
      tried.push(model + ": " + String((error && error.message) || error).slice(0, 100));
    }
  }
  return { ok: false, provider: "workers-ai", code: "bad_output", data: null, warnings, tried };
}

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
      workersAi: Boolean(env && env.AI && typeof env.AI.run === "function"),
      models: COLLAB_MODELS,
      byok: Object.keys(BYOK_PROVIDERS),
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
  const fallbackTitle = (req.mode === "report" ? "최종 결과물 리포트" : "");

  let result;
  if (req.byok) {
    result = await callByok(req, messages, fallbackTitle);
  } else {
    result = await callWorkersAi(env, req, messages, fallbackTitle, started + TOTAL_BUDGET);
  }
  const ms = Date.now() - started;

  if (!result.ok || !result.data) {
    return json({
      ok: false,
      mode: req.mode,
      stage: req.stage,
      code: result.code || "ai_unavailable",
      message: result.message || "AI 응답을 만들지 못했습니다.",
      provider: result.provider || "none",
      ms,
      tried: result.tried || [],
      warnings: result.warnings || [],
    }, 200);
  }

  const payload = {
    ok: true,
    mode: req.mode,
    stage: req.stage,
    stageName: req.stageName,
    provider: result.provider,
    model: result.model,
    ms,
    warnings: result.warnings || [],
    tried: result.tried || [],
    byok: Boolean(req.byok),
  };
  payload[req.mode === "report" ? "report" : "turn"] = result.data;
  return json(payload, 200);
}
