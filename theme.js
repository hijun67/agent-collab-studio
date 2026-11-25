/* Agent Collab Studio — 다크 / 라이트 모드 토글
 *
 *  - 기본값은 기존 다크 모드. 전환하면 <html data-theme="light|dark"> 로 적용한다.
 *  - 선택은 localStorage('acs.theme.v1')에 저장해 새로고침·재방문에도 유지된다.
 *  - <meta name="theme-color"> 도 테마에 맞춰 바꾼다(모바일 브라우저 상단 바 색).
 *  - 헤더(🤖 협업)와 스튜디오 상단 바(🎨 4컷만화·카드뉴스)의 버튼이 같은 상태를 공유한다.
 *  - 첫 페인트 전 적용은 index.html <head> 인라인 스크립트가 담당한다(FOUC 방지).
 */
(function () {
  var KEY = 'acs.theme.v1';
  var META = { dark: '#060910', light: '#f4f7fb' };
  var root = document.documentElement;
  var buttons = [];

  function normalize(v) { return v === 'light' ? 'light' : 'dark'; }

  function stored() {
    try { return normalize(localStorage.getItem(KEY)); } catch (e) { return 'dark'; }
  }

  function current() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function paint(btn, theme) {
    var light = theme === 'light';
    var label = light ? '라이트' : '다크';
    var next = light ? '다크' : '라이트';
    var icon = btn.querySelector('[data-theme-ico]');
    var txt = btn.querySelector('[data-theme-txt]');
    if (icon) icon.textContent = light ? '☀️' : '🌙';
    if (txt) txt.textContent = label;
    btn.setAttribute('aria-pressed', light ? 'true' : 'false');
    btn.setAttribute('aria-label', '테마: ' + label + ' 모드 · ' + next + ' 모드로 전환');
    btn.setAttribute('title', next + ' 모드로 전환');
    btn.setAttribute('data-theme', theme);
  }

  function apply(theme, persist) {
    theme = normalize(theme);
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META[theme]);
    for (var i = 0; i < buttons.length; i++) paint(buttons[i], theme);
    try {
      document.dispatchEvent(new CustomEvent('acs:theme', { detail: { theme: theme } }));
    } catch (e) { /* CustomEvent 미지원 환경 무시 */ }
    if (persist) {
      try { localStorage.setItem(KEY, theme); } catch (e) { /* 저장 실패는 무시 */ }
    }
    return theme;
  }

  function toggle() {
    return apply(current() === 'light' ? 'dark' : 'light', true);
  }

  function register(btn) {
    if (!btn || buttons.indexOf(btn) >= 0) return;
    buttons.push(btn);
    btn.addEventListener('click', toggle);
    paint(btn, current());
  }

  function init() {
    var list = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < list.length; i++) register(list[i]);
    // 저장값이 있는데 인라인 스크립트가 못 읽은 경우(테스트 등)를 여기서 보정한다.
    if (!root.hasAttribute('data-theme') && stored() === 'light') apply('light', false);
    else apply(current(), false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 다른 탭에서 바꾼 테마도 따라간다.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) apply(normalize(e.newValue), false);
  });

  window.__ACSTheme = {
    key: KEY,
    meta: META,
    get: current,
    set: function (t) { return apply(t, true); },
    toggle: toggle,
    init: init
  };
})();
