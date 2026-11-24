/* 뉴스픽 스튜디오 | 화면 컨트롤러
 * 1) 미러링 허브 → 2) 4컷 → 3) 카드뉴스 8장 → 4) 6개 채널
 */
import {
  CARD_COUNTS,
  CARD_KIND_LABELS,
  IMAGE_MODES,
  PARTNER_TRACKING,
  PLATFORMS,
  STYLES,
  applyAccounts,
  buildCards,
  buildChannels,
  buildHashtags,
  buildStoryboard,
  buildZip,
  cutPrompt,
  cardImagePrompt,
  extractKeywords,
  finishSentence,
  keywordPromptLine,
  normalizeAccount,
  partnerLinkFor,
  shortTitle,
  isNoiseLine,
  shorten,
} from "./plan.js";
import { loadImage, renderCutCanvas, renderSheet, styleTheme } from "./canvas.js";
import { CARD_SCALES, canvasToBytes, ratioInfo, renderCardCanvas } from "./cards.js";
import { recordSlideshow, videoSupported } from "./video.js";

const LS = {
  prefs: "newspic-studio:prefs",
  byok: "newspic-studio:byok",
  archive: "newspic-studio:archive",
  last: "newspic-studio:last-article",
  accounts: "newspic-studio:accounts",
  guest: "newspic-studio:guest",
};

const KIND_LABEL = {
  cover: "표지 훅",
  summary: "3줄 요약",
  background: "배경",
  numbers: "숫자",
  facts: "핵심 팩트",
  detail: "디테일",
  issue: "쟁점",
  comparison: "비교",
  checklist: "체크리스트",
  cta: "CTA",
};

const state = {
  article: null,
  articleImages: [],
  cuts: [],
  cards: [],
  baseCards: [],
  channels: {},
  activePlatform: "threads",
  style: "photo",
  imageMode: "article",
  cardImageMode: "article",
  layout: "grid",
  cardTheme: "magazine",
  cardCount: 8,
  cardLayout: "split",
  ratio: "4:5",
  activeCard: 0,
  images: {},
  imageMeta: {},
  cardImages: [],
  cardImageMeta: [],
  proxyCache: {},
  promptSource: "",
  promptToken: 0,
  articleImageEl: null,
  partnerCode: "",
  storage: "unknown",
  archive: [],
  byok: { provider: "free", openai: "", gemini: "", model: "" },
  slideshowUrl: "",
  selectedChannels: ["threads", "instagram", "facebook", "x", "tiktok"],
  accounts: {},
  auth: {
    checked: false,
    authenticated: false,
    mode: "anonymous",
    user: null,
    providers: {},
    oauthConfigured: false,
    storage: "none",
    message: "",
  },
  keywordOff: [],
  feed: { category: "all", items: [], loading: false, fallback: false, loaded: false, error: "", partners: false },
  auto: {
    enabled: false,
    minutes: 5,
    preset: 5,
    outputs: { cards: true, cuts: true },
    nextAt: 0,
    timer: null,
    running: false,
    queue: [],
    used: new Set(),
  },
  busy: false,
};

/* ------------------------------------------------------------------ *
 * 작은 도구
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function toast(message, kind = "") {
  const node = $("studioToast");
  node.textContent = message;
  node.className = "toast " + kind;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.hidden = true;
  }, 3600);
}

async function api(path, options = {}) {
  const init = { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } };
  const response = await fetch(path, init);
  let data = {};
  try {
    data = await response.json();
  } catch (e) {
    data = {};
  }
  return { status: response.status, data };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 6000);
}

async function copyText(text, message = "복사했습니다.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, "ok");
    return true;
  } catch (e) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      toast(ok ? message : "복사하지 못했습니다. 직접 선택해 주세요.", ok ? "ok" : "err");
      return ok;
    } catch (error) {
      toast("복사하지 못했습니다. 직접 선택해 주세요.", "err");
      return false;
    }
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function todayStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function setProgress(node, fraction, visible = true) {
  node.hidden = !visible;
  const bar = node.querySelector(".bar");
  const label = node.querySelector("span");
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  if (bar) bar.style.setProperty("--p", percent + "%");
  if (label) label.textContent = percent + "%";
}

function kindLabel(kind) {
  return KIND_LABEL[kind] || kind;
}

/* ------------------------------------------------------------------ *
 * 탭
 * ------------------------------------------------------------------ */

