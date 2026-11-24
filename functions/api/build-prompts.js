/* /api/build-prompts — 기사 본문 → 컷/카드별 영문 이미지 프롬프트
 *
 *  POST {article:{title,subtitle,body}, cuts:[{index,narration,roleLabel}], cards:[{no,kind,kindLabel,title,lines}], style}
 *    → {ok:true, provider:"workers-ai"|"fallback", model, cutPrompts:[...], cardPrompts:[...], prompt}
 *
 *  - Workers AI 텍스트 모델(env.AI)로 한국어 기사 문맥을 영문 장면 묘사로 옮긴다.
 *  - 모델이 없거나 실패하면 _prompt.js 의 시각 사전으로 만든 영문 폴백을 그대로 쓴다.
 *  - 결과는 KV(ARCHIVE)에 7일 캐시해 같은 기사·스타일에서 AI 호출을 반복하지 않는다.
 *  - 어떤 경우에도 프롬프트에 한글이 남지 않는다(sanitizePrompt).
 */
import { hashString } from "./_lib.js";
import {
  buildPrompts,
  hasHangul,
  looksTextual,
  modelOutputText,
  parsePromptArray,
  promptContext,
  promptMessages,
  sanitizePrompt,
  TEXT_MODELS,
} from "./_prompt.js";

const MODEL_TIMEOUT = 22000;
const CACHE_PREFIX = "p2:"; /* 규칙이 바뀌면 접두사를 올려 예전 프롬프트 캐시를 무효화한다 */
const CACHE_TTL = 60 * 60 * 24 * 7;
const MAX_ITEMS = 24;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(article, style) {
  const seed = [article.title, String(article.body || "").slice(0, 300), style].join("|");
  return CACHE_PREFIX + hashString(seed);
}

function cleanList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => (item && typeof item === "object" ? item : {}));
}

async function askModel(env, messages) {
  if (!env || !env.AI || typeof env.AI.run !== "function") return null;
  const errors = [];
  for (const model of TEXT_MODELS) {
    try {
      const output = await withTimeout(
        env.AI.run(model, {
          messages: [
            { role: "system", content: messages.system },
            { role: "user", content: messages.user },
          ],
          max_tokens: 1600,
          temperature: 0.5,
        }),
        MODEL_TIMEOUT
      );
      const text = modelOutputText(output);
      if (text && text.trim()) return { model, text };
      errors.push(model + ": empty");
    } catch (error) {
      errors.push(model + ": " + String((error && error.message) || error).slice(0, 120));
    }
  }
  return { model: "", text: "", errors };
}

/* 장면과 무관한 후보를 걸러 내기 위한 비교용 단어 집합.
 * 문체·화풍 지시어는 모든 프롬프트에 공통이라 비교에서 뺀다. */
const STYLE_WORDS = new Set([
  "shot", "photo", "photograph", "photorealistic", "editorial", "news", "cinematic", "lens",
  "natural", "light", "lighting", "depth", "field", "shallow", "detailed", "ultra", "muted",
  "color", "grade", "text", "letters", "words", "watermark", "logo", "caption", "signage",
  "wide", "medium", "close", "composition", "scene", "focus", "background", "foreground",
  "angle", "lighting", "image", "style", "look", "feel", "tone", "mood", "high", "quality",
  "resolution", "aspect", "ratio", "vertical", "horizontal", "centered", "subject", "clean",
  "generous", "open", "space", "top", "uncluttered", "contrast", "contrasting", "warm", "cool",
  "bright", "dark", "soft", "dramatic", "clean", "organised", "organized", "reflective"
]);

function sceneTokens(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/)
      .filter((word) => word.length >= 4 && !STYLE_WORDS.has(word))
  );
}

/** 후보 프롬프트가 나머지 후보들과 장면 소재를 하나라도 공유하는지.
 *  한 컷만 엉뚱한 장면(예: 테니스 기사에 투표소)으로 튀는 것을 막는다. */
function offTopic(index, candidate, candidates) {
  if (candidates.length < 3) return false;
  const mine = sceneTokens(candidate);
  if (!mine.size) return true;
  const others = new Set();
  candidates.forEach((item, i) => {
    if (i === index) return;
    sceneTokens(item).forEach((word) => others.add(word));
  });
  if (!others.size) return false;
  let shared = 0;
  mine.forEach((word) => {
    if (!others.has(word)) return;
    if (/^[가-힣]+$/.test(word)) shared += 1;
    else if (word.length >= 5) shared += 1;
  });
  return shared === 0;
}

