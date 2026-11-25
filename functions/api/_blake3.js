/* BLAKE3 (순수 JS) — Cloudflare Pages Direct Upload 의 자산 키 계산용
 *
 *  Pages 는 자산 키를 `blake3(base64(내용) + 확장자)` 로 계산해 32자 hex 로 자릅니다
 *  (wrangler `pages/hash.ts` 와 같은 규칙). Workers 런타임의 crypto.subtle 에는 BLAKE3 이 없어
 *  직접 구현했습니다. 테스트 벡터: 빈 문자열 → af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262
 *
 *  - 외부 의존성 없음, Node/Workers 양쪽에서 동작 (TextEncoder만 사용).
 *  - 한 번에 32바이트(256비트) 해시만 필요하므로 출력 길이 확장(XOF)은 생략했습니다.
 */

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const MSG_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;
const ROOT = 8;

const BLOCK_LEN = 64;
const CHUNK_LEN = 1024;

function rotr(value, bits) {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function g(s, a, b, c, d, mx, my) {
  s[a] = (s[a] + s[b] + mx) >>> 0;
  s[d] = rotr(s[d] ^ s[a], 16);
  s[c] = (s[c] + s[d]) >>> 0;
  s[b] = rotr(s[b] ^ s[c], 12);
  s[a] = (s[a] + s[b] + my) >>> 0;
  s[d] = rotr(s[d] ^ s[a], 8);
  s[c] = (s[c] + s[d]) >>> 0;
  s[b] = rotr(s[b] ^ s[c], 7);
}

function permute(m) {
  const out = new Uint32Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = m[MSG_PERMUTATION[i]];
  return out;
}

function compress(cv, block, counter, blockLen, flags) {
  const s = new Uint32Array(16);
  for (let i = 0; i < 8; i += 1) s[i] = cv[i];
  s[8] = IV[0];
  s[9] = IV[1];
  s[10] = IV[2];
  s[11] = IV[3];
  s[12] = counter >>> 0;
  s[13] = Math.floor(counter / 4294967296) >>> 0;
  s[14] = blockLen >>> 0;
  s[15] = flags >>> 0;

  let m = block;
  for (let round = 0; round < 7; round += 1) {
    g(s, 0, 4, 8, 12, m[0], m[1]);
    g(s, 1, 5, 9, 13, m[2], m[3]);
    g(s, 2, 6, 10, 14, m[4], m[5]);
    g(s, 3, 7, 11, 15, m[6], m[7]);
    g(s, 0, 5, 10, 15, m[8], m[9]);
    g(s, 1, 6, 11, 12, m[10], m[11]);
    g(s, 2, 7, 8, 13, m[12], m[13]);
    g(s, 3, 4, 9, 14, m[14], m[15]);
    if (round < 6) m = permute(m);
  }

  const out = new Uint32Array(16);
  for (let i = 0; i < 8; i += 1) {
    out[i] = (s[i] ^ s[i + 8]) >>> 0;
    out[i + 8] = (s[i + 8] ^ cv[i]) >>> 0;
  }
  return out;
}

function blockWords(bytes, offset) {
  const words = new Uint32Array(16);
  for (let i = 0; i < 16; i += 1) {
    const p = offset + i * 4;
    words[i] = (
      (bytes[p] || 0) |
      ((bytes[p + 1] || 0) << 8) |
      ((bytes[p + 2] || 0) << 16) |
      ((bytes[p + 3] || 0) << 24)
    ) >>> 0;
  }
  return words;
}

/** 한 청크(<=1024B)의 체이닝 값 또는 루트 출력. */
function chunkOutput(chunk, chunkIndex, wantRoot) {
  let cv = IV;
  const blocks = Math.max(1, Math.ceil(chunk.length / BLOCK_LEN));
  for (let i = 0; i < blocks; i += 1) {
    const offset = i * BLOCK_LEN;
    const blockLen = Math.min(BLOCK_LEN, chunk.length - offset);
    const words = blockWords(chunk, offset);
    const flags = (i === 0 ? CHUNK_START : 0) | (i === blocks - 1 ? CHUNK_END : 0);
    if (wantRoot && i === blocks - 1) {
      const out = compress(cv, words, chunkIndex, blockLen, flags | ROOT);
      return out.slice(0, 8);
    }
    const out = compress(cv, words, chunkIndex, blockLen, flags);
    cv = out.slice(0, 8);
  }
  return cv;
}

function parentOutput(left, right, wantRoot) {
  const block = new Uint32Array(16);
  block.set(left, 0);
  block.set(right, 8);
  const out = compress(IV, block, 0, BLOCK_LEN, PARENT | (wantRoot ? ROOT : 0));
  return out.slice(0, 8);
}

function wordsToBytes(words) {
  const out = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i += 1) {
    out[i * 4] = words[i] & 0xff;
    out[i * 4 + 1] = (words[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (words[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (words[i] >>> 24) & 0xff;
  }
  return out;
}

function toHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
  return hex;
}

/** Uint8Array → 32바이트 루트 해시(Uint8Array). */
export function blake3Bytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const chunks = Math.max(1, Math.ceil(bytes.length / CHUNK_LEN));
  const slice = (i) => bytes.subarray(i * CHUNK_LEN, Math.min(bytes.length, (i + 1) * CHUNK_LEN));

  if (chunks === 1) {
    return wordsToBytes(chunkOutput(slice(0), 0, true));
  }

  /* 청크 체이닝 값들을 모아 둘씩 부모로 합친다. 마지막 두 개는 ROOT 로 출력한다. */
  let nodes = [];
  for (let i = 0; i < chunks; i += 1) nodes.push(chunkOutput(slice(i), i, false));
  while (nodes.length > 2) {
    const next = [];
    for (let i = 0; i + 1 < nodes.length; i += 2) next.push(parentOutput(nodes[i], nodes[i + 1], false));
    if (nodes.length % 2 === 1) next.push(nodes[nodes.length - 1]);
    nodes = next;
  }
  return wordsToBytes(parentOutput(nodes[0], nodes[1], true));
}

/** 문자열/바이트 → 64자 hex. */
export function blake3Hex(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return toHex(blake3Bytes(bytes));
}

/** Pages 자산 키: blake3(base64(내용) + 확장자) 32자 hex. */
export function pagesAssetKey(base64, path) {
  const ext = String(path || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  return blake3Hex(base64 + ext).slice(0, 32);
}