function showTab(name) {
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  $$(".panel").forEach((panel) => {
    const active = panel.id === "tab-" + name;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ------------------------------------------------------------------ *
 * 아카이브 (KV 또는 브라우저)
 * ------------------------------------------------------------------ */

function localArchive() {
  return readJson(LS.archive, []);
}

function saveLocalArticle(article) {
  const items = localArchive().filter((item) => item.id !== article.id);
  items.unshift(article);
  writeJson(LS.archive, items.slice(0, 40));
}

function removeLocalArticle(id) {
  writeJson(LS.archive, localArchive().filter((item) => item.id !== id));
}

function setStoragePill() {
  const pill = $("storagePill");
  if (state.storage === "kv") {
    pill.textContent = "아카이브 · KV";
    pill.className = "pill";
    pill.title = "Cloudflare KV(newspic-studio-kv)에 저장됩니다.";
  } else if (state.storage === "local") {
    pill.textContent = "아카이브 · 브라우저";
    pill.className = "pill local";
    pill.title = "KV 연결이 없어 이 브라우저(localStorage)에 저장합니다.";
  } else {
    pill.textContent = "아카이브 확인 중…";
    pill.className = "pill";
  }
}

async function refreshArchive(query = "") {
  const term = query.trim();
  const result = await api("/api/mirror" + (term ? "?q=" + encodeURIComponent(term) : ""));
  if (result.data.ok && result.data.storage === "kv") {
    state.storage = "kv";
    state.archive = result.data.items || [];
  } else {
    state.storage = "local";
    const items = localArchive();
    state.archive = term
      ? items.filter((item) => [item.title, item.subtitle, item.site, item.body].join(" ").toLowerCase().includes(term.toLowerCase()))
      : items;
  }
  setStoragePill();
  renderArchive(term);
}

function renderArchive(term = "") {
  const list = $("archiveList");
  list.textContent = "";
  const items = state.archive;
  $("archiveCount").textContent = items.length ? `${items.length}건` : "0";
  $("archiveEmpty").hidden = items.length > 0;
  if (term && !items.length) $("archiveEmpty").textContent = "검색 결과가 없습니다.";

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "archive-item" + (state.article && state.article.id === item.id ? " active" : "");
    li.dataset.id = item.id;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", item.title + " 열기");

    const title = document.createElement("h4");
    title.textContent = item.title || "(제목 없음)";
    const meta = document.createElement("div");
    meta.className = "meta";
    const site = document.createElement("span");
    site.textContent = item.site || "직접 입력";
    const dot = document.createElement("span");
    dot.textContent = "·";
    const date = document.createElement("span");
    date.textContent = formatDate(item.createdAt).slice(0, 12);
    meta.append(site, dot, date);
    if (item.source === "preset") {
      const badge = document.createElement("span");
      badge.className = "chip static";
      badge.style.padding = "1px 6px";
      badge.style.fontSize = "9.5px";
      badge.textContent = "예시";
      meta.appendChild(badge);
    }

    const tools = document.createElement("div");
    tools.className = "tools";
    const openBtn = document.createElement("button");
    openBtn.className = "mini-btn";
    openBtn.type = "button";
    openBtn.textContent = "열기";
    openBtn.dataset.action = "open";
    const linkBtn = document.createElement("a");
    linkBtn.className = "mini-btn";
    linkBtn.textContent = "원문 ↗";
    linkBtn.href = item.partnerUrl || item.url || "#";
    linkBtn.target = "_blank";
    linkBtn.rel = "noopener";
    if (!item.partnerUrl && !item.url) linkBtn.style.display = "none";
    const delBtn = document.createElement("button");
    delBtn.className = "mini-btn danger";
    delBtn.type = "button";
    delBtn.textContent = "삭제";
    delBtn.dataset.action = "delete";
    tools.append(openBtn, linkBtn, delBtn);

    li.append(title, meta, tools);
    list.appendChild(li);
  }
}

async function openArchivedArticle(id) {
  let article = null;
  if (state.storage === "kv") {
    const result = await api("/api/mirror?id=" + encodeURIComponent(id));
    if (result.data.ok) article = result.data.article;
  }
  if (!article) article = localArchive().find((item) => item.id === id) || null;
  if (!article) {
    toast("아카이브에서 기사를 찾지 못했습니다.", "err");
    return;
  }
  if (!article.paragraphs || !article.paragraphs.length) {
    article.paragraphs = String(article.body || "").split(/\n{2,}/).filter(Boolean);
  }
  setArticle(article, { fromArchive: true });
}

async function deleteArchivedArticle(id) {
  if (!window.confirm("이 기사를 아카이브에서 지울까요?")) return;
  if (state.storage === "kv") {
    const result = await api("/api/mirror?id=" + encodeURIComponent(id), { method: "DELETE" });
    if (!result.data.ok) {
      toast("아카이브에서 지우지 못했습니다.", "err");
      return;
    }
  }
  removeLocalArticle(id);
  if (state.article && state.article.id === id) {
    state.article = null;
  }
  await refreshArchive($("archiveSearch").value);
  renderWorkspace();
  toast("아카이브에서 지웠습니다.", "ok");
}

/* ------------------------------------------------------------------ *
 * 분류별 기사 피드
 * ------------------------------------------------------------------ */

const FEED_CATEGORY_LABELS = {
  all: "전체",
  economy: "경제·금융",
  tech: "IT·AI",
  society: "사회",
  politics: "정치",
  entertain: "연예·방송",
  sports: "스포츠",
  health: "건강·의학",
  life: "라이프·생활",
  realestate: "부동산·재테크",
  global: "글로벌·국제",
  partners: "💰 파트너스 고수익",
};

function renderFeedCategories() {
  const row = $("feedCategoryRow");
  if (!row) return;
  row.textContent = "";
  for (const [id, label] of Object.entries(FEED_CATEGORY_LABELS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.feed.category === id ? " active" : "");
    button.dataset.feedCategory = id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", state.feed.category === id ? "true" : "false");
    button.textContent = label;
    row.appendChild(button);
  }
}

function feedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderFeedList() {
  const list = $("feedList");
  if (!list) return;
  list.textContent = "";
  const items = state.feed.items || [];
  $("feedHint").hidden = Boolean(items.length);
  if (!items.length) {
    $("feedHint").hidden = false;
    $("feedHint").textContent = state.feed.loading
      ? "분류별 기사를 불러오고 있습니다…"
      : "피드를 불러오지 못했습니다. 위 주소 입력으로 직접 미러링하거나 잠시 뒤 다시 시도해 주세요.";
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "feed-item";
    li.dataset.feedId = item.id;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", item.title + " 미러링");

    if (item.image) {
      const thumb = document.createElement("img");
      thumb.className = "feed-thumb";
      thumb.src = item.image;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.referrerPolicy = "no-referrer";
      thumb.addEventListener("error", () => thumb.remove());
      li.appendChild(thumb);
    } else {
      const art = document.createElement("span");
      art.className = "feed-thumb art";
      art.textContent = item.isFallback ? "📋" : "📰";
      art.setAttribute("aria-hidden", "true");
      li.appendChild(art);
    }

    const body = document.createElement("div");
    body.className = "feed-body";
    const title = document.createElement("h4");
    title.textContent = item.title;
    body.appendChild(title);
    const summary = document.createElement("p");
    summary.textContent = item.summary || "";
    body.appendChild(summary);

    const meta = document.createElement("div");
    meta.className = "feed-meta";
    if (item.rank) {
      const rank = document.createElement("span");
      rank.className = "feed-rank";
      rank.textContent = item.rank + "위";
      meta.appendChild(rank);
    }
    const site = document.createElement("span");
    site.textContent = item.site || "뉴스";
    meta.appendChild(site);
    const date = feedDate(item.publishedAt);
    if (date) {
      const dot = document.createElement("span");
      dot.textContent = "·";
      const time = document.createElement("span");
      time.textContent = date;
      meta.append(dot, time);
    }
    if (item.hot) {
      const badge = document.createElement("span");
      badge.className = "feed-badge hot";
      badge.textContent = "💰 고수익";
      meta.appendChild(badge);
    }
    if (item.isFallback) {
      const badge = document.createElement("span");
      badge.className = "feed-badge curated";
      badge.textContent = "큐레이션";
      meta.appendChild(badge);
    } else if (item.partnerApplied) {
      const badge = document.createElement("span");
      badge.className = "feed-badge partner";
      badge.textContent = "pn 적용";
      meta.appendChild(badge);
    }
    body.appendChild(meta);

    const action = document.createElement("span");
    action.className = "feed-go";
    action.textContent = "미러링 →";
    body.appendChild(action);

    li.appendChild(body);
    list.appendChild(li);
  }
}

async function loadFeed(category = state.feed.category) {
  state.feed.category = category in FEED_CATEGORY_LABELS ? category : "all";
  state.feed.loading = true;
  renderFeedCategories();
  renderFeedList();
  const status = $("feedStatus");
  if (status) status.textContent = "불러오는 중…";
  try {
    const query =
      "/api/feed?category=" +
      encodeURIComponent(state.feed.category) +
      "&limit=20&pn=" +
      encodeURIComponent(state.partnerCode || "");
    const result = await api(query);
    const data = result.data || {};
    if (data.ok && Array.isArray(data.items)) {
      state.feed.items = data.items;
      state.feed.fallback = Boolean(data.fallback);
      state.feed.partners = state.feed.category === "partners";
      state.feed.error = "";
      state.feed.loaded = true;
      if (status) {
        if (state.feed.category === "partners") {
          status.textContent = data.linked
            ? `파트너스 고수익 ${data.items.length}건 · ${data.source === "kv" ? "KV 최신" : "시드"}`
            : `고수익형 큐레이션 ${data.items.length}건 · 파트너스 미연동`;
        } else if (data.fallback) {
          status.textContent = `큐레이션 ${data.items.length}건`;
        } else {
          status.textContent = `실시간 ${data.items.length}건 · 5분 캐시`;
        }
      }
    } else {
      throw new Error("bad feed");
    }
  } catch (e) {
    state.feed.items = [];
    state.feed.fallback = true;
    state.feed.error = "피드를 불러오지 못했습니다.";
    state.feed.loaded = false;
    if (status) status.textContent = "불러오기 실패";
  } finally {
    state.feed.loading = false;
    renderFeedList();
    renderFeedCategories();
  }
}

async function openFeedItem(item, node) {
  if (!item || state.busy) return;
  state.busy = true;
  document.body.classList.add("is-busy");
  if (node) node.classList.add("busy");
  try {
    let data = null;
    if (item.url) {
      const result = await api("/api/mirror", {
        method: "POST",
        body: JSON.stringify({ url: item.url, pn: state.partnerCode }),
      });
      data = result.data;
      if (data && data.ok && data.article) state.feed.items = state.feed.items.map((x) => (x.id === item.id ? { ...x } : x));
    }
    if (!data || !data.ok || !data.article) {
      const bodyText = item.body || item.summary || item.title;
      const manual = await api("/api/mirror", {
        method: "POST",
        body: JSON.stringify({
          manual: true,
          title: item.title,
          body: bodyText,
          url: item.url || "",
          pn: state.partnerCode,
        }),
      });
      data = manual.data;
      if (data && data.ok) data.warnings = ["피드 요약으로 저장했습니다. 원문에서 세부 내용을 확인하세요."];
    }
    if (data && data.ok && data.article) {
      if (data.storage !== "kv") saveLocalArticle(data.article);
      await setArticle(data.article);
      showTab("cards");
      toast("미러링·요약 완료 — 카드뉴스 제작 단계로 넘어왔습니다.", "ok");
    } else {
      toast((data && data.message) || "기사를 열지 못했습니다.", "err");
    }
  } catch (e) {
    toast("네트워크 오류로 기사를 열지 못했습니다.", "err");
  } finally {
    state.busy = false;
    document.body.classList.remove("is-busy");
    if (node) node.classList.remove("busy");
  }
}

/* ------------------------------------------------------------------ *
 * 기사 → 스튜디오
 * ------------------------------------------------------------------ */

function partnerUrlNow(article = state.article) {
  if (!article) return "";
  return partnerLinkFor(article, state.partnerCode);
}

async function setArticle(article, { fromArchive = false } = {}) {
  state.article = article;
  state.article.partnerUrl = partnerUrlNow(article);
  const storyboard = buildStoryboard(state.article, {
    partnerUrl: state.article.partnerUrl,
    cardCount: state.cardCount,
    accounts: state.accounts,
  });
  state.cuts = storyboard.cuts;
  state.baseCards = storyboard.cards.map((card) => ({ ...card, lines: [...card.lines] }));
  state.cards = storyboard.cards.map((card) => ({ ...card, lines: [...card.lines] }));
  state.channels = storyboard.channels;
  state.articleImages = collectArticleImages(state.article);
  state.activeCard = 0;
  state.images = {};
  state.imageMeta = {};
  state.cardImages = state.cards.map(() => null);
  state.cardImageMeta = state.cards.map(() => ({}));
  state.proxyCache = {};
  state.promptSource = "";
  state.activeCard = 0;
  state.articleImageEl = null;
  state.slideshowUrl = "";
  state.keywordOff = [];
  writeJson(LS.last, state.article);

  renderReader();
  renderWorkspace();
  await loadArticleImage();
  if (!fromArchive) await refreshArchive($("archiveSearch").value || "");
  /* 본문 이미지를 카드에 순서대로 배분(비용 없음) → 부족한 카드는 버튼을 누를 때 채운다. */
  distributeCardArticleImages({ silent: true }).catch(() => {});
  /* 기사 본문 기반 영문 프롬프트를 백그라운드로 받아온다(Workers AI). 실패해도 기본 프롬프트 유지. */
  preparePrompts().catch(() => {});
}

/** 기사 본문 이미지 목록 (대표 이미지 포함 최대 8장) */
function collectArticleImages(article) {
  const out = [];
  const push = (url) => {
    if (!url || !/^https?:/i.test(url)) return;
    if (out.includes(url)) return;
    out.push(url);
  };
  if (!article) return out;
  push(article.image);
  for (const url of article.bodyImages || []) push(url);
  for (const url of article.images || []) push(url);
  return out.slice(0, 8);
}

function renderWorkspace() {
  const has = Boolean(state.article);
  $("mirrorEmpty").hidden = has;
  $("readerCard").hidden = !has;
  $("cutsEmpty").hidden = has;
  $("cardsEmpty").hidden = has;
  $("channelsEmpty").hidden = has;
  $("cutsStudio").hidden = !has;
  $("cardsStudio").hidden = !has;
  $("channelsStudio").hidden = !has;
  if (!has) return;

  $("cutsArticleTitle").textContent = state.article.title;
  $("cardsArticleTitle").textContent = state.article.title;
  $("channelsArticleTitle").textContent = state.article.title;

  renderChips();
  renderKeywords();
  renderArticleImages();
  renderCuts();
  renderComic();
  renderSlideList();
  renderCardEditor();
  renderCardPreview();
  renderPlatformTabs();
  renderChannelSelection();
  renderChannel();
  renderChannelPackages();
  renderAutofillBadge();
  document.body.dataset.articleId = state.article.id;
}

/* ------------------------------------------------------------------ *
 * 제목 키워드 · 기사 본문 이미지 (4컷)
 * ------------------------------------------------------------------ */

function activeKeywordPrompt() {
  const keys = (state.keywordKeys || []).filter((key) => !state.keywordOff.includes(key.ko)).slice(0, 4);
  if (!keys.length) return "";
  const parts = keys.map((key) => (key.en ? `${key.en} (${key.ko})` : key.ko));
  return "key subject: " + parts.join(", ");
}

function renderKeywords() {
  const row = $("keywordRow");
  if (!row) return;
  row.textContent = "";
  if (!state.article) {
    state.keywordKeys = [];
    return;
  }
  state.keywordKeys = extractKeywords(state.article, 6);
  for (const key of state.keywordKeys) {
    const off = state.keywordOff.includes(key.ko);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip keyword" + (off ? "" : " active");
    button.dataset.keyword = key.ko;
    button.title = key.en ? `${key.ko} · ${key.en}` : key.ko;
    button.textContent = (key.en ? "🔑 " : "") + key.ko;
    row.appendChild(button);
  }
  const note = document.createElement("span");
  note.className = "chip static";
  note.textContent = state.keywordKeys.length ? "제목 키워드 → 이미지 프롬프트 최우선" : "키워드 없음";
  row.appendChild(note);
}

function toggleKeyword(keyword) {
  if (!keyword) return;
  if (state.keywordOff.includes(keyword)) state.keywordOff = state.keywordOff.filter((item) => item !== keyword);
  else state.keywordOff.push(keyword);
  const prompt = activeKeywordPrompt();
  for (const cut of state.cuts) {
    cut.keywordPrompt = prompt;
    cut.aiPrompt = cutPrompt(cut, state.style, state.article);
  }
  renderKeywords();
  renderCuts();
  toast(prompt ? `프롬프트 키워드: ${prompt.replace(/^key subject: /, "")}` : "키워드를 모두 껐습니다. 장면 설명만 씁니다.", "ok");
}

function renderArticleImages() {
  const panel = $("articleImagePanel");
  const list = $("articleImageList");
  if (!panel || !list) return;
  list.textContent = "";
  const images = state.articleImages || [];
  panel.hidden = !images.length;
  const note = $("articleImageNote");
  if (note) note.textContent = images.length ? `${images.length}장 · 최대 8장` : "—";
  const proxyTargets = [];
  images.forEach((url, index) => {
    const li = document.createElement("li");
    li.className = "article-image-item";
    const img = document.createElement("img");
    img.src = url;
    img.alt = `기사 이미지 ${index + 1}`;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.classList.add("broken"));
    proxyTargets.push({ img, url });
    const tools = document.createElement("div");
    tools.className = "article-image-tools";
    for (let cut = 1; cut <= 4; cut += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini-btn";
      button.dataset.imageIndex = String(index);
      button.dataset.cutIndex = String(cut);
      button.textContent = cut + "컷";
      tools.appendChild(button);
    }
    li.append(img, tools);
    list.appendChild(li);
  });
  /* 핫링크로 깨지는 이미지는 이 사이트의 중계로 한 번 더 시도한다. */
  for (const target of proxyTargets) {
    api("/api/proxy-image?url=" + encodeURIComponent(target.url))
      .then((result) => {
        if (result.data && result.data.ok && result.data.dataUrl) {
          target.img.src = result.data.dataUrl;
          target.img.classList.remove("broken");
        }
      })
      .catch(() => {});
  }
}

async function assignArticleImage(imageIndex, cutIndex) {
  const url = (state.articleImages || [])[imageIndex];
  const cut = state.cuts[cutIndex - 1];
  if (!url || !cut) return;
  const image = await proxyArticleImage(url);
  if (!image) {
    toast("이미지를 불러오지 못했습니다. 다른 이미지를 골라 주세요.", "err");
    return;
  }
  state.images[cut.index] = image;
  state.imageMeta[cut.index] = { mode: "article", url };
  updateCutImageState(cut.index, true, "기사 이미지");
  renderComic();
  toast(`기사 이미지 ${imageIndex + 1}번을 ${cutIndex}컷에 넣었습니다.`, "ok");
}

async function assignImagesInOrder() {
  const urls = (state.articleImages || []).slice(0, 4);
  if (!urls.length) {
    toast("기사 본문 이미지가 없습니다.", "err");
    return;
  }
  const progress = $("cutsProgress");
  let filled = 0;
  for (let i = 0; i < urls.length; i += 1) {
    const cut = state.cuts[i];
    if (!cut) break;
    const image = await proxyArticleImage(urls[i]);
    if (!image) continue;
    state.images[cut.index] = image;
    state.imageMeta[cut.index] = { mode: "article", url: urls[i] };
    updateCutImageState(cut.index, true, "기사 이미지");
    filled += 1;
    setProgress(progress, filled / Math.max(urls.length, 1));
  }
  setProgress(progress, 1, false);
  renderComic();
  toast(filled ? `기사 이미지 ${filled}장을 순서대로 컷에 넣었습니다.` : "이미지를 불러오지 못했습니다.", filled ? "ok" : "err");
}

/* ------------------------------------------------------------------ *
 * 로그인 / 회원가입 (구글 · 네이버 · 카카오 · 게스트)
 * ------------------------------------------------------------------ */

function renderAuth() {
  const button = $("authBtn");
  const pill = $("authPill");
  if (!button || !pill) return;
  const auth = state.auth;
  if (auth.authenticated && auth.user) {
    button.textContent = `${auth.user.guest ? "게스트" : auth.user.name || "회원"} · 계정`;
    pill.hidden = false;
    pill.textContent = auth.mode === "guest" ? "게스트 세션 · KV" : `${auth.user.provider} 로그인`;
    pill.className = "pill";
  } else {
    button.textContent = "로그인 / 회원가입";
    pill.hidden = true;
  }
  const status = $("authStatus");
  if (status) {
    const providers = auth.providers || {};
    const ready = [providers.google ? "구글" : "", providers.naver ? "네이버" : "", providers.kakao ? "카카오" : ""].filter(Boolean);
    status.textContent = auth.authenticated
      ? `${auth.mode === "guest" ? "게스트" : "회원"} 세션 · 채널 계정 ${Object.keys(state.accounts || {}).length}개 저장소: ${auth.authenticated ? (auth.storage === "kv" ? "KV" : "브라우저") : "브라우저"}`
      : ready.length
        ? `사용 가능한 로그인: ${ready.join(" · ")}`
        : "OAuth 키 등록 대기 중 — 지금은 게스트로 계속할 수 있어요(브라우저 저장).";
  }
  const note = $("authNote");
  if (note) {
    note.textContent = auth.oauthConfigured
      ? "구글·네이버·카카오 계정으로 로그인하면 채널 계정 6개가 회원 KV에 저장됩니다."
      : "OAuth 키 등록 대기 중입니다. 게스트로 계속하면 이 브라우저에 저장되고, 키를 등록하는 즉시 같은 화면에서 로그인할 수 있어요.";
  }
  for (const button of $$("[data-login]")) {
    const provider = button.dataset.login;
    const configured = Boolean((auth.providers || {})[provider]);
    button.classList.toggle("pending", !configured);
    button.title = configured ? "" : "OAuth 키 등록 대기 중";
  }
}

function openAuthDialog(message) {
  renderAuth();
  const status = $("authStatus");
  if (status && message) status.textContent = message;
  const dialog = $("authDialog");
  if (dialog && !dialog.open) dialog.showModal();
}

async function loadAuth() {
  try {
    const result = await api("/api/auth/me");
    const data = result.data || {};
    state.auth.checked = true;
    state.auth.providers = data.providers || {};
    state.auth.oauthConfigured = Boolean(data.oauthConfigured);
    state.auth.storage = data.storage || "none";
    state.auth.message = data.message || "";
    if (data.authenticated && data.user) {
      state.auth.authenticated = true;
      state.auth.mode = data.mode || "member";
      state.auth.user = data.user;
      const remote = data.accounts && Object.keys(data.accounts).length ? data.accounts : null;
      if (remote) {
        state.accounts = { ...readJson(LS.accounts, {}), ...remote };
        writeJson(LS.accounts, state.accounts);
      } else {
        const local = readJson(LS.accounts, {});
        state.accounts = local;
        if (Object.keys(local).length) {
          api("/api/account", { method: "PUT", body: JSON.stringify({ accounts: local }) }).catch(() => {});
        }
      }
    } else {
      state.auth.authenticated = false;
      state.auth.mode = readJson(LS.guest, false) ? "guest-local" : "anonymous";
      state.auth.user = null;
      state.accounts = readJson(LS.accounts, {});
    }
  } catch (e) {
    state.auth.checked = true;
    state.auth.authenticated = false;
    state.auth.mode = "guest-local";
    state.accounts = readJson(LS.accounts, {});
  }
  renderAuth();
  renderAccounts();
  applyAccountsToChannels();
}

function loginWith(provider) {
  if (!provider) return;
  if (!(state.auth.providers || {})[provider]) {
    openAuthDialog("OAuth 키 등록 대기 중 — 이 제공자의 클라이언트 키가 아직 없습니다. 게스트로 계속할 수 있어요.");
    return;
  }
  const dialog = $("authDialog");
  if (dialog && dialog.open) dialog.close();
  location.href = `/api/auth/${provider}`;
}

async function continueAsGuest() {
  writeJson(LS.guest, true);
  let mode = "guest-local";
  let message = "게스트 모드 — 채널 계정을 이 브라우저에 저장합니다.";
  try {
    const result = await api("/api/auth/guest", { method: "POST", body: JSON.stringify({}) });
    const data = result.data || {};
    if (data.authenticated && data.mode === "guest") {
      mode = "guest";
      message = "게스트 세션 시작 — 채널 계정을 게스트 KV에 저장합니다.";
      state.auth.authenticated = true;
      state.auth.user = data.user;
      state.auth.mode = "guest";
      state.auth.storage = data.storage || "none";
      state.auth.providers = data.providers || state.auth.providers;
      const local = readJson(LS.accounts, {});
      if (Object.keys(local).length) await api("/api/account", { method: "PUT", body: JSON.stringify({ accounts: local }) }).catch(() => {});
    } else if (data.message) {
      message = data.message;
    }
  } catch (e) {
    /* 오프라인이면 브라우저 저장 */
  }
  state.auth.mode = mode;
  const dialog = $("authDialog");
  if (dialog && dialog.open) dialog.close();
  renderAuth();
  renderAccounts();
  toast(message, "ok");
}

async function logoutUser() {
  try {
    await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch (e) {
    /* 무시 */
  }
  writeJson(LS.guest, false);
  state.auth.authenticated = false;
  state.auth.mode = "anonymous";
  state.auth.user = null;
  const dialog = $("authDialog");
  if (dialog && dialog.open) dialog.close();
  renderAuth();
  renderAccounts();
  toast("로그아웃했습니다. 채널 계정은 이 브라우저에 남아 있어요.", "ok");
}

/* ------------------------------------------------------------------ *
 * 채널 계정 (6개) 저장 · 자동입력
 * ------------------------------------------------------------------ */

function savedAccountCount() {
  return PLATFORMS.filter((platform) => normalizeAccount((state.accounts || {})[platform.id]).handle).length;
}

function renderAutofillBadge() {
  const badge = $("autofillBadge");
  if (badge) {
    const count = savedAccountCount();
    badge.textContent = count
      ? `⚡ 저장된 계정 일괄 자동입력 · ${count}/${PLATFORMS.length}`
      : "⚡ 저장된 계정 없음 · 채널 탭에서 입력";
    badge.className = "pill" + (count ? "" : " local");
    badge.title = count ? "본문·해시태그·서명·인쟌트 URL에 자동으로 채워집니다." : "채널 탭에서 6개 계정을 입력해 저장하세요.";
  }
  const storage = $("accountStorage");
  if (storage) {
    storage.textContent = state.auth.authenticated
      ? state.auth.mode === "guest"
        ? "게스트 KV 저장"
        : "회원 KV 저장"
      : "브라우저(localStorage) 저장";
  }
}

function renderAccounts() {
  const grid = $("accountGrid");
  if (!grid) return;
  grid.textContent = "";
  for (const platform of PLATFORMS) {
    const account = normalizeAccount((state.accounts || {})[platform.id]);
    const card = document.createElement("div");
    card.className = "account-row";
    card.dataset.accountPlatform = platform.id;
    const head = document.createElement("div");
    head.className = "account-row-head";
    const name = document.createElement("strong");
    name.textContent = `${platform.emoji} ${platform.name}`;
    const flag = document.createElement("span");
    flag.className = "tiny";
    flag.textContent = account.handle ? "저장됨" : "미입력";
    head.append(name, flag);

    const fields = document.createElement("div");
    fields.className = "account-fields";
    const addField = (label, key, placeholder) => {
      const wrap = document.createElement("label");
      wrap.className = "field";
      const span = document.createElement("span");
      span.textContent = label;
      const input = document.createElement("input");
      input.dataset.accountField = key;
      input.dataset.accountPlatform = platform.id;
      input.value = account[key] || "";
      input.placeholder = placeholder;
      input.autocomplete = "off";
      wrap.append(span, input);
      return wrap;
    };
    fields.append(
      addField("아이디(@handle)", "handle", "@myhandle"),
      addField("연동 메모", "memo", "예: 업로드는 밤 9시"),
      addField("웹훅 URL", "webhook", "https://…"),
      addField("토큰(선택)", "token", "액세스 토큰")
    );
    card.append(head, fields);
    grid.appendChild(card);
  }
  renderAutofillBadge();
}

function collectAccounts() {
  const out = {};
  for (const platform of PLATFORMS) {
    const row = document.querySelector(`[data-account-platform="${platform.id}"]`);
    const entry = {};
    for (const key of ["handle", "memo", "webhook", "token"]) {
      const input = row ? row.querySelector(`[data-account-field="${key}"]`) : null;
      entry[key] = input ? input.value.trim() : "";
    }
    const normalized = normalizeAccount(entry);
    if (normalized.handle || normalized.memo || normalized.webhook || normalized.token) out[platform.id] = normalized;
  }
  return out;
}

async function saveAccounts() {
  const accounts = collectAccounts();
  state.accounts = accounts;
  writeJson(LS.accounts, accounts);
  let savedTo = "브라우저";
  if (state.auth.authenticated) {
    const result = await api("/api/account", { method: "PUT", body: JSON.stringify({ accounts }) });
    if (result.data && result.data.ok) savedTo = state.auth.mode === "guest" ? "게스트 KV" : "회원 KV";
  }
  renderAccounts();
  applyAccountsToChannels();
  toast(`채널 계정 ${savedAccountCount()}개를 ${savedTo}에 저장하고 자동입력했습니다.`, "ok");
}

function applyAccountsToChannels({ silent = false } = {}) {
  renderAutofillBadge();
  if (!state.channels || !Object.keys(state.channels).length) return;
  applyAccounts(state.channels, state.accounts);
  if (state.article) {
    renderChannel();
    renderChannelPackages();
  }
  if (!silent) toast(`저장된 계정 ${savedAccountCount()}개를 6개 채널에 자동입력했습니다.`, "ok");
}

function goToChannels() {
  if (!state.article) {
    toast("먼저 기사를 골라 주세요.", "err");
    return;
  }
  const partnerUrl = partnerUrlNow();
  state.channels = buildChannels(state.article, state.cards, partnerUrl, { accounts: state.accounts });
  renderPlatformTabs();
  renderChannelSelection();
  applyAccountsToChannels({ silent: true });
  showTab("channels");
  toast("완성본을 가지고 4단계 채널로 이동했습니다.", "ok");
}

function renderReader() {
  const article = state.article;
  if (!article) return;
  $("readerSite").textContent = article.site || "직접 입력";
  const dateText = article.publishedAt ? formatDate(article.publishedAt) : formatDate(article.createdAt);
  $("readerDate").textContent = dateText;
  $("readerChars").textContent = `${article.charCount || 0}자 · ${(article.paragraphs || []).length}문단`;
  $("readerTitle").textContent = article.title;
  const subtitle = isNoiseLine(article.subtitle) ? "" : article.subtitle || "";
  $("readerSubtitle").textContent = subtitle;
  $("readerSubtitle").hidden = !subtitle;

  const meta = $("readerMeta");
  meta.textContent = "";
  const bits = [];
  if (article.author) bits.push("글 " + article.author);
  if (article.partnerCode) bits.push("파트너 코드 pn=" + article.partnerCode);
  if (article.url) bits.push("원문 주소 저장됨");
  if (article.source === "preset") bits.push("예시 기사");
  for (const bit of bits) {
    const span = document.createElement("span");
    span.textContent = bit;
    meta.appendChild(span);
  }

  const body = $("readerBody");
  body.textContent = "";
  for (const paragraph of article.paragraphs || []) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    body.appendChild(p);
  }

  const link = $("readerPartner");
  const href = article.partnerUrl || article.url;
  link.href = href || "#";
  link.hidden = !href;
  link.textContent = article.partnerCode ? "원문 파트너스 링크 ↗" : "원문 링크 ↗";

  const imageWrap = $("readerImageWrap");
  if (article.image && !state.articleImageEl) {
    $("readerImage").src = article.image;
    imageWrap.hidden = false;
  } else if (state.articleImageEl) {
    imageWrap.hidden = false;
  } else {
    imageWrap.hidden = true;
  }
}

async function loadArticleImage() {
  const article = state.article;
  if (!article || !article.image) return;
  const result = await api("/api/proxy-image?url=" + encodeURIComponent(article.image));
  if (!result.data.ok || !result.data.dataUrl) return;
  const image = await loadImage(result.data.dataUrl);
  if (!image) return;
  state.articleImageEl = image;
  $("readerImage").src = result.data.dataUrl;
  $("readerImageWrap").hidden = false;
  renderCardPreview();
}

/* ------------------------------------------------------------------ *
 * 미러링 폼
 * ------------------------------------------------------------------ */

async function submitMirror(event) {
  event.preventDefault();
  if (state.busy) return;
  const url = $("articleUrl").value.trim();
  if (!url) {
    toast("기사 주소를 입력해 주세요.", "err");
    $("articleUrl").focus();
    return;
  }
  const button = $("mirrorBtn");
  const original = button.textContent;
  state.busy = true;
  button.disabled = true;
  button.textContent = "미러링 중…";
  try {
    const result = await api("/api/mirror", {
      method: "POST",
      body: JSON.stringify({ url, pn: state.partnerCode }),
    });
    const data = result.data;
    if (data.ok && data.article) {
      if (data.storage !== "kv") saveLocalArticle(data.article);
      setArticle(data.article);
      if (data.warnings && data.warnings.length) toast(data.warnings[0], "ok");
      else toast("미러링 완료 — 텍스트 리더로 저장했습니다.", "ok");
    } else if (data.needsManual) {
      $("manualBox").hidden = false;
      $("manualToggle").setAttribute("aria-expanded", "true");
      $("manualUrl").value = url;
      toast(data.message || "주소를 불러오지 못했습니다. 직접 붙여넣어 주세요.", "err");
    } else {
      toast(data.message || "미러링에 실패했습니다.", "err");
    }
  } catch (error) {
    toast("네트워크 오류로 미러링하지 못했습니다.", "err");
  } finally {
    state.busy = false;
    button.disabled = false;
    button.textContent = original;
  }
}

async function saveManual() {
  const title = $("manualTitle").value.trim();
  const body = $("manualBody").value.trim();
  if (!title && !body) {
    toast("제목이나 본문을 입력해 주세요.", "err");
    return;
  }
  const button = $("manualSave");
  button.disabled = true;
  try {
    const result = await api("/api/mirror", {
      method: "POST",
      body: JSON.stringify({
        manual: true,
        title,
        body,
        url: $("manualUrl").value.trim(),
        pn: state.partnerCode,
      }),
    });
    if (result.data.ok && result.data.article) {
      if (result.data.storage !== "kv") saveLocalArticle(result.data.article);
      setArticle(result.data.article);
      toast("직접 입력한 기사를 아카이브에 저장했습니다.", "ok");
    } else {
      toast(result.data.message || "저장하지 못했습니다.", "err");
    }
  } finally {
    button.disabled = false;
  }
}

async function loadPresets() {
  const row = $("presetRow");
  try {
    const result = await api("/api/presets");
    const presets = (result.data && result.data.presets) || [];
    row.textContent = "";
    for (const preset of presets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.dataset.preset = preset.id;
      button.textContent = `${preset.emoji} ${preset.label}`;
      row.appendChild(button);
    }
  } catch (e) {
    row.innerHTML = "";
  }
}

async function loadPreset(id) {
  if (state.busy) return;
  state.busy = true;
  try {
    const result = await api("/api/mirror", {
      method: "POST",
      body: JSON.stringify({ preset: id, pn: state.partnerCode }),
    });
    if (result.data.ok && result.data.article) {
      if (result.data.storage !== "kv") saveLocalArticle(result.data.article);
      setArticle(result.data.article);
      toast("예시 기사를 불러왔습니다. 실제 기사 주소로도 확인해 보세요.", "ok");
    } else {
      toast(result.data.message || "예시 기사를 불러오지 못했습니다.", "err");
    }
  } finally {
    state.busy = false;
  }
}

/* ------------------------------------------------------------------ *
 * 칩(스타일·배치·테마·비율·플랫폼)
 * ------------------------------------------------------------------ */

function renderChips() {
  const styleRow = $("styleRow");
  styleRow.textContent = "";
  for (const style of STYLES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.style === style.id ? " active" : "");
    button.dataset.style = style.id;
    button.title = style.tone;
    button.textContent = `${style.emoji} ${style.name}`;
    styleRow.appendChild(button);
  }

  const layoutRow = $("layoutRow");
  layoutRow.textContent = "";
  for (const item of [
    { id: "grid", label: "2×2 정사각" },
    { id: "vertical", label: "세로 4컷" },
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.layout === item.id ? " active" : "");
    button.dataset.layout = item.id;
    button.textContent = item.label;
    layoutRow.appendChild(button);
  }

  const imageModeRow = $("imageModeRow");
  if (imageModeRow) {
    imageModeRow.textContent = "";
    for (const mode of IMAGE_MODES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip" + (state.imageMode === mode.id ? " active" : "");
      button.dataset.imageMode = mode.id;
      button.title = mode.hint;
      button.textContent = `${mode.emoji} ${mode.name}`;
      imageModeRow.appendChild(button);
    }
  }

  const cardImageModeRow = $("cardImageModeRow");
  if (cardImageModeRow) {
    cardImageModeRow.textContent = "";
    for (const mode of IMAGE_MODES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip" + (state.cardImageMode === mode.id ? " active" : "");
      button.dataset.cardImageMode = mode.id;
      button.title = mode.hint;
      button.textContent = `${mode.emoji} ${mode.name}`;
      cardImageModeRow.appendChild(button);
    }
  }

  const chapterRow = $("chapterRow");
  if (chapterRow) {
    chapterRow.textContent = "";
    for (const count of CARD_COUNTS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip" + (state.cardCount === count ? " active" : "");
      button.dataset.chapter = String(count);
      button.textContent = `${count}장`;
      chapterRow.appendChild(button);
    }
  }

  const cardLayoutRow = $("cardLayoutRow");
  if (cardLayoutRow) {
    cardLayoutRow.textContent = "";
    for (const item of [
      { id: "split", label: "◧ 분할(기본)" },
      { id: "full", label: "▣ 전면형" },
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip" + (state.cardLayout === item.id ? " active" : "");
      button.dataset.cardLayout = item.id;
      button.textContent = item.label;
      cardLayoutRow.appendChild(button);
    }
  }

  const themeRow = $("themeRow");
  themeRow.textContent = "";
  for (const item of [
    { id: "magazine", label: "📖 매거진" },
    { id: "dark", label: "🌙 다크 테크" },
    { id: "econ", label: "📈 경제 인포" },
    { id: "pastel", label: "🌸 파스텔" },
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.cardTheme === item.id ? " active" : "");
    button.dataset.theme = item.id;
    button.textContent = item.label;
    themeRow.appendChild(button);
  }

  const ratioRow = $("ratioRow");
  ratioRow.textContent = "";
  for (const item of [
    { id: "4:5", label: "4:5 인스타" },
    { id: "9:16", label: "9:16 틱톡" },
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.ratio === item.id ? " active" : "");
    button.dataset.ratio = item.id;
    button.textContent = item.label;
    ratioRow.appendChild(button);
  }
}

/* ------------------------------------------------------------------ *
 * 4컷 스튜디오
 * ------------------------------------------------------------------ */

function renderCuts() {
  const grid = $("cutsGrid");
  grid.textContent = "";
  state.cuts.forEach((cut, index) => {
    const card = document.createElement("article");
    card.className = "cut-card";
    card.dataset.cut = String(cut.index);

    const header = document.createElement("header");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = String(cut.index);
    const role = document.createElement("span");
    role.className = "role";
    role.textContent = `${cut.roleLabel} 컷 · ${cut.expression}`;
    const imgState = document.createElement("span");
    imgState.className = "imgstate" + (state.images[cut.index] ? " ai" : "");
    imgState.dataset.role = "imgstate";
    imgState.textContent = state.images[cut.index] ? "AI 이미지" : "Canvas 아트";
    header.append(badge, role, imgState);
    card.appendChild(header);

    const fields = document.createElement("div");
    fields.className = "cut-fields";

    fields.appendChild(
      field("나레이션", "cut-narration", cut.narration, "textarea", 2, index)
    );
    fields.appendChild(field("대사(말풍선)", "cut-dialogue", cut.dialogue, "textarea", 2, index));

    const dialogue = fields.querySelector('[data-field="cut-dialogue"]');
    if (dialogue) dialogue.rows = 2;

    const speakerLabel = document.createElement("div");
    speakerLabel.className = "field";
    const speakerSpan = document.createElement("span");
    speakerSpan.textContent = "화자";
    const speakerSelect = document.createElement("select");
    speakerSelect.dataset.field = "cut-speaker";
    speakerSelect.dataset.index = String(index);
    for (const name of ["독자", "기자"]) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = cut.speaker === name;
      speakerSelect.appendChild(option);
    }
    speakerLabel.append(speakerSpan, speakerSelect);
    fields.appendChild(speakerLabel);

    const expressionLabel = document.createElement("div");
    expressionLabel.className = "field";
    const expressionSpan = document.createElement("span");
    expressionSpan.textContent = "표정";
    const expressionSelect = document.createElement("select");
    expressionSelect.dataset.field = "cut-expression";
    expressionSelect.dataset.index = String(index);
    for (const name of ["놀람", "진지", "당황", "웃음"]) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = cut.expression === name;
      expressionSelect.appendChild(option);
    }
    expressionLabel.append(expressionSpan, expressionSelect);
    fields.appendChild(expressionLabel);

    const promptField = document.createElement("label");
    promptField.className = "field full";
    const promptSpan = document.createElement("span");
    promptSpan.textContent = "AI 이미지 프롬프트 (영어 권장)";
    const promptArea = document.createElement("textarea");
    promptArea.rows = 3;
    promptArea.dataset.field = "cut-prompt";
    promptArea.dataset.index = String(index);
    promptArea.value = cut.aiPrompt;
    promptField.append(promptSpan, promptArea);
    fields.appendChild(promptField);

    card.appendChild(fields);

    const row = document.createElement("div");
    row.className = "row wrap";
    const regen = document.createElement("button");
    regen.type = "button";
    regen.className = "btn";
    regen.dataset.action = "regen-cut";
    regen.dataset.index = String(index);
    regen.textContent = "✨ 이 컷 이미지";
    const reroll = document.createElement("button");
    reroll.type = "button";
    reroll.className = "btn ghost";
    reroll.dataset.action = "reroll-cut";
    reroll.dataset.index = String(index);
    reroll.textContent = "프롬프트 새로";
    row.append(regen, reroll);
    card.appendChild(row);

    grid.appendChild(card);
  });
}

