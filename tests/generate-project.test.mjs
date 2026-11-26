/* Agent Collab Studio v2.5.0 — 실제 AI 전용 생성기 단위 테스트 (의존성 없음)
 *
 *   실행: node --test tests/
 *
 *  v2.5.0 에서 로컬 결정론적 생성기를 폐기했다. 이 테스트는 그 결과를 지킨다.
 *   1) 과제 문장 → 앱 아키타입 분류(개인 보드 포함)
 *   2) /api/generate-project 는 AI 가 없거나 실패하면 **템플릿 앱을 만들지 않고** 429/503 + 안내를 돌려준다
 *   3) AI 가 응답하면 그 응답으로만 프로젝트를 만든다(파일 4개·외부 CDN 0)
 *   4) 협업/빌드 예산 분리 — 협업은 경량 모델·다른 무료 키 먼저, 빌드는 Workers AI 큰 모델 먼저
 *   5) 429(분당 제한)는 하루 소진으로 막지 않고 짧은 쿨다운 뒤 재시도한다
 *   6) 협업 프롬프트·응답 검증 — 순수 한국어(중국어·베트남어 금지) 강제
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHETYPE_HINTS,
  buildProjectPrompt,
  cleanTitle,
  detectArchetype,
  extractIds,
  fixHeadingJoin,
  normalizeProject,
} from "../functions/api/_project.js";
import { onRequest, AI_FAIL_NOTICE } from "../functions/api/generate-project.js";
import {
  AI_POOL,
  buildAttempts,
  classifyFailure,
  LOCAL_PROVIDERS,
  providerById,
  runPool,
} from "../functions/api/_aiPool.js";
import {
  buildCollabPrompts,
  hasForeignScript,
  normalizeReportPayload,
  normalizeRequest,
  normalizeTurnPayload,
} from "../functions/api/_collab.js";

const MISSIONS = {
  board: {
    title: "핫딜 · 이벤트 마감 D-day 보드",
    goal: "제목·링크·마감일을 추가하면 D-day 순으로 자동 정렬되고 카테고리 필터와 localStorage 저장이 되는 개인 보드",
  },
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

const now = Date.UTC(2026, 10, 26, 1, 0, 0);

/* ── AI 응답 흉내 ─────────────────────────────────────────── */

const goodProjectJson = (extra) => JSON.stringify(Object.assign({
  name: "dday-board",
  title: "핫딜 · 이벤트 마감 D-day 보드",
  summary: "D-day 순으로 정렬되는 개인 보드",
  files: [
    { path: "index.html", content: '<!DOCTYPE html><html lang="ko"><head><title>핫딜 · 이벤트 마감 D-day 보드</title><link rel="stylesheet" href="style.css" /></head><body><h1>핫딜 · 이벤트 마감 D-day 보드</h1><p class="lead">D-day 순으로 정렬</p><form id="itemForm"><input id="itemTitle" /><input id="itemUrl" /><select id="itemCat"></select><input id="itemDue" type="date" /><button id="addBtn" type="submit">추가</button></form><input id="search" /><select id="filterCat"></select><ul id="itemList"></ul><p id="emptyState"></p><button id="themeBtn">테마</button><script src="app.js"></script></body></html>' },
    { path: "style.css", content: ":root{--bg:#fff}body{background:var(--bg)}@media (max-width: 720px){body{padding:8px}}" },
    { path: "app.js", content: "var KEY='board';var items=JSON.parse(localStorage.getItem(KEY)||'[]');function dday(d){return Math.ceil((new Date(d)-Date.now())/86400000);}document.getElementById('itemForm').addEventListener('submit',function(e){e.preventDefault();items.push({t:1});localStorage.setItem(KEY,JSON.stringify(items));});" },
    { path: "README.md", content: "# 핫딜 보드\n\n## 기능\n- 항목 추가\n- D-day 정렬\n" },
  ],
}, extra || {}));

const okResponse = (text) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ choices: [{ message: { content: text } }] }),
  text: async () => text,
});

