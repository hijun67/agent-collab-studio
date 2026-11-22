/* agents-catalog.json → agents-catalog.js (오프라인 실행용 사본)
   JSON을 고친 뒤 이 스크립트를 다시 돌리면 앱이 읽는 사본이 갱신됩니다.
   node scripts/catalog.mjs          // 생성
   node scripts/catalog.mjs --check  // JSON과 사본이 같은지 확인(다르면 exit 1)
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const jsonPath = join(root, 'agents-catalog.json');
const jsPath = join(root, 'agents-catalog.js');

const raw = readFileSync(jsonPath, 'utf8');
const catalog = JSON.parse(raw);
const banner = '/* 자동 생성 파일 — 원본은 agents-catalog.json 입니다. 직접 고치지 마세요. */\n';
const js = banner + 'window.ACS_CATALOG = ' + JSON.stringify(catalog, null, 2) + ';\n';
const checkOnly = process.argv.indexOf('--check') >= 0;

if (checkOnly) {
  let current = '';
  try { current = readFileSync(jsPath, 'utf8'); } catch (e) { current = ''; }
  if (current !== js) {
    console.error('agents-catalog.js 가 agents-catalog.json 과 다릅니다. node scripts/catalog.mjs 로 다시 생성하세요.');
    process.exit(1);
  }
  console.log('catalog in sync:', catalog.tools.length, 'tools /', catalog.roles.length, 'roles');
} else {
  writeFileSync(jsPath, js);
  console.log('agents-catalog.js written:', catalog.tools.length, 'tools /', catalog.roles.length, 'roles');
}
