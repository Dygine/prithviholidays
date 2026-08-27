/* =============================================================================
   CLOUDFLARE WORKER — Prithvi Holidays
   -----------------------------------------------------------------------------
   Everything except /api/site is a plain static file, served by Cloudflare's
   asset handler. /api/site is the one dynamic endpoint: it checks the passcode
   and writes content to GitHub.

   The GitHub token lives in the Worker's environment and is never sent to a
   browser. That is the whole reason this file exists.

   Deploy with `npx wrangler deploy`, or let Cloudflare build from GitHub.
   ========================================================================== */

import { route } from './lib/github.mjs';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* Anything that is not the API is a file on disk. */
    if (url.pathname !== '/api/site') {
      return env.ASSETS.fetch(request);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    let action = 'status';
    let payload = {};

    if (request.method === 'GET') {
      action = url.searchParams.get('action') || 'status';
    } else if (request.method === 'POST') {
      try {
        payload = (await request.json()) || {};
      } catch (err) {
        payload = {};
      }
      action = payload.action || 'status';
    } else {
      return json({ ok: false, error: 'Method not allowed.' }, 405);
    }

    try {
      const result = await route(action, env, payload);
      return json(result.body, result.status);
    } catch (err) {
      return json({ ok: false, error: err.message || 'Something went wrong.' }, 500);
    }
  }
};
