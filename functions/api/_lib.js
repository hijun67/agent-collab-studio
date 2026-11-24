/* 뉴스픽 4컷 | 기사 파싱 · 4컷 분해 · 쓰레드 문구 생성
 * 서버(Pages Functions)와 테스트(Node)에서 함께 쓰는 순수 함수 모음.
 * DOM API 에 의존하지 않는다.
 */

/* ------------------------------------------------------------------ *
 * 1. HTML 유틸
 * ------------------------------------------------------------------ */

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  middot: "·", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", copy: "©", reg: "®", deg: "°", times: "×",
  comma: ",", period: ".", sol: "/", bsol: "\\", lpar: "(", rpar: ")",
};

export function decodeEntities(input) {
  if (input === null || input === undefined) return "";
  return String(input).replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const digits = body.slice(hex ? 2 : 1);
      const num = parseInt(digits, hex ? 16 : 10);
      if (!Number.isFinite(num) || num < 1 || num > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(num);
      } catch (e) {
        return whole;
      }
    }
    const value = ENTITIES[body.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

export function normalizeSpace(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** meta 태그를 속성 이름과 무관하게 읽는다. */
function parseAttributes(tag) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]);
  }
  return attrs;
}

export function extractMeta(html, keys) {
  const source = String(html || "");
  const wanted = keys.map((k) => k.toLowerCase());
  const metaTags = source.match(/<meta\b[^>]*>/gi) || [];
  const found = {};
  for (const tag of metaTags) {
    const attrs = parseAttributes(tag);
    const name = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (!name || !wanted.includes(name)) continue;
    if (attrs.content === undefined) continue;
    if (found[name] === undefined && attrs.content.trim()) found[name] = attrs.content.trim();
  }
  for (const key of wanted) {
    if (found[key]) return found[key];
  }
  return "";
}

export function extractTitleTag(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? normalizeSpace(decodeEntities(m[1])) : "";
}

/** id/클래스가 붙은 요소 하나를 중첩 깊이를 세어 잘라낸다. */
function extractElement(html, openRe) {
  const source = String(html || "");
  const open = openRe.exec(source);
  if (!open) return "";
  const start = open.index;
  const tagName = /^<([a-zA-Z0-9]+)/.exec(open[0])[1].toLowerCase();
  const tagRe = new RegExp("<(/?)" + tagName + "\\b[^>]*>", "gi");
  tagRe.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(source))) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) return source.slice(start, tagRe.lastIndex);
    } else if (!/\/>\s*$/.test(m[0])) {
      depth += 1;
    }
  }
  return source.slice(start);
}

/** 기사 본문 HTML 후보를 뽑는다. 후보 중 실제 텍스트가 가장 많은 블록을 쓴다.
 *  (연합뉴스처럼 <article class="story-summary"> 가 본문보다 먼저 나오는 페이지 대응)
 */
