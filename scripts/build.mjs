import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const out = join(root, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = ['index.html', 'app.css', 'app.js', 'README.md'];
for (const f of files) {
  if (!existsSync(join(root, f))) throw new Error('missing ' + f);
  cpSync(join(root, f), join(out, f));
}

// Cloudflare Pages: HTML은 항상 재검증, 자산은 짧게 캐시
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
  ''
].join('\n');
writeFileSync(join(out, '_headers'), headers);

console.log('dist/ built:', readdirSync(out).join(', '));
