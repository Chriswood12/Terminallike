import { buildScriptableSource } from '../lib/scriptable-widget.js';

/**
 * Serves the ready-to-paste iOS Scriptable widget pre-configured with this
 * deployment's exact URL so no manual URL editing is needed on iPhone.
 *
 * Open https://<your-app>.vercel.app/api/scriptable on your iPhone,
 * copy all text, paste into Scriptable, and add the widget to your Home Screen.
 */
export default function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const origin = resolveOrigin(req);
  const script = buildScriptableSource(origin);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="Terminallike.js"');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(script);
}

function resolveOrigin(req) {
  const protoHeader = req.headers?.['x-forwarded-proto'];
  const hostHeader = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:3000';
  const proto = protoHeader
    ? String(protoHeader).split(',')[0].trim()
    : hostHeader.startsWith('localhost') || hostHeader.startsWith('127.')
      ? 'http'
      : 'https';
  return `${proto}://${String(hostHeader).split(',')[0].trim()}`;
}
