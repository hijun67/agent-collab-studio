/* /api/mirror — 뉴스픽/파트너스 기사 텍스트 미러링 아카이브
 *
 *  POST   {url, pn}                     기사 주소를 받아 텍스트 리더 뷰로 추출 + 아카이브 저장
 *  POST   {title, body, url, pn, ...}   주소가 막힐 때 직접 붙여넣은 내용으로 저장
 *  POST   {preset:"power-bill"}         예시 기사 프리셋
 *  GET    ?q=&id=                       목록(검색) 또는 1건
 *  DELETE ?id=                          아카이브에서 삭제
 *
 * KV 바인딩(ARCHIVE = newspic-studio-kv)이 없으면 storage:"none" 을 돌려주고
 * 화면이 브라우저(localStorage) 아카이브로 자동 폴백한다.
 */
import {
  absoluteUrl,
  buildDraft,
  detectSite,
  extractAuthor,
  extractArticleImages,
  extractBodyHtml,
  extractInlineImages,
  extractMeta,
  extractNid,
  extractTitleTag,
  htmlToParagraphs,
  isSafeFetchUrl,
  makeArticleId,
  mergePartnerUrl,
  normalizeSpace,
  parsePartner,
  trackingFromEnv,
} from "./_lib.js";
import { findPreset, PRESETS } from "./_presets.js";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const MAX_BYTES = 2_500_000;
const FETCH_TIMEOUT = 9000;
const KV_PREFIX = "a:";
const KEEP_SECONDS = 60 * 60 * 24 * 180;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function store(env) {
  return env && env.ARCHIVE && typeof env.ARCHIVE.get === "function" ? env.ARCHIVE : null;
}

function sniffCharset(contentType, head) {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType || "");
  if (fromHeader) return fromHeader[1].toLowerCase();
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head || "");
  if (fromMeta) return fromMeta[1].toLowerCase();
  return "utf-8";
}

function decode(buffer, charset) {
  for (const name of [charset, "utf-8", "euc-kr"]) {
    if (!name) continue;
    try {
      return new TextDecoder(name, { fatal: false }).decode(buffer);
    } catch (e) {
      /* 다음 후보 */
    }
  }
  return new TextDecoder("utf-8").decode(buffer);
}

async function fetchArticle(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.6",
        "cache-control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `기사 페이지가 ${response.status} 응답을 보냈습니다.` };
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer);
    const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 2048));
    const charset = sniffCharset(response.headers.get("content-type"), head);
    const html = decode(bytes, charset);
    const type = response.headers.get("content-type") || "";
    if (!/html|xml/i.test(type) && !/<html|<body|<meta/i.test(html.slice(0, 4000))) {
      return { ok: false, reason: "기사 페이지가 HTML 형식이 아닙니다." };
    }
    return { ok: true, html, finalUrl: response.url || url };
  } catch (error) {
    const aborted = error && (error.name === "AbortError" || /aborted|timeout/i.test(String(error)));
    return {
      ok: false,
      reason: aborted
        ? "기사 페이지 응답이 9초 안에 오지 않았습니다."
        : "기사 페이지에 접속하지 못했습니다. (차단되었거나 주소가 잘못되었을 수 있습니다)",
    };
  } finally {
    clearTimeout(timer);
  }
}

function cleanParagraphs(list) {
  const out = [];
  for (const item of list) {
    const text = normalizeSpace(item);
    if (!text) continue;
    if (text.length < 8) continue;
    if (/^(copyright|ⓒ|무단 전재|재배포 금지|기사 제보|저작권자)/i.test(text)) continue;
    if (out[out.length - 1] === text) continue;
    out.push(text.slice(0, 1200));
    if (out.length >= 80) break;
  }
  return out;
}

function cleanArticleTitle(title, site) {
  let text = normalizeSpace(title);
  if (!text) return text;
  const parts = text.split(/\s*[|｜]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const name = normalizeSpace(site);
    if (name && parts[parts.length - 1] === name) text = parts.slice(0, -1).join(" | ");
    else if (parts[0] === parts[parts.length - 1]) text = parts[0];
  }
  return text;
}

