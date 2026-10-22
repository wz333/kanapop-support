// The site's language switch: English, simplified and traditional Chinese.
//
// A page sets window.KP_STRINGS = { en: {...}, 'zh-Hans': {...}, 'zh-Hant':
// {...} } before loading this, marks text with data-i18n="key" (text) or
// data-i18n-html="key" (its own markup only, never data from elsewhere), and
// puts an empty <div data-lang-switch></div> where the switch goes. Strings
// every page shares are below; a page's own win.
//
// The choice carries from page to page through localStorage. Where storage
// is unavailable (some private modes), it rides along as ?lang= on the
// site's own links instead.
(function () {
  var LANGS = ['en', 'zh-Hans', 'zh-Hant'];
  var LABELS = { 'en': 'EN', 'zh-Hans': '简体', 'zh-Hant': '繁體' };
  var STORE_KEY = 'kanapop.lang';
  var COMMON = {
    'en': {
      back: '← Back',
      language: 'Language',
      coffeeTitle: 'Buy me a coffee',
      coffeeBody: 'KanaPop is free. If it helped you learn some kana and you feel like saying thanks, a coffee would make my day <3',
      coffeeLink: 'Buy me a coffee →'
    },
    'zh-Hans': {
      back: '← 返回',
      language: '语言',
      coffeeTitle: '请我喝杯咖啡',
      coffeeBody: 'Kana Pop 完全免费。如果它帮你记住了一些假名，想表示感谢的话，一杯咖啡会让我开心一整天 <3',
      coffeeLink: '请我喝杯咖啡 →'
    },
    'zh-Hant': {
      back: '← 返回',
      language: '語言',
      coffeeTitle: '請我喝杯咖啡',
      coffeeBody: 'Kana Pop 完全免費。如果它幫你記住了一些假名，想表示感謝的話，一杯咖啡會讓我開心一整天 <3',
      coffeeLink: '請我喝杯咖啡 →'
    }
  };
  var page = window.KP_STRINGS || {};
  var listeners = [];
  var storageWorks = true;

  function load() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { storageWorks = false; return null; }
  }
  function save(value) {
    try { localStorage.setItem(STORE_KEY, value); } catch (e) { storageWorks = false; }
  }

  // ?lang= wins, then the visitor's earlier pick, then the browser. Chinese
  // splits on script, not region: Hong Kong, Macau and Taiwan read
  // traditional.
  function detect() {
    var param = new URLSearchParams(location.search).get('lang');
    if (LANGS.indexOf(param) >= 0) { save(param); return param; }
    var saved = load();
    if (LANGS.indexOf(saved) >= 0) return saved;
    var prefs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < prefs.length; i++) {
      var tag = (prefs[i] || '').toLowerCase();
      if (tag.indexOf('zh') === 0) return /hant|-tw|-hk|-mo/.test(tag) ? 'zh-Hant' : 'zh-Hans';
      if (tag.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }

  var lang = detect();

  function t(key, vars) {
    var tables = [page[lang], COMMON[lang], page.en, COMMON.en];
    var text = key;
    for (var i = 0; i < tables.length; i++) {
      if (tables[i] && key in tables[i]) { text = tables[i][key]; break; }
    }
    for (var k in (vars || {})) text = text.split('{' + k + '}').join(vars[k]);
    return text;
  }

  // The site's own links, which carry ?lang= when storage cannot.
  function isOwnLink(a) {
    var href = a.getAttribute('href') || '';
    return href && !/^(https?:|mailto:|#)/.test(href);
  }

  function apply() {
    document.documentElement.lang = lang;
    if (t('pageTitle') !== 'pageTitle') document.title = t('pageTitle');
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('.lang').forEach(function (group) {
      group.setAttribute('aria-label', t('language'));
      group.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
      });
    });
    if (!storageWorks) {
      document.querySelectorAll('a').forEach(function (a) {
        if (!isOwnLink(a)) return;
        var url = new URL(a.getAttribute('href'), location.href);
        url.searchParams.set('lang', lang);
        a.href = url.href;
      });
    }
    listeners.forEach(function (fn) { fn(lang); });
  }

  function choose(next) {
    lang = next;
    save(lang);
    // A ?lang= link follows the switch, or a reload would undo it.
    var url = new URL(location.href);
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', lang);
      history.replaceState(null, '', url);
    }
    apply();
  }

  var style = document.createElement('style');
  style.textContent = [
    '.topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }',
    '.topbar .back-link { margin-bottom: 0; }',
    '.topbar.end { justify-content: flex-end; }',
    '.lang { display: inline-flex; border: 2.5px solid var(--ink); border-radius: 999px; overflow: hidden; background: var(--card-paper); flex-shrink: 0; }',
    '.lang button { font: inherit; font-size: 0.85rem; font-weight: 600; color: var(--ink); background: transparent; border: none; padding: 0.3rem 0.8rem; cursor: pointer; }',
    '.lang button + button { border-left: 2px solid var(--ink); }',
    '.lang button[aria-pressed="true"] { background: var(--pink); color: var(--on-bright); }'
  ].join('\n');
  document.head.appendChild(style);

  // Each language named in itself, as in the app's own picker.
  document.querySelectorAll('[data-lang-switch]').forEach(function (slot) {
    var group = document.createElement('div');
    group.className = 'lang';
    group.setAttribute('role', 'group');
    LANGS.forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.lang = code;
      b.setAttribute('data-lang', code);
      b.textContent = LABELS[code];
      b.addEventListener('click', function () { choose(code); });
      group.appendChild(b);
    });
    slot.replaceWith(group);
  });

  window.KP = {
    t: t,
    get lang() { return lang; },
    onChange: function (fn) { listeners.push(fn); }
  };
  apply();
})();
