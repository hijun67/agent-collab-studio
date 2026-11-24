/* ============================================================
   뉴스픽 스튜디오 | /api/partners-hot — 뉴스픽 파트너스 '고수익 콘텐츠' 어댑터
   - GET  ?pn=495&limit=20
       → { ok, linked, source:"kv"|"seed"|"curated", items[], note }
   - POST { items:[{title,nid,pn,site,image,summary}] }
       → KV(p:hot) 갱신. 로그인 세션 또는 헤더 x-partners-seed-key 필요.
   - 링크에는 파트너스 추적 파라미터(lcp·cp·utm_source)가 항상 붙는다.
   ============================================================ */

import { parsePartner, normalizeSpace, trackingFromEnv } from "./_lib.js";
import { buildPartnersHot, PARTNERS_MAX, writePartnerItems } from "./_partners.js";
import { currentSession, json, store } from "./auth/_session.js";

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const tracking = trackingFromEnv(env);
  const kv = store(env);

  if (method === "GET") {
    const partner = parsePartner(url.searchParams.get("pn") || "");
    const limit = Math.max(1, Math.min(PARTNERS_MAX, Number(url.searchParams.get("limit")) || PARTNERS_MAX));
    const data = await buildPartnersHot({
      env,
      kv,
      pn: partner ? partner.code : "",
      tracking,
      limit,
    });
    return json(200, {
      ...data,
      categories: [{ id: "partners", name: "파트너스 고수익", emoji: "💰" }],
      fetchedAt: new Date().toISOString(),
    });
  }

  if (method === "POST") {
    const session = await currentSession(request, env);
    const seedKey = normalizeSpace(env && env.PARTNERS_SEED_KEY ? env.PARTNERS_SEED_KEY : "");
    const headerKey = normalizeSpace(request.headers.get("x-partners-seed-key") || "");
    const allowed = Boolean(session) || Boolean(seedKey && headerKey && seedKey === headerKey);
    if (!allowed) {
      return json(401, {
        ok: false,
        code: "login_required",
        message: "고수익 목록을 갱신하려면 로그인하거나 파트너스 시드 키가 필요합니다.",
      });
    }
    if (!kv) {
      return json(200, {
        ok: false,
        code: "kv_unavailable",
        storage: "none",
        message: "KV 저장소가 없어 목록을 저장하지 못했습니다.",
      });
    }
    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json(400, { ok: false, code: "bad_json", message: "요청 본문을 읽지 못했습니다." });
    }
    const items = payload && Array.isArray(payload.items) ? payload.items : Array.isArray(payload) ? payload : [];
    const saved = await writePartnerItems(kv, items, tracking);
    if (!saved) {
      return json(400, { ok: false, code: "bad_items", message: "저장할 고수익 항목(title·nid)이 없습니다." });
    }
    const data = await buildPartnersHot({ env, kv, pn: "", tracking, limit: PARTNERS_MAX });
    return json(200, { ok: true, saved: true, count: data.items.length, ...data });
  }

  return json(405, { ok: false, code: "method_not_allowed", message: "GET·POST 로 호출해 주세요." });
}
