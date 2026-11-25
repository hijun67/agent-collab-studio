/* Agent Collab Studio | 실제 프로젝트 파일 생성 — 정규화 · 폴백 생성기 · 프롬프트
 *
 *  `/api/generate-project` 가 무료 AI 풀에 보낼 프롬프트를 만들고,
 *  AI 응답(JSON 파일 세트)을 안전하게 다듬습니다.
 *  AI 가 없거나 형식이 깨져도 과제에 맞는 실제 동작 프로젝트를 결정론적으로 만듭니다(폴백).
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

  const title = String(value.title || (mission && mission.title) || "생성 프로젝트").slice(0, 120);
  const summary = String(value.summary || (mission && mission.goal) || "").slice(0, 400);
  const name = /^[a-z0-9][a-z0-9-]{2,49}$/.test(String(value.name || ""))
    ? String(value.name)
    : projectName(title, now);
  return { name, title, summary, files, source: "ai" };
}

/** 무료 AI 풀에 보낼 프롬프트. */
export function buildProjectPrompt(mission, report) {
  const m = mission || {};
  const r = report || {};
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
    "당신은 한국어 웹 프로젝트 생성기입니다. 협업 과제와 최종 리포트를 바탕으로, 브라우저에서 바로 열어 동작하는 " +
    "정적 웹 프로젝트 파일 세트를 만듭니다. 출력은 JSON 객체 하나만 — 코드블록·설명·인사말 금지. " +
    "파일은 index.html, style.css, app.js, README.md 를 반드시 포함하고, 외부 CDN·외부 라이브러리 없이 단독으로 동작해야 합니다. " +
    "index.html 은 style.css 와 app.js 를 상대경로로 연결하고, app.js 는 실제 상호작용(체크리스트 저장, 진행률 계산, 테마 전환 등)을 구현합니다. " +
    "모든 화면 문구는 한국어이며, 과제의 목표·단계·체크리스트·리스크 내용을 실제로 반영합니다. " +
    "HTML 안에서 <script> 태그를 문자열로 쓰지 말고 반드시 별도 app.js 파일로 분리하세요.";

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
    "1) 이 과제를 실행하는 사람이 매일 쓰는 '실행 대시보드' 웹앱을 만드세요.",
    "2) index.html: header(제목·목표) + 진행률 + 실행 단계 타임라인 + 체크리스트 + 리스크 카드 + 메모 영역.",
    "3) style.css: 모던한 반응형(모바일 390px 포함), CSS 변수, 라이트/다크 테마.",
    "4) app.js: 체크리스트 토글·진행률 계산·localStorage 저장, 테마 전환, 메모 자동 저장, JSON 내보내기.",
    "5) README.md: 프로젝트 소개, 파일 목록, 실행 방법, 배포 방법(GitHub Pages / Cloudflare Pages).",
    "",
    "응답 형식: {\"name\":\"repo-name\",\"title\":\"프로젝트 제목\",\"summary\":\"한 문장 요약\",\"files\":[{\"path\":\"index.html\",\"content\":\"...\"},{\"path\":\"style.css\",\"content\":\"...\"},{\"path\":\"app.js\",\"content\":\"...\"},{\"path\":\"README.md\",\"content\":\"...\"}]}",
    "name 은 영문 소문자·숫자·하이픈만 사용합니다. content 안의 줄바꿈은 JSON 문자열 규칙대로 \\n 으로 Escape 하세요.",
  ].filter(Boolean).join("\n");

  return { system, user };
}

/* ── 폴백 프로젝트(결정론적) ─────────────────────────────────── */

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