export function extractBodyHtml(html) {
  const candidates = [
    /<div[^>]*\bid\s*=\s*["']bo_v_atc["'][^>]*>/i,
    /<[a-zA-Z]+[^>]*\bitemprop\s*=\s*["']articleBody["'][^>]*>/i,
    /<[a-zA-Z]+[^>]*\bid\s*=\s*["']articleWrap["'][^>]*>/i,
    /<div[^>]*\bclass\s*=\s*["'][^"']*\bstory-news\b[^"']*["'][^>]*>/i,
    /<article\b[^>]*>/i,
    /<div[^>]*\bclass\s*=\s*["'][^"']*\barticle[-_]?(?:body|view|content|cont)\b[^"']*["'][^>]*>/i,
  ];
  let best = "";
  let bestLength = 0;
  for (const re of candidates) {
    const block = extractElement(html, re);
    if (!block) continue;
    const length = stripHtml(block).length;
    if (length > bestLength) {
      best = block;
      bestLength = length;
    }
  }
  if (best && bestLength > 80) return best;
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(String(html || ""));
  return bodyMatch ? bodyMatch[1] : best || "";
}

export function stripHtml(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|iframe|svg|form|button|select|textarea|video|audio)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|td|section|article|blockquote|figcaption|figure)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  return normalizeSpace(decodeEntities(s));
}

/** 본문 블록을 문단 배열로 바꾼다.
 *  - 속성 없는 <p> 문단이 3개 이상이면 그것을 본문으로 본다(연합뉴스 등).
 *  - <br> 로 나뉜 본문은 텍스트를 줄 단위로 나눈다(뉴스픽 등).
 */
export function htmlToParagraphs(html) {
  const source = String(html || "");
  const bare = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(source))) {
    const attrs = m[1] || "";
    if (/class\s*=\s*["'][^"']*\S/i.test(attrs)) continue;
    const text = normalizeSpace(stripHtml(m[2]));
    if (text) bare.push(text);
  }
  const lines = bare.length >= 3 ? bare : stripHtml(html).split(/\n+/).map((line) => normalizeSpace(line));
  const out = [];
  for (const line of lines) {
    const text = stripDateline(normalizeSpace(line));
    if (!text) continue;
    if (text.length < 8) continue;
    if (isNoiseLine(text)) continue;
    if (/^[\w.+-]+@[\w.-]+$/.test(text)) continue;
    if (/^(?:저작권자|Copyright|ⓒ|무단 전재|재배포 금지)/i.test(text)) continue;
    if (/송고\s*\d{4}\/\d{2}\/\d{2}/.test(text) && text.length < 80) continue;
    if (out[out.length - 1] === text) continue;
    out.push(text.slice(0, 1600));
    if (out.length >= 80) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. 문장 추출
 * ------------------------------------------------------------------ */

const NOISE_ALWAYS = [
  /^\[?APP\s*전용\s*콘텐츠\]?$/, /앱\s*다운로드/, /선착순\s*단가/, /더드림/, /포인트\s*소진/, /노출\s*시점/,
  /^\d{1,2}\.\d{1,2}\s+\d{1,2}:\d{2}\s*[-~]/, /^[\d,.]+\s*\/\s*[\d,.]+$/,
  /^\[?(?:사진|자료사진|사진제공|이미지|영상|그래픽)\s*[=:=\]]/, /^\(사진\s*=/,
  /관련\s*기사/, /구독(?:하기|하고)/, /^제보\s*[:=]/,
  /^▶/, /^☞/, /^※/, /^\[?(?:앵커|리포트)\]/,
  /^(?:이\s*기사도|많이\s*본|추천\s*기사|인기\s*기사)/,
];

/* 짧은 줄에서만 잡는 문구 — 긴 문장에 섞여 있으면 문장을 통째로 버리지 않는다. */
const NOISE_SHORT = [
  /무단\s*전재/, /재배포\s*금지/, /copyright/i, /ⓒ/, /all\s+rights\s+reserved/i,
  /카카오톡\s*채널/, /네이버\s*(?:뉴스|홈)/,
  /^\[[^\]]{0,24}(?:캡처|사진|자료|제공|영상)[^\]]{0,24}\]$/, /^▲\s?/, /^▶\s?/,
  /^(?:구독|로그인|기사\s*제보|저작권자)/,
];

const BYLINE_PATTERN = /^[가-힣]{2,4}\s*(?:기자|특파원|앵커|논설위원)\s*$/;
const COPYRIGHT_MARK = /무단\s*전재|재배포\s*금지|all\s+rights\s+reserved|copyright|ⓒ/i;

export function isNoiseLine(line) {
  const s = normalizeSpace(line);
  if (!s) return true;
  if (BYLINE_PATTERN.test(s)) return true;
  if (NOISE_ALWAYS.some((re) => re.test(s))) return true;
  if (s.length <= 80 && NOISE_SHORT.some((re) => re.test(s))) return true;
  return false;
}

const INLINE_CREDIT = /[\[\(]\s*(?:사진|자료\s*사진|사진\s*제공|영상|이미지|그래픽)\s*=[^\]\)]*[\]\)]/g;

function stripInlineCredits(sentence) {
  return normalizeSpace(String(sentence).replace(INLINE_CREDIT, " "));
}

function stripDateline(sentence) {
  let s = String(sentence);
  // (서울=연합뉴스) · [서울=뉴시스]
  s = s.replace(/^[(\[](?:[가-힣A-Za-z·\s]{1,20}=[가-힣A-Za-z·\s]{1,20})[)\]]\s*/, "");
  // 홍길동 기자 =  /  김기자 특파원 =
  s = s.replace(/^[가-힣]{2,4}\s*(?:기자|특파원|앵커|논설위원)\s*=\s*/, "");
  s = s.replace(/^=\s*/, "");
  return normalizeSpace(s);
}

/**
 * 문단 텍스트를 문장 단위로 나눈다.
 * 너무 긴 문장은 쉼표/공백 기준으로 maxLen 근처에서 자른다.
 */
export function splitSentences(text, maxLen = 130) {
  const out = [];
  const paragraphs = String(text || "").split(/\n+/);
  for (const raw of paragraphs) {
    if (!raw) continue;
    let line = normalizeSpace(raw).replace(/\s+/g, " ");
    if (!line) continue;
    // 문장 뒤에 붙은 저작권 표시는 잘라내고 문장은 살린다.
    const markIndex = line.search(COPYRIGHT_MARK);
    if (markIndex > 20) line = line.slice(0, markIndex).trim();
    if (!line || isNoiseLine(line)) continue;
    const cleaned = stripInlineCredits(stripDateline(line));
    if (!cleaned) continue;
    const pieces = cleaned.split(/(?<=[.!?…])\s+/);
    for (let piece of pieces) {
      piece = normalizeSpace(piece).replace(/^[-·•]\s*/, "");
      if (!piece || isNoiseLine(piece)) continue;
      while (piece.length > maxLen) {
        let cut = piece.lastIndexOf(", ", maxLen);
        if (cut < maxLen * 0.45) cut = piece.lastIndexOf(" ", maxLen);
        if (cut < maxLen * 0.45) cut = maxLen;
        const head = piece.slice(0, cut).trim();
        if (head) out.push(head);
        piece = piece.slice(cut).replace(/^[\s,]+/, "").trim();
      }
      if (piece) out.push(piece);
    }
  }
  return out.filter((s) => s.length >= 8 && /[가-힣A-Za-z0-9]/.test(s));
}

const FACT_HINTS = [
  "밝혔다", "전했다", "발표", "계획", "예정", "확인", "결정", "증가", "감소",
  "돌파", "기록", "선정", "수상", "개최", "출시", "인상", "인하", "발생", "조사",
];
const NUMBER_PATTERN = /\d+(?:[.,]\d+)?\s*(?:%|퍼센트|원|만원|억원|억|만|조|명|건|개|곳|년|개월|배|위|시간|분|㎞|km|도)/;

export function hasNumberFact(sentence) {
  return NUMBER_PATTERN.test(String(sentence || ""));
}

export function scoreSentence(sentence, index, total) {
  const s = String(sentence || "");
  let score = 0;
  const len = s.length;
  if (len >= 25 && len <= 90) score += 3;
  else if (len >= 15 && len <= 120) score += 1;
  else if (len > 160) score -= 2;
  if (NUMBER_PATTERN.test(s)) score += 3;
  if (/["“”]/.test(s)) score += 1;
  if (FACT_HINTS.some((h) => s.includes(h))) score += 2;
  if (/[?]$/.test(s)) score -= 1;
  if (/^(?:이|그|저)\s/.test(s)) score -= 1;
  score += Math.max(0, 3 - (index / Math.max(1, total)) * 4);
  return score;
}

/** 점수순으로 n문장을 고르되 원문 순서를 유지한다. */
export function pickSentences(sentences, count, { exclude = [] } = {}) {
  const seen = new Set(exclude.map((s) => String(s).slice(0, 24)));
  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, index, sentences.length) }))
    .filter((row) => {
      const key = row.sentence.slice(0, 24);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked
    .slice(0, Math.max(0, count))
    .sort((a, b) => a.index - b.index)
    .map((row) => row.sentence);
}

/* ------------------------------------------------------------------ *
 * 3. 문구 다듬기
 * ------------------------------------------------------------------ */

export function shorten(text, max) {
  let s = normalizeSpace(text).replace(/\s+/g, " ");
  s = s.replace(/[」』"'”’]+$/, "").trim();
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  let cut = slice.lastIndexOf(" ");
  if (cut < max * 0.55) cut = slice.lastIndexOf(",");
  if (cut < max * 0.55) cut = slice.lastIndexOf("·");
  if (cut < max * 0.55) cut = max;
  let head = s.slice(0, cut).trim();
  // 잘린 자리에 남은 짝 없는 괄호 조각·군더더기 제거
  head = head.replace(/\s*[\[\(（【][^\]\)）】]*$/, "").trim();
  head = head.replace(/[,·\-–—]+$/, "").trim();
  return head + "…";
}

/** 제목에서 훅 라인을 만든다. */
export function buildHook(title, description = "") {
  const base = shorten(title || description || "오늘의 이슈", 48);
  if (!base) return "오늘의 이슈";
  if (/[?!.]$/.test(base)) return base;
  return base;
}

const ROLE_META = [
  { role: "hook", label: "훅", tone: "충격·궁금증", expression: "놀람", speaker: "독자" },
  { role: "fact", label: "핵심", tone: "핵심 사실", expression: "진지", speaker: "기자" },
  { role: "twist", label: "반전", tone: "반전·디테일", expression: "당황", speaker: "독자" },
  { role: "conclusion", label: "결론", tone: "결론·댓글 유도", expression: "웃음", speaker: "기자" },
];
export const CUT_ROLES = ROLE_META.map((r) => ({ ...r }));

function reactionLine(role, context) {
  const { titleEndsQuestion, factHasNumber, twistHasNumber } = context;
  switch (role) {
    case "hook":
      return titleEndsQuestion ? "결국 어떻게 된 거야?" : "잠깐, 이게 진짜야?";
    case "fact":
      return factHasNumber ? "숫자부터 봐야겠는데?" : "핵심만 딱 짚으면 이거지.";
    case "twist":
      return twistHasNumber ? "여기 숫자가 심상치 않아." : "디테일이 만만치 않은데?";
    default:
      return "자세한 건 첫 댓글에서!";
  }
}

/**
 * 기사 텍스트 → 4컷 초안.
 * 본문이 없으면 제목·요약만으로도 빈칸 없는 초안을 만든다.
 */
export function buildCuts({ title = "", description = "", body = "" }) {
  const sentences = splitSentences(body);
  const descSentences = splitSentences(description);
  const excluded = [title];
  const picked = pickSentences(sentences.length ? sentences : descSentences, 3, { exclude: excluded });
  if (picked.length < 3 && descSentences.length) {
    for (const extra of pickSentences(descSentences, 3 - picked.length, { exclude: [...excluded, ...picked] })) {
      picked.push(extra);
    }
  }
  const fallback = shorten(description || title || "기사 내용을 붙여넣으면 4컷이 자동으로 채워집니다.", 70);

  const hook = buildHook(title, description);
  const fact = shorten(picked[0] || fallback, 72);
  let twist = shorten(picked[1] || picked[0] || fallback, 72);
  if (twist === fact && picked[2]) twist = shorten(picked[2], 72);
  const conclusion = shorten(picked[2] || picked[1] || fallback, 72);

  const narrations = [hook, fact, twist, conclusion];
  const context = {
    titleEndsQuestion: /[?]$/.test(normalizeSpace(title)),
    factHasNumber: hasNumberFact(fact),
    twistHasNumber: hasNumberFact(twist),
  };

  return ROLE_META.map((meta, i) => ({
    index: i + 1,
    role: meta.role,
    roleLabel: meta.label,
    tone: meta.tone,
    narration: narrations[i],
    line: reactionLine(meta.role, context),
    speaker: meta.speaker,
    expression: meta.expression,
  }));
}

/* ------------------------------------------------------------------ *
 * 4. 뉴스픽 파트너스 링크
 * ------------------------------------------------------------------ */

export function parsePartner(input) {
  const raw = normalizeSpace(input || "");
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const pn = url.searchParams.get("pn");
      if (pn && /^[A-Za-z0-9_-]{1,24}$/.test(pn)) {
        return { code: pn, raw, url: url.toString(), kind: "url" };
      }
      return { code: "", raw, url: url.toString(), kind: "url" };
    } catch (e) {
      return null;
    }
  }
  const fromParam = raw.match(/\bpn=([A-Za-z0-9_-]{1,24})/);
  if (fromParam) return { code: fromParam[1], raw, url: "", kind: "param" };
  const digits = raw.match(/^(\d{1,8})$/);
  if (digits) return { code: digits[1], raw, url: "", kind: "code" };
  const token = raw.match(/^([A-Za-z0-9_-]{2,24})$/);
  if (token) return { code: token[1], raw, url: "", kind: "code" };
  return null;
}

/* 뉴스픽 파트너스 추적 파라미터 (한일 님 계정 기본값)
 * - 뉴스픽 기사 주소에는 항상 이 값이 붙어, 파트너스 수익이 한일 님 계정으로 잡힌다.
 * - Cloudflare Pages 환경변수(PARTNERS_LCP·PARTNERS_CP·PARTNERS_UTM)로 갈아끼울 수 있다.
 */
export const PARTNER_TRACKING = {
  lcp: "v9sIx86b",
  cp: "H0cKa48w",
  utmSource: "np260905v9sIx86b",
};

export function trackingFromEnv(env) {
  const source = env || {};
  return {
    lcp: normalizeSpace(source.PARTNERS_LCP || "") || PARTNER_TRACKING.lcp,
    cp: normalizeSpace(source.PARTNERS_CP || "") || PARTNER_TRACKING.cp,
    utmSource: normalizeSpace(source.PARTNERS_UTM || "") || PARTNER_TRACKING.utmSource,
  };
}

export function isNewspicUrl(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return /(^|\.)newspic\.kr$/.test(host);
  } catch (e) {
    return false;
  }
}

/**
 * 기사 URL 에 내 파트너 코드·추적 파라미터를 병합한다. (뉴스픽 기사가 아니면 그대로)
 * - pn: 사용자가 입력한 코드가 있으면 그것을, 없으면 기사 원래 pn 을 유지한다.
 * - lcp·cp·utm_source: 한일 님 파트너스 계정 추적값을 항상 덮어쓴다.
 * - utm_medium=affiliate, utm_campaign=nid 는 없을 때만 채운다.
 */
export function mergePartnerUrl(articleUrl, partner, tracking) {
  const url = normalizeSpace(articleUrl || "");
  if (!url) return "";
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return url;
  }
  if (!isNewspicUrl(url)) return parsed.toString();
  const code = partner && partner.code ? String(partner.code) : "";
  if (code) parsed.searchParams.set("pn", code);
  const track = tracking === false ? null : tracking || PARTNER_TRACKING;
  if (track) {
    if (track.lcp) parsed.searchParams.set("lcp", track.lcp);
    if (track.cp) parsed.searchParams.set("cp", track.cp);
    if (track.utmSource) parsed.searchParams.set("utm_source", track.utmSource);
    if (!parsed.searchParams.get("utm_medium")) parsed.searchParams.set("utm_medium", "affiliate");
    if (!parsed.searchParams.get("utm_campaign")) {
      const nid = parsed.searchParams.get("nid");
      if (nid) parsed.searchParams.set("utm_campaign", nid);
    }
  }
  return parsed.toString();
}