function mergePrompts(candidates, fallbacks) {
  const out = [];
  let rejected = 0;
  for (let i = 0; i < fallbacks.length; i += 1) {
    const candidate = candidates[i] || "";
    const words = candidate.trim().split(/\s+/).filter(Boolean).length;
    let usable = !hasHangul(candidate) && words >= 6 && !looksTextual(candidate);
    /* 기사와 무관한 장면(다른 사건을 그린 프롬프트)은 기사 기준 장면으로 되돌린다. */
    if (usable && offTopic(i, candidate, candidates)) usable = false;
    if (!usable && candidate) rejected += 1;
    out.push(sanitizePrompt(usable ? candidate : "", fallbacks[i]));
  }
  return { prompts: out, rejected };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method.toUpperCase() !== "POST") {
    return json({ ok: false, code: "method_not_allowed", message: "POST 로 호출해 주세요." }, 405);
  }
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ ok: false, code: "bad_json", message: "요청 본문을 읽지 못했습니다." }, 400);
  }
  const article = (payload && payload.article) || {};
  if (!article.title && !article.body) {
    return json({ ok: false, code: "empty_article", message: "기사 제목이나 본문이 필요합니다." }, 400);
  }
  const styleId = String((payload && payload.style) || "photo").toLowerCase();
  const cuts = cleanList(payload && payload.cuts, 8).slice(0, 4);
  const cards = cleanList(payload && payload.cards, MAX_ITEMS);
  if (!cuts.length && !cards.length) {
    return json({ ok: false, code: "empty_items", message: "프롬프트를 만들 컷이나 카드가 없습니다." }, 400);
  }

  const fallback = buildPrompts({ article, cuts, cards, styleId });
  const key = cacheKey(article, styleId);
  const store = env && env.ARCHIVE && typeof env.ARCHIVE.get === "function" ? env.ARCHIVE : null;
  const count = fallback.cutPrompts.length + fallback.cardPrompts.length;

  if (store) {
    try {
      const cached = await store.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        if (data && data.cutPrompts && data.cardPrompts) {
          return json({
            ok: true,
            provider: data.provider || "workers-ai",
            model: data.model || "",
            cached: true,
            count,
            cutPrompts: data.cutPrompts,
            cardPrompts: data.cardPrompts,
          });
        }
      }
    } catch (e) {
      /* 캐시는 편의 기능 */
    }
  }

  const promptItems = promptContext({ article, cuts, cards, styleId });
  const messages = promptMessages(promptItems);
  const asked = await askModel(env, messages);
  let cutPrompts = fallback.cutPrompts;
  let cardPrompts = fallback.cardPrompts;
  let provider = "fallback";
  let model = "";
  let warnings = [];

  if (asked && asked.text) {
    const expected = count;
    const parsed = parsePromptArray(asked.text, expected);
    if (parsed.length >= Math.max(2, Math.ceil(expected * 0.5))) {
      const cutResult = mergePrompts(parsed.slice(0, fallback.cutPrompts.length), fallback.cutPrompts);
      const cardResult = mergePrompts(parsed.slice(fallback.cutPrompts.length), fallback.cardPrompts);
      cutPrompts = cutResult.prompts;
      cardPrompts = cardResult.prompts;
      const rejected = cutResult.rejected + cardResult.rejected;
      provider = "workers-ai";
      model = asked.model;
      if (rejected) warnings.push(`글자를 그리라는 장면 ${rejected}개는 기사 기준 장면으로 바꿨습니다.`);
    } else {
      warnings.push("텍스트 모델 응답을 해석하지 못해 기본 장면 프롬프트를 사용했습니다.");
    }
  } else if (asked && asked.errors && asked.errors.length) {
    warnings.push("텍스트 모델을 쓰지 못했습니다: " + asked.errors.slice(0, 2).join(" / "));
  }

  const result = {
    ok: true,
    provider,
    model,
    cached: false,
    count,
    cutPrompts,
    cardPrompts,
    warnings,
    tried: asked && asked.errors ? asked.errors : [],
  };
  if (store && provider === "workers-ai") {
    try {
      await store.put(key, JSON.stringify({ provider, model, cutPrompts, cardPrompts }), { expirationTtl: CACHE_TTL });
    } catch (e) {
      /* 저장 실패는 무시 */
    }
  }
  return json(result);
}
