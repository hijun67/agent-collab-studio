/* ============================================================
   뉴스픽 스튜디오 | POST /api/auth/guest — 게스트 세션 시작
   - OAuth 키가 아직 없거나 로그인 없이 쓰고 싶을 때, 서명된 ns_session 을 발급한다.
   - 게스트도 KV(USER:guest:<id>)에 채널 계정을 저장할 수 있다.
   - SESSION_SECRET 이 없으면 서명할 수 없으므로 mode:"local" 을 돌려주고
     화면은 브라우저(localStorage) 저장으로 넘어간다.
   ============================================================ */

import {
  COOKIE_SESSION,
  SESSION_SECONDS,
  SESSION_VERSION,
  cookie,
  createSession,
  currentSession,
  json,
  loadProfile,
  providers,
  publicUser,
  randomToken,
  saveProfile,
  sessionSecret,
  store,
} from "./_session.js";

export async function onRequestPost({ request, env }) {
  const secret = sessionSecret(env);
  if (!secret) {
    return json(200, {
      ok: true,
      authenticated: false,
      mode: "local",
      storage: store(env) ? "kv" : "none",
      providers: providers(env),
      message: "세션 서명 키가 없어 게스트 기록은 이 브라우저(localStorage)에 저장됩니다.",
    });
  }

  const existing = await currentSession(request, env);
  const now = Math.floor(Date.now() / 1000);
  const payload = existing
    ? existing
    : {
        v: SESSION_VERSION,
        provider: "guest",
        sub: randomToken(12),
        name: "게스트",
        email: "",
        picture: "",
        iat: now,
        exp: now + SESSION_SECONDS,
      };
  if (existing) payload.exp = now + SESSION_SECONDS;

  let value;
  try {
    value = await createSession(secret, payload);
  } catch (e) {
    return json(200, {
      ok: true,
      authenticated: false,
      mode: "local",
      storage: store(env) ? "kv" : "none",
      providers: providers(env),
      message: "세션을 만들지 못해 게스트 기록은 이 브라우저(localStorage)에 저장됩니다.",
    });
  }

  const profile = await loadProfile(env, payload);
  if (!profile.createdAt) {
    await saveProfile(env, payload, { name: "게스트" });
  }

  return json(
    200,
    {
      ok: true,
      authenticated: true,
      mode: "guest",
      user: publicUser(payload, profile),
      accounts: profile.accounts || {},
      storage: store(env) ? "kv" : "none",
      providers: providers(env),
    },
    { "Set-Cookie": cookie(COOKIE_SESSION, value, SESSION_SECONDS) }
  );
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method !== "POST") {
    return json(405, { ok: false, code: "method_not_allowed", message: "POST 로 호출해 주세요." });
  }
  const response = await onRequestPost(context);
  return response;
}

export async function onRequestGet() {
  return json(405, { ok: false, code: "method_not_allowed", message: "POST 로 호출해 주세요." });
}
