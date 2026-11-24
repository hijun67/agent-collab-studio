/* ============================================================
   뉴스픽 스튜디오 | 로그인 세션 공용 유틸 (Cloudflare Pages Functions)
   - 밑줄(_)로 시작하므로 Pages 라우트로 노출되지 않고 /api/auth/* 가 import 한다.
   - 세션 쿠키 ns_session = base64url(JSON) + "." + base64url(HMAC-SHA256)
     · 서명 키: SESSION_SECRET (없으면 AUTH_SESSION_SECRET)
     · 수명: 7일 (쿠키 Max-Age 와 payload.exp 를 함께 확인)
   - 회원 프로필·채널 계정은 KV 에 USER:<provider>:<id> 로 저장한다.
   - 구글·네이버·카카오 키가 아직 없어도 앱이 깨지지 않도록
     providers() 로 설정 여부를 알리고, 없으면 'OAuth 키 등록 대기 중' 안내로 돌려보낸다.
   ============================================================ */

export const COOKIE_SESSION = "ns_session";
export const COOKIE_STATE = "ns_oauth_state";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const STATE_SECONDS = 60 * 10;
export const SESSION_VERSION = 1;
export const USER_PREFIX = "USER:";
export const OAUTH_PENDING = "OAuth 키 등록 대기 중";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function json(status, payload, extraHeaders) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    ...(extraHeaders || {}),
  };
  return new Response(JSON.stringify(payload), { status, headers });
}

export function redirect(location, cookies) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies || []) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export function sessionSecret(env) {
  const source = env || {};
  return source.SESSION_SECRET || source.AUTH_SESSION_SECRET || "";
}

export function providers(env) {
  const source = env || {};
  const has = (id, secret) => Boolean(source[id] && source[secret]);
  return {
    google: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    naver: has("NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"),
    kakao: has("KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET"),
    session: Boolean(sessionSecret(source)),
  };
}

export function oauthConfigured(env) {
  const conf = providers(env);
  return conf.google || conf.naver || conf.kakao;
}

export function parseCookies(header) {
  const out = {};
  const raw = String(header || "");
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const name = part.slice(0, i).trim();
    if (!name) continue;
    out[name] = part.slice(i + 1).trim();
  }
  return out;
}

export function readCookie(request, name) {
  return parseCookies(request.headers.get("Cookie"))[name] || "";
}

export function cookie(name, value, maxAge, extra) {
  const bits = [`${name}=${value}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
  if (typeof maxAge === "number") bits.push(`Max-Age=${maxAge}`);
  if (extra) bits.push(extra);
  return bits.join("; ");
}

export function clearCookie(name) {
  return cookie(name, "", 0, "Expires=Thu, 01 Jan 1970 00:00:00 GMT");
}

export function randomToken(bytes) {
  const buf = new Uint8Array(bytes || 16);
  crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

export function toBase64Url(input) {
  const bytes = typeof input === "string" ? encoder.encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSession(secret, payload) {
  if (!secret) throw new Error("missing SESSION_SECRET");
  const body = toBase64Url(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toBase64Url(sig)}`;
}

export async function readSession(secret, token) {
  if (!secret || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let sig;
  try {
    sig = fromBase64Url(parts[1]);
  } catch (e) {
    return null;
  }
  let ok = false;
  try {
    const key = await hmacKey(secret);
    ok = await crypto.subtle.verify("HMAC", key, sig, encoder.encode(parts[0]));
  } catch (e) {
    return null;
  }
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(decoder.decode(fromBase64Url(parts[0])));
  } catch (e) {
    return null;
  }
  if (!payload || payload.v !== SESSION_VERSION) return null;
  if (!payload.exp || Number(payload.exp) * 1000 < Date.now()) return null;
  return payload;
}

/** 요청에서 로그인 세션을 읽는다 (없으면 null). */
export async function currentSession(request, env) {
  const token = readCookie(request, COOKIE_SESSION);
  return readSession(sessionSecret(env), token);
}

export function callbackUri(requestUrl, provider) {
  return `${new URL(requestUrl).origin}/api/auth/callback/${provider}`;
}

export function userKey(session) {
  return USER_PREFIX + String(session.provider || "guest") + ":" + String(session.sub || "");
}

export function store(env) {
  return env && env.ARCHIVE && typeof env.ARCHIVE.get === "function" ? env.ARCHIVE : null;
}

export async function loadProfile(env, session) {
  const kv = store(env);
  const base = {
    provider: session.provider || "",
    sub: String(session.sub || ""),
    name: session.name || "",
    email: session.email || "",
    picture: session.picture || "",
    accounts: {},
    createdAt: "",
    updatedAt: "",
  };
  if (!kv) return base;
  try {
    const raw = await kv.get(userKey(session));
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return {
      ...base,
      ...saved,
      provider: base.provider,
      sub: base.sub,
      accounts: saved.accounts && typeof saved.accounts === "object" ? saved.accounts : {},
    };
  } catch (e) {
    return base;
  }
}

export async function saveProfile(env, session, patch) {
  const kv = store(env);
  if (!kv) return null;
  const now = new Date().toISOString();
  const current = await loadProfile(env, session);
  const next = {
    ...current,
    ...(patch || {}),
    provider: session.provider || current.provider,
    sub: String(session.sub || current.sub),
    createdAt: current.createdAt || now,
    updatedAt: now,
  };
  try {
    await kv.put(userKey(session), JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 365 });
    return next;
  } catch (e) {
    return null;
  }
}

/** 화면에 돌려줄 사용자 정보로 다듬는다. */
export function publicUser(session, profile) {
  const guest = session.provider === "guest";
  return {
    provider: session.provider || "",
    name: profile.name || (guest ? "게스트" : "사용자"),
    email: profile.email || "",
    picture: profile.picture || "",
    since: session.iat || 0,
    guest,
  };
}
