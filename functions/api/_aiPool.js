/* Agent Collab Studio | 무료 AI 풀 · 자동 로테이션 엔진
 *
 *  요구: 무료 AI 를 최대한 많이 모아 두고, 한 프로바이더/모델의 당일 할당량이 소진되면
 *        그 턴을 중단하지 않고 다음 무료 AI 가 역할을 이어받는다.
 *
 *  - 이 파일은 순수 함수 + fetch 만 씁니다(Cloudflare Functions · Node 테스트 공용).
 *  - 키는 요청 본문으로만 받고 저장하지 않습니다. 서버 환경변수(GROQ_API_KEY 등)가 있으면
 *    사용자가 키를 넣지 않아도 그 프로바이더를 씁니다.
 *  - 두 종류의 실패를 구분한다(v2.5.0).
 *      quota       — 하루 무료 한도 소진(Workers AI 4006/5016, free allocation, daily limit,
 *                    insufficient_quota 등). 결과의 exhausted 에 담아 브라우저가 오늘 하루 건너뛴다.
 *      rate_limited— 분당 요청 제한(429 Too Many Requests). 하루 소진이 아니므로 오늘 건너뛰지 않고
 *                    짧은 쿨다운(Retry-After 또는 1~4초) 뒤 같은 모델을 한 번 더 시도한다.
 *  - 과제별 예산 분리(profile): 협업(collab)은 Workers AI 의 경량 모델을 쓰고 사용자 무료 키를 먼저
 *    순환해 하루 neurons 를 아낀다. 빌드(build)는 Workers AI 의 큰 모델부터 쓴다. 그래서 10턴 협업이
 *    하루 한도를 다 써서 🛠️ 빌드가 결과물을 못 만드는 일이 줄어든다.
 *  - 유료(paid) 프로바이더는 자동 순환에서 제외한다 — 사용자가 직접 고르고 자기 키를 넣은 경우만.
 *  - 시도 시간은 프로바이더별로 나눠 가진다(allocateTimeout) — 앞쪽 AI가 느려도 뒤쪽 무료 AI까지 간다.
 */