function field(labelText, dataField, value, tag = "input", rows = 2, index = 0) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement(tag);
  input.dataset.field = dataField;
  input.dataset.index = String(index);
  if (tag === "textarea") {
    input.rows = rows;
    input.value = value || "";
  } else {
    input.value = value || "";
  }
  wrap.append(span, input);
  return wrap;
}

function updateCutFromInput(target) {
  const index = Number(target.dataset.index);
  const cut = state.cuts[index];
  if (!cut) return;
  const fieldName = target.dataset.field;
  if (fieldName === "cut-narration") cut.narration = target.value;
  else if (fieldName === "cut-dialogue") cut.dialogue = target.value;
  else if (fieldName === "cut-speaker") cut.speaker = target.value;
  else if (fieldName === "cut-expression") cut.expression = target.value;
  else if (fieldName === "cut-prompt") {
    cut.aiPrompt = target.value;
    cut.promptEdited = true;
  } else return;
  renderComic();
}

function renderComic() {
  const canvas = $("comicCanvas");
  if (!state.article) return;
  renderSheet(canvas, {
    cuts: state.cuts,
    images: state.images,
    style: state.style,
    layout: state.layout,
    article: state.article,
  });
  const aiCount = Object.keys(state.images).length;
  const status = $("comicStatus");
  if (aiCount === 0) status.textContent = "Canvas 폴백 아트 · " + styleTheme(state.style).name;
  else if (aiCount === 4) status.textContent = "AI 이미지 4/4";
  else status.textContent = `AI ${aiCount}/4 · 나머지 Canvas 폴백`;
}

