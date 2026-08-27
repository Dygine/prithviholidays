/* =============================================================================
   CLOUDFLARE PAGES ADAPTER — Prithvi Holidays
   -----------------------------------------------------------------------------
   Cloudflare Pages Functions hand us a standard Request and an env object of
   bindings. Same job as the Vercel adapter: parse, route, respond. All the
   real work is in ../../lib/github.mjs.

   The file lives at functions/api/site.js, so Cloudflare serves it at
   /api/site with no configuration at all.
   ========================================================================== */

import { route } from '../../lib/github.mjs';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'That request was not valid JSON.' }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  try {
    const result = await route(payload.action, env, payload);
    return new Response(JSON.stringify(result.body), { status: result.status, headers: JSON_HEADERS });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || 'Something went wrong on the server.' }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}

/* Anything other than POST gets a clear answer rather than a 404, which
   would look identical to "this host does not run functions at all". */
export async function onRequest({ request }) {
  if (request.method === 'POST') { return; }
  return new Response(
    JSON.stringify({ ok: false, error: 'Use POST.' }),
    { status: 405, headers: JSON_HEADERS }
  );
}
