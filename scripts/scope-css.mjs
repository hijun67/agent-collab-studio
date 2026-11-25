/* studio/style.css → studio/style-scoped.css
 *
 * 4컷만화·카드뉴스 스튜디오를 Agent Collab Studio 한 문서 안에 넣기 때문에
 * 스튜디오의 전역 선택자(body·:root·*·요소 선택자)가 협업 화면까지 번지지 않도록
 * 모든 규칙을 :is(#studioRoot,#studioFloat) 아래로 가둔다.
 * 다이얼로그는 #studioRoot 밖(#studioFloat)에 있으므로 두 루트를 함께 지정한다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'studio', 'style.css'), 'utf8');

const SCOPE = ':is(#studioRoot,#studioFloat)';

const BODY_SCOPE = '#studioRoot';

function scopeSelector(sel) {
  const s = sel.trim();
  if (!s) return s;
  if (s === ':root') return SCOPE;
  // 테마 규칙: :root[data-theme="light"] 는 실제 속성이 <html> 에 붙으므로
  // html[data-theme="light"] 아래의 두 루트로 옮긴다.
  const themed = /^:root(\[[^\]]*\])(.*)$/.exec(s);
  if (themed) {
    const rest = themed[2].trim();
    const base = 'html' + themed[1] + ' ' + SCOPE;
    return rest ? base + ' ' + rest : base;
  }
  if (s === 'html' || s === 'body') return BODY_SCOPE;
  if (/^body(\.|$| )/.test(s)) return BODY_SCOPE + s.slice(4);
  if (/^html(\.|$| )/.test(s)) return BODY_SCOPE + s.slice(4);
  if (s === '*') return SCOPE + ' *';
  if (s.startsWith('* ')) return SCOPE + ' ' + s.slice(2);
  if (s.startsWith(SCOPE)) return s;
  return SCOPE + ' ' + s;
}

let out = '';
let keyframe = 0; // @keyframes 블록 깊이
let inComment = false;

for (const line of src.split('\n')) {
  const t = line.trim();

  if (inComment) {
    out += line + '\n';
    if (t.includes('*/')) inComment = false;
    continue;
  }
  if (t.startsWith('/*')) {
    out += line + '\n';
    if (!t.includes('*/')) inComment = true;
    continue;
  }

  if (keyframe > 0) {
    out += line + '\n';
    for (const ch of line) {
      if (ch === '{') keyframe++;
      else if (ch === '}') keyframe--;
    }
    if (keyframe < 0) keyframe = 0;
    continue;
  }

  if (/^@keyframes\b/.test(t)) {
    out += line + '\n';
    let depth = 0;
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    keyframe = Math.max(depth, 0);
    continue;
  }

  if (!t || !line.includes('{') || t.startsWith('@')) {
    out += line + '\n';
    continue;
  }

  const brace = line.indexOf('{');
  const head = line.slice(0, brace);
  const tail = line.slice(brace);
  out += head.split(',').map(scopeSelector).join(', ') + ' ' + tail + '\n';
}

// 다이얼로그 루트(#studioFloat)는 body 규칙을 받지 않으므로 글꼴·색만 이어 준다.
out += '\n/* ---- 다이얼로그 루트 ---- */\n';
out += '#studioFloat { font-family: var(--font); color: var(--ink); font-size: 14px; }\n';

writeFileSync(join(root, 'studio', 'style-scoped.css'), out);
console.log('studio/style-scoped.css written:', out.length, 'bytes');
