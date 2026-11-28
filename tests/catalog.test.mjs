/* Agent Collab Studio v2.7.0 — 무료 에이전트 카탈로그 검증 (의존성 없음)
 *
 *   실행: node --test tests/
 *
 *  검증 범위
 *   1) 버전·갱신일·도구 수(31)와 팀 투입 가능 수(27)
 *   2) id 중복·필수 필드·유형(cat)·역할(role) 정합성
 *   3) 11-28 신규 1종(Loors)과 갱신 1건(Browser Use 1.0)
 *   4) 이전 반영분(11-27 신규 4·갱신 2, 11-26 신규 6·Antigravity, Jules 종료)
 *   5) agents-catalog.json → agents-catalog.js 사본 동기화
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

test("카탈로그 — v2.7.0 · 2026-11-28 · 31종(팀 투입 27종)", () => {
  assert.equal(catalog.version, "2.7.0");
  assert.equal(catalog.updated, "2026-11-28");
  assert.equal(catalog.tools.length, 31);
  assert.equal(catalog.tools.filter((t) => t.injectable).length, 27);
  assert.equal(catalog.tools.filter((t) => !t.injectable).length, 4);
  assert.match(catalog.note, /31개/);
});

test("카탈로그 — 유형 분포 개인비서 6 · 코딩 11 · 브라우저 7 · 로컬·멀티 7", () => {
  const count = (cat) => catalog.tools.filter((t) => t.cat === cat).length;
  assert.deepEqual({
    assistant: count("assistant"),
    coding: count("coding"),
    browser: count("browser"),
    local: count("local"),
  }, { assistant: 6, coding: 11, browser: 7, local: 7 });
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
  const newIds = ["loors"];
  const newInitials = newIds.map((id) => byId[id].initial);
  assert.equal(new Set(newInitials).size, newInitials.length, "신규 종의 initial 은 서로 달라야 한다");
  const oldInitials = catalog.tools.filter((t) => !newIds.includes(t.id)).map((t) => t.initial);
  for (const init of newInitials) assert.ok(!oldInitials.includes(init), "신규 initial " + init + " 이 기존 카드와 겹친다");
});

test("카탈로그 — 11-28 신규 Loors가 유형·역할·라이선스와 함께 들어갔다", () => {
  const t = byId.loors;
  assert.ok(t, "loors 항목이 없다");
  assert.equal(t.name, "Loors");
  assert.equal(t.cat, "local", "Loors: cat");
  assert.equal(t.role, "local", "Loors: role");
  assert.equal(t.free, "free", "Loors: free");
  assert.equal(t.injectable, true, "Loors: 팀 투입 가능");
  assert.match(t.scope, /MIT/, "Loors: 라이선스 명시");
  assert.match(t.scope, /llama\.cpp/, "Loors: 내장 llama.cpp");
  assert.match(t.scope, /CUDA·Vulkan·Metal/, "Loors: GPU 백엔드");
  assert.match(t.scope, /GGUF/, "Loors: 로컬 GGUF");
  assert.match(t.scope, /100% 오프라인/, "Loors: 오프라인 실행");
  assert.match(t.scope, /OpenAI·Claude·Gemini·GitHub Models·OpenRouter·Ollama·LM Studio/, "Loors: 클라우드 모델 연결");
  assert.match(t.scope, /Rust \+ Tauri v2/, "Loors: 스택");
  assert.match(t.scope, /4\.4MB/, "Loors: 설치본 크기");
  assert.match(t.scope, /loors-cli/, "Loors: 헤드리스 CLI");
  assert.match(t.scope, /Visual Cyclic Harness Studio/, "Loors: 시각적 순환 워크플로우");
  assert.match(t.scope, /LLM Judge/, "Loors: LLM Judge 노드");
  assert.match(t.scope, /Human Gate/, "Loors: 승인 게이트 노드");
  assert.match(t.scope, /CDP/, "Loors: 공유 인터랙티브 브라우저");
  assert.match(t.scope, /CAPTCHA/, "Loors: 로그인·CAPTCHA 인계");
  assert.equal(t.source, "https://loors.dev/", "Loors: 공식 출처");
});

test("카탈로그 — 11-28 갱신 Browser Use가 1.0·BU 4.0 변경을 담는다", () => {
  const bu = byId["browser-use"];
  assert.ok(bu, "browser-use 항목이 없다");
  assert.equal(bu.cat, "browser", "browser-use: cat 유지");
  assert.equal(bu.role, "browser", "browser-use: role 유지");
  assert.equal(bu.free, "free", "browser-use: free 유지");
  assert.match(bu.one, /1\.0/, "browser-use: 1.0");
  assert.match(bu.one, /Chrome DevTools Protocol/, "browser-use: CDP");
  assert.match(bu.scope, /browser-use 1\.0/, "browser-use: 1.0 릴리스");
  assert.match(bu.scope, /BU 4\.0/, "browser-use: BU 4.0");
  assert.match(bu.scope, /80%/, "browser-use: 라이브러리 80% 경량화");
  assert.match(bu.scope, /파이썬 REPL/, "browser-use: 파이썬 REPL 직접 실행");
  assert.match(bu.scope, /\+33p/, "browser-use: 정확도 +33p");
  assert.match(bu.scope, /2\.7~5\.2배/, "browser-use: 비용 절감");
  assert.match(bu.scope, /2~3배/, "browser-use: 속도 향상");
  assert.match(bu.scope, /result\.judgement/, "browser-use: 실행 자동 판정");
  assert.match(bu.scope, /--cli-mcp/, "browser-use: CLI MCP");
  assert.match(bu.scope, /Browser\('chromium'\)/, "browser-use: 로컬호스트 실행");
  assert.match(bu.source, /browser-use\.com\/changelog\/27-11-2026/, "browser-use: 1.0 변경이력 출처");
});

test("카탈로그 — 11-27 반영분(신규 4종·갱신 2건)이 그대로 유지된다", () => {
  const expect = {
    nod: { cat: "assistant", role: "exec", free: "free", must: /Apache-2\.0/ },
    "browseros-neo": { cat: "browser", role: "browser", free: "free", must: /AGPL-3\.0/ },
    "daiv-3": { cat: "coding", role: "code", free: "partial", must: /Apache-2\.0/ },
    "free-claude-code": { cat: "local", role: "local", free: "free", must: /AGPL-3\.0/ },
  };
  for (const [id, want] of Object.entries(expect)) {
    const t = byId[id];
    assert.ok(t, id + " 항목이 없다");
    assert.equal(t.cat, want.cat, id + ": cat");
    assert.equal(t.role, want.role, id + ": role");
    assert.equal(t.free, want.free, id + ": free");
    assert.equal(t.injectable, true, id + ": 팀 투입 가능");
    assert.match(t.scope, want.must, id + ": 라이선스 명시");
  }
  assert.match(byId.opencode.scope, /Hy4 Flash/);
  assert.match(byId["devin-desktop"].scope, /SWE-2\.1/);
});

test("카탈로그 — 11-26 반영분(신규 6종·Antigravity)이 그대로 유지된다", () => {
  const six = {
    "prism-agent": { cat: "assistant", role: "exec", free: "partial", must: /Apache-2\.0/ },
    "localcode": { cat: "coding", role: "code", free: "free", must: /Apache-2\.0/ },
    "flashbrowse": { cat: "browser", role: "browser", free: "free", must: /Apache-2\.0/ },
    "go-bot": { cat: "assistant", role: "docs", free: "partial", must: /MIT/ },
    "dodaios": { cat: "local", role: "local", free: "partial", must: /Apache-2\.0/ },
    "agent-first-browse": { cat: "browser", role: "browser", free: "free", must: /Apache-2\.0/ },
  };
  for (const [id, want] of Object.entries(six)) {
    const t = byId[id];
    assert.ok(t, id + " 항목이 없다");
    assert.equal(t.cat, want.cat, id + ": cat");
    assert.equal(t.role, want.role, id + ": role");
    assert.equal(t.free, want.free, id + ": free");
    assert.match(t.scope, want.must, id + ": 라이선스 명시");
  }
  const ag = byId.antigravity;
  assert.match(ag.scope, /2026-11-30/);
  assert.match(ag.scope, /Gemini 4 Hydrogen/);
  assert.match(ag.source, /antigravity\.google/);
});

test("카탈로그 — Google Jules 종료 표시는 그대로 유지된다", () => {
  const jules = byId.jules;
  assert.equal(jules.status.tone, "sunset");
  assert.match(jules.status.label, /2026-12-31/);
  assert.match(jules.scope, /읽기 전용/);
});

test("카탈로그 — agents-catalog.js 사본이 JSON 과 같다", () => {
  const out = execFileSync(process.execPath, [join(root, "scripts", "catalog.mjs"), "--check"], { encoding: "utf8" });
  assert.match(out, /catalog in sync: 31 tools \/ 11 roles/);
});

test("카탈로그 — 갱신일은 ISO 날짜다", () => {
  assert.match(catalog.updated, ISO_DAY);
});