/** 우선순위 순서대로 시도하는 무료/저비용 AI 풀. */
export const AI_POOL = [
  {
    id: "workers-ai",
    label: "Cloudflare Workers AI",
    short: "Workers AI",
    kind: "workers-ai",
    free: "무료 10,000 neurons/일",
    quotaScope: "provider",
    keyless: true,
    note: "서버 바인딩 — 키 없이 바로 동작",
    help: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
    models: [
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/qwen/qwen3.8-27b",
      "@cf/google/gemma-4-26b-a4b-it",
      "@cf/meta/llama-3.1-8b-instruct-fast",
    ],
    /* 협업 턴은 경량 모델만 — 같은 10,000 neurons 로 더 많은 턴을 만들고 빌드 몫을 남긴다. */
    collabModels: [
      "@cf/meta/llama-3.1-8b-instruct-fast",
      "@cf/google/gemma-4-26b-a4b-it",
      "@cf/qwen/qwen3.8-27b",
    ],
  },
  {
    id: "groq",
    label: "Groq",
    short: "Groq",
    kind: "openai",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    free: "무료 1,000 req/일",
    quotaScope: "model",
    envKey: "GROQ_API_KEY",
    keyHint: "gsk_…",
    help: "https://console.groq.com/keys",
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    short: "Gemini",
    kind: "gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/models/",
    free: "무료 티어 (분당·일일 한도)",
    quotaScope: "model",
    envKey: "GEMINI_API_KEY",
    keyHint: "AIza…",
    help: "https://aistudio.google.com/app/apikey",
    models: ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"],
  },
  {
    id: "openrouter",
    label: "OpenRouter :free",
    short: "OpenRouter",
    kind: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    free: "무료 :free 모델 50 req/일",
    quotaScope: "model",
    envKey: "OPENROUTER_API_KEY",
    keyHint: "sk-or-…",
    help: "https://openrouter.ai/keys",
    models: [
      "google/gemma-4-26b-a4b-it:free",
      "baidu/ernie-5.5-flash-preview:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    ],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    short: "Cerebras",
    kind: "openai",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    free: "무료 1M tokens/일",
    quotaScope: "model",
    envKey: "CEREBRAS_API_KEY",
    keyHint: "csk-…",
    help: "https://cloud.cerebras.ai/",
    models: ["llama-3.3-70b", "qwen-3-32b"],
  },
  {
    id: "mistral",
    label: "Mistral",
    short: "Mistral",
    kind: "openai",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    free: "무료 실험(Experiment) 티어",
    quotaScope: "model",
    envKey: "MISTRAL_API_KEY",
    keyHint: "…",
    help: "https://console.mistral.ai/api-keys/",
    models: ["mistral-small-latest", "open-mistral-nemo"],
  },
  {
    id: "openai",
    label: "OpenAI",
    short: "OpenAI",
    kind: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    free: "유료(BYOK)",
    quotaScope: "model",
    envKey: "OPENAI_API_KEY",
    keyHint: "sk-…",
    paid: true,
    help: "https://platform.openai.com/api-keys",
    models: ["gpt-4o-mini", "gpt-4.1-mini"],
  },
];

/** 브라우저에서 직접 호출하는 로컬 AI (서버를 거치지 않음). */
export const LOCAL_PROVIDERS = [
  {
    id: "ollama",
    label: "로컬 Ollama",
    short: "Ollama",
    free: "내 컴퓨터에서 무료 · 무제한",
    quotaScope: "provider",
    keyless: true,
    defaultUrl: "http://localhost:11434",
    note: "브라우저가 localhost:11434 로 직접 호출 — https 페이지에서는 브라우저가 막을 수 있음",
    models: ["llama3.2", "qwen2.5", "gemma3"],
  },
  /* v2.5.0 — '로컬 결정론적 엔진'(하드코딩 템플릿 협업·앱 생성기)은 폐기했다.
     결과물은 실제 AI 응답으로만 만들고, 모두 실패하면 명시적 오류와 안내를 돌려준다. */
];

export const BYOK_IDS = AI_POOL.filter((p) => !p.keyless).map((p) => p.id);

export function providerById(id) {
  return AI_POOL.find((p) => p.id === id) || LOCAL_PROVIDERS.find((p) => p.id === id) || null;
}

export function providerLabel(id) {
  const p = providerById(id);
  return p ? p.short || p.label : String(id || "");
}

/** UI·GET 응답용 공개 메타(키 값은 절대 담지 않는다). */
export function publicPool(env) {
  return AI_POOL.map((p) => ({
    id: p.id,
    label: p.label,
    short: p.short,
    kind: p.kind,
    free: p.free,
    quotaScope: p.quotaScope,
    keyless: Boolean(p.keyless),
    paid: Boolean(p.paid),
    note: p.note || "",
    help: p.help || "",
    keyHint: p.keyHint || "",
    available: p.keyless ? Boolean(env && env.AI) : Boolean(serverKey(p, env)),
    serverKey: p.keyless ? false : Boolean(serverKey(p, env)),
    models: p.models.slice(),
  }));
}

function serverKey(provider, env) {
  if (!provider || !provider.envKey || !env) return "";
  const value = env[provider.envKey];
  return typeof value === "string" ? value.trim() : "";
}

/** 본문의 keys/byok · 서버 환경변수에서 프로바이더별 키를 모은다. */
export function collectKeys(input, env) {
  const body = input && typeof input === "object" ? input : {};
  const raw = body.keys && typeof body.keys === "object" ? body.keys : {};
  const out = {};
  for (const p of AI_POOL) {
    if (p.keyless) continue;
    const user = typeof raw[p.id] === "string" ? raw[p.id].trim() : "";
    if (user) out[p.id] = { key: user.slice(0, 400), source: "user" };
    else {
      const envKey = serverKey(p, env);
      if (envKey) out[p.id] = { key: envKey.slice(0, 400), source: "server" };
    }
  }
  /* 예전 단일 BYOK 형식도 그대로 받는다. */
  const legacy = body.byok && typeof body.byok === "object" && body.byok.key ? body.byok : null;
  if (legacy) {
    const id = String(legacy.provider || "").toLowerCase();
    if (providerById(id) && !out[id]) out[id] = { key: String(legacy.key).slice(0, 400), source: "user" };
  }
  return out;
}

/** "provider" 또는 "provider:model" 형태의 건너뛸 목록을 정리한다. */
export function normalizeSkip(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String(item || "").trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 40);
}

