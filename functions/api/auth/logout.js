/* ============================================================
   뉴스픽 스튜디오 | /api/auth/logout — 로그아웃
   - POST: ns_session 쿠키를 만료시키고 { ok: true }
   - GET : 같은 쿠키를 지우고 "/" 로 302 (링크로도 쓸 수 있게)
   ============================================================ */

import { COOKIE_SESSION, clearCookie, redirect } from "./_session.js";

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": clearCookie(COOKIE_SESSION),
    },
  });
}

export async function onRequestGet() {
  return redirect("/", [clearCookie(COOKIE_SESSION)]);
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "POST") return onRequestPost(context);
  if (method === "GET") return onRequestGet(context);
  return new Response(JSON.stringify({ ok: false, code: "method_not_allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
