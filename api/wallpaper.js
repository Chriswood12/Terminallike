import { buildBriefing } from '../lib/briefing.js';
import { buildWallpaperSvg, renderWallpaperPng } from '../lib/wallpaper.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const query = { ...(req.query || parseQueryFromUrl(req.url)) };
    const themeMode = query.theme || 'auto';
    const format = String(query.format || 'png').toLowerCase();
    const width = clampWidth(query.width);

    const briefing = await buildBriefing({ query });

    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (format === 'svg') {
      const svg = buildWallpaperSvg(briefing, { themeMode });
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(svg);
      return;
    }

    const png = renderWallpaperPng(briefing, { themeMode, width });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.length));
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(png);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: err.message || 'Kunne ikke generere wallpaper' }));
  }
}

function clampWidth(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1920;
  return Math.max(960, Math.min(3840, Math.round(n)));
}

function parseQueryFromUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl, 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}