export function isSkipped(providerId, model, skip) {
  if (!skip || !skip.length) return false;
  return skip.some((entry) => entry === providerId || entry === providerId + ":" + model);
}

/**
 * 시도 순서를 만든다.
 *  - profile: "collab"(10턴 협업) | "build"(🛠️ 빌드 프로젝트 생성).
 *      build  — Workers AI(큰 모델) → 나머지 무료 프로바이더(풀 순서).
 *      collab — 사용자 무료 키(다른 프로바이더) 먼저 → Workers AI 는 경량 collabModels 로 마지막.
 *               그래서 협업이 하루 Workers AI neurons 를 다 쓰지 않고 빌드 몫을 남긴다.
 *  - 사용자가 고정한 엔진(prefer)은 두 profile 모두 맨 앞이다(고정 모델이 있으면 그 모델만).
 *  - 모델은 **라운드 로빈**으로 섞는다: 각 프로바이더의 1번 모델을 먼저 모두 시도하고,
 *    그다음 2번 모델… 그래서 Workers AI 가 4006/quota 로 막혀도 Groq·Gemini·OpenRouter·
 *    Cerebras·Mistral 의 첫 모델까지 예산 안에서 반드시 도달한다.
 *  - `paid: true` 프로바이더(OpenAI)는 자동 순환에서 **완전히 제외**한다. 사용자가
 *    prefer 로 그 프로바이더를 직접 고르고 자기 키를 넣은 경우에만 시도한다.
 *  - 키가 없는 프로바이더는 건너뛴다(Workers AI 는 바인딩이 있어야 한다).
 */
export function buildAttempts({ keys, skip, prefer, models, env, includeWorkersAi, profile, maxModelsPerProvider }) {
  const pool = new Map(keys && typeof keys === "object" ? Object.entries(keys) : []);
  const chosen = models && typeof models === "object" ? models : {};
  const preferId = String(prefer || "").toLowerCase();
  const preferDef = preferId && preferId !== "auto" ? providerById(preferId) : null;
  const mode = profile === "collab" ? "collab" : "build";

  const perProviderLimit = Math.max(0, Number(maxModelsPerProvider) || 0);
  const modelList = (provider, forcedModel) => {
    const only = forcedModel || chosen[provider.id];
    let list = only ? [only] : (mode === "collab" && Array.isArray(provider.collabModels) && provider.collabModels.length ? provider.collabModels : provider.models);
    /* 모델을 1개로 제한하면 좋은 모델이 시간을 다 쓰지 않고 다른 프로바이더까지 도달한다(빌드 기본값). */
    if (perProviderLimit) list = list.slice(0, perProviderLimit);
    return list;
  };

  /** 자격(바인딩·키)이 있고 유료 제한을 통과해야 목록에 넣는다. */
  const eligible = (provider) => {
    if (!provider) return null;
    if (provider.kind === "workers-ai") {
      if (includeWorkersAi === false || !(env && env.AI)) return null;
      return { key: "", source: "server" };
    }
    const entry = pool.get(provider.id);
    if (!entry || !entry.key) return null;
    if (provider.paid) {
      /* 유료 프로바이더는 사용자가 직접 고르고 자기 키(source: "user")를 넣었을 때만. */
      const pickedByUser = preferDef && preferDef.id === provider.id && entry.source === "user";
      if (!pickedByUser) return null;
    }
    return entry;
  };

  const ordered = [];
  const seen = new Set();
  const add = (provider, forcedModel) => {
    if (!provider || seen.has(provider.id)) return;
    const entry = eligible(provider);
    if (!entry) return;
    if (skipProvider(provider, skip, null)) return;
    seen.add(provider.id);
    const list = modelList(provider, forcedModel).filter((model) => !isSkipped(provider.id, model, skip));
    if (!list.length) return;
    ordered.push({ provider, entry, models: list });
  };

  if (preferDef) add(preferDef, chosen[preferDef.id]);
  if (mode === "build") {
    add(providerById("workers-ai"));
    for (const provider of AI_POOL) add(provider);
  } else {
    /* 협업: 사용자 무료 키를 먼저 쓰고, Workers AI 는 경량 모델로 마지막에 — 빌드 몫을 남긴다. */
    for (const provider of AI_POOL) if (provider.id !== "workers-ai") add(provider);
    add(providerById("workers-ai"));
  }

  const rounds = ordered.reduce((max, item) => Math.max(max, item.models.length), 0);
  const attempts = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const item of ordered) {
      const model = item.models[round];
      if (!model) continue;
      attempts.push({ provider: item.provider.id, model, key: item.entry.key, source: item.entry.source });
    }
  }
  return attempts;
}

