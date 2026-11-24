/* /api/feed — 10개 분류별 기사 목록 (공개 국내 RSS 기반 + 큐레이션 폴백)
 *
 *  GET ?category=all|economy|tech|society|politics|entertain|sports|health|life|realestate|global|partners
 *      &limit=20&pn=495
 *    → { ok, category, categories[], items[], fallback, fetchedAt, count }
 *
 *  - 실제 기사: 연합뉴스 카테고리 RSS(경제·산업·사회·정치·세계·문화·건강·스포츠·연예) + 이티뉴스(IT)
 *  - 분류당 기본 20건을 노출한다(limit 최대 20).
 *  - RSS가 모자라면 카테고리 큐레이션(_feedFallback.js)을 뒤에 채워 항상 20건에 가깝게 만든다.
 *  - 파트너스(partners): 뉴스픽 파트너스 고수익 콘텐츠 20건(_partners.js)을 그대로 돌려준다.
 *  - 뉴스픽 주소에는 파트너 코드(pn)와 추적 파라미터(lcp·cp·utm_source)가 병합된다.
 *  - KV(ARCHIVE)가 있으면 카테고리별 5분 캐시를 둔다.
 */
import {
  decodeEntities,
  isSafeFetchUrl,
  mergePartnerUrl,
  normalizeSpace,
  parsePartner,
  trackingFromEnv,
} from "./_lib.js";
import { curatedFor } from "./_feedFallback.js";
import { buildPartnersHot } from "./_partners.js";

export const FEED_CATEGORIES = [
  { id: "all", name: "전체", emoji: "🗂️", feeds: [] },
  {
    id: "economy",
    name: "경제·금융",
    emoji: "💹",
    feeds: [{ url: "https://www.yna.co.kr/rss/economy.xml", site: "연합뉴스" }],
  },
  {
    id: "tech",
    name: "IT·AI",
    emoji: "💻",
    match: /(AI|인공지능|반도체|로봇|플랫폼|스타트업|통신|5G|6G|배터리|전기차|소프트웨어|데이터|클라우드|보안|해킹|앱|디지털|IT|테크|온라인|메타버스|스마트폰|노트북|칩|네트워크|인터넷|전자|게임|양자)/i,
    feeds: [
      { url: "https://www.yna.co.kr/rss/industry.xml", site: "연합뉴스" },
      { url: "https://rss.etnews.com/Section901.xml", site: "이티뉴스" },
    ],
  },
  {
    id: "society",
    name: "사회",
    emoji: "🏙️",
    feeds: [{ url: "https://www.yna.co.kr/rss/society.xml", site: "연합뉴스" }],
  },
  {
    id: "politics",
    name: "정치",
    emoji: "🏛️",
    feeds: [{ url: "https://www.yna.co.kr/rss/politics.xml", site: "연합뉴스" }],
  },
  {
    id: "entertain",
    name: "연예·방송",
    emoji: "🎬",
    feeds: [{ url: "https://www.yna.co.kr/rss/entertainment.xml", site: "연합뉴스" }],
  },
  {
    id: "sports",
    name: "스포츠",
    emoji: "⚽",
    feeds: [{ url: "https://www.yna.co.kr/rss/sports.xml", site: "연합뉴스" }],
  },
  {
    id: "health",
    name: "건강·의학",
    emoji: "🩺",
    feeds: [{ url: "https://www.yna.co.kr/rss/health.xml", site: "연합뉴스" }],
  },
  {
    id: "life",
    name: "라이프·생활",
    emoji: "🌿",
    feeds: [
      { url: "https://www.yna.co.kr/rss/culture.xml", site: "연합뉴스" },
      {
        url: "https://www.yna.co.kr/rss/society.xml",
        site: "연합뉴스",
        match: /(생활|여행|요리|반려|캠핑|패션|뷰티|인테리어|소비|절약|김장|난방|도서관|주거|육아|건강한|취미)/,
      },
    ],
  },
  {
    id: "realestate",
    name: "부동산·재테크",
    emoji: "🏠",
    match: /(부동산|집값|아파트|전세|월세|분양|재건축|재개발|청약|오피스텔|상가|임대|주택|금리|대출|재테크|투자|예금|적금|연금)/,
    feeds: [
      { url: "https://www.yna.co.kr/rss/economy.xml", site: "연합뉴스" },
      { url: "https://www.yna.co.kr/rss/industry.xml", site: "연합뉴스" },
    ],
  },
  {
    id: "global",
    name: "글로벌·국제",
    emoji: "🌏",
    feeds: [{ url: "https://www.yna.co.kr/rss/international.xml", site: "연합뉴스" }],
  },
  {
    id: "partners",
    name: "파트너스 고수익",
    emoji: "💰",
    feeds: [],
    partners: true,
  },
];

