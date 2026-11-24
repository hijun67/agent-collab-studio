/* ============================================================
   뉴스픽 스튜디오 | GET /api/auth/kakao — 카카오 로그인/회원가입 시작
   - CSRF state 쿠키(ns_oauth_state, 10분) 후 카카오 인증 화면으로 302.
   - KAKAO_CLIENT_ID(REST API 키) 가 없으면 'OAuth 키 등록 대기 중' 안내로 돌려보낸다.
   - redirect_uri 는 카카오디벨로퍼스에 등록한 값과 같아야 하므로
     환경변수 KAKAO_REDIRECT_URI 가 있으면 그것을, 없으면 요청 origin 을 쓴다.
   ============================================================ */

import {
  COOKIE_STATE,
  STATE_SECONDS,
  callbackUri,
  cookie,
  json,
  randomToken,
  redirect,
} from "./_session.js";

const AUTH_ENDPOINT = "https://kauth.kakao.com/oauth/authorize";

function wantsJson(request) {
  if (!request) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") return true;
  return /application\/json/i.test(request.headers.get("accept") || "");
}

export async function onRequestGet({ request, env }) {
  const clientId = env && env.KAKAO_CLIENT_ID;
  if (!clientId) {
    if (wantsJson(request)) {
      return json(503, {
        ok: false,
        code: "oauth_pending",
        provider: "kakao",
        message: "OAuth 키 등록 대기 중 — 카카오 로그인 키가 아직 없습니다. 게스트로 계속할 수 있어요.",
      });
    }
    return redirect("/?login=oauth_pending&provider=kakao");
  }

  const state = randomToken(16);
  const auth = new URL(AUTH_ENDPOINT);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", (env && env.KAKAO_REDIRECT_URI) || callbackUri(request.url, "kakao"));
  auth.searchParams.set("state", state);

  return redirect(auth.toString(), [cookie(COOKIE_STATE, state, STATE_SECONDS)]);
}
