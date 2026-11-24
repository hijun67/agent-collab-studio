/* ============================================================
   뉴스픽 스튜디오 | GET /api/auth/callback/google — 구글 로그인 콜백
   1) state 쿠키와 쿼리 state 비교 (CSRF 방지)
   2) code → 토큰 교환
   3) userinfo 조회
   4) KV USER:google:<sub> 프로필 저장 후 ns_session 쿠키(7일) 설정, "/" 로 이동
   - 실패는 "/?login=<사유>" 로 돌려보내 화면에서 안내만 한다.
   ============================================================ */

import {
  COOKIE_SESSION,
  COOKIE_STATE,
  SESSION_SECONDS,
  SESSION_VERSION,
  callbackUri,
  clearCookie,
  cookie,
  createSession,
  json,
  readCookie,
  redirect,
  saveProfile,
  sessionSecret,
} from "../_session.js";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

function back(reason, provider = "google") {
  return redirect(`/?login=${encodeURIComponent(reason)}&provider=${provider}`, [clearCookie(COOKIE_STATE)]);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const clientId = env && env.GOOGLE_CLIENT_ID;
  const clientSecret = env && env.GOOGLE_CLIENT_SECRET;
  const secret = sessionSecret(env);

  if (!clientId || !clientSecret || !secret) {
    return redirect("/?login=oauth_pending&provider=google", [clearCookie(COOKIE_STATE)]);
  }

  if (url.searchParams.get("error")) return back("cancelled");

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const savedState = readCookie(request, COOKIE_STATE);

  if (!code) return back("missing_code");
  if (!state || !savedState || state !== savedState) return back("bad_state");

  let token;
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUri(request.url, "google"),
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!res.ok) return back("token_failed");
    token = await res.json();
  } catch (e) {
    return back("token_failed");
  }

  if (!token || !token.access_token) return back("token_failed");

  let info;
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
    });
    if (!res.ok) return back("userinfo_failed");
    info = await res.json();
  } catch (e) {
    return back("userinfo_failed");
  }

  if (!info || !info.sub) return back("userinfo_failed");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: SESSION_VERSION,
    provider: "google",
    sub: String(info.sub),
    name: info.name || info.email || "구글 사용자",
    email: info.email || "",
    picture: info.picture || "",
    iat: now,
    exp: now + SESSION_SECONDS,
  };

  let value;
  try {
    value = await createSession(secret, payload);
  } catch (e) {
    return back("session_failed");
  }

  await saveProfile(env, payload, {
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
  });

  return redirect("/", [cookie(COOKIE_SESSION, value, SESSION_SECONDS), clearCookie(COOKIE_STATE)]);
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
  return onRequestGet(context);
}