const failResponse = (status, body, retryAfter) => ({
  ok: false,
  status,
  headers: { get: (name) => (String(name).toLowerCase() === "retry-after" ? retryAfter || null : null) },
  json: async () => ({}),
  text: async () => body,
});

const postGenerate = (body) =>
  onRequest({
    request: new Request("https://acs.test/api/generate-project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env: {},
  });

/* ── 1. 아키타입 분류 ─────────────────────────────────────── */

test("아키타입 — 대표 과제가 각자의 앱으로 간다(개인 보드 포함)", () => {
  for (const [id, mission] of Object.entries(MISSIONS)) {
    assert.equal(detectArchetype(mission, null).id, id, mission.title + " → " + id);
  }
});

test("아키타입 — '핫딜 · D-day 보드'는 목록/할 일이 아니라 개인 보드", () => {
  const arche = detectArchetype(MISSIONS.board, null);
  assert.equal(arche.id, "board");
  assert.ok(arche.ranked.find((x) => x.id === "board").score > arche.ranked.find((x) => x.id === "directory").score);
  assert.match(ARCHETYPE_HINTS.board, /D-day/);
  assert.match(ARCHETYPE_HINTS.board, /localStorage/);
});

test("아키타입 — 계획·로드맵 과제만 대시보드", () => {
  assert.equal(detectArchetype({ title: "3주 실행 로드맵과 리스크 점검" }).id, "dashboard");
  assert.notEqual(detectArchetype(MISSIONS.pomodoro).id, "dashboard");
  assert.notEqual(detectArchetype(MISSIONS.board).id, "dashboard");
});

/* ── 2. 결정론적 폴백 폐기 ─────────────────────────────────── */

test("로컬 결정론적 엔진 — 폴백 프로바이더가 사라졌다", () => {
  assert.equal(providerById("local"), null);
  assert.ok(!LOCAL_PROVIDERS.some((p) => p.id === "local"));
  assert.ok(!AI_POOL.some((p) => p.id === "local"));
});

test("/api/generate-project — AI 가 없으면 템플릿 앱을 만들지 않고 503 + 안내", async () => {
  const res = await postGenerate({ mission: MISSIONS.board, keys: {} });
  const data = await res.json();
  assert.equal(res.status, 503);
  assert.equal(data.ok, false);
  assert.equal(data.project, undefined, "프로젝트(템플릿 앱)를 돌려주지 않는다");
  assert.equal(data.fallback, undefined);
  assert.match(data.message, /무료 AI 한도가 모두 소진|API 키/);
  assert.equal(data.message, AI_FAIL_NOTICE);
});

test("/api/generate-project — 무료 한도 소진(4006)은 429 + 같은 안내", async () => {
  const calls = [];
  const fetchImpl = async () => {
    calls.push(1);
    return failResponse(429, '{"errors":[{"code":4006,"message":"you have used up your daily free allocation of 10000 neurons"}]}');
  };
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    /* Workers AI 는 env.AI 바인딩으로 부르므로, 키가 있는 프로바이더를 하나 넣어 fetch 경로를 태운다. */
    const res = await postGenerate({ mission: MISSIONS.board, keys: { groq: "gsk_test" } });
    const data = await res.json();
    assert.equal(res.status, 429);
    assert.equal(data.ok, false);
    assert.equal(data.project, undefined);
    assert.ok(data.exhausted.length > 0, "소진 목록을 알려 준다");
    assert.ok(calls.length > 0);
    assert.equal(data.message, AI_FAIL_NOTICE);
  } finally {
    globalThis.fetch = original;
  }
});

