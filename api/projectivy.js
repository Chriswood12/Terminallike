import { getConfig } from '../lib/env.js';

/**
 * Overflight-compatible JSON feed for Projectivy Launcher.
 * Point Projectivy's Overflight plugin at: https://<your-app>.vercel.app/api/projectivy
 *
 * Optional query params forwarded to /api/wallpaper:
 *   ?theme=auto|paper|oled
 *   ?width=1920|3840
 *   ?name=...&city=...&units=...&demo=1
 */
export default function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const query = { ...(req.query || parseQueryFromUrl(req.url)) };
  const config = getConfig(query);
  const origin = resolveOrigin(req);

  const imgUrl = new URL('/api/wallpaper', origin);
  for (const [k, v] of Object.entries(query)) {
    if (k === 't' || v === undefined || v === '') continue;
    imgUrl.searchParams.set(k, String(v));
  }
  // 5-minute cache-busting bucket so Overflight / Projectivy fetches a fresh PNG on refresh.
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  imgUrl.searchParams.set('t', String(bucket));

  const payload = [
    {
      location: config.location.name,
      title: `Dagens overblik — ${config.personName}`,
      author: 'Terminallike',
      url_img: imgUrl.toString(),
    },
  ];

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(JSON.stringify(payload, null, 2));
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

function parseQueryFromUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl, 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}
