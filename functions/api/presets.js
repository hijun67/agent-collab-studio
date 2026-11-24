/* /api/presets — 예시 기사 3종 (주소가 막혔을 때 바로 써 보는 용도) */
import { PRESETS } from "./_presets.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method.toUpperCase() !== "GET") {
    return json({ ok: false, code: "method_not_allowed" }, 405);
  }
  return json({
    ok: true,
    presets: PRESETS.map((preset) => ({
      id: preset.id,
      emoji: preset.emoji,
      label: preset.label,
      title: preset.title,
      description: preset.description,
      body: preset.body,
      site: preset.site,
    })),
  });
}