test("/api/generate-project — AI 가 응답하면 그 내용으로만 프로젝트를 만든다", async () => {
  const original = globalThis.fetch;
  /* 1단계(markup) → 2단계(logic) 모두 정상 JSON 을 돌려준다. */
  globalThis.fetch = async () => okResponse(goodProjectJson());
  try {
    const res = await postGenerate({ mission: MISSIONS.board, keys: { groq: "gsk_test" } });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.fallback, false);
    assert.deepEqual(data.project.files.map((f) => f.path), ["index.html", "style.css", "app.js", "README.md"]);
    const html = data.project.files[0].content;
    assert.match(html, /itemForm/);
    assert.ok(!/(src|href)=["']https?:/i.test(html), "외부 CDN 없음");
    assert.match(data.project.files[2].content, /localStorage/);
    assert.ok(data.project.files.every((f) => f.bytes > 40));
  } finally {
    globalThis.fetch = original;
  }
});

test("/api/generate-project — 한 단계만 성공하면 반쪽 프로젝트를 내주지 않고 실패한다", async () => {
  const original = globalThis.fetch;
  let call = 0;
  const markupOnly = JSON.stringify({
    name: "dday-board",
    title: "핫딜 · 이벤트 마감 D-day 보드",
    summary: "D-day 보드",
    files: [
      { path: "index.html", content: '<!DOCTYPE html><html lang="ko"><head><title>핫딜 보드</title><link rel="stylesheet" href="style.css" /></head><body><h1>핫딜 보드</h1><form id="itemForm"><input id="itemTitle" /><button type="submit">추가</button></form><ul id="itemList"></ul><script src="app.js"></script></body></html>' },
      { path: "style.css", content: "body{background:#fff}" },
    ],
  });
  globalThis.fetch = async () => {
    call += 1;
    /* 첫 단계는 정상(마크업만), 두 번째 단계는 형식이 깨진 응답 */
    return call === 1 ? okResponse(markupOnly) : okResponse("이건 JSON 이 아닙니다");
  };
  try {
    const res = await postGenerate({ mission: MISSIONS.board, keys: { groq: "gsk_test" } });
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.project, undefined);
    assert.ok(/일부 파일만|형식|다시/.test(data.detail || data.message || ""));
  } finally {
    globalThis.fetch = original;
  }
});

test("/api/generate-project — GET 은 아키타입 목록에 board 를 포함한다", async () => {
  const res = await onRequest({ request: new Request("https://acs.test/api/generate-project"), env: {} });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(data.archetypes, ["board", "pomodoro", "calculator", "todo", "quiz", "notes", "directory", "dashboard"]);
});

/* ── 3. 예산 분리 ─────────────────────────────────────────── */

