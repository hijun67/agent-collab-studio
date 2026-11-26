/* Agent Collab Studio v2.4.0 — 모바일 수동 API 키 버튼 검증 (의존성 없음)
 *
 *   실행: node --test tests/
 *
 *  검증 범위
 *   1) 상단 컨트롤 바의 #btnApiKey — .ctl-txt 로 감싸지 않아 390px 에서도 글자가 보인다
 *   2) 클릭 → AI 설정 모달 + 무료 AI 풀(#poolList) 강조·스크롤
 *   3) 고정 엔진에 Groq 옵션이 있고 클라이언트·서버가 함께 지원한다
 *   4) 라이트/다크 스타일과 모바일 규칙이 #btnApiKey 를 숨기지 않는다
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "app.css"), "utf8");
const app = readFileSync(join(root, "app.js"), "utf8");
const server = readFileSync(join(root, "functions/api/_collab.js"), "utf8");
const collab = readFileSync(join(root, "functions/api/collab.js"), "utf8");

test("모바일 API 키 버튼 — #btnApiKey 가 상단 컨트롤 바에 있고 글자가 그대로 보인다", () => {
  const barStart = html.indexOf('<div class="topbar-controls">');
  assert.ok(barStart >= 0, "topbar-controls 가 있다");
  const bar = html.slice(barStart, html.indexOf("</div>", barStart));
  assert.ok(bar.includes('id="btnApiKey"'), "#btnApiKey 가 topbar-controls 안에 있다");
  const block = html.match(/<button[^>]*id="btnApiKey"[\s\S]*?<\/button>/);
  assert.ok(block, "#btnApiKey 버튼 블록");
  assert.match(block[0], /class="ctl ctl-apikey"/);
  assert.match(block[0], /🔑 API 키/, "버튼 글자가 HTML 에 직접 들어 있다");
  assert.ok(!block[0].includes("ctl-txt"), "모바일에서 숨는 .ctl-txt 로 감싸지 않았다");
});

test("모바일 API 키 버튼 — 390px 규칙에서도 숨지 않고 스타일이 있다", () => {
  assert.match(css, /\.ctl-apikey\s*\{[^}]*color:\s*#fde68a/, "다크 모드 스타일");
  assert.match(css, /:root\[data-theme="light"\] \.ctl-apikey\s*\{[^}]*color:\s*#92400e/, "라이트 모드 스타일");
  assert.match(css, /\.ctl-apikey\s*\{\s*display:\s*inline-flex;\s*padding:\s*6px 7px;\s*font-size:\s*11px;\s*\}/, "모바일 규칙");
  assert.ok(!/\.ctl-apikey[^{]*\{[^}]*display:\s*none/.test(css), ".ctl-apikey 를 숨기는 규칙이 없다");
});

test("모바일 API 키 버튼 — 클릭하면 AI 설정 모달과 무료 AI 풀 영역을 연다", () => {
  assert.match(app, /const btnApiKey = \$\('#btnApiKey'\);/, "버튼 조회");
  assert.match(app, /btnApiKey\.addEventListener\('click', \(\) => openAiDialog\(\{ focusPool: true \}\)\)/, "클릭 → openAiDialog({ focusPool: true })");
  assert.match(app, /function openAiDialog\(opts\)/, "openAiDialog 가 옵션을 받는다");
  assert.match(app, /if \(opts && opts\.focusPool\) setTimeout\(focusPoolArea, 80\)/, "모달을 연 뒤 풀 영역으로 이동");
  assert.match(app, /function focusPoolArea\(\) \{[\s\S]*?\$\('#poolList'\)[\s\S]*?scrollIntoView\(\{ block: 'center'/, "풀 영역 스크롤");
  assert.match(app, /list\.classList\.add\('is-focus'\)/, "풀 영역 강조");
  assert.match(css, /\.pool-list\.is-focus\s*\{[^}]*box-shadow/, "강조 스타일");
  assert.match(html, /id="poolList"[^>]*tabindex="-1"/, "풀 영역이 포커스를 받을 수 있다");
});

test("고정 엔진 — Groq 옵션이 선택지와 클라이언트 목록에 있다", () => {
  assert.match(html, /<option value="groq">Groq \(본인 키\)<\/option>/, "select 옵션");
  assert.match(app, /\{ id: 'groq', label: 'Groq \(본인 키\)', short: 'Groq' \}/, "AI_PROVIDERS");
});

test("고정 엔진 — 서버가 Groq BYOK 를 실제로 호출한다", () => {
  assert.match(server, /groq:\s*\{[\s\S]*?defaultModel:\s*"llama-3\.3-70b-versatile"[\s\S]*?endpoint:\s*"https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions"/, "BYOK_PROVIDERS.groq");
});

test("고정 엔진 — OpenAI 호환 분기라 Groq 키가 그대로 전달된다", () => {
  assert.match(collab, /if \(byok\.provider === "gemini"\)[\s\S]*?\} else \{[\s\S]*?headers\.authorization = "Bearer " \+ byok\.key/, "Bearer 헤더 분기");
  assert.match(app, /byok: aiConfig\.provider !== 'auto' && aiConfig\.key \? \{ provider: aiConfig\.provider, key: aiConfig\.key, model: aiConfig\.model \}/, "요청에 provider·key·model 전달");
});
