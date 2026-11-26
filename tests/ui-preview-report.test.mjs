/* Agent Collab Studio v2.5.0 — 미리보기 iframe · 최종 리포트 파일 검증 (의존성 없음)
 *
 *   실행: node --test tests/
 *
 *  1) 미리보기 iframe 은 allow-same-origin 없이(사이트 토큰 보호) sandbox 로 격리하고,
 *     localStorage 는 메모리 shim 으로 대신한다 — shim 은 <head> 가 없는 문서에도 반드시 들어간다.
 *  2) 프레임이 렌더 결과(요소 수·텍스트 길이·스크립트 오류)를 부모로 알려 화면에 표시한다.
 *  3) 최종 결과물 리포트 산출물은 완성된 마크다운으로 저장된다(0바이트 버그 회귀 방지).
 *  4) 로컬 결정론적 엔진 호출이 남아 있지 않다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const html = readFileSync(join(root, "index.html"), "utf8");
const app = readFileSync(join(root, "app.js"), "utf8");
const build = readFileSync(join(root, "build.js"), "utf8");
const css = readFileSync(join(root, "app.css"), "utf8");

test("미리보기 iframe — sandbox 는 스크립트만 허용하고 allow-same-origin 은 넣지 않는다", () => {
  const tag = html.match(/<iframe[^>]*id="buildPreviewFrame"[^>]*>/);
  assert.ok(tag, "미리보기 iframe 이 있다");
  assert.match(tag[0], /sandbox="[^"]*allow-scripts/);
  assert.ok(!/allow-same-origin/.test(tag[0]), "생성 코드가 사이트 localStorage(토큰)를 읽지 못하게 격리");
  assert.match(html, /id="buildPreviewNote"/, "렌더 상태를 보여 줄 자리");
});

test("미리보기 — localStorage shim 이 head/html 이 없어도 들어가고 </script 를 이스케이프한다", () => {
  assert.match(build, /var PREVIEW_SHIM = \[/);
  assert.match(build, /Object\.defineProperty\(window,"localStorage"/, "샌드박스에서 localStorage 대체");
  assert.match(build, /parent\.postMessage\(d,"\*"\)/, "프레임 → 부모 렌더 보고");
  // head 가 없으면 html/최상단 순서로 shim 을 넣는다
  assert.ok(build.includes('<head[^>]*>/i.test(doc)'), "head 가 있으면 head 안에");
  assert.ok(build.includes('<html[^>]*>/i.test(doc)'), "head 가 없으면 html 바로 뒤에");
  assert.match(build, /inlineScript\(js\)/, "인라인 JS 이스케이프 경유");
  assert.match(build, /inlineScript = function \(js\) \{[\s\S]*?replace\(\/<\\\/script\/gi/, "인라인 JS 의 </script 이스케이프");
});

test("미리보기 — 부모가 렌더 신호를 받아 표시하고, 신호가 없으면 경고", () => {
  assert.match(build, /function onPreviewMessage\(e\)/);
  assert.match(build, /data\.acs !== 'preview'/);
  assert.match(build, /setPreviewNote\('렌더 확인 — 텍스트 '/);
  assert.match(build, /미리보기에서 렌더 신호가 오지 않았습니다/);
  assert.match(build, /window\.addEventListener\('message', onPreviewMessage\)/);
  assert.match(css, /\.build-preview-note\.is-ok/);
});

test("최종 리포트 — 산출물은 완성된 마크다운으로 저장된다(0바이트 회귀 방지)", () => {
  // 예전 버그: content: report.md (정의되지 않은 값) → 0바이트 파일
  assert.ok(!/content: report\.md/.test(app), "정의되지 않은 report.md 를 산출물 본문으로 쓰지 않는다");
  assert.match(app, /state\.report\.md = reportMarkdown\(turn\.report\)/);
  const block = app.slice(app.indexOf("function addMessage(turn, fresh)"), app.indexOf("function executeTurn()"));
  assert.match(block, /existing\.content = state\.report\.md/, "기존 리포트 산출물 본문을 채운다");
  assert.match(block, /state\.artifacts\.push\(\{ title: title, content: state\.report\.md/, "없으면 새로 만든다");
});

test("리포트 — AI 응답으로만 만들고, 실패하면 다시 시도할 수 있다", () => {
  assert.match(app, /function reportFromAi\(p, ai, meta\)/);
  assert.match(app, /if \(data\.roadmap\.length < 2 \|\| !data\.risks\.length \|\| data\.checklist\.length < 2\) return null;/);
  const btn = app.slice(app.indexOf("function renderReportButton()"), app.indexOf("function renderReportButton()") + 1200);
  assert.match(btn, /리포트 다시 시도/);
});

test("로컬 결정론적 엔진 — 앱 소스에 남아 있지 않다", () => {
  assert.ok(!/buildTurn\s*\(/.test(app), "buildTurn 삭제");
  assert.ok(!/buildExtraTurn\s*\(/.test(app), "buildExtraTurn 삭제");
  assert.ok(!/로컬 결정론적 엔진/.test(app), "AI 설정의 로컬 엔진 항목 삭제");
  assert.ok(!/로컬 결정론적 엔진/.test(html), "index.html 에도 없다");
  assert.ok(!/로컬 엔진으로 만듭니다/.test(app), "로컬 엔진으로 턴을 만들지 않는다");
  assert.match(app, /AI_FAIL_NOTICE/, "실패 시 안내 문구");
  assert.match(app, /kind: 'notice'/, "실패 안내 카드");
});

test("빌드 — 실패 응답은 로컬 생성 대신 안내와 상태 표시로 끝난다", () => {
  assert.ok(!/data\.fallback/.test(build), "fallback 분기 제거");
  assert.match(build, /setPill\('실패', 'warn'\)/);
  assert.match(build, /reportFail/, "협업 화면에도 실패 안내를 남긴다");
});
