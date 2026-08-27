/* ============================================================================
   PRITHVI HOLIDAYS — CORE
   ----------------------------------------------------------------------------
   The single data layer for the public website. Every page reads its content
   from /data/*.json through this module; nothing on the site hard-codes a
   destination, a package, a hero slide or a phone number any more.

   Exposes one global, PH:
     PH.data   loading and caching of the JSON files
     PH.get    lookups (published filters, id lookups, masters, filtering)
     PH.fmt    escaping, formatting, slugs, ids
     PH.el     small DOM helpers

   Preview: the admin keeps unpublished edits in localStorage. They are
   ignored here unless preview mode is explicitly on, so a real visitor never
   sees half-finished work.
   ========================================================================= */
window.PH = (function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────────
     Paths — resolved from this script's own URL so the site works from a
     subfolder without any edits.
     ─────────────────────────────────────────────────────────────────── */
  var BASE = (function () {
    var s = document.currentScript;
    if (s && s.src) { return s.src.replace(/js\/core\.js.*$/, ''); }
    return '';
  }());

  function url(path) { return BASE + String(path || '').replace(/^\/+/, ''); }

  /* ──────────────────────────────────────────────────────────────────────
     Preview mode
     ─────────────────────────────────────────────────────────────────── */
  var PREVIEW_KEY = 'ph.preview';
  var DRAFT_KEY = 'ph.draft.v1';

  function previewOn() {
    try {
      if (/[?&]preview=1/.test(location.search)) { return true; }
      return localStorage.getItem(PREVIEW_KEY) === '1';
    } catch (e) { return false; }
  }

  function draft() {
    if (!previewOn()) { return null; }
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ──────────────────────────────────────────────────────────────────────
     Loading
     ─────────────────────────────────────────────────────────────────── */
  var FILES = {
    settings: 'data/settings.json',
    masters: 'data/masters.json',
    destinations: 'data/destinations.json',
    packages: 'data/packages.json',
    adventures: 'data/adventures.json',
    testimonials: 'data/testimonials.json',
    gallery: 'data/gallery.json',
    faqs: 'data/faqs.json'
  };

  var cache = {};
  var inflight = {};

  function loadJSON(path) {
    if (inflight[path]) { return inflight[path]; }
    inflight[path] = fetch(url(path), { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) { throw new Error(path + ' returned ' + r.status); }
        return r.json();
      })
      .catch(function (err) {
        console.error('[PH] Could not load ' + path, err);
        throw err;
      });
    return inflight[path];
  }

  /* packages.json wraps its array in an object; everything else is bare. */
  function normalise(name, json) {
    if (name === 'packages') { return (json && json.packages) ? json.packages : (json || []); }
    return json;
  }

  /** Load one named collection. In preview mode the draft wins. */
  function one(name) {
    if (cache[name]) { return Promise.resolve(cache[name]); }
    var d = draft();
    var bag = d && (d.data || d);
    if (bag && bag[name] !== undefined) {
      cache[name] = normalise(name, bag[name]);
      return Promise.resolve(cache[name]);
    }
    return loadJSON(FILES[name]).then(function (json) {
      cache[name] = normalise(name, json);
      return cache[name];
    });
  }

  /** Load several at once: PH.data.load('settings', 'packages') */
  function load() {
    var names = Array.prototype.slice.call(arguments);
    return Promise.all(names.map(one)).then(function (results) {
      var out = {};
      names.forEach(function (n, i) { out[n] = results[i]; });
      if (out.masters || out.destinations) { prime(out.masters, out.destinations); }
      return out;
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     Lookups
     ─────────────────────────────────────────────────────────────────── */
  var M = null, DESTS = null;

  function prime(masters, destinations) {
    M = masters || M;
    DESTS = destinations || DESTS;
  }

  /** A master list by key, active rows only, in stored order. */
  function list(key) {
    if (!M || !Array.isArray(M[key])) { return []; }
    return M[key].filter(function (r) { return r.active !== false; });
  }

  /** Find any master row by id, across every list. */
  function master(id) {
    if (!id || !M) { return null; }
    var keys = Object.keys(M);
    for (var i = 0; i < keys.length; i++) {
      var rows = M[keys[i]];
      if (!Array.isArray(rows)) { continue; }
      for (var j = 0; j < rows.length; j++) {
        if (rows[j] && rows[j].id === id) { return rows[j]; }
      }
    }
    return null;
  }

  function label(id, fallback) {
    var row = master(id);
    return row ? row.name : (fallback || '');
  }

  function destination(id) {
    if (!DESTS) { return null; }
    for (var i = 0; i < DESTS.length; i++) {
      if (DESTS[i].id === id) { return DESTS[i]; }
    }
    return null;
  }

  function destName(id) {
    var d = destination(id);
    return d ? d.name : '';
  }

  /** Published rows only, in sort order. */
  function published(rows) {
    return (rows || [])
      .filter(function (r) { return r.published !== false; })
      .slice()
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
  }

  function byId(rows, id) {
    var all = rows || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id || all[i].slug === id) { return all[i]; }
    }
    return null;
  }

  /**
   * Filter packages. Every criterion is optional, so the same function
   * serves the grid, the search box and the destination page.
   */
  function filterPackages(packages, opts) {
    var o = opts || {};
    var q = (o.q || '').trim().toLowerCase();

    return (packages || []).filter(function (p) {
      if (o.categoryId && p.categoryId !== o.categoryId) { return false; }
      if (o.destinationId && p.destinationId !== o.destinationId) { return false; }
      if (o.featured && !p.featured) { return false; }
      if (q) {
        var hay = [
          p.name, p.shortDescription, p.description, p.duration,
          destName(p.destinationId), label(p.categoryId),
          (p.highlights || []).join(' ')
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) { return false; }
      }
      return true;
    });
  }

  function filterDestinations(destinations, opts) {
    var o = opts || {};
    var q = (o.q || '').trim().toLowerCase();

    return (destinations || []).filter(function (d) {
      if (o.regionId && d.regionId !== o.regionId) { return false; }
      if (o.featured && !d.featured) { return false; }
      if (q) {
        var hay = [d.name, d.region, d.state, d.shortDescription, d.description]
          .join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) { return false; }
      }
      return true;
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     Formatting
     ─────────────────────────────────────────────────────────────────── */

  /** Escape anything out of JSON before it touches innerHTML. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Settings copy was migrated straight out of the original HTML, so some
   * fields legitimately carry entities and the odd inline tag ("Kerala
   * &amp; Tamil Nadu", "Years exploring<br>…"). These fields are authored by
   * the site owner in the admin, never by a visitor, so a narrow allow-list
   * of inline tags plus named/numeric entities is safe — and it keeps the
   * original wording rendering exactly as it always did.
   *
   * Everything not on the allow-list is still escaped, so a stray "<script>"
   * in a description is inert.
   */
  var INLINE_OK = /<\/?(?:br|em|b|strong|i|small|span)\s*\/?>/gi;
  var ENTITY_OK = /&(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,6}|#x[0-9a-fA-F]{1,6});/g;

  function rich(s) {
    var text = String(s == null ? '' : s);
    var stash = [];

    function keep(match) {
      stash.push(match);
      return '\u0000' + (stash.length - 1) + '\u0000';
    }

    text = text.replace(INLINE_OK, keep).replace(ENTITY_OK, keep);
    text = esc(text);
    return text.replace(/\u0000(\d+)\u0000/g, function (_, i) { return stash[Number(i)]; });
  }

  /** Blank-line separated text into paragraphs. */
  function paras(text, cls) {
    var c = cls ? ' class="' + esc(cls) + '"' : '';
    return String(text || '').split(/\n{2,}/).filter(Boolean)
      .map(function (t) { return '<p' + c + '>' + esc(t).replace(/\n/g, '<br>') + '</p>'; })
      .join('');
  }

  var rupee = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0
  });

  function money(n) {
    var v = Number(n);
    if (!isFinite(v) || v <= 0) { return ''; }
    return rupee.format(v);
  }

  function slugify(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  }

  function id(prefix) {
    var out = prefix ? prefix + '-' : '';
    var chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    for (var i = 0; i < 8; i++) { out += chars[Math.floor(Math.random() * 36)]; }
    return out;
  }

  /* ──────────────────────────────────────────────────────────────────────
     Images
     ----------------------------------------------------------------------
     Content may store a site-relative path (images/hampi.jpg), a bare
     filename (dropped into uploads/) or a full URL. All three resolve here.
     ─────────────────────────────────────────────────────────────────── */
  function img(src) {
    if (!src) { return ''; }
    if (/^(https?:)?\/\//.test(src) || src.indexOf('data:') === 0) { return src; }
    if (src.indexOf('/') !== -1) { return url(src); }
    return url('uploads/' + src);
  }

  /** A background-image style value, safely quoted. */
  function bg(src) {
    return "background-image:url('" + img(src).replace(/'/g, '%27') + "')";
  }

  /* ──────────────────────────────────────────────────────────────────────
     DOM helpers
     ─────────────────────────────────────────────────────────────────── */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function param(name) { return new URLSearchParams(location.search).get(name); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  /** Set text/HTML on every node matching a selector, if any exist. */
  function fill(sel, html, root) {
    qsa(sel, root).forEach(function (n) { n.innerHTML = html; });
  }

  /**
   * Opening a page straight off the disk blocks fetch, so nine identical
   * CORS errors scroll past and the visitor stares at an empty layout.
   * Say so once, clearly, instead.
   */
  function fileProtocolCheck() {
    if (location.protocol !== 'file:') { return false; }
    var box = document.createElement('div');
    box.setAttribute('style',
      'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;' +
      'background:#f5fafe;padding:24px;font-family:Outfit,system-ui,sans-serif');
    box.innerHTML =
      '<div style="max-width:540px;text-align:center;color:#0a2540">' +
      '<h1 style="font-family:Fraunces,Georgia,serif;font-size:1.6rem;margin:0 0 12px">' +
      'This site needs a local web server</h1>' +
      '<p style="color:#41607c;line-height:1.7;font-weight:300">The pages read their content ' +
      'from JSON files, and browsers block those requests when a page is opened directly from ' +
      'the disk.</p>' +
      '<p style="color:#41607c;line-height:1.7;font-weight:300">Run <code style="background:' +
      '#e9f4fc;padding:2px 7px;border-radius:5px">python -m http.server 8000</code> in the ' +
      'project folder, then open <code style="background:#e9f4fc;padding:2px 7px;' +
      'border-radius:5px">http://localhost:8000/</code></p></div>';
    document.body.appendChild(box);
    return true;
  }

  /* ──────────────────────────────────────────────────────────────────────
     Public shape
     ─────────────────────────────────────────────────────────────────── */
  return {
    BASE: BASE,
    url: url,
    data: {
      load: load,
      one: one,
      raw: loadJSON,
      cache: cache,
      previewOn: previewOn,
      PREVIEW_KEY: PREVIEW_KEY,
      DRAFT_KEY: DRAFT_KEY
    },
    prime: prime,
    get: {
      list: list,
      master: master,
      label: label,
      destination: destination,
      destName: destName,
      published: published,
      byId: byId,
      filterPackages: filterPackages,
      filterDestinations: filterDestinations
    },
    fmt: {
      esc: esc, rich: rich, paras: paras, money: money,
      slugify: slugify, id: id
    },
    img: img,
    bg: bg,
    qs: qs, qsa: qsa, fill: fill, param: param, debounce: debounce,
    fileProtocolCheck: fileProtocolCheck
  };
}());