export const MAIN_CATEGORY_IDS = FEED_CATEGORIES.filter((item) => item.id !== "all" && !item.partners).map(
  (item) => item.id
);

const CACHE_SECONDS = 300;
const FETCH_TIMEOUT = 7000;
const MAX_ITEMS = 20;
const DEFAULT_LIMIT = 20;

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

function cdata(text) {
  const raw = String(text || "");
  const match = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return match ? match[1] : decodeEntities(raw);
}

function tagText(block, tag) {
  const re = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
  const m = re.exec(block);
  return m ? normalizeSpace(cdata(m[1])) : "";
}

function mediaUrl(block) {
  const m = /<media:content\b[^>]*\burl\s*=\s*["']([^"']+)["']/i.exec(block);
  if (m) return decodeEntities(m[1]);
  const enclosure = /<enclosure\b[^>]*\burl\s*=\s*["']([^"']+)["']/i.exec(block);
  return enclosure ? decodeEntities(enclosure[1]) : "";
}

function stripHtml(text) {
  return normalizeSpace(
    String(text || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
  );
}

export function parseRss(xml, category, siteFallback = "") {
  const source = String(xml || "");
  const blocks = source.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const channelTitle = (/<channel\b[\s\S]*?<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(source) || [])[1] || "";
  const siteFromChannel = normalizeSpace(cdata(channelTitle))
    .replace(/\s*(최신기사|실시간.*|오늘의뉴스.*)$/g, "")
    .replace(/\s*-\s*.*$/, "")
    .trim();
  const site = siteFallback || siteFromChannel || "국내 뉴스";
  const out = [];
  for (const block of blocks) {
    const title = tagText(block, "title");
    const link = tagText(block, "link");
    if (!title || !/^https?:/i.test(link)) continue;
    if (out.some((item) => item.url === link)) continue;
    const description = stripHtml(tagText(block, "description")).slice(0, 220);
    const pubDate = tagText(block, "pubDate");
    let time = "";
    if (pubDate) {
      const date = new Date(pubDate);
      if (!Number.isNaN(date.getTime())) time = date.toISOString();
    }
    out.push({
      id: "f" + link.replace(/[^A-Za-z0-9]/g, "").slice(-14),
      title: title.slice(0, 160),
      summary: description,
      url: link,
      site,
      image: mediaUrl(block),
      publishedAt: time,
      category,
      source: "rss",
    });
  }
  return out;
}

async function fetchRss(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
      signal: controller.signal,
    });
    if (!response.ok) return "";
    return await response.text();
  } catch (e) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function stripToPublic(item, partner, tracking) {
  const partnerUrl = mergePartnerUrl(item.url, partner, tracking);
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    url: item.url,
    partnerUrl,
    partnerApplied: Boolean(partner && partner.code && partnerUrl !== item.url),
    site: item.site,
    image: item.image || "",
    publishedAt: item.publishedAt || "",
    category: item.category,
    source: item.source,
    isFallback: false,
    hot: false,
  };
}

function curatedItems(category, fallbackLimit) {
  return curatedFor(category, fallbackLimit).map((item, index) => ({
    id: "c" + category + index,
    title: item.title,
    summary: item.summary,
    url: "",
    partnerUrl: "",
    partnerApplied: false,
    site: item.site,
    image: "",
    publishedAt: "",
    category: item.category,
    source: "curated",
    isFallback: true,
    hot: false,
    body: item.body,
  }));
}

