/* 뉴스픽 스튜디오 | 기사 본문 → 영문 이미지 프롬프트
 *
 * 이미지 생성 모델(flux-1-schnell · Pollinations · BYOK)은 한글을 이해하지 못한다.
 * 그래서 기사 본문(제목+본문)과 컷/카드 문장을 '영문 시각 장면'으로 옮긴 뒤 이미지를 만든다.
 *
 *  - Workers AI 텍스트 모델이 있으면: 한국어 문맥을 읽어 컷/카드마다 다른 영문 장면을 쓴다.
 *  - 모델이 없거나 실패하면: 아래 시각 사전(TOPIC_SCENES)으로 결정적인 영문 프롬프트를 만든다.
 *    (한글은 절대 프롬프트에 들어가지 않는다 — sanitizePrompt가 마지막으로 막는다.)
 *
 * 서버(Pages Functions)와 테스트(Node)에서 함께 쓰는 순수 함수 모음.
 */

export const PROMPT_STYLES = {
  photo:
    "photorealistic editorial news photograph, 35mm lens, natural cinematic light, shallow depth of field, ultra detailed, muted color grade",
  ghibli:
    "Studio Ghibli inspired watercolor animation still, hand-painted gouache background, soft warm light, fluffy cumulus clouds, gentle nostalgic mood, clean cel shading",
  webtoon:
    "Korean webtoon digital illustration, crisp ink linework, cel shading, expressive characters, pastel palette, vertical comic composition",
  issuetoon:
    "bold editorial newspaper cartoon illustration, thick black outlines, flat saturated colors, halftone texture, satirical poster composition",
};

export const PROMPT_GUARD =
  "no text, no letters, no words, no watermark, no logo, no caption, no signage";

/* ------------------------------------------------------------------ *
 * 1. 한글 차단
 * ------------------------------------------------------------------ */

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7FF]/;

export function hasHangul(text) {
  return HANGUL.test(String(text || ""));
}

