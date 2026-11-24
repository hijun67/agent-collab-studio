/* Agent Collab Studio — 모드 전환
 *
 * 🤖 에이전트 협업 (v1.3.0 그대로)  ↔  🎨 4컷만화 · 카드뉴스 (통합 스튜디오)
 * 협업 앱 코드(app.js)는 건드리지 않고, 화면 표시만 바꾼다.
 */
(function () {
  const LS_KEY = 'acs.mode.v1';
  const body = document.body;
  const root = document.getElementById('studioRoot');
  const buttons = Array.prototype.slice.call(document.querySelectorAll('.modebar-btn'));
  const badge = document.getElementById('brandBadge');
  const sub = document.getElementById('missionSub');
  const base = {
    badge: badge ? badge.textContent : '',
    sub: sub ? sub.textContent : ''
  };
  const TEXTS = {
    studio: {
      badge: '4컷만화 · 카드뉴스',
      sub: '기사 본문 이미지 · 본문 기반 AI 이미지 스튜디오'
    }
  };
  let mode = 'agent';
  let studioLoading = false;

  // 스튜디오 모듈은 처음 탭을 열 때 한 번만 불러온다(에이전트 화면만 쓰는 동안 API 호출 0회).
  function loadStudio() {
    if (studioLoading) return;
    studioLoading = true;
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'studio/app.js';
    script.onerror = function () { studioLoading = false; };
    document.head.appendChild(script);
  }

  function paint() {
    const studio = mode === 'studio';
    body.classList.toggle('mode-studio', studio);
    body.classList.toggle('mode-agent', !studio);
    if (root) {
      if (studio) root.removeAttribute('hidden');
      else root.setAttribute('hidden', '');
    }
    buttons.forEach(function (btn) {
      const on = btn.getAttribute('data-mode') === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (badge) badge.textContent = studio ? TEXTS.studio.badge : base.badge;
    if (sub) sub.textContent = studio ? TEXTS.studio.sub : base.sub;
    document.title = studio
      ? '4컷만화 · 카드뉴스 — Agent Collab Studio'
      : 'Agent Collab Studio — 피클 · 제미나이 태스크 · 코덱스';
  }

  function setMode(next, options) {
    mode = next === 'studio' ? 'studio' : 'agent';
    paint();
    try { localStorage.setItem(LS_KEY, mode); } catch (e) { /* 저장 실패는 무시 */ }
    if (!options || options.silent !== true) {
      try { history.replaceState(null, '', mode === 'studio' ? '#studio' : location.pathname + location.search); } catch (e) { /* 무시 */ }
    }
    if (mode === 'studio') {
      loadStudio();
      // 숨어 있던 동안 계산하지 못한 캔버스·레이아웃을 다시 그리게 한다.
      window.dispatchEvent(new Event('resize'));
    }
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
  });

  let saved = 'agent';
  try { saved = localStorage.getItem(LS_KEY) || 'agent'; } catch (e) { saved = 'agent'; }
  if (location.hash === '#studio') saved = 'studio';
  setMode(saved, { silent: true });

  window.__setStudioMode = setMode;
  window.__studioMode = function () { return mode; };
})();