/**
 * 한 번의 시도에 쓸 시간(ms). 남은 무료 프로바이더가 있으면 그 몫을 남겨 두고,
 * 뒤쪽 프로바이더(OpenRouter·Cerebras·Mistral)까지 반드시 도달하게 한다.
 */
export function allocateTimeout(opts) {
  const remaining = Math.max(0, Number(opts && opts.remaining) || 0);
  const perAttemptMs = Math.max(1000, Number(opts && opts.perAttemptMs) || 15000);
  const providersLeft = Math.max(1, Number(opts && opts.providersLeft) || 1);
  const minAttemptMs = Math.max(1000, Number(opts && opts.minAttemptMs) || 4000);
  const reservePerProviderMs = Math.max(0, Number(opts && opts.reservePerProviderMs) || 2500);
  if (remaining <= 0) return 0;
  const cap = Math.min(perAttemptMs, remaining);
  const reserve = (providersLeft - 1) * reservePerProviderMs;
  if (remaining - reserve >= minAttemptMs) return Math.min(cap, remaining - reserve);
  /* 시간이 촉박하면 남은 프로바이더끼리 나눠 갖는다(최소 1.5초). */
  return Math.min(cap, Math.max(1500, Math.floor(remaining / providersLeft)));
}

function skipProvider(provider, skip, model) {
  if (!skip || !skip.length) return false;
  if (skip.includes(provider.id)) return true;
  if (model && skip.includes(provider.id + ":" + model)) return true;
  return false;
}

/** 실패 응답을 성격별로 나눈다.
 *  - quota        : 하루 무료 한도 소진 → 오늘 건너뛴다.
 *  - rate_limited : 분당 요청 제한(429) → 짧은 쿨다운 뒤 같은 모델을 한 번 더 시도한다.
 */
export function classifyFailure(status, text) {
  const body = String(text || "");
  if (/timeout|timed out|after \d+ms|aborted/i.test(body)) return "timeout";
  /* 분당 제한 문구가 분명하면 하루 소진 검사보다 먼저 rate_limited 로 본다. */
  if (/per minute|this minute|\brpm\b|\btpm\b|requests per minute|tokens per minute/i.test(body)) return "rate_limited";
  /* 하루 한도 소진 — 이때만 오늘 하루 건너뛴다. */
  if (/4006|5016|free allocation|neurons|daily limit|daily free|insufficient_quota|exceeded your current|resource_exhausted|quota exceeded|out of credits|per day|per-day|하루/i.test(body)) {
    return "quota";
  }
  /* 분당 제한 — 429 이거나 rate limit 문구. 하루 소진으로 취급하지 않는다. */
  if (status === 429 || /rate.?limit|too many requests|requests per minute|tokens per minute|\brpm\b|\btpm\b|retry.?after/i.test(body)) {
    return "rate_limited";
  }
  if (
    status === 401 ||
    status === 403 ||
    /invalid api key|api key not valid|api_key_invalid|incorrect api key|unauthorized|authentication|permission/i.test(body)
  ) {
    return "auth";
  }
  if (/deprecated|no such model|model not found|does not exist|decommission|5028/i.test(body)) return "model_gone";
  if (status >= 500) return "server";
  if (status === 404) return "model_gone";
  return "error";
}

