/* ============================================================
   뉴스픽 스튜디오 | GET /api/auth/google — 구글 로그인/회원가입 시작
   - CSRF state 를 HttpOnly 쿠키(ns_oauth_state, 10분)에 담고
     구글 인증 화면으로 302 리디렉션한다.
   - GOOGLE_CLIENT_ID 가 없으면 화면으로 돌아가 'OAuth 키 등록 대기 중' 안내를 띄운다.
   - ?format=json 이면 JSON 으로 응답한다(테스트·진단용).
   ============================================================ */

import { COOKIE_STATE, STATE_SECONDS, callbackUri, cookie, json, randomToken, redirect } from "./_session.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

function wantsJson(request) {
  if (!request) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") return true;
  return /application\/json/i.test(request.headers.get("accept") || "");
}

export async function onRequestGet({ request, env }) {
  const clientId = env && env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    if (wantsJson(request)) {
      return json(503, {
        ok: false,
        code: "oauth_pending",
        provider: "google",
        message: "OAuth 키 등록 대기 중 — 구글 로그인 키가 아직 없습니다. 게스트로 계속할 수 있어요.",
      });
    }
    return redirect("/?login=oauth_pending&provider=google");
  }

  const state = randomToken(16);
  const auth = new URL(AUTH_ENDPOINT);
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", callbackUri(request.url, "google"));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("prompt", "select_account");
  auth.searchParams.set("access_type", "online");

  return redirect(auth.toString(), [cookie(COOKIE_STATE, state, STATE_SECONDS)]);
}
