/* Agent Collab Studio v2.2 | 🛠️ 빌드 · 배포 패널
 *
 *  - /api/generate-project 로 실제 프로젝트 파일 세트를 만든다(무료 AI 풀 → 로컬 Ollama → 로컬 생성기).
 *  - 파일 탐색 · 코드 편집 · 샌드박스 iframe 실시간 미리보기 · ZIP 다운로드(외부 CDN 없음).
 *  - GitHub REST API 로 저장소 생성 → 모든 파일 커밋 → GitHub Pages 활성화까지 브라우저에서 직접.
 *  - /api/deploy-cf 로 Cloudflare Pages Direct Upload.
 *
 *  토큰은 이 브라우저(localStorage)에만 저장하고 이 사이트의 API 로만 보낸다.
 */
(function () {
  'use strict';

  var LS_GH = 'acs.gh.v1';
  var LS_CF = 'acs.cf.v1';
  var LS_OLLAMA = 'acs.ollama.v1';

  var state = {
    project: null,
    active: 'index.html',
    dirty: false,
    busy: false,
    previewAt: 0,
    context: null,
    generation: null
  };

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtBytes(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + 'B';
    return (Math.round((bytes / 1024) * 10) / 10) + 'KB';
  }
  function nowStamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ── 미리보기: index.html 의 상대경로 CSS/JS 를 인라인으로 합친다 ── */
  function previewDoc(files) {
    var map = {};
    (files || []).forEach(function (file) { map[file.path] = file.content; });
    var html = map['index.html'];
    if (!html) return '<!DOCTYPE html><html lang="ko"><body><p>index.html 이 없습니다.</p></body></html>';
    var shim = [
      '(function(){',
      'try{window.localStorage.getItem("__acs");}catch(e){',
      'var m={};var s={getItem:function(k){return m[k]==null?null:m[k];},setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}};',
      'try{Object.defineProperty(window,"localStorage",{configurable:true,value:s});}catch(_){}',
      '}',
      'window.__acsError=function(msg){try{var d=document.getElementById("__acsErr");if(!d){d=document.createElement("div");d.id="__acsErr";d.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#7f1d1d;color:#fff;font:12px/1.5 -apple-system,sans-serif;padding:10px 12px;border-radius:10px";document.body.appendChild(d);}d.textContent="미리보기 스크립트 오류: "+msg;}catch(e){}};',
      'window.addEventListener("error",function(e){if(window.__acsError)window.__acsError((e&&e.message)||"알 수 없는 오류");});',
      '})();'
    ].join('');
    var base = '<base target="_blank"><script>' + shim + '<\/script>';
    html = html.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, function (match, href) {
      var path = String(href).replace(/^\.\//, '');
      if (/^(https?:)?\/\//.test(path) || path.indexOf('data:') === 0) return match;
      var css = map[path];
      if (css == null) return match;
      return '<style data-from="' + esc(path) + '">\n' + css + '\n</style>';
    });
    html = html.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, function (match, src) {
      var path = String(src).replace(/^\.\//, '');
      if (/^(https?:)?\/\//.test(path)) return match;
      var js = map[path];
      if (js == null) return match;
      return '<script data-from="' + esc(path) + '">\n' + js + '\n</script>';
    });
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1>' + base);
    return html;
  }

  /* ── ZIP (store 방식 · CRC32 · UTF-8 파일명) ── */
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildZip(files) {
    var encoder = new TextEncoder();
    var chunks = [];
    var central = [];
    var offset = 0;
    var dosTime = (0 << 11) | (0 << 5) | 0;
    var dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
    (files || []).forEach(function (file) {
      var name = encoder.encode(file.path);
      var data = encoder.encode(file.content);
      var crc = crc32(data);
      var local = new Uint8Array(30 + name.length);
      var view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, dosTime, true);
      view.setUint16(12, dosDate, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true);
      view.setUint16(28, 0, true);
      local.set(name, 30);
      chunks.push(local, data);

      var centralHeader = new Uint8Array(46 + name.length);
      var cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(name, 46);
      central.push(centralHeader);

      offset += local.length + data.length;
    });
    var centralSize = central.reduce(function (sum, part) { return sum + part.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  /* ── 생성 ─────────────────────────────────────────────── */
  function slimMission(mission) {
    if (!mission) return null;
    return {
      title: mission.title || '',
      goal: mission.goal || '',
      context: mission.context || '',
      audience: mission.audience || '',
      deadline: mission.deadline || '',
      steps: (mission.steps || []).slice(0, 6),
      checks: (mission.checks || []).slice(0, 8),
      risks: (mission.risks || []).slice(0, 4)
    };
  }
  function slimReport(report) {
    if (!report) return null;
    return {
      summary: report.summary || null,
      roadmap: (report.roadmap || []).slice(0, 6),
      risks: (report.risks || []).slice(0, 5),
      checklist: (report.checklist || []).slice(0, 10),
      gates: (report.gates || []).slice(0, 4),
      next: (report.next || []).slice(0, 4)
    };
  }

  function poolPayload() {
    if (window.__ACS && window.__ACS.ai && typeof window.__ACS.ai.poolPayload === 'function') {
      try { return window.__ACS.ai.poolPayload(); } catch (e) {}
    }
    return { keys: {}, skip: [], prefer: 'auto' };
  }

  function setStatus(text, tone) {
    var el = $('#buildStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'build-status' + (tone ? ' is-' + tone : '');
  }
  function setPill(text, tone) {
    var el = $('#buildGenPill');
    if (!el) return;
    el.textContent = text;
    el.className = 'build-pill' + (tone ? ' is-' + tone : '');
  }

  function generate() {
    if (state.busy) return;
    var ctx = state.context ? state.context() : null;
    var mission = ctx && ctx.mission;
    if (!mission || !mission.title) {
      setStatus('먼저 협업 과제를 시작하세요 — 과제와 리포트가 프로젝트의 재료가 됩니다.', 'warn');
      return;
    }
    state.busy = true;
    var btn = $('#btnBuildGenerate');
    if (btn) btn.disabled = true;
    setPill('AI 풀 호출 중', 'busy');
    setStatus('무료 AI 풀이 과제와 리포트를 읽고 파일을 만드는 중입니다…', 'busy');
    var pool = poolPayload();
    var body = {
      mission: slimMission(mission),
      report: slimReport(ctx.report),
      keys: pool.keys || {},
      skip: pool.skip || [],
      prefer: pool.prefer || 'auto'
    };
    var started = Date.now();

    fetch('/api/generate-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json().catch(function () { return null; }); })
      .then(function (data) {
        if (!data || !data.ok || !data.project) {
          throw new Error((data && data.message) || '프로젝트를 만들지 못했습니다.');
        }
        if (data.exhausted && window.__ACS && window.__ACS.ai && window.__ACS.ai.markExhausted) {
          try { window.__ACS.ai.markExhausted(data.exhausted); } catch (e) {}
        }
        if (data.fallback) return tryOllama(body).then(function (ollama) { return ollama || data; });
        return data;
      })
      .then(function (data) {
        applyProject(data.project);
        var sec = Math.max(1, Math.round((Date.now() - started) / 100) / 10);
        var who = data.fallback ? '로컬 생성기' : ((data.providerLabel || data.provider) + (data.model ? ' · ' + shortModel(data.model) : ''));
        setPill('생성 완료', 'ok');
        setStatus('파일 ' + data.project.files.length + '개를 만들었습니다 — ' + who + (data.project.archetypeLabel ? ' · ' + data.project.archetypeLabel : '') + ' · ' + sec + '초' + (data.warnings && data.warnings.length ? ' · ' + data.warnings[0] : ''), 'ok');
        switchBuildTab('files');
      })
      .catch(function (err) {
        setPill('실패', 'warn');
        setStatus('프로젝트를 만들지 못했습니다 — ' + String((err && err.message) || err), 'warn');
      })
      .then(function () {
        state.busy = false;
        if (btn) btn.disabled = false;
      });
  }

  function shortModel(model) {
    var text = String(model || '');
    return text.length > 34 ? text.slice(0, 33) + '…' : text;
  }

  /* 로컬 Ollama — 브라우저가 http://localhost:11434 로 직접 호출(설정이 필요할 수 있음) */
  function ollamaConfig() {
    return readJSON(LS_OLLAMA, { enabled: false, url: 'http://localhost:11434', model: 'llama3.2' });
  }
  function tryOllama(body) {
    var cfg = ollamaConfig();
    if (!cfg || !cfg.enabled) return Promise.resolve(null);
    var base = String(cfg.url || 'http://localhost:11434').replace(/\/+$/, '');
    var prompt = [
      '한국어 웹 프로젝트 생성기입니다. 과제와 리포트로 실제 동작하는 정적 웹 프로젝트 파일을 만드세요.',
      '과제: ' + body.mission.title,
      '목표: ' + (body.mission.goal || ''),
      '단계: ' + (body.mission.steps || []).map(function (s) { return s.name; }).join(' / '),
      '체크리스트: ' + (body.mission.checks || []).join(' / '),
      '',
      'JSON 하나만 출력: {"name":"repo-name","title":"제목","summary":"요약","files":[{"path":"index.html","content":"..."},{"path":"style.css","content":"..."},{"path":"app.js","content":"..."},{"path":"README.md","content":"..."}]}'
    ].join('\n');
    return fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model || 'llama3.2',
        stream: false,
        format: 'json',
        messages: [{ role: 'user', content: prompt }]
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var text = data && data.message && data.message.content;
        if (!text) return null;
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        if (!parsed || !Array.isArray(parsed.files)) return null;
        var files = parsed.files
          .filter(function (f) { return f && typeof f.path === 'string' && typeof f.content === 'string'; })
          .filter(function (f) { return /^[A-Za-z0-9._\-/]+$/.test(f.path) && f.path.indexOf('..') < 0; })
          .slice(0, 12)
          .map(function (f) { return { path: f.path, content: f.content }; });
        if (!files.some(function (f) { return f.path === 'index.html'; }) || files.length < 2) return null;
        return {
          ok: true,
          provider: 'ollama',
          providerLabel: '로컬 Ollama',
          model: cfg.model,
          fallback: false,
          project: { name: parsed.name || 'acs-project', title: parsed.title || body.mission.title, summary: parsed.summary || '', files: files }
        };
      })
      .catch(function () { return null; });
  }

  function applyProject(project) {
    var files = (project.files || []).map(function (file) {
      var bytes = new TextEncoder().encode(file.content).length;
      return { path: file.path, content: file.content, bytes: bytes, kind: file.path.split('.').pop() };
    });
    state.project = {
      name: project.name || 'acs-project',
      title: project.title || '프로젝트',
      summary: project.summary || '',
      files: files,
      source: project.source || ''
    };
    state.active = files.some(function (f) { return f.path === 'index.html'; }) ? 'index.html' : (files[0] || {}).path;
    state.dirty = false;
    if ($('#buildWork')) $('#buildWork').hidden = false;
    var repo = $('#ghRepo');
    if (repo && !repo.value) repo.value = state.project.name;
    var cf = $('#cfProject');
    if (cf && !cf.value) cf.value = state.project.name;
    renderTree();
    renderEditor();
    renderPreview();
    renderDeployDefaults();
  }

  /* ── 화면 ─────────────────────────────────────────────── */
  function renderMission() {
    var ctx = state.context ? state.context() : null;
    var mission = ctx && ctx.mission;
    var title = $('#buildMissionTitle');
    var meta = $('#buildMissionMeta');
    if (!title) return;
    if (!mission || !mission.title) {
      title.textContent = '과제가 없습니다';
      meta.textContent = '협업 과제를 먼저 시작하면 그 과제와 리포트로 프로젝트를 만듭니다.';
      return;
    }
    /* 제목과 목표를 한 줄에 붙여 쓰지 않는다 — b/span 을 각각 block 으로 두고, 목표는 '목표 · ' 접두어로 분리한다. */
    var cleanTitle = String(mission.title || '').replace(/\s+/g, ' ').trim();
    var goal = String(mission.goal || '').replace(/\s+/g, ' ').trim();
    if (goal && cleanTitle.length > goal.length && cleanTitle.slice(-goal.length) === goal) {
      cleanTitle = cleanTitle.slice(0, cleanTitle.length - goal.length).trim();
    }
    title.textContent = cleanTitle;
    var bits = [];
    if (goal) bits.push('목표 · ' + goal);
    if (ctx.report) bits.push('최종 리포트 반영');
    meta.textContent = bits.join(' · ').slice(0, 180) || '과제 정보로 프로젝트를 만듭니다.';
  }

  function switchBuildTab(tab) {
    $$('.btab').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-btab') === tab);
    });
    var map = { files: '#bPaneFiles', preview: '#bPanePreview', deploy: '#bPaneDeploy' };
    Object.keys(map).forEach(function (key) {
      var pane = $(map[key]);
      if (pane) pane.classList.toggle('is-active', key === tab);
    });
    if (tab === 'preview') renderPreview();
  }

  function renderTree() {
    var tree = $('#buildTree');
    if (!tree) return;
    var files = state.project ? state.project.files : [];
    if ($('#buildFileCount')) $('#buildFileCount').textContent = String(files.length);
    tree.innerHTML = files.map(function (file) {
      var on = file.path === state.active ? ' is-active' : '';
      var ext = (file.path.split('.').pop() || '').toLowerCase();
      return '<button type="button" class="tree-item' + on + '" data-path="' + esc(file.path) + '" role="option" aria-selected="' + (on ? 'true' : 'false') + '">' +
        '<span class="tree-ext ext-' + esc(ext) + '">' + esc(ext.slice(0, 3)) + '</span>' +
        '<span class="tree-name">' + esc(file.path) + '</span>' +
        '<span class="tree-size">' + fmtBytes(file.bytes) + '</span>' +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(tree.querySelectorAll('.tree-item'), function (button) {
      button.addEventListener('click', function () {
        state.active = button.getAttribute('data-path');
        state.dirty = false;
        renderTree();
        renderEditor();
      });
    });
  }

  function currentFile() {
    if (!state.project) return null;
    return state.project.files.find(function (file) { return file.path === state.active; }) || null;
  }

  function renderEditor() {
    var file = currentFile();
    if ($('#buildEditorPath')) $('#buildEditorPath').textContent = file ? file.path : '—';
    if ($('#buildEditorArea')) $('#buildEditorArea').value = file ? file.content : '';
    if ($('#buildDirty')) $('#buildDirty').textContent = '';
    if ($('#buildPreviewMeta')) {
      $('#buildPreviewMeta').textContent = state.project
        ? state.project.files.length + '개 파일 · ' + (state.project.source === 'local' ? '로컬 생성' : state.project.source || 'AI 생성')
        : '';
    }
  }

  function applyEdit() {
    var file = currentFile();
    var area = $('#buildEditorArea');
    if (!file || !area) return;
    file.content = area.value;
    file.bytes = new TextEncoder().encode(file.content).length;
    state.dirty = false;
    if ($('#buildDirty')) $('#buildDirty').textContent = '적용됨';
    renderTree();
  }

  function renderPreview() {
    var frame = $('#buildPreviewFrame');
    if (!frame || !state.project) return;
    frame.srcdoc = previewDoc(state.project.files);
    state.previewAt = Date.now();
  }

  function renderDeployDefaults() {
    if (!state.project) return;
    var repo = $('#ghRepo');
    if (repo && !repo.value) repo.value = state.project.name;
    var cf = $('#cfProject');
    if (cf && !cf.value) cf.value = state.project.name;
    if ($('#buildZipNote')) {
      var total = state.project.files.reduce(function (sum, f) { return sum + (f.bytes || 0); }, 0);
      $('#buildZipNote').textContent = state.project.files.length + '개 파일 · ' + fmtBytes(total) + ' · ' + state.project.name + '.zip';
    }
  }

  function setNote(id, text, tone) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'hint' + (tone ? ' is-' + tone : '');
  }

  /* ── GitHub ───────────────────────────────────────────── */
  function b64Utf8(text) {
    var bytes = new TextEncoder().encode(String(text == null ? '' : text));
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function ghConfig() {
    return readJSON(LS_GH, { token: '', repo: '', private: false });
  }
  function saveGh() {
    var cfg = {
      token: ($('#ghToken') || {}).value ? $('#ghToken').value.trim() : '',
      repo: ($('#ghRepo') || {}).value ? $('#ghRepo').value.trim() : '',
      private: !!($('#ghPrivate') && $('#ghPrivate').checked)
    };
    writeJSON(LS_GH, cfg);
    setNote('#ghStatus', cfg.token ? '토큰을 이 브라우저에만 저장했습니다.' : '토큰을 비웠습니다.', cfg.token ? 'ok' : '');
  }

  function ghApi(path, options, token) {
    var headers = {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + token,
      'x-github-api-version': '2022-11-28'
    };
    var init = Object.assign({ method: 'GET', headers: headers }, options || {});
    if (init.body && typeof init.body !== 'string') {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(init.body);
    }
    return fetch('https://api.github.com' + path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, ok: res.ok, data: data };
      });
    });
  }

  function ghError(res, fallback) {
    if (!res) return fallback;
    if (res.status === 401) return '토큰이 올바르지 않습니다 — GitHub 토큰을 다시 확인하세요.';
    if (res.status === 403) return '권한이 부족합니다 — 토큰에 repo 권한이 필요합니다.';
    if (res.status === 404) return '대상을 찾지 못했습니다 — 토큰과 저장소 이름을 확인하세요.';
    return (res.data && res.data.message ? res.data.message : fallback) + (res.status ? ' (' + res.status + ')' : '');
  }

  function githubDeploy() {
    if (state.busy || !state.project) return;
    var token = ($('#ghToken') || {}).value ? $('#ghToken').value.trim() : '';
    var repo = ($('#ghRepo') || {}).value ? $('#ghRepo').value.trim() : '';
    var isPrivate = !!($('#ghPrivate') && $('#ghPrivate').checked);
    if (!token) { setNote('#ghStatus', 'GitHub Personal Access Token(repo 권한)을 입력하세요.', 'warn'); return; }
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) { setNote('#ghStatus', '저장소 이름을 영문·숫자·-._ 로 입력하세요.', 'warn'); return; }

    state.busy = true;
    var btn = $('#btnGhDeploy');
    if (btn) btn.disabled = true;
    if ($('#ghResult')) { $('#ghResult').hidden = true; $('#ghResult').innerHTML = ''; }
    var stages = [];
    function stage(text) {
      stages.push(text);
      setNote('#ghStatus', text, '');
    }
    stage('GitHub 계정 확인 중…');
    writeJSON(LS_GH, { token: token, repo: repo, private: isPrivate });

    var owner = '';
    var branch = 'main';
    ghApi('/user', {}, token)
      .then(function (res) {
        if (!res.ok) throw new Error(ghError(res, 'GitHub 계정을 확인하지 못했습니다.'));
        owner = res.data.login;
        stage('계정: @' + owner + ' · 저장소 준비 중…');
        return ghApi('/repos/' + owner + '/' + repo, {}, token);
      })
      .then(function (res) {
        if (res.ok) {
          branch = res.data.default_branch || 'main';
          stage('기존 저장소 사용: ' + owner + '/' + repo);
          return res;
        }
        if (res.status !== 404) throw new Error(ghError(res, '저장소를 확인하지 못했습니다.'));
        return ghApi('/user/repos', {
          method: 'POST',
          body: {
            name: repo,
            private: isPrivate,
            description: (state.project.title || 'Agent Collab Studio').slice(0, 180),
            auto_init: false,
            has_issues: true
          }
        }, token).then(function (created) {
          if (!created.ok) throw new Error(ghError(created, '저장소를 만들지 못했습니다.'));
          branch = created.data.default_branch || 'main';
          stage('저장소 생성: ' + owner + '/' + repo);
          return created;
        });
      })
      .then(function () {
        var files = state.project.files.slice();
        var index = 0;
        function uploadPath(file) {
          return '/repos/' + owner + '/' + repo + '/contents/' + file.path.split('/').map(encodeURIComponent).join('/');
        }
        function putFile(file, sha) {
          var body = {
            message: 'Agent Collab Studio: ' + file.path,
            content: b64Utf8(file.content),
            branch: branch
          };
          if (sha) body.sha = sha;
          return ghApi(uploadPath(file), { method: 'PUT', body: body }, token).then(function (put) {
            if (put.ok) return true;
            /* 이미 있는 파일은 sha 없이 올리면 422 — 그때만 현재 sha 를 읽어 다시 올린다. */
            if (put.status === 422 && !sha) {
              return ghApi(uploadPath(file), {}, token).then(function (existing) {
                if (!existing.ok || !existing.data || !existing.data.sha) throw new Error(ghError(put, file.path + ' 업로드 실패'));
                return putFile(file, existing.data.sha);
              });
            }
            throw new Error(ghError(put, file.path + ' 업로드 실패'));
          });
        }
        function next() {
          if (index >= files.length) return Promise.resolve();
          var file = files[index];
          index += 1;
          stage('파일 업로드 ' + index + '/' + files.length + ': ' + file.path);
          return putFile(file).then(function () { return next(); });
        }
        return next();
      })
      .then(function () {
        stage('GitHub Pages 켜는 중…');
        /* 이미 켜져 있으면 409 — 그때만 현재 상태를 읽는다(불필요한 404 요청을 만들지 않는다). */
        return ghApi('/repos/' + owner + '/' + repo + '/pages', {
          method: 'POST',
          body: { source: { branch: branch, path: '/' } }
        }, token).then(function (created) {
          if (created.ok) return created;
          if (created.status === 409) {
            return ghApi('/repos/' + owner + '/' + repo + '/pages', {}, token).then(function (current) {
              if (current.ok) return current;
              return created;
            });
          }
          throw new Error(ghError(created, 'GitHub Pages를 켜지 못했습니다.'));
        });
      })
      .then(function () {
        var url = 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/';
        var profile = 'https://github.com/' + owner + '/' + repo;
        stage('완료 — Pages가 빌드되는 동안 1~2분 걸릴 수 있습니다.');
        var box = $('#ghResult');
        if (box) {
          box.hidden = false;
          box.innerHTML =
            '<div class="deploy-ok"><b>배포 완료</b><span>GitHub Pages 빌드가 끝나면 아래 주소에서 열립니다.</span></div>' +
            '<a class="deploy-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>' +
            '<a class="deploy-link sub" href="' + esc(profile) + '" target="_blank" rel="noopener noreferrer">' + esc(profile) + '</a>' +
            '<ul class="deploy-stages">' + stages.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
        }
        setNote('#ghStatus', 'GitHub 저장소 업로드와 GitHub Pages 활성화가 끝났습니다.', 'ok');
      })
      .catch(function (err) {
        setNote('#ghStatus', String((err && err.message) || err), 'warn');
      })
      .then(function () {
        state.busy = false;
        if (btn) btn.disabled = false;
      });
  }

  /* ── Cloudflare Pages ─────────────────────────────────── */
  function cfConfig() {
    return readJSON(LS_CF, { accountId: '', project: '' });
  }
  function cfDeploy() {
    if (state.busy || !state.project) return;
    var accountId = ($('#cfAccountId') || {}).value ? $('#cfAccountId').value.trim() : '';
    var token = ($('#cfToken') || {}).value ? $('#cfToken').value.trim() : '';
    var project = ($('#cfProject') || {}).value ? $('#cfProject').value.trim() : '';
    if (!accountId || !token || !project) { setNote('#cfStatus', 'Account ID · API 토큰 · 프로젝트 이름을 모두 입력하세요.', 'warn'); return; }
    state.busy = true;
    writeJSON(LS_CF, { accountId: accountId, project: project });
    var btn = $('#btnCfDeploy');
    if (btn) btn.disabled = true;
    setNote('#cfStatus', 'Cloudflare Pages에 업로드하는 중입니다…', '');
    if ($('#cfResult')) { $('#cfResult').hidden = true; $('#cfResult').innerHTML = ''; }

    fetch('/api/deploy-cf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: accountId,
        token: token,
        project: project,
        branch: 'main',
        files: state.project.files.map(function (file) { return { path: file.path, content: file.content }; })
      })
    })
      .then(function (res) { return res.json().catch(function () { return null; }); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || '배포하지 못했습니다.');
        var box = $('#cfResult');
        if (box) {
          box.hidden = false;
          box.innerHTML =
            '<div class="deploy-ok"><b>배포 완료</b><span>' + esc((data.files || []).length + '개 파일 · ' + (data.deploymentId || '').slice(0, 8)) + '</span></div>' +
            '<a class="deploy-link" href="' + esc(data.url) + '" target="_blank" rel="noopener noreferrer">' + esc(data.url) + '</a>' +
            '<ul class="deploy-stages">' + (data.stages || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
        }
        setNote('#cfStatus', 'Cloudflare Pages 배포가 끝났습니다 — ' + data.url, 'ok');
        if ($('#cfToken')) $('#cfToken').value = '';
      })
      .catch(function (err) {
        setNote('#cfStatus', String((err && err.message) || err), 'warn');
      })
      .then(function () {
        state.busy = false;
        if (btn) btn.disabled = false;
      });
  }

  /* ── 열기/닫기 · 바인딩 ───────────────────────────────── */
  function open(context, opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    state.context = typeof context === 'function' ? context : function () { return context || {}; };
    renderMission();
    var cfg = ghConfig();
    if ($('#ghToken') && cfg.token) $('#ghToken').value = cfg.token;
    if ($('#ghRepo') && cfg.repo) $('#ghRepo').value = cfg.repo;
    if ($('#ghPrivate') && cfg.private) $('#ghPrivate').checked = true;
    var cfc = cfConfig();
    if ($('#cfAccountId') && cfc.accountId) $('#cfAccountId').value = cfc.accountId;
    if ($('#cfProject') && cfc.project) $('#cfProject').value = cfc.project;
    if (state.project) {
      if ($('#buildWork')) $('#buildWork').hidden = false;
      renderTree();
      renderEditor();
      renderPreview();
      renderDeployDefaults();
    }
    if ($('#buildOverlay')) $('#buildOverlay').hidden = false;
    /* ⚡ 바로 앱 생성 — 모달을 열자마자 생성까지 달린다. */
    if (options.autostart) {
      setTimeout(function () { try { generate(); } catch (e) {} }, 180);
    }
  }
  function close() {
    if ($('#buildOverlay')) $('#buildOverlay').hidden = true;
  }
  function isOpen() {
    return !!($('#buildOverlay') && !$('#buildOverlay').hidden);
  }

  function bind() {
    if (!$('#buildOverlay')) return;
    $('#btnBuildClose').addEventListener('click', close);
    $('#buildOverlay').addEventListener('click', function (e) { if (e.target === $('#buildOverlay')) close(); });
    $('#btnBuildGenerate').addEventListener('click', generate);
    $('#btnBuildZip').addEventListener('click', function () {
      if (!state.project) return;
      applyEdit();
      download(buildZip(state.project.files), state.project.name + '.zip');
      setNote('#buildZipNote', 'ZIP을 만들었습니다 — ' + state.project.files.length + '개 파일', 'ok');
    });
    $('#btnBuildRefresh').addEventListener('click', function () { applyEdit(); renderPreview(); });
    $('#btnBuildSaveFile').addEventListener('click', function () { applyEdit(); renderPreview(); });
    $('#buildEditorArea').addEventListener('input', function () {
      state.dirty = true;
      if ($('#buildDirty')) $('#buildDirty').textContent = '수정됨';
    });
    $$('.btab').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.getAttribute('data-btab') !== 'files') applyEdit();
        switchBuildTab(button.getAttribute('data-btab'));
      });
    });
    $('#btnGhSave').addEventListener('click', saveGh);
    $('#btnGhDeploy').addEventListener('click', githubDeploy);
    $('#btnCfDeploy').addEventListener('click', cfDeploy);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });
  }

  window.ACSBuild = {
    open: open,
    close: close,
    isOpen: isOpen,
    generate: generate,
    previewDoc: previewDoc,
    buildZip: function () { return state.project ? buildZip(state.project.files) : null; },
    files: function () { return state.project ? state.project.files.map(function (f) { return { path: f.path, bytes: f.bytes }; }) : []; },
    project: function () { return state.project ? { name: state.project.name, title: state.project.title, source: state.project.source } : null; },
    setProject: applyProject,
    state: function () { return { active: state.active, dirty: state.dirty, busy: state.busy }; },
    github: githubDeploy,
    cloudflare: cfDeploy,
    _internals: { crc32: crc32, ghApi: ghApi, readJSON: readJSON, writeJSON: writeJSON, LS_GH: LS_GH }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
