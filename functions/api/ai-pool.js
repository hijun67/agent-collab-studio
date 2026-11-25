/* /api/ai-pool — 무료 AI 풀 현황 · 연결 테스트
 *
 *  GET  → 풀 전체(프로바이더·무료 범위·모델·서버 사용 가능 여부) — 키 값은 내려보내지 않는다.
 *  POST {provider, key?, model?} → 그 프로바이더에 아주 작은 요청을 보내 실제 연결을 확인한다.
 *     - 응답 { ok, provider, model, ms, kind, message }
 *     - kind: "ok" | "quota" | "auth" | "model_gone" | "error"
 */
import {
  AI_POOL,
  buildAttempts,
  callProvider,
  classifyFailure,
  collectKeys,
  providerById,
  publicPool,
} from "./_aiPool.js";

const MAX_BODY = 8 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const pool = publicPool(env);
    return json({
      ok: true,
      endpoint: "ai-pool",
      workersAi: Boolean(env && env.AI && typeof env.AI.run === "function"),
      pool,
      keyless: pool.filter((p) => p.keyless).length,
      byok: pool.filter((p) => !p.keyless).map((p) => p.id),
      order: AI_POOL.map((p) => p.id).concat(["ollama", "local"]),
      quotaScopes: AI_POOL.reduce((acc, p) => { acc[p.id] = p.quotaScope; return acc; }, {}),
      local: [
        { id: "ollama", label: "로컬 Ollama", url: "http://localhost:11434", note: "브라우저가 직접 호출" },
        { id: "local", label: "로컬 결정론적 엔진", note: "최후 폴백" },
      ],
    });
  }

  if (method !== "POST") return json({ ok: false, code: "method_not_allowed", message: "GET 또는 POST 로 호출해 주세요." }, 405);

  let raw;
  try { raw = await request.text(); } catch (error) {
    return json({ ok: false, code: "bad_body", message: "요청 본문을 읽지 못했습니다." }, 400);
  }
  if (raw.length > MAX_BODY) return json({ ok: false, code: "too_large", message: "요청이 너무 큽니다." }, 413);
  let body;
  try { body = JSON.parse(raw || "{}"); } catch (error) {
    return json({ ok: false, code: "bad_json", message: "요청 JSON 을 해석하지 못했습니다." }, 400);
  }

  const id = String(body.provider || "").toLowerCase();
  const provider = providerById(id);
  if (!provider || !AI_POOL.some((p) => p.id === id)) {
    return json({ ok: false, code: "unknown_provider", message: "풀에 없는 프로바이더입니다." }, 400);
  }

  const keys = collectKeys(body, env);
  const model = String(body.model || "").slice(0, 80);
  const attempts = buildAttempts({
    keys,
    skip: [],
    prefer: id,
    models: model ? { [id]: model } : {},
    env,
    includeWorkersAi: true,
  }).filter((attempt) => attempt.provider === id);
  if (!attempts.length) {
    const needsKey = !provider.keyless;
    return json({
      ok: false,
      provider: id,
      kind: needsKey ? "auth" : "error",
      message: needsKey ? provider.label + " 키가 없습니다. 이 브라우저에 키를 저장하거나 서버 환경변수 " + (provider.envKey || "") + " 를 설정하세요." : provider.label + " 를 이 서버에서 쓸 수 없습니다.",
    }, 200);
  }

  const started = Date.now();
  const result = await callProvider({
    attempt: attempts[0],
    messages: [
      { role: "system", content: "연결 확인용입니다. 설명 없이 JSON 하나만 출력하세요." },
      { role: "user", content: '{"ok":true} 형식으로만 답하세요.' },
    ],
    maxTokens: 32,
    temperature: 0,
    timeoutMs: 12000,
    fetchImpl: typeof fetch === "function" ? fetch : null,
    env,
  });
  const ms = Date.now() - started;

  if (result.ok) {
    return json({ ok: true, provider: id, label: provider.label, model: attempts[0].model, kind: "ok", ms, message: provider.label + " 연결됨 (" + attempts[0].model + ")" });
  }
  const kind = result.kind || classifyFailure(result.status, result.reason);
  return json({
    ok: false,
    provider: id,
    label: provider.label,
    model: attempts[0].model,
    kind,
    status: result.status || 0,
    ms,
    message: provider.label + " — " + (kind === "quota" ? "오늘 무료 할당량이 소진되었습니다." : kind === "auth" ? "키가 올바르지 않거나 권한이 없습니다." : kind === "model_gone" ? "모델을 사용할 수 없습니다." : "연결하지 못했습니다.") + (result.reason ? " (" + result.reason.slice(0, 120) + ")" : ""),
  });
}
