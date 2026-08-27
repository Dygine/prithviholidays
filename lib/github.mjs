/* =============================================================================
   PRITHVI HOLIDAYS — GITHUB PUBLISHING CORE
   -----------------------------------------------------------------------------
   Takes the JSON the admin produced and writes it into the GitHub repository as
   a single commit. The host (Cloudflare Pages, Vercel, Netlify) sees the push
   and rebuilds the site by itself.

   This is the only place the GitHub token is ever touched, and it runs on the
   server. The browser never sees it — that is the whole point of the file.

   Written with nothing but `fetch` and Web Crypto, both of which exist in
   Node 18+ and in Cloudflare Workers, so one file runs on every host.

   Environment variables:
     GITHUB_TOKEN     fine-grained token, Contents: read + write, this repo only
     GITHUB_REPO      "owner/repository"
     GITHUB_BRANCH    optional, defaults to "main"
     ADMIN_PASSWORD   the password that opens the admin
   ========================================================================== */

const API = 'https://api.github.com';
const UA = 'prithvi-holidays-admin';

/* Only these paths may ever be written. A stolen session can change site
   content, which is bad enough — it must not be able to rewrite index.html,
   drop a script into /assets, or edit a CI workflow. */
const WRITABLE = [/^data\/[A-Za-z0-9._-]+\.json$/, /^uploads\/[A-Za-z0-9._-]+$/];

const SESSION_HOURS = 12;
const MAX_FILES = 60;
const MAX_BYTES = 4 * 1024 * 1024;

/* ---------------------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------------------ */

export function readEnv(env) {
  const src = env || {};
  return {
    token: src.GITHUB_TOKEN || '',
    repo: src.GITHUB_REPO || '',
    branch: src.GITHUB_BRANCH || 'main',
    password: src.ADMIN_PASSWORD || ''
  };
}

/** True when this deployment can publish on its own. */
export function isConfigured(cfg) {
  return Boolean(cfg.token && cfg.repo && cfg.repo.includes('/'));
}

const encoder = new TextEncoder();

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Length-independent compare, so the password cannot be guessed by timing. */
export function safeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) { return false; }
  let diff = 0;
  for (let i = 0; i < x.length; i++) { diff |= x.charCodeAt(i) ^ y.charCodeAt(i); }
  return diff === 0;
}

/* ---------------------------------------------------------------------------
   Session tokens
   -----------------------------------------------------------------------------
   The password is checked once at sign-in. After that the browser holds a
   short-lived signed token instead, so the password is not sent with every
   publish. The signature uses the password itself as the secret, which means
   changing the password immediately invalidates every open session.
   ------------------------------------------------------------------------ */

export async function issueToken(password) {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const sig = await hmac(password, String(expires));
  return expires + '.' + sig;
}

export async function verifyToken(token, password) {
  if (!token || !password) { return false; }
  const parts = String(token).split('.');
  if (parts.length !== 2) { return false; }
  const expires = Number(parts[0]);
  if (!Number.isFinite(expires) || Date.now() > expires) { return false; }
  return safeEqual(parts[1], await hmac(password, parts[0]));
}

/* ---------------------------------------------------------------------------
   Path safety
   ------------------------------------------------------------------------ */

function normalise(path) {
  return String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
}

/** Reject anything outside data/ and uploads/, and any traversal attempt. */
export function checkPaths(files) {
  const bad = [];
  for (const file of files) {
    const p = normalise(file.path);
    if (p.includes('..') || p.includes('//') || !WRITABLE.some((re) => re.test(p))) {
      bad.push(p || '(empty)');
    }
  }
  return bad;
}

/* ---------------------------------------------------------------------------
   GitHub calls
   ------------------------------------------------------------------------ */

