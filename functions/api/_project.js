/* Agent Collab Studio v2.3 | 실제 프로젝트 파일 생성 — 정규화 · 스마트 폴백 생성기 · 프롬프트
 *
 *  `/api/generate-project` 가 무료 AI 풀에 보낼 프롬프트를 만들고,
 *  AI 응답(JSON 파일 세트)을 안전하게 다듬습니다.
 *  AI 가 없거나 형식이 깨져도 과제의 키워드·의도를 읽어 **실제로 동작하는 웹앱**을 만듭니다(폴백).
 *
 *  v2.2 핵심 변경
 *   - 폴백이 "실행 대시보드" 하나뿐이던 문제를 고쳐, 실제 기능이 도는 앱 아키타입 7종을 만든다.
 *       pomodoro · calculator · todo · quiz · notes · directory · dashboard
 *   - 제목(title)과 목표(goal)가 붙어 나오던 문제를 cleanTitle / fixHeadingJoin 으로 제거.
 *     <h1>·<title> 에는 과제 제목만 들어간다.
 */

export const PROJECT_LIMITS = {
  files: 12,
  fileBytes: 160 * 1024,
  totalBytes: 420 * 1024,
  path: 120,
};

const ALLOWED_EXT = ["html", "css", "js", "mjs", "json", "md", "txt", "svg", "webmanifest"];

const MIME = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  webmanifest: "application/manifest+json",
};

export function mimeFor(path) {
  const ext = String(path || "").split(".").pop().toLowerCase();
  return MIME[ext] || "text/plain; charset=utf-8";
}

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cut(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/** 위험한 경로(절대경로·상위 이동·확장자)를 막고 정규화한다. */
export function safePath(value) {
  let path = String(value == null ? "" : value).trim().replace(/\\/g, "/");
  path = path.replace(/^\.?\//, "").replace(/^\/+/, "");
  if (!path || path.length > PROJECT_LIMITS.path) return "";
  if (path.includes("..") || path.includes("\u0000")) return "";
  if (!/^[A-Za-z0-9._\-/]+$/.test(path)) return "";
  const ext = path.split(".").pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return "";
  if (path.split("/").some((part) => !part || part === ".")) return "";
  return path;
}

function slugWords(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 4)
    .join("-");
}

/** 저장소·프로젝트 이름 규칙: 소문자·숫자·하이픈, 3~50자. */
export function projectName(title, now) {
  let base = slugWords(title);
  if (!base || base.length < 3 || /^[0-9-]+$/.test(base)) base = "acs-project";
  const date = new Date(now || Date.now());
  const stamp = date.getUTCFullYear() + String(date.getUTCMonth() + 1).padStart(2, "0") + String(date.getUTCDate()).padStart(2, "0");
  const name = (base + "-" + stamp).replace(/[^a-z0-9-]/g, "").slice(0, 50);
  return name.length >= 3 ? name : "acs-project";
}

/* ── 제목 · 목표가 붙어 나오는 문제 제거 ───────────────────── */

const norm = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

/**
 * title 끝에 goal 이 그대로 이어 붙은 경우(예: "포모도로 집중 타이머 & 오늘 할 일25분 집중 / 5분 휴식…")를
 * 제목만 남기도록 잘라 낸다. 같은 문장을 두 번 붙인 경우도 처리한다.
 */
export function cleanTitle(rawTitle, goal, fallback) {
  let title = norm(rawTitle);
  const g = norm(goal);
  if (!title) return norm(fallback) || "새 프로젝트";
  if (g) {
    /* 완전히 같은 문장을 반복: "제목 목표" == "제목" + "목표" */
    const doubled = title.length > g.length && title.endsWith(g) && title.slice(0, title.length - g.length).trim().length > 0;
    if (doubled) title = title.slice(0, title.length - g.length).trim();
    /* goal 앞부분이 제목 뒤에 붙은 경우 — 긴 것부터 차례로 확인 */
    if (g.length >= 12) {
      const max = Math.min(32, g.length);
      for (let len = max; len >= 12; len -= 1) {
        const head = g.slice(0, len);
        if (title.length > head.length + 2 && title.endsWith(head)) {
          title = title.slice(0, title.length - head.length).replace(/[\s:·\-–—,]+$/, "").trim();
          break;
        }
      }
    }
    /* 제목이 "제목 — 목표" 처럼 구분자로 이어진 경우 제목만 */
    const sepMatch = title.match(/^([\s\S]{4,}?)\s*[—–|·:]\s+([\s\S]+)$/);
    if (sepMatch && norm(sepMatch[2]) === g) title = norm(sepMatch[1]);
  }
  title = title.replace(/[\s:·\-–—,]+$/, "").trim();
  if (!title) title = norm(fallback) || "새 프로젝트";
  return title.slice(0, 120);
}

/** AI 가 만든 HTML 안에서 <h1>제목목표…</h1> 처럼 붙은 제목을 분리한다. */
export function fixHeadingJoin(html, title, goal) {
  let out = String(html || "");
  const t = norm(title);
  const g = norm(goal);
  if (!t || !g) return out;
  out = out.replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/gi, (match, attrs, inner) => {
    const text = norm(inner.replace(/<[^>]*>/g, ""));
    if (!text.startsWith(t)) return match;
    const rest = norm(text.slice(t.length)).replace(/^[\s:·\-–—]+/, "");
    if (!rest) return match;
    const head = rest.slice(0, Math.min(16, rest.length));
    if (!g.startsWith(head)) return match;
    return "<h1" + attrs + ">" + escapeHtml(t) + '</h1>\n    <p class="lead">' + escapeHtml(rest) + "</p>";
  });
  /* <title>제목목표…</title> → <title>제목</title> */
  out = out.replace(/<title>([\s\S]*?)<\/title>/gi, (match, inner) => {
    const text = norm(inner);
    if (text.toLowerCase() === t.toLowerCase()) return match;
    if (text.toLowerCase().startsWith(t.toLowerCase()) && text.length > t.length + 8) return "<title>" + escapeHtml(t) + "</title>";
    return match;
  });
  return out;
}

/** index.html 에서 다음 단계(app.js)가 쓸 id 목록을 뽑는다. */
export function extractIds(html) {
  const ids = [];
  const re = /\bid\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const id = m[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, 40);
}

/** AI 응답(객체) → 화면·배포에 쓸 파일 세트. 쓸 수 없으면 null.
 *  options.partial — 단계별 생성: required 파일들이 모두 있으면 통과(index.html 강제하지 않음). */
export function normalizeProject(value, mission, now, options) {
  const opts = options && typeof options === "object" ? options : {};
  const partial = opts.partial === true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let raw = value.files;
  if (!Array.isArray(raw) && raw && typeof raw === "object") {
    raw = Object.keys(raw).map((path) => ({ path, content: raw[path] }));
  }
  if (!Array.isArray(raw)) return null;

  const goal = norm((mission && mission.goal) || value.summary || "");
  const rawTitle = String(value.title || (mission && mission.title) || "생성 프로젝트");
  const title = cleanTitle(rawTitle, goal, (mission && mission.title) || "생성 프로젝트");

  const seen = new Set();
  const files = [];
  let total = 0;
  for (const item of raw.slice(0, PROJECT_LIMITS.files * 2)) {
    if (!item) continue;
    const path = safePath(item.path || item.name || item.file);
    if (!path || seen.has(path)) continue;
    let content = item.content != null ? item.content : item.code != null ? item.code : item.body;
    if (typeof content !== "string") continue;
    content = content.replace(/\r\n/g, "\n");
    if (path === "index.html") content = fixHeadingJoin(content, title, goal);
    if (!content.trim()) continue;
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > PROJECT_LIMITS.fileBytes) continue;
    if (total + bytes > PROJECT_LIMITS.totalBytes) break;
    total += bytes;
    seen.add(path);
    files.push({ path, content, bytes, mime: mimeFor(path), kind: path.split(".").pop().toLowerCase() });
    if (files.length >= PROJECT_LIMITS.files) break;
  }
  if (!files.length) return null;
  if (partial) {
    const required = Array.isArray(opts.required) ? opts.required : [];
    if (!required.every((path) => seen.has(path))) return null;
  } else {
    if (!seen.has("index.html")) return null;
    if (files.length < 2) return null;
  }

  const summary = cut(value.summary || (mission && mission.goal) || "", 400);
  const name = /^[a-z0-9][a-z0-9-]{2,49}$/.test(String(value.name || ""))
    ? String(value.name)
    : projectName(title, now);
  return { name, title, summary, files, source: "ai" };
}

/* ── 과제 의도 분석 → 앱 아키타입 ─────────────────────────── */

const ARCHETYPES = [
  { id: "pomodoro", label: "포모도로 · 집중 타이머", words: ["포모도로", "뽀모도로", "pomodoro", "타이머", "타이머앱", "timer", "스톱워치", "집중", "휴식", "딴짓", "공부 시간"] },
  { id: "calculator", label: "계산기 · 견적 계산", words: ["계산기", "계산", "이자", "대출", "환율", "세금", "부가세", "단위 변환", "견적", "금리", "적금", "예금", "가계부", "지출", "예산", "월급", "연봉", "원리금", "할부", "수수료"] },
  { id: "todo", label: "할 일 · 습관 트래커", words: ["할 일", "할일", "체크리스트", "체크 리스트", "습관", "루틴", "트래커", "투두", "todo", "to-do", "habit", "데일리", "우선순위", "일정 관리", "태스크"] },
  { id: "quiz", label: "퀴즈 · 플래시카드", words: ["퀴즈", "quiz", "암기", "플래시카드", "flashcard", "단어장", "단어", "시험", "문제 풀이", "외우", "영단어", "객관식", "학습"] },
  { id: "notes", label: "메모 · 노트", words: ["메모", "노트", "일기", "마크다운", "markdown", "글쓰기", "기록장", "저널", "journal", "note", "회의록", "아이디어 정리", "초안"] },
  { id: "directory", label: "목록 · 큐레이션", words: ["디렉토리", "목록", "공모전", "이벤트", "지원사업", "채용", "구인", "북마크", "큐레이션", "모음", "행사", "세미나", "공고", "리스트"] },
  { id: "dashboard", label: "실행 대시보드", words: ["로드맵", "전략", "점검", "감사", "실행 계획", "보고서", "리스크", "kpi", "프로젝트 관리", "회고", "스프린트", "운영 계획", "마케팅 전략", "체크 점검"] },
];

export const ARCHETYPE_HINTS = {
  pomodoro: "실제로 도는 25분 집중 / 5분·15분 휴식 타이머(시작·일시정지·리셋·모드 전환·완료 알림·세션 카운터)와 오늘의 할 일 체크리스트",
  calculator: "값을 바꾸면 즉시 결과가 갱신되는 계산기(빠른 프리셋·결과 요약 카드·상세 분해표·최근 계산 기록)",
  todo: "할 일을 추가·완료·삭제하고 필터와 진행률이 실제로 움직이는 할 일 관리 앱(우선순위·분류)",
  quiz: "카드가 뒤집히는 플래시카드와 정답/오답 채점·점수·연속 정답이 동작하는 학습 앱",
  notes: "목록 + 편집기 2단 메모 앱(실시간 검색·태그·고정·자동 저장·.md 내려받기)",
  directory: "검색·분류 필터·D-day 배지·북마크·상세 보기가 동작하는 목록 앱",
  dashboard: "진행률·실행 단계·체크리스트·리스크·메모가 실제로 동작하는 실행 대시보드",
};

