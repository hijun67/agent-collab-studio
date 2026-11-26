/* Agent Collab Studio v2.4.0 — 무료 에이전트 카탈로그 검증 (의존성 없음)
 *
 *   실행: node --test tests/
 *
 *  검증 범위
 *   1) 버전·갱신일·도구 수(26)와 팀 투입 가능 수(22)
 *   2) id 중복·필수 필드·유형(cat)·역할(role) 정합성
 *   3) 신규 6종과 기존 2건(Antigravity·OpenCode) 갱신 내용
 *   4) agents-catalog.json → agents-catalog.js 사본 동기화
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const catalog = JSON.parse(readFileSync(join(root, "agents-catalog.json"), "utf8"));
const byId = Object.fromEntries(catalog.tools.map((t) => [t.id, t]));
const CATS = ["assistant", "coding", "browser", "local"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

test("카탈로그 — v2.5.0 · 2026-11-26 · 26종(팀 투입 22종)", () => {
  assert.equal(catalog.version, "2.5.0");
  assert.equal(catalog.updated, "2026-11-26");
  assert.equal(catalog.tools.length, 26);
  assert.equal(catalog.tools.filter((t) => t.injectable).length, 22);
  assert.equal(catalog.tools.filter((t) => !t.injectable).length, 4);
  assert.match(catalog.note, /26개/);
});

test("카탈로그 — 유형 분포 개인비서 5 · 코딩 10 · 브라우저 6 · 로컬·멀티 5", () => {
  const count = (cat) => catalog.tools.filter((t) => t.cat === cat).length;
  assert.deepEqual({
    assistant: count("assistant"),
    coding: count("coding"),
    browser: count("browser"),
    local: count("local"),
  }, { assistant: 5, coding: 10, browser: 6, local: 5 });
});

test("카탈로그 — id 중복 없고 필수 필드·유형·역할이 맞는다", () => {
  const ids = catalog.tools.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "id 는 유일해야 한다");
  const roleIds = new Set(catalog.roles.map((r) => r.id));
  assert.equal(catalog.roles.length, 11);
  for (const t of catalog.tools) {
    assert.ok(t.id && /^[a-z0-9-]+$/.test(t.id), t.id + ": id 형식");
    assert.ok(t.name && t.en, t.id + ": name/en");
    assert.ok(CATS.includes(t.cat), t.id + ": cat " + t.cat);
    assert.ok(roleIds.has(t.role), t.id + ": role " + t.role + " 이 roles 에 없다");
    assert.ok(["free", "partial"].includes(t.free), t.id + ": free");
    assert.ok(t.badge && t.one && t.scope, t.id + ": badge/one/scope");
    assert.match(t.color, /^#[0-9a-f]{6}$/i, t.id + ": color");
    assert.ok(t.initial && t.initial.length <= 2, t.id + ": initial");
    assert.ok(t.mission && t.mission.title && t.mission.goal && t.mission.context, t.id + ": mission");
    if (t.source) assert.match(t.source, /^https:\/\//, t.id + ": source");
    if (t.status) assert.ok(t.status.tone && t.status.label, t.id + ": status");
  }
  const newIds = ["prism-agent", "localcode", "flashbrowse", "go-bot", "dodaios", "agent-first-browse"];
  const newInitials = newIds.map((id) => byId[id].initial);
  assert.equal(new Set(newInitials).size, newInitials.length, "신규 6종의 initial 은 서로 달라야 한다");
  const oldInitials = catalog.tools.filter((t) => !newIds.includes(t.id)).map((t) => t.initial);
  for (const init of newInitials) assert.ok(!oldInitials.includes(init), "신규 initial " + init + " 이 기존 카드와 겹친다");
});

test("카탈로그 — 신규 6종이 유형·역할·라이선스와 함께 들어갔다", () => {
  const expect = {
    "prism-agent": { cat: "assistant", role: "exec", free: "partial", must: /Apache-2\.0/ },
    "localcode": { cat: "coding", role: "code", free: "free", must: /Apache-2\.0/ },
    "flashbrowse": { cat: "browser", role: "browser", free: "free", must: /Apache-2\.0/ },
    "go-bot": { cat: "assistant", role: "docs", free: "partial", must: /MIT/ },
    "dodaios": { cat: "local", role: "local", free: "partial", must: /Apache-2\.0/ },
    "agent-first-browse": { cat: "browser", role: "browser", free: "free", must: /Apache-2\.0/ },
  };
  for (const [id, want] of Object.entries(expect)) {
    const t = byId[id];
    assert.ok(t, id + " 항목이 없다");
    assert.equal(t.cat, want.cat, id + ": cat");
    assert.equal(t.role, want.role, id + ": role");
    assert.equal(t.free, want.free, id + ": free");
    assert.equal(t.injectable, true, id + ": 팀 투입 가능");
    assert.match(t.scope, want.must, id + ": 라이선스 명시");
    assert.match(t.source, /^https:\/\//, id + ": 공식 출처");
  }
  assert.match(byId["prism-agent"].scope, /Claude Code·Codex/);
  assert.match(byId["prism-agent"].scope, /Slack·Teams/);
  assert.match(byId["localcode"].scope, /16GB/);
  assert.match(byId["localcode"].scope, /100% 로컬/);
  assert.match(byId["flashbrowse"].scope, /접근성 트리/);
  assert.match(byId["go-bot"].scope, /OfficeCLI/);
  assert.match(byId["dodaios"].scope, /위험 등급/);
  assert.match(byId["agent-first-browse"].scope, /delta snapshot/);
});

test("카탈로그 — 기존 2건(Antigravity·OpenCode)이 최신 변경을 담는다", () => {
  const ag = byId.antigravity;
  assert.match(ag.scope, /2026-11-30/);
  assert.match(ag.scope, /Gemini 4 Hydrogen/);
  assert.match(ag.scope, /GPT-OSS-120b/);
  assert.match(ag.scope, /Gemini 4 Argon/);
  assert.match(ag.source, /antigravity\.google/);
  assert.match(ag.mission.context, /Hydrogen/);

  const oc = byId.opencode;
  assert.match(oc.scope, /v2\.4\.0/);
  assert.match(oc.scope, /Chrome·Edge·Firefox·Safari/);
  assert.match(oc.scope, /\/automation/);
  assert.match(oc.source, /opencode\.ai/);
});

test("카탈로그 — Google Jules 종료 표시는 그대로 유지된다", () => {
  const jules = byId.jules;
  assert.equal(jules.status.tone, "sunset");
  assert.match(jules.status.label, /2026-12-31/);
  assert.match(jules.scope, /읽기 전용/);
});

test("카탈로그 — agents-catalog.js 사본이 JSON 과 같다", () => {
  const out = execFileSync(process.execPath, [join(root, "scripts", "catalog.mjs"), "--check"], { encoding: "utf8" });
  assert.match(out, /catalog in sync: 26 tools \/ 11 roles/);
});

test("카탈로그 — 갱신일은 ISO 날짜다", () => {
  assert.match(catalog.updated, ISO_DAY);
});