/** 한글·전각 문자·이모지를 걷어내고 영문/숫자/기본 문장부호만 남긴다. */
export function stripHangul(text) {
  return String(text || "")
    .replace(/[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7FF]+/g, " ")
    .replace(/[^\x20-\x7E\n]+/g, " ")
    .replace(/\s*,\s*(?:,\s*)+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function words(text) {
  return String(text || "").split(/\s+/).filter(Boolean);
}

/**
 * 프롬프트에서 한글을 지우고, 너무 짧아지면 안전한 영문 기본 장면으로 바꾼다.
 * 마지막에 '글자 금지' 가드를 붙인다.
 */
export function sanitizePrompt(prompt, fallback = "") {
  const cleaned = stripHangul(prompt);
  const base = words(cleaned).length >= 6 ? cleaned : stripHangul(fallback);
  const safe = words(base).length >= 6 ? base : DEFAULT_SCENE;
  const body = safe.length > 900 ? safe.slice(0, 900).trim() : safe;
  return /no text/i.test(body) ? body : body.replace(/[,\s]+$/, "") + ", " + PROMPT_GUARD;
}

/* ------------------------------------------------------------------ *
 * 2. 한국어 뉴스 → 영문 시각 장면 사전
 * ------------------------------------------------------------------ */

const DEFAULT_SCENE =
  "a modern Korean city street at dusk, office towers and street lamps, pedestrians walking past shop windows";

/* test: 제목·본문에서 찾을 한국어 표현 / scene: 그 주제를 설명하는 영문 장면 */
const TOPIC_SCENES = [
  { test: /전기요금|전력|누진|한전|에너지\s*요금|kWh/i, scene: "a Korean apartment living room with a running air conditioner, a home electricity meter and a stack of utility bills on the table" },
  { test: /가스요금|난방|보일러|도시가스/i, scene: "a winter apartment interior with a gas boiler controller on the wall, warm radiator and a heating bill on the table" },
  { test: /금리|기준금리|한국은행|통화정책|대출|예금|적금/i, scene: "a bank branch interior with a rate board, an advisor and a customer reviewing loan documents across a desk" },
  { test: /주식|증시|코스피|코스닥|투자|펀드|환율/i, scene: "a trading desk with multiple market screens showing rising and falling charts, a trader watching intently" },
  { test: /부동산|집값|아파트|전세|월세|분양|청약|재건축|재개발/i, scene: "a row of Korean apartment towers under construction cranes, a real estate agency window with property listings" },
  { test: /물가|소비자물가|장바구니|유가|기름값|인상/i, scene: "a Korean supermarket aisle with price tags on shelves, a shopper comparing products with a basket" },
  { test: /세금|세수|예산|국세청|종부세|감면/i, scene: "a government office desk with tax forms, a calculator and a stamp, civil servants working in the background" },
  { test: /반도체|삼성전자|SK하이닉스|파운드리|웨이퍼/i, scene: "a semiconductor cleanroom with glowing silicon wafers and technicians in white protective suits" },
  { test: /배터리|전기차|충전소|2차전지|리튬/i, scene: "an electric vehicle charging station with a car plugged in, battery cells displayed in a bright lab" },
  { test: /수출|무역|관세|통상|FTA|수입|수출입|항로|공급망|해운|선박|물류|항만|조선/i, scene: "a busy container port with stacked shipping containers, gantry cranes and a cargo ship being loaded" },
  { test: /인공지능|AI|챗봇|데이터센터|클라우드|알고리즘/i, scene: "a data center aisle with glowing server racks, an engineer reviewing a holographic interface" },
  { test: /로봇|자동화|휴머노이드|드론/i, scene: "a robotics lab where a humanoid robot arm is tested, engineers with tablets watching" },
  { test: /스마트폰|통신|5G|6G|요금제|갤럭시|아이폰/i, scene: "a person holding a modern smartphone in a bright electronics store, device displays glowing behind" },
  { test: /국회|여당|야당|법안|탄핵|국정감사/i, scene: "the Korean National Assembly chamber, legislators seated at desks with microphones and a raised podium" },
  { test: /대통령|청와대|용산|정부|장관|총리/i, scene: "a government briefing room with a podium and flag, reporters raising cameras and microphones" },
  { test: /선거|투표|후보|여론조사|지방선거/i, scene: "a polling station with a ballot box and a voter casting a ballot behind a screen, campaign posters blurred" },
  { test: /검찰|법원|재판|구속|기소|판결|선고/i, scene: "a Korean courthouse corridor with a defendant walking between guards, photographers with cameras" },
  { test: /경찰|수사|범죄|마약|사기|횡령/i, scene: "police officers examining evidence on a table in a bright investigation room, case files and photos" },
  { test: /사고|화재|산불|폭발|붕괴|참사/i, scene: "firefighters in protective gear at a smoky accident site, emergency lights reflecting on wet asphalt" },
  { test: /태풍|폭우|홍수|장마|한파|폭염|가뭄/i, scene: "a rain-soaked Korean street with umbrellas and flooded pavement, dark storm clouds overhead" },
  { test: /지진|쓰나미|재난|대피/i, scene: "rescue workers in orange suits searching rubble, emergency tents and vehicles in the background" },
  { test: /의료|병원|응급실|의사|간호|수술|진료/i, scene: "a hospital corridor with medical staff in scrubs, an emergency room desk and waiting patients" },
  { test: /백신|독감|감기|코로나|바이러스|방역/i, scene: "a nurse preparing a vaccine syringe in a bright clinic, a patient seated beside a window" },
  { test: /건강|수면|비만|다이어트|운동|스트레스/i, scene: "a person jogging along a riverside park at sunrise, healthy breakfast and a water bottle on a table" },
  { test: /교육|입시|수능|학원|학교|교사|대학/i, scene: "a Korean classroom with students at desks and a teacher at the blackboard, sunlight through windows" },
  { test: /육아|출산|보육|아이|유치원|초등/i, scene: "a parent walking a small child to a kindergarten gate, colorful playground equipment behind" },
  { test: /노동|임금|최저임금|파업|노조|근로/i, scene: "factory workers in uniforms gathered for a meeting, a labor union banner blurred in the background" },
  { test: /취업|구직|채용|실업|청년/i, scene: "young job seekers at a hiring fair, booths and interview tables in a large hall" },
  { test: /창업|스타트업|벤처|투자유치/i, scene: "a small startup office with whiteboards full of diagrams, young founders working at laptops" },
  { test: /농업|농민|쌀|채소|과일|가축|축산/i, scene: "a Korean farm field at golden hour with rows of crops and a farmer carrying a basket" },
  { test: /식품|음식|외식|배달|요리|김장/i, scene: "a warm Korean kitchen with steaming pots, fresh ingredients on a wooden table and hands preparing food" },
  { test: /여행|관광|호텔|항공|공항|휴가/i, scene: "travelers with luggage in a bright airport terminal, an airplane visible through the window" },
  { test: /캠핑|등산|자연|숲|바다|공원/i, scene: "a tent in a green forest campsite at dawn, mist between pine trees and a mountain lake" },
  { test: /반려동물|강아지|고양이|유기견/i, scene: "a person playing with a dog in a sunny park, a cat resting by a window indoors" },
  { test: /문화|공연|전시|미술|박물관|축제/i, scene: "a brightly lit art museum gallery with visitors viewing large paintings, a concert stage in the distance" },
  { test: /드라마|영화|아이돌|K팝|예능|방송|연예/i, scene: "a television studio set with cameras and stage lights, a performer standing under a spotlight" },
  { test: /축구|야구|배구|농구|올림픽|월드컵/i, scene: "a packed sports stadium at night, floodlights on the field and fans cheering with flags" },
  { test: /날씨|기상|미세먼지|대기질|황사/i, scene: "a city skyline under a hazy sky, a person wearing a mask checking a weather app on a phone" },
  { test: /교통|지하철|버스|도로|운전|주차/i, scene: "a busy Seoul subway platform with commuters waiting, a city bus on a rainy avenue" },
  { test: /인구|저출생|고령화|노인|복지|연금/i, scene: "a multigenerational Korean family walking in a park, an elderly couple sitting on a bench" },
  { test: /환경|기후|탄소|재활용|오염|친환경/i, scene: "wind turbines and solar panels on a green hillside, a person sorting recycling bins" },
  { test: /안보|국방|군대|미사일|북한|한미/i, scene: "soldiers standing in formation on a training field, armored vehicles and a foggy horizon" },
  { test: /외교|정상회담|미국|중국|일본|러시아/i, scene: "an international summit room with two leaders at a long table and national flags, press cameras" },
];

/** 제목+본문에서 주제 장면을 (앞에서부터) 최대 limit개 고른다. */
export function topicScenes(article, limit = 2) {
  const text = [article && article.title, article && article.subtitle, article && article.body]
    .filter(Boolean)
    .join(" ")
    .slice(0, 6000);
  const out = [];
  for (const item of TOPIC_SCENES) {
    if (out.length >= limit) break;
    if (item.test.test(text) && !out.includes(item.scene)) out.push(item.scene);
  }
  return out;
}

/* 제목의 영문 핵심 명사 — 시각 사전에 없는 주제를 최소한의 단서로 쓴다. */
const KEYWORD_EN = {
  전기요금: "electricity bills", 전기: "electricity", 누진제: "tiered utility pricing", 요금: "utility rates",
  금리: "interest rates", 대출: "loans", 예금: "bank deposits", 환율: "exchange rates", 물가: "inflation",
  세수: "tax revenue", 예산: "government budget", 부동산: "real estate", 집값: "home prices", 아파트: "apartment towers",
  전세: "jeonse housing leases", 월세: "monthly rent", 분양: "housing presales", 청약: "housing subscriptions",
  재건축: "redevelopment", 반도체: "semiconductors", 배터리: "batteries", 전기차: "electric vehicles",
  인공지능: "artificial intelligence", 로봇: "robots", 스타트업: "startups", 클라우드: "cloud computing",
  스마트폰: "smartphones", 통신: "telecom networks", 수출: "exports", 무역: "trade", 관세: "tariffs", 유가: "oil prices",
  국회: "the national assembly", 정부: "the government", 대통령: "the president", 선거: "elections", 장관: "ministers",
  의료: "healthcare", 병원: "hospitals", 백신: "vaccines", 독감: "flu season", 건강: "public health", 수면: "sleep",
  비만: "obesity", 응급실: "emergency rooms", 드라마: "TV dramas", 아이돌: "K-pop idols", 영화: "films",
  공연: "live performances", 예능: "variety shows", 축구: "football", 야구: "baseball", 배구: "volleyball",
  골프: "golf", 김장: "kimchi making", 난방: "home heating", 반려동물: "pets", 캠핑: "camping", 여행: "travel",
  도서관: "libraries", 미국: "the United States", 중국: "China", 일본: "Japan", 유럽: "Europe", 중동: "the Middle East",
  지원금: "subsidy programs", 보조금: "government subsidies", 취약계층: "vulnerable households", 신청: "applications",
  절감: "cost savings", 인상: "price increases", 인하: "price cuts", 발표: "an official announcement",
  계획: "a government plan", 전망: "an outlook report", 피해: "damage reports", 대응: "an emergency response",
};

function englishKeywords(article, limit = 3) {
  const title = String((article && article.title) || "");
  const tokens = title.split(/[^가-힣A-Za-z0-9]+/).filter(Boolean);
  const out = [];
  for (const token of tokens) {
    const direct = KEYWORD_EN[token];
    if (direct && !out.includes(direct)) {
      out.push(direct);
      continue;
    }
    for (const [key, value] of Object.entries(KEYWORD_EN)) {
      if (token.includes(key) && !out.includes(value)) out.push(value);
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** 기사 한 편의 영문 핵심 시각 소재 (장면 + 키워드). */
export function articleVisuals(article) {
  const scenes = topicScenes(article, 2);
  const keywords = englishKeywords(article, 3);
  return {
    scenes: scenes.length ? scenes : [DEFAULT_SCENE],
    keywords,
  };
}

/* ------------------------------------------------------------------ *
 * 3. 컷·카드별 장면
 * ------------------------------------------------------------------ */

const CUT_SHOTS = [
  { lead: "wide establishing shot", mood: "curious, eye-catching opening" },
  { lead: "medium shot", mood: "clear and factual, documentary tone" },
  { lead: "close-up detail shot", mood: "surprising, slightly off-balance angle" },
  { lead: "calm forward-looking shot", mood: "resolved and thoughtful" },
];

const CUT_FOCUS = [
  "a passerby stopping to look, surprised expression",
  "documents and a chart laid out on a desk, hands pointing at a figure",
  "a telling detail that changes the story, contrasting light and shadow",
  "people walking on with their day, warm late afternoon light",
];

const CARD_SHOTS = {
  cover: { lead: "wide cinematic establishing shot", focus: "generous open space at the top, uncluttered background", mood: "dramatic first impression" },
  summary: { lead: "editorial triptych composition", focus: "three everyday moments that summarize the story", mood: "clean and organized" },
  background: { lead: "medium environmental shot", focus: "city skyline and commuting crowd setting the backstory", mood: "reflective" },
  numbers: { lead: "top-down desk shot", focus: "abstract bar and line chart shapes without any labels, a calculator and coins", mood: "analytical" },
  facts: { lead: "close-up desk shot", focus: "documents, a smartphone and a pen arranged neatly", mood: "trustworthy" },
  detail: { lead: "macro close-up", focus: "a hand pointing at a printed page, shallow focus", mood: "intimate detail" },
  issue: { lead: "two-shot conversation", focus: "two people across a table, one gesturing while the other listens", mood: "tension and debate" },
  comparison: { lead: "split composition", focus: "left side bright and warm, right side cool shadow, same scene twice", mood: "contrast" },
  checklist: { lead: "morning desk shot", focus: "a hand ticking items in a notebook beside a coffee cup", mood: "practical and calm" },
  cta: { lead: "lifestyle shot", focus: "a person holding a smartphone in a cozy cafe, screen glow on the face", mood: "inviting" },
};

const KIND_BY_LABEL = {
  표지: "cover", 요약: "summary", 배경: "background", 숫자: "numbers", "핵심 팩트": "facts",
  디테일: "detail", 쟁점: "issue", 비교: "comparison", 체크리스트: "checklist", CTA: "cta",
};

function stylePrompt(styleId) {
  return PROMPT_STYLES[styleId] || PROMPT_STYLES.photo;
}

function joinParts(parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

/** 4컷 한 컷의 영문 프롬프트 (한글 없음). */
export function buildCutPrompt({ cut, article, styleId = "photo", variant = 0 } = {}) {
  const visuals = articleVisuals(article || {});
  const index = Math.max(0, Math.min(3, Number(cut && cut.index ? cut.index - 1 : 0)));
  const shot = CUT_SHOTS[(index + variant) % CUT_SHOTS.length];
  const scene = visuals.scenes[index % visuals.scenes.length];
  const focus = CUT_FOCUS[(index + variant) % CUT_FOCUS.length];
  const keywords = visuals.keywords.length ? "focus on " + visuals.keywords[index % visuals.keywords.length] : "";
  return sanitizePrompt(
    joinParts([shot.lead, scene, focus, keywords, shot.mood, stylePrompt(styleId)]),
    joinParts([DEFAULT_SCENE, focus, stylePrompt(styleId)])
  );
}

/** 카드 한 장의 영문 프롬프트 (한글 없음). */
export function buildCardPrompt({ card, article, styleId = "photo", index = 0, total = 8 } = {}) {
  const visuals = articleVisuals(article || {});
  const kind = (card && card.kind) || KIND_BY_LABEL[card && card.kindLabel] || "facts";
  const shot = CARD_SHOTS[kind] || CARD_SHOTS.facts;
  const scene = visuals.scenes[index % visuals.scenes.length];
  const keywords = visuals.keywords.length ? "focus on " + visuals.keywords[index % visuals.keywords.length] : "";
  const cover = kind === "cover" ? "vertical composition" : total > 6 ? "centered subject, clean background" : "";
  return sanitizePrompt(
    joinParts([shot.lead, scene, shot.focus, keywords, shot.mood, cover, stylePrompt(styleId)]),
    joinParts([DEFAULT_SCENE, shot.focus, stylePrompt(styleId)])
  );
}

/** 컷 4개 + 카드 N장의 폴백 프롬프트를 만든다. */
export function buildPrompts({ article, cuts = [], cards = [], styleId = "photo" } = {}) {
  const cutPrompts = cuts.map((cut, index) =>
    buildCutPrompt({ cut: { ...cut, index: cut.index || index + 1 }, article, styleId })
  );
  const cardPrompts = cards.map((card, index) =>
    buildCardPrompt({ card, article, styleId, index, total: cards.length })
  );
  return { cutPrompts, cardPrompts };
}

/* ------------------------------------------------------------------ *
 * 4. Workers AI 텍스트 모델로 장면 다듬기
 * ------------------------------------------------------------------ */

/** 모델에 넣을 한국어 문맥 (짧게). */
export function promptContext({ article, cuts = [], cards = [], styleId = "photo" } = {}) {
  const body = String((article && article.body) || "").replace(/\s+/g, " ").slice(0, 1200);
  return {
    title: String((article && article.title) || "").slice(0, 200),
    summary: String((article && article.subtitle) || "").slice(0, 300),
    body,
    style: styleId,
    styleLine: stylePrompt(styleId),
    cuts: cuts.map((cut, index) => ({
      n: index + 1,
      role: cut.roleLabel || cut.role || "",
      line: String(cut.narration || "").slice(0, 160),
    })),
    cards: cards.map((card, index) => ({
      n: index + 1,
      kind: card.kindLabel || card.kind || "",
      title: String(card.title || "").slice(0, 80),
      lines: (card.lines || []).join(" ").slice(0, 200),
    })),
  };
}

export function promptMessages(context) {
  const items = [
    ...context.cuts.map((cut) => `CUT ${cut.n} (${cut.role}): ${cut.line}`),
    ...context.cards.map((card) => `CARD ${card.n} (${card.kind}): ${card.title} — ${card.lines}`),
  ];
  const system =
    "You are a photo director for Korean news. You turn Korean news items into prompts for a text-to-image model. " +
    "You describe only real-world photographic scenes. Every answer must be English only. Never output Korean characters.";
  const user = [
    `ARTICLE TITLE: ${context.title}`,
    context.summary ? `SUMMARY: ${context.summary}` : "",
    context.body ? `BODY: ${context.body}` : "",
    "",
    "For each item below, write ONE English image prompt of at most 35 words describing a real photograph that illustrates that item.",
    "Include: the place or setting, the main people or objects, what they are doing, the light and mood, and the camera framing.",
    "Hard rules:",
    "- The picture must contain NO writing of any kind. Never describe text, letters, numbers, headlines, captions, titles, banners, signs, posters, screens with words, logos or watermarks.",
    "- Never quote or mention wording from the article. Do not describe a chart or dashboard with labels.",
    "- Do not describe a card, poster or infographic layout. Describe the real scene behind the news instead.",
    "- Each item must show a DIFFERENT moment of the story.",
    `End every prompt with this style: ${context.styleLine}`,
    "",
    ...items,
    "",
    `Return JSON only, exactly this shape: {"prompts":["...", "..."]} with ${items.length} strings in the same order.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
  return { system, user };
}

/** 모델이 이미지 안의 글자를 그리라고 한 프롬프트인지 (이런 프롬프트는 버린다) */
const TEXTUAL_PROMPT =
  /["“”'‘’]|\b(?:headline|headlines|reading|reads|text|lettering|letters|words?|caption|subtitles?|titles?|banners?|signage|signs?|posters?|slogans?|labels?|labelled|labeled|logo|watermark|infographic|screenshot|spelling|written)\b/i;

export function looksTextual(prompt) {
  return TEXTUAL_PROMPT.test(String(prompt || ""));
}

/** 모델 응답에서 JSON 문자열 배열을 꺼낸다. */
export function parsePromptArray(text, expected) {
  const raw = String(text || "");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed.map((item) => (typeof item === "string" ? item : item && item.prompt) || "");
    } catch (e) {
      /* 아래 정규식으로 재시도 */
    }
  }
  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      const parsed = JSON.parse(raw.slice(objectStart, objectEnd + 1));
      if (parsed && Array.isArray(parsed.prompts)) return parsed.prompts.map((item) => (typeof item === "string" ? item : "") || "");
    } catch (e) {
      /* 무시 */
    }
  }
  const quoted = [...raw.matchAll(/"([^"\\]{20,400})"/g)].map((match) => match[1]);
  return quoted.length >= Math.min(expected, 2) ? quoted : [];
}

/* Workers AI 텍스트 모델 — 앞에서부터 동작하는 것을 쓴다. */
export const TEXT_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/qwen/qwen2.5-7b-instruct",
  "@cf/meta/llama-3.2-3b-instruct",
];

export function modelOutputText(output) {
  if (!output) return "";
  if (typeof output === "string") return output;
  if (typeof output.response === "string") return output.response;
  if (output.result && typeof output.result.response === "string") return output.result.response;
  if (Array.isArray(output.choices) && output.choices[0]) {
    const choice = output.choices[0];
    return (choice.message && choice.message.content) || choice.text || "";
  }
  return "";
}
