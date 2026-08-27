/* ==========================================================================
   PRITHVI HOLIDAYS — ADMIN STORE
   The whole data layer. Three jobs:

     1. LOAD    read /data/*.json, then overlay any unpublished draft
     2. EDIT    every create / update / delete / reorder, plus autosave
     3. PUBLISH hand the changed files to /api/site, which commits them to
                GitHub using a token that only ever exists on the server

   The draft lives in localStorage under the same key the public site reads
   in preview mode, so "Preview" genuinely shows the unpublished state.

   Nothing in here knows what the screen looks like — that is ui.js's job,
   and no admin page is allowed to touch localStorage or fetch directly.
   ========================================================================== */
window.Store = (function () {
  'use strict';

  /* ── Paths ───────────────────────────────────────────────────────────
     The admin sits one folder down, so /data/ is one level up. Resolved
     from this script's own URL rather than hard-coded, so the site still
     works when deployed into a subfolder. */
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) { return '../'; }
    return s.replace(/admin\/js\/[^/]*$/, '');
  }());

  var API = BASE + 'api/site';

  var DRAFT_KEY = 'ph.draft.v1';        // shared with the public preview mode
  var PREVIEW_KEY = 'ph.preview';
  var TOKEN_KEY = 'ph.token';
  var STATUS_KEY = 'ph.apistatus';
  var LOCAL_ENQ = 'ph.enquiries.v1';    // where the contact form parks entries

  /* Files the admin may write. Order only affects the publish summary. */
  var FILES = [
    'settings', 'masters', 'destinations', 'packages', 'adventures',
    'testimonials', 'gallery', 'faqs', 'enquiries'
  ];

  /* Some files are bare arrays on disk, some are wrapped in an object.
     Keeping the wrapper means published JSON stays byte-compatible with
     what the public site already expects. */
  var WRAPPED = { packages: 'packages', enquiries: 'items' };

  var MASTER_KEYS = ['regions', 'categories', 'travelStyles', 'bookingStatuses'];

  /* Collections that are plain arrays of records, so one set of CRUD
     functions serves all of them. */
  var COLLECTIONS = ['destinations', 'packages', 'adventures', 'testimonials',
    'gallery', 'faqs', 'enquiries'];

  var db = null;        // live working copy
  var clean = null;     // last published state, for change detection
  var listeners = [];

  /* ── Small helpers ─────────────────────────────────────────────────── */

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function nowISO() { return new Date().toISOString(); }

  function generateId(prefix) {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 7);
    return (prefix ? prefix + '-' : '') + t + r;
  }

  function slugify(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function unwrap(name, raw) {
    var key = WRAPPED[name];
    if (!key) { return raw; }
    return (raw && raw[key]) || [];
  }

  function rewrap(name, value) {
    var key = WRAPPED[name];
    if (!key) {
      if (name === 'settings') {
        return Object.assign({}, value, { updatedAt: nowISO() });
      }
      return value;
    }
    var out = {};
    out[key] = value;
    out.updatedAt = nowISO();
    if (name === 'enquiries') {
      out.note = 'Enquiries from the website land here once a live endpoint is ' +
        'configured in settings.json. Until then they are held in the visitor\u2019s ' +
        'own browser and pulled into the admin from there.';
    }
    return out;
  }

  function on(evt, fn) { listeners.push({ evt: evt, fn: fn }); }
  function emit(evt, payload) {
    listeners.forEach(function (l) { if (l.evt === evt) { l.fn(payload); } });
  }

  /* ══════════════════════════════════════════════════════════════════════
     1. LOAD
     ══════════════════════════════════════════════════════════════════ */

  function loadJSON(path) {
    return fetch(BASE + String(path).replace(/^\/+/, '') + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) { throw new Error(path + ' returned ' + r.status); }
        return r.json();
      });
  }

  function readDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /** Read every data file, then lay the local draft on top. */
  function boot() {
    return Promise.all(FILES.map(function (n) {
      return loadJSON('data/' + n + '.json').catch(function () {
        /* A missing file should not stop the admin — start it empty. */
        if (WRAPPED[n]) { return rewrap(n, []); }
        return (n === 'settings' || n === 'masters') ? {} : [];
      });
    })).then(function (raw) {
      var fresh = {};
      FILES.forEach(function (n, i) { fresh[n] = unwrap(n, raw[i]); });

      /* Make sure every master list exists so the editors never see
         `undefined` where they expect an array. */
      fresh.masters = fresh.masters || {};
      MASTER_KEYS.forEach(function (k) {
        if (!Array.isArray(fresh.masters[k])) { fresh.masters[k] = []; }
      });

      clean = clone(fresh);
      db = fresh;

      var draft = readDraft();
      var info = { hasDraft: false, draftAt: null };

      if (draft && draft.data) {
        FILES.forEach(function (n) {
          if (draft.data[n] !== undefined) { db[n] = draft.data[n]; }
        });
        info.hasDraft = true;
        info.draftAt = draft.savedAt || null;
      }
      return info;
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     2. DRAFT PERSISTENCE
     ══════════════════════════════════════════════════════════════════ */

  var saveTimer = null;
  var savePending = false;
  var saveBroken = false;

  function writeDraft() {
    saveTimer = null;
    savePending = false;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: nowISO(), data: db }));
      saveBroken = false;
      emit('saved');
    } catch (e) {
      /* Quota is the realistic failure — usually a very large gallery. */
      saveBroken = true;
      emit('save-failed', e);
    }
  }

  /**
   * Write the working copy to localStorage. Debounced by default so typing
   * in a textarea does not hit storage on every keystroke.
   */
  function saveData(immediate) {
    clearTimeout(saveTimer);
    if (immediate) {
      writeDraft();
    } else {
      savePending = true;
      saveTimer = setTimeout(writeDraft, 550);
    }
    emit('change');
  }

  /**
   * Write any debounced save right now.
   *
   * Called when the page is being hidden or unloaded. Without this, the last
   * half-second of typing could be lost on navigation — which is the ONLY
   * thing that was ever genuinely at risk, and it is fixable rather than
   * something to warn about.
   */
  function flush() {
    if (!savePending) { return; }
    clearTimeout(saveTimer);
    writeDraft();
  }

  /** True only when the draft could not be written at all (quota, private mode). */
  function saveFailed() { return saveBroken; }

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    db = clone(clean);
    emit('change');
  }

  /** Which files differ from the last published state. */
  function changedFiles() {
    if (!clean) { return []; }
    return FILES.filter(function (n) {
      return JSON.stringify(db[n]) !== JSON.stringify(clean[n]);
    });
  }

  function isDirty() { return changedFiles().length > 0; }

  /* ══════════════════════════════════════════════════════════════════════
     PREVIEW
     ══════════════════════════════════════════════════════════════════ */

  function preview(on) {
    try {
      if (on) { localStorage.setItem(PREVIEW_KEY, '1'); }
      else { localStorage.removeItem(PREVIEW_KEY); }
    } catch (e) {}
  }
  function previewOn() {
    try { return localStorage.getItem(PREVIEW_KEY) === '1'; } catch (e) { return false; }
  }

  /* ══════════════════════════════════════════════════════════════════════
     PHOTOS

     A browser cannot write a file onto the web server, so an uploaded photo
     takes the same road as the text: it waits in the draft, then rides to
     GitHub with the next publish.

     Two details that matter:

       • Photos live in IndexedDB, not localStorage. localStorage caps out
         around 5 MB and holds strings only — three phone photos would fill
         it and break every save. IndexedDB has room and does not block.

       • Every photo is resized to 1400px and re-encoded as JPEG before it
         is stored. A 6 MB phone photo becomes roughly 200 KB, which keeps
         the repository sane and the site fast. This is the same shrinking a
         server would do, done here because there is no server.
     ══════════════════════════════════════════════════════════════════ */

  var DB_NAME = 'ph-photos';
  var DB_STORE = 'photos';
  var MAX_WIDTH = 1400;
  var JPEG_QUALITY = 0.84;
  var MAX_UPLOAD = 12 * 1024 * 1024;

  var dbPromise = null;

  function openDB() {
    if (dbPromise) { return dbPromise; }
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('This browser has no IndexedDB.')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB refused to open.')); };
    });
    return dbPromise;
  }

  function idb(mode, fn) {
    return openDB().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(DB_STORE, mode);
        var req = fn(tx.objectStore(DB_STORE));
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function putPhoto(name, dataUrl) {
    return idb('readwrite', function (s) { return s.put(dataUrl, name); });
  }
  function getPhoto(name) {
    return idb('readonly', function (s) { return s.get(name); });
  }
  function allPhotoNames() {
    return idb('readonly', function (s) { return s.getAllKeys(); }).catch(function () { return []; });
  }
  function deletePhoto(name) {
    return idb('readwrite', function (s) { return s.delete(name); });
  }
  function clearPhotos() {
    return idb('readwrite', function (s) { return s.clear(); }).catch(function () {});
  }

  /**
   * Take a file from the user's computer, shrink it, and store it under a
   * generated name. Resolves with that name, which is what goes into the JSON.
   */
  function addPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file was chosen.')); return; }
      if (!/^image\//.test(file.type)) {
        reject(new Error('That file is not an image. Use a JPG, PNG or WEBP.'));
        return;
      }
      if (file.size > MAX_UPLOAD) {
        reject(new Error('That photo is larger than 12 MB. Please compress it first.'));
        return;
      }

      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error('That photo could not be read. Try another file.'));
      };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () {
          reject(new Error('That photo could not be opened. It may be damaged.'));
        };
        img.onload = function () {
          var w = img.naturalWidth;
          var h = img.naturalHeight;
          if (!w || !h) { reject(new Error('That photo has no size.')); return; }
          if (w > MAX_WIDTH) { h = Math.round(h * (MAX_WIDTH / w)); w = MAX_WIDTH; }

          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          /* A white base, so a transparent PNG does not turn black as JPEG. */
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          var rand = Math.random().toString(16).slice(2, 12);
          var name = stamp + '-' + rand + '.jpg';
          var dataUrl;
          try {
            dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          } catch (e) {
            reject(new Error('That photo could not be converted.'));
            return;
          }

          putPhoto(name, dataUrl)
            .then(function () {
              emit('photos-changed');
              resolve({ name: name, path: 'uploads/' + name, width: w, height: h,
                bytes: Math.round(dataUrl.length * 0.75) });
            })
            .catch(function () {
              reject(new Error('The photo could not be saved in this browser.'));
            });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Where an <img> should point for a given stored path.
   * A photo waiting to be published is not on the server yet, so it is shown
   * straight from IndexedDB — otherwise the admin would show a broken image
   * for everything the user just added.
   */
  function resolveImage(pathValue) {
    var v = String(pathValue || '');
    if (!v) { return Promise.resolve(''); }
    if (/^(https?:)?\/\//i.test(v) || v.indexOf('data:') === 0) {
      return Promise.resolve(v);
    }
    var name = v.replace(/^uploads\//, '');
    if (v.indexOf('uploads/') === 0) {
      return getPhoto(name)
        .then(function (dataUrl) { return dataUrl || BASE + v; })
        .catch(function () { return BASE + v; });
    }
    return Promise.resolve(BASE + v.replace(/^\/+/, ''));
  }

  /** Photos held locally that no published page references yet. */
  function pendingPhotos() {
    return allPhotoNames().then(function (names) {
      return (names || []).map(function (n) { return String(n); });
    });
  }

  /** Drop stored photos that nothing in the data points at any more. */
  function prunePhotos() {
    var used = {};
    function mark(v) {
      if (typeof v === 'string' && v.indexOf('uploads/') === 0) {
        used[v.replace('uploads/', '')] = true;
      }
    }
    JSON.stringify(db, function (k, v) { mark(v); return v; });

    return allPhotoNames().then(function (names) {
      var dead = (names || []).filter(function (n) { return !used[String(n)]; });
      return Promise.all(dead.map(function (n) { return deletePhoto(n); }))
        .then(function () { return dead.length; });
    }).catch(function () { return 0; });
  }

  /* ══════════════════════════════════════════════════════════════════════
     PUBLISH
     ══════════════════════════════════════════════════════════════════ */

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function api(action, payload) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action, token: token() }, payload || {}))
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || j.ok === false) {
          var err = new Error(j.error || ('Request failed with status ' + r.status));
          err.status = r.status;
          err.code = j.code;
          throw err;
        }
        return j;
      }).catch(function (e) {
        if (e instanceof SyntaxError) {
          /* A static host answers with its 404 page here — HTML, not JSON. */
          var err = new Error('No publishing service is running at /api/site.');
          err.code = 'no-api';
          throw err;
        }
        throw e;
      });
    });
  }

  /**
   * Is a publishing backend present and configured?
   *
   * On a purely static host there is no /api/site, so this request fails —
   * and the browser logs that failure however carefully we catch it. Cache
   * the answer for the session so we probe once rather than once per page.
   */
  function status() {
    try {
      var cached = sessionStorage.getItem(STATUS_KEY);
      if (cached) { return Promise.resolve(JSON.parse(cached)); }
    } catch (e) { /* sessionStorage unavailable — just probe */ }

    return api('status')
      .then(function (j) {
        return {
          api: true,
          configured: !!j.configured,
          repo: j.repo || '',
          branch: j.branch || ''
        };
      })
      .catch(function (e) {
        return { api: false, configured: false, error: e.message };
      })
      .then(function (result) {
        try { sessionStorage.setItem(STATUS_KEY, JSON.stringify(result)); } catch (e) {}
        return result;
      });
  }

  function forgetStatus() {
    try { sessionStorage.removeItem(STATUS_KEY); } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════════════════
     AUTHENTICATION

     Two gates, depending on how the site is deployed:

       server  a serverless function is running and ADMIN_PASSWORD is set.
               The password is checked on the server, in constant time, and
               a signed 12-hour token comes back. This is real security: the
               token is what authorises a publish, and nothing else will do.

       local   no backend. The passcode is checked in the browser against a
               salted PBKDF2-SHA256 hash in data/admin.json.

     The local gate is a deterrent, not a vault, and the admin says so rather
     than implying otherwise. It matters less than it sounds: getting past it
     only grants edit access to a draft in that person's own browser. Changing
     the actual website still requires the server, which holds the GitHub
     token. A static site cannot do better than this, and pretending it can
     would be the real problem.
     ══════════════════════════════════════════════════════════════════ */

  var SESSION_KEY = 'ph.session';
  var FAILS_KEY = 'ph.authfails';
  var SESSION_HOURS = 12;

  var MAX_TRIES = 5;         // before a cooldown starts
  var COOLDOWN_MS = 60000;   // first cooldown; doubles each further failure

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
  }

  function bytesToB64(bytes) {
    var s = '';
    var arr = new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i++) { s += String.fromCharCode(arr[i]); }
    return btoa(s);
  }

  /** Compare two strings without leaking length or position through timing. */
  function constantTimeEqual(a, b) {
    var diff = a.length ^ b.length;
    var n = Math.max(a.length, b.length);
    for (var i = 0; i < n; i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  }

  var gateCache = null;

  /** Read data/admin.json — the local passcode hash, if one is set. */
  function gate() {
    if (gateCache) { return Promise.resolve(gateCache); }
    return loadJSON('data/admin.json')
      .then(function (g) {
        gateCache = (g && g.hash && g.salt) ? g : { none: true };
        return gateCache;
      })
      .catch(function () { gateCache = { none: true }; return gateCache; });
  }

  /**
   * Which gate applies, and is a passcode actually set?
   * Resolves { mode, configured, repo, branch, hasPasscode, secureContext }.
   */
  function authMode() {
    return Promise.all([status(), gate()]).then(function (r) {
      var st = r[0], g = r[1];
      return {
        mode: st.configured ? 'server' : (g.none ? 'open' : 'local'),
        configured: st.configured,
        api: st.api,
        repo: st.repo,
        branch: st.branch,
        hasPasscode: !g.none,
        /* WebCrypto only exists in a secure context. https and localhost
           qualify; plain http on a LAN address does not. */
        secureContext: !!(window.crypto && window.crypto.subtle)
      };
    });
  }

  function readSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) { return null; }
      var s = JSON.parse(raw);
      if (!s || !s.exp || Date.now() > s.exp) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) { return null; }
  }

  function startSession(mode) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        mode: mode,
        exp: Date.now() + SESSION_HOURS * 3600 * 1000
      }));
    } catch (e) {}
  }

  /** Is there a valid session for the gate that currently applies? */
  function isAuthed() {
    var s = readSession();
    if (!s) { return false; }
    /* A server deployment must have a real token, not just a session flag —
       otherwise a stale local session would appear to authorise publishing. */
    if (s.mode === 'server') { return !!token(); }
    return true;
  }

  /* ── Failed-attempt cooldown ───────────────────────────────────────
     Rate limiting in the browser is trivially bypassed by someone who knows
     how, but it does stop the realistic attack — a person guessing by hand —
     and costs nothing. */

  function readFails() {
    try { return JSON.parse(localStorage.getItem(FAILS_KEY) || '{"n":0,"until":0}'); }
    catch (e) { return { n: 0, until: 0 }; }
  }

  function lockout() {
    var f = readFails();
    var left = f.until - Date.now();
    return {
      locked: left > 0,
      msLeft: Math.max(0, left),
      secondsLeft: Math.ceil(Math.max(0, left) / 1000),
      triesLeft: Math.max(0, MAX_TRIES - f.n)
    };
  }

  function noteFailure() {
    var f = readFails();
    f.n = (f.n || 0) + 1;
    if (f.n >= MAX_TRIES) {
      var over = f.n - MAX_TRIES;
      f.until = Date.now() + COOLDOWN_MS * Math.pow(2, Math.min(over, 5));
    }
    try { localStorage.setItem(FAILS_KEY, JSON.stringify(f)); } catch (e) {}
  }

  function clearFailures() {
    try { localStorage.removeItem(FAILS_KEY); } catch (e) {}
  }

  /** Derive the PBKDF2 hash of a passcode against the stored salt. */
  function derive(passcode, g) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits({
          name: 'PBKDF2',
          salt: b64ToBytes(g.salt),
          iterations: g.iterations || 310000,
          hash: 'SHA-256'
        }, key, 256);
      })
      .then(bytesToB64);
  }

  /**
   * Try to unlock the admin. One entry point for both gates, so the login
   * screen does not need to care which is in play.
   */
  function unlock(passcode) {
    var lock = lockout();
    if (lock.locked) {
      var err = new Error('Too many attempts. Try again in ' +
        lock.secondsLeft + ' second' + (lock.secondsLeft === 1 ? '' : 's') + '.');
      err.code = 'locked';
      return Promise.reject(err);
    }

    return authMode().then(function (m) {
      if (m.mode === 'server') {
        return api('login', { password: passcode }).then(function (j) {
          try { sessionStorage.setItem(TOKEN_KEY, j.token); } catch (e) {}
          startSession('server');
          clearFailures();
          return { mode: 'server' };
        }).catch(function (e) {
          noteFailure();
          throw new Error(e.code === 'no-api'
            ? 'The publishing service did not respond.'
            : 'That passcode is not right.');
        });
      }

      if (m.mode === 'open') {
        startSession('open');
        return { mode: 'open' };
      }

      if (!m.secureContext) {
        var e2 = new Error(
          'Passcode checking needs a secure connection. Use https, or ' +
          'http://localhost rather than an IP address.');
        e2.code = 'insecure';
        throw e2;
      }

      return gate().then(function (g) {
        return derive(passcode, g).then(function (got) {
          if (!constantTimeEqual(got, g.hash)) {
            noteFailure();
            var lk = lockout();
            throw new Error(lk.locked
              ? 'That passcode is not right. Too many attempts — wait ' +
                lk.secondsLeft + ' seconds.'
              : 'That passcode is not right.' +
                (lk.triesLeft <= 2 ? ' ' + lk.triesLeft + ' attempts left.' : ''));
          }
          startSession('local');
          clearFailures();
          return { mode: 'local' };
        });
      });
    });
  }

  function logout() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    forgetStatus();
    gateCache = null;
  }

  function isLoggedIn() { return !!token(); }

  /**
   * Collect everything that needs to go to the server: changed JSON files,
   * plus any photo that is still only in this browser.
   */
  function buildPayload() {
    var names = changedFiles();
    var files = names.map(function (n) {
      return {
        path: 'data/' + n + '.json',
        content: JSON.stringify(rewrap(n, db[n]), null, 2) + '\n',
        encoding: 'utf-8'
      };
    });

    /* Only send photos the data actually references — a photo added and then
       removed again should not be committed. */
    var used = {};
    JSON.stringify(db, function (k, v) {
      if (typeof v === 'string' && v.indexOf('uploads/') === 0) {
        used[v.replace('uploads/', '')] = true;
      }
      return v;
    });

    return allPhotoNames().then(function (stored) {
      var wanted = (stored || []).map(String).filter(function (n) { return used[n]; });
      return Promise.all(wanted.map(function (n) {
        return getPhoto(n).then(function (dataUrl) {
          if (!dataUrl) { return null; }
          return {
            path: 'uploads/' + n,
            content: String(dataUrl).split(',')[1] || '',
            encoding: 'base64'
          };
        });
      })).then(function (photos) {
        return {
          names: names,
          files: files.concat(photos.filter(Boolean)),
          photoCount: photos.filter(Boolean).length
        };
      });
    }).catch(function () {
      return { names: names, files: files, photoCount: 0 };
    });
  }

  /** Send the changed files and any new photos as ONE commit. */
  function publish(message) {
    return buildPayload().then(function (payload) {
      if (!payload.files.length) { return { ok: true, nothing: true }; }

      var summary = payload.names.join(', ');
      if (payload.photoCount) {
        summary += (summary ? ', ' : '') + payload.photoCount +
          (payload.photoCount === 1 ? ' photo' : ' photos');
      }

      return api('publish', {
        message: message || ('Update site content (' + summary + ')'),
        files: payload.files
      }).then(function (j) {
        clean = clone(db);
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
        /* The photos are on the server now, so the local copies are just
           taking up space — and keeping them would mask a failed upload. */
        return clearPhotos().then(function () {
          emit('published', j);
          emit('photos-changed');
          emit('change');
          return j;
        });
      });
    });
  }

  /* ── EXPORT — the honest fallback when there is no backend ──────────
     A minimal store-only ZIP writer: no compression, no library. JSON of
     this size does not need deflate, and this keeps the admin dependency
     free. */
  function crc32(bytes) {
    var c, table = crc32.table;
    if (!table) {
      table = crc32.table = new Int32Array(256);
      for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
        table[n] = c;
      }
    }
    var crc = -1;
    for (var i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0;
  }

  function zip(entries) {
    var enc = new TextEncoder();
    var chunks = [], central = [], offset = 0;

    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }

    entries.forEach(function (e) {
      var name = enc.encode(e.name);
      /* Photos arrive base64-encoded; unpack them to real bytes so the ZIP
         holds a usable JPEG rather than a text file full of base64. */
      var data = e.encoding === 'base64' ? b64ToBytes(e.content) : enc.encode(e.content);
      var crc = crc32(data);

      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0)
      );
      chunks.push(new Uint8Array(local), name, data);

      central.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      ), name);

      offset += local.length + name.length + data.length;
    });

    var cdStart = offset, cdSize = 0, cdChunks = [];
    for (var i = 0; i < central.length; i += 2) {
      var head = new Uint8Array(central[i]);
      cdChunks.push(head, central[i + 1]);
      cdSize += head.length + central[i + 1].length;
    }

    var end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(entries.length), u16(entries.length),
      u32(cdSize), u32(cdStart), u16(0)
    ));

    return new Blob(chunks.concat(cdChunks, [end]), { type: 'application/zip' });
  }

  function fileContents() {
    return FILES.map(function (n) {
      return {
        name: 'data/' + n + '.json',
        content: JSON.stringify(rewrap(n, db[n]), null, 2) + '\n',
        encoding: 'utf-8'
      };
    });
  }

  function download(blob, filename) {
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(href); }, 1500);
  }

  /**
   * The manual route when there is no publishing server: a ZIP holding the
   * data files AND any photos still waiting, laid out exactly as they sit in
   * the project so it can be unzipped straight over the top.
   */
  function exportZip() {
    return buildPayload().then(function (payload) {
      var byPath = {};
      payload.files.forEach(function (f) { byPath[f.path] = f; });

      var entries = fileContents();
      /* Prefer the payload's version of a data file, then add the photos. */
      entries = entries.map(function (e) { return byPath[e.name] ? byPath[e.name] : e; })
        .map(function (e) {
          return { name: e.name || e.path, content: e.content, encoding: e.encoding || 'utf-8' };
        });

      payload.files.filter(function (f) { return f.encoding === 'base64'; })
        .forEach(function (f) {
          entries.push({ name: f.path, content: f.content, encoding: 'base64' });
        });

      download(zip(entries), 'prithvi-holidays-data.zip');
      return { photoCount: payload.photoCount };
    });
  }

  function exportOne(name) {
    var content = JSON.stringify(rewrap(name, db[name]), null, 2) + '\n';
    download(new Blob([content], { type: 'application/json' }), name + '.json');
  }

  function importJSON(name, text) {
    var parsed = JSON.parse(text);       // throws on bad JSON; the caller reports it
    db[name] = unwrap(name, parsed);
    saveData(true);
  }

  /* ══════════════════════════════════════════════════════════════════════
     GENERIC COLLECTION CRUD
     Every list screen (adventures, testimonials, gallery, faqs, enquiries)
     runs through these, so the behaviour is identical everywhere.
     ══════════════════════════════════════════════════════════════════ */

  function all(coll) { return db[coll] || []; }

  function sorted(coll) {
    return all(coll).slice().sort(function (a, b) {
      return (a.sort || 0) - (b.sort || 0);
    });
  }

  function getItem(coll, id) {
    return all(coll).filter(function (x) { return x.id === id; })[0] || null;
  }

  function addItem(coll, data, prefix) {
    var list = all(coll);
    var item = Object.assign({
      id: generateId(prefix || coll.slice(0, 3)),
      published: true,
      sort: list.length,
      updatedAt: nowISO()
    }, data || {});
    list.push(item);
    saveData(true);
    return item;
  }

  function updateItem(coll, id, patch) {
    var it = getItem(coll, id);
    if (!it) { return null; }
    Object.assign(it, patch, { updatedAt: nowISO() });
    saveData();
    return it;
  }

  function deleteItem(coll, id) {
    var list = all(coll);
    var i = list.findIndex(function (x) { return x.id === id; });
    if (i < 0) { return false; }
    list.splice(i, 1);
    resequence(coll);
    saveData(true);
    return true;
  }

  function duplicateItem(coll, id, nameKey) {
    var it = getItem(coll, id);
    if (!it) { return null; }
    var copy = clone(it);
    copy.id = generateId(prefixFor(coll));
    var key = nameKey || (copy.name !== undefined ? 'name' : 'title');
    if (copy[key]) { copy[key] = copy[key] + ' (copy)'; }
    if (copy.slug) { copy.slug = slugify(copy[key] || copy.slug); }
    copy.published = false;
    copy.sort = all(coll).length;
    copy.createdAt = nowISO();
    copy.updatedAt = nowISO();
    all(coll).push(copy);
    saveData(true);
    return copy;
  }

  function prefixFor(coll) {
    return { destinations: 'dst', packages: 'pkg', adventures: 'adv',
      testimonials: 'tst', gallery: 'gal', faqs: 'faq', enquiries: 'enq' }[coll] || 'item';
  }

  /** Move one place up (-1) or down (+1) in the sorted order. */
  function moveItem(coll, id, dir) {
    var list = sorted(coll);
    var i = list.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) { return false; }
    var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    list.forEach(function (x, n) { x.sort = n; });
    saveData(true);
    return true;
  }

  /** Drag-and-drop reorder: move index `from` to index `to`. */
  function reorder(coll, from, to) {
    var list = sorted(coll);
    if (from < 0 || to < 0 || from >= list.length || to >= list.length) { return false; }
    list.splice(to, 0, list.splice(from, 1)[0]);
    list.forEach(function (x, n) { x.sort = n; });
    saveData(true);
    return true;
  }

  /** Renumber sort keys 0..n-1 after a delete. */
  function resequence(coll) {
    sorted(coll).forEach(function (x, n) { x.sort = n; });
  }

  function togglePublished(coll, id) {
    var it = getItem(coll, id);
    if (!it) { return null; }
    it.published = !it.published;
    it.updatedAt = nowISO();
    saveData(true);
    return it;
  }

  /* ══════════════════════════════════════════════════════════════════════
     DESTINATIONS
     ══════════════════════════════════════════════════════════════════ */

  function blankDestination() {
    return {
      id: '', name: '', slug: '', region: '', regionId: '', state: '',
      shortDescription: '', description: '', image: '', gallery: [],
      bestTime: '', duration: '', featured: false, published: false,
      sort: all('destinations').length,
      createdAt: nowISO(), updatedAt: nowISO()
    };
  }

  /** A readable, unique destination id — it doubles as the URL slug. */
  function uniqueDestId(seed, ownId) {
    var base = 'dst-' + (slugify(seed) || 'place');
    var out = base, n = 2;
    var taken = function (s) {
      return all('destinations').some(function (d) { return d.id === s && d.id !== ownId; });
    };
    while (taken(out)) { out = base + '-' + n; n++; }
    return out;
  }

  function createDestination(data) {
    var d = Object.assign(blankDestination(), data || {});
    d.id = uniqueDestId(d.name || d.id, null);
    d.slug = slugify(d.name);
    /* Keep the readable state label in step with the chosen region. */
    d.state = d.state || masterName(d.regionId);
    all('destinations').push(d);
    saveData(true);
    return d;
  }

  function updateDestination(id, patch) {
    var d = getItem('destinations', id);
    if (!d) { return null; }
    Object.assign(d, patch);
    if (patch.name !== undefined) { d.slug = slugify(patch.name); }
    if (patch.regionId !== undefined) { d.state = masterName(patch.regionId); }
    d.updatedAt = nowISO();
    saveData();
    return d;
  }

  /**
   * Deleting a destination that packages point at would leave those
   * packages orphaned, so report the usage instead and let the caller
   * decide. This is the one delete that can legitimately be refused.
   */
  function deleteDestination(id) {
    var used = all('packages').filter(function (p) { return p.destinationId === id; });
    if (used.length) {
      return {
        ok: false,
        usage: { count: used.length, where: used.map(function (p) { return p.name; }).slice(0, 6) }
      };
    }
    return { ok: deleteItem('destinations', id) };
  }

  function packagesForDestination(id) {
    return all('packages').filter(function (p) { return p.destinationId === id; });
  }

  /* ══════════════════════════════════════════════════════════════════════
     PACKAGES
     ══════════════════════════════════════════════════════════════════ */

  /* A package id doubles as its URL slug — package-details.html?id=classic-kerala-loop
     is what people share, so it is readable rather than random. It is set
     once at creation and only changed deliberately, because changing it
     breaks every link already out in the world. */
  function blankPackage() {
    return {
      id: '', name: '', slug: '',
      destinationId: '', categoryId: '',
      shortDescription: '', description: '',
      image: '', gallery: [],
      duration: '', guests: '2+ Guests',
      price: 0, originalPrice: 0, currency: 'INR',
      showPrice: false, priceNote: 'Enquire for pricing',
      featured: false, published: false,
      bookingStatus: 'available', seatsLeft: null,
      highlights: [], inclusions: [], exclusions: [], itinerary: [],
      sort: all('packages').length,
      createdAt: nowISO(), updatedAt: nowISO()
    };
  }

  function uniquePackageId(seed, ownId) {
    var base = slugify(seed) || 'journey', out = base, n = 2;
    var taken = function (s) {
      return all('packages').some(function (p) { return p.id === s && p.id !== ownId; });
    };
    while (taken(out)) { out = base + '-' + n; n++; }
    return out;
  }

  function createPackage(data) {
    var p = Object.assign(blankPackage(), data || {});
    p.id = uniquePackageId(p.id || p.name, null);
    p.slug = p.id;
    all('packages').push(p);
    saveData(true);
    return p;
  }

  function updatePackage(id, patch) {
    var p = getItem('packages', id);
    if (!p) { return null; }
    Object.assign(p, patch);
    p.updatedAt = nowISO();
    saveData();
    return p;
  }

  /**
   * Change a package id, repointing anything that referenced the old one.
   * Returns the id actually used, which may be suffixed to stay unique.
   */
  function renamePackageId(oldId, wanted) {
    var p = getItem('packages', oldId);
    if (!p) { return null; }
    var next = uniquePackageId(wanted, oldId);
    if (next === oldId) { return oldId; }

    p.id = next;
    p.slug = next;
    all('enquiries').forEach(function (e) {
      if (e.packageId === oldId) { e.packageId = next; }
    });
    p.updatedAt = nowISO();
    saveData(true);
    return next;
  }

  /* ── Itinerary days ────────────────────────────────────────────────── */

  function blankDay(n) {
    return {
      day: n, title: '', description: '', location: '',
      activities: [], image: ''
    };
  }

  function renumberDays(p) {
    (p.itinerary || []).forEach(function (d, i) { d.day = i + 1; });
  }

  function addItineraryDay(pkgId) {
    var p = getItem('packages', pkgId);
    if (!p) { return null; }
    p.itinerary = p.itinerary || [];
    var day = blankDay(p.itinerary.length + 1);
    p.itinerary.push(day);
    p.updatedAt = nowISO();
    saveData(true);
    return day;
  }

  function deleteItineraryDay(pkgId, index) {
    var p = getItem('packages', pkgId);
    if (!p || !p.itinerary || index < 0 || index >= p.itinerary.length) { return false; }
    p.itinerary.splice(index, 1);
    renumberDays(p);
    p.updatedAt = nowISO();
    saveData(true);
    return true;
  }

  function duplicateItineraryDay(pkgId, index) {
    var p = getItem('packages', pkgId);
    if (!p || !p.itinerary || !p.itinerary[index]) { return false; }
    var copy = clone(p.itinerary[index]);
    p.itinerary.splice(index + 1, 0, copy);
    renumberDays(p);
    p.updatedAt = nowISO();
    saveData(true);
    return true;
  }

  function moveItineraryDay(pkgId, from, to) {
    var p = getItem('packages', pkgId);
    if (!p || !p.itinerary) { return false; }
    if (from < 0 || to < 0 || from >= p.itinerary.length || to >= p.itinerary.length) { return false; }
    p.itinerary.splice(to, 0, p.itinerary.splice(from, 1)[0]);
    renumberDays(p);
    p.updatedAt = nowISO();
    saveData(true);
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     MASTERS — regions, categories, travel styles, booking statuses
     ══════════════════════════════════════════════════════════════════ */

  function masterList(key) { return (db.masters && db.masters[key]) || []; }

  function masterName(id) {
    for (var i = 0; i < MASTER_KEYS.length; i++) {
      var hit = masterList(MASTER_KEYS[i]).filter(function (r) { return r.id === id; })[0];
      if (hit) { return hit.name; }
    }
    return '';
  }

  function getMaster(key, id) {
    return masterList(key).filter(function (r) { return r.id === id; })[0] || null;
  }

  function createMaster(key, data) {
    var list = masterList(key);
    var prefix = { regions: 'reg', categories: 'cat', travelStyles: 'sty',
      bookingStatuses: 'st' }[key] || 'm';
    var row = Object.assign({
      id: prefix + '-' + (slugify(data && data.name) || generateId()),
      name: '', slug: slugify(data && data.name),
      active: true, sort: list.length
    }, data || {});
    /* Ids must stay unique or lookups silently pick the wrong row. */
    var base = row.id, n = 2;
    while (list.some(function (r) { return r.id === row.id; })) {
      row.id = base + '-' + n; n++;
    }
    list.push(row);
    saveData(true);
    return row;
  }

  function updateMaster(key, id, patch) {
    var row = getMaster(key, id);
    if (!row) { return null; }
    Object.assign(row, patch);
    if (patch.name !== undefined) { row.slug = slugify(patch.name); }
    saveData();

    /* A region rename must flow through to the destinations showing it. */
    if (key === 'regions' && patch.name !== undefined) {
      all('destinations').forEach(function (d) {
        if (d.regionId === id) { d.state = patch.name; }
      });
      saveData(true);
    }
    return row;
  }

  /** Where a master row is referenced, so a delete can be refused. */
  function masterUsage(key, id) {
    var where = [];
    if (key === 'regions') {
      all('destinations').forEach(function (d) {
        if (d.regionId === id) { where.push(d.name); }
      });
    } else if (key === 'categories') {
      all('packages').forEach(function (p) {
        if (p.categoryId === id) { where.push(p.name); }
      });
    } else if (key === 'bookingStatuses') {
      all('packages').forEach(function (p) {
        if (p.bookingStatus === id) { where.push(p.name); }
      });
    }
    return { count: where.length, where: where.slice(0, 6) };
  }

  function deleteMaster(key, id) {
    var usage = masterUsage(key, id);
    if (usage.count) { return { ok: false, usage: usage }; }
    var list = masterList(key);
    var i = list.findIndex(function (r) { return r.id === id; });
    if (i < 0) { return { ok: false, usage: usage }; }
    list.splice(i, 1);
    list.forEach(function (r, n) { r.sort = n; });
    saveData(true);
    return { ok: true };
  }

  function moveMaster(key, id, dir) {
    var list = masterList(key);
    list.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    var i = list.findIndex(function (r) { return r.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) { return false; }
    var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    list.forEach(function (r, n) { r.sort = n; });
    saveData(true);
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     SETTINGS
     ══════════════════════════════════════════════════════════════════ */

  function updateSettings(patch) {
    /* Merge one level deep so nested groups (hero, home, pages, seo)
       survive a partial update. */
    Object.keys(patch).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) {
        db.settings[k] = Object.assign({}, db.settings[k], patch[k]);
      } else {
        db.settings[k] = patch[k];
      }
    });
    saveData();
    return db.settings;
  }

  /* ══════════════════════════════════════════════════════════════════════
     ENQUIRIES
     ══════════════════════════════════════════════════════════════════ */

  /**
   * The contact form parks submissions in the visitor's own localStorage
   * when no live endpoint is configured. Pulling them in here is what makes
   * the local demo genuinely work — and it is also exactly why a deployed
   * static site needs a real endpoint, since a visitor's browser is not
   * somewhere you can read from.
   */
  function pullLocalEnquiries() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(LOCAL_ENQ) || '[]'); }
    catch (e) { return 0; }
    if (!Array.isArray(raw) || !raw.length) { return 0; }

    var have = {};
    all('enquiries').forEach(function (e) {
      have[e.id || (e.email + e.receivedAt)] = true;
    });

    var added = 0;
    raw.forEach(function (e) {
      var key = e.id || (e.email + e.receivedAt);
      if (have[key]) { return; }
      all('enquiries').unshift(Object.assign(
        { id: e.id || generateId('enq'), status: 'new' }, e));
      added++;
    });
    if (added) { saveData(true); }
    return added;
  }

  function setEnquiryStatus(id, status) {
    return updateItem('enquiries', id, { status: status });
  }

  /* ══════════════════════════════════════════════════════════════════════
     DASHBOARD
     ══════════════════════════════════════════════════════════════════ */

  function stats() {
    return {
      destinations: all('destinations').length,
      publishedDestinations: all('destinations').filter(function (d) { return d.published; }).length,
      packages: all('packages').length,
      publishedPackages: all('packages').filter(function (p) { return p.published; }).length,
      draftPackages: all('packages').filter(function (p) { return !p.published; }).length,
      adventures: all('adventures').length,
      testimonials: all('testimonials').length,
      gallery: all('gallery').length,
      faqs: all('faqs').length,
      enquiries: all('enquiries').length,
      newEnquiries: all('enquiries').filter(function (e) {
        return (e.status || 'new') === 'new';
      }).length
    };
  }

  /** The six records touched most recently, across content types. */
  function recentlyEdited(n) {
    var rows = [];
    ['packages', 'destinations', 'adventures', 'testimonials', 'gallery', 'faqs']
      .forEach(function (coll) {
        all(coll).forEach(function (x) {
          rows.push({
            coll: coll,
            id: x.id,
            label: x.name || x.title || x.question || '(untitled)',
            published: x.published !== false,
            updatedAt: x.updatedAt || x.createdAt || ''
          });
        });
      });
    return rows
      .filter(function (r) { return r.updatedAt; })
      .sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); })
      .slice(0, n || 6);
  }

  /** Things worth telling the user about before they publish. */
  function healthChecks() {
    var out = [];

    all('packages').forEach(function (p) {
      if (!p.published) { return; }
      var to = 'package-editor.html?id=' + encodeURIComponent(p.id);
      if (!p.image) {
        out.push({ level: 'warn', text: p.name + ' has no cover photograph.', href: to + '&tab=media' });
      }
      if (!(p.itinerary || []).length) {
        out.push({ level: 'warn', text: p.name + ' is published with no itinerary days.', href: to + '&tab=itinerary' });
      }
      if (!p.destinationId) {
        out.push({ level: 'warn', text: p.name + ' is not linked to a destination.', href: to + '&tab=basic' });
      }
      if (!p.duration) {
        out.push({ level: 'info', text: p.name + ' has no duration set.', href: to + '&tab=basic' });
      }
      if (p.showPrice && !Number(p.price)) {
        out.push({ level: 'warn', text: p.name + ' shows a price but none is set.', href: to + '&tab=pricing' });
      }
    });

    all('destinations').forEach(function (dst) {
      if (dst.published && !dst.image) {
        out.push({
          level: 'warn',
          text: dst.name + ' has no photograph, so its card will be blank.',
          href: 'destination-editor.html?id=' + encodeURIComponent(dst.id)
        });
      }
    });

    if (!all('packages').filter(function (p) { return p.published && p.featured; }).length) {
      out.push({
        level: 'info',
        text: 'No published package is featured, so the home page will fall back to the first few.',
        href: 'packages.html'
      });
    }
    if (!all('destinations').filter(function (dst) { return dst.published && dst.featured; }).length) {
      out.push({
        level: 'info',
        text: 'No destination is featured, so the home page grid falls back to the first nine.',
        href: 'destinations.html'
      });
    }

    var s = db.settings || {};
    if (!s.phone) { out.push({ level: 'warn', text: 'No phone number is set, so the call buttons go nowhere.', href: 'settings.html' }); }
    if (!s.email) { out.push({ level: 'warn', text: 'No email address is set.', href: 'settings.html' }); }
    if (!((s.hero || {}).images || []).length) {
      out.push({ level: 'warn', text: 'The home hero has no images.', href: 'settings.html#hero' });
    }
    if (!(s.enquiry && s.enquiry.endpoint)) {
      out.push({
        level: 'info',
        text: 'Enquiries are being kept in each visitor\u2019s own browser. Set a form endpoint to receive them.',
        href: 'settings.html#enquiry'
      });
    }
    return out;
  }

  /* ── Public surface ────────────────────────────────────────────────── */
  return {
    BASE: BASE,
    FILES: FILES,
    MASTER_KEYS: MASTER_KEYS,
    COLLECTIONS: COLLECTIONS,
    LOCAL_ENQ: LOCAL_ENQ,

    boot: boot,
    loadJSON: loadJSON,
    saveData: saveData,
    flush: flush,
    saveFailed: saveFailed,
    discardDraft: discardDraft,
    generateId: generateId,
    slugify: slugify,
    clone: clone,
    on: on,

    get db() { return db; },
    changedFiles: changedFiles,
    isDirty: isDirty,

    preview: preview,
    previewOn: previewOn,

    status: status,
    forgetStatus: forgetStatus,
    authMode: authMode,
    unlock: unlock,
    isAuthed: isAuthed,
    lockout: lockout,
    logout: logout,
    isLoggedIn: isLoggedIn,
    publish: publish,
    exportZip: exportZip,
    exportOne: exportOne,
    importJSON: importJSON,

    // generic collections
    all: all,
    sorted: sorted,
    getItem: getItem,
    addItem: addItem,
    updateItem: updateItem,
    deleteItem: deleteItem,
    duplicateItem: duplicateItem,
    moveItem: moveItem,
    reorder: reorder,
    togglePublished: togglePublished,

    // destinations
    blankDestination: blankDestination,
    createDestination: createDestination,
    updateDestination: updateDestination,
    deleteDestination: deleteDestination,
    packagesForDestination: packagesForDestination,

    // packages
    blankPackage: blankPackage,
    createPackage: createPackage,
    updatePackage: updatePackage,
    renamePackageId: renamePackageId,
    uniquePackageId: uniquePackageId,

    // itinerary
    blankDay: blankDay,
    addItineraryDay: addItineraryDay,
    deleteItineraryDay: deleteItineraryDay,
    duplicateItineraryDay: duplicateItineraryDay,
    moveItineraryDay: moveItineraryDay,

    // masters
    masterList: masterList,
    masterName: masterName,
    getMaster: getMaster,
    createMaster: createMaster,
    updateMaster: updateMaster,
    deleteMaster: deleteMaster,
    masterUsage: masterUsage,
    moveMaster: moveMaster,

    // photos
    addPhoto: addPhoto,
    getPhoto: getPhoto,
    deletePhoto: deletePhoto,
    resolveImage: resolveImage,
    pendingPhotos: pendingPhotos,
    prunePhotos: prunePhotos,
    clearPhotos: clearPhotos,

    // settings + enquiries + dashboard
    updateSettings: updateSettings,
    pullLocalEnquiries: pullLocalEnquiries,
    setEnquiryStatus: setEnquiryStatus,
    stats: stats,
    recentlyEdited: recentlyEdited,
    healthChecks: healthChecks
  };
}());
