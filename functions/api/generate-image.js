/* /api/generate-image — 4컷 배경 이미지 생성
 *
 *  POST {prompt, width, height, seed, provider, apiKey, model}
 *    provider "free"   : Pollinations (키 없이 무료) — 실패하면 화면이 Canvas 아트로 폴백
 *    provider "openai" : BYOK (브라우저에만 저장된 본인 키를 이 요청에만 실어 보냄)
 *    provider "gemini" : BYOK (Google AI Studio 키)
 *
 *  free 경로는 Workers AI 바인딩(AI) → Pollinations 순서로 시도한다.
 *  응답 {ok:true, dataUrl, provider, prompt, ms} 또는 {ok:false, mode:"fallback", reason}
 *  이미지는 항상 base64 data URL 로 돌려주어 캔버스 저장(tainted canvas) 문제를 없앤다.
 *  프롬프트에 섞여 들어온 한글·이모지는 sanitizePrompt 가 영문만 남기고 걷어낸다.
 */
import { sanitizePrompt } from "./_prompt.js";

const TIMEOUT_FREE = 28000;
const TIMEOUT_BYOK = 45000;
const MAX_PROMPT = 1200;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function bytesToDataUrl(buffer, mime = "image/jpeg") {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  return `data:${mime};base64,${base64}`;
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

async function generateFree(prompt, width, height, seed) {
  const url =
    "https://image.pollinations.ai/prompt/" +
    encodeURIComponent(prompt) +
    `?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux&enhance=false`;
  const response = await withTimeout(fetch(url, { headers: { accept: "image/*" } }), TIMEOUT_FREE);
  if (!response.ok) throw new Error(`pollinations ${response.status}`);
  const type = response.headers.get("content-type") || "image/jpeg";
  if (!/^image\//i.test(type)) throw new Error("not an image");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 2000) throw new Error("image too small");
  return bytesToDataUrl(buffer, /png/i.test(type) ? "image/png" : "image/jpeg");
}

async function generateOpenAI(prompt, size, apiKey, model) {
  const response = await withTimeout(
    fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: model || "gpt-image-1",
        prompt,
        size,
        n: 1,
      }),
    }),
    TIMEOUT_BYOK
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data.error && data.error.message) || "OpenAI " + response.status);
  }
  const item = data.data && data.data[0];
  if (!item) throw new Error("empty response");
  if (item.b64_json) return "data:image/png;base64," + item.b64_json;
  if (item.url) {
    const image = await fetch(item.url);
    if (!image.ok) throw new Error("image download failed");
    return bytesToDataUrl(await image.arrayBuffer(), "image/png");
  }
  throw new Error("no image in response");
}

async function generateGemini(prompt, apiKey, model) {
  const name = model || "gemini-2.5-flash-image";
  const response = await withTimeout(
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    }),
    TIMEOUT_BYOK
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data.error && data.error.message) || "Gemini " + response.status);
  }
  const parts =
    (data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts) ||
    [];
  const image = parts.find((part) => part.inlineData || part.inline_data);
  const inline = image && (image.inlineData || image.inline_data);
  if (!inline || !inline.data) throw new Error("no image in response");
  const mime = inline.mimeType || inline.mime_type || "image/png";
  return `data:${mime};base64,${inline.data}`;
}

async function generateWorkersAi(env, prompt) {
  const output = await withTimeout(
    env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt: prompt.slice(0, 2000),
      steps: 4,
    }),
    TIMEOUT_BYOK
  );
  const base64 = output && (output.image || (output.result && output.result.image));
  if (!base64) throw new Error("no image in response");
  return "data:image/jpeg;base64," + base64;
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
  const rawPrompt = String((payload && payload.prompt) || "").trim().slice(0, MAX_PROMPT);
  if (rawPrompt.length < 6) {
    return json({ ok: false, code: "empty_prompt", message: "이미지 프롬프트가 비어 있습니다." }, 400);
  }
  const prompt = sanitizePrompt(rawPrompt);
  const width = clamp(payload.width, 256, 1280, 1024);
  const height = clamp(payload.height, 256, 1280, 1024);
  const seed = clamp(payload.seed, 1, 999999, Math.floor(Math.random() * 999999) + 1);
  const provider = String(payload.provider || "free").toLowerCase();
  const apiKey = String(payload.apiKey || "").trim();
  const started = Date.now();

  try {
    if (provider === "openai" || provider === "gemini") {
      if (!apiKey) {
        return json({
          ok: false,
          mode: "fallback",
          reason: "BYOK 키가 없습니다. 설정에서 본인 API 키를 먼저 저장해 주세요.",
        });
      }
      const size = width === height ? "1024x1024" : width > height ? "1536x1024" : "1024x1536";
      const dataUrl =
        provider === "openai"
          ? await generateOpenAI(prompt, size, apiKey, payload.model)
          : await generateGemini(prompt, apiKey, payload.model);
      return json({ ok: true, dataUrl, provider, prompt, ms: Date.now() - started });
    }

    let workersAiError = "";
    if (env && env.AI && typeof env.AI.run === "function") {
      try {
        const dataUrl = await generateWorkersAi(env, prompt);
        return json({ ok: true, dataUrl, provider: "workers-ai", prompt, ms: Date.now() - started });
      } catch (error) {
        workersAiError = String((error && error.message) || error);
      }
    }
    try {
      const dataUrl = await generateFree(prompt, width, height, seed);
      return json({ ok: true, dataUrl, provider: "free", prompt, ms: Date.now() - started });
    } catch (error) {
      throw new Error((error && error.message) || workersAiError || "free image failed");
    }
  } catch (error) {
    const reason =
      error && /timeout/i.test(String(error.message))
        ? "이미지 생성 응답이 제한 시간 안에 오지 않았습니다."
        : "무료 이미지 생성에 실패했습니다. (" + ((error && error.message) || "unknown") + ")";
    return json({ ok: false, mode: "fallback", provider, reason });
  }
}