/* 429 쿨다운 — 같은 isolate 안에서 잠깐 쉬는 시간(ms). 모델 단위로 기억한다. */
const COOLING = new Map();
const DEFAULT_COOLDOWN_MS = 1500;
const MAX_COOLDOWN_MS = 5000;

export function cooldownMs(attempt, retryAfterMs) {
  const value = Number(retryAfterMs);
  if (!attempt) return DEFAULT_COOLDOWN_MS;
  const pinned = COOLING.get(attempt.provider + ":" + attempt.model);
  const wait = Number.isFinite(value) && value > 0 ? value : DEFAULT_COOLDOWN_MS;
  return Math.min(MAX_COOLDOWN_MS, Math.max(DEFAULT_COOLDOWN_MS, pinned ? pinned : wait));
}

export function markCooling(attempt, ms) {
  if (!attempt) return;
  const until = Date.now() + Math.min(MAX_COOLDOWN_MS, Math.max(DEFAULT_COOLDOWN_MS, Number(ms) || DEFAULT_COOLDOWN_MS));
  COOLING.set(attempt.provider + ":" + attempt.model, until);
}

/** 지금 429 쿨다운 중인 프로바이더:모델 목록 (같은 턴·다음 턴에서 건너뛰는 데 쓴다). */
export function coolingKeys() {
  const now = Date.now();
  const out = [];
  for (const [key, until] of COOLING.entries()) {
    if (until > now) out.push(key);
    else COOLING.delete(key);
  }
  return out;
}

export function resetCooling() {
  COOLING.clear();
}