export function extractNid(raw) {
  try {
    const url = new URL(raw);
    const nid = url.searchParams.get("nid");
    return nid && /^\d{6,24}$/.test(nid) ? nid : "";
  } catch (e) {
    return "";
  }
}

/** 서버가 외부로 요청해도 되는 주소인지 (내부망 차단). */
export function isSafeFetchUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    return false;
  }
  if (!/^https?:$/.test(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host.includes(":") || /^\[/.test(host)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 5. 쓰레드 본문 · 첫 댓글
 * ------------------------------------------------------------------ */

export const THREAD_LIMIT = 500;

export function buildHashtags(title = "", site = "") {
  const tags = ["뉴스픽", "오늘의이슈", "뉴스"];
  const cleanSite = normalizeSpace(site).replace(/[^가-힣A-Za-z0-9]/g, "");
  if (cleanSite && cleanSite.length <= 10 && !tags.includes(cleanSite)) tags.push(cleanSite);
  return tags.slice(0, 4).map((t) => "#" + t);
}

export function buildThread({ title = "", cuts = [], site = "", limit = THREAD_LIMIT }) {
  const headline = shorten(title || (cuts[0] && cuts[0].narration) || "오늘의 이슈", 90);
  const tags = buildHashtags(title, site);
  const bullets = cuts
    .slice(1)
    .map((cut) => shorten(cut.narration, 60))
    .filter(Boolean);
  const tail = "\n\n👇 전체 기사는 첫 번째 댓글 링크에서 확인하세요.\n\n" + tags.join(" ");
  const build = (items) => {
    const head = headline;
    const body = items.length ? "\n\n" + items.map((b) => "· " + b).join("\n") : "";
    return (head + body + tail).replace(/\n{3,}/g, "\n\n").trim();
  };
  let used = bullets.slice(0, 3);
  let text = build(used);
  while (text.length > limit && used.length > 0) {
    used = used.slice(0, used.length - 1);
    text = build(used);
  }
  if (text.length > limit) {
    const room = Math.max(20, limit - tail.length - 2);
    text = shorten(headline, room) + tail;
  }
  return { body: text, chars: text.length, hashtags: tags };
}

export function buildComment({ partnerUrl = "", articleUrl = "" }) {
  const url = partnerUrl || articleUrl;
  if (!url) return "📎 기사 링크를 불러오면 여기에 표시됩니다.";
  const suffix = partnerUrl ? "" : "\n(파트너 코드를 넣으면 내 뉴스픽 링크로 바뀝니다)";
  return `📎 기사 전문 보기 👉 ${url}${suffix}`;
}

/* ------------------------------------------------------------------ *
 * 6. 초안 조립
 * ------------------------------------------------------------------ */

export function detectSite(html, url) {
  const siteName = extractMeta(html, ["og:site_name", "application-name"]);
  if (siteName) return siteName;
  if (isNewspicUrl(url)) return "뉴스픽";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

export function buildDraft(input = {}) {
  const {
    title = "",
    description = "",
    body = "",
    url = "",
    image = "",
    site = "",
    publishedAt = "",
    partner = null,
    fetched = false,
    warnings = [],
    presetId = "",
  } = input;

  const cleanTitle = shorten(title || "", 120);
  const cleanBody = String(body || "").slice(0, 20000);
  const cuts = buildCuts({ title: cleanTitle, description, body: cleanBody });
  const partnerUrl = mergePartnerUrl(url, partner);
  const thread = buildThread({ title: cleanTitle, cuts, site });
  const comment = buildComment({ partnerUrl, articleUrl: url });

  return {
    ok: true,
    presetId,
    fetched,
    source: {
      title: cleanTitle,
      description: normalizeSpace(description || "").slice(0, 400),
      body: cleanBody,
      url,
      partnerUrl,
      image,
      site,
      publishedAt,
      nid: extractNid(url),
      partnerCode: partner && partner.code ? partner.code : "",
    },
    cuts,
    thread: { body: thread.body, chars: thread.chars, hashtags: thread.hashtags },
    comment,
    warnings: warnings.slice(0, 5),
  };
}

/* ------------------------------------------------------------------ *
 * 7. 미러링 허브용 확장 (이미지·바이라인·식별자)
 * ------------------------------------------------------------------ */

/** 상대 경로 이미지 주소를 절대 주소로 바꾼다. */
export function absoluteUrl(src, base) {
  const raw = normalizeSpace(src || "");
  if (!raw) return "";
  try {
    return new URL(raw, base || "https://www.newspic.kr").toString();
  } catch (e) {
    return raw;
  }
}

/* ------------------------------------------------------------------ *
 * 기사 본문 이미지 — 사이드바·추천기사·광고 썸네일을 걷어낸다
 * ------------------------------------------------------------------ */

/* 파일명·경로로 걸러지는 것: 로고, 아이콘, 추적 픽셀, 광고, 프로필·기자 사진, 기본 썸네일 */
const IMAGE_SKIP =
  /(?:logo|wordmark|icon|blank|spacer|btn_|button|sprite|pixel|tracking|ad_|\/ads?\/|banner|profile|reporter|author_?thumb|avatar|promotion|promo_|default_|noimg|no_img|placeholder|transparent|sns_|share_|subscribe)/i;

/* 이미지 앞쪽 HTML 문맥으로 걸러지는 것: 관련기사·추천·인기·사이드바·푸터·광고 영역 */
const IMAGE_CONTEXT_NOISE =
  /(related|recommend|sidebar|side-?bar|aside|footer|popular|most[_-]?viewed|mostview|ranking|hotnews|hot_news|news_?list|list-type|thumbnail[_-]?list|item-box|swiper|news-con|sns|share|subscribe|banner|advert|promo|관련\s*기사|추천\s*기사|인기\s*기사|많이\s*본|광고|배너|구독)/i;

/* alt/제목이 이런 값이면 기사 사진이 아니다 (로고·아이콘·광고류만) */
const IMAGE_ALT_NOISE = /^(?:로고|아이콘|광고|배너|기사\s*이미지\s*없음|no\s*image|logo|icon|ad|banner|spacer|blank)$/i;

function tagAttribute(tag, names) {
  for (const name of names) {
    const re = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))", "i");
    const m = re.exec(tag);
    if (m) return decodeEntities(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  return "";
}

function isNoiseImageUrl(url) {
  if (!url) return true;
  if (!/^https?:/i.test(url)) return true;
  if (/\.(gif|svg)(\?|$)/i.test(url)) return true;
  if (/\{\{|%7B%7B|image_profile|noimg|default_|placeholder/i.test(url)) return true;
  if (/facebook\.com\/tr|google-analytics|doubleclick|googletagmanager/i.test(url)) return true;
  return IMAGE_SKIP.test(url);
}

/** <img> 태그 앞쪽 HTML에서 아직 열려 있는 컨테이너 태그(클래스 포함)를 모은다. */
function containerChain(before) {
  const window = String(before || "").slice(-1500);
  const re = /<(?:section|aside|li|ul|ol|div|figure|header|footer)\b[^>]*>/gi;
  const opens = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(window))) opens.push(m[0]);
  return opens.slice(-8).join(" ");
}

function insideListItem(before) {
  const window = String(before || "").slice(-2000);
  const open = window.lastIndexOf("<li");
  if (open < 0) return false;
  return open > window.lastIndexOf("</li>");
}

/** 아직 닫히지 않은 가장 가까운 <section>/<aside> 태그(클래스 포함).
 *  핫뉴스·관련기사 블록은 <section class="box-hotnews01"> 같은 큰 껍데기 안에 있어서
 *  가까운 div 만 보면 놓친다. */
function nearestSectionTag(before) {
  const window = String(before || "").slice(-6000);
  const re = /<(section|aside)\b[^>]*>/gi;
  let m;
  let last = "";
  let lastIndex = -1;
  while ((m = re.exec(window))) {
    last = m[0];
    lastIndex = m.index;
  }
  if (!last) return "";
  const name = /^<(\w+)/.exec(last)[1].toLowerCase();
  if (new RegExp("</" + name + ">", "i").test(window.slice(lastIndex + last.length))) return "";
  return last;
}

/** <img> 태그 하나가 기사 사진인지 판단한다. context 는 태그 앞쪽 HTML. */
function imageTagVerdict(tag, url, context = "", opts = {}) {
  if (isNoiseImageUrl(url)) return false;
  const width = Number(tagAttribute(tag, ["width"])) || 0;
  const height = Number(tagAttribute(tag, ["height"])) || 0;
  if ((width && width < 120) || (height && height < 90)) return false;
  const alt = normalizeSpace(tagAttribute(tag, ["alt", "title"]));
  if (alt && alt.length <= 8 && IMAGE_ALT_NOISE.test(alt)) return false;
  const chain = containerChain(context);
  if (IMAGE_CONTEXT_NOISE.test(chain)) return false;
  if (IMAGE_CONTEXT_NOISE.test(nearestSectionTag(context))) return false;
  if (!opts.requireContainer) return true;
  /* 문서 전체를 훑을 때는 목록(<li>) 아이템과 사진 블록만 허용 — 사이드바·핫뉴스 목록을 건진다. */
  if (insideListItem(context)) return false;
  const tail = String(context || "").slice(-320);
  const insideFigure = tail.lastIndexOf("<figure") > tail.lastIndexOf("</figure>");
  const insidePicture = tail.lastIndexOf("<picture") > tail.lastIndexOf("</picture>");
  const photoBlock = /(?:class\s*=\s*["'][^"']*(?:photo|img|image|pic)[^"']*["']|data-pop-open|itemprop\s*=\s*["']image)/i.test(tail);
  return insideFigure || insidePicture || photoBlock;
}

/** 본문 안의 <img> 주소를 모은다. (4컷 배경 후보 — 최대 limit 장)
 *  opts.requireContainer: 문서 전체를 훑을 때 사진 블록 안의 이미지만 허용
 */
export function extractInlineImages(bodyHtml, base, limit = 8, opts = {}) {
  const out = [];
  const source = String(bodyHtml || "");
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(source))) {
    const tag = m[0];
    const srcMatch = /\b(?:data-src|data-original|data-lazy-src|data-lazy|src)\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!srcMatch) continue;
    const url = decodeEntities(absoluteUrl(srcMatch[1], base));
    if (!imageTagVerdict(tag, url, source.slice(0, m.index), opts)) continue;
    if (out.includes(url)) continue;
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

/** 같은 사진이 CDN 서브도메인만 다르게 중복되는 경우를 묶기 위한 키. */
function imageKey(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length > 12 ? parsed.pathname + parsed.search : parsed.hostname + parsed.pathname;
  } catch (e) {
    return url;
  }
}

/**
 * 기사 이미지 목록을 만든다.
 *  1) 대표 이미지(og:image/twitter:image) — 유효할 때만, 목록 맨 앞
 *  2) 기사 본문 영역(bodyHtml) 안의 사진
 *  3) 본문 사진이 2장 미만일 때만 문서 전체에서 사진 블록 안의 이미지를 보강
 * 사이드바·추천기사·관련기사·광고·아이콘·로고·추적 픽셀은 포함하지 않는다.
 */
export function extractArticleImages({ bodyHtml = "", html = "", ogImage = "", base = "", limit = 8, ogWidth = 0 } = {}) {
  const body = extractInlineImages(bodyHtml, base, limit);
  const out = [];
  const seen = new Set();
  const push = (url) => {
    if (!url) return;
    const key = imageKey(url);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(url);
  };

  const og = absoluteUrl(ogImage, base);
  const ogValid = og && !isNoiseImageUrl(og) && (!ogWidth || ogWidth >= 400);
  if (ogValid) push(og);
  for (const url of body) push(url);

  if (out.length < Math.min(3, limit)) {
    for (const url of extractInlineImages(html, base, limit * 2, { requireContainer: true })) push(url);
  }
  return out.slice(0, limit);
}

/** 기사 작성자(바이라인)를 찾는다. */
export function extractAuthor(html) {
  const meta = extractMeta(html, [
    "article:author",
    "og:article:author",
    "author",
    "dcterms.creator",
    "byl",
  ]);
  if (meta) return normalizeSpace(meta).replace(/^https?:\/\/\S+$/i, "").slice(0, 60);
  const byline = /<[^>]+class\s*=\s*["'][^"']*(?:byline|reporter|writer|author)[^"']*["'][^>]*>([\s\S]{0,180}?)<\/[^>]+>/i.exec(
    String(html || "")
  );
  if (byline) {
    const text = normalizeSpace(stripHtml(byline[1]));
    if (text && text.length <= 60) return text;
  }
  return "";
}

/** 문자열 → 짧고 안정된 해시 (기사 id 용) */
export function hashString(input) {
  const source = String(input || "");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 10);
}

export function makeArticleId(url, title) {
  const nid = extractNid(url);
  if (nid) return "n" + nid;
  return "h" + hashString(normalizeSpace(url) || normalizeSpace(title));
}
