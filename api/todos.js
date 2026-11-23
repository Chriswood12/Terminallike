import { getTodos, mutateTodo, syncAppleReminders } from '../lib/todos.js';

/**
 * /api/todos — GET returns current to-dos/reminders; POST syncs Apple Påmindelser
 * from iOS Shortcuts or adds/toggles/deletes individual items.
 *
 * Optional auth: set TODOS_SECRET in Vercel Environment Variables to require
 * Authorization: Bearer <TODOS_SECRET> (or ?token=<TODOS_SECRET>) on POST.
 */
export default async function handler(req, res) {
  const method = req.method || 'GET';

  if (method === 'GET' || method === 'HEAD') {
    const query = req.query || parseQueryFromUrl(req.url);
    const data = await getTodos({ demoMode: query.demo === '1' });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(JSON.stringify(data));
    return;
  }

  if (method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Optional shared secret check when TODOS_SECRET is configured
  const secret = (process.env.TODOS_SECRET || '').trim();
  if (secret) {
    const query = req.query || parseQueryFromUrl(req.url);
    const authHeader = String(req.headers?.authorization || '');
    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const provided = bearer || String(query.token || '').trim();
    if (provided !== secret) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  try {
    const body = await readBody(req);
    let result;

    if (body && (body.reminders !== undefined || body.source === 'apple-reminders' || typeof body === 'string' || Array.isArray(body))) {
      const payload = typeof body === 'string' || Array.isArray(body) ? body : body.reminders;
      result = await syncAppleReminders(payload);
    } else if (body && body.action) {
      result = await mutateTodo(body);
    } else {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Send { reminders: [...] } or { action: "add"|"toggle"|"delete", ... }' }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: err.message || 'Kunne ikke gemme påmindelser' }));
  }
}

function parseQueryFromUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl, 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return req.body;
      }
    }
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