export function exhaustionKey(providerId, model) {
  const provider = providerById(providerId);
  if (provider && provider.quotaScope === "model") return providerId + ":" + model;
  return providerId;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error((label || "timeout") + " after " + ms + "ms")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Retry-After 헤더(초 또는 날짜) → ms. 없으면 0. */
export function parseRetryAfter(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return 0;
  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(text);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return 0;
}

function extractText(data) {  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data.response === "string") return data.response;
  if (data.result && typeof data.result.response === "string") return data.result.response;
  if (Array.isArray(data.choices) && data.choices[0]) {
    const choice = data.choices[0];
    if (choice.message && typeof choice.message.content === "string") return choice.message.content;
    if (typeof choice.text === "string") return choice.text;
  }
  if (Array.isArray(data.candidates) && data.candidates[0]) {
    const parts = (data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.map((part) => part && part.text).filter(Boolean).join("");
  }
  return "";
}

/** 프로바이더 하나에 실제로 요청한다. 네트워크/HTTP 오류도 값으로 돌려준다(throw 하지 않음). */
export async function callProvider(opts) {
  const { attempt, messages, maxTokens = 950, temperature = 0.55, timeoutMs = 15000, fetchImpl, env } = opts;
  const provider = providerById(attempt.provider);
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!provider) return { ok: false, kind: "error", status: 0, reason: "알 수 없는 프로바이더" };
  try {
    if (provider.kind === "workers-ai") {
      if (!env || !env.AI || typeof env.AI.run !== "function") {
        return { ok: false, kind: "error", status: 0, reason: "Workers AI 바인딩 없음" };
      }
      const output = await withTimeout(
        env.AI.run(attempt.model, { messages, max_tokens: maxTokens, temperature }),
        timeoutMs,
        attempt.model
      );
      const text = extractText(output);
      if (!text.trim()) return { ok: false, kind: "error", status: 0, reason: "빈 응답" };
      return { ok: true, text, status: 200 };
    }

    if (!doFetch) return { ok: false, kind: "error", status: 0, reason: "fetch 없음" };
    const headers = { "content-type": "application/json" };
    let url;
    let body;
    if (provider.kind === "gemini") {
      url = provider.base + encodeURIComponent(attempt.model) + ":generateContent?key=" + encodeURIComponent(attempt.key);
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const user = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");
      body = {
        contents: [{ role: "user", parts: [{ text: (system ? system + "\n\n" : "") + user }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
        },
      };
    } else {
      url = provider.endpoint;
      headers.authorization = "Bearer " + attempt.key;
      if (provider.id === "openrouter") {
        headers["HTTP-Referer"] = "https://agent-collab-studio.pages.dev";
        headers["X-Title"] = "Agent Collab Studio";
      }
      body = { model: attempt.model, messages, temperature, max_tokens: maxTokens };
    }

    const response = await withTimeout(
      doFetch(url, { method: "POST", headers, body: JSON.stringify(body) }),
      timeoutMs,
      provider.id
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const retryAfter = parseRetryAfter(response.headers && typeof response.headers.get === "function" ? response.headers.get("retry-after") : null);
      return {
        ok: false,
        kind: classifyFailure(response.status, text),
        status: response.status,
        retryAfterMs: retryAfter,
        reason: (response.status + " " + text).slice(0, 200),
      };
    }
    const payload = await response.json().catch(() => null);
    const text = extractText(payload);
    if (!text.trim()) return { ok: false, kind: "error", status: 200, reason: "빈 응답" };
    return { ok: true, text, status: 200 };
  } catch (error) {
    const message = String((error && error.message) || error);
    const kind = /timeout|aborted/i.test(message) ? "timeout" : classifyFailure(0, message);
    return { ok: false, kind, status: 0, reason: message.slice(0, 200) };
  }
}

/** 현재 위치 이후에 아직 살아 있는 프로바이더 수(예산 배분용). */
function pendingProviders(attempts, index, dead) {
  const set = new Set();
  for (let i = index; i < attempts.length; i += 1) {
    if (dead.has(attempts[i].provider)) continue;
    set.add(attempts[i].provider);
  }
  return Math.max(1, set.size);
}

/**
 * 풀을 순서대로 돌린다. transform(text) 가 {ok:true,data} 를 돌려주면 성공,
 * 아니면 다음 프로바이더로 넘어간다. repair 가 있으면 형식이 깨진 응답만 같은 AI에 한 번 더 묻는다.
 */
export async function runPool(opts) {
  const {
    attempts,
    messages,
    transform,
    deadline = Date.now() + 25000,
    perAttemptMs = 14000,
    maxTokens = 950,
    temperature = 0.55,
    fetchImpl,
    env,
    repair,
    minAttemptMs = 4000,
    reservePerProviderMs = 2500,
  } = opts;
  const tried = [];
  const exhausted = [];
  const cooling = [];
  const warnings = [];
  const dead = new Set();
  let skippedQuota = 0;
  let lastBad = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    /* 같은 턴 안에서 프로바이더 전체가 소진됐으면 그 모델들은 다시 부르지 않는다
       (그 시간을 뒤쪽 무료 프로바이더에 넘긴다). */
    if (dead.has(attempt.provider)) { skippedQuota += 1; continue; }
    const remaining = deadline - Date.now();
    if (remaining < 1200) {
      warnings.push("남은 시간이 부족해 이후 AI는 시도하지 않았습니다.");
      break;
    }
    /* 아직 실패하지 않은 프로바이더 수 — 그 몫을 남기고 이번 시도의 시간을 정한다. */
    const providersLeft = pendingProviders(attempts, index, dead);
    const timeoutMs = allocateTimeout({ remaining, perAttemptMs, providersLeft, minAttemptMs, reservePerProviderMs });
    if (!timeoutMs) {
      warnings.push("남은 시간이 부족해 이후 AI는 시도하지 않았습니다.");
      break;
    }
    const started = Date.now();
    let result = await callProvider({
      attempt,
      messages,
      maxTokens,
      temperature,
      timeoutMs,
      fetchImpl,
      env,
    });
    /* 429(분당 제한)는 오늘 소진이 아니다 — 짧은 쿨다운 뒤 같은 모델을 한 번 더 부른다(daily quota 는 제외). */
    if (!result.ok && result.kind === "rate_limited") {
      const wait = cooldownMs(attempt, result.retryAfterMs);
      markCooling(attempt, wait);
      const key = attempt.provider + ":" + attempt.model;
      if (!cooling.includes(key)) cooling.push(key);
      const left = deadline - Date.now();
      if (left > wait + 2500) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        const retry = await callProvider({
          attempt,
          messages,
          maxTokens,
          temperature,
          timeoutMs: Math.min(perAttemptMs, Math.max(2000, deadline - Date.now())),
          fetchImpl,
          env,
        });
        if (retry.ok) result = retry;
        else {
          result = retry;
          warnings.push(providerLabel(attempt.provider) + " 분당 요청 제한(429) — " + Math.round(wait / 1000) + "초 쿨다운 뒤 다시 시도했지만 아직 막혀 있습니다.");
        }
      }
    }
    /* 5xx(용량 초과·일시 창애)는 잠깐씩 쉬며 다시 묻는다 — Gemini 무료 티어는 503(수요 급증)이 잦다.
       남은 프로바이더가 있으면 1번만, 마지막 살아 있는 프로바이더면 2번까지 시도한다. */
    const lastLive = pendingProviders(attempts, index, dead) === 1;
    const maxServerRetries = lastLive ? 2 : 1;
    for (let retried = 0; !result.ok && result.kind === "server" && retried < maxServerRetries; retried += 1) {
      const leftBefore = deadline - Date.now();
      if (leftBefore < 2600) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (retried + 1)));
      const left = deadline - Date.now();
      if (left < 1800) break;
      const retry = await callProvider({
        attempt,
        messages,
        maxTokens,
        temperature,
        timeoutMs: Math.min(perAttemptMs, left),
        fetchImpl,
        env,
      });
      if (retry.ok) result = retry;
    }
    const ms = Date.now() - started;

    if (!result.ok) {
      tried.push({ provider: attempt.provider, model: attempt.model, kind: result.kind, status: result.status || 0, ms, reason: result.reason || "" });
      if (result.kind === "quota") {
        const key = exhaustionKey(attempt.provider, attempt.model);
        if (!exhausted.includes(key)) exhausted.push(key);
        if (key === attempt.provider) dead.add(attempt.provider);
      } else if (result.kind === "auth") {
        /* 키가 틀렸으니 그 프로바이더의 다른 모델도 같은 결과다. */
        dead.add(attempt.provider);
      }
      continue;
    }

    let outcome = transform ? transform(result.text) : { ok: true, data: result.text };
    if (!outcome || !outcome.ok) {
      /* 형식만 깨졌다면 같은 모델에 한 번 더 요청한다. */
      if (repair && (!outcome || outcome.retry !== false)) {
        const left = deadline - Date.now();
        if (left > 3500) {
          const retry = await callProvider({
            attempt,
            messages: repair(messages, result.text),
            maxTokens,
            temperature: 0.2,
            timeoutMs: Math.min(perAttemptMs, left),
            fetchImpl,
            env,
          });
          if (retry.ok) {
            const again = transform(retry.text);
            if (again && again.ok) {
              return { ok: true, provider: attempt.provider, model: attempt.model, data: again.data, text: retry.text, ms: Date.now() - started, tried, exhausted, cooling, warnings, repaired: true, skippedQuota };
            }
          }
        }
      }
      lastBad = outcome && outcome.reason ? outcome.reason : "형식 불일치";
      tried.push({ provider: attempt.provider, model: attempt.model, kind: "bad_output", status: 200, ms, reason: lastBad });
      continue;
    }

    return { ok: true, provider: attempt.provider, model: attempt.model, data: outcome.data, text: result.text, ms, tried, exhausted, cooling, warnings, skippedQuota };
  }

  return { ok: false, tried, exhausted, cooling, warnings, reason: lastBad || "", skippedQuota };
}

/** 실패 목록을 사람이 읽는 한 줄로. */
export function describeTried(tried) {
  if (!Array.isArray(tried) || !tried.length) return "";
  return tried
    .slice(0, 6)
    .map((t) => providerLabel(t.provider) + " " + (t.model || "") + " → " + (t.kind || "error"))
    .join(" · ");
}

/** 풀 현황 문구(브라우저·문서 공용). */
export function summarizePool(attempts, keys) {
  const keyed = Object.keys(keys || {}).length;
  return {
    providers: AI_POOL.length,
    keyed,
    attempts: attempts.length,
    models: attempts.length,
  };
}
