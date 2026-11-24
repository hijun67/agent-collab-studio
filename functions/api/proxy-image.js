/* /api/proxy-image — 기사 썸네일을 캔버스에 바로 그릴 수 있게 base64 로 중계
 *  GET ?url=<absolute image url>
 *  - 같은 출처 문제(CORS) 없이 표지를 만들기 위한 용도. 최대 4MB.
 */
import { isSafeFetchUrl } from "./_lib.js";

const MAX_BYTES = 4_000_000;
const TIMEOUT = 12000;

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
  const url = new URL(request.url).searchParams.get("url") || "";
  if (!url || !isSafeFetchUrl(url)) {
    return json({ ok: false, code: "bad_url", message: "이미지 주소가 올바르지 않습니다." }, 400);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "image/*",
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        referer: new URL(url).origin + "/",
      },
      signal: controller.signal,
    });
    if (!response.ok) return json({ ok: false, code: "fetch_failed", status: response.status });
    const type = response.headers.get("content-type") || "";
    if (!/^image\//i.test(type)) return json({ ok: false, code: "not_image" });
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return json({ ok: false, code: "too_large" });
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return json({
      ok: true,
      dataUrl: `data:${type.split(";")[0]};base64,` + btoa(binary),
      bytes: buffer.byteLength,
    });
  } catch (error) {
    return json({ ok: false, code: "fetch_failed", message: String((error && error.message) || error) });
  } finally {
    clearTimeout(timer);
  }
}
