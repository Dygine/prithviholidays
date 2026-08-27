/* =============================================================================
   VERCEL ADAPTER — Prithvi Holidays
   -----------------------------------------------------------------------------
   Vercel gives us a Node request and response. Turn them into the plain
   { action, payload } shape the publishing core understands, then write the
   answer back out. All the real work is in ../lib/github.mjs.
   ========================================================================== */

import { route } from '../lib/github.mjs';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Use POST.' });
    return;
  }

  let payload = req.body;

  /* Some Vercel runtimes hand the body over already parsed, some do not. */
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (err) { payload = null; }
  }
  if (!payload) {
    const chunks = [];
    for await (const chunk of req) { chunks.push(chunk); }
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch (err) { payload = {}; }
  }

  try {
    const result = await route(payload.action, process.env, payload);
    res.status(result.status).json(result.body);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Something went wrong on the server.' });
  }
}