export async function buildFeed(categoryId, partner, env, limit = DEFAULT_LIMIT) {
  const tracking = trackingFromEnv(env);
  const category = FEED_CATEGORIES.find((item) => item.id === categoryId) || FEED_CATEGORIES[0];
  const kv = env && env.ARCHIVE && typeof env.ARCHIVE.get === "function" ? env.ARCHIVE : null;

  if (category.partners) {
    return buildPartnersHot({
      env,
      kv,
      pn: partner && partner.code ? partner.code : "",
      tracking,
      limit,
    });
  }

  const cacheKey = "f:" + category.id + ":" + (partner && partner.code ? partner.code : "") + ":" + limit;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        if (data && Array.isArray(data.items) && data.items.length) {
          return { ...data, cached: true };
        }
      }
    } catch (e) {
      /* 캐시는 실패해도 무시 */
    }
  }

  const targets = category.id === "all" ? FEED_CATEGORIES.filter((item) => item.id !== "all" && !item.partners) : [category];
  const jobs = [];
  for (const target of targets) {
    for (const feed of target.feeds) {
      if (!isSafeFetchUrl(feed.url)) continue;
      jobs.push({ target, feed, promise: fetchRss(feed.url) });
    }
  }
  const results = await Promise.all(jobs.map((job) => job.promise));
  const collected = [];
  jobs.forEach((job, index) => {
    const xml = results[index];
    if (!xml) return;
    const items = parseRss(xml, job.target.id, job.feed.site);
    const matcher = job.feed.match || job.target.match;
    for (const item of items) {
      if (matcher && !matcher.test(item.title + " " + item.summary)) continue;
      if (collected.some((existing) => existing.url === item.url)) continue;
      collected.push(item);
    }
  });

  const rssItems = collected
    .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")))
    .slice(0, limit)
    .map((item) => stripToPublic(item, partner, tracking));

  /* RSS가 모자라면 큐레이션으로 뒤를 채워 분류당 20건 기준을 지킨다. */
  let items = rssItems;
  if (rssItems.length < limit) {
    const curated = curatedItems(category.id, limit);
    const extra = curated.filter((item) => !rssItems.some((rss) => rss.title === item.title));
    if (category.id === "all") {
      const merged = [];
      for (let i = 0; i < limit; i += 1) {
        if (rssItems[i]) merged.push(rssItems[i]);
        if (extra[i] && merged.length < limit) merged.push(extra[i]);
      }
      items = merged.slice(0, limit);
    } else {
      items = [...rssItems, ...extra].slice(0, limit);
    }
  }

  const data = {
    ok: true,
    category: category.id,
    categoryName: category.name,
    categories: FEED_CATEGORIES.map((item) => ({ id: item.id, name: item.name, emoji: item.emoji })),
    items,
    fallback: rssItems.length === 0,
    limit,
    fetchedAt: new Date().toISOString(),
    count: items.length,
  };

  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_SECONDS });
    } catch (e) {
      /* 캐시 저장 실패는 무시 */
    }
  }
  return data;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method.toUpperCase() !== "GET") {
    return json({ ok: false, code: "method_not_allowed", message: "GET 으로 호출해 주세요." }, 405);
  }
  const url = new URL(request.url);
  const category = normalizeSpace(url.searchParams.get("category") || "all");
  const partner = parsePartner(url.searchParams.get("pn") || "");
  const limit = Math.max(1, Math.min(MAX_ITEMS, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
  try {
    const data = await buildFeed(category, partner, env, limit);
    return json(data);
  } catch (error) {
    if (category === "partners") {
      return json({ ok: true, category, items: [], fallback: true, count: 0, message: "파트너스 목록을 불러오지 못했습니다." });
    }
    const fallback = curatedItems(category, limit);
    return json({
      ok: true,
      category,
      categories: FEED_CATEGORIES.map((item) => ({ id: item.id, name: item.name, emoji: item.emoji })),
      items: fallback,
      fallback: true,
      count: fallback.length,
      fetchedAt: new Date().toISOString(),
      warning: "피드를 불러오지 못해 큐레이션 목록을 보여 줍니다.",
    });
  }
}
