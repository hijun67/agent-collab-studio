/* ============================================================
   뉴스픽 스튜디오 | /api/account — 채널 계정(6개 플랫폼) 저장/불러오기
   - 로그인(회원·게스트) 세션이 있으면 KV USER:<provider>:<id> 에 저장한다.
   - 세션이 없으면 401 → 화면은 브라우저(localStorage) 저장으로 넘어간다.
   - GET  → { ok, storage, accounts, updatedAt }
   - PUT  → { accounts: { threads:{handle,memo,webhook,token}, ... } }
   ============================================================ */

import { currentSession, json, loadProfile, saveProfile, store } from "./auth/_session.js";

export const PLATFORM_IDS = ["threads", "instagram", "facebook", "x", "tiktok", "youtube"];

function text(value, max) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

export function sanitizeAccounts(input) {
  const source = input && typeof input === "object" ? input : {};
  const out = {};
  for (const id of PLATFORM_IDS) {
    const raw = source[id] && typeof source[id] === "object" ? source[id] : {};
    const entry = {
      handle: text(raw.handle, 60).replace(/\s+/g, "").replace(/^@*/, "@"),
      memo: text(raw.memo, 200),
      webhook: text(raw.webhook, 500),
      token: text(raw.token, 500),
    };
    if (entry.handle === "@") entry.handle = "";
    if (entry.handle || entry.memo || entry.webhook || entry.token) out[id] = entry;
  }
  return out;
}

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  const session = await currentSession(request, env);

  if (!session) {
    return json(401, {
      ok: false,
      code: "login_required",
      storage: store(env) ? "kv" : "none",
      message: "로그인(또는 게스트 세션)하면 채널 계정을 KV에 저장할 수 있어요. 지금은 브라우저에 저장됩니다.",
    });
  }

  const profile = await loadProfile(env, session);

  if (method === "GET") {
    return json(200, {
      ok: true,
      storage: store(env) ? "kv" : "none",
      mode: session.provider === "guest" ? "guest" : "member",
      accounts: profile.accounts || {},
      updatedAt: profile.updatedAt || "",
    });
  }

  if (method === "PUT" || method === "POST") {
    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json(400, { ok: false, code: "bad_json", message: "요청 본문을 읽지 못했습니다." });
    }
    const accounts = sanitizeAccounts(payload && payload.accounts ? payload.accounts : payload);
    const saved = await saveProfile(env, session, { accounts });
    if (!saved) {
      return json(200, {
        ok: false,
        code: "kv_unavailable",
        storage: "none",
        accounts,
        message: "KV 저장소가 없어 서버에 저장하지 못했습니다. 브라우저 저장을 함께 써 주세요.",
      });
    }
    return json(200, { ok: true, storage: "kv", accounts: saved.accounts || {}, updatedAt: saved.updatedAt });
  }

  return json(405, { ok: false, code: "method_not_allowed", message: "GET·PUT 으로 호출해 주세요." });
}
