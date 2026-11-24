import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const out = join(root, 'dist');

// 1) agents-catalog.json → agents-catalog.js 사본을 먼저 맞춘다 (카탈로그가 원본)
execFileSync(process.execPath, [join(root, 'scripts', 'catalog.mjs')], { stdio: 'inherit' });

// 2) studio/style.css → studio/style-scoped.css (스튜디오 CSS를 #studioRoot 아래로 가둔다)
execFileSync(process.execPath, [join(root, 'scripts', 'scope-css.mjs')], { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = ['index.html', 'app.css', 'app.js', 'mode.js', 'agents-catalog.json', 'agents-catalog.js', 'README.md'];
for (const f of files) {
  if (!existsSync(join(root, f))) throw new Error('missing ' + f);
  cpSync(join(root, f), join(out, f));
}

// 3) 4컷만화 · 카드뉴스 스튜디오 자산 (ES 모듈 + 스코프 CSS)
const studioFiles = ['app.js', 'plan.js', 'canvas.js', 'cards.js', 'video.js', 'style-scoped.css'];
mkdirSync(join(out, 'studio'), { recursive: true });
for (const f of studioFiles) {
  if (!existsSync(join(root, 'studio', f))) throw new Error('missing studio/' + f);
  cpSync(join(root, 'studio', f), join(out, 'studio', f));
}

// Cloudflare Pages: HTML·카탈로그는 항상 재검증, 자산은 짧게 캐시
const headers = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '',
  '/app.css',
  '  Cache-Control: public, max-age=300',
  '',
  '/app.js',
  '  Cache-Control: public, max-age=300',
  '',
  '/mode.js',
  '  Cache-Control: public, max-age=300',
  '',
  '/studio/*',
  '  Cache-Control: public, max-age=300',
  '',
  '/agents-catalog.json',
  '  Cache-Control: public, max-age=300',
  ''
].join('\n');
writeFileSync(join(out, '_headers'), headers);

console.log('dist/ built:', readdirSync(out).join(', '));