async function requestImage(prompt, { width = 1024, height = 1024 } = {}) {
  const byok = state.byok;
  const useByok = byok.provider !== "free" && ((byok.provider === "openai" && byok.openai) || (byok.provider === "gemini" && byok.gemini));
  const body = {
    prompt,
    width,
    height,
    seed: Math.floor(Math.random() * 900000) + 1000,
    provider: useByok ? byok.provider : "free",
  };
  if (useByok) {
    body.apiKey = byok.provider === "openai" ? byok.openai : byok.gemini;
    if (byok.model) body.model = byok.model;
  }
  let result;
  try {
    result = await api("/api/generate-image", { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    result = { data: { ok: false, mode: "fallback", reason: "네트워크 오류" } };
  }
  if (result.data && result.data.ok && result.data.dataUrl) {
    const image = await loadImage(result.data.dataUrl);
    if (image) return { ok: true, image, provider: result.data.provider, prompt: result.data.prompt || prompt };
  }
  return { ok: false, reason: (result.data && result.data.reason) || "이미지를 만들지 못했습니다." };
}

async function generateCutImage(cut) {
  const prompt = (cut.aiPrompt && cut.aiPrompt.trim()) || cutPrompt(cut, state.style, state.article);
  const result = await requestImage(prompt);
  if (result.ok) {
    state.images[cut.index] = result.image;
    state.imageMeta[cut.index] = { ai: true, provider: result.provider };
    updateCutImageState(cut.index, true);
    renderComic();
    return { ok: true };
  }
  delete state.images[cut.index];
  state.imageMeta[cut.index] = { ai: false, reason: result.reason };
  updateCutImageState(cut.index, false);
  renderComic();
  return { ok: false, reason: result.reason };
}

/* ------------------------------------------------------------------ *
 * 카드뉴스 이미지 (기사 본문 배분 · 카드별 AI 생성)
 * ------------------------------------------------------------------ */

function resetCardImages(silent = false) {
  state.cardImages = state.cards.map(() => null);
  state.cardImageMeta = state.cards.map(() => ({}));
  if (!silent) {
    renderCardPreview();
    renderCardImageControls();
    updateCardImageStatus();
  }
}

/** 기사 본문 이미지를 카드 순서대로 배분한다(프록시만 사용, AI 호출 없음). */
async function distributeCardArticleImages({ progress = null, silent = false } = {}) {
  const urls = state.articleImages || [];
  if (!state.cards.length) return 0;
  if (state.cardImages.length !== state.cards.length) resetCardImages(true);
  let assigned = 0;
  for (let i = 0; i < state.cards.length && i < urls.length; i += 1) {
    if (state.cardImages[i] && state.cardImageMeta[i] && state.cardImageMeta[i].mode === "article") continue;
    const image = await proxyArticleImage(urls[i]);
    if (!image) continue;
    state.cardImages[i] = image;
    state.cardImageMeta[i] = { mode: "article", url: urls[i] };
    assigned += 1;
    if (progress) setProgress(progress, assigned / Math.max(state.cards.length, 1));
  }
  if (!silent) {
    renderCardPreview();
    renderCardImageControls();
    updateCardImageStatus();
  }
  return assigned;
}

async function generateCardImage(index) {
  const card = state.cards[index];
  if (!card) return { ok: false, reason: "카드가 없습니다." };
  const prompt =
    (card.imagePrompt && card.imagePrompt.trim()) ||
    cardImagePrompt(card, state.style, state.article, index, state.cards.length);
  const result = await requestImage(prompt, { width: 1080, height: 1350 });
  if (result.ok) {
    state.cardImages[index] = result.image;
    state.cardImageMeta[index] = { mode: "ai", provider: result.provider };
    if (state.activeCard === index) renderCardPreview();
    renderCardImageControls();
    updateCardImageStatus();
    return { ok: true };
  }
  state.cardImageMeta[index] = { ...(state.cardImageMeta[index] || {}), reason: result.reason };
  updateCardImageStatus();
  return { ok: false, reason: result.reason };
}

/** 모자란 카드만 AI로 채운다. */
async function fillCardImages() {
  if (!state.article || state.busy) return;
  state.busy = true;
  const button = $("cardImagesFill");
  const progress = $("cardImageProgress");
  if (button) {
    button.disabled = true;
    button.textContent = "채우는 중…";
  }
  let filled = 0;
  let lastReason = "";
  try {
    if (state.cardImageMode === "article") {
      filled = await distributeCardArticleImages({ progress });
      for (let i = 0; i < state.cards.length; i += 1) {
        if (state.cardImages[i]) continue;
        const result = await generateCardImage(i);
        if (result.ok) filled += 1;
        else lastReason = result.reason;
        if (progress) setProgress(progress, (i + 1) / Math.max(state.cards.length, 1));
      }
    } else {
      for (let i = 0; i < state.cards.length; i += 1) {
        const result = await generateCardImage(i);
        if (result.ok) filled += 1;
        else lastReason = result.reason;
        if (progress) setProgress(progress, (i + 1) / Math.max(state.cards.length, 1));
      }
    }
    if (progress) setProgress(progress, 1, false);
    renderCardPreview();
    updateCardImageStatus();
    if (!filled) toast(lastReason || "카드 이미지를 만들지 못했습니다.", "err");
    else toast(`카드 ${filled}장에 이미지를 넣었습니다.`, "ok");
  } finally {
    state.busy = false;
    if (button) {
      button.disabled = false;
      button.textContent = "🖼️ 카드 이미지 채우기";
    }
  }
}

async function assignCardArticleImage(url) {
  const index = state.activeCard;
  if (!url) {
    state.cardImages[index] = null;
    state.cardImageMeta[index] = {};
    renderCardPreview();
    renderCardImageControls();
    updateCardImageStatus();
    return;
  }
  const image = await proxyArticleImage(url);
  if (!image) {
    toast("이미지를 불러오지 못했습니다. 다른 이미지를 골라 주세요.", "err");
    return;
  }
  state.cardImages[index] = image;
  state.cardImageMeta[index] = { mode: "article", url };
  renderCardPreview();
  renderCardImageControls();
  updateCardImageStatus();
  toast(`${index + 1}장에 기사 이미지를 넣었습니다.`, "ok");
}

function updateCardImageStatus() {
  const node = $("cardImageStatus");
  if (!node) return;
  const total = state.cards.length;
  const article = state.cardImageMeta.filter((meta) => meta && meta.mode === "article").length;
  const ai = state.cardImageMeta.filter((meta) => meta && meta.mode === "ai").length;
  const missing = Math.max(0, total - article - ai);
  node.textContent = total ? `기사 이미지 ${article} · AI ${ai} · 비어 있음 ${missing}` : "이미지 없음";
}

function renderCardImageControls() {
  const select = $("cardImageSource");
  const promptField = $("cardImagePrompt");
  const card = state.cards[state.activeCard];
  if (!select || !card) return;
  const meta = state.cardImageMeta[state.activeCard] || {};
  const urls = state.articleImages || [];
  select.textContent = "";
  const items = [{ value: "", label: "이미지 없음 (Canvas 아트)" }, { value: "ai", label: "✨ AI 이미지 새로 생성" }];
  urls.forEach((url, index) => items.push({ value: "img:" + url, label: `🖼️ 기사 이미지 ${index + 1}` }));
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  }
  select.value = meta.mode === "article" && meta.url ? "img:" + meta.url : meta.mode === "ai" ? "ai" : "";
  if (promptField && document.activeElement !== promptField) {
    promptField.value = card.imagePrompt || "";
  }
}

/** 기사 본문 기반 영문 프롬프트(서버 Workers AI)를 받아온다. */
async function preparePrompts() {
  if (!state.article) return;
  const token = ++state.promptToken;
  const payload = {
    article: {
      title: state.article.title,
      subtitle: state.article.subtitle,
      body: String(state.article.body || "").slice(0, 4000),
    },
    cuts: state.cuts.map((cut) => ({ index: cut.index, narration: cut.narration, roleLabel: cut.roleLabel })),
    cards: state.cards.map((card) => ({
      no: card.no,
      kind: card.kind,
      kindLabel: card.kindLabel,
      title: card.title,
      lines: card.lines,
    })),
    style: state.style,
  };
  let data = null;
  try {
    const result = await api("/api/build-prompts", { method: "POST", body: JSON.stringify(payload) });
    data = result.data || null;
  } catch (e) {
    data = null;
  }
  if (!data || !data.ok || token !== state.promptToken) {
    setPromptBadge("기본 장면 프롬프트");
    return;
  }
  if (Array.isArray(data.cutPrompts)) {
    state.cuts.forEach((cut, index) => {
      if (cut.promptEdited) return;
      if (data.cutPrompts[index]) cut.aiPrompt = data.cutPrompts[index];
    });
  }
  if (Array.isArray(data.cardPrompts)) {
    state.cards.forEach((card, index) => {
      if (card.promptEdited) return;
      if (data.cardPrompts[index]) card.imagePrompt = data.cardPrompts[index];
      if (state.baseCards[index]) state.baseCards[index].imagePrompt = card.imagePrompt;
    });
  }
  state.promptSource = data.provider || "";
  setPromptBadge(data.provider === "workers-ai" ? "본문 기반 프롬프트 · Workers AI" : "기본 장면 프롬프트");
  renderCuts();
  renderCardImageControls();
}

function setPromptBadge(text) {
  for (const id of ["promptBadge", "cardPromptBadge"]) {
    const node = $(id);
    if (!node) continue;
    node.textContent = text;
    node.className = "pill " + (text.includes("Workers") ? "" : "local");
  }
}


function updateCutImageState(index, isAi, label = "") {
  const node = document.querySelector(`[data-cut="${index}"] [data-role="imgstate"]`);
  if (!node) return;
  node.className = "imgstate " + (isAi ? "ai" : "fallback");
  node.textContent = label || (isAi ? "AI 이미지" : "Canvas 아트");
}

async function proxyArticleImage(url) {
  if (!url) return null;
  if (state.proxyCache[url]) return state.proxyCache[url];
  try {
    const result = await api("/api/proxy-image?url=" + encodeURIComponent(url));
    if (result.data && result.data.ok && result.data.dataUrl) {
      const image = await loadImage(result.data.dataUrl);
      if (image) {
        state.proxyCache[url] = image;
        return image;
      }
    }
  } catch (e) {
    /* 프록시 실패는 무시하고 다음 후보로 */
  }
  return null;
}

async function applyArticleImages({ aiFill = false, progress = null } = {}) {
  const article = state.article;
  if (!article) return { filled: 0, total: 0 };
  const urls = [];
  const push = (url) => {
    if (url && /^https?:/i.test(url) && !urls.includes(url)) urls.push(url);
  };
  push(article.image);
  for (const url of article.bodyImages || []) push(url);
  for (const url of article.images || []) push(url);

  let filled = 0;
  for (let i = 0; i < state.cuts.length; i += 1) {
    const cut = state.cuts[i];
    const url = urls[i];
    if (!url) break;
    const image = await proxyArticleImage(url);
    if (!image) continue;
    state.images[cut.index] = image;
    state.imageMeta[cut.index] = { mode: "article", url };
    filled += 1;
    updateCutImageState(cut.index, true, "기사 이미지");
    if (progress) setProgress(progress, filled / Math.max(state.cuts.length, 1));
  }

  if (aiFill) {
    for (const cut of state.cuts) {
      if (state.images[cut.index]) continue;
      const result = await generateCutImage(cut);
      if (result.ok) filled += 1;
    }
  }
  renderComic();
  return { filled, total: urls.length };
}

async function generateAllImages() {
  if (!state.article || state.busy) return;
  state.busy = true;
  const button = $("generateAll");
  button.disabled = true;
  button.textContent = "생성 중…";
  const progress = $("cutsProgress");
  let success = 0;
  let lastReason = "";

  if (state.imageMode === "article") {
    const applied = await applyArticleImages({ aiFill: false, progress });
    success = applied.filled;
    for (const cut of state.cuts) {
      if (state.images[cut.index]) continue;
      const result = await generateCutImage(cut);
      if (result.ok) success += 1;
      else lastReason = result.reason;
    }
    setProgress(progress, 1, false);
    button.disabled = false;
    button.textContent = "🖼️ 기사 이미지로 4컷 구성";
    state.busy = false;
    if (success === 0) toast("기사 이미지를 불러오지 못해 Canvas 아트로 그렸습니다. " + (lastReason || ""), "");
    else toast(`기사 이미지 ${applied.filled}컷 + 보충 ${success - applied.filled}컷으로 4컷을 구성했습니다.`, "ok");
    return;
  }

  for (let i = 0; i < state.cuts.length; i += 1) {
    setProgress(progress, i / state.cuts.length);
    const result = await generateCutImage(state.cuts[i]);
    if (result.ok) success += 1;
    else lastReason = result.reason;
    setProgress(progress, (i + 1) / state.cuts.length);
  }
  setProgress(progress, 1, false);
  button.disabled = false;
  button.textContent = "✨ AI 이미지 4컷 생성";
  state.busy = false;
  if (success === 4) toast("AI 이미지 4컷을 만들었습니다.", "ok");
  else if (success === 0) toast("AI 이미지를 못 받아 스타일별 Canvas 아트로 대체했습니다. " + (lastReason || ""), "");
  else toast(`AI 이미지 ${success}/4 생성 — 나머지는 Canvas 아트로 그렸습니다.`, "");
}

async function downloadSheet() {
  const canvas = $("comicCanvas");
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  downloadBlob(blob, `newspic-4cut-${state.style}-${state.layout}-${todayStamp()}.png`);
  toast("합본 PNG를 저장했습니다.", "ok");
}

async function downloadCuts() {
  for (const cut of state.cuts) {
    const canvas = renderCutCanvas(cut, state.style, state.images[cut.index] || null, state.article);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    downloadBlob(blob, `newspic-cut-${cut.index}-${todayStamp()}.png`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  toast("컷 4장 PNG를 저장했습니다.", "ok");
}

/* ------------------------------------------------------------------ *
 * 카드뉴스 8장
 * ------------------------------------------------------------------ */

function renderSlideList() {
  const list = $("slideList");
  list.textContent = "";
  state.cards.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slide-item" + (state.activeCard === index ? " active" : "");
    button.dataset.card = String(index);
    const no = document.createElement("span");
    no.className = "no";
    no.textContent = String(index + 1).padStart(2, "0");
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = kindLabel(card.kind);
    button.append(no, kind);
    list.appendChild(button);
  });
}

function renderCardEditor() {
  const card = state.cards[state.activeCard];
  if (!card) return;
  $("slideHeading").textContent = `${card.no}장 · ${kindLabel(card.kind)}`;
  $("editorKind").textContent = kindLabel(card.kind);
  $("cardKicker").value = card.kicker || "";
  $("cardTitleInput").value = card.title || "";
  $("cardLines").value = (card.lines || []).join("\n");
  $("cardFooter").value = card.footer || "";
  const info = ratioInfo(state.ratio);
  $("cardSize").textContent = `${info.width}×${info.height}`;
  const zip = $("downloadZip");
  if (zip) zip.textContent = `${state.cardCount}장 ZIP 저장`;
  renderCardImageControls();
  updateCardImageStatus();
}

function cardVisuals() {
  const visuals = [];
  for (const card of state.cards) visuals.push(null);
  for (let i = 0; i < state.cards.length; i += 1) visuals[i] = state.cardImages[i] || null;
  return visuals;
}

function visualFor(index, visuals) {
  if (!visuals.length) return null;
  return visuals[index] || null;
}

function renderCardPreview() {
  if (!state.article) return;
  const canvas = $("cardCanvas");
  const card = state.cards[state.activeCard];
  if (!card) return;
  const info = ratioInfo(state.ratio);
  canvas.width = info.width;
  canvas.height = info.height;
  const visual = state.cardImages[state.activeCard] || null;
  const rendered = renderCardCanvas(card, state.cardTheme, state.ratio, visual, {
    total: state.cards.length,
    layout: state.cardLayout,
    index: state.activeCard,
    site: state.article.site,
  });
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(rendered, 0, 0);
}

function rebuildCards() {
  if (!state.article) return;
  const partnerUrl = partnerUrlNow();
  const storyboard = buildStoryboard(state.article, { partnerUrl, cardCount: state.cardCount, accounts: state.accounts });
  state.baseCards = storyboard.cards.map((card) => ({ ...card, lines: [...card.lines] }));
  state.cards = storyboard.cards.map((card) => ({ ...card, lines: [...card.lines] }));
  state.channels = storyboard.channels;
  state.activeCard = Math.max(0, Math.min(state.activeCard, state.cards.length - 1));
  state.cardImages = state.cards.map(() => null);
  state.cardImageMeta = state.cards.map(() => ({}));
  renderChips();
  renderSlideList();
  renderCardEditor();
  renderCardPreview();
  renderChannel();
  renderChannelPackages();
  const zip = $("downloadZip");
  if (zip) zip.textContent = `${state.cardCount}장 ZIP 저장`;
  distributeCardArticleImages({}).catch(() => {});
  preparePrompts().catch(() => {});
}

function updateCardFromInputs() {
  const card = state.cards[state.activeCard];
  if (!card) return;
  card.kicker = $("cardKicker").value;
  card.title = $("cardTitleInput").value;
  card.lines = $("cardLines").value.split("\n").filter((line, index, all) => line.trim() || all.length === 1);
  card.footer = $("cardFooter").value;
  renderCardPreview();
  renderSlideList();
  refreshChannelsFromCards();
}

function refreshChannelsFromCards() {
  if (!state.article) return;
  const partnerUrl = partnerUrlNow();
  state.channels = buildChannels(state.article, state.cards, partnerUrl, { accounts: state.accounts });
  if ($("channelBody")) renderChannel();
}

function selectCard(index) {
  state.activeCard = Math.max(0, Math.min(state.cards.length - 1, index));
  renderSlideList();
  renderCardEditor();
  renderCardPreview();
}

function resetCard() {
  const base = state.baseCards[state.activeCard];
  if (!base) return;
  state.cards[state.activeCard] = { ...base, lines: [...base.lines] };
  renderCardEditor();
  renderCardPreview();
  refreshChannelsFromCards();
  toast("자동 문구로 되돌렸습니다.", "ok");
}
async function downloadCard() {
  const canvas = $("cardCanvas");
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  downloadBlob(blob, `newspic-card-${state.activeCard + 1}-${state.ratio.replace(":", "x")}-${todayStamp()}.png`);
  toast("카드 PNG를 저장했습니다.", "ok");
}

async function downloadCardsZip() {
  const button = $("downloadZip");
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "묶는 중…";
  try {
    const files = [];
    for (let i = 0; i < state.cards.length; i += 1) {
      const card = state.cards[i];
      const visual = state.cardImages[i] || null;
      const canvas = renderCardCanvas(card, state.cardTheme, state.ratio, visual, {
        total: state.cards.length,
        layout: state.cardLayout,
        index: i,
        site: state.article.site,
      });
      const data = await canvasToBytes(canvas);
      files.push({ name: `card-${String(i + 1).padStart(2, "0")}-${card.kind}.png`, data });
    }
    const zip = buildZip(files);
    downloadBlob(
      new Blob([zip], { type: "application/zip" }),
      `newspic-cards${state.cardCount}-${state.cardLayout}-${state.ratio.replace(":", "x")}-${todayStamp()}.zip`
    );
    toast(`카드뉴스 ${state.cardCount}장을 ZIP으로 저장했습니다.`, "ok");
  } catch (e) {
    toast("ZIP을 만들지 못했습니다. 카드를 하나씩 저장해 주세요.", "err");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/* ------------------------------------------------------------------ *
 * 6개 채널
 * ------------------------------------------------------------------ */

function renderPlatformTabs() {
  const row = $("platformRow");
  row.textContent = "";
  for (const platform of PLATFORMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.activePlatform === platform.id ? " active" : "");
    button.dataset.platform = platform.id;
    button.textContent = `${platform.emoji} ${platform.name}`;
    row.appendChild(button);
  }
}

function currentChannel() {
  return state.channels[state.activePlatform] || null;
}

/** 인텐트 URL에 본문과 계정(@via)을 붙인다. */
function openIntentFor(pack, body) {
  if (!pack) return;
  if (pack.id === "instagram" || pack.id === "facebook") {
    if (pack.shareUrl) window.open(pack.shareUrl, "_blank", "noopener");
    else toast("인스타·페이스북은 앱에서 이미지를 올린 뒤 본문을 붙여넣어 주세요.");
    return;
  }
  if (!pack.intentUrl) return;
  let url = pack.intentUrl + encodeURIComponent(body || "");
  if (pack.via && pack.id === "x") url += "&via=" + encodeURIComponent(pack.via);
  window.open(url, "_blank", "noopener");
}

function renderChannel() {
  const pack = currentChannel();
  if (!pack) return;
  $("channelName").textContent = `${pack.emoji} ${pack.name}`;
  const account = pack.account || normalizeAccount((state.accounts || {})[state.activePlatform]);
  const accountNode = $("channelAccount");
  if (accountNode) {
    accountNode.textContent = account.handle
      ? `${account.handle}${account.webhook ? " · 웹훅" : ""}${account.token ? " · 토큰" : ""}`
      : "계정 미입력";
    accountNode.title = account.memo || "";
  }
  $("channelBody").value = pack.body || "";
  updateChannelChars();
  $("channelComment").textContent = pack.firstComment || "—";
  $("channelTips").textContent = (pack.tips || []).join(" · ");

  const titleField = $("channelTitleField");
  if (pack.id === "youtube") {
    titleField.hidden = false;
    $("channelTitleInput").value = pack.title || "";
  } else {
    titleField.hidden = true;
  }

  const intent = $("openIntent");
  intent.hidden = !pack.intentUrl;
  const share = pack.shareUrl;
  $("copyAll").dataset.share = share || "";
}

function updateChannelChars() {
  const pack = currentChannel();
  if (!pack) return;
  const length = $("channelBody").value.length;
  const limit = pack.limit || 500;
  $("channelChars").textContent = `${length} / ${limit}자`;
  $("channelChars").style.color = length > limit ? "#fca5a5" : length > limit * 0.92 ? "#fcd34d" : "";
}

function renderChannelSelection() {
  const row = $("channelSelectRow");
  if (!row) return;
  row.textContent = "";
  for (const platform of PLATFORMS) {
    const label = document.createElement("label");
    label.className = "channel-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.channel = platform.id;
    input.checked = state.selectedChannels.includes(platform.id);
    const span = document.createElement("span");
    span.textContent = `${platform.emoji} ${platform.name}`;
    label.append(input, span);
    row.appendChild(label);
  }
  const count = state.selectedChannels.length;
  const node = $("channelSelectedCount");
  if (node) node.textContent = `${count}개 선택 / ${PLATFORMS.length}개`;
}

function selectedPlatforms() {
  return PLATFORMS.filter((platform) => state.selectedChannels.includes(platform.id));
}

function renderChannelPackages() {
  const wrap = $("channelPackages");
  if (!wrap) return;
  wrap.textContent = "";
  const selected = selectedPlatforms();
  if (!state.article) return;
  if (!selected.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "채널을 하나 이상 선택하면 채널별 본문·해시태그·첫 댓글 패키지가 여기에 표시됩니다.";
    wrap.appendChild(empty);
    return;
  }

  for (const platform of selected) {
    const pack = state.channels[platform.id];
    if (!pack) continue;
    const card = document.createElement("article");
    card.className = "channel-package";
    card.dataset.package = platform.id;

    const head = document.createElement("div");
    head.className = "package-head";
    const name = document.createElement("strong");
    name.textContent = `${platform.emoji} ${platform.name}`;
    const chars = document.createElement("span");
    chars.className = "tiny";
    chars.textContent = `${(pack.body || "").length} / ${pack.limit}자`;
    head.append(name, chars);
    if (pack.account && pack.account.handle) {
      const account = document.createElement("span");
      account.className = "feed-badge partner package-account";
      account.textContent = pack.account.handle;
      head.appendChild(account);
    }
    card.appendChild(head);

    const body = document.createElement("p");
    body.className = "package-body";
    body.textContent = pack.body || "";
    card.appendChild(body);

    const tags = document.createElement("p");
    tags.className = "package-tags";
    tags.textContent = (pack.hashtags || []).join(" ");
    card.appendChild(tags);

    const row = document.createElement("div");
    row.className = "row wrap package-actions";
    const add = (label, action, primary = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn" + (primary ? " primary" : "") + " package-btn";
      button.dataset.packageAction = action;
      button.textContent = label;
      row.appendChild(button);
    };
    add("본문 복사", "copy-body");
    add("첫 댓글 링크", "copy-comment");
    add("해시태그", "copy-tags");
    if (pack.accountUrl) add("계정 열기 ↗", "account");
    if (pack.intentUrl || pack.shareUrl) add("작성창 열기 ↗", "open", true);
    add("카드 ZIP", "zip");
    if (pack.id === "tiktok" || pack.id === "youtube") add("영상 만들기", "video");
    card.appendChild(row);
    wrap.appendChild(card);
  }
}

async function handlePackageAction(action, platformId) {
  const pack = state.channels[platformId];
  if (!pack) return;
  if (action === "copy-body") return copyText(pack.body || "", "본문을 복사했습니다.");
  if (action === "copy-comment") return copyText(pack.firstComment || "", "첫 댓글 링크를 복사했습니다.");
  if (action === "copy-tags") return copyText((pack.hashtags || []).join(" "), "해시태그를 복사했습니다.");
  if (action === "account") {
    if (pack.accountUrl) window.open(pack.accountUrl, "_blank", "noopener");
    return;
  }
  if (action === "open") {
    if (pack.id === "instagram" || pack.id === "facebook") {
      if (pack.shareUrl) window.open(pack.shareUrl, "_blank", "noopener");
      else toast("인스타·페이스북은 앱에서 이미지를 올린 뒤 본문을 붙여넣어 주세요.");
      return;
    }
    openIntentFor(pack, pack.body || "");
    return;
  }
  if (action === "zip") return downloadCardsZip();
  if (action === "video") return makeVideo();
}

async function makeVideo() {
  if (!videoSupported()) {
    toast("이 브라우저는 영상 녹화를 지원하지 않습니다. Chrome·Safari 최신 버전에서 시도해 주세요.", "err");
    return null;
  }
  const button = $("makeVideo");
  const progress = $("videoProgress");
  button.disabled = true;
  button.textContent = "영상 만드는 중…";
  setProgress(progress, 0);
  try {
    const visuals = cardVisuals();
    const blob = await recordSlideshow({
      cards: state.cards,
      theme: state.cardTheme,
      visuals,
      layout: state.cardLayout,
      imageEl: state.cardImages[0] || null,
      secondsPerSlide: 2.2,
      onProgress: (value) => setProgress(progress, value),
    });
    if (state.slideshowUrl) URL.revokeObjectURL(state.slideshowUrl);
    state.slideshowUrl = URL.createObjectURL(blob);
    const link = $("videoDownload");
    link.href = state.slideshowUrl;
    link.download = `newspic-cards${state.cardCount}-9x16-${todayStamp()}.webm`;
    link.hidden = false;
    setProgress(progress, 1, false);
    toast("9:16 슬라이드 영상(.webm)을 만들었습니다.", "ok");
    return blob;
  } catch (error) {
    setProgress(progress, 1, false);
    toast((error && error.message) || "영상을 만들지 못했습니다.", "err");
    return null;
  } finally {
    button.disabled = false;
    button.textContent = "🎬 슬라이드 영상 만들기";
  }
}

/* ------------------------------------------------------------------ *
 * 자동 생성 (분 단위 간격)
 * ------------------------------------------------------------------ */

const AUTO_PRESETS = [1, 5, 10, 30, 60];

function renderAutoIntervals() {
  const row = $("autoIntervalRow");
  if (!row) return;
  row.textContent = "";
  for (const minutes of AUTO_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (state.auto.minutes === minutes ? " active" : "");
    button.dataset.autoMinutes = String(minutes);
    button.textContent = minutes + "분";
    row.appendChild(button);
  }
  const custom = document.createElement("span");
  custom.className = "chip static";
  custom.textContent = state.auto.minutes + "분 간격";
  row.appendChild(custom);
  const input = $("autoMinutes");
  if (input && document.activeElement !== input) input.value = String(state.auto.minutes);
}

function renderAutoOutputs() {
  const row = $("autoOutputRow");
  if (!row) return;
  row.textContent = "";
  const items = [
    { id: "cards", label: "카드뉴스", on: state.auto.outputs.cards && !state.auto.outputs.cuts },
    { id: "cuts", label: "4컷 만화", on: !state.auto.outputs.cards && state.auto.outputs.cuts },
    { id: "both", label: "둘 다", on: state.auto.outputs.cards && state.auto.outputs.cuts },
  ];
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (item.on ? " active" : "");
    button.dataset.autoOutput = item.id;
    button.textContent = item.label;
    row.appendChild(button);
  }
}

function updateAutoCountdown() {
  const node = $("autoCountdown");
  if (!node) return;
  if (!state.auto.enabled) {
    node.textContent = "수동 생성 모드입니다.";
    return;
  }
  if (state.auto.running) {
    node.textContent = "자동 생성 실행 중…";
    return;
  }
  const remain = Math.max(0, state.auto.nextAt - Date.now());
  const minutes = Math.floor(remain / 60000);
  const seconds = Math.floor((remain % 60000) / 1000);
  node.textContent = `다음 자동 생성까지 ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} · ${state.auto.minutes}분 간격`;
}

function scheduleAuto() {
  if (state.auto.timer) {
    clearInterval(state.auto.timer);
    state.auto.timer = null;
  }
  if (!state.auto.enabled) {
    state.auto.nextAt = 0;
    updateAutoCountdown();
    return;
  }
  state.auto.nextAt = Date.now() + state.auto.minutes * 60000;
  state.auto.timer = setInterval(() => {
    updateAutoCountdown();
    if (Date.now() >= state.auto.nextAt && !state.auto.running) {
      state.auto.nextAt = Date.now() + state.auto.minutes * 60000;
      runAutoOnce("timer");
    }
  }, 1000);
  updateAutoCountdown();
}

function renderAuto() {
  const toggle = $("autoToggle");
  if (!toggle) return;
  toggle.checked = state.auto.enabled;
  const statePill = $("autoState");
  statePill.textContent = state.auto.enabled ? "자동 생성 ON" : "수동 생성";
  statePill.className = "pill" + (state.auto.enabled ? "" : " local");
  $("autoSettings").hidden = !state.auto.enabled;
  renderAutoIntervals();
  renderAutoOutputs();
  updateAutoCountdown();
  renderAutoQueue();
}

function setAutoEnabled(enabled, { silent = false } = {}) {
  state.auto.enabled = Boolean(enabled);
  savePrefs();
  scheduleAuto();
  renderAuto();
  if (!silent) {
    toast(
      state.auto.enabled
        ? `자동 생성 ON — ${state.auto.minutes}분마다 새 기사로 산출물을 만듭니다.`
        : "자동 생성을 멈추고 수동 생성으로 돌아갔습니다.",
      "ok"
    );
  }
}

function thumbFromCanvas(canvas, width = 360) {
  const scale = width / canvas.width;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#0b0f16";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.72);
}

async function runAutoOnce(source = "manual") {
  if (state.auto.running) {
    toast("자동 생성이 이미 실행 중입니다.");
    return null;
  }
  if (state.busy) {
    toast("다른 작업이 끝난 뒤에 다시 실행해 주세요.", "err");
    return null;
  }
  state.auto.running = true;
  state.busy = true;
  const button = $("autoRunOnce");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "생성 중…";
  updateAutoCountdown();
  try {
    if (!state.feed.items.length) await loadFeed(state.feed.category);
    let item = state.feed.items.find((entry) => !state.auto.used.has(entry.id));
    if (!item) {
      await loadFeed(state.feed.category);
      item = state.feed.items.find((entry) => !state.auto.used.has(entry.id));
    }
    if (!item) throw new Error("새 기사가 없습니다. 피드가 갱신될 때까지 기다리거나 분류를 바꿔 보세요.");

    let article = null;
    if (item.url) {
      const result = await api("/api/mirror", {
        method: "POST",
        body: JSON.stringify({ url: item.url, pn: state.partnerCode }),
      });
      if (result.data && result.data.ok && result.data.article) article = result.data.article;
    }
    if (!article) {
      const bodyText = item.body || item.summary || item.title;
      const manual = await api("/api/mirror", {
        method: "POST",
        body: JSON.stringify({ manual: true, title: item.title, body: bodyText, url: item.url || "", pn: state.partnerCode }),
      });
      if (manual.data && manual.data.ok) article = manual.data.article;
    }
    if (!article) throw new Error("기사를 미러링하지 못했습니다.");
    state.auto.used.add(item.id);
    article.partnerUrl = partnerUrlNow(article);
    if (state.storage !== "kv") saveLocalArticle(article);

    const storyboard = buildStoryboard(article, { partnerUrl: article.partnerUrl, cardCount: state.cardCount });
    const visualUrl = article.image || (article.images || [])[0] || "";
    const visual = visualUrl ? await proxyArticleImage(visualUrl) : null;
    const entry = {
      id: "auto" + Date.now(),
      at: new Date().toISOString(),
      source,
      title: article.title,
      site: article.site || item.site || "뉴스픽",
      article,
      cuts: storyboard.cuts,
      cards: storyboard.cards,
      count: storyboard.cards.length,
      visualUrl,
      outputs: { ...state.auto.outputs },
      thumb: "",
      cutThumb: "",
    };

    if (state.auto.outputs.cards) {
      const first = renderCardCanvas(storyboard.cards[0], state.cardTheme, state.ratio, visual, {
        total: storyboard.cards.length,
        layout: state.cardLayout,
        index: 0,
        site: article.site,
      });
      entry.thumb = thumbFromCanvas(first, 320);
    }
    if (state.auto.outputs.cuts) {
      const sheet = document.createElement("canvas");
      const images = visual ? { 1: visual, 2: visual } : {};
      renderSheet(sheet, { cuts: storyboard.cuts, images, style: state.style, layout: "grid", article });
      entry.cutThumb = thumbFromCanvas(sheet, 320);
      if (!entry.thumb) entry.thumb = entry.cutThumb;
    }

    state.auto.queue.unshift(entry);
    if (state.auto.queue.length > 12) state.auto.queue.pop();
    renderAutoQueue();
    toast(`자동 생성 1건 완료 — ${entry.title}`, "ok");
    return entry;
  } catch (error) {
    toast((error && error.message) || "자동 생성에 실패했습니다.", "err");
    return null;
  } finally {
    state.auto.running = false;
    state.busy = false;
    button.disabled = false;
    button.textContent = original;
    updateAutoCountdown();
  }
}

function renderAutoQueue() {
  const list = $("autoQueue");
  if (!list) return;
  list.textContent = "";
  const queue = state.auto.queue || [];
  $("autoQueueCount").textContent = `${queue.length}건`;
  $("autoQueueEmpty").hidden = queue.length > 0;
  for (const entry of queue) {
    const li = document.createElement("li");
    li.className = "auto-item";
    li.dataset.autoId = entry.id;

    const thumb = document.createElement("img");
    thumb.className = "auto-thumb";
    thumb.src = entry.thumb || entry.cutThumb;
    thumb.alt = "";
    li.appendChild(thumb);

    const body = document.createElement("div");
    body.className = "auto-body";
    const title = document.createElement("strong");
    title.textContent = entry.title;
    body.appendChild(title);
    const meta = document.createElement("span");
    meta.className = "tiny";
    const time = feedDate(entry.at);
    const parts = [];
    if (entry.outputs.cards) parts.push(`카드 ${entry.count}장`);
    if (entry.outputs.cuts) parts.push("4컷 합본");
    meta.textContent = [time, entry.site, parts.join(" · ")].filter(Boolean).join(" · ");
    body.appendChild(meta);

    const row = document.createElement("div");
    row.className = "row wrap auto-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "btn ghost package-btn";
    open.dataset.autoOpen = entry.id;
    open.textContent = "열기";
    row.appendChild(open);
    if (entry.outputs.cards) {
      const cards = document.createElement("button");
      cards.type = "button";
      cards.className = "btn package-btn";
      cards.dataset.autoDownload = "cards";
      cards.dataset.autoId = entry.id;
      cards.textContent = "카드 ZIP";
      row.appendChild(cards);
    }
    if (entry.outputs.cuts) {
      const cuts = document.createElement("button");
      cuts.type = "button";
      cuts.className = "btn package-btn";
      cuts.dataset.autoDownload = "cuts";
      cuts.dataset.autoId = entry.id;
      cuts.textContent = "4컷 PNG";
      row.appendChild(cuts);
    }
    body.appendChild(row);
    li.appendChild(body);
    list.appendChild(li);
  }
}

async function downloadAutoItem(entry, type) {
  if (!entry) return;
  const article = entry.article;
  const partnerUrl = article.partnerUrl || partnerUrlNow(article);
  const visual = entry.visualUrl ? await proxyArticleImage(entry.visualUrl) : null;
  if (type === "cards") {
    const files = [];
    for (let i = 0; i < entry.cards.length; i += 1) {
      const card = entry.cards[i];
      const canvas = renderCardCanvas(card, state.cardTheme, state.ratio, visual, {
        total: entry.cards.length,
        layout: state.cardLayout,
        index: i,
        site: article.site,
      });
      files.push({ name: `card-${String(i + 1).padStart(2, "0")}-${card.kind}.png`, data: await canvasToBytes(canvas) });
    }
    downloadBlob(
      new Blob([buildZip(files)], { type: "application/zip" }),
      `newspic-auto-cards${entry.cards.length}-${todayStamp()}.zip`
    );
    toast("자동 생성 카드뉴스를 ZIP으로 저장했습니다.", "ok");
    return;
  }
  const sheet = document.createElement("canvas");
  const images = visual ? { 1: visual, 2: visual } : {};
  renderSheet(sheet, { cuts: entry.cuts, images, style: state.style, layout: "grid", article });
  const blob = await new Promise((resolve) => sheet.toBlob(resolve, "image/png"));
  if (!blob) return;
  downloadBlob(blob, `newspic-auto-4cut-${todayStamp()}.png`);
  toast("자동 생성 4컷 합본을 저장했습니다.", "ok");
}



function loadSettings() {
  const byok = readJson(LS.byok, state.byok);
  state.byok = { provider: "free", openai: "", gemini: "", model: "", ...byok };
  const prefs = readJson(LS.prefs, {});
  state.partnerCode = prefs.partnerCode || "";
  state.style = prefs.style || "photo";
  state.imageMode = prefs.imageMode === "ai" ? "ai" : "article";
  state.cardImageMode = prefs.cardImageMode === "ai" ? "ai" : "article";
  state.layout = prefs.layout || "grid";
  state.cardTheme = prefs.cardTheme || "magazine";
  state.cardCount = CARD_COUNTS.includes(Number(prefs.cardCount)) ? Number(prefs.cardCount) : 8;
  state.cardLayout = prefs.cardLayout === "full" ? "full" : "split";
  state.ratio = prefs.ratio || "4:5";
  const minutes = Number(prefs.autoMinutes);
  state.auto.minutes = Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440 ? Math.round(minutes) : 5;
  if (prefs.autoOutputs && typeof prefs.autoOutputs === "object") {
    state.auto.outputs = { cards: Boolean(prefs.autoOutputs.cards), cuts: Boolean(prefs.autoOutputs.cuts) };
    if (!state.auto.outputs.cards && !state.auto.outputs.cuts) state.auto.outputs = { cards: true, cuts: true };
  }
  if (Array.isArray(prefs.channels) && prefs.channels.length) {
    state.selectedChannels = prefs.channels.filter((id) => PLATFORMS.some((platform) => platform.id === id));
  }
  state.feed.category = prefs.feedCategory && prefs.feedCategory in FEED_CATEGORY_LABELS ? prefs.feedCategory : "all";
  $("partnerCode").value = state.partnerCode;
  $("imageProvider").value = state.byok.provider || "free";
  $("openaiKey").value = state.byok.openai || "";
  $("geminiKey").value = state.byok.gemini || "";
  $("imageModel").value = state.byok.model || "";
  const autoMinutes = $("autoMinutes");
  if (autoMinutes) autoMinutes.value = String(state.auto.minutes);
}

function savePrefs() {
  writeJson(LS.prefs, {
    partnerCode: state.partnerCode,
    style: state.style,
    imageMode: state.imageMode,
    cardImageMode: state.cardImageMode,
    layout: state.layout,
    cardTheme: state.cardTheme,
    cardCount: state.cardCount,
    cardLayout: state.cardLayout,
    ratio: state.ratio,
    autoMinutes: state.auto.minutes,
    autoOutputs: state.auto.outputs,
    channels: state.selectedChannels,
    feedCategory: state.feed.category,
  });
}

function applyPartnerCode() {
  const value = $("partnerCode").value.trim().replace(/^pn=/, "");
  state.partnerCode = value;
  savePrefs();
  if (!state.article) return;
  state.article.partnerUrl = partnerUrlNow();
  const cta = state.cards.find((card) => card.kind === "cta");
  if (cta && state.article.partnerUrl && !/^http/.test(cta.lines[1] || "")) {
    cta.lines[1] = shorten(state.article.partnerUrl, 64);
  } else if (cta && state.article.partnerUrl) {
    cta.lines[1] = shorten(state.article.partnerUrl, 64);
  }
  renderReader();
  renderCardEditor();
  renderCardPreview();
  refreshChannelsFromCards();
  const dialogue = $("readerPartner");
  if (dialogue) dialogue.href = state.article.partnerUrl || state.article.url || "#";
  clearTimeout(applyPartnerCode.timer);
  applyPartnerCode.timer = setTimeout(() => loadFeed(state.feed.category), 350);
}

/* ------------------------------------------------------------------ *
 * 이벤트 연결
 * ------------------------------------------------------------------ */

function bindEvents() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
  $$("[data-goto]").forEach((button) =>
    button.addEventListener("click", () => showTab(button.dataset.goto))
  );

  $("mirrorForm").addEventListener("submit", submitMirror);
  $("manualToggle").addEventListener("click", () => {
    const box = $("manualBox");
    box.hidden = !box.hidden;
    $("manualToggle").setAttribute("aria-expanded", box.hidden ? "false" : "true");
  });
  $("manualSave").addEventListener("click", saveManual);
  $("presetRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) loadPreset(button.dataset.preset);
  });

  $("archiveSearch").addEventListener("input", (event) => {
    clearTimeout(renderArchive.timer);
    renderArchive.timer = setTimeout(() => refreshArchive(event.target.value), 220);
  });
  $("archiveList").addEventListener("click", (event) => {
    const item = event.target.closest(".archive-item");
    if (!item) return;
    const action = event.target.closest("[data-action]");
    if (action && action.dataset.action === "delete") {
      deleteArchivedArticle(item.dataset.id);
      return;
    }
    openArchivedArticle(item.dataset.id);
  });
  $("archiveList").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest(".archive-item");
    if (!item) return;
    event.preventDefault();
    openArchivedArticle(item.dataset.id);
  });

  $("feedCategoryRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-feed-category]");
    if (!button) return;
    if (state.feed.category === button.dataset.feedCategory) return;
    state.feed.category = button.dataset.feedCategory;
    savePrefs();
    loadFeed(state.feed.category);
  });
  $("feedList").addEventListener("click", (event) => {
    const node = event.target.closest("[data-feed-id]");
    if (!node) return;
    const item = state.feed.items.find((entry) => entry.id === node.dataset.feedId);
    if (item) openFeedItem(item, node);
  });
  $("feedList").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const node = event.target.closest("[data-feed-id]");
    if (!node) return;
    event.preventDefault();
    const item = state.feed.items.find((entry) => entry.id === node.dataset.feedId);
    if (item) openFeedItem(item, node);
  });

  $("partnerCode").addEventListener("change", applyPartnerCode);
  $("partnerCode").addEventListener("blur", applyPartnerCode);

  $("toCuts").addEventListener("click", () => showTab("cuts"));
  $("toCards").addEventListener("click", () => showTab("cards"));

  $("styleRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-style]");
    if (!button) return;
    const style = button.dataset.style;
    if (style === state.style) return;
    state.style = style;
    state.images = {};
    state.imageMeta = {};
    for (const cut of state.cuts) cut.aiPrompt = cutPrompt(cut, style, state.article);
    for (const cut of state.cuts) delete cut.promptEdited;
    state.cards.forEach((card, index) => {
      card.imagePrompt = cardImagePrompt(card, style, state.article, index, state.cards.length);
      delete card.promptEdited;
      if (state.baseCards[index]) state.baseCards[index].imagePrompt = card.imagePrompt;
    });
    savePrefs();
    renderChips();
    renderCuts();
    renderComic();
    renderCardImageControls();
    preparePrompts().catch(() => {});
    toast(`${styleTheme(style).name} 스타일로 바꿨습니다. AI 이미지는 새로 생성해 주세요.`, "ok");
  });

  $("imageModeRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-image-mode]");
    if (!button) return;
    const mode = button.dataset.imageMode;
    if (mode === state.imageMode) return;
    state.imageMode = mode;
    savePrefs();
    renderChips();
    const gen = $("generateAll");
    if (gen) gen.textContent = mode === "article" ? "🖼️ 기사 이미지로 4컷 구성" : "✨ AI 이미지 4컷 생성";
    const found = IMAGE_MODES.find((item) => item.id === mode);
    toast(found ? found.hint : "이미지 소스를 바꿨습니다.", "ok");
  });

  const cardImageModeRow = $("cardImageModeRow");
  if (cardImageModeRow) {
    cardImageModeRow.addEventListener("click", (event) => {
      const button = event.target.closest("[data-card-image-mode]");
      if (!button) return;
      const mode = button.dataset.cardImageMode;
      if (mode === state.cardImageMode) return;
      state.cardImageMode = mode;
      savePrefs();
      renderChips();
      if (mode === "article") distributeCardArticleImages({}).catch(() => {});
      const found = IMAGE_MODES.find((item) => item.id === mode);
      toast(found ? found.hint : "카드 이미지 소스를 바꿨습니다.", "ok");
    });
  }
  if ($("cardImagesFill")) $("cardImagesFill").addEventListener("click", fillCardImages);
  if ($("cardImageClear"))
    $("cardImageClear").addEventListener("click", () => {
      resetCardImages(false);
      toast("카드 이미지를 지웠습니다. Canvas 아트로 그립니다.", "ok");
    });
  if ($("cardImageSource")) {
    $("cardImageSource").addEventListener("change", async (event) => {
      const value = event.target.value;
      if (value === "ai") {
        const result = await generateCardImage(state.activeCard);
        toast(result.ok ? "이 카드 이미지를 받았습니다." : result.reason, result.ok ? "ok" : "");
        return;
      }
      if (value.startsWith("img:")) await assignCardArticleImage(value.slice(4));
      else await assignCardArticleImage("");
    });
  }
  if ($("cardImagePrompt")) {
    $("cardImagePrompt").addEventListener("input", (event) => {
      const card = state.cards[state.activeCard];
      if (!card) return;
      card.imagePrompt = event.target.value;
      card.promptEdited = true;
    });
  }
  if ($("cardImageApply")) {
    $("cardImageApply").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      const original = button.textContent;
      button.textContent = "생성 중…";
      const result = await generateCardImage(state.activeCard);
      button.disabled = false;
      button.textContent = original;
      toast(result.ok ? "이 카드 이미지를 받았습니다." : result.reason, result.ok ? "ok" : "");
    });
  }
  if ($("cardImageReset")) {
    $("cardImageReset").addEventListener("click", () => {
      const card = state.cards[state.activeCard];
      if (!card) return;
      card.imagePrompt = cardImagePrompt(card, state.style, state.article, state.activeCard, state.cards.length);
      delete card.promptEdited;
      renderCardImageControls();
      toast("이 카드의 프롬프트를 기사 본문 기준으로 새로 만들었습니다.", "ok");
    });
  }

  $("layoutRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-layout]");
    if (!button) return;
    state.layout = button.dataset.layout;
    savePrefs();
    renderChips();
    renderComic();
  });

  $("cutsGrid").addEventListener("input", (event) => {
    if (event.target.matches("[data-field]")) updateCutFromInput(event.target);
  });
  $("cutsGrid").addEventListener("change", (event) => {
    if (event.target.matches("select[data-field]")) updateCutFromInput(event.target);
  });
  $("cutsGrid").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const index = Number(button.dataset.index);
    const cut = state.cuts[index];
    if (!cut) return;
    if (button.dataset.action === "reroll-cut") {
      cut.aiPrompt = cutPrompt(cut, state.style, state.article);
      const area = document.querySelector(`[data-field="cut-prompt"][data-index="${index}"]`);
      if (area) area.value = cut.aiPrompt;
      toast("프롬프트를 새로 만들었습니다.", "ok");
      return;
    }
    if (button.dataset.action === "regen-cut") {
      button.disabled = true;
      const original = button.textContent;
      button.textContent = "생성 중…";
      const result = await generateCutImage(cut);
      button.disabled = false;
      button.textContent = original;
      toast(result.ok ? "이미지를 받았습니다." : result.reason, result.ok ? "ok" : "");
    }
  });

  $("generateAll").addEventListener("click", generateAllImages);
  $("keywordRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-keyword]");
    if (button) toggleKeyword(button.dataset.keyword);
  });
  $("articleImageList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-image-index]");
    if (!button) return;
    assignArticleImage(Number(button.dataset.imageIndex), Number(button.dataset.cutIndex));
  });
  $("assignImagesInOrder").addEventListener("click", assignImagesInOrder);
  [$("cutsToChannel"), $("cutsToChannelBottom"), $("cardsToChannel"), $("cardsToChannelBottom")]
    .filter(Boolean)
    .forEach((button) => button.addEventListener("click", goToChannels));
  $("saveAccounts").addEventListener("click", saveAccounts);
  $("applyAccountsBtn").addEventListener("click", () => applyAccountsToChannels());
  $("authBtn").addEventListener("click", () => openAuthDialog());
  $("guestBtn").addEventListener("click", continueAsGuest);
  $("logoutBtn").addEventListener("click", logoutUser);
  $$("[data-login]").forEach((button) =>
    button.addEventListener("click", () => loginWith(button.dataset.login))
  );
  $("authDialog").addEventListener("click", (event) => {
    if (event.target === $("authDialog")) $("authDialog").close();
  });
  $("resetImages").addEventListener("click", () => {
    state.images = {};
    state.imageMeta = {};
    renderCuts();
    renderComic();
    toast("AI 이미지를 지우고 Canvas 아트로 돌아갔습니다.", "ok");
  });
  $("downloadSheet").addEventListener("click", downloadSheet);
  $("downloadCuts").addEventListener("click", downloadCuts);

  $("themeRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme]");
    if (!button) return;
    state.cardTheme = button.dataset.theme;
    savePrefs();
    renderChips();
    renderCardPreview();
    renderChannelPackages();
  });
  $("chapterRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-chapter]");
    if (!button) return;
    const count = Number(button.dataset.chapter);
    if (!CARD_COUNTS.includes(count) || state.cardCount === count) return;
    state.cardCount = count;
    savePrefs();
    rebuildCards();
    toast(`카드뉴스를 ${count}장 구성으로 다시 기획했습니다.`, "ok");
  });
  $("cardLayoutRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-layout]");
    if (!button) return;
    const layout = button.dataset.cardLayout;
    if (layout === state.cardLayout) return;
    state.cardLayout = layout;
    savePrefs();
    renderChips();
    renderCardPreview();
    toast(layout === "split" ? "한쪽 이미지 · 한쪽 텍스트 분할 레이아웃입니다." : "전면형 레이아웃으로 바꿨습니다.", "ok");
  });
  $("ratioRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ratio]");
    if (!button) return;
    state.ratio = button.dataset.ratio;
    savePrefs();
    renderChips();
    renderCardEditor();
    renderCardPreview();
  });
  $("slideList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-card]");
    if (button) selectCard(Number(button.dataset.card));
  });
  $("prevSlide").addEventListener("click", () => selectCard(state.activeCard - 1));
  $("nextSlide").addEventListener("click", () => selectCard(state.activeCard + 1));
  ["cardKicker", "cardTitleInput", "cardLines", "cardFooter"].forEach((id) =>
    $(id).addEventListener("input", updateCardFromInputs)
  );
  $("resetCard").addEventListener("click", resetCard);
  $("downloadCard").addEventListener("click", downloadCard);
  $("downloadZip").addEventListener("click", downloadCardsZip);

  $("platformRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-platform]");
    if (!button) return;
    state.activePlatform = button.dataset.platform;
    renderPlatformTabs();
    renderChannel();
  });
  $("channelBody").addEventListener("input", () => {
    const pack = currentChannel();
    if (pack) pack.body = $("channelBody").value;
    updateChannelChars();
    renderChannelPackages();
  });
  $("channelTitleInput").addEventListener("input", () => {
    const pack = currentChannel();
    if (pack) pack.title = $("channelTitleInput").value;
  });
  $("copyBody").addEventListener("click", () => copyText($("channelBody").value, "본문을 복사했습니다."));
  $("copyComment").addEventListener("click", () => copyText($("channelComment").textContent, "첫 댓글 문구를 복사했습니다."));
  $("copyAll").addEventListener("click", () => {
    const pack = currentChannel();
    const text = `${$("channelBody").value}\n\n--- 첫 댓글 ---\n${pack ? pack.firstComment : ""}`;
    copyText(text, "본문과 첫 댓글을 함께 복사했습니다.");
  });
  $("openIntent").addEventListener("click", () => {
    const pack = currentChannel();
    if (!pack) return;
    openIntentFor(pack, $("channelBody").value);
  });
  $("channelChecklist").addEventListener("click", (event) => {
    const item = event.target.closest("li");
    if (!item) return;
    item.classList.toggle("done");
    const box = item.querySelector(".box");
    if (box) box.textContent = item.classList.contains("done") ? "✓" : "";
    box.style.background = item.classList.contains("done") ? "var(--accent)" : "transparent";
    box.style.color = "#1c0b04";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.fontWeight = "900";
  });
  $("makeVideo").addEventListener("click", makeVideo);

  $("channelSelectRow").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-channel]");
    if (!input) return;
    const id = input.dataset.channel;
    if (input.checked) {
      if (!state.selectedChannels.includes(id)) state.selectedChannels.push(id);
    } else {
      state.selectedChannels = state.selectedChannels.filter((item) => item !== id);
    }
    savePrefs();
    renderChannelSelection();
    renderChannelPackages();
  });
  $("channelPackages").addEventListener("click", (event) => {
    const button = event.target.closest("[data-package-action]");
    if (!button) return;
    const card = button.closest("[data-package]");
    if (!card) return;
    handlePackageAction(button.dataset.packageAction, card.dataset.package);
  });

  $("autoToggle").addEventListener("change", (event) => setAutoEnabled(event.target.checked));
  $("autoIntervalRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-auto-minutes]");
    if (!button) return;
    state.auto.minutes = Number(button.dataset.autoMinutes) || 5;
    savePrefs();
    if (state.auto.enabled) scheduleAuto();
    renderAuto();
  });
  $("autoMinutes").addEventListener("change", (event) => {
    const value = Math.max(1, Math.min(1440, Math.round(Number(event.target.value) || 5)));
    state.auto.minutes = value;
    event.target.value = String(value);
    savePrefs();
    if (state.auto.enabled) scheduleAuto();
    renderAuto();
  });
  $("autoOutputRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-auto-output]");
    if (!button) return;
    const value = button.dataset.autoOutput;
    state.auto.outputs =
      value === "cards"
        ? { cards: true, cuts: false }
        : value === "cuts"
          ? { cards: false, cuts: true }
          : { cards: true, cuts: true };
    savePrefs();
    renderAutoOutputs();
  });
  $("autoRunOnce").addEventListener("click", () => runAutoOnce("manual"));
  $("autoQueue").addEventListener("click", (event) => {
    const open = event.target.closest("[data-auto-open]");
    if (open) {
      const entry = state.auto.queue.find((item) => item.id === open.dataset.autoOpen);
      if (!entry) return;
      state.article = entry.article;
      state.article.partnerUrl = partnerUrlNow(entry.article);
      state.cuts = entry.cuts;
      state.cards = entry.cards.map((card) => ({ ...card, lines: [...card.lines] }));
      state.baseCards = state.cards.map((card) => ({ ...card, lines: [...card.lines] }));
      state.activeCard = 0;
      state.images = {};
      renderReader();
      renderWorkspace();
      showTab("cards");
      return;
    }
    const button = event.target.closest("[data-auto-download]");
    if (!button) return;
    const entry = state.auto.queue.find((item) => item.id === button.dataset.autoId);
    if (entry) downloadAutoItem(entry, button.dataset.autoDownload);
  });

  $("byokBtn").addEventListener("click", () => $("settingsDialog").showModal());
  $("saveSettings").addEventListener("click", () => {
    state.byok = {
      provider: $("imageProvider").value,
      openai: $("openaiKey").value.trim(),
      gemini: $("geminiKey").value.trim(),
      model: $("imageModel").value.trim(),
    };
    writeJson(LS.byok, state.byok);
    $("settingsDialog").close();
    toast(
      state.byok.provider === "free"
        ? "무료 이미지 생성으로 설정했습니다."
        : `${state.byok.provider} 키를 이 브라우저에만 저장했습니다.`,
      "ok"
    );
  });
  $("clearKeys").addEventListener("click", () => {
    state.byok = { provider: "free", openai: "", gemini: "", model: "" };
    writeJson(LS.byok, state.byok);
    $("imageProvider").value = "free";
    $("openaiKey").value = "";
    $("geminiKey").value = "";
    $("imageModel").value = "";
    toast("저장된 키를 지웠습니다.", "ok");
  });
  $("settingsDialog").addEventListener("click", (event) => {
    if (event.target === $("settingsDialog")) $("settingsDialog").close();
  });
}