async function gh(cfg, path, options) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': UA,
      ...(options && options.headers)
    }
  });

  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (err) { body = { raw: text }; }

  if (!res.ok) {
    const message = (body && body.message) || ('GitHub returned ' + res.status);
    const error = new Error(message);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

/**
 * Write every file in ONE commit.
 *
 * files: [{ path: 'data/packages.json', content: '…', encoding: 'utf-8' | 'base64' }]
 *
 * Uses the Git Data API — blobs, then a tree, then a commit — rather than the
 * Contents API, which would need one commit per file and trigger one site
 * rebuild per file along with it.
 */
export async function commitFiles(cfg, files, message) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('There were no files to publish.');
  }

  const repo = '/repos/' + cfg.repo;

  /* Where the branch is right now. */
  const ref = await gh(cfg, repo + '/git/ref/heads/' + encodeURIComponent(cfg.branch));
  const headSha = ref.object.sha;
  const headCommit = await gh(cfg, repo + '/git/commits/' + headSha);
  const baseTree = headCommit.tree.sha;

  /* Upload each file as a blob, in small batches so a large publish does not
     open dozens of sockets at once and get rate-limited. */
  const blobs = [];
  const BATCH = 8;

  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const done = await Promise.all(slice.map(async (file) => {
      const encoding = file.encoding === 'base64' ? 'base64' : 'utf-8';
      const blob = await gh(cfg, repo + '/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: file.content, encoding })
      });
      return { path: normalise(file.path), mode: '100644', type: 'blob', sha: blob.sha };
    }));
    blobs.push(...done);
  }

  /* One tree, one commit, one push. */
  const tree = await gh(cfg, repo + '/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree: blobs })
  });

  const commit = await gh(cfg, repo + '/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: message || 'Update site content from the admin',
      tree: tree.sha,
      parents: [headSha]
    })
  });

  await gh(cfg, repo + '/git/refs/heads/' + encodeURIComponent(cfg.branch), {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return { commit: commit.sha, files: blobs.length, branch: cfg.branch };
}

/* ---------------------------------------------------------------------------
   Request handlers, shared by every host adapter
   ------------------------------------------------------------------------ */

export async function handleStatus(env) {
  const cfg = readEnv(env);
  return {
    status: 200,
    body: {
      ok: true,
      configured: isConfigured(cfg) && Boolean(cfg.password),
      hasToken: Boolean(cfg.token),
      hasRepo: Boolean(cfg.repo),
      hasPassword: Boolean(cfg.password),
      repo: cfg.repo ? (cfg.repo.split('/')[1] || '') : '',
      branch: cfg.branch
    }
  };
}

export async function handleLogin(env, payload) {
  const cfg = readEnv(env);

  if (!cfg.password) {
    return {
      status: 501,
      body: { ok: false, configured: false, code: 'no-password', error: 'No ADMIN_PASSWORD is set on the server.' }
    };
  }

  if (!safeEqual(payload && payload.password, cfg.password)) {
    return { status: 401, body: { ok: false, error: 'That password does not match.' } };
  }

  return {
    status: 200,
    body: { ok: true, token: await issueToken(cfg.password), canPublish: isConfigured(cfg) }
  };
}

export async function handlePublish(env, payload) {
  const cfg = readEnv(env);

  if (!cfg.password) {
    return { status: 501, body: { ok: false, configured: false, error: 'No ADMIN_PASSWORD is set on the server.' } };
  }
  if (!isConfigured(cfg)) {
    return {
      status: 501,
      body: { ok: false, configured: false, error: 'GITHUB_TOKEN and GITHUB_REPO are not set on the server.' }
    };
  }

  const authorised =
    (await verifyToken(payload && payload.token, cfg.password)) ||
    safeEqual(payload && payload.password, cfg.password);

  if (!authorised) {
    return { status: 401, body: { ok: false, error: 'Your session has expired. Sign in again.' } };
  }

  const files = (payload && payload.files) || [];
  if (!files.length) {
    return { status: 400, body: { ok: false, error: 'There were no files to publish.' } };
  }
  if (files.length > MAX_FILES) {
    return { status: 413, body: { ok: false, error: 'That is more files than one publish can carry.' } };
  }

  const bytes = files.reduce((n, f) => n + String(f.content || '').length, 0);
  if (bytes > MAX_BYTES) {
    return { status: 413, body: { ok: false, error: 'That publish is too large. Split it into two.' } };
  }

  const bad = checkPaths(files);
  if (bad.length) {
    return {
      status: 400,
      body: { ok: false, error: 'These paths are not writable: ' + bad.join(', ') }
    };
  }

  try {
    const result = await commitFiles(cfg, files, payload.message);
    return { status: 200, body: { ok: true, ...result } };
  } catch (err) {
    return {
      status: err.status === 401 || err.status === 403 ? 403 : 502,
      body: { ok: false, error: err.message || 'GitHub refused the update.' }
    };
  }
}

/** Route a parsed request to the right handler. Used by every adapter. */
export async function route(action, env, payload) {
  if (action === 'status') { return handleStatus(env); }
  if (action === 'login') { return handleLogin(env, payload); }
  if (action === 'publish') { return handlePublish(env, payload); }
  return { status: 404, body: { ok: false, error: 'Unknown action.' } };
}
