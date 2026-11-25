/* /api/deploy-cf — Cloudflare Pages Direct Upload 프록시
 *
 *  POST {
 *    accountId: "32자리 계정 ID",
 *    token:     "Pages Write 권한 API 토큰",     // 요청에만 쓰고 저장하지 않는다
 *    project:   "프로젝트 이름 (소문자·숫자·하이픈)",
 *    branch:    "main",                          // 선택
 *    files: [{path, content}] | { "index.html": "..." }
 *  }
 *  → { ok, project, url, deploymentId, alias, stages[], ms }
 *
 *  Direct Upload 순서(공식 API):
 *   1) 토큰 검증  GET /user/tokens/verify
 *   2) 프로젝트 확보 POST /accounts/{id}/pages/projects   (이미 있으면 그대로 사용)
 *   3) 업로드 JWT  GET  /accounts/{id}/pages/projects/{name}/upload-token
 *   4) 자산 등록   POST /pages/assets/upload               (key = blake3(base64(내용)+확장자) 32 hex)
 *   5) 해시 등록   POST /pages/assets/upsert-hashes
 *   6) 배포 생성   POST /accounts/{id}/pages/projects/{name}/deployments  (multipart manifest)
 *
 *  토큰은 이 요청 안에서만 쓰고 어디에도 저장/기록하지 않는다.
 */
import { mimeFor, safePath } from "./_project.js";
import { pagesAssetKey } from "./_blake3.js";

const CF_API = "https://api.cloudflare.com/client/v4";
const MAX_BODY = 6 * 1024 * 1024;
const MAX_FILES = 40;
const MAX_TOTAL = 4 * 1024 * 1024;
const STEP_TIMEOUT = 15000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fail(code, message, extra) {
  return json(Object.assign({ ok: false, code, message }, extra || {}), 200);
}

async function cfFetch(url, options, ms) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), ms || STEP_TIMEOUT) : null;
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller ? controller.signal : undefined }));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cfError(payload, status) {
  const errors = payload && Array.isArray(payload.errors) ? payload.errors : [];
  const first = errors[0] || {};
  return {
    status,
    code: first.code || status,
    message: String(first.message || (payload && payload.message) || "Cloudflare API 오류 " + status).slice(0, 240),
  };
}

function base64Utf8(text) {
  /* Workers/Node 공통: 바이트로 바꾼 뒤 base64. */
  const bytes = new TextEncoder().encode(String(text == null ? "" : text));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
}

function normalizeFiles(input) {
  let rows = input;
  if (!Array.isArray(rows) && rows && typeof rows === "object") {
    rows = Object.keys(rows).map((path) => ({ path, content: rows[path] }));
  }
  if (!Array.isArray(rows)) return { ok: false, message: "files 배열이 필요합니다." };
  const files = [];
  const seen = new Set();
  let total = 0;
  for (const row of rows.slice(0, MAX_FILES * 2)) {
    if (!row) continue;
    const path = safePath(row.path || row.name);
    if (!path || seen.has(path)) continue;
    const content = typeof row.content === "string" ? row.content : row.code;
    if (typeof content !== "string" || !content.trim()) continue;
    const bytes = new TextEncoder().encode(content).length;
    if (total + bytes > MAX_TOTAL) break;
    total += bytes;
    seen.add(path);
    files.push({ path, content, bytes, mime: mimeFor(path) });
    if (files.length >= MAX_FILES) break;
  }
  if (!files.length) return { ok: false, message: "업로드할 파일이 없습니다." };
  if (!seen.has("index.html")) return { ok: false, message: "index.html 이 필요합니다." };
  return { ok: true, files, total };
}