test("예산 분리 — 협업은 다른 무료 키 먼저 + Workers AI 경량 모델 마지막", () => {
  const workers = AI_POOL.find((p) => p.id === "workers-ai");
  assert.ok(Array.isArray(workers.collabModels) && workers.collabModels.length, "collabModels 가 있다");
  assert.ok(!workers.collabModels.includes("@cf/meta/llama-3.3-70b-instruct-fp8-fast"), "협업은 70B 를 쓰지 않는다");
  assert.equal(workers.models[0], "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "빌드는 70B 부터");

  const env = { AI: { run: async () => ({}) } };
  const keys = { groq: { key: "gsk_x", source: "user" }, gemini: { key: "AIza_x", source: "user" } };

  const collab = buildAttempts({ keys, skip: [], prefer: "auto", env, includeWorkersAi: true, profile: "collab" });
  assert.equal(collab[0].provider, "groq", "협업은 사용자 무료 키부터");
  assert.equal(collab[collab.length - 1].provider, "workers-ai", "Workers AI 는 협업에서 마지막");
  const collabWorkers = collab.filter((a) => a.provider === "workers-ai");
  assert.ok(collabWorkers.length > 0);
  assert.ok(collabWorkers.every((a) => !/70b/.test(a.model)), "협업 Workers AI 는 경량 모델만");
  assert.ok(collabWorkers.every((a) => workers.collabModels.includes(a.model)));

  const build = buildAttempts({ keys, skip: [], prefer: "auto", env, includeWorkersAi: true, profile: "build" });
  assert.equal(build[0].provider, "workers-ai", "빌드는 Workers AI 부터");
  assert.match(build[0].model, /70b/, "빌드는 큰 모델 먼저");
});

test("예산 분리 — 기본값(profile 없음)은 빌드 순서", () => {
  const env = { AI: { run: async () => ({}) } };
  const attempts = buildAttempts({ keys: {}, skip: [], prefer: "auto", env, includeWorkersAi: true });
  assert.equal(attempts[0].provider, "workers-ai");
});

/* ── 4. 429 쿨다운 ────────────────────────────────────────── */

test("429 판정 — 분당 제한은 rate_limited, 하루 소진은 quota", () => {
  assert.equal(classifyFailure(429, "Rate limit reached for requests"), "rate_limited");
  assert.equal(classifyFailure(429, "Too Many Requests"), "rate_limited");
  assert.equal(classifyFailure(400, "quota exceeded for this minute"), "rate_limited");
  assert.equal(classifyFailure(429, "you have used up your daily free allocation of 10,000 neurons"), "quota");
  assert.equal(classifyFailure(400, '{"code":4006}'), "quota");
  assert.equal(classifyFailure(429, "rate limit reached for requests per day"), "quota");
  assert.equal(classifyFailure(401, "invalid api key"), "auth");
});

test("429 재시도 — 짧은 쿨다운 뒤 같은 모델을 다시 불러 성공한다(하루 소진 아님)", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return failResponse(429, "Rate limit reached for requests", "1");
    return okResponse('{"say":["한국어 답변입니다."],"points":[],"callout":null,"artifact":null}');
  };
  const attempts = [{ provider: "groq", model: "llama-3.3-70b-versatile", key: "gsk_x", source: "user" }];
  const started = Date.now();
  const result = await runPool({
    attempts,
    messages: [{ role: "system", content: "s" }, { role: "user", content: "u" }],
    deadline: Date.now() + 12000,
    perAttemptMs: 6000,
    fetchImpl,
    transform: (text) => ({ ok: true, data: { text } }),
  });
  assert.equal(result.ok, true, "쿨다운 재시도로 성공");
  assert.equal(calls, 2);
  assert.deepEqual(result.exhausted, [], "429 는 하루 소진으로 표시하지 않는다");
  assert.ok(result.cooling.length > 0, "쿨다운 사실을 알려 준다");
  assert.ok(Date.now() - started < 8000);
});

/* ── 5. 협업 프롬프트·응답 언어 ────────────────────────────── */

test("협업 프롬프트 — 순수 한국어·반복 금지·구현 스펙 중심을 지시한다", () => {
  const normalized = normalizeRequest({
    mode: "turn",
    stage: 3,
    mission: { title: "핫딜 보드", goal: "D-day 정렬" },
    agent: { id: "codex", name: "코덱스", role: "검증" },
    history: [{ agent: "제미나이 태스크", stage: 2, text: "5단계 계획을 만들었습니다." }],
  });
  assert.equal(normalized.ok, true);
  const prompts = buildCollabPrompts(normalized.request);
  const all = prompts.system + "\n" + prompts.user;
  assert.match(all, /순수 한국어/);
  assert.match(all, /중국어·한자·일본어·베트남어를 절대 섞지 않는다/);
  assert.match(all, /직전 발언을 그대로 반복하지/);
  assert.match(all, /구현 스펙/);
});