export function detectArchetype(mission, report) {
  const m = mission && typeof mission === "object" ? mission : {};
  const r = report && typeof report === "object" ? report : {};
  const title = norm(m.title).toLowerCase();
  const body = [m.title, m.goal, m.context, m.audience, m.deliverable, Array.isArray(m.checks) ? m.checks.join(" ") : "", r.summary && r.summary.goal]
    .map((v) => norm(v).toLowerCase())
    .join(" ");
  const scored = ARCHETYPES.map((arch) => {
    let score = 0;
    arch.words.forEach((word) => {
      const w = word.toLowerCase();
      if (!w) return;
      let hits = 0;
      let idx = body.indexOf(w);
      while (idx !== -1 && hits < 4) { hits += 1; idx = body.indexOf(w, idx + w.length); }
      score += hits * 2;
      if (title.includes(w)) score += 4;
    });
    return { id: arch.id, label: arch.label, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score > 0) return { id: best.id, label: best.label, score: best.score, ranked: scored };
  const fallback = /정리|문서|글|작성|인터뷰|질문지/.test(body) ? "notes" : "todo";
  const meta = ARCHETYPES.find((a) => a.id === fallback);
  return { id: fallback, label: meta ? meta.label : fallback, score: 0, ranked: scored };
}

/* ── AI 프롬프트 (앱 우선) ───────────────────────────────── */

export function buildProjectPrompt(mission, report) {
  const m = mission || {};
  const r = report || {};
  const arche = detectArchetype(m, r);
  const hint = ARCHETYPE_HINTS[arche.id] || ARCHETYPE_HINTS.todo;
  const roadmap = Array.isArray(r.roadmap) && r.roadmap.length
    ? r.roadmap.map((row, i) => (i + 1) + ") " + (row.step || "") + " — " + (row.detail || "") + " (" + (row.when || "") + ", " + (row.owner || "") + ", 산출물 " + (row.output || "") + ")").join("; ")
    : (Array.isArray(m.steps) ? m.steps.map((s, i) => (i + 1) + ") " + (s.name || "") + " — " + (s.detail || "") + " (" + (s.when || "") + ")").join("; ") : "");
  const checklist = Array.isArray(r.checklist) && r.checklist.length
    ? r.checklist.slice(0, 8).map((c) => "- " + c).join("\n")
    : (Array.isArray(m.checks) ? m.checks.slice(0, 8).map((c) => "- " + c).join("\n") : "");
  const risks = Array.isArray(r.risks) && r.risks.length
    ? r.risks.slice(0, 4).map((x) => "- " + x.r + " → " + x.m).join("\n")
    : (Array.isArray(m.risks) ? m.risks.slice(0, 4).map((x) => "- " + x.r + " → " + x.m).join("\n") : "");

  const system =
    "당신은 한국어 웹앱 생성기입니다. 협업 과제를 읽고, 사용자가 브라우저에서 바로 열어 실제로 쓰는 " +
    "정적 웹앱 파일 세트를 만듭니다. 기획서나 빈 대시보드가 아니라, 과제가 말한 기능이 정말 동작해야 합니다. " +
    "출력은 JSON 객체 하나만 — 코드블록·설명·인사말 금지. " +
    "파일은 index.html, style.css, app.js, README.md 를 반드시 포함하고, 외부 CDN·외부 라이브러리·외부 폰트 없이 단독으로 동작해야 합니다. " +
    "index.html 은 style.css 와 app.js 를 상대경로로 연결하고, app.js 는 실제 상호작용(타이머·계산·추가/삭제·검색·채점·저장 등)을 구현합니다. " +
    "상태는 localStorage 에 저장하고, 다크/라이트 테마 토글과 390px 모바일 레이아웃(가로 스크롤 없음)을 넣으세요. " +
    "모든 화면 문구는 한국어입니다. HTML 안에 <script> 태그를 문자열로 쓰지 말고 반드시 별도 app.js 파일로 분리하세요. " +
    "<h1> 과 <title> 에는 과제 제목만 넣고, 목표 문장은 <p class=\"lead\"> 에 따로 쓰세요. 제목과 목표를 절대 이어 붙이지 마세요.";

  const user = [
    "과제 제목: " + (m.title || ""),
    "목표: " + (m.goal || ""),
    m.context ? "배경·제약: " + m.context : "",
    m.audience ? "대상: " + m.audience : "",
    m.deadline ? "기간: " + m.deadline : "",
    roadmap ? "실행 단계: " + roadmap : "",
    checklist ? "체크리스트:\n" + checklist : "",
    risks ? "리스크와 대응:\n" + risks : "",
    r.summary && r.summary.goal ? "리포트 요약: " + r.summary.goal : "",
    "",
    "요구사항:",
    "1) 결과물은 이 과제가 요구하는 **동작하는 웹앱**입니다 — " + hint + ".",
    "2) index.html: 앱 이름(h1, 과제 제목만) + 목표 한 줄(p.lead) + 실제 조작 UI(입력·버튼·목록·결과). 모든 버튼과 입력에 id 를 붙이세요.",
    "3) style.css: 모던하고 보기 좋은 반응형 디자인, CSS 변수, 라이트/다크 테마, 390px 에서도 가로 스크롤 없음.",
    "4) app.js: 위 id 만 사용해 기능을 실제로 구현(이벤트 연결·계산·렌더링·localStorage 저장·테마 전환). 요소가 없어도 오류로 멈추지 않게 null 확인.",
    "5) README.md: 앱 소개, 기능 목록, 파일 목록, 실행 방법, 배포 방법(GitHub Pages / Cloudflare Pages).",
    arche.id === "dashboard"
      ? "6) 이 과제는 계획·점검 성격이므로 진행 대시보드(진행률·단계·체크리스트·리스크·메모)가 결과물입니다. 단 체크·메모·테마는 실제로 동작해야 합니다."
      : "6) 기획서·로드맵·점검표 화면으로 대체하지 마세요. 사용자가 누르고 입력하면 결과가 바뀌는 앱이어야 합니다.",
    "",
    "응답 형식: {\"name\":\"repo-name\",\"title\":\"프로젝트 제목\",\"summary\":\"한 문장 요약\",\"files\":[{\"path\":\"index.html\",\"content\":\"...\"},{\"path\":\"style.css\",\"content\":\"...\"},{\"path\":\"app.js\",\"content\":\"...\"},{\"path\":\"README.md\",\"content\":\"...\"}]}",
    "name 은 영문 소문자·숫자·하이픈만 사용합니다. title 에 goal 을 이어 붙이지 마세요. content 안의 줄바꿈은 JSON 문자열 규칙대로 \\n 으로 Escape 하세요.",
  ].filter(Boolean).join("\n");

  return { system, user, archetype: arche.id };
}

/* ── 폴백 프로젝트: 실제로 동작하는 앱 7종 ─────────────────── */

function num(value, fallback) {
  const n = parseFloat(String(value == null ? "" : value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function missionCtx(mission, report, now) {
  const m = mission || {};
  const r = report || {};
  const goal = norm(m.goal);
  const title = cleanTitle(m.title, goal, "실행 대시보드");
  const context = norm(m.context).slice(0, 300);
  const audience = norm(m.audience).slice(0, 80);
  const deadline = norm(m.deadline).slice(0, 60);
  return {
    title,
    goal,
    goalShort: cut(goal || "과제 목표를 한 화면에서 처리하는 웹앱입니다.", 150),
    context,
    audience,
    deadline,
    name: projectName(title, now),
    now: now || Date.now(),
    report: r,
    mission: m,
  };
}

/** 생성 웹앱의 공통 헤더 (h1 = 제목만, 목표는 lead) */
function headerBlock(ctx) {
  return '<header class="top">\n' +
    '  <div class="top-text">\n' +
    '    <h1>' + escapeHtml(ctx.title) + '</h1>\n' +
    (ctx.goalShort ? '    <p class="lead">' + escapeHtml(ctx.goalShort) + '</p>\n' : '') +
    '  </div>\n' +
    '  <button type="button" id="themeBtn" class="btn btn-ghost" aria-label="다크/라이트 테마 전환">🌗 테마</button>\n' +
    '</header>';
}

function pageHtml(ctx, body, tag) {
  return '<!DOCTYPE html>\n<html lang="ko">\n<head>\n' +
    '<meta charset="utf-8" />\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    '<meta name="color-scheme" content="light dark" />\n' +
    '<title>' + escapeHtml(ctx.title) + '</title>\n' +
    '<link rel="stylesheet" href="style.css" />\n' +
    '</head>\n<body>\n<div class="wrap">\n' +
    headerBlock(ctx) + '\n' +
    body + '\n' +
    '<footer class="foot"><span>' + escapeHtml(tag) + ' · Agent Collab Studio v2.3</span>' +
    '<span>입력한 내용은 이 브라우저(localStorage)에만 저장됩니다.</span></footer>\n' +
    '</div>\n<script src="app.js"></script>\n</body>\n</html>\n';
}

function baseCss() {
  return `:root {
  --bg: #f5f7fb;
  --card: #ffffff;
  --txt: #0f172a;
  --sub: #64748b;
  --line: #e5e9f2;
  --accent: #0d9488;
  --accent-strong: #0f766e;
  --accent-soft: #ccfbf1;
  --on-accent: #03130f;
  --danger: #dc2626;
  --amber: #b45309;
  --ok: #047857;
  --shadow: 0 1px 2px rgba(15, 23, 42, .05), 0 10px 26px rgba(15, 23, 42, .07);
  --radius: 16px;
}
[data-theme="dark"] {
  --bg: #0b1220;
  --card: #111b2e;
  --txt: #e7eef9;
  --sub: #93a3bd;
  --line: #1e2b42;
  --accent: #5eead4;
  --accent-strong: #2dd4bf;
  --accent-soft: rgba(94, 234, 212, .13);
  --on-accent: #04140f;
  --danger: #f87171;
  --amber: #fbbf24;
  --ok: #34d399;
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 12px 30px rgba(0, 0, 0, .35);
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--txt);
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
h1, h2, h3 { margin: 0; line-height: 1.3; letter-spacing: -.02em; }
.wrap { max-width: 980px; margin: 0 auto; padding: 26px 18px 56px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.top-text { min-width: 0; }
.top h1 { font-size: clamp(21px, 5.2vw, 30px); overflow-wrap: anywhere; }
.lead { color: var(--sub); font-size: 13px; margin: 6px 0 0; max-width: 62ch; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); min-width: 0; }
.grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 16px; align-items: start; }
button { font: inherit; cursor: pointer; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--line); background: var(--card); color: var(--txt);
  border-radius: 11px; padding: 9px 14px; font-size: 13px; font-weight: 600;
  white-space: nowrap; flex: 0 0 auto;
  transition: border-color .15s, background .15s, color .15s;
}
.btn:hover { border-color: var(--accent); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.btn-primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); }
.btn-ghost { background: transparent; }
.btn[disabled] { opacity: .5; cursor: not-allowed; }
input, select, textarea {
  font: inherit; font-size: 13.5px; width: 100%; color: var(--txt);
  background: var(--bg); border: 1px solid var(--line); border-radius: 11px; padding: 10px 12px;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.field { display: grid; gap: 5px; }
.field > span { font-size: 12px; color: var(--sub); }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pill { font-size: 11px; border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; color: var(--sub); font-weight: 600; }
.chip { border: 1px solid var(--line); background: transparent; color: var(--sub); border-radius: 999px; padding: 5px 12px; font-size: 12px; font-weight: 600; }
.chip.is-active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); }
[data-theme="dark"] .chip.is-active { color: var(--accent); }
.empty { color: var(--sub); font-size: 12.5px; margin: 10px 0 0; }
.foot { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 26px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--sub); }
.toast {
  position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
  background: var(--txt); color: var(--bg); font-size: 12px; padding: 9px 14px;
  border-radius: 999px; z-index: 60; max-width: calc(100vw - 32px); text-align: center;
}
@media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
@media (max-width: 720px) {
  .wrap { padding: 20px 14px 44px; }
  .top { flex-wrap: wrap; }
}
`;
}

function themeJs(key) {
  return `  var THEME_KEY = '${key}.theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function initTheme() {
    var saved = 'light';
    try {
      saved = localStorage.getItem(THEME_KEY) || ((window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
    } catch (e) {}
    applyTheme(saved);
    var btn = document.getElementById('themeBtn');
    if (btn) btn.addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
`;
}

/* ── 1) 포모도로 + 오늘 할 일 ─────────────────────────────── */

function pomodoroApp(ctx) {
  const KEY = "acs.pomodoro." + ctx.name;
  const body = `  <main class="grid">
    <section class="card timer-card">
      <div class="modes" role="tablist" aria-label="타이머 모드">
        <button type="button" class="mode is-active" data-mode="focus">집중 25:00</button>
        <button type="button" class="mode" data-mode="short">짧은 휴식 5:00</button>
        <button type="button" class="mode" data-mode="long">긴 휴식 15:00</button>
      </div>
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 220 220" aria-hidden="true">
          <circle class="ring-bg" cx="110" cy="110" r="96"></circle>
          <circle id="ring" class="ring-fg" cx="110" cy="110" r="96"></circle>
        </svg>
        <div class="ring-center">
          <span id="modeLabel" class="mode-label">집중</span>
          <strong id="clock">25:00</strong>
          <span id="sessionLabel" class="session">완료 세션 0</span>
        </div>
      </div>
      <div class="timer-actions">
        <button type="button" id="startBtn" class="btn btn-primary">시작</button>
        <button type="button" id="resetBtn" class="btn">리셋</button>
        <button type="button" id="skipBtn" class="btn btn-ghost">다음 모드</button>
      </div>
      <p id="timerHint" class="hint">25분 집중 후 5분 휴식, 4세션마다 15분 긴 휴식.</p>
    </section>

    <section class="card todo-card">
      <div class="todo-head">
        <h2>오늘의 할 일</h2>
        <span id="todoCount" class="pill">0 / 0</span>
      </div>
      <form id="todoForm" class="todo-form">
        <input id="todoInput" type="text" maxlength="80" placeholder="할 일을 입력하고 Enter" autocomplete="off" />
        <button type="submit" class="btn btn-primary">추가</button>
      </form>
      <div class="filters" role="tablist" aria-label="할 일 필터">
        <button type="button" class="chip is-active" data-filter="all">전체</button>
        <button type="button" class="chip" data-filter="open">남은 일</button>
        <button type="button" class="chip" data-filter="done">완료</button>
      </div>
      <ul id="todoList" class="todo-list"></ul>
      <p id="todoEmpty" class="empty">할 일을 추가해 오늘 집중할 것을 정하세요.</p>
    </section>
  </main>
  <div id="toast" class="toast" hidden></div>`;

  const css = `/* 집중 타이머 */
.timer-card { display: flex; flex-direction: column; gap: 14px; align-items: center; }
.modes { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.mode { border: 1px solid var(--line); background: transparent; color: var(--sub); border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 700; }
.mode.is-active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); }
[data-theme="dark"] .mode.is-active { color: var(--accent); }
.ring-wrap { position: relative; width: min(260px, 68vw); aspect-ratio: 1 / 1; display: grid; place-items: center; }
.ring { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: var(--line); stroke-width: 12; }
.ring-fg { fill: none; stroke: var(--accent); stroke-width: 12; stroke-linecap: round; transition: stroke-dashoffset .3s linear; }
.ring-center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; gap: 2px; }
.ring-center strong { font-size: clamp(34px, 11vw, 46px); font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.mode-label { font-size: 11px; letter-spacing: .14em; color: var(--accent); font-weight: 800; }
.session { font-size: 11px; color: var(--sub); }
.timer-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.hint { font-size: 11.5px; color: var(--sub); text-align: center; margin: 0; }

/* 오늘의 할 일 */
.todo-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.todo-head h2 { font-size: 14px; }
.todo-form { display: flex; gap: 8px; margin: 12px 0 10px; }
.todo-form input { flex: 1 1 auto; min-width: 0; }
.todo-form .btn { flex: 0 0 auto; }
.filters { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.todo-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.todo { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 11px; padding: 8px 10px; }
.todo.is-done { opacity: .62; }
.todo .check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--txt); flex: 1 1 auto; cursor: pointer; min-width: 0; }
.todo .check input { width: 17px; height: 17px; flex: none; accent-color: var(--accent); }
.todo .check span { overflow-wrap: anywhere; }
.todo.is-done .check span { text-decoration: line-through; color: var(--sub); }
.todo .del { border: none; background: transparent; color: var(--sub); font-size: 13px; padding: 2px 7px; border-radius: 8px; }
.todo .del:hover { color: var(--danger); background: var(--accent-soft); }
`;

  const js = `/* ${ctx.title} — 포모도로 타이머 + 오늘의 할 일 (Agent Collab Studio v2.3 폴백 생성) */
(function () {
  'use strict';
  var KEY = '${KEY}';
${themeJs(KEY)}
  var MODES = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  var LABEL = { focus: '집중', short: '짧은 휴식', long: '긴 휴식' };
  var state = { mode: 'focus', remaining: MODES.focus, running: false, sessions: 0, todos: [], filter: 'all' };
  var tick = null;
  var deadline = 0;
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var v = JSON.parse(raw) || {};
        state.sessions = v.sessions | 0;
        state.todos = Array.isArray(v.todos) ? v.todos : [];
        state.mode = MODES[v.mode] ? v.mode : 'focus';
      }
    } catch (e) {}
    state.remaining = MODES[state.mode];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ sessions: state.sessions, todos: state.todos, mode: state.mode })); } catch (e) {}
  }
  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function toast(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      [0, 0.22, 0.44].forEach(function (offset, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 2 ? 880 : 660;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.24);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1400);
    } catch (e) {}
  }

  function renderTimer() {
    var clock = $('clock');
    if (clock) clock.textContent = fmt(state.remaining);
    if ($('modeLabel')) $('modeLabel').textContent = LABEL[state.mode];
    if ($('sessionLabel')) $('sessionLabel').textContent = '완료 세션 ' + state.sessions;
    var total = MODES[state.mode];
    var ring = $('ring');
    if (ring) {
      var c = 2 * Math.PI * 96;
      ring.style.strokeDasharray = c.toFixed(2);
      ring.style.strokeDashoffset = (c * (1 - (total ? state.remaining / total : 0))).toFixed(2);
    }
    if ($('startBtn')) $('startBtn').textContent = state.running ? '일시정지' : (state.remaining < total ? '계속' : '시작');
    Array.prototype.forEach.call(document.querySelectorAll('.mode'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-mode') === state.mode);
    });
    if ($('timerHint')) {
      $('timerHint').textContent = state.mode === 'focus'
        ? '25분 집중 후 5분 휴식, 4세션마다 15분 긴 휴식.'
        : '휴식 중에는 화면에서 잠깐 벗어나세요. 끝나면 자동으로 집중 모드로 돌아옵니다.';
    }
  }

  function start() {
    if (state.running) return;
    state.running = true;
    deadline = Date.now() + state.remaining * 1000;
    clearInterval(tick);
    tick = setInterval(step, 250);
    renderTimer();
  }
  function pause() {
    if (!state.running) return;
    state.remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    state.running = false;
    clearInterval(tick);
    tick = null;
    renderTimer();
  }
  function step() {
    var left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    if (left !== state.remaining) {
      state.remaining = left;
      renderTimer();
    }
    if (left <= 0) complete();
  }
  function complete() {
    state.running = false;
    clearInterval(tick);
    tick = null;
    beep();
    if (state.mode === 'focus') {
      state.sessions += 1;
      state.mode = state.sessions % 4 === 0 ? 'long' : 'short';
    } else {
      state.mode = 'focus';
    }
    state.remaining = MODES[state.mode];
    save();
    renderTimer();
    toast(LABEL[state.mode] + ' 시작 — ' + fmt(state.remaining));
  }
  function reset() {
    state.running = false;
    clearInterval(tick);
    tick = null;
    state.remaining = MODES[state.mode];
    renderTimer();
  }
  function setMode(mode) {
    if (!MODES[mode]) return;
    state.running = false;
    clearInterval(tick);
    tick = null;
    state.mode = mode;
    state.remaining = MODES[mode];
    save();
    renderTimer();
  }

  function addTodo(text) {
    var value = String(text || '').trim();
    if (!value) return;
    state.todos.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 5), text: value, done: false });
    save();
    renderTodos();
  }
  function renderTodos() {
    var list = $('todoList');
    if (!list) return;
    var done = state.todos.filter(function (t) { return t.done; }).length;
    if ($('todoCount')) $('todoCount').textContent = done + ' / ' + state.todos.length;
    var items = state.todos.filter(function (t) {
      if (state.filter === 'open') return !t.done;
      if (state.filter === 'done') return t.done;
      return true;
    });
    list.innerHTML = items.map(function (t) {
      return '<li class="todo' + (t.done ? ' is-done' : '') + '">' +
        '<label class="check"><input type="checkbox" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + ' />' +
        '<span>' + esc(t.text) + '</span></label>' +
        '<button type="button" class="del" data-del="' + t.id + '" aria-label="삭제">✕</button></li>';
    }).join('');
    if ($('todoEmpty')) $('todoEmpty').hidden = items.length > 0;
    Array.prototype.forEach.call(document.querySelectorAll('.filters .chip'), function (chip) {
      chip.classList.toggle('is-active', chip.getAttribute('data-filter') === state.filter);
    });
  }

  function init() {
    load();
    initTheme();
    var form = $('todoForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('todoInput');
      addTodo(input.value);
      input.value = '';
      input.focus();
    });
    var list = $('todoList');
    if (list) list.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) {
        var id = del.getAttribute('data-del');
        state.todos = state.todos.filter(function (t) { return t.id !== id; });
        save();
        renderTodos();
      }
    });
    if (list) list.addEventListener('change', function (e) {
      var box = e.target.closest('input[type=checkbox]');
      if (!box) return;
      var id = box.getAttribute('data-id');
      state.todos.forEach(function (t) { if (t.id === id) t.done = box.checked; });
      save();
      renderTodos();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.filters .chip'), function (chip) {
      chip.addEventListener('click', function () {
        state.filter = chip.getAttribute('data-filter');
        renderTodos();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.mode'), function (btn) {
      btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
    });
    if ($('startBtn')) $('startBtn').addEventListener('click', function () { if (state.running) pause(); else start(); });
    if ($('resetBtn')) $('resetBtn').addEventListener('click', reset);
    if ($('skipBtn')) $('skipBtn').addEventListener('click', function () {
      state.mode = state.mode === 'focus' ? 'short' : 'focus';
      reset();
    });
    renderTimer();
    renderTodos();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

  const readme = readmeFor(ctx, "포모도로 집중 타이머 & 오늘의 할 일", [
    "25분 집중 / 5분 짧은 휴식 / 15분 긴 휴식 타이머 (SVG 원형 진행 링, 시작·일시정지·리셋·모드 전환)",
    "타이머가 끝나면 Web Audio 비프음과 함께 다음 모드로 자동 전환, 4세션마다 긴 휴식",
    "오늘의 할 일 추가·완료 체크·삭제, 전체/남은 일/완료 필터",
    "할 일·완료 세션·모드를 localStorage 에 저장해 새로고침 후에도 유지",
    "다크/라이트 테마 토글, 390px 모바일 대응",
  ]);
  return { html: pageHtml(ctx, body, "포모도로 타이머"), css: baseCss() + css, js: js, readme, archetype: "pomodoro" };
}

/* ── 2) 계산기 ───────────────────────────────────────────── */

function calculatorPresets(ctx) {
  const text = norm([ctx.title, ctx.goal, ctx.context].join(" "));
  const presets = [];
  const amounts = [];
  const reMan = /([0-9][0-9,\.]*)\s*만\s*원/g;
  const reWon = /([0-9][0-9,\.]*)\s*원/g;
  let m;
  while ((m = reMan.exec(text))) amounts.push(Math.round(num(m[1], 0) * 10000));
  while ((m = reWon.exec(text))) amounts.push(Math.round(num(m[1], 0)));
  const rateMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  const monthMatch = text.match(/([0-9]+)\s*개월/);
  const yearMatch = text.match(/([0-9]+)\s*년/);
  const amount = amounts.filter((v) => v >= 10000).sort((a, b) => b - a)[0] || 10000000;
  const rate = rateMatch ? num(rateMatch[1], 3.5) : 3.5;
  const months = monthMatch ? num(monthMatch[1], 24) : yearMatch ? num(yearMatch[1], 2) * 12 : 24;
  if (rateMatch || monthMatch || yearMatch || amounts.length) {
    presets.push({ label: "과제 조건", amount: amount, rate: rate, months: Math.max(1, Math.min(600, months)) });
  }
  const base = [
    { label: "1,000만원 · 3.5% · 24개월", amount: 10000000, rate: 3.5, months: 24 },
    { label: "3,000만원 · 4.2% · 36개월", amount: 30000000, rate: 4.2, months: 36 },
    { label: "500만원 · 2.8% · 12개월", amount: 5000000, rate: 2.8, months: 12 },
  ];
  base.forEach((p) => {
    if (!presets.some((x) => x.amount === p.amount && x.rate === p.rate && x.months === p.months)) presets.push(p);
  });
  return presets.slice(0, 4);
}

function calculatorApp(ctx) {
  const KEY = "acs.calculator." + ctx.name;
  const presets = calculatorPresets(ctx);
  const body = `  <main class="grid">
    <section class="card">
      <h2 class="card-title">조건 입력</h2>
      <div class="presets" id="presets"></div>
      <div class="fields">
        <label class="field"><span>원금 (원)</span><input id="amount" type="number" min="0" step="10000" value="${presets[0].amount}" inputmode="numeric" /></label>
        <label class="field"><span>연 이율 (%)</span><input id="rate" type="number" min="0" max="100" step="0.1" value="${presets[0].rate}" inputmode="decimal" /></label>
        <label class="field"><span>기간 (개월)</span><input id="months" type="number" min="1" max="600" step="1" value="${presets[0].months}" inputmode="numeric" /></label>
        <label class="field"><span>계산 방식</span>
          <select id="mode">
            <option value="compound">월 복리</option>
            <option value="simple">단리</option>
          </select>
        </label>
      </div>
      <p class="hint">값을 바꾸면 결과가 즉시 다시 계산됩니다.</p>
    </section>

    <section class="card result">
      <span class="eyebrow">RESULT</span>
      <div class="result-main">
        <strong id="total">0원</strong>
        <span>만기 수령액</span>
      </div>
      <div class="result-grid">
        <div><span>원금</span><b id="principal">0원</b></div>
        <div><span>이자</span><b id="interest">0원</b></div>
        <div><span>수익률</span><b id="yield">0%</b></div>
        <div><span>월 평균 이자</span><b id="avg">0원</b></div>
      </div>
      <h3 class="sub-title">기간별 분해</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>기간</th><th>원금</th><th>이자</th><th>누적</th></tr></thead>
          <tbody id="breakdown"></tbody>
        </table>
      </div>
      <div class="row">
        <button type="button" id="saveCalc" class="btn btn-primary">계산 기록 저장</button>
        <button type="button" id="clearHist" class="btn">기록 비우기</button>
      </div>
    </section>
  </main>

  <section class="card hist-card">
    <h2 class="card-title">최근 계산 기록</h2>
    <ul id="history" class="hist"></ul>
    <p id="histEmpty" class="empty">저장한 계산이 없습니다. 위에서 &lsquo;계산 기록 저장&rsquo;을 눌러 보세요.</p>
  </section>
  <div id="toast" class="toast" hidden></div>`;

  const css = `/* 계산기 */
.card-title { font-size: 14px; margin-bottom: 12px; }
.presets { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.preset { border: 1px solid var(--line); background: transparent; color: var(--sub); border-radius: 999px; padding: 5px 11px; font-size: 11.5px; font-weight: 600; }
.preset:hover { border-color: var(--accent); color: var(--accent-strong); }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fields .field:nth-child(3), .fields .field:nth-child(4) { grid-column: span 1; }
.hint { font-size: 11.5px; color: var(--sub); margin: 12px 0 0; }
.result { display: flex; flex-direction: column; gap: 12px; }
.eyebrow { font-size: 10.5px; letter-spacing: .16em; color: var(--accent); font-weight: 800; }
.result-main { display: grid; gap: 2px; }
.result-main strong { font-size: clamp(24px, 6.4vw, 32px); letter-spacing: -.02em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.result-main span { font-size: 11.5px; color: var(--sub); }
.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.result-grid > div { border: 1px solid var(--line); border-radius: 11px; padding: 8px 10px; }
.result-grid span { display: block; font-size: 10.5px; color: var(--sub); }
.result-grid b { display: block; margin-top: 2px; font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.sub-title { font-size: 12px; color: var(--sub); margin: 4px 0 0; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 11px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { font-size: 10.5px; color: var(--sub); font-weight: 700; }
tr:last-child td { border-bottom: 0; }
.hist-card { margin-top: 16px; }
.hist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.hist li { display: flex; justify-content: space-between; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 11px; padding: 8px 10px; font-size: 12px; flex-wrap: wrap; }
.hist button { border: none; background: transparent; color: var(--accent-strong); font-size: 12px; font-weight: 700; padding: 2px 6px; }
.hist .when { color: var(--sub); font-size: 11px; }
@media (max-width: 520px) { .fields { grid-template-columns: 1fr; } .result-grid { grid-template-columns: 1fr; } }
`;

  const js = `/* ${ctx.title} — 실시간 계산기 (Agent Collab Studio v2.3 폴백 생성) */
(function () {
  'use strict';
  var KEY = '${KEY}';
${themeJs(KEY)}
  var HIST = KEY + '.history';
  var PRESETS = ${JSON.stringify(presets)};
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function num(id) {
    var el = $(id);
    var v = parseFloat(String(el ? el.value : '').replace(/[^0-9.\\-]/g, ''));
    return isFinite(v) ? v : 0;
  }
  function money(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }
  function pct(n) { return (Math.round(n * 100) / 100).toLocaleString('ko-KR') + '%'; }
  function toast(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2400);
  }

  function calc() {
    var amount = Math.max(0, num('amount'));
    var rate = Math.max(0, num('rate'));
    var months = Math.max(1, Math.min(600, Math.round(num('months'))));
    var mode = $('mode') ? $('mode').value : 'compound';
    var rows = [];
    var total = amount;
    var i;
    if (mode === 'compound') {
      var r = rate / 100 / 12;
      var bal = amount;
      for (i = 1; i <= months; i += 1) {
        bal += bal * r;
        if (i % 12 === 0 || i === months) rows.push({ label: i + '개월', principal: amount, interest: bal - amount, total: bal });
      }
      total = bal;
    } else {
      var simple = amount * (1 + (rate / 100) * (months / 12));
      for (i = 12; i <= months; i += 12) {
        var part = amount * (rate / 100) * (i / 12);
        rows.push({ label: i + '개월', principal: amount, interest: part, total: amount + part });
      }
      var last = rows.length ? rows[rows.length - 1].label : '';
      if (last !== months + '개월') rows.push({ label: months + '개월', principal: amount, interest: simple - amount, total: simple });
      total = simple;
    }
    var interest = total - amount;
    if ($('total')) $('total').textContent = money(total);
    if ($('principal')) $('principal').textContent = money(amount);
    if ($('interest')) $('interest').textContent = money(interest);
    if ($('yield')) $('yield').textContent = amount > 0 ? pct((interest / amount) * 100) : '0%';
    if ($('avg')) $('avg').textContent = money(interest / months);
    if ($('breakdown')) {
      $('breakdown').innerHTML = rows.map(function (row) {
        return '<tr><td>' + row.label + '</td><td>' + money(row.principal) + '</td><td>' + money(row.interest) + '</td><td><b>' + money(row.total) + '</b></td></tr>';
      }).join('');
    }
    return { amount: amount, rate: rate, months: months, mode: mode, total: total, interest: interest };
  }

  function readHistory() {
    try {
      var raw = localStorage.getItem(HIST);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function writeHistory(list) {
    try { localStorage.setItem(HIST, JSON.stringify(list.slice(0, 8))); } catch (e) {}
  }
  function renderHistory() {
    var list = readHistory();
    var wrap = $('history');
    if (!wrap) return;
    wrap.innerHTML = list.map(function (item, i) {
      return '<li><span>' + esc(item.label) + ' <span class="when">' + esc(item.when) + '</span></span>' +
        '<span class="row"><b>' + money(item.total) + '</b><button type="button" data-apply="' + i + '">불러오기</button></span></li>';
    }).join('');
    if ($('histEmpty')) $('histEmpty').hidden = list.length > 0;
  }

  function renderPresets() {
    var wrap = $('presets');
    if (!wrap) return;
    wrap.innerHTML = PRESETS.map(function (p, i) {
      return '<button type="button" class="preset" data-preset="' + i + '">' + esc(p.label) + '</button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-preset]'), function (btn) {
      btn.addEventListener('click', function () {
        var p = PRESETS[parseInt(btn.getAttribute('data-preset'), 10)];
        if (!p) return;
        $('amount').value = String(p.amount);
        $('rate').value = String(p.rate);
        $('months').value = String(p.months);
        calc();
        toast('프리셋을 적용했습니다');
      });
    });
  }

  function init() {
    initTheme();
    renderPresets();
    ['amount', 'rate', 'months', 'mode'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', calc);
      el.addEventListener('change', calc);
    });
    if ($('saveCalc')) $('saveCalc').addEventListener('click', function () {
      var c = calc();
      var list = readHistory();
      list.unshift({
        label: money(c.amount) + ' · 연 ' + c.rate + '% · ' + c.months + '개월 · ' + (c.mode === 'compound' ? '월 복리' : '단리'),
        when: new Date().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        total: c.total,
        amount: c.amount,
        rate: c.rate,
        months: c.months,
        mode: c.mode
      });
      writeHistory(list);
      renderHistory();
      toast('계산 기록을 저장했습니다');
    });
    if ($('clearHist')) $('clearHist').addEventListener('click', function () {
      writeHistory([]);
      renderHistory();
      toast('기록을 비웠습니다');
    });
    var hist = $('history');
    if (hist) hist.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-apply]');
      if (!btn) return;
      var item = readHistory()[parseInt(btn.getAttribute('data-apply'), 10)];
      if (!item) return;
      $('amount').value = String(item.amount);
      $('rate').value = String(item.rate);
      $('months').value = String(item.months);
      if ($('mode') && item.mode) $('mode').value = item.mode;
      calc();
      toast('기록을 불러왔습니다');
    });
    renderHistory();
    calc();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

  const readme = readmeFor(ctx, "실시간 계산기", [
    "원금·이율·기간을 바꾸면 만기 수령액·이자·수익률이 즉시 다시 계산됩니다",
    "월 복리 / 단리 전환, 기간별 이자 분해표",
    "과제 문장에서 읽은 숫자로 만든 프리셋과 기본 프리셋 3종",
    "계산 기록 저장·불러오기·비우기 (localStorage)",
    "다크/라이트 테마 토글, 390px 모바일 대응",
  ]);
  return { html: pageHtml(ctx, body, "계산기"), css: baseCss() + css, js: js, readme, archetype: "calculator" };
}

/* ── 3) 할 일 · 습관 트래커 ───────────────────────────────── */

function todoApp(ctx) {
  const KEY = "acs.todo." + ctx.name;
  const body = `  <main class="grid">
    <section class="card">
      <div class="stats">
        <svg class="ring2" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring2-bg" cx="60" cy="60" r="48"></circle>
          <circle id="prog" class="ring2-fg" cx="60" cy="60" r="48"></circle>
        </svg>
        <div class="stats-text">
          <strong id="pct">0%</strong>
          <span>완료율</span>
          <p id="summary" class="muted">할 일을 추가해 보세요</p>
        </div>
      </div>
      <form id="addForm" class="add-form">
        <input id="text" type="text" maxlength="90" placeholder="할 일을 입력하세요" autocomplete="off" />
        <div class="row">
          <select id="priority" aria-label="우선순위">
            <option value="high">높음</option>
            <option value="normal" selected>보통</option>
            <option value="low">낮음</option>
          </select>
          <select id="category" aria-label="분류">
            <option>업무</option>
            <option>개인</option>
            <option>공부</option>
            <option>건강</option>
          </select>
          <button type="submit" class="btn btn-primary">추가</button>
        </div>
      </form>
    </section>

    <section class="card">
      <div class="row filters">
        <button type="button" class="chip is-active" data-filter="all">전체</button>
        <button type="button" class="chip" data-filter="open">진행중</button>
        <button type="button" class="chip" data-filter="done">완료</button>
        <span id="count" class="pill">0 / 0</span>
      </div>
      <ul id="list" class="list"></ul>
      <p id="empty" class="empty">아직 할 일이 없습니다. 왼쪽에서 첫 항목을 추가하세요.</p>
    </section>
  </main>
  <div id="toast" class="toast" hidden></div>`;

  const css = `/* 할 일 · 습관 트래커 */
.stats { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.ring2 { width: 96px; height: 96px; transform: rotate(-90deg); flex: none; }
.ring2-bg { fill: none; stroke: var(--line); stroke-width: 10; }
.ring2-fg { fill: none; stroke: var(--accent); stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset .3s ease; }
.stats-text strong { display: block; font-size: 26px; letter-spacing: -.02em; }
.stats-text span { font-size: 11px; color: var(--sub); }
.muted { font-size: 12px; color: var(--sub); margin: 4px 0 0; }
.add-form { display: grid; gap: 8px; }
.add-form input { width: 100%; }
.add-form .row select { width: auto; flex: 1 1 96px; }
.add-form .row .btn { flex: none; }
.filters { margin-bottom: 12px; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
.item { display: flex; align-items: flex-start; gap: 9px; border: 1px solid var(--line); border-radius: 12px; padding: 10px; }
.item.is-done { opacity: .6; }
.item .check { display: flex; gap: 9px; align-items: flex-start; flex: 1 1 auto; cursor: pointer; min-width: 0; }
.item .check input { width: 18px; height: 18px; flex: none; margin-top: 2px; accent-color: var(--accent); }
.item .body { min-width: 0; }
.item .text { font-size: 13px; overflow-wrap: anywhere; }
.item.is-done .text { text-decoration: line-through; color: var(--sub); }
.item .meta { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 4px; }
.dot.high { background: var(--danger); }
.dot.normal { background: var(--amber); }
.dot.low { background: var(--sub); }
.item .del { border: none; background: transparent; color: var(--sub); font-size: 13px; padding: 2px 6px; border-radius: 8px; flex: none; }
.item .del:hover { color: var(--danger); background: var(--accent-soft); }
`;

  const js = `/* ${ctx.title} — 할 일 · 습관 트래커 (Agent Collab Studio v2.3 폴백 생성) */
(function () {
  'use strict';
  var KEY = '${KEY}';
${themeJs(KEY)}
  var PRIORITY = { high: '높음', normal: '보통', low: '낮음' };
  var WEIGHT = { high: 0, normal: 1, low: 2 };
  var state = { items: [], filter: 'all' };
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var v = raw ? JSON.parse(raw) : null;
      if (v && Array.isArray(v.items)) state.items = v.items;
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ items: state.items })); } catch (e) {}
  }
  function toast(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function render() {
    var total = state.items.length;
    var done = state.items.filter(function (t) { return t.done; }).length;
    var p = total ? Math.round((done / total) * 100) : 0;
    if ($('pct')) $('pct').textContent = p + '%';
    if ($('summary')) $('summary').textContent = total ? ((total - done) + '개 남음 · ' + done + '개 완료') : '할 일을 추가해 보세요';
    if ($('count')) $('count').textContent = done + ' / ' + total;
    var ring = $('prog');
    if (ring) {
      var c = 2 * Math.PI * 48;
      ring.style.strokeDasharray = c.toFixed(2);
      ring.style.strokeDashoffset = (c * (1 - p / 100)).toFixed(2);
    }
    var items = state.items.slice().sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (WEIGHT[a.priority] == null ? 1 : WEIGHT[a.priority]) - (WEIGHT[b.priority] == null ? 1 : WEIGHT[b.priority]);
    }).filter(function (t) {
      if (state.filter === 'open') return !t.done;
      if (state.filter === 'done') return t.done;
      return true;
    });
    if ($('list')) {
      $('list').innerHTML = items.map(function (t) {
        return '<li class="item' + (t.done ? ' is-done' : '') + '">' +
          '<label class="check"><input type="checkbox" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + ' />' +
          '<span class="body"><span class="text">' + esc(t.text) + '</span>' +
          '<span class="meta"><span class="pill"><i class="dot ' + (t.priority || 'normal') + '"></i>' + (PRIORITY[t.priority] || '보통') + '</span>' +
          '<span class="pill">' + esc(t.category || '개인') + '</span></span></span></label>' +
          '<button type="button" class="del" data-del="' + t.id + '" aria-label="삭제">✕</button></li>';
      }).join('');
    }
    if ($('empty')) $('empty').hidden = items.length > 0;
    Array.prototype.forEach.call(document.querySelectorAll('.filters .chip'), function (chip) {
      chip.classList.toggle('is-active', chip.getAttribute('data-filter') === state.filter);
    });
  }

  function add(text) {
    var value = String(text || '').trim();
    if (!value) return;
    state.items.push({
      id: 'i' + Date.now() + Math.random().toString(36).slice(2, 5),
      text: value,
      done: false,
      priority: $('priority') ? $('priority').value : 'normal',
      category: $('category') ? $('category').value : '개인',
      createdAt: new Date().toISOString()
    });
    save();
    render();
    toast('할 일을 추가했습니다');
  }

  function init() {
    load();
    initTheme();
    var form = $('addForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      add($('text').value);
      $('text').value = '';
      $('text').focus();
    });
    var list = $('list');
    if (list) list.addEventListener('change', function (e) {
      var box = e.target.closest('input[type=checkbox]');
      if (!box) return;
      var id = box.getAttribute('data-id');
      state.items.forEach(function (t) { if (t.id === id) t.done = box.checked; });
      save();
      render();
    });
    if (list) list.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (!del) return;
      var id = del.getAttribute('data-del');
      state.items = state.items.filter(function (t) { return t.id !== id; });
      save();
      render();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.filters .chip'), function (chip) {
      chip.addEventListener('click', function () {
        state.filter = chip.getAttribute('data-filter');
        render();
      });
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

  const readme = readmeFor(ctx, "할 일 · 습관 트래커", [
    "할 일 추가·완료 체크·삭제, 우선순위(높음/보통/낮음)와 분류(업무/개인/공부/건강)",
    "완료율 원형 진행 링과 남은 개수 요약",
    "전체 / 진행중 / 완료 필터, 우선순위 정렬",
    "모든 항목 localStorage 저장",
    "다크/라이트 테마 토글, 390px 모바일 대응",
  ]);
  return { html: pageHtml(ctx, body, "할 일 트래커"), css: baseCss() + css, js: js, readme, archetype: "todo" };
}

/* ── 4) 퀴즈 · 플래시카드 ─────────────────────────────────── */

function quizApp(ctx) {
  const KEY = "acs.quiz." + ctx.name;
  const seeds = [
    { front: "이 과제의 제목은?", back: ctx.title },
    { front: "이 과제의 목표는?", back: ctx.goal || "목표를 한 문장으로 정리한다." },
    { front: "배경·제약은?", back: ctx.context || "혼자 진행, 무료 도구만 사용." },
    { front: "이 앱을 한 문장으로 소개하면?", back: ctx.title + " — " + (ctx.goalShort || "학습 카드로 반복 암기하는 앱") },
  ];
  const body = `  <main class="grid">
    <section class="card quiz-card">
      <div class="row quiz-top">
        <span id="progress" class="pill">1 / 4</span>
        <span id="score" class="pill">점수 0</span>
        <span id="streak" class="pill">연속 0</span>
      </div>
      <button type="button" id="flip" class="flash" aria-label="카드를 눌러 정답 보기">
        <span class="flash-inner">
          <span class="flash-face flash-front"><b>질문</b><span id="front">질문</span></span>
          <span class="flash-face flash-back"><b>정답</b><span id="back">정답</span></span>
        </span>
      </button>
      <p id="hint" class="hint">카드를 누르면 정답이 보입니다. 채점은 아래 버튼으로 하세요.</p>
      <div class="row quiz-actions">
        <button type="button" id="prev" class="btn">이전</button>
        <button type="button" id="reveal" class="btn">정답 보기</button>
        <button type="button" id="right" class="btn btn-primary">정답 ✓</button>
        <button type="button" id="wrong" class="btn">오답 ✗</button>
        <button type="button" id="next" class="btn">다음</button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">카드 추가</h2>
      <form id="cardForm" class="form-col">
        <label class="field"><span>앞면 (질문)</span><input id="q" type="text" maxlength="120" placeholder="예: 이 용어의 뜻은?" /></label>
        <label class="field"><span>뒷면 (정답)</span><textarea id="a" rows="3" maxlength="300" placeholder="정답을 적으세요"></textarea></label>
        <button type="submit" class="btn btn-primary">카드 저장</button>
      </form>
      <h3 class="sub-title">내 카드 <span id="cardCount" class="pill">0</span></h3>
      <ul id="cards" class="mini-list"></ul>
    </section>
  </main>
  <div id="toast" class="toast" hidden></div>`;

  const css = `/* 플래시카드 · 퀴즈 */
.quiz-card { display: flex; flex-direction: column; gap: 12px; }
.quiz-top { justify-content: space-between; }
.flash { border: none; background: transparent; padding: 0; width: 100%; perspective: 900px; }
.flash-inner { position: relative; display: block; min-height: 210px; transform-style: preserve-y; transition: transform .45s ease; transform-style: preserve-3d; }
.flash.is-flipped .flash-inner { transform: rotateY(180deg); }
.flash-face {
  position: absolute; inset: 0; display: flex; flex-direction: column; gap: 8px;
  align-items: center; justify-content: center; text-align: center; padding: 18px;
  border: 1px solid var(--line); border-radius: 16px; background: var(--bg);
  backface-visibility: hidden; -webkit-backface-visibility: hidden;
}
.flash-face b { font-size: 10.5px; letter-spacing: .14em; color: var(--accent); font-weight: 800; }
.flash-face span { font-size: clamp(15px, 4vw, 19px); font-weight: 700; overflow-wrap: anywhere; }
.flash-back { transform: rotateY(180deg); background: var(--accent-soft); }
.hint { font-size: 11.5px; color: var(--sub); margin: 0; text-align: center; }
.quiz-actions { justify-content: center; }
.quiz-actions .btn { flex: 1 1 auto; }
.form-col { display: grid; gap: 9px; margin-bottom: 14px; }
.card-title { font-size: 14px; margin-bottom: 10px; }
.sub-title { font-size: 12px; color: var(--sub); margin: 0 0 8px; display: flex; gap: 6px; align-items: center; }
.mini-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 260px; overflow-y: auto; }
.mini-list li { display: flex; justify-content: space-between; gap: 8px; align-items: center; border: 1px solid var(--line); border-radius: 10px; padding: 7px 9px; font-size: 12px; }
.mini-list span { overflow-wrap: anywhere; }
.mini-list button { border: none; background: transparent; color: var(--sub); font-size: 12px; padding: 2px 5px; }
.mini-list button:hover { color: var(--danger); }
@media (max-width: 720px) { .flash-inner { min-height: 180px; } }
`;

  const js = `/* ${ctx.title} — 플래시카드 · 퀴즈 (Agent Collab Studio v2.3 폴백 생성) */
(function () {
  'use strict';
  var KEY = '${KEY}';
${themeJs(KEY)}
  var SEED = ${JSON.stringify(seeds)};
  var state = { cards: [], i: 0, flipped: false, score: 0, streak: 0, best: 0, answered: {} };
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var v = raw ? JSON.parse(raw) : null;
      if (v && Array.isArray(v.cards) && v.cards.length) {
        state.cards = v.cards;
        state.score = v.score | 0;
        state.streak = v.streak | 0;
        state.best = v.best | 0;
      }
    } catch (e) {}
    if (!state.cards.length) {
      state.cards = SEED.map(function (c, i) { return { id: 'c' + i, front: c.front, back: c.back }; });
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ cards: state.cards, score: state.score, streak: state.streak, best: state.best }));
    } catch (e) {}
  }
  function toast(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function current() { return state.cards[state.i] || state.cards[0]; }

  function render() {
    var card = current();
    if ($('front')) $('front').textContent = card ? card.front : '카드가 없습니다';
    if ($('back')) $('back').textContent = card ? card.back : '카드를 추가하세요';
    if ($('progress')) $('progress').textContent = (state.cards.length ? state.i + 1 : 0) + ' / ' + state.cards.length;
    if ($('score')) $('score').textContent = '점수 ' + state.score;
    if ($('streak')) $('streak').textContent = '연속 ' + state.streak;
    if ($('cardCount')) $('cardCount').textContent = String(state.cards.length);
    var flash = $('flip');
    if (flash) flash.classList.toggle('is-flipped', state.flipped);
    if ($('hint')) $('hint').textContent = state.flipped ? '정답을 확인하고 채점하세요.' : '카드를 누르면 정답이 보입니다. 채점은 아래 버튼으로 하세요.';
    if ($('cards')) {
      $('cards').innerHTML = state.cards.map(function (c) {
        return '<li><span><b>' + esc(c.front) + '</b><br>' + esc(c.back) + '</span>' +
          '<button type="button" data-del="' + c.id + '" aria-label="카드 삭제">✕</button></li>';
      }).join('');
    }
  }
  function go(delta) {
    if (!state.cards.length) return;
    state.i = (state.i + delta + state.cards.length) % state.cards.length;
    state.flipped = false;
    render();
  }
  function grade(ok) {
    if (!state.cards.length) return;
    if (ok) {
      state.score += 1;
      state.streak += 1;
      if (state.streak > state.best) state.best = state.streak;
      toast('정답! 연속 ' + state.streak);
    } else {
      state.streak = 0;
      toast('오답 — 정답을 다시 확인하세요');
    }
    state.flipped = true;
    save();
    render();
    setTimeout(function () { go(1); }, 520);
  }

  function init() {
    load();
    initTheme();
    if ($('flip')) $('flip').addEventListener('click', function () {
      state.flipped = !state.flipped;
      render();
    });
    if ($('reveal')) $('reveal').addEventListener('click', function () { state.flipped = true; render(); });
    if ($('next')) $('next').addEventListener('click', function () { go(1); });
    if ($('prev')) $('prev').addEventListener('click', function () { go(-1); });
    if ($('right')) $('right').addEventListener('click', function () { grade(true); });
    if ($('wrong')) $('wrong').addEventListener('click', function () { grade(false); });
    var form = $('cardForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('q').value.trim();
      var a = $('a').value.trim();
      if (!q || !a) { toast('앞면과 뒷면을 모두 채우세요'); return; }
      state.cards.push({ id: 'c' + Date.now(), front: q, back: a });
      save();
      $('q').value = '';
      $('a').value = '';
      render();
      toast('카드를 추가했습니다');
    });
    var cards = $('cards');
    if (cards) cards.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (!del) return;
      var id = del.getAttribute('data-del');
      state.cards = state.cards.filter(function (c) { return c.id !== id; });
      if (state.i >= state.cards.length) state.i = 0;
      save();
      render();
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

  const readme = readmeFor(ctx, "플래시카드 · 퀴즈", [
    "카드를 누르면 3D 로 뒤집혀 정답이 보입니다",
    "정답/오답 채점, 점수와 연속 정답 표시",
    "이전/다음 카드 이동, 카드 추가·삭제",
    "카드·점수·연속 정답 localStorage 저장 (앞면/뒷면 시드 4장 포함)",
    "다크/라이트 테마 토글, 390px 모바일 대응",
  ]);
  return { html: pageHtml(ctx, body, "플래시카드 퀴즈"), css: baseCss() + css, js: js, readme, archetype: "quiz" };
}

/* ── 5) 메모 · 노트 ───────────────────────────────────────── */

function notesApp(ctx) {
  const KEY = "acs.notes." + ctx.name;
  const seedNotes = [
    { id: "n1", title: "과제 목표", tags: ["목표"], body: (ctx.goal || "목표를 한 문장으로 적어 두세요."), pinned: true },
    { id: "n2", title: "배경 · 제약", tags: ["제약"], body: (ctx.context || "기간, 예산, 사용할 도구를 적어 두면 나중에 판단이 빨라집니다."), pinned: false },
    { id: "n3", title: "첫 메모", tags: ["시작"], body: "오늘 떠오른 아이디어를 여기에 적어 보세요.\n\n- \n- \n", pinned: false },
  ];
  const body = `  <main class="notes">
    <aside class="card note-side">
      <div class="side-top">
        <h2 class="card-title">노트</h2>
        <button type="button" id="newNote" class="btn btn-primary">+ 새 노트</button>
      </div>
      <input id="search" type="search" placeholder="제목·내용 검색" autocomplete="off" />
      <ul id="noteList" class="note-list"></ul>
      <p id="noteEmpty" class="empty">노트가 없습니다.</p>
    </aside>

    <section class="card note-edit">
      <div class="row edit-tools">
        <input id="noteTitle" class="title-input" type="text" maxlength="80" placeholder="제목" />
        <button type="button" id="pinBtn" class="btn" aria-pressed="false">📌 고정</button>
        <button type="button" id="dlBtn" class="btn">.md 저장</button>
        <button type="button" id="delBtn" class="btn">삭제</button>
      </div>
      <input id="noteTags" type="text" placeholder="태그 (쉼표로 구분)" />
      <textarea id="noteBody" rows="16" placeholder="내용을 적으세요. 자동 저장됩니다."></textarea>
      <p id="saved" class="saved">자동 저장됩니다.</p>
    </section>
  </main>
  <div id="toast" class="toast" hidden></div>`;

  const css = `/* 메모 · 노트 */
.notes { display: grid; grid-template-columns: 292px 1fr; gap: 16px; align-items: start; }
.note-side { display: flex; flex-direction: column; gap: 10px; }
.side-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-title { font-size: 14px; }
.side-top .btn { padding: 7px 11px; font-size: 12px; }
.note-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 60vh; overflow-y: auto; }
.note-list li { border: 1px solid var(--line); border-radius: 11px; padding: 9px 10px; cursor: pointer; }
.note-list li.is-active { border-color: var(--accent); background: var(--accent-soft); }
.note-list b { display: block; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-list small { display: block; font-size: 11px; color: var(--sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
.note-list .pin { color: var(--accent-strong); font-size: 10px; }
.note-edit { display: flex; flex-direction: column; gap: 10px; }
.edit-tools { flex-wrap: wrap; }
.title-input { flex: 1 1 180px; font-size: 15px; font-weight: 700; }
.edit-tools .btn { padding: 7px 11px; font-size: 12px; }
#noteBody { resize: vertical; line-height: 1.7; min-height: 220px; }
.saved { font-size: 11px; color: var(--sub); margin: 0; }
@media (max-width: 860px) { .notes { grid-template-columns: 1fr; } .note-list { max-height: 220px; } }
`;

  const js = `/* ${ctx.title} — 메모 · 노트 (Agent Collab Studio v2.3 폴백 생성) */
(function () {
  'use strict';
  var KEY = '${KEY}';
${themeJs(KEY)}
  var SEED = ${JSON.stringify(seedNotes)};
  var state = { notes: [], active: '', q: '' };
  var saveTimer = null;
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function now() { return new Date().toISOString(); }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var v = raw ? JSON.parse(raw) : null;
      if (v && Array.isArray(v.notes) && v.notes.length) {
        state.notes = v.notes;
        state.active = v.active || v.notes[0].id;
        return;
      }
    } catch (e) {}
    state.notes = SEED.map(function (n) {
      return { id: n.id, title: n.title, tags: n.tags, body: n.body, pinned: !!n.pinned, updatedAt: now() };
    });
    state.active = state.notes.length ? state.notes[0].id : '';
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ notes: state.notes, active: state.active })); } catch (e) {}
  }
  function toast(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function current() {
    return state.notes.filter(function (n) { return n.id === state.active; })[0] || null;
  }
  function renderList() {
    var q = state.q.toLowerCase();
    var list = state.notes.slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    }).filter(function (n) {
      if (!q) return true;
      return (n.title + ' ' + n.body + ' ' + (n.tags || []).join(' ')).toLowerCase().indexOf(q) !== -1;
    });
    if ($('noteList')) {
      $('noteList').innerHTML = list.map(function (n) {
        var first = String(n.body || '').split('\\n').find(function (line) { return line.trim(); }) || '';
        return '<li data-id="' + n.id + '"' + (n.id === state.active ? ' class="is-active"' : '') + '>' +
          '<b>' + (n.pinned ? '<span class="pin">📌 </span>' : '') + esc(n.title || '제목 없음') + '</b>' +
          '<small>' + esc(first.slice(0, 60)) + '</small></li>';
      }).join('');
    }
    if ($('noteEmpty')) $('noteEmpty').hidden = list.length > 0;
  }
  function renderEditor() {
    var n = current();
    if (!n) {
      if ($('noteTitle')) $('noteTitle').value = '';
      if ($('noteBody')) $('noteBody').value = '';
      if ($('noteTags')) $('noteTags').value = '';
      if ($('pinBtn')) $('pinBtn').setAttribute('aria-pressed', 'false');
      return;
    }
    if ($('noteTitle')) $('noteTitle').value = n.title || '';
    if ($('noteBody')) $('noteBody').value = n.body || '';
    if ($('noteTags')) $('noteTags').value = (n.tags || []).join(', ');
    if ($('pinBtn')) {
      $('pinBtn').setAttribute('aria-pressed', n.pinned ? 'true' : 'false');
      $('pinBtn').textContent = n.pinned ? '📌 고정됨' : '📌 고정';
    }
    if ($('saved')) $('saved').textContent = '마지막 수정 ' + new Date(n.updatedAt || Date.now()).toLocaleTimeString('ko-KR');
  }
  function render() { renderList(); renderEditor(); }
  function touch() {
    var n = current();
    if (!n) return;
    n.title = $('noteTitle') ? $('noteTitle').value : n.title;
    n.body = $('noteBody') ? $('noteBody').value : n.body;
    n.tags = ($('noteTags') ? $('noteTags').value : '').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    n.updatedAt = now();
    save();
    if ($('saved')) $('saved').textContent = '저장됨 ' + new Date().toLocaleTimeString('ko-KR');
    renderList();
  }
  function schedule() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(touch, 280);
  }

  function init() {
    load();
    initTheme();
    render();
    if ($('noteList')) $('noteList').addEventListener('click', function (e) {
      var li = e.target.closest('[data-id]');
      if (!li) return;
      state.active = li.getAttribute('data-id');
      save();
      render();
    });
    if ($('search')) $('search').addEventListener('input', function () {
      state.q = $('search').value;
      renderList();
    });
    ['noteTitle', 'noteBody', 'noteTags'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', schedule);
    });
    if ($('newNote')) $('newNote').addEventListener('click', function () {
      var note = { id: 'n' + Date.now(), title: '새 노트', tags: [], body: '', pinned: false, updatedAt: now() };
      state.notes.unshift(note);
      state.active = note.id;
      save();
      render();
      if ($('noteTitle')) $('noteTitle').focus();
    });
    if ($('pinBtn')) $('pinBtn').addEventListener('click', function () {
      var n = current();
      if (!n) return;
      n.pinned = !n.pinned;
      n.updatedAt = now();
      save();
      render();
      toast(n.pinned ? '노트를 고정했습니다' : '고정을 해제했습니다');
    });
    if ($('delBtn')) $('delBtn').addEventListener('click', function () {
      var n = current();
      if (!n) return;
      state.notes = state.notes.filter(function (x) { return x.id !== n.id; });
      state.active = state.notes.length ? state.notes[0].id : '';
      save();
      render();
      toast('노트를 삭제했습니다');
    });
    if ($('dlBtn')) $('dlBtn').addEventListener('click', function () {
      var n = current();
      if (!n) return;
      var text = '# ' + (n.title || '제목 없음') + '\\n\\n' + ((n.tags || []).length ? '태그: ' + n.tags.join(', ') + '\\n\\n' : '') + (n.body || '') + '\\n';
      var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (n.title || 'note').replace(/[\\\\/:*?"<>|]/g, '-') + '.md';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('.md 파일로 저장했습니다');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

  const readme = readmeFor(ctx, "메모 · 노트", [
    "목록 + 편집기 2단 구성, 실시간 제목·내용 검색",
    "태그 입력과 고정(pin) 정렬",
    "입력하면 자동 저장(localStorage)되고 마지막 수정 시각을 표시합니다",
    "현재 노트를 .md 파일로 내려받기",
    "다크/라이트 테마 토글, 390px 모바일 대응(목록 위·편집기 아래)",
  ]);
  return { html: pageHtml(ctx, body, "메모 노트"), css: baseCss() + css, js: js, readme, archetype: "notes" };
}

/* ── 6) 목록 · 큐레이션 ───────────────────────────────────── */

function directoryApp(ctx) {
  const KEY = "acs.directory." + ctx.name;
  const days = (n) => {
    const d = new Date(ctx.now + n * 86400000);
    return d.toISOString().slice(0, 10);
  };
  const keyword = (() => {
    const words = norm(ctx.title).replace(/[^\uAC00-\uD7A3a-zA-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 2);
    return words.slice(0, 2).join(" ") || "이번 분기";
  })();
  const items = [
    { id: "d1", title: keyword + " 실전 공모전", category: "공모전", org: "한국콘텐츠진흥원", end: days(6), summary: "아이디어 기획서와 시제품 설명으로 참가하는 공모전입니다. 대상 상금과 후속 지원이 있습니다." },
    { id: "d2", title: "1인 창업 지원사업", category: "지원사업", org: "창업진흥원", end: days(12), summary: "초기 사업화 자금과 멘토링을 함께 지원합니다. 사업계획서 1부와 대표자 이력이 필요합니다." },
    { id: "d3", title: "웹앱 포트폴리오 챌린지", category: "공모전", org: "온라인 커뮤니티", end: days(21), summary: "2주 안에 동작하는 웹앱을 배포하고 링크를 제출하는 챌린지입니다. 완성도보다 배포가 중요합니다." },
    { id: "d4", title: "무료 세무·회계 강연", category: "교육·강연", org: "지역 창업지원센터", end: days(3), summary: "개인사업자 부가세 신고와 장부 정리를 다룹니다. 온라인 생중계로 참여할 수 있습니다." },
    { id: "d5", title: "개발자 채용 설명회", category: "채용", org: "IT 채용 플랫폼", end: days(9), summary: "프론트엔드·백엔드 채용 담당자가 직접 설명하는 세션입니다. 포트폴리오 사전 제출 시 면담 우선권이 있습니다." },
    { id: "d6", title: "블로그 수익화 사례 공유회", category: "이벤트", org: "블로거 모임", end: days(30), summary: "애드센스 승인과 글 구조 사례를 공유합니다. 초보 블로거 대상입니다." },
    { id: "d7", title: "지역 소상공인 디지털 전환 지원", category: "지원사업", org: "소상공인시장진흥공단", end: days(45), summary: "홈페이지·온라인몰 구축 비용을 일부 지원합니다. 매출 규모에 따라 지원 한도가 달라집니다." },
    { id: "d8", title: "연말 데이터 분석 특강", category: "교육·강연", org: "온라인 교육 플랫폼", end: days(-4), summary: "지난 회차는 마감되었습니다. 다음 회차 공지를 북마크해 두세요." },
  ];
  const categories = ["공모전", "지원사업", "교육·강연", "채용", "이벤트"];
  const body = `  <main>
    <section class="card tools-card">
      <div class="tools">
        <input id="q" type="search" placeholder="키워드로 검색 (제목·기관·설명)" autocomplete="off" />
        <select id="cat" aria-label="분류 필터">
          <option value="all">전체 분류</option>
          ${categories.map((c) => '<option value="' + c + '">' + c + '</option>').join("")}
        </select>
        <button type="button" id="onlyMark" class="chip" aria-pressed="false">🔖 북마크만</button>
      </div>
      <div class="cats" id="catChips">
        <button type="button" class="chip is-active" data-cat="all">전체</button>
        ${categories.map((c) => '<button type="button" class="chip" data-cat="' + c + '">' + c + '</button>').join("")}
      </div>
    </section>

    <section class="grid2" id="cards"></section>
    <p id="empty" class="empty" hidden>조건에 맞는 항목이 없습니다.</p>
  </main>

  <div class="modal" id="modal" hidden>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <span id="modalCat" class="pill"></span>
        <button type="button" id="modalClose" class="btn modal-close" aria-label="닫기">✕</button>
      </div>
      <h2 id="modalTitle">제목</h2>
      <p id="modalOrg" class="org"></p>
      <p id="modalSummary" class="summary"></p>
      <div class="row modal-foot">
        <span id="modalDday" class="pill"></span>
        <span id="modalPeriod" class="pill"></span>
        <button type="button" id="modalBookmark" class="btn btn-primary">북마크</button>
      </div>
    </div>
  </div>
  <div id="toast" class="toast" hidden></div>`;

  const css = `/* 목록 · 큐레이션 */
.tools-card { display: grid; gap: 10px; margin-bottom: 16px; }
.tools { display: flex; gap: 8px; flex-wrap: wrap; }
.tools input { flex: 1 1 220px; }
.tools select { flex: 0 1 150px; }
.tools .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); }
.cats { display: flex; gap: 6px; flex-wrap: wrap; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.dir-card { text-align: left; display: flex; flex-direction: column; gap: 7px; cursor: pointer; }
.dir-card:hover { border-color: var(--accent); }
.dir-top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
.dir-top h3 { font-size: 14px; overflow-wrap: anywhere; }
.dir-card .org { font-size: 11px; color: var(--sub); margin: 0; }
.dir-card .summary { font-size: 12px; color: var(--sub); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dir-foot { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 2px; }
.dday { font-size: 11px; font-weight: 800; border-radius: 999px; padding: 2px 8px; border: 1px solid var(--line); color: var(--sub); }
.dday.is-soon { color: var(--amber); border-color: var(--amber); }
.dday.is-today { color: var(--danger); border-color: var(--danger); }
.dday.is-closed { color: var(--sub); text-decoration: line-through; }
.mark { border: none; background: transparent; font-size: 14px; padding: 0 2px; margin-left: auto; }
.mark[aria-pressed="true"] { filter: none; }
.mark[aria-pressed="false"] { opacity: .35; }
.modal { position: fixed; inset: 0; background: rgba(6, 12, 22, .55); display: grid; place-items: center; padding: 18px; z-index: 60; }
.modal[hidden] { display: none; }
.modal-box { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; width: min(460px, 100%); box-shadow: var(--shadow); display: grid; gap: 9px; max-height: 86vh; overflow-y: auto; }
.modal-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.modal-close { padding: 4px 9px; font-size: 12px; }
.modal-box h2 { font-size: 17px; overflow-wrap: anywhere; }
.modal-box .org { font-size: 11.5px; color: var(--sub); margin: 0; }
.modal-box .summary { font-size: 13px; margin: 0; }
.modal-foot { margin-top: 4px; }
`;

  const js = `/* ${ctx.title} — 목록 · 큐레이션 (Agent Collab Studio v2.3 폴백 생성) */
(function () {
  'use strict';
  var KEY = '${KEY}';
${themeJs(KEY)}
  var ITEMS = ${JSON.stringify(items)};
  var state = { q: '', cat: 'all', onlyMark: false, marks: {}, openId: '' };
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var v = raw ? JSON.parse(raw) : null;
      if (v && v.marks && typeof v.marks === 'object') state.marks = v.marks;
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ marks: state.marks })); } catch (e) {}
  }
  function toast(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function dday(iso) {
    var end = new Date(iso + 'T23:59:59');
    var diff = Math.ceil((end.getTime() - Date.now()) / 86400000);
    if (diff < 0) return { text: '마감', cls: 'is-closed' };
    if (diff === 0) return { text: 'D-DAY', cls: 'is-today' };
    return { text: 'D-' + diff, cls: diff <= 7 ? 'is-soon' : '' };
  }
  function render() {
    var q = state.q.toLowerCase();
    var list = ITEMS.filter(function (it) {
      if (state.cat !== 'all' && it.category !== state.cat) return false;
      if (state.onlyMark && !state.marks[it.id]) return false;
      if (!q) return true;
      return (it.title + ' ' + it.org + ' ' + it.summary + ' ' + it.category).toLowerCase().indexOf(q) !== -1;
    });
    if ($('cards')) {
      $('cards').innerHTML = list.map(function (it) {
        var d = dday(it.end);
        var marked = !!state.marks[it.id];
        return '<article class="card dir-card" data-open="' + it.id + '">' +
          '<div class="dir-top"><h3>' + esc(it.title) + '</h3>' +
          '<button type="button" class="mark" data-mark="' + it.id + '" aria-pressed="' + (marked ? 'true' : 'false') + '" aria-label="북마크">🔖</button></div>' +
          '<p class="org">' + esc(it.org) + '</p>' +
          '<p class="summary">' + esc(it.summary) + '</p>' +
          '<div class="dir-foot"><span class="pill">' + esc(it.category) + '</span>' +
          '<span class="dday ' + d.cls + '">' + d.text + '</span></div></article>';
      }).join('');
    }
    if ($('empty')) $('empty').hidden = list.length > 0;
    Array.prototype.forEach.call(document.querySelectorAll('#catChips .chip'), function (chip) {
      chip.classList.toggle('is-active', chip.getAttribute('data-cat') === state.cat);
    });
    if ($('onlyMark')) $('onlyMark').setAttribute('aria-pressed', state.onlyMark ? 'true' : 'false');
    if ($('cat') && $('cat').value !== state.cat) $('cat').value = state.cat;
  }
  function openItem(id) {
    var it = ITEMS.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    state.openId = id;
    var d = dday(it.end);
    if ($('modalCat')) $('modalCat').textContent = it.category;
    if ($('modalTitle')) $('modalTitle').textContent = it.title;
    if ($('modalOrg')) $('modalOrg').textContent = it.org;
    if ($('modalSummary')) $('modalSummary').textContent = it.summary;
    if ($('modalDday')) { $('modalDday').textContent = d.text; $('modalDday').className = 'pill dday ' + d.cls; }
    if ($('modalPeriod')) $('modalPeriod').textContent = '마감 ' + it.end;
    if ($('modalBookmark')) $('modalBookmark').textContent = state.marks[id] ? '북마크 해제' : '북마크';
    if ($('modal')) $('modal').hidden = false;
  }
  function closeModal() { if ($('modal')) $('modal').hidden = true; state.openId = ''; }

  function init() {
    load();
    initTheme();
    render();
    if ($('cards')) $('cards').addEventListener('click', function (e) {
      var mark = e.target.closest('[data-mark]');
      if (mark) {
        e.stopPropagation();
        var id = mark.getAttribute('data-mark');
        state.marks[id] = !state.marks[id];
        save();
        render();
        toast(state.marks[id] ? '북마크에 담았습니다' : '북마크를 뺐습니다');
        return;
      }
      var card = e.target.closest('[data-open]');
      if (card) openItem(card.getAttribute('data-open'));
    });
    if ($('q')) $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
    if ($('cat')) $('cat').addEventListener('change', function () { state.cat = $('cat').value; render(); });
    if ($('catChips')) $('catChips').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-cat]');
      if (!chip) return;
      state.cat = chip.getAttribute('data-cat');
      render();
    });
    if ($('onlyMark')) $('onlyMark').addEventListener('click', function () {
      state.onlyMark = !state.onlyMark;
      render();
    });
    if ($('modalClose')) $('modalClose').addEventListener('click', closeModal);
    if ($('modal')) $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    if ($('modalBookmark')) $('modalBookmark').addEventListener('click', function () {
      if (!state.openId) return;
      state.marks[state.openId] = !state.marks[state.openId];
      save();
      render();
      openItem(state.openId);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

  const readme = readmeFor(ctx, "목록 · 큐레이션", [
    "키워드 검색(제목·기관·설명)과 분류 필터, 북마크만 보기",
    "마감일까지 남은 날짜를 D-day 배지로 표시(임박·당일·마감 구분)",
    "카드를 누르면 기관·설명·마감일이 담긴 상세 모달",
    "북마크는 localStorage 에 저장",
    "다크/라이트 테마 토글, 390px 모바일 대응",
  ]);
  return { html: pageHtml(ctx, body, "큐레이션 목록"), css: baseCss() + css, js: js, readme, archetype: "directory" };
}

/* ── 7) 실행 대시보드 (계획·점검 성격 과제 전용) ───────────── */

function listOf(value, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : item && (item.name || item.title || item.r || item.step || "")))
    .map((text) => String(text || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function stepsOf(mission, report) {
  if (report && Array.isArray(report.roadmap) && report.roadmap.length) {
    return report.roadmap.slice(0, 6).map((row, i) => ({
      name: String(row.step || "단계 " + (i + 1)),
      detail: String(row.detail || ""),
      when: String(row.when || ""),
      owner: String(row.owner || ""),
      output: String(row.output || ""),
    }));
  }
  if (mission && Array.isArray(mission.steps) && mission.steps.length) {
    return mission.steps.slice(0, 6).map((row, i) => ({
      name: String(row.name || "단계 " + (i + 1)),
      detail: String(row.detail || ""),
      when: String(row.when || ""),
      owner: String(row.owner || ""),
      output: String(row.output || ""),
    }));
  }
  return [
    { name: "준비", detail: "목표·제약을 확인하고 필요한 자료를 모읍니다.", when: "1일차", owner: "피클", output: "준비 목록" },
    { name: "실행", detail: "가장 작은 첫 결과물을 만들어 확인합니다.", when: "2~3일차", owner: "제미나이 태스크", output: "첫 결과물" },
    { name: "검증", detail: "결과를 기준과 비교하고 빠진 것을 보완합니다.", when: "4일차", owner: "코덱스", output: "검증 노트" },
    { name: "확장", detail: "잘 된 방식을 반복해 규모를 키웁니다.", when: "2주차", owner: "피클", output: "반복 계획" },
  ];
}

function checksOf(mission, report) {
  const fromReport = report && Array.isArray(report.checklist) ? report.checklist : null;
  const fromMission = mission && Array.isArray(mission.checks) ? mission.checks : null;
  const list = (fromReport && fromReport.length ? fromReport : fromMission) || [];
  const cleaned = list.map((c) => String(c || "").trim()).filter(Boolean).slice(0, 8);
  if (cleaned.length >= 3) return cleaned;
  return [
    "과제 목표를 한 문장으로 다시 적었다",
    "이번 주에 끝낼 첫 결과물을 정했다",
    "진행 상황을 매일 한 줄 기록했다",
    "막힌 지점과 다음 행동을 적었다",
    "주간 회고에서 계속할 것과 버릴 것을 골랐다",
  ];
}

function risksOf(mission, report) {
  const list = report && Array.isArray(report.risks) && report.risks.length ? report.risks : (mission && mission.risks) || [];
  const cleaned = list
    .map((r) => ({ r: String((r && (r.r || r.risk)) || "").trim(), m: String((r && (r.m || r.mitigation)) || "").trim() }))
    .filter((r) => r.r)
    .slice(0, 4);
  if (cleaned.length) return cleaned;
  return [
    { r: "시간 부족", m: "하루 30분 고정 블록을 먼저 확보" },
    { r: "범위가 커짐", m: "이번 주 결과물 1개만 남기고 나머지는 다음 주로" },
  ];
}

function dashboardApp(ctx) {
  const KEY = "acs.dashboard." + ctx.name;
  const steps = stepsOf(ctx.mission, ctx.report);
  const checks = checksOf(ctx.mission, ctx.report);
  const risks = risksOf(ctx.mission, ctx.report);
  const goal = ctx.goal || "목표를 정하고 매일 진행을 기록합니다.";

  const body = `  <section class="card progress-card">
    <div class="progress-head">
      <div>
        <span class="eyebrow">PROGRESS</span>
        <strong id="pct">0%</strong>
      </div>
      <span id="count" class="count">0 / ${checks.length} 완료</span>
    </div>
    <div class="bar"><i id="bar"></i></div>
    ${ctx.deadline || ctx.audience ? '<ul class="meta">' + (ctx.deadline ? '<li><b>기간</b> ' + escapeHtml(ctx.deadline) + '</li>' : '') + (ctx.audience ? '<li><b>대상</b> ' + escapeHtml(ctx.audience) + '</li>' : '') + '</ul>' : ''}
  </section>

  <div class="grid">
    <section class="card">
      <h2>실행 단계</h2>
      <ol class="steps">
        ${steps.map((s) => '<li><b>' + escapeHtml(s.name) + '</b>' + (s.when ? ' <span class="tag">' + escapeHtml(s.when) + '</span>' : '') + '<p>' + escapeHtml(s.detail) + '</p>' + (s.output ? '<span class="out">산출물 · ' + escapeHtml(s.output) + '</span>' : '') + '</li>').join("\n        ")}
      </ol>
    </section>

    <section class="card">
      <h2>오늘의 체크리스트</h2>
      <ul class="checks" id="checks">
        ${checks.map((c, i) => '<li><label><input type="checkbox" data-i="' + i + '" /><span>' + escapeHtml(c) + '</span></label></li>').join("\n        ")}
      </ul>
      <button type="button" id="resetBtn" class="btn small">체크 초기화</button>
    </section>

    <section class="card">
      <h2>리스크와 대응</h2>
      <ul class="risks">
        ${risks.map((x) => '<li><b>' + escapeHtml(x.r) + '</b><p>' + escapeHtml(x.m) + '</p></li>').join("\n        ")}
      </ul>
    </section>

    <section class="card">
      <h2>진행 메모</h2>
      <textarea id="notes" rows="7" placeholder="오늘 한 일, 막힌 지점, 다음 행동을 적어 두세요. 자동 저장됩니다."></textarea>
      <div class="row">
        <button type="button" id="exportBtn" class="btn btn-primary">진행 상황 JSON 내보내기</button>
        <span id="saved" class="saved"></span>
      </div>
    </section>
  </div>`;

  const css = `/* 실행 대시보드 */
.progress-card { margin-bottom: 16px; }
.progress-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
.progress-head strong { display: block; font-size: 26px; letter-spacing: -.02em; margin-top: 2px; }
.eyebrow { font-size: 10.5px; letter-spacing: .16em; color: var(--accent); font-weight: 800; }
.count { font-size: 12px; color: var(--sub); }
.bar { height: 8px; border-radius: 999px; background: var(--accent-soft); overflow: hidden; margin-top: 12px; }
.bar i { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 999px; transition: width .3s ease; }
.meta { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 14px 0 0; }
.meta li { font-size: 12px; color: var(--sub); border: 1px solid var(--line); border-radius: 999px; padding: 4px 11px; }
.meta b { color: var(--txt); margin-right: 4px; }
.card h2 { font-size: 14px; margin-bottom: 12px; }
.steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.steps li { border-left: 2px solid var(--accent-soft); padding-left: 12px; font-size: 13px; }
.steps p { margin: 3px 0 0; color: var(--sub); font-size: 12.5px; }
.steps .tag { font-size: 10.5px; border: 1px solid var(--line); border-radius: 999px; padding: 1px 7px; color: var(--sub); margin-left: 4px; }
.steps .out { display: block; font-size: 11px; color: var(--accent); margin-top: 3px; }
.checks { list-style: none; padding: 0; margin: 0 0 10px; display: grid; gap: 8px; }
.checks label { display: flex; gap: 9px; align-items: flex-start; font-size: 13px; cursor: pointer; }
.checks input { width: 17px; height: 17px; margin: 2px 0 0; accent-color: var(--accent); flex: none; }
.checks input:checked + span { color: var(--sub); text-decoration: line-through; }
.risks { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.risks li { font-size: 13px; }
.risks p { margin: 3px 0 0; color: var(--sub); font-size: 12.5px; }
.btn.small { padding: 5px 10px; font-size: 11.5px; }
.saved { font-size: 11px; color: var(--sub); }
`;

  const js = `/* ${ctx.title} — 실행 대시보드 (Agent Collab Studio v2.3 폴백 생성) */
(function () {
  'use strict';
  var KEY = '${KEY}';
${themeJs(KEY)}
  var state = { checks: {}, notes: '' };

  function $(id) { return document.getElementById(id); }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw) || {};
        state.checks = parsed.checks || {};
        state.notes = parsed.notes || '';
      }
    } catch (e) { state = { checks: {}, notes: '' }; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function render() {
    var boxes = document.querySelectorAll('#checks input[type=checkbox]');
    var done = 0;
    Array.prototype.forEach.call(boxes, function (box) {
      var on = !!state.checks[box.getAttribute('data-i')];
      box.checked = on;
      if (on) done += 1;
    });
    var total = boxes.length || 1;
    var pct = Math.round((done / total) * 100);
    if ($('pct')) $('pct').textContent = pct + '%';
    if ($('bar')) $('bar').style.width = pct + '%';
    if ($('count')) $('count').textContent = done + ' / ' + boxes.length + ' 완료';
  }
  function init() {
    load();
    initTheme();
    var notes = $('notes');
    if (notes) {
      notes.value = state.notes || '';
      var timer = null;
      notes.addEventListener('input', function () {
        state.notes = notes.value;
        clearTimeout(timer);
        timer = setTimeout(function () {
          save();
          if ($('saved')) {
            $('saved').textContent = '저장됨 ' + new Date().toLocaleTimeString('ko-KR');
            setTimeout(function () { if ($('saved')) $('saved').textContent = ''; }, 1800);
          }
        }, 250);
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#checks input[type=checkbox]'), function (box) {
      box.addEventListener('change', function () {
        state.checks[box.getAttribute('data-i')] = box.checked;
        save();
        render();
      });
    });
    if ($('resetBtn')) $('resetBtn').addEventListener('click', function () {
      state.checks = {};
      save();
      render();
    });
    if ($('exportBtn')) $('exportBtn').addEventListener('click', function () {
      var payload = {
        project: ${JSON.stringify(ctx.name)},
        title: ${JSON.stringify(ctx.title)},
        exportedAt: new Date().toISOString(),
        progress: ($('pct') || {}).textContent || '',
        checks: state.checks,
        notes: state.notes
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = ${JSON.stringify(ctx.name)} + '-progress.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

  const readme = readmeFor(ctx, "실행 대시보드", [
    "실행 단계 타임라인과 오늘의 체크리스트(진행률 자동 계산)",
    "리스크와 대응 카드, 진행 메모 자동 저장(localStorage)",
    "진행 상황을 JSON 파일로 내보내기",
    "다크/라이트 테마 토글, 390px 모바일 대응",
  ]);
  return {
    html: pageHtml(ctx, body, "실행 대시보드"),
    css: baseCss() + css,
    js: js,
    readme,
    archetype: "dashboard",
    title: ctx.title,
    goal,
  };
}

/* ── README 공통 ─────────────────────────────────────────── */

function readmeFor(ctx, appName, features) {
  const lines = [];
  lines.push("# " + ctx.title, "");
  lines.push("> Agent Collab Studio v2.3 가 만든 **" + appName + "** 웹앱입니다. 설치 없이 브라우저에서 바로 동작합니다.", "");
  lines.push("## 소개", "");
  if (ctx.goal) lines.push("- 목표: " + ctx.goal);
  if (ctx.context) lines.push("- 배경·제약: " + ctx.context);
  if (ctx.audience) lines.push("- 대상: " + ctx.audience);
  if (ctx.deadline) lines.push("- 기간: " + ctx.deadline);
  lines.push("");
  lines.push("## 기능", "");
  features.forEach((f) => lines.push("- " + f));
  lines.push("");
  lines.push("## 파일", "");
  lines.push("| 파일 | 설명 |");
  lines.push("|---|---|");
  lines.push("| `index.html` | 화면 구조 — 제목, 입력, 실행 버튼, 결과 영역 |");
  lines.push("| `style.css` | 라이트/다크 테마와 반응형 레이아웃(390px 포함) |");
  lines.push("| `app.js` | 실제 동작 로직과 localStorage 저장 |");
  lines.push("| `README.md` | 이 문서 |");
  lines.push("");
  lines.push("## 실행", "");
  lines.push("정적 파일만으로 동작합니다. 폴더에서 바로 열거나 로컬 서버를 띄우세요.", "");
  lines.push("```bash");
  lines.push("python3 -m http.server 8080");
  lines.push("# http://localhost:8080");
  lines.push("```");
  lines.push("");
  lines.push("## 배포", "");
  lines.push("- **GitHub Pages** — 저장소에 올린 뒤 Settings → Pages → Source: `main` / `/` 로 지정하면 `https://<계정>.github.io/<저장소>/` 에서 열립니다.");
  lines.push("- **Cloudflare Pages** — 프로젝트를 만들고 이 폴더를 Direct Upload 하면 `https://<프로젝트>.pages.dev` 에서 열립니다.");
  lines.push("");
  lines.push("## 참고", "");
  lines.push("- 외부 CDN·라이브러리를 쓰지 않습니다. 모든 코드는 이 폴더 안에 있습니다.");
  lines.push("- 저장 데이터는 브라우저 localStorage 에만 남고 서버로 전송되지 않습니다.");
  lines.push("");
  lines.push("---", "");
  lines.push("_생성: Agent Collab Studio v2.3 (무료 AI 풀 · 스마트 로컬 생성기)_");
  return lines.join("\n");
}

/* ── 폴백 진입점 ─────────────────────────────────────────── */

const APP_BUILDERS = {
  pomodoro: pomodoroApp,
  calculator: calculatorApp,
  todo: todoApp,
  quiz: quizApp,
  notes: notesApp,
  directory: directoryApp,
  dashboard: dashboardApp,
};

/** AI 실패/미연결 시에도 과제에 맞는 실제 동작 프로젝트를 만든다. */
export function fallbackProject(mission, report, now) {
  const ctx = missionCtx(mission, report, now);
  const arche = detectArchetype(mission, report);
  const build = APP_BUILDERS[arche.id] || APP_BUILDERS.todo;
  const app = build(ctx);
  const title = ctx.title;
  const goal = ctx.goal || (ctx.mission && ctx.mission.goal) || "";
  const files = [
    { path: "index.html", content: app.html },
    { path: "style.css", content: app.css },
    { path: "app.js", content: app.js },
    { path: "README.md", content: app.readme },
  ].map((file) => Object.assign({}, file, {
    bytes: new TextEncoder().encode(file.content).length,
    mime: mimeFor(file.path),
    kind: file.path.split(".").pop().toLowerCase(),
  }));
  return {
    name: ctx.name,
    title,
    summary: cut(goal, 400) || "과제 목표를 한 화면에서 처리하는 웹앱입니다.",
    source: "local",
    archetype: arche.id,
    archetypeLabel: arche.label,
    files,
  };
}
