#!/usr/bin/env node
/* =============================================================================
   LOCAL DEV SERVER  (optional — the site itself needs no server at all)
   -----------------------------------------------------------------------------
   `python3 -m http.server` is enough to look at the site and use the admin.
   It cannot answer POST, though, so the publish button has nothing to talk to.

   This serves the same files AND runs /api/site, which lets you test the whole
   publish path locally before you deploy anywhere.

       GITHUB_TOKEN=ghp_xxx \
       GITHUB_REPO=you/prithvi-holidays \
       ADMIN_PASSWORD=something \
       node dev-server.mjs

   Run it with no environment variables at all and the admin correctly reports
   that publishing is not connected, which is the other case worth testing.

   Node 18+. No dependencies.
   ========================================================================== */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route } from './lib/github.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (err) { resolve({}); }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  /* ---- the publishing endpoint ---------------------------------------- */
  if (url.pathname === '/api/site') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Use POST.' }));
      return;
    }
    const payload = await readBody(req);
    try {
      const result = await route(payload.action, process.env, payload);
      res.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  /* ---- static files ---------------------------------------------------- */
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) { rel += 'index.html'; }

  /* Never serve anything outside the project folder. */
  const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(path);
    if (info.isDirectory()) { throw new Error('directory'); }
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (err) {
    try {
      const notFound = await readFile(join(ROOT, '404.html'));
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(notFound);
    } catch (e) {
      res.writeHead(404).end('Not found');
    }
  }
});

server.listen(PORT, () => {
  const configured = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO && process.env.ADMIN_PASSWORD);
  console.log(`\n  Prithvi Holidays running at http://localhost:${PORT}`);
  console.log(`  Admin at                 http://localhost:${PORT}/admin/`);
  console.log(configured
    ? `  Publishing:              connected to ${process.env.GITHUB_REPO}\n`
    : `  Publishing:              not connected (set GITHUB_TOKEN, GITHUB_REPO and ADMIN_PASSWORD to test it)\n`);
});
