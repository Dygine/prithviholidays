/* ==========================================================================
   PRITHVI HOLIDAYS — ADMIN UI (AUI)
   Everything reusable: the shell, modals, toasts, confirmations, field
   binding, validation, repeater lists, drag-to-reorder, the media picker
   and the publish bar.

   Screens (admin.js) compose these. No screen builds a modal by hand and no
   screen touches the Store's internals.
   ========================================================================== */
window.AUI = (function () {
  'use strict';

  var mode = { api: false, configured: false, repo: '', branch: '' };
  var openModal = null;

  /* ── A. Tiny helpers ───────────────────────────────────────────────── */

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) { return; }
        if (k === 'class') { node.className = v; }
        else if (k === 'html') { node.innerHTML = v; }
        else if (k === 'text') { node.textContent = v; }
        else if (k === 'dataset') { Object.assign(node.dataset, v); }
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else { node.setAttribute(k, v); }
      });
    }
    (kids || []).filter(Boolean).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Content migrated from the original HTML carries entities and the odd
   * <br>. Admin lists show that copy as plain readable text, so decode it
   * for display rather than showing "Kerala &amp; Tamil Nadu" in a table.
   */
  function plain(s) {
    var box = document.createElement('textarea');
    box.innerHTML = String(s == null ? '' : s).replace(/<br\s*\/?>/gi, ' ');
    return box.value.replace(/<[^>]+>/g, '');
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

  function money(n) {
    var v = Number(n);
    if (!isFinite(v) || v <= 0) { return '—'; }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(v);
  }

  function niceDate(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d)) { return String(iso); }
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function relTime(iso) {
    if (!iso) { return 'a moment ago'; }
    var diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) { return String(iso); }
    var mins = Math.round(diff / 60000);
    if (mins < 1) { return 'just now'; }
    if (mins < 60) { return mins + (mins === 1 ? ' minute ago' : ' minutes ago'); }
    var hrs = Math.round(mins / 60);
    if (hrs < 24) { return hrs + (hrs === 1 ? ' hour ago' : ' hours ago'); }
    var days = Math.round(hrs / 24);
    if (days < 30) { return days + (days === 1 ? ' day ago' : ' days ago'); }
    return niceDate(iso);
  }

  /* ── B. Icons — one inline set, no icon library loaded ──────────────── */

  var PATHS = {
    dashboard: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    package: '<path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5.5-5.5 2 2-5.5 5.5-2Z"/>',
    quote: '<path d="M8 7H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 1-2 2M18 7h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 1-2 2"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2A2.6 2.6 0 0 1 14.5 10c0 1.7-2.5 2.1-2.5 3.8M12 17h.01"/>',
    inbox: '<path d="M21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5"/><path d="M3 13h4l1.6 2.4h6.8L17 13h4L18.5 5.4A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1.4L3 13Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
    masters: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12 14.6l-4 1 1-4 9.4-9Z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-.9 13a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 6"/><path d="M10 11v6M14 11v6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3 3.7M6.6 6.7A17 17 0 0 0 2 12.5S5.6 19 12 19a9.7 9.7 0 0 0 4.4-1M2 2l20 20"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5M12 4v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 11l5 5 5-5M12 16V4"/>',
    cloud: '<path d="M17.5 19H7a5 5 0 0 1-.5-10 7 7 0 0 1 13.3 2.2A4.4 4.4 0 0 1 17.5 19Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    star: '<path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9L12 3.5Z"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 4v4h-4M3 20v-4h4"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="m2 7 10 6 10-6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>'
  };

  function icon(name, size) {
    var p = PATHS[name];
    if (!p) { return ''; }
    var s = size || 17;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* ── C. Shell: sidebar and topbar ──────────────────────────────────── */

  var NAV = [
    { href: 'dashboard.html', label: 'Dashboard', ico: 'dashboard' },
    { group: 'Content' },
    { href: 'settings.html', label: 'Home &amp; Settings', ico: 'settings' },
    { href: 'destinations.html', label: 'Destinations', ico: 'pin', count: 'destinations' },
    { href: 'packages.html', label: 'Packages', ico: 'package', count: 'packages' },
    { href: 'adventures.html', label: 'Adventures', ico: 'compass', count: 'adventures' },
    { href: 'testimonials.html', label: 'Testimonials', ico: 'quote', count: 'testimonials' },
    { href: 'gallery.html', label: 'Gallery', ico: 'image', count: 'gallery' },
    { href: 'faqs.html', label: 'FAQs', ico: 'help', count: 'faqs' },
    { group: 'Communication' },
    { href: 'enquiries.html', label: 'Enquiries', ico: 'inbox', count: 'newEnquiries' },
    { group: 'System' },
    { href: 'masters.html', label: 'Lists &amp; Categories', ico: 'masters' },
    { href: '../index.html', label: 'View Website', ico: 'external', blank: true }
  ];

  function renderShell(active, title, subtitle) {
    var s = Store.stats();

    var nav = NAV.map(function (n) {
      if (n.group) { return '<div class="side__group">' + esc(n.group) + '</div>'; }
      var isOn = n.href === active;
      var count = n.count ? s[n.count] : null;
      return '<a class="side__link" href="' + esc(n.href) + '"' +
        (isOn ? ' aria-current="page"' : '') +
        (n.blank ? ' target="_blank" rel="noopener"' : '') + '>' +
        icon(n.ico, 17) + '<span>' + n.label + '</span>' +
        (count ? '<span class="side__count">' + count + '</span>' : '') + '</a>';
    }).join('');

    var side = qs('.side');
    side.innerHTML =
      '<div class="side__brand">' +
        '<img src="../images/logo.png" alt="">' +
        '<span class="side__brand-t"><b>Prithvi Holidays</b><span>Content manager</span></span>' +
      '</div>' +
      '<nav class="side__nav" aria-label="Admin sections">' + nav + '</nav>' +
      '<div class="side__foot">' +
        '<div class="side__status' + (mode.configured ? '' : ' is-local') + '">' +
          '<span class="dot"></span><span>' +
          (mode.configured
            ? 'Publishing to ' + esc(mode.repo || 'GitHub')
            : (mode.mode === 'local' ? 'Passcode locked · local draft' : 'Local draft only')) +
          '</span></div>' +
        '<button class="side__logout" type="button" data-logout>' +
          icon('logout', 16) + 'Sign out</button>' +
      '</div>';

    var top = qs('.top');
    if (top) {
      var box = qs('.top__title', top);
      if (box) {
        box.innerHTML = '<b>' + esc(title) + '</b><span>' + esc(subtitle || '') + '</span>';
      }
    }

    qs('[data-logout]').addEventListener('click', function () {
      confirmDialog({
        title: 'Sign out?',
        body: Store.isDirty()
          ? 'You have unpublished changes. They stay saved in this browser and will be waiting when you sign back in.'
          : 'You will need the site password to get back in.',
        confirmLabel: 'Sign out',
        danger: false
      }).then(function (ok) {
        if (!ok) { return; }
        Store.logout();
        location.href = 'index.html';
      });
    });

    var burger = qs('.top__burger');
    if (burger) {
      burger.addEventListener('click', function () {
        document.body.classList.toggle('side-open');
      });
    }
    var scrim = qs('.side__scrim');
    if (scrim) {
      scrim.addEventListener('click', function () {
        document.body.classList.remove('side-open');
      });
    }
    qsa('.side__link').forEach(function (a) {
      a.addEventListener('click', function () { document.body.classList.remove('side-open'); });
    });
  }

  /**
   * Every admin page calls this first: check the session, load the data,
   * draw the shell, then hand control back to the screen.
   */
  function guard(active, title, subtitle) {
    return Store.authMode().then(function (st) {
      mode = st;

      /* Every screen checks the gate, not just the first one — otherwise
         typing a URL straight to dashboard.html would walk right past it. */
      if (st.mode !== 'open' && !Store.isAuthed()) {
        location.replace('index.html?next=' +
          encodeURIComponent(location.pathname.split('/').pop() + location.search));
        return new Promise(function () {});   // stop the chain; the page is leaving
      }

      return Store.boot().then(function (info) {
        renderShell(active, title, subtitle);
        mountPublishBar();
        if (info.hasDraft) {
          setPubState('dirty', 'Unpublished changes from ' + relTime(info.draftAt));
        }
        return info;
      });
    }).catch(function (err) {
      document.body.innerHTML =
        '<div style="max-width:580px;margin:16vh auto;padding:26px;font-family:system-ui,sans-serif">' +
        '<h1 style="font-size:1.3rem;margin:0 0 10px">The admin could not load its data</h1>' +
        '<p style="color:#5B6B6E;line-height:1.6">' + esc(err.message) + '</p>' +
        '<p style="color:#5B6B6E;line-height:1.6">If you opened this file directly from the disk, ' +
        'browsers block the requests it needs. Serve the folder over HTTP instead — for example ' +
        '<code>python -m http.server 8000</code> from the site root, then open ' +
        '<code>http://localhost:8000/admin/</code>.</p></div>';
      throw err;
    });
  }

  function isConfigured() { return mode.configured; }
  function modeInfo() { return mode; }

  /* ── D. Toasts ─────────────────────────────────────────────────────── */

  function toastHost() {
    var h = qs('.toasts');
    if (!h) {
      h = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(h);
    }
    return h;
  }

  function toast(title, body, kind, ms) {
    var ico = (kind === 'err' || kind === 'warn') ? 'warn' : 'check';
    var node = el('div', { class: 'toast' + (kind ? ' toast--' + kind : '') });
    node.innerHTML = '<span class="toast__ico">' + icon(ico, 17) + '</span>' +
      '<div class="toast__t"><b>' + esc(title) + '</b>' +
      (body ? '<span>' + esc(body) + '</span>' : '') + '</div>';

    var close = el('button', {
      class: 'toast__x', type: 'button', 'aria-label': 'Dismiss',
      html: icon('x', 14), onclick: function () { kill(); }
    });
    node.appendChild(close);
    toastHost().appendChild(node);
    requestAnimationFrame(function () { node.classList.add('is-in'); });

    var timer = setTimeout(kill, ms || 4200);
    function kill() {
      clearTimeout(timer);
      node.classList.remove('is-in');
      setTimeout(function () { node.remove(); }, 240);
    }
    return { close: kill };
  }

  /* ── E. Modal, confirm ─────────────────────────────────────────────── */

  function modal(opts) {
    close();

    var box = el('div', { class: 'modal__box' + (opts.size ? ' modal__box--' + opts.size : '') });
    box.innerHTML =
      '<div class="modal__head"><div><h3>' + esc(opts.title) + '</h3>' +
      (opts.subtitle ? '<p>' + esc(opts.subtitle) + '</p>' : '') + '</div>' +
      '<button class="modal__x" type="button" data-close aria-label="Close">' +
      icon('x', 17) + '</button></div>' +
      '<div class="modal__body"></div><div class="modal__foot"></div>';

    var wrap = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [box]);
    var body = qs('.modal__body', box);
    var foot = qs('.modal__foot', box);

    if (typeof opts.body === 'string') { body.innerHTML = opts.body; }
    else if (opts.body) { body.appendChild(opts.body); }

    (opts.buttons || []).forEach(function (b) {
      foot.appendChild(el('button', {
        class: 'btn ' + (b.class || 'btn--ghost'),
        type: 'button',
        html: (b.icon ? icon(b.icon, 16) : '') + esc(b.label),
        onclick: function () { if (b.onClick) { b.onClick(api); } else { close(); } }
      }));
    });
    if (!foot.children.length) { foot.remove(); }

    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('is-open'); });

    var prevFocus = document.activeElement;
    var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
      'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    setTimeout(function () {
      var first = qs(opts.focus || FOCUSABLE, box);
      if (first) { first.focus(); }
    }, 60);

    /* Trap focus inside the dialog — a modal you can tab out of is not one. */
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') { return; }
      var f = qsa(FOCUSABLE, box).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) { return; }
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }

    function close() {
      if (!openModal) { return; }
      var w = openModal.wrap;
      document.removeEventListener('keydown', openModal.onKey);
      w.classList.remove('is-open');
      setTimeout(function () { w.remove(); }, 230);
      if (openModal.prevFocus && openModal.prevFocus.focus) { openModal.prevFocus.focus(); }
      openModal = null;
      if (opts.onClose) { opts.onClose(); }
    }

    qs('[data-close]', box).addEventListener('click', close);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) { close(); } });
    document.addEventListener('keydown', onKey);

    var api = {
      close: close, body: body, foot: foot, box: box,
      qs: function (s) { return qs(s, box); }
    };
    openModal = { wrap: wrap, onKey: onKey, prevFocus: prevFocus };
    return api;
  }

  function closeModal() { if (openModal) { qs('[data-close]', openModal.wrap).click(); } }

  /** A confirmation that resolves false when dismissed any way at all. */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(v) {
        if (settled) { return; }
        settled = true;
        resolve(v);
      }
      modal({
        title: opts.title || 'Are you sure?',
        size: 'sm',
        body: '<p class="soft small" style="line-height:1.65">' +
          (opts.bodyHtml || esc(opts.body || '')) + '</p>',
        onClose: function () { finish(false); },
        buttons: [
          {
            label: opts.cancelLabel || 'Cancel', class: 'btn--ghost',
            onClick: function (a) { finish(false); a.close(); }
          },
          {
            label: opts.confirmLabel || 'Confirm',
            class: opts.danger === false ? 'btn--primary' : 'btn--danger',
            onClick: function (a) { finish(true); a.close(); }
          }
        ]
      });
    });
  }

  /* ── F. Field binding and validation ───────────────────────────────── */

  /**
   * Bind an input to an object property. Writes on input, so the Store's
   * autosave picks it up without any explicit "save" step.
   */
  function bind(input, obj, key, opts) {
    opts = opts || {};
    if (!input) { return; }
    var isCheck = input.type === 'checkbox';
    var val = obj[key];

    if (isCheck) { input.checked = !!val; }
    else { input.value = (val === null || val === undefined) ? '' : val; }

    var evt = (isCheck || input.tagName === 'SELECT') ? 'change' : 'input';
    input.addEventListener(evt, function () {
      var v = isCheck ? input.checked : input.value;
      if (opts.cast === 'number') { v = v === '' ? 0 : Number(v); }
      if (opts.cast === 'numberOrNull') { v = v === '' ? null : Number(v); }
      if (opts.trim && typeof v === 'string') { v = v.trim(); }
      obj[key] = v;
      if (opts.onChange) { opts.onChange(v); }
      Store.saveData();
    });
  }

  var RULES = {
    required: function (v) { return String(v).trim() ? null : 'is needed'; },
    email: function (v) {
      return !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
        ? null : 'does not look like an email address';
    },
    phone: function (v) {
      return !v || String(v).replace(/[^\d]/g, '').length >= 8
        ? null : 'does not look like a phone number';
    },
    url: function (v) {
      if (!v || v === '#') { return null; }
      return /^(https?:\/\/|mailto:|tel:|\/|[\w-]+\.html)/.test(v)
        ? null : 'should be a full web address starting with https://';
    },
    number: function (v) { return v === '' || !isNaN(Number(v)) ? null : 'must be a number'; },
    positive: function (v) { return v === '' || Number(v) >= 0 ? null : 'cannot be negative'; },
    slug: function (v) {
      return !v || /^[a-z0-9-]+$/.test(v)
        ? null : 'can only use lowercase letters, numbers and hyphens';
    }
  };

  /** Validate every [data-rules] input inside root. Returns the problems. */
  function validate(root) {
    var problems = [];
    qsa('[data-rules]', root).forEach(function (inp) {
      var field = inp.closest('.field') || inp.parentNode;
      var box = qs('.err', field);
      var name = inp.dataset.label || 'This field';
      var msg = null;

      inp.dataset.rules.split('|').forEach(function (r) {
        if (msg || !RULES[r]) { return; }
        var m = RULES[r](inp.type === 'checkbox' ? inp.checked : inp.value);
        if (m) { msg = name + ' ' + m + '.'; }
      });

      inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (box) {
        box.textContent = msg || '';
        box.classList.toggle('show', !!msg);
      }
      if (msg) { problems.push({ input: inp, message: msg, panel: inp.closest('.panel') }); }
    });
    return problems;
  }

  /* ── G. Repeater — a reorderable list of plain strings ──────────────── */

  function repeater(host, arr, opts) {
    opts = opts || {};
    var multiline = !!opts.multiline;

    function paint() {
      host.innerHTML = '';
      if (!arr.length) {
        host.appendChild(el('div', { class: 'rep__empty', text: opts.empty || 'Nothing here yet.' }));
      }

      arr.forEach(function (val, i) {
        var input = el(multiline ? 'textarea' : 'input', {
          class: multiline ? 'textarea' : 'input',
          placeholder: opts.placeholder || '',
          rows: multiline ? 2 : null,
          'aria-label': (opts.addLabel || 'Item') + ' ' + (i + 1)
        });
        input.value = val;
        input.addEventListener('input', function () { arr[i] = input.value; Store.saveData(); });

        host.appendChild(el('div', { class: 'rep__row', draggable: 'true', 'data-i': i }, [
          el('span', { class: 'rep__grip', html: icon('grip', 15), title: 'Drag to reorder' }),
          input,
          el('button', {
            class: 'rep__del', type: 'button', title: 'Remove', 'aria-label': 'Remove item',
            html: icon('trash', 15),
            onclick: function () {
              arr.splice(i, 1);
              Store.saveData(true);
              paint();
              if (opts.onChange) { opts.onChange(); }
            }
          })
        ]));
      });

      host.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm rep__add', type: 'button',
        html: icon('plus', 15) + (opts.addLabel ? 'Add ' + opts.addLabel.toLowerCase() : 'Add another'),
        onclick: function () {
          arr.push('');
          Store.saveData(true);
          paint();
          var inputs = qsa('.rep__row .input, .rep__row .textarea', host);
          if (inputs.length) { inputs[inputs.length - 1].focus(); }
          if (opts.onChange) { opts.onChange(); }
        }
      }));

      sortable(host, '.rep__row', function (from, to) {
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        Store.saveData(true);
        paint();
        if (opts.onChange) { opts.onChange(); }
      });
    }

    paint();
    return { repaint: paint };
  }

  /** Fill a <select> from a master list. */
  function masterSelect(sel, list, value, opts) {
    opts = opts || {};
    if (!sel) { return; }
    sel.innerHTML = '<option value="">' + esc(opts.placeholder || '— none —') + '</option>' +
      list.map(function (r) {
        return '<option value="' + esc(r.id) + '"' + (r.id === value ? ' selected' : '') + '>' +
          esc(plain(r.name)) + '</option>';
      }).join('');
  }

  /* ── H. Drag to reorder ────────────────────────────────────────────── */

  function sortable(host, selector, onMove) {
    if (host.dataset.sortable) { return; }
    host.dataset.sortable = '1';
    var dragging = null;

    function items() { return qsa(selector, host); }
    function indexOf(node) { return items().indexOf(node); }

    host.addEventListener('dragstart', function (e) {
      var row = e.target.closest(selector);
      if (!row || !host.contains(row)) { return; }
      dragging = row;
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(indexOf(row))); } catch (err) {}
    });

    host.addEventListener('dragover', function (e) {
      if (!dragging) { return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var over = e.target.closest(selector);
      items().forEach(function (n) { n.classList.remove('drop-before', 'drop-after'); });
      if (!over || over === dragging) { return; }
      var r = over.getBoundingClientRect();
      over.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });

    host.addEventListener('drop', function (e) {
      if (!dragging) { return; }
      e.preventDefault();
      var over = e.target.closest(selector);
      var from = indexOf(dragging);
      items().forEach(function (n) { n.classList.remove('drop-before', 'drop-after'); });
      if (!over || over === dragging) { cleanup(); return; }

      var to = indexOf(over);
      var r = over.getBoundingClientRect();
      var after = e.clientY >= r.top + r.height / 2;
      if (after && to < from) { to++; }
      if (!after && to > from) { to--; }
      cleanup();
      if (from !== to) { onMove(from, to); }
    });

    host.addEventListener('dragend', cleanup);

    function cleanup() {
      if (dragging) { dragging.classList.remove('is-dragging'); }
      items().forEach(function (n) { n.classList.remove('drop-before', 'drop-after'); });
      dragging = null;
    }
  }

  /* ── I. Media picker ───────────────────────────────────────────────── */

  var imageCache = null;

  /**
   * Every image the site can offer.
   *
   * There is no server to list a directory on a static host, so the picker
   * shows what the content already references (which covers the whole
   * shipped images/ folder) plus anything in uploads/ that content points
   * at, plus any URL you paste. All three are stored the same way: a
   * plain string, never base64.
   */
  function availableImages() {
    if (imageCache) { return Promise.resolve(imageCache); }

    return Store.loadJSON('data/media.json')
      .then(function (m) { return (m && m.images) || []; })
      .catch(function () { return []; })
      .then(function (listed) {
        var names = listed.slice();
        var db = Store.db;

        function add(v) { if (v && typeof v === 'string') { names.push(v); } }

        (db.destinations || []).forEach(function (d) {
          add(d.image);
          (d.gallery || []).forEach(add);
        });
        (db.packages || []).forEach(function (p) {
          add(p.image);
          (p.gallery || []).forEach(add);
          (p.itinerary || []).forEach(function (day) { add(day.image); });
        });
        (db.adventures || []).forEach(function (a) { add(a.image); });
        (db.gallery || []).forEach(function (g) { add(g.image); });
        (db.testimonials || []).forEach(function (t) { add(t.avatar); });

        var s = db.settings || {};
        add(s.logo);
        ((s.hero || {}).images || []).forEach(add);
        add((s.home || {}).whyImage);
        add((s.cta || {}).image);
        Object.keys(s.pages || {}).forEach(function (k) {
          add(s.pages[k].image);
          add(s.pages[k].storyImage);
          (s.pages[k].team || []).forEach(function (m) { add(m.photo); });
        });

        return Store.pendingPhotos().then(function (pending) {
          (pending || []).forEach(function (n) { names.push('uploads/' + n); });

          imageCache = names
            .filter(function (n) {
              return n && !/^(https?:)?\/\//i.test(n) && n.indexOf('data:') !== 0;
            })
            .filter(function (n, i, a) { return a.indexOf(n) === i; })
            .sort();
          return imageCache;
        });
      });
  }

  /** Forget the cached list — used after a new path is typed in. */
  function forgetImages() { imageCache = null; }

  /**
   * Point an <img> at a stored path.
   *
   * Photos not yet published live only in IndexedDB, so this returns a
   * placeholder synchronously and swaps in the real data URL when it
   * arrives. Without that, every freshly uploaded photo would show as a
   * broken image until the user pressed Publish.
   */
  function imgSrc(v) {
    if (!v) { return ''; }
    if (/^(https?:)?\/\//i.test(v) || v.indexOf('data:') === 0) { return v; }
    if (v.indexOf('/') >= 0) { return '../' + v.replace(/^\/+/, ''); }
    return '../uploads/' + v;
  }

  /** Set an image element's source, resolving a pending upload if needed. */
  function setImg(el, value) {
    if (!el) { return; }
    el.src = imgSrc(value);
    Store.resolveImage(value).then(function (src) {
      if (src) { el.src = src; }
    }).catch(function () {});
  }

  /** A single-image field: preview, upload, a text box for a path, browse. */
  function imageField(host, obj, key, opts) {
    opts = opts || {};

    function paint() {
      host.innerHTML = '';
      var preview = el('div', { class: 'media__preview' });
      if (obj[key]) {
        var im = el('img', { alt: '', loading: 'lazy' });
        setImg(im, obj[key]);
        preview.appendChild(im);
      } else {
        preview.appendChild(el('div', {
          class: 'none', text: opts.emptyText || 'No photograph chosen'
        }));
      }

      var input = el('input', {
        class: 'input', type: 'text', value: obj[key] || '',
        'aria-label': opts.label || 'Image path',
        placeholder: 'images/hampi.jpg or https://…'
      });
      input.addEventListener('input', function () {
        obj[key] = input.value.trim();
        forgetImages();
        Store.saveData();
      });
      input.addEventListener('change', paint);

      /* The real upload. A hidden file input keeps the native picker
         without the browser's default control, which cannot be styled. */
      var file = el('input', {
        type: 'file', accept: 'image/*', class: 'visually-hidden',
        'aria-hidden': 'true', tabindex: '-1'
      });
      file.addEventListener('change', function () {
        var chosen = file.files && file.files[0];
        if (!chosen) { return; }
        uploadInto(chosen, function (path) {
          obj[key] = path;
          Store.saveData(true);
          paint();
          if (opts.onChange) { opts.onChange(path); }
        });
        file.value = '';
      });

      var up = el('button', {
        class: 'btn btn--primary btn--sm', type: 'button',
        html: icon('upload', 15) + 'Upload',
        title: 'Upload a photograph from this device',
        onclick: function () { file.click(); }
      });

      var browse = el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        html: icon('image', 15) + 'Browse',
        onclick: function () {
          pickImage(obj[key]).then(function (chosen) {
            if (chosen === null) { return; }
            obj[key] = chosen;
            Store.saveData(true);
            paint();
            if (opts.onChange) { opts.onChange(chosen); }
          });
        }
      });

      var clear = obj[key] ? el('button', {
        class: 'btn btn--quiet btn--sm', type: 'button', html: icon('x', 15),
        title: 'Remove this photograph', 'aria-label': 'Remove this photograph',
        onclick: function () {
          obj[key] = '';
          Store.saveData(true);
          paint();
          if (opts.onChange) { opts.onChange(''); }
        }
      }) : null;

      host.appendChild(el('div', { class: 'media' }, [
        preview,
        el('div', { class: 'media__bar' }, [input, up, browse, clear, file])
      ]));
    }

    paint();
    return { repaint: paint };
  }

  /**
   * Shared upload handler: shrink, store, report. Used by the single-image
   * field, the gallery field and the picker so the messaging is identical
   * wherever a photo comes in.
   */
  function uploadInto(file, done) {
    var t = toast('Preparing ' + file.name, 'Resizing and saving…', null, 30000);
    Store.addPhoto(file).then(function (res) {
      t.close();
      forgetImages();
      var kb = Math.max(1, Math.round(res.bytes / 1024));
      toast('Photograph added', res.width + 'px wide, about ' + kb + ' KB. ' +
        'It goes live when you publish.');
      done(res.path);
    }).catch(function (err) {
      t.close();
      toast('That photo could not be added', err.message, 'err', 7000);
    });
  }

  /** Modal grid of every available photograph. Resolves with the choice. */
  function pickImage(current) {
    return new Promise(function (resolve) {
      var chosen = current || '';
      var settled = false;
      function finish(v) { if (!settled) { settled = true; resolve(v); } }

      var m = modal({
        title: 'Choose a photograph',
        subtitle: 'Upload a new one, or pick something the site already uses.',
        size: 'lg',
        onClose: function () { finish(null); },
        body:
          '<div class="uploadzone" data-drop tabindex="0" role="button" ' +
          'aria-label="Upload a photograph">' +
            '<span class="uploadzone__ico">' + icon('upload', 22) + '</span>' +
            '<b>Upload a photograph</b>' +
            '<span>Drag one here, or click to choose. Large photos are resized ' +
            'automatically.</span>' +
            '<input type="file" accept="image/*" class="visually-hidden" data-file>' +
          '</div>' +
          '<div class="field mt-3"><label class="label" for="mUrl">Or paste a web address</label>' +
          '<input class="input" id="mUrl" type="text" placeholder="https://example.com/photo.jpg" ' +
          'value="' + (/^https?:/i.test(chosen) ? esc(chosen) : '') + '">' +
          '<div class="hint">Photographs are stored as files, never inside the JSON.</div></div>' +
          '<div class="divider"></div><div class="picker" data-picker></div>',
        buttons: [
          { label: 'Cancel', class: 'btn--ghost', onClick: function (a) { finish(null); a.close(); } },
          {
            label: 'Use this photograph', class: 'btn--primary',
            onClick: function (a) {
              var typed = m.qs('#mUrl').value.trim();
              finish(typed || chosen);
              a.close();
            }
          }
        ]
      });

      var grid = m.qs('[data-picker]');
      grid.innerHTML = '<div class="skel skel--tile"></div><div class="skel skel--tile"></div>' +
        '<div class="skel skel--tile"></div><div class="skel skel--tile"></div>';

      /* Upload straight from the picker, including drag and drop. */
      var drop = m.qs('[data-drop]');
      var fileInput = m.qs('[data-file]');

      function take(f) {
        if (!f) { return; }
        uploadInto(f, function (path) {
          chosen = path;
          finish(path);
          m.close();
        });
      }

      drop.addEventListener('click', function () { fileInput.click(); });
      drop.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
      });
      fileInput.addEventListener('change', function () {
        take(fileInput.files && fileInput.files[0]);
      });
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) {
          e.preventDefault();
          drop.classList.add('is-over');
        });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) {
          e.preventDefault();
          drop.classList.remove('is-over');
        });
      });
      drop.addEventListener('drop', function (e) {
        take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
      });

      availableImages().then(function (names) {
        grid.innerHTML = '';
        if (!names.length) {
          grid.innerHTML = '<p class="soft small">No photographs found yet. Paste a path above instead.</p>';
          return;
        }
        names.forEach(function (n) {
          var isNew = n.indexOf('uploads/') === 0;
          var b = el('button', {
            class: 'picker__item', type: 'button', title: n,
            'aria-pressed': n === chosen ? 'true' : 'false',
            html: '<img alt="" loading="lazy">' +
              '<span class="cap">' + esc(n) + '</span>' +
              (isNew ? '<span class="picker__new">New</span>' : '')
          });
          setImg(qs('img', b), n);
          b.addEventListener('click', function () {
            chosen = n;
            m.qs('#mUrl').value = '';
            qsa('.picker__item', grid).forEach(function (x) {
              x.setAttribute('aria-pressed', 'false');
            });
            b.setAttribute('aria-pressed', 'true');
          });
          grid.appendChild(b);
        });
      });
    });
  }

  /** Multi-image field for galleries. Stores an array of strings. */
  function galleryField(host, arr, opts) {
    opts = opts || {};

    function changed() {
      Store.saveData(true);
      if (opts.onChange) { opts.onChange(arr); }
      paint();
    }

    function paint() {
      host.innerHTML = '';
      var grid = el('div', { class: 'picker' });

      arr.forEach(function (src, i) {
        var wrap = el('div', {
          class: 'picker__item picker__item--fixed', draggable: 'true', 'data-i': i,
          html: '<img alt="" loading="lazy">' +
            '<span class="cap">' + esc(src) + '</span>' +
            (i === 0 && opts.markFirst ? '<span class="picker__first">First</span>' : '')
        });
        setImg(qs('img', wrap), src);
        wrap.appendChild(el('button', {
          class: 'picker__del', type: 'button', title: 'Remove',
          'aria-label': 'Remove photograph ' + (i + 1),
          html: icon('trash', 14),
          onclick: function (e) { e.stopPropagation(); arr.splice(i, 1); changed(); }
        }));
        grid.appendChild(wrap);
      });

      host.appendChild(grid);
      if (!arr.length) {
        host.appendChild(el('div', {
          class: 'rep__empty', text: opts.empty || 'No photographs added yet.'
        }));
      }

      var gFile = el('input', {
        type: 'file', accept: 'image/*', multiple: 'multiple',
        class: 'visually-hidden', 'aria-hidden': 'true', tabindex: '-1'
      });
      gFile.addEventListener('change', function () {
        var list = Array.prototype.slice.call(gFile.files || []);
        gFile.value = '';
        /* One at a time — resizing several large photos at once locks up
           the tab, and the progress is clearer this way. */
        (function next(i) {
          if (i >= list.length) { return; }
          uploadInto(list[i], function (path) {
            arr.push(path);
            Store.saveData(true);
            if (opts.onChange) { opts.onChange(arr); }
            paint();
            next(i + 1);
          });
        }(0));
      });

      host.appendChild(el('div', { class: 'flex gap-2 wrap mt-2' }, [
        el('button', {
          class: 'btn btn--primary btn--sm', type: 'button',
          html: icon('upload', 15) + 'Upload photographs',
          onclick: function () { gFile.click(); }
        }),
        el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          html: icon('plus', 15) + 'Choose existing',
          onclick: function () {
            pickImage('').then(function (chosen) {
              if (!chosen) { return; }
              arr.push(chosen);
              changed();
            });
          }
        }),
        gFile
      ]));

      sortable(grid, '.picker__item', function (from, to) {
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        changed();
      });
    }

    paint();
    return { repaint: paint };
  }

  /* ── J. Empty state ────────────────────────────────────────────────── */

  function emptyState(host, ico, title, body, action) {
    host.innerHTML = '<div class="empty"><div class="empty__ico">' + icon(ico, 24) + '</div>' +
      '<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p></div>';
    if (action) { qs('.empty', host).appendChild(action); }
  }

  function badge(published, labels) {
    var l = labels || ['Live', 'Draft'];
    return published
      ? '<span class="badge badge--live"><span class="dot"></span>' + esc(l[0]) + '</span>'
      : '<span class="badge badge--draft"><span class="dot"></span>' + esc(l[1]) + '</span>';
  }

  /* ── K. Publish bar ────────────────────────────────────────────────── */

  var pubEl = null;

  function mountPublishBar() {
    if (qs('.pubbar')) { pubEl = qs('.pubbar'); return; }

    pubEl = el('div', { class: 'pubbar' });
    pubEl.innerHTML =
      '<div class="pubbar__state" data-pubstate><span class="dot"></span>' +
        '<span data-pubtext>All changes published</span></div>' +
      '<div class="pubbar__acts">' +
        '<button class="btn btn--quiet btn--sm" type="button" data-discard>' +
          icon('refresh', 15) + 'Discard</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-preview>' +
          icon('eye', 15) + 'Preview</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-export>' +
          icon('download', 15) + 'Download JSON</button>' +
        '<button class="btn btn--primary btn--sm" type="button" data-publish>' +
          icon('cloud', 15) + 'Publish</button>' +
      '</div>';
    document.body.appendChild(pubEl);

    qs('[data-preview]', pubEl).addEventListener('click', function () {
      Store.preview(true);
      window.open('../index.html?preview=1', '_blank', 'noopener');
      toast('Preview opened', 'It shows your unpublished draft. Visitors still see the published site.');
    });

    qs('[data-export]', pubEl).addEventListener('click', function () {
      var t = toast('Preparing the download', 'Packing data and photographs…', null, 20000);
      Store.exportZip().then(function (res) {
        t.close();
        toast('Download started', res.photoCount
          ? 'Includes ' + res.photoCount + ' photograph' + (res.photoCount === 1 ? '' : 's') +
            '. Unzip it over the project folder, then commit.'
          : 'Unzip it over the project folder, then commit the files.');
      }).catch(function (e) {
        t.close();
        toast('The download failed', e.message, 'err');
      });
    });

    qs('[data-discard]', pubEl).addEventListener('click', function () {
      if (!Store.isDirty()) {
        toast('Nothing to discard', 'There are no unpublished changes.', 'warn');
        return;
      }
      var changed = Store.changedFiles();
      confirmDialog({
        title: 'Discard all unpublished changes?',
        bodyHtml: 'This throws away every edit you have made since the last publish, across ' +
          '<b>' + changed.length + '</b> file' + (changed.length > 1 ? 's' : '') + ' (' +
          esc(changed.join(', ')) + '). The live site is not affected. This cannot be undone.',
        confirmLabel: 'Discard changes'
      }).then(function (ok) {
        if (!ok) { return; }
        Store.discardDraft();
        toast('Changes discarded', 'Back to the last published version.');
        setTimeout(function () { location.reload(); }, 700);
      });
    });

    qs('[data-publish]', pubEl).addEventListener('click', doPublish);

    Store.on('change', function () {
      setPubState(Store.isDirty() ? 'dirty' : 'clean',
        Store.isDirty() ? 'Unpublished changes' : 'All changes published');
      paintPhotoBadge();
    });
    Store.on('photos-changed', paintPhotoBadge);
    paintPhotoBadge();
    Store.on('saved', function () {
      if (Store.isDirty()) { setPubState('dirty', 'Draft saved'); }
    });
    Store.on('save-failed', function () {
      toast('Draft could not be saved',
        'This browser\u2019s storage is full. Publish now, or download the JSON.', 'err', 9000);
    });

    if (Store.isDirty()) { setPubState('dirty', 'Unpublished changes'); }

    /*
     * Leaving a page is not dangerous here, so do not interrogate the user
     * about it.
     *
     * The draft is written to localStorage continuously, so moving between
     * admin screens loses nothing. The old blanket beforeunload warning fired
     * on every internal navigation once anything had been edited, and its
     * message ("changes you made may not be saved") was simply untrue.
     *
     * What IS worth protecting is the last debounced write, so flush it on
     * the way out. `pagehide` is the reliable hook — mobile browsers and
     * bfcache do not guarantee `beforeunload` runs at all.
     */
    window.addEventListener('pagehide', function () { Store.flush(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { Store.flush(); }
    });

    /* The one case that genuinely deserves a prompt: the draft could not be
       written at all, so leaving really would lose the work. */
    window.addEventListener('beforeunload', function (e) {
      Store.flush();
      if (!Store.saveFailed()) { return; }
      e.preventDefault();
      e.returnValue = '';
    });
  }

  /** A count of photographs waiting to go up, shown beside the state dot. */
  function paintPhotoBadge() {
    if (!pubEl) { return; }
    Store.pendingPhotos().then(function (list) {
      var n = (list || []).length;
      var box = qs('[data-pubstate]', pubEl);
      var badge = qs('.pubbar__photos', box);
      if (!n) { if (badge) { badge.remove(); } return; }
      if (!badge) {
        badge = el('span', { class: 'pubbar__photos' });
        box.appendChild(badge);
      }
      badge.innerHTML = icon('image', 13) + n + (n === 1 ? ' photo' : ' photos');
    }).catch(function () {});
  }

  function setPubState(state, text) {
    if (!pubEl) { return; }
    var box = qs('[data-pubstate]', pubEl);
    box.classList.toggle('is-dirty', state === 'dirty');
    box.classList.toggle('is-saved', state === 'clean');
    qs('[data-pubtext]', pubEl).textContent = text;
  }

  function doPublish() {
    var changed = Store.changedFiles();
    if (!changed.length) {
      toast('Nothing to publish', 'The live site already matches what you see here.', 'warn');
      return;
    }

    /* Count photos waiting so the confirmation tells the whole truth about
       what this commit will contain. */
    Store.pendingPhotos().then(function (photos) {
      doPublishWith(changed, (photos || []).length);
    }).catch(function () { doPublishWith(changed, 0); });
  }

  function doPublishWith(changed, photoCount) {

    if (!mode.configured) {
      modal({
        title: 'Publishing is not connected yet',
        size: 'sm',
        body:
          '<p class="soft small" style="line-height:1.65">This admin saves your work in this ' +
          'browser, but it has nowhere to send it. Two ways forward:</p>' +
          '<p class="soft small" style="line-height:1.65"><b>Right now:</b> download the JSON ' +
          'files and commit them to your repository by hand. The site updates on the next build.</p>' +
          '<p class="soft small" style="line-height:1.65"><b>Properly:</b> deploy to Cloudflare ' +
          'Pages or Vercel and set the four environment variables described in the README. The ' +
          'publish button then commits for you.</p>' +
          '<p class="soft small" style="line-height:1.65">Changed: <b>' +
          esc(changed.join(', ')) + '</b></p>',
        buttons: [
          { label: 'Close', class: 'btn--ghost' },
          {
            label: 'Download everything', class: 'btn--primary', icon: 'download',
            onClick: function (a) { Store.exportZip(); a.close(); }
          }
        ]
      });
      return;
    }

    var summary = changed.map(function (f) { return '<li>' + esc(f) + '.json</li>'; }).join('') +
      (photoCount ? '<li><b>' + photoCount + ' new photograph' +
        (photoCount === 1 ? '' : 's') + '</b></li>' : '');
    var m = modal({
      title: 'Publish to the live site?',
      subtitle: 'This commits ' + (changed.length + photoCount) + ' file' +
        ((changed.length + photoCount) > 1 ? 's' : '') + ' to ' + (mode.repo || 'GitHub') +
        ' in one go.',
      size: 'sm',
      body: '<ul class="soft small" style="margin:0 0 14px 18px;line-height:1.7">' + summary + '</ul>' +
        '<div class="field"><label class="label" for="pubMsg">Note for the commit history ' +
        '<span class="opt">optional</span></label>' +
        '<input class="input" id="pubMsg" type="text" placeholder="Updated Coorg itinerary"></div>',
      buttons: [
        { label: 'Cancel', class: 'btn--ghost' },
        {
          label: 'Publish now', class: 'btn--primary', icon: 'cloud',
          onClick: function (a) {
            var note = m.qs('#pubMsg').value.trim();
            var btn = qsa('.btn--primary', a.foot)[0];
            btn.classList.add('is-busy');
            btn.textContent = 'Publishing…';

            Store.publish(note || null).then(function (res) {
              a.close();
              setPubState('clean', 'All changes published');
              toast('Published successfully', res.commit
                ? 'Commit ' + String(res.commit).slice(0, 7) + '. The site rebuilds in a minute or two.'
                : 'The site rebuilds in a minute or two.');
            }).catch(function (err) {
              btn.classList.remove('is-busy');
              btn.innerHTML = icon('cloud', 15) + 'Try again';
              if (err.status === 401) {
                a.close();
                toast('Your session expired', 'Sign in again and republish.', 'err');
                setTimeout(function () { Store.logout(); location.href = 'index.html'; }, 1600);
              } else {
                toast('Publish failed', err.message, 'err', 8000);
              }
            });
          }
        }
      ]
    });
  }

  /* ── Public surface ────────────────────────────────────────────────── */
  return {
    qs: qs, qsa: qsa, el: el, esc: esc, plain: plain, param: param, debounce: debounce,
    money: money, niceDate: niceDate, relTime: relTime, icon: icon,

    guard: guard, renderShell: renderShell, isConfigured: isConfigured, modeInfo: modeInfo,
    toast: toast, modal: modal, closeModal: closeModal, confirm: confirmDialog,

    bind: bind, validate: validate, rules: RULES,
    repeater: repeater, masterSelect: masterSelect, sortable: sortable,

    imageField: imageField, galleryField: galleryField, pickImage: pickImage,
    imgSrc: imgSrc, setImg: setImg, uploadInto: uploadInto,
    availableImages: availableImages, forgetImages: forgetImages,

    emptyState: emptyState, badge: badge,
    setPubState: setPubState, publish: doPublish
  };
}());
