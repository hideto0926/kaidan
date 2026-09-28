// 言語切り替え・スクロール演出など（three.js 以外）
(function () {
  var root = document.documentElement;

  function setLang(lang) {
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang);
    try { localStorage.setItem('lang', lang); } catch (e) {}
    var url = new URL(location.href);
    url.searchParams.set('lang', lang);
    history.replaceState(null, '', url);
    document.querySelectorAll('a[href$=".html"], a[href*=".html?"]').forEach(function (a) {
      var u = new URL(a.getAttribute('href'), location.href);
      u.searchParams.set('lang', lang);
      a.setAttribute('href', u.pathname.split('/').pop() + u.search + u.hash);
    });
  }

  document.querySelectorAll('.lang-toggle .opt').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      setLang(el.getAttribute('data-set'));
    });
  });
  var toggle = document.querySelector('.lang-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      setLang(root.getAttribute('data-lang') === 'ja' ? 'en' : 'ja');
    });
  }
  setLang(root.getAttribute('data-lang') || 'ja');

  // スクロールで浮かび上がる
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.15 }) : null;
  document.querySelectorAll('.reveal').forEach(function (el) {
    if (io) io.observe(el); else el.classList.add('in');
  });

  var y = document.querySelector('.year');
  if (y) y.textContent = new Date().getFullYear();

  var nav = document.querySelector('.nav');
  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('solid', window.scrollY > 40);
  }, { passive: true });
})();
