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
  { id: "board", label: "개인 보드 · 마감 D-day", words: ["보드", "d-day", "dday", "디데이", "핫딜", "특가", "마감 관리", "마감일 관리", "개인 보드", "위시리스트", "관심 목록"] },
  { id: "pomodoro", label: "포모도로 · 집중 타이머", words: ["포모도로", "뽀모도로", "pomodoro", "타이머", "타이머앱", "timer", "스톱워치", "집중", "휴식", "딴짓", "공부 시간"] },
  { id: "calculator", label: "계산기 · 견적 계산", words: ["계산기", "계산", "이자", "대출", "환율", "세금", "부가세", "단위 변환", "견적", "금리", "적금", "예금", "가계부", "지출", "예산", "월급", "연봉", "원리금", "할부", "수수료"] },
  { id: "todo", label: "할 일 · 습관 트래커", words: ["할 일", "할일", "체크리스트", "체크 리스트", "습관", "루틴", "트래커", "투두", "todo", "to-do", "habit", "데일리", "우선순위", "일정 관리", "태스크"] },
  { id: "quiz", label: "퀴즈 · 플래시카드", words: ["퀴즈", "quiz", "암기", "플래시카드", "flashcard", "단어장", "단어", "시험", "문제 풀이", "외우", "영단어", "객관식", "학습"] },
  { id: "notes", label: "메모 · 노트", words: ["메모", "노트", "일기", "마크다운", "markdown", "글쓰기", "기록장", "저널", "journal", "note", "회의록", "아이디어 정리", "초안"] },
  { id: "directory", label: "목록 · 큐레이션", words: ["디렉토리", "목록", "공모전", "이벤트", "지원사업", "채용", "구인", "북마크", "큐레이션", "모음", "행사", "세미나", "공고", "리스트"] },
  { id: "dashboard", label: "실행 대시보드", words: ["로드맵", "전략", "점검", "감사", "실행 계획", "보고서", "리스크", "kpi", "프로젝트 관리", "회고", "스프린트", "운영 계획", "마케팅 전략", "체크 점검"] },
];

export const ARCHETYPE_HINTS = {
  board: "사용자가 직접 항목을 넣고 관리하는 개인 보드 — 제목·링크(URL)·카테고리·마감일 입력 폼, 항목 추가와 개별 삭제, D-day 자동 계산, 마감 임박 순(D-0/D-1 …) 자동 정렬, 카테고리 필터, 검색, localStorage 영구 저장이 모두 실제로 동작",
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
    "레이아웃 규칙: header 는 flex 로 제목(h1)과 테마 버튼을 **한 줄**에 두고, 테마 버튼은 width:auto 인 작은 버튼이어야 합니다(전체 너비 막대·banner 금지). " +
    "h1 이 잘리거나 다른 요소에 가려지지 않게 하고, 첫 화면에서 제목·입력 폼·목록이 모두 보이게 하세요. " +
    "샘플 데이터가 필요하면 마감일을 오늘 기준 **미래 날짜**(예: 오늘+2일, 오늘+10일)로 넣어 D-day 배지가 보이게 합니다. " +
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
    "3) style.css: 모던하고 보기 좋은 반응형 디자인, CSS 변수, 라이트/다크 테마, 390px 에서도 가로 스크롤 없음. header 는 제목과 테마 버튼을 한 줄에 두고 테마 버튼은 작게(width:auto) — 전체 너비 막대로 만들지 마세요.",
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

/* ── 결정론적 폴백 생성기는 v2.5.0 에서 폐기했다 ───────────────
 *  하드코딩 템플릿 앱(포모도로·계산기·할 일·퀴즈·메모·목록·대시보드)은
 *  "AI 없이도 그럴듯한 결과물"을 만들어 사용자가 AI 결과로 오해하게 했다.
 *  이제 /api/generate-project 는 실제 AI 응답으로만 프로젝트를 만들고,
 *  모든 AI 가 실패하면 명시적 오류(429/503)와 안내 문구를 돌려준다.
 *  이 파일에는 프롬프트·아키타입 힌트·응답 정규화만 남는다.
 */