test("응답 검증 — 중국어·베트남어가 섞인 턴은 버린다", () => {
  assert.equal(hasForeignScript("仔细하게 계획합니다"), true);
  assert.equal(hasForeignScript("đảm bảo 완료"), true);
  assert.equal(hasForeignScript("한국어로만 쓴 답변입니다"), false);
  const bad = normalizeTurnPayload({
    say: ["단계를 仔细하게 계획합니다."],
    points: [],
    callout: { label: "판단", text: "진행" },
  });
  assert.equal(bad, null, "중국어가 섞인 응답은 폐기");
  const good = normalizeTurnPayload({
    say: ["범위를 핵심 경로로 줄이고 첫 결과물을 오늘 만듭니다."],
    points: [{ t: "첫 행동", d: "itemForm 추가 폼부터 붙입니다." }],
    callout: { label: "판단", text: "A안으로 진행합니다." },
  });
  assert.ok(good && good.say.length === 1);
  const report = normalizeReportPayload({
    say: ["최종 종합입니다."],
    roadmap: [{ step: "설계", detail: "폼과 목록 구조 확정", owner: "제미나이", when: "1일", output: "index.html" }, { step: "구현", detail: "D-day 정렬", owner: "제미나이", when: "2일", output: "app.js" }],
    risks: [{ r: "일정 지연", i: "품질 저하", m: "범위 축소" }, { r: "데이터 손실", i: "재작업", m: "localStorage 백업" }],
    checklist: ["폼 연결", "정렬 확인", "모바일 확인"],
    gates: [{ name: "정렬 정확도", method: "10건 샘플", fail: "범위 축소" }],
    next: ["배포"],
  });
  assert.ok(report && report.roadmap.length === 2);
  const foreign = normalizeReportPayload({
    say: ["최종 종합입니다."],
    roadmap: [{ step: "설계", detail: "仔细 검토", owner: "제미나이", when: "1일", output: "x" }, { step: "구현", detail: "구현", owner: "제미나이", when: "2일", output: "y" }],
    risks: [{ r: "리스크", i: "영향", m: "대응" }, { r: "리스크2", i: "영향", m: "대응" }],
    checklist: ["a", "b", "c"],
  });
  assert.equal(foreign, null, "중국어가 섞인 리포트는 폐기");
});

/* ── 6. 제목·목표 결합/AI 응답 정규화 (기존 버그 회귀) ──────── */

test("제목+목표 결합 버그 — cleanTitle 이 붙은 목표를 떼어낸다", () => {
  const goal = "25분 집중 / 5분 휴식 타이머와 오늘의 할 일 체크리스트를 한 화면에 담은 깔끔한 웹앱 제작";
  assert.equal(cleanTitle("포모도로 집중 타이머 & 오늘 할 일" + goal, goal), "포모도로 집중 타이머 & 오늘 할 일");
  assert.equal(cleanTitle("대출 이자 계산기 — 원금과 금리를 넣으면 즉시 계산", "원금과 금리를 넣으면 즉시 계산"), "대출 이자 계산기");
});

test("제목+목표 결합 버그 — AI 응답의 h1 결합도 분리한다", () => {
  const title = "포모도로 집중 타이머";
  const goal = "25분 집중 / 5분 휴식 타이머";
  const fixed = fixHeadingJoin('<html><head><title>' + title + goal + '</title></head><body><h1>' + title + goal + '</h1></body></html>', title, goal);
  assert.match(fixed, /<h1>포모도로 집중 타이머<\/h1>/);
  assert.match(fixed, /<p class="lead">25분 집중/);
  const normalized = normalizeProject(
    { title: title + goal, summary: goal, files: [{ path: "index.html", content: "<h1>" + title + goal + "</h1>" }, { path: "style.css", content: ":root{}" }] },
    { title, goal },
    now
  );
  assert.equal(normalized.title, title);
  assert.ok(extractIds('<input id="a" /><button id="b">').includes("b"));
});

test("AI 프롬프트 — 과제 맞춤 앱을 요구하고 대시보드를 하드코딩하지 않는다", () => {
  const pomo = buildProjectPrompt(MISSIONS.pomodoro, null);
  assert.match(pomo.user, /동작하는 웹앱/);
  assert.match(pomo.user, /타이머/);
  assert.match(pomo.system, /이어 붙이지 마세요|붙여 쓰지 마세요/);
  assert.equal(pomo.archetype, "pomodoro");
  const board = buildProjectPrompt(MISSIONS.board, null);
  assert.equal(board.archetype, "board");
  assert.match(board.user, /D-day/);
  const plan = buildProjectPrompt({ title: "분기 운영 전략 로드맵", goal: "3개월 실행 계획과 리스크 점검" }, null);
  assert.equal(plan.archetype, "dashboard");
  for (const hint of Object.values(ARCHETYPE_HINTS)) assert.ok(hint.length > 10);
});
