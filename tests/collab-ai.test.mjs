/* Agent Collab Studio v2.5.0 — /api/collab 실제 AI 전용 동작 테스트
 *
 *   실행: node --test tests/
 *
 *  v2.5.0 에서 협업의 로컬 결정론적 엔진을 폐기했다.
 *   - AI 가 없거나 모두 실패하면 턴을 지어내지 않고 429/503 + 안내 문구를 돌려준다.
 *   - 429(분당 제한)는 하루 소진으로 표시하지 않고 cooling 으로만 알려 준다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest, AI_FAIL_NOTICE } from "../functions/api/collab.js";

const TURN_JSON = JSON.stringify({
  say: ["핫딜 보드의 첫 단계로 추가 폼과 목록 구조를 확정합니다.", "제목·링크·카테고리·마감일 네 칸이면 충분합니다."],
  points: [
    { t: "폼", d: "itemForm 안에 itemTitle·itemUrl·itemCat·itemDue 를 둡니다." },
    { t: "정렬", d: "마감일이 가까운 항목이 위로 오도록 sort 합니다." },
  ],
  callout: { label: "판단", text: "A안으로 진행합니다." },
  artifact: { title: "실행 단계 초안", markdown: "# 실행 단계\n- 폼 연결\n- D-day 정렬\n- localStorage 저장" },
});

const body = () => ({
  mode: "turn",
  stage: 2,
  stageName: "과제 분해",
  mission: { title: "핫딜 · 이벤트 마감 D-day 보드", goal: "D-day 순 자동 정렬 개인 보드" },
  agent: { id: "gemini", name: "제미나이 태스크", role: "실행" },
  team: [{ name: "피클", role: "총괄" }, { name: "제미나이 태스크", role: "실행" }, { name: "코덱스", role: "검증" }],
  history: [{ agent: "피클", stage: 1, text: "목표를 확정했습니다." }],
});

const okResponse = (text) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ choices: [{ message: { content: text } }] }),
  text: async () => text,
});
const failResponse = (status, text, retryAfter) => ({
  ok: false,
  status,
  headers: { get: (name) => (String(name).toLowerCase() === "retry-after" ? retryAfter || null : null) },
  json: async () => ({}),
  text: async () => text,
});

const post = (payload) =>
  onRequest({
    request: new Request("https://acs.test/api/collab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env: {},
  });

test("/api/collab — AI 가 없으면 턴을 만들지 않고 503 + 안내", async () => {
  const res = await post(body());
  const data = await res.json();
  assert.equal(res.status, 503);
  assert.equal(data.ok, false);
  assert.equal(data.turn, undefined, "로컬 엔진 턴을 돌려주지 않는다");
  assert.equal(data.message, AI_FAIL_NOTICE);
});

test("/api/collab — 하루 한도 소진(4006)은 429 + exhausted, 턴 없음", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => failResponse(429, '{"errors":[{"code":4006,"message":"daily free allocation exhausted (neurons)"}]}');
  try {
    const res = await post(Object.assign(body(), { keys: { groq: "gsk_test" } }));
    const data = await res.json();
    assert.equal(res.status, 429);
    assert.equal(data.ok, false);
    assert.equal(data.turn, undefined);
    assert.ok(data.exhausted.length > 0);
    assert.ok(data.message.startsWith(AI_FAIL_NOTICE), "안내 문구로 시작하고 시도 내역을 덧붙인다");
  } finally {
    globalThis.fetch = original;
  }
});

test("/api/collab — AI 가 응답하면 그 발언으로 턴을 만든다", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => okResponse(TURN_JSON);
  try {
    const res = await post(Object.assign(body(), { keys: { groq: "gsk_test" } }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.mode, "turn");
    assert.equal(data.turn.say.length, 2);
    assert.equal(data.turn.points.length, 2);
    assert.match(data.turn.artifact.markdown, /localStorage/);
    assert.ok(data.provider, "어떤 AI 가 답했는지 알려 준다");
  } finally {
    globalThis.fetch = original;
  }
});

test("/api/collab — 중국어가 섞인 응답은 쓰지 않고 실패로 돌려준다", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => okResponse(JSON.stringify({
    say: ["단계를 仔细하게 계획합니다."],
    points: [{ t: "판단", d: "진행" }],
    callout: { label: "판단", text: "진행합니다." },
  }));
  try {
    const res = await post(Object.assign(body(), { keys: { groq: "gsk_test" } }));
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.turn, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("/api/collab GET — 풀에 로컬 결정론적 엔진이 없다", async () => {
  const res = await onRequest({ request: new Request("https://acs.test/api/collab"), env: {} });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.rotation, true);
  assert.ok(!data.pool.some((p) => p.id === "local"));
  assert.equal(data.version, "2.5.0");
});