export async function onRequest(context) {
  const { request } = context;
  const method = request.method.toUpperCase();
  if (method === "GET") {
    return json({
      ok: true,
      endpoint: "deploy-cf",
      method: "Cloudflare Pages Direct Upload",
      required: { accountId: "Cloudflare 계정 ID (32자)", token: "API 토큰 — Pages Write 권한", project: "프로젝트 이름" },
      steps: ["토큰 검증", "프로젝트 확보", "업로드 토큰", "자산 업로드", "해시 등록", "배포 생성"],
    });
  }
  if (method !== "POST") return json({ ok: false, code: "method_not_allowed", message: "POST 로 호출해 주세요." }, 405);

  let raw;
  try { raw = await request.text(); } catch (error) {
    return fail("bad_body", "요청 본문을 읽지 못했습니다.");
  }
  if (raw.length > MAX_BODY) return fail("too_large", "파일이 너무 큽니다(최대 4MB).");
  let body;
  try { body = JSON.parse(raw || "{}"); } catch (error) {
    return fail("bad_json", "요청 JSON 을 해석하지 못했습니다.");
  }

  const accountId = String(body.accountId || "").trim();
  const token = String(body.token || "").trim();
  const project = String(body.project || "").trim().toLowerCase();
  const branch = String(body.branch || "main").trim().slice(0, 40) || "main";

  if (!/^[a-f0-9]{32}$/i.test(accountId)) return fail("bad_account", "Cloudflare Account ID 는 32자리 hex 입니다. 대시보드 Workers & Pages 오른쪽의 Account ID 를 붙여넣으세요.");
  if (token.length < 20 || /\s/.test(token)) return fail("bad_token", "API 토큰이 올바르지 않습니다.");
  if (!/^[a-z0-9][a-z0-9-]{0,57}$/.test(project)) return fail("bad_project", "프로젝트 이름은 소문자·숫자·하이픈만 쓸 수 있습니다(예: my-site).");

  const normalized = normalizeFiles(body.files);
  if (!normalized.ok) return fail("bad_files", normalized.message);

  const started = Date.now();
  const stages = [];
  const headers = { authorization: "Bearer " + token, "content-type": "application/json" };

  /* 1) 토큰 검증 */
  try {
    const verify = await cfFetch(CF_API + "/user/tokens/verify", { method: "GET", headers: { authorization: "Bearer " + token } });
    const payload = await verify.json().catch(() => null);
    if (!verify.ok || !payload || payload.success !== true) {
      return fail("token_invalid", "API 토큰을 확인하지 못했습니다. Pages 편집(Write) 권한이 있는 토큰인지 확인하세요.", { status: verify.status });
    }
    stages.push("토큰 확인 완료");
  } catch (error) {
    return fail("network", "Cloudflare 에 연결하지 못했습니다 — " + String((error && error.message) || error).slice(0, 120));
  }

  /* 2) 프로젝트 확보 */
  try {
    const create = await cfFetch(CF_API + "/accounts/" + accountId + "/pages/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: project, production_branch: branch }),
    });
    const payload = await create.json().catch(() => null);
    if (create.ok && payload && payload.success) {
      stages.push("프로젝트 생성: " + project);
    } else {
      const info = cfError(payload, create.status);
      if (/exist/i.test(info.message) || create.status === 409) {
        stages.push("기존 프로젝트 사용: " + project);
      } else if (info.code === 10000 || create.status === 403 || create.status === 401) {
        return fail("token_scope", "토큰에 Pages 편집 권한이 없습니다 — " + info.message, { stages });
      } else {
        return fail("project_failed", "프로젝트를 만들지 못했습니다 — " + info.message, { stages, status: info.status });
      }
    }
  } catch (error) {
    return fail("network", "프로젝트 생성 중 연결 오류 — " + String((error && error.message) || error).slice(0, 120), { stages });
  }

  /* 3) 업로드 JWT */
  let jwt = "";
  try {
    const tokenRes = await cfFetch(CF_API + "/accounts/" + accountId + "/pages/projects/" + project + "/upload-token", {
      method: "GET",
      headers: { authorization: "Bearer " + token },
    });
    const payload = await tokenRes.json().catch(() => null);
    jwt = payload && payload.result && payload.result.jwt ? payload.result.jwt : "";
    if (!jwt) {
      const info = cfError(payload, tokenRes.status);
      return fail("upload_token", "업로드 토큰을 받지 못했습니다 — " + info.message, { stages });
    }
    stages.push("업로드 토큰 발급");
  } catch (error) {
    return fail("network", "업로드 토큰 요청 실패 — " + String((error && error.message) || error).slice(0, 120), { stages });
  }

  /* 4) 자산 업로드 — key = blake3(base64(내용) + 확장자) */
  const manifest = {};
  const assets = [];
  for (const file of normalized.files) {
    const base64 = base64Utf8(file.content);
    const key = pagesAssetKey(base64, file.path);
    manifest["/" + file.path] = key;
    assets.push({ key, value: base64, metadata: { contentType: file.mime }, base64: true });
  }
  try {
    const upload = await cfFetch(CF_API + "/pages/assets/upload", {
      method: "POST",
      headers: { authorization: "Bearer " + jwt, "content-type": "application/json" },
      body: JSON.stringify(assets),
    }, 20000);
    const payload = await upload.json().catch(() => null);
    if (!upload.ok || !payload || payload.success !== true) {
      const info = cfError(payload, upload.status);
      return fail("asset_upload", "파일 업로드에 실패했습니다 — " + info.message, { stages, status: info.status });
    }
    stages.push("파일 " + assets.length + "개 업로드");
  } catch (error) {
    return fail("network", "파일 업로드 중 연결 오류 — " + String((error && error.message) || error).slice(0, 120), { stages });
  }

  /* 5) 해시 등록 */
  try {
    const upsert = await cfFetch(CF_API + "/pages/assets/upsert-hashes", {
      method: "POST",
      headers: { authorization: "Bearer " + jwt, "content-type": "application/json" },
      body: JSON.stringify({ hashes: assets.map((asset) => asset.key) }),
    });
    const payload = await upsert.json().catch(() => null);
    if (!upsert.ok || !payload || payload.success !== true) {
      const info = cfError(payload, upsert.status);
      return fail("asset_hashes", "업로드한 파일을 등록하지 못했습니다 — " + info.message, { stages });
    }
    stages.push("해시 등록 완료");
  } catch (error) {
    return fail("network", "해시 등록 실패 — " + String((error && error.message) || error).slice(0, 120), { stages });
  }

  /* 6) 배포 생성 (multipart) */
  const manifestJson = JSON.stringify(manifest);
  const deployUrl = CF_API + "/accounts/" + accountId + "/pages/projects/" + project + "/deployments";
  let deployment = null;
  for (const asFile of [false, true]) {
    try {
      const form = new FormData();
      if (asFile) {
        form.append("manifest", new Blob([manifestJson], { type: "application/json" }), "manifest.json");
      } else {
        form.append("manifest", manifestJson);
      }
      form.append("branch", branch);
      const res = await cfFetch(deployUrl, {
        method: "POST",
        headers: { authorization: "Bearer " + token },
        body: form,
      }, 20000);
      const payload = await res.json().catch(() => null);
      if (res.ok && payload && payload.success && payload.result) {
        deployment = payload.result;
        break;
      }
      if (!asFile) continue; /* manifest 를 파일 파트로 한 번 더 시도 */
      const info = cfError(payload, res.status);
      return fail("deploy_failed", "배포를 만들지 못했습니다 — " + info.message, { stages, status: info.status });
    } catch (error) {
      if (asFile) return fail("network", "배포 생성 중 연결 오류 — " + String((error && error.message) || error).slice(0, 120), { stages });
    }
  }

  if (!deployment) return fail("deploy_failed", "배포를 만들지 못했습니다.", { stages });
  stages.push("배포 생성 완료");

  const alias = deployment.url || (deployment.aliases && deployment.aliases[0]) || "";
  return json({
    ok: true,
    project,
    branch,
    url: "https://" + project + ".pages.dev",
    alias,
    deploymentId: deployment.id || "",
    stages,
    files: normalized.files.map((file) => file.path),
    ms: Date.now() - started,
  });
}

export { normalizeFiles, base64Utf8 };
