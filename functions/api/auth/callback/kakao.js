/* ============================================================
   뉴스픽 스튜디오 | GET /api/auth/callback/kakao — 카카오 로그인 콜백
   1) state 검증 → 2) code → 토큰 교환 → 3) 프로필 조회
   4) KV USER:kakao:<id> 저장 후 ns_session 쿠키(7일) 설정, "/" 로 이동
   - 이메일(account_email)은 앱 동의항목 설정에 따라 없을 수 있다(없으면 빈 문자열).
   ============================================================ */

import {
  COOKIE_SESSION,
  COOKIE_STATE,
  SESSION_SECONDS,
  SESSION_VERSION,
  clearCookie,
  cookie,
  createSession,
  json,
  readCookie,
  redirect,
  saveProfile,
  sessionSecret,
} from "../_session.js";

const TOKEN_ENDPOINT = "https://kauth.kakao.com/oauth/token";
const USERINFO_ENDPOINT = "https://kapi.kakao.com/v2/user/me";

function back(reason) {
  return redirect(`/?login=${encodeURIComponent(reason)}&provider=kakao`, [clearCookie(COOKIE_STATE)]);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const clientId = env && env.KAKAO_CLIENT_ID;
  const clientSecret = env && env.KAKAO_CLIENT_SECRET;
  const secret = sessionSecret(env);

  if (!clientId || !clientSecret || !secret) {
    return redirect("/?login=oauth_pending&provider=kakao", [clearCookie(COOKIE_STATE)]);
  }

  if (url.searchParams.get("error")) return back("cancelled");

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const savedState = readCookie(request, COOKIE_STATE);

  if (!code) return back("missing_code");
  if (!state || !savedState || state !== savedState) return back("bad_state");

  const redirectUri = (env && env.KAKAO_REDIRECT_URI) || `${url.origin}/api/auth/callback/kakao`;

  let token;
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
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

  if (!info || !info.id) return back("userinfo_failed");

  const account = info.kakao_account || {};
  const kakaoProfile = account.profile || {};
  const properties = info.properties || {};
  const name = kakaoProfile.nickname || properties.nickname || account.profile_nickname || "카카오 사용자";
  const picture = kakaoProfile.profile_image_url || properties.profile_image || account.profile_image_url || "";

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: SESSION_VERSION,
    provider: "kakao",
    sub: String(info.id),
    name,
    email: account.email || "",
    picture,
    iat: now,
    exp: now + SESSION_SECONDS,
  };

  let value;
  try {
    value = await createSession(secret, payload);
  } catch (e) {
    return back("session_failed");
  }

  await saveProfile(env, payload, { name: payload.name, email: payload.email, picture: payload.picture });

  return redirect("/", [cookie(COOKIE_SESSION, value, SESSION_SECONDS), clearCookie(COOKIE_STATE)]);
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
  return onRequestGet(context);
}
