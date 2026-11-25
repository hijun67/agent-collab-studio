/* Agent Collab Studio v2.2 — 스마트 앱 생성기 단위 테스트 (의존성 없음)
 *
 *   실행: node tests/archetypes.test.mjs
 *   또는: node --test tests/
 *
 *  검증 범위
 *   1) 과제 문장 → 앱 아키타입 7종 분류
 *   2) 아키타입별 폴백 프로젝트 = 실제로 동작하는 앱 구조(4파일·외부 CDN 0·localStorage·테마)
 *   3) 제목 + 목표 붙음 버그 제거 (cleanTitle / fixHeadingJoin / normalizeProject)
 *   4) AI 프롬프트가 "실행 대시보드"를 하드코딩하지 않는지
 *   5) /api/generate-project 가 로컬 생성기로 앱을 돌려주는지
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHETYPE_HINTS,
  buildProjectPrompt,
  cleanTitle,
  detectArchetype,
  extractIds,
  fallbackProject,
  fixHeadingJoin,
  normalizeProject,
} from "../functions/api/_project.js";
import { onRequest } from "../functions/api/generate-project.js";

const MISSIONS = {
  pomodoro: {
    title: "포모도로 집중 타이머 & 오늘 할 일",
    goal: "25분 집중 / 5분 휴식 타이머와 오늘의 할 일 체크리스트를 한 화면에 담은 깔끔한 웹앱 제작",
    context: "외부 라이브러리 없는 단일 웹앱, 모바일 반응형, 로컬 저장(localStorage)",
  },
  calculator: { title: "대출 이자 계산기", goal: "원금과 금리를 넣으면 월 상환액과 총 이자를 즉시 보여주는 계산기" },
  todo: { title: "주간 습관 트래커", goal: "매일 반복할 습관을 추가하고 완료율을 보고 싶다" },
  quiz: { title: "영단어 암기 퀴즈", goal: "플래시카드로 영단어를 외우고 점수로 확인한다" },
  notes: { title: "회의록 메모장", goal: "회의 내용을 적고 태그로 찾는 메모 앱" },
  directory: { title: "공모전 목록 모음", goal: "마감일과 분야로 지원사업 공모전을 찾아보는 목록" },
  dashboard: { title: "블로그 수익화 전략 점검", goal: "3주 로드맵과 리스크 점검표를 만든다" },
};

const APP_IDS = {
  pomodoro: ["clock", "startBtn", "resetBtn", "todoInput", "todoList", "themeBtn"],
  calculator: ["amount", "rate", "months", "total", "breakdown", "history", "themeBtn"],
  todo: ["text", "list", "pct", "prog", "themeBtn"],
  quiz: ["front", "back", "flip", "right", "wrong", "cards", "themeBtn"],
  notes: ["search", "noteList", "noteTitle", "noteBody", "dlBtn", "themeBtn"],
  directory: ["q", "cat", "cards", "modal", "themeBtn"],
  dashboard: ["pct", "bar", "checks", "notes", "themeBtn"],
};

const now = Date.UTC(2026, 10, 25, 10, 0, 0);
const fileOf = (project, path) => (project.files.find((f) => f.path === path) || {}).content || "";

test("아키타입 분류 — 대표 과제 7종이 각각의 앱으로 간다", () => {
  for (const [id, mission] of Object.entries(MISSIONS)) {
    const arche = detectArchetype(mission, null);
    assert.equal(arche.id, id, mission.title + " → " + arche.id);
  }
});

test("아키타입 분류 — 포모도로 과제가 '할 일'로 새지 않는다", () => {
  const arche = detectArchetype(MISSIONS.pomodoro, null);
  assert.equal(arche.id, "pomodoro");
  assert.ok(arche.ranked.find((x) => x.id === "pomodoro").score > arche.ranked.find((x) => x.id === "todo").score);
});

test("아키타입 분류 — 계획·로드맵 과제만 대시보드", () => {
  assert.equal(detectArchetype({ title: "3주 실행 로드맵과 리스크 점검" }).id, "dashboard");
  assert.notEqual(detectArchetype(MISSIONS.pomodoro).id, "dashboard");
  assert.notEqual(detectArchetype(MISSIONS.calculator).id, "dashboard");
});

test("폴백 프로젝트 — 7종 모두 4파일 세트이고 외부 CDN 이 없다", () => {
  for (const [id, mission] of Object.entries(MISSIONS)) {
    const project = fallbackProject(mission, null, now);
    assert.equal(project.archetype, id, id + " archetype");
    assert.deepEqual(project.files.map((f) => f.path), ["index.html", "style.css", "app.js", "README.md"]);
    const html = fileOf(project, "index.html");
    const css = fileOf(project, "style.css");
    const js = fileOf(project, "app.js");
    assert.ok(!/(src|href)=["']https?:/i.test(html), id + ": 외부 CDN 없음");
    assert.ok(!/@import\s+url\(["']?https?:/i.test(css), id + ": 외부 CSS 없음");
    assert.ok(!/fetch\(["']https?:/i.test(js), id + ": 외부 API 호출 없음");
    assert.match(html, /<link rel="stylesheet" href="style\.css"/);
    assert.match(html, /<script src="app\.js"><\/script>/);
    assert.match(html, /data-theme|themeBtn/);
    assert.match(js, /localStorage/);
    assert.match(css, /@media \(max-width/);
    assert.match(css, /data-theme="dark"/);
    assert.ok(project.files.every((f) => f.bytes > 500), id + ": 파일이 비어 있지 않음");
  }
});

test("폴백 프로젝트 — 각 앱의 실제 조작 요소 id 가 화면과 로직에 모두 있다", () => {
  for (const [id, mission] of Object.entries(MISSIONS)) {
    const project = fallbackProject(mission, null, now);
    const html = fileOf(project, "index.html");
    const js = fileOf(project, "app.js");
    const ids = extractIds(html);
    for (const want of APP_IDS[id]) {
      assert.ok(ids.includes(want), id + ": index.html 에 #" + want);
      assert.ok(js.includes(want), id + ": app.js 가 #" + want + " 를 쓴다");
    }
  }
});

test("폴백 프로젝트 — 포모도로는 진짜 25/5/15 타이머와 할 일 기능을 담는다", () => {
  const project = fallbackProject(MISSIONS.pomodoro, null, now);
  const html = fileOf(project, "index.html");
  const js = fileOf(project, "app.js");
  assert.match(html, /25:00/);
  assert.match(html, /5:00/);
  assert.match(html, /15:00/);
  assert.match(js, /focus: 25 \* 60/);
  assert.match(js, /short: 5 \* 60/);
  assert.match(js, /long: 15 \* 60/);
  assert.match(js, /setInterval/);
  assert.match(js, /AudioContext/);
  assert.match(js, /sessions \+= 1/);
  assert.match(js, /todoInput|addTodo/);
  assert.ok(!/실행 대시보드/.test(html), "포모도로 결과물에 '실행 대시보드' 문구가 없다");
});

test("폴백 프로젝트 — 아키타입별 핵심 기능 키워드", () => {
  const expect = {
    calculator: [/interest/, /breakdown/, /toLocaleString/],
    todo: [/priority/, /filter/, /strokeDashoffset/],
    quiz: [/is-flipped/, /score/, /streak/],
    notes: [/noteBody/, /pinBtn/, /Blob/],
    directory: [/dday/, /marks/, /modal/],
    dashboard: [/checks/, /progress|pct/, /resetBtn/],
  };
  for (const [id, patterns] of Object.entries(expect)) {
    const project = fallbackProject(MISSIONS[id], null, now);
    const js = fileOf(project, "app.js");
    const html = fileOf(project, "index.html");
    patterns.forEach((re) => assert.ok(re.test(js + "\n" + html), id + " → " + re));
  }
});

test("제목+목표 결합 버그 — cleanTitle 이 붙은 목표를 떼어낸다", () => {
  const goal = "25분 집중 / 5분 휴식 타이머와 오늘의 할 일 체크리스트를 한 화면에 담은 깔끔한 웹앱 제작";
  assert.equal(
    cleanTitle("포모도로 집중 타이머 & 오늘 할 일" + goal, goal),
    "포모도로 집중 타이머 & 오늘 할 일",
  );
  assert.equal(
    cleanTitle("포모도로 집중 타이머 & 오늘 할 일" + goal.slice(0, 20), goal),
    "포모도로 집중 타이머 & 오늘 할 일",
  );
  assert.equal(cleanTitle("대출 이자 계산기 — 원금과 금리를 넣으면 즉시 계산", "원금과 금리를 넣으면 즉시 계산"), "대출 이자 계산기");
  assert.equal(cleanTitle("짧은 메모", "짧은 메모"), "짧은 메모");
});

test("제목+목표 결합 버그 — h1/title 에는 제목만 남는다", () => {
  const goal = MISSIONS.pomodoro.goal;
  const project = fallbackProject(MISSIONS.pomodoro, null, now);
  const html = fileOf(project, "index.html");
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  const titleTag = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  assert.equal(h1.trim(), "포모도로 집중 타이머 &amp; 오늘 할 일");
  assert.equal(titleTag.trim(), "포모도로 집중 타이머 &amp; 오늘 할 일");
  assert.ok(!h1.includes("25분"), "h1 에 목표가 붙지 않는다");
  assert.ok(!titleTag.includes("25분"), "<title> 에 목표가 붙지 않는다");
  assert.ok(html.includes('class="lead"'), "목표는 별도 lead 문단");
  assert.ok(goal.length > 0);
});

test("제목+목표 결합 버그 — AI 응답의 h1 결합도 분리한다", () => {
  const title = "포모도로 집중 타이머 & 오늘 할 일";
  const goal = "25분 집중 / 5분 휴식 타이머와 오늘의 할 일 체크리스트";
  const fixed = fixHeadingJoin(
    '<html><head><title>' + title + goal + '</title></head><body><h1>' + title + goal + '</h1></body></html>',
    title,
    goal,
  );
  assert.match(fixed, /<h1>포모도로 집중 타이머 &amp; 오늘 할 일<\/h1>/);
  assert.match(fixed, /<p class="lead">25분 집중/);
  assert.match(fixed, /<title>포모도로 집중 타이머 &amp; 오늘 할 일<\/title>/);

  const normalized = normalizeProject(
    {
      title: title + goal,
      summary: goal,
      files: [
        { path: "index.html", content: '<h1>' + title + goal + "</h1>" },
        { path: "style.css", content: ":root{}" },
      ],
    },
    { title, goal },
    now,
  );
  assert.equal(normalized.title, title);
});

test("AI 프롬프트 — 과제 맞춤 앱을 요구하고 대시보드를 하드코딩하지 않는다", () => {
  const pomo = buildProjectPrompt(MISSIONS.pomodoro, null);
  assert.match(pomo.user, /동작하는 웹앱/);
  assert.match(pomo.user, /타이머/);
  assert.match(pomo.system, /<h1>/);
  assert.match(pomo.system, /이어 붙이지 마세요/);
  assert.ok(!/실행 대시보드\*\*? 웹앱을 만드세요/.test(pomo.user), "대시보드 고정 지시 없음");
  assert.equal(pomo.archetype, "pomodoro");

  const plan = buildProjectPrompt({ title: "분기 운영 전략 로드맵", goal: "3개월 실행 계획과 리스크 점검" }, null);
  assert.equal(plan.archetype, "dashboard");
  assert.match(plan.user, /진행 대시보드/);
  for (const hint of Object.values(ARCHETYPE_HINTS)) assert.ok(hint.length > 10);
});

test("/api/generate-project — GET 은 아키타입 목록을 알린다", async () => {
  const res = await onRequest({ request: new Request("https://acs.test/api/generate-project"), env: {} });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(data.archetypes, ["pomodoro", "calculator", "todo", "quiz", "notes", "directory", "dashboard"]);
});

test("/api/generate-project — POST 는 AI 없이도 포모도로 앱을 돌려준다", async () => {
  const req = new Request("https://acs.test/api/generate-project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mission: MISSIONS.pomodoro, report: null, keys: {} }),
  });
  const res = await onRequest({ request: req, env: {} });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.fallback, true);
  assert.equal(data.project.archetype, "pomodoro");
  assert.deepEqual(data.project.files.map((f) => f.path), ["index.html", "style.css", "app.js", "README.md"]);
  assert.match(data.project.files[0].content, /25:00/);
  assert.ok(data.ms < 3000, "로컬 생성은 3초 안에 끝난다: " + data.ms + "ms");
});
