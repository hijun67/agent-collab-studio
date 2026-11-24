/* ============================================================
   뉴스픽 스튜디오 | GET /api/auth/me — 현재 로그인 상태
   - ns_session 쿠키를 검증만 하고 아무것도 바꾸지 않는다.
   - { authenticated, user, accounts, providers, oauthConfigured, storage, mode }
   - 로그인 전에도 호출할 수 있어, 화면이 'OAuth 키 등록 대기 중' 안내와
     게스트 모드 전환을 판단하는 근거로 쓴다.
   ============================================================ */

import {
  currentSession,
  json,
  loadProfile,
  providers,
  publicUser,
  store,
} from "./_session.js";

export async function onRequestGet({ request, env }) {
  const session = await currentSession(request, env);
  const conf = providers(env);
  const storage = store(env) ? "kv" : "none";

  if (!session) {
    return json(200, {
      authenticated: false,
      user: null,
      accounts: {},
      providers: conf,
      oauthConfigured: conf.google || conf.naver || conf.kakao,
      storage,
      mode: "anonymous",
      message: conf.google || conf.naver || conf.kakao ? "" : "OAuth 키 등록 대기 중",
    });
  }

  const profile = await loadProfile(env, session);
  return json(200, {
    authenticated: true,
    user: publicUser(session, profile),
    accounts: profile.accounts || {},
    providers: conf,
    oauthConfigured: conf.google || conf.naver || conf.kakao,
    storage,
    mode: session.provider === "guest" ? "guest" : "member",
    updatedAt: profile.updatedAt || "",
  });
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() !== "GET") {
    return json(405, { ok: false, code: "method_not_allowed", message: "GET 으로 호출해 주세요." });
  }
  return onRequestGet(context);
}