function makeArticle(input) {
  const paragraphs = cleanParagraphs(input.paragraphs || String(input.body || "").split(/\n{1,}/));
  const body = paragraphs.join("\n\n");
  const url = normalizeSpace(input.url || "");
  const partner = input.partner || null;
  const tracking = input.tracking || null;
  const partnerUrl = mergePartnerUrl(url || (partner && partner.url) || "", partner, tracking);
  const title = normalizeSpace(input.title || "").slice(0, 200) || "제목 없음";
  const images = (input.images || []).filter(Boolean).slice(0, 8);
  const image = input.image || images[0] || "";
  const bodyImages = (input.bodyImages || [image, ...images]).filter(Boolean);
  const uniqueBodyImages = [];
  for (const candidate of bodyImages) {
    if (!/^https?:/i.test(candidate)) continue;
    if (/\{\{|%7B%7B|image_profile|noimg|default_|placeholder/i.test(candidate)) continue;
    if (uniqueBodyImages.includes(candidate)) continue;
    uniqueBodyImages.push(candidate);
    if (uniqueBodyImages.length >= 8) break;
  }
  const createdAt = new Date().toISOString();

  return {
    id: makeArticleId(url, title),
    title,
    subtitle: normalizeSpace(input.subtitle || "").slice(0, 400),
    site: normalizeSpace(input.site || "") || "직접 입력",
    author: normalizeSpace(input.author || "").slice(0, 60),
    publishedAt: normalizeSpace(input.publishedAt || ""),
    url,
    partnerUrl,
    partnerCode: partner && partner.code ? partner.code : "",
    image,
    images,
    bodyImages: uniqueBodyImages,
    paragraphs,
    body,
    charCount: body.replace(/\s/g, "").length,
    source: input.source || "url",
    presetId: input.presetId || "",
    createdAt,
    updatedAt: createdAt,
  };
}

function draftFor(article, warnings = [], extra = {}) {
  const cuts = buildDraft({
    title: article.title,
    description: article.subtitle,
    body: article.body,
    url: article.url,
    image: article.image,
    site: article.site,
    publishedAt: article.publishedAt,
    partner: article.partnerCode ? { code: article.partnerCode } : null,
    fetched: article.source === "url",
  });
  return { ok: true, article, cuts: cuts.cuts, warnings, ...extra };
}

async function saveArticle(kv, article) {
  if (!kv) return false;
  try {
    await kv.put(KV_PREFIX + article.id, JSON.stringify(article), { expirationTtl: KEEP_SECONDS });
    return true;
  } catch (e) {
    return false;
  }
}

async function readArticle(kv, id) {
  if (!kv || !id) return null;
  try {
    const raw = await kv.get(KV_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function listArticles(kv, q) {
  if (!kv) return [];
  try {
    const listed = await kv.list({ prefix: KV_PREFIX, limit: 100 });
    const keys = (listed.keys || []).map((k) => k.name).slice(0, 60);
    const values = await Promise.all(keys.map((key) => kv.get(key)));
    const items = values
      .map((raw) => {
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
    const query = normalizeSpace(q || "").toLowerCase();
    return items
      .filter((item) => {
        if (!query) return true;
        return [item.title, item.subtitle, item.site, item.body]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((item) => ({ ...item, body: item.body.slice(0, 0), paragraphs: [] }));
  } catch (e) {
    return [];
  }
}

async function handleUrl(payload, kv, tracking) {
  const partner = parsePartner(payload.pn || payload.partner || payload.partnerCode || "");
  const rawUrl = normalizeSpace(payload.url || payload.articleUrl || "");
  if (!rawUrl) {
    return json({ ok: false, code: "empty_url", message: "기사 주소를 입력해 주세요." }, 400);
  }
  if (!isSafeFetchUrl(rawUrl)) {
    return json({ ok: false, code: "bad_url", message: "http/https 기사 주소만 불러올 수 있습니다." }, 400);
  }

  const fetched = await fetchArticle(rawUrl);
  if (!fetched.ok) {
    return json({
      ok: false,
      code: "fetch_failed",
      needsManual: true,
      message: fetched.reason + " 제목과 본문을 직접 붙여넣으면 그대로 이어서 저장할 수 있습니다.",
      url: rawUrl,
      partnerCode: partner && partner.code ? partner.code : "",
    });
  }

  const html = fetched.html;
  const finalUrl = fetched.finalUrl || rawUrl;
  const title = extractMeta(html, ["og:title", "twitter:title"]) || extractTitleTag(html) || "";
  const subtitle = extractMeta(html, ["og:description", "twitter:description", "description"]);
  const image = absoluteUrl(extractMeta(html, ["og:image", "twitter:image"]), finalUrl);
  const publishedAt = extractMeta(html, [
    "article:published_time",
    "og:regDate",
    "dcterms.created",
    "dcterms.issued",
  ]);
  const bodyHtml = extractBodyHtml(html);
  const paragraphs = htmlToParagraphs(bodyHtml);
  /* 기사 본문 이미지만 쓴다. 사이드바·추천기사 썸네일은 문서 전체 스캔에서도 사진 블록으로 한정해 걸러낸다. */
  const ogWidth = Number(extractMeta(html, ["og:image:width", "twitter:image:width"]) || 0) || 0;
  const site = detectSite(html, finalUrl);
  const author = extractAuthor(html);
  const cleanTitle = cleanArticleTitle(title, site);

  if (!title && paragraphs.length === 0) {
    return json({
      ok: false,
      code: "no_content",
      needsManual: true,
      message: "제목과 본문을 찾지 못했습니다. 직접 붙여넣기로 이어서 저장해 주세요.",
      url: rawUrl,
    });
  }

  const warnings = [];
  if (!paragraphs.length) {
    warnings.push("본문을 찾지 못해 제목과 요약만 저장했습니다. 본문을 붙여넣으면 더 좋아집니다.");
  }

  const bodyImages = extractArticleImages({
    bodyHtml,
    html,
    ogImage: image,
    base: finalUrl,
    limit: 8,
    ogWidth,
  });
  const article = makeArticle({
    title: cleanTitle,
    subtitle,
    paragraphs: paragraphs.length ? paragraphs : [subtitle].filter(Boolean),
    body: paragraphs.length ? "" : subtitle,
    url: finalUrl,
    image,
    images: bodyImages,
    bodyImages,
    site,
    author,
    publishedAt,
    partner,
    tracking,
    source: "url",
  });
  article.nid = extractNid(finalUrl);

  const saved = await saveArticle(kv, article);
  return json({ ok: true, article, storage: saved ? "kv" : "none", warnings });
}

async function handleManual(payload, kv, tracking) {
  const partner = parsePartner(payload.pn || payload.partner || payload.partnerCode || "");
  const title = normalizeSpace(payload.title || "");
  const body = String(payload.body || "").slice(0, 30000);
  if (!title && !body) {
    return json({ ok: false, code: "empty_input", message: "제목이나 본문을 입력해 주세요." }, 400);
  }
  const url = normalizeSpace(payload.url || "");
  if (url && !isSafeFetchUrl(url)) {
    return json({ ok: false, code: "bad_url", message: "http/https 주소만 저장할 수 있습니다." }, 400);
  }
  const article = makeArticle({
    title: title || body.slice(0, 60),
    subtitle: payload.subtitle || payload.description || "",
    paragraphs: body.split(/\n{1,}/),
    url,
    image: absoluteUrl(payload.image || "", url || undefined),
    images: Array.isArray(payload.images) ? payload.images.map((item) => absoluteUrl(item, url || undefined)) : payload.image ? [absoluteUrl(payload.image, url || undefined)] : [],
    bodyImages: (Array.isArray(payload.bodyImages) ? payload.bodyImages : []).map((item) => absoluteUrl(item, url || undefined)),
    site: payload.site || "직접 입력",
    author: payload.author || "",
    publishedAt: payload.publishedAt || "",
    partner,
    tracking,
    source: "manual",
  });
  const saved = await saveArticle(kv, article);
  return json({ ok: true, article, storage: saved ? "kv" : "none", warnings: ["직접 붙여넣은 기사로 저장했습니다."] });
}

async function handlePreset(payload, kv, tracking) {
  const preset = findPreset(String(payload.preset || "")) || PRESETS[0];
  const partner = parsePartner(payload.pn || payload.partner || payload.partnerCode || "");
  const article = makeArticle({
    title: preset.title,
    subtitle: preset.description,
    paragraphs: preset.body.split(/\n{1,}/),
    url: "",
    site: preset.site,
    image: preset.image,
    partner,
    tracking,
    source: "preset",
    presetId: preset.id,
  });
  const saved = await saveArticle(kv, article);
  return json({
    ok: true,
    article,
    storage: saved ? "kv" : "none",
    warnings: ["예시 기사입니다. 실제 기사 주소로 다시 미러링해 보세요."],
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = store(env);
  const tracking = trackingFromEnv(env);
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const url = new URL(request.url);
    const id = normalizeSpace(url.searchParams.get("id") || "");
    if (id) {
      const article = (await readArticle(kv, id)) || null;
      if (!article) return json({ ok: false, code: "not_found", message: "아카이브에 없는 기사입니다." }, 404);
      return json({ ok: true, article, storage: kv ? "kv" : "none" });
    }
    const q = url.searchParams.get("q") || "";
    const items = await listArticles(kv, q);
    return json({ ok: true, items, storage: kv ? "kv" : "none", count: items.length });
  }

  if (method === "DELETE") {
    const url = new URL(request.url);
    const id = normalizeSpace(url.searchParams.get("id") || "");
    if (!id) return json({ ok: false, code: "bad_id", message: "삭제할 기사 id 가 필요합니다." }, 400);
    if (!kv) return json({ ok: true, deleted: false, storage: "none" });
    try {
      await kv.delete(KV_PREFIX + id);
      return json({ ok: true, deleted: true, storage: "kv" });
    } catch (e) {
      return json({ ok: false, code: "kv_error", message: "아카이브에서 지우지 못했습니다." }, 500);
    }
  }

  if (method !== "POST") {
    return json({ ok: false, code: "method_not_allowed", message: "GET·POST·DELETE 로 호출해 주세요." }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ ok: false, code: "bad_json", message: "요청 본문을 읽지 못했습니다." }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, code: "bad_json", message: "요청 본문을 읽지 못했습니다." }, 400);
  }

  try {
    if (payload.preset) return await handlePreset(payload, kv, tracking);
    const manual = payload.manual === true || (!payload.url && (payload.title || payload.body));
    if (manual) return await handleManual(payload, kv, tracking);
    const response = await handleUrl(payload, kv, tracking);
    /* URL 실패 시에도 화면이 바로 쓸 수 있도록 4컷 뼈대를 함께 내려준다 */
    if (response.status === 200) {
      const data = await response.clone().json();
      if (data.ok && data.article) {
        const draft = draftFor(data.article, data.warnings || [], { storage: data.storage });
        return json(draft);
      }
    }
    return response;
  } catch (error) {
    return json(
      { ok: false, code: "server_error", message: "미러링 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." },
      500
    );
  }
}
