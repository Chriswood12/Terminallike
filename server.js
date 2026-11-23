import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDotEnv, getConfig } from './lib/env.js';
import briefingHandler from './api/briefing.js';
import geocodeHandler from './api/geocode.js';
import healthHandler from './api/health.js';
import wallpaperHandler from './api/wallpaper.js';
import projectivyHandler from './api/projectivy.js';
import scriptableHandler from './api/scriptable.js';
import todosHandler from './api/todos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function sendStaticFile(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.resolve(PUBLIC_DIR, '.' + safePath);

  // Prevent directory traversal outside public/
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not Found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=300');

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(resolved);
    stream.on('error', () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    stream.pipe(res);
  });
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    req.query = Object.fromEntries(url.searchParams.entries());

    if (url.pathname === '/api/briefing') {
      await briefingHandler(req, res);
      return;
    }
    if (url.pathname === '/api/geocode') {
      await geocodeHandler(req, res);
      return;
    }
    if (url.pathname === '/api/health') {
      healthHandler(req, res);
      return;
    }
    if (url.pathname === '/api/wallpaper') {
      await wallpaperHandler(req, res);
      return;
    }
    if (url.pathname === '/api/projectivy') {
      projectivyHandler(req, res);
      return;
    }
    if (url.pathname === '/api/scriptable') {
      scriptableHandler(req, res);
      return;
    }
    if (url.pathname === '/api/todos') {
      await todosHandler(req, res);
      return;
    }

    sendStaticFile(req, res, url.pathname);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  loadDotEnv();
  const config = getConfig();
  const server = createAppServer();
  server.listen(config.port, () => {
    console.log(`Terminallike running at http://localhost:${config.port}`);
    if (config.feeds.length === 0) {
      console.log('Mode: Demo (set ICS_URLS in .env to connect Google/iCloud calendars)');
    } else {
      console.log(`Mode: Live (${config.feeds.length} calendar feed${config.feeds.length === 1 ? '' : 's'})`);
    }
  });
}