/** AI 실패/미연결 시에도 과제에 맞는 실제 동작 프로젝트를 만든다. */
export function fallbackProject(mission, report, now) {
  const m = mission || {};
  const r = report || {};
  const title = String(m.title || "실행 대시보드").slice(0, 120);
  const goal = String(m.goal || "목표를 정하고 매일 진행을 기록합니다.").slice(0, 400);
  const context = String(m.context || "").slice(0, 300);
  const audience = String(m.audience || "").slice(0, 80);
  const deadline = String(m.deadline || "").slice(0, 60);
  const steps = stepsOf(m, r);
  const checks = checksOf(m, r);
  const risks = risksOf(m, r);
  const name = projectName(title, now);

  const html =
`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — 실행 대시보드</title>
<link rel="stylesheet" href="style.css" />
</head>
<body>
<div class="shell">
  <header class="hero">
    <div class="hero-top">
      <span class="eyebrow">AGENT COLLAB STUDIO · 실행 대시보드</span>
      <button type="button" id="themeBtn" class="ghost" aria-label="테마 전환">🌗 테마</button>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p class="goal">${escapeHtml(goal)}</p>
    <ul class="meta">
      ${deadline ? `<li><b>기간</b> ${escapeHtml(deadline)}</li>` : ""}
      ${audience ? `<li><b>대상</b> ${escapeHtml(audience)}</li>` : ""}
      ${context ? `<li><b>제약</b> ${escapeHtml(context)}</li>` : ""}
    </ul>
  </header>

  <section class="progress-card">
    <div class="progress-head">
      <div>
        <span class="eyebrow">PROGRESS</span>
        <strong id="pct">0%</strong>
      </div>
      <span id="count" class="count">0 / ${checks.length} 완료</span>
    </div>
    <div class="bar"><i id="bar"></i></div>
  </section>

  <div class="grid">
    <section class="card">
      <h2>실행 단계</h2>
      <ol class="steps">
        ${steps.map((s) => `<li><b>${escapeHtml(s.name)}</b>${s.when ? ` <span class="tag">${escapeHtml(s.when)}</span>` : ""}<p>${escapeHtml(s.detail)}</p>${s.output ? `<span class="out">산출물 · ${escapeHtml(s.output)}</span>` : ""}</li>`).join("\n        ")}
      </ol>
    </section>

    <section class="card">
      <h2>오늘의 체크리스트</h2>
      <ul class="checks" id="checks">
        ${checks.map((c, i) => `<li><label><input type="checkbox" data-i="${i}" /><span>${escapeHtml(c)}</span></label></li>`).join("\n        ")}
      </ul>
      <button type="button" id="resetBtn" class="ghost small">체크 초기화</button>
    </section>

    <section class="card">
      <h2>리스크와 대응</h2>
      <ul class="risks">
        ${risks.map((x) => `<li><b>${escapeHtml(x.r)}</b><p>${escapeHtml(x.m)}</p></li>`).join("\n        ")}
      </ul>
    </section>

    <section class="card">
      <h2>진행 메모</h2>
      <textarea id="notes" rows="7" placeholder="오늘 한 일, 막힌 지점, 다음 행동을 적어 두세요. 자동 저장됩니다."></textarea>
      <div class="row">
        <button type="button" id="exportBtn" class="primary">진행 상황 JSON 내보내기</button>
        <span id="saved" class="saved"></span>
      </div>
    </section>
  </div>

  <footer>
    <span>Agent Collab Studio v2.0 · ${escapeHtml(name)}</span>
    <span>체크·메모는 이 브라우저(localStorage)에만 저장됩니다.</span>
  </footer>
</div>
<script src="app.js"></script>
</body>
</html>
`;

  const css =
`:root {
  --bg: #f6f8fb;
  --card: #ffffff;
  --txt: #111827;
  --sub: #6b7280;
  --line: #e5e7eb;
  --accent: #0d9488;
  --accent-soft: #ccfbf1;
  --shadow: 0 1px 2px rgba(15, 23, 42, .06), 0 8px 24px rgba(15, 23, 42, .06);
}
[data-theme="dark"] {
  --bg: #0b1220;
  --card: #111b2e;
  --txt: #e5ecf7;
  --sub: #93a3bd;
  --line: #1e2b42;
  --accent: #5eead4;
  --accent-soft: rgba(94, 234, 212, .12);
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 10px 30px rgba(0, 0, 0, .35);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--txt);
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
.shell { max-width: 1080px; margin: 0 auto; padding: 40px 24px 64px; }
.hero-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.eyebrow { font-size: 10.5px; letter-spacing: .16em; color: var(--accent); font-weight: 800; }
h1 { font-size: 30px; line-height: 1.3; letter-spacing: -.02em; margin: 10px 0 8px; }
.goal { color: var(--sub); font-size: 14.5px; margin: 0 0 14px; max-width: 70ch; }
.meta { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 0 0 22px; }
.meta li { font-size: 12px; color: var(--sub); border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 4px 11px; }
.meta b { color: var(--txt); margin-right: 4px; }
.progress-card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; box-shadow: var(--shadow); margin-bottom: 18px; }
.progress-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
.progress-head strong { display: block; font-size: 26px; letter-spacing: -.02em; margin-top: 2px; }
.count { font-size: 12px; color: var(--sub); }
.bar { height: 8px; border-radius: 999px; background: var(--accent-soft); overflow: hidden; margin-top: 12px; }
.bar i { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 999px; transition: width .3s ease; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; box-shadow: var(--shadow); min-width: 0; }
.card h2 { font-size: 14px; margin: 0 0 12px; letter-spacing: -.01em; }
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
textarea { width: 100%; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--txt); padding: 11px 12px; font: inherit; font-size: 13px; resize: vertical; }
textarea:focus { outline: 2px solid var(--accent-soft); border-color: var(--accent); }
.row { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
button { font: inherit; cursor: pointer; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--txt); padding: 8px 13px; font-size: 12.5px; }
button.primary { background: var(--accent); border-color: var(--accent); color: #04120f; font-weight: 700; }
button.ghost:hover, button:hover { border-color: var(--accent); }
button.small { padding: 5px 10px; font-size: 11.5px; }
.saved { font-size: 11px; color: var(--sub); }
footer { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 26px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--sub); }
@media (max-width: 720px) {
  .shell { padding: 26px 14px 44px; }
  h1 { font-size: 23px; }
  .grid { grid-template-columns: 1fr; }
  .progress-head strong { font-size: 22px; }
}
`;

  const js =
`/* ${title} — 실행 대시보드 (Agent Collab Studio v2.0 폴백 생성) */
(function () {
  'use strict';
  var KEY = 'acs.dashboard.${name}';
  var THEME = KEY + '.theme';
  var state = { checks: {}, notes: '' };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
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
    var pctEl = document.getElementById('pct');
    var barEl = document.getElementById('bar');
    var countEl = document.getElementById('count');
    if (pctEl) pctEl.textContent = pct + '%';
    if (barEl) barEl.style.width = pct + '%';
    if (countEl) countEl.textContent = done + ' / ' + boxes.length + ' 완료';
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    try { localStorage.setItem(THEME, theme); } catch (e) {}
  }
  function init() {
    load();
    var notes = document.getElementById('notes');
    if (notes) {
      notes.value = state.notes || '';
      var timer = null;
      notes.addEventListener('input', function () {
        state.notes = notes.value;
        clearTimeout(timer);
        timer = setTimeout(function () {
          save();
          var saved = document.getElementById('saved');
          if (saved) {
            saved.textContent = '저장됨 ' + new Date().toLocaleTimeString('ko-KR');
            setTimeout(function () { saved.textContent = ''; }, 1800);
          }
        }, 250);
      });
    }
    var boxes = document.querySelectorAll('#checks input[type=checkbox]');
    Array.prototype.forEach.call(boxes, function (box) {
      box.addEventListener('change', function () {
        state.checks[box.getAttribute('data-i')] = box.checked;
        save();
        render();
      });
    });
    var reset = document.getElementById('resetBtn');
    if (reset) reset.addEventListener('click', function () {
      state.checks = {};
      save();
      render();
    });
    var themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', function () {
      var now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(now);
    });
    var exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      var payload = {
        project: ${JSON.stringify(name)},
        title: ${JSON.stringify(title)},
        exportedAt: new Date().toISOString(),
        progress: (document.getElementById('pct') || {}).textContent || '',
        checks: state.checks,
        notes: state.notes
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = ${JSON.stringify(name)} + '-progress.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    });
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem(THEME) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
    applyTheme(savedTheme);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

  const readme =
`# ${title}

> Agent Collab Studio v2.0 이 협업 과제와 최종 리포트를 바탕으로 생성한 실행 대시보드입니다.

## 소개

- 목표: ${goal}
${context ? "- 배경·제약: " + context + "\n" : ""}${deadline ? "- 기간: " + deadline + "\n" : ""}${audience ? "- 대상: " + audience + "\n" : ""}
## 파일

| 파일 | 설명 |
|---|---|
| \`index.html\` | 실행 대시보드 화면 (진행률 · 단계 · 체크리스트 · 리스크 · 메모) |
| \`style.css\` | 라이트/다크 테마와 반응형 레이아웃 |
| \`app.js\` | 체크리스트·메모 localStorage 저장, 진행률 계산, 테마 전환, JSON 내보내기 |
| \`README.md\` | 이 문서 |

## 실행

정적 파일만으로 동작합니다. 폴더에서 바로 열거나 로컬 서버를 띄우세요.

\`\`\`bash
python3 -m http.server 8080
# http://localhost:8080
\`\`\`

## 배포

- **GitHub Pages** — 이 저장소를 올린 뒤 Settings → Pages → Source: \`main\` / \`/\` 로 지정하면 \`https://<계정>.github.io/<저장소>/\` 에서 열립니다.
- **Cloudflare Pages** — 프로젝트를 만들고 이 폴더를 Direct Upload 하면 \`https://<프로젝트>.pages.dev\` 에서 열립니다.

## 실행 단계

${steps.map((s, i) => (i + 1) + ". **" + s.name + "**" + (s.when ? " (" + s.when + ")" : "") + " — " + s.detail + (s.output ? " → " + s.output : "")).join("\n")}

## 체크리스트

${checks.map((c) => "- [ ] " + c).join("\n")}

---

_생성: Agent Collab Studio v2.0 (무료 AI 풀 · 로컬 폴백 엔진)_
`;

  return {
    name,
    title,
    summary: goal,
    source: "local",
    files: [
      { path: "index.html", content: html, bytes: new TextEncoder().encode(html).length, mime: mimeFor("index.html"), kind: "html" },
      { path: "style.css", content: css, bytes: new TextEncoder().encode(css).length, mime: mimeFor("style.css"), kind: "css" },
      { path: "app.js", content: js, bytes: new TextEncoder().encode(js).length, mime: mimeFor("app.js"), kind: "js" },
      { path: "README.md", content: readme, bytes: new TextEncoder().encode(readme).length, mime: mimeFor("README.md"), kind: "md" },
    ],
  };
}
