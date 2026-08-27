/* ===== Prithvi Holidays shared scripts =====
   Same behaviour as before the CMS conversion — loader, sticky nav, reveal
   on scroll, skill bars, stat counters, newsletter, back-to-top.

   The one change: because sections are now rendered from JSON *after* the
   document is ready, each effect is exposed on window.FX so a page can
   re-apply it to freshly inserted markup. Elements are only ever bound once,
   so calling these repeatedly is safe.
   ========================================================================= */
window.FX = (function () {
  'use strict';

  var SEEN = 'fxBound';

  /* ── reveal on scroll ───────────────────────────────────────────────── */
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
    });
  }, { threshold: 0.12 });

  function reveal(root) {
    (root || document).querySelectorAll('.reveal').forEach(function (el) {
      if (el.dataset[SEEN]) { return; }
      el.dataset[SEEN] = '1';
      if (el.classList.contains('in')) { return; }
      revealIO.observe(el);
    });
  }

  /* ── skill bars ─────────────────────────────────────────────────────── */
  var skillIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.style.width = e.target.dataset.fill + '%';
        skillIO.unobserve(e.target);
      }
    });
  }, { threshold: 0.4 });

  function skills(root) {
    (root || document).querySelectorAll('.fill').forEach(function (el) {
      if (el.dataset[SEEN]) { return; }
      el.dataset[SEEN] = '1';
      skillIO.observe(el);
    });
  }

  /* ── stat counters ──────────────────────────────────────────────────── */
  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) { return; }
      var el = e.target, to = +el.dataset.to, suf = el.dataset.suf || '', t = Date.now();
      (function tick() {
        var p = Math.min((Date.now() - t) / 1600, 1);
        var v = Math.floor((1 - Math.pow(1 - p, 3)) * to);
        el.textContent = (to >= 10000 ? (v / 1000).toFixed(p < 1 ? 1 : 0) + 'k' : v.toLocaleString()) + suf;
        if (p < 1) { requestAnimationFrame(tick); }
        else { el.textContent = (to >= 10000 ? (to / 1000) + 'k' : to.toLocaleString()) + suf; }
      }());
      countIO.unobserve(el);
    });
  }, { threshold: 0.5 });

  function counters(root) {
    (root || document).querySelectorAll('.n[data-to]').forEach(function (el) {
      if (el.dataset[SEEN]) { return; }
      el.dataset[SEEN] = '1';
      countIO.observe(el);
    });
  }

  /* ── navbar: scrolled state + mobile toggle ─────────────────────────── */
  function nav() {
    var bar = document.querySelector('.navbar');
    if (bar && !bar.dataset[SEEN]) {
      bar.dataset[SEEN] = '1';
      var onScroll = function () { bar.classList.toggle('scrolled', window.scrollY > 40); };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    var toggle = document.querySelector('.nav-toggle');
    var menu = document.querySelector('.nav-menu');
    if (!toggle || !menu || toggle.dataset[SEEN]) { return; }
    toggle.dataset[SEEN] = '1';

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.classList.toggle('x', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        menu.classList.remove('open');
        toggle.classList.remove('x');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ── newsletter ─────────────────────────────────────────────────────── */
  function newsletter() {
    var btn = document.getElementById('newsBtn');
    if (!btn || btn.dataset[SEEN]) { return; }
    btn.dataset[SEEN] = '1';

    var input = document.getElementById('newsEmail');
    var ok = document.getElementById('newsOk');
    var go = function () {
      if (/\S+@\S+\.\S+/.test(input.value)) {
        ok.style.display = 'block';
        input.value = '';
        setTimeout(function () { ok.style.display = 'none'; }, 4000);
      } else { input.focus(); }
    };
    btn.addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { go(); } });
  }

  /* ── back to top ────────────────────────────────────────────────────── */
  function toTop() {
    var btn = document.querySelector('.to-top');
    if (!btn || btn.dataset[SEEN]) { return; }
    btn.dataset[SEEN] = '1';
    window.addEventListener('scroll', function () {
      btn.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ── loader ─────────────────────────────────────────────────────────── */
  function loader() {
    var box = document.getElementById('loader');
    if (!box) { return; }
    var done = function () { setTimeout(function () { box.classList.add('done'); }, 500); };
    if (document.readyState === 'complete') { done(); }
    else { window.addEventListener('load', done); }
  }

  /** Apply everything to a freshly rendered region (or the whole page). */
  function all(root) {
    reveal(root);
    skills(root);
    counters(root);
    nav();
    newsletter();
    toTop();
  }

  function start() {
    loader();
    all(document);
    var yr = document.getElementById('year');
    if (yr) { yr.textContent = new Date().getFullYear(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }

  return {
    reveal: reveal, skills: skills, counters: counters,
    nav: nav, newsletter: newsletter, toTop: toTop, loader: loader, all: all
  };
}());