/* ------------------------------------------------------------------ *
 * 시작
 * ------------------------------------------------------------------ */

async function init() {
  loadSettings();
  bindEvents();
  await loadPresets();
  setStoragePill();
  renderAuto();
  renderFeedCategories();
  renderChannelSelection();
  renderAccounts();
  await loadAuth();

  const gen = $("generateAll");
  if (gen) gen.textContent = state.imageMode === "article" ? "🖼️ 기사 이미지로 4컷 구성" : "✨ AI 이미지 4컷 생성";

  const params = new URLSearchParams(location.search);
  const loginState = params.get("login");
  if (loginState) {
    const provider = params.get("provider") || "";
    if (loginState === "ok") toast("로그인했습니다. 채널 계정이 회원 KV에 저장됩니다.", "ok");
    else if (loginState === "oauth_pending") openAuthDialog(`OAuth 키 등록 대기 중 — ${provider || "이"} 로그인 키가 아직 없습니다. 게스트로 계속할 수 있어요.`);
    else toast(`로그인을 마치지 못했습니다 (${loginState}). 게스트로도 계속할 수 있어요.`, "err");
    params.delete("login");
    params.delete("provider");
    const clean = location.pathname + (params.toString() ? "?" + params.toString() : "") + location.hash;
    history.replaceState(null, "", clean);
  }
  await loadFeed(state.feed.category);

  const hash = location.hash.replace("#", "");
  const startTab = ["mirror", "cuts", "cards", "channels"].includes(hash) ? hash : "mirror";
  showTab(startTab);

  const last = readJson(LS.last, null);
  if (last && last.title) {
    setArticle(last, { fromArchive: true });
    await refreshArchive("");
  } else {
    await refreshArchive("");
    renderWorkspace();
  }

  window.__studio = {
    state,
    setArticle,
    showTab,
    generateCutImage,
    applyArticleImages,
    generateAllImages,
    renderComic,
    renderCardPreview,
    rebuildCards,
    loadFeed,
    openFeedItem,
    runAutoOnce,
    setAutoEnabled,
    downloadAutoItem,
    recordSlideshow,
    buildZip,
    buildCards,
    extractKeywords,
    keywordPromptLine,
    activeKeywordPrompt,
    goToChannels,
    saveAccounts,
    applyAccountsToChannels,
    continueAsGuest,
    loginWith,
    logoutUser,
    assignArticleImage,
    assignImagesInOrder,
    generateCardImage,
    fillCardImages,
    distributeCardArticleImages,
    assignCardArticleImage,
    preparePrompts,
    renderCardImageControls,
    renderAccounts,
    cardsScales: CARD_SCALES,
    cardScales: CARD_SCALES,
  };
}

init();
