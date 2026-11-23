import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createAppServer } from '../server.js';

describe('HTTP server endpoints', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createAppServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('serves /api/health', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'terminallike');
  });

  it('serves static HTML, CSS, and JS assets from public/', async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-type') || '', /text\/html/);
    const html = await htmlRes.text();
    assert.match(html, /DAGENS OVERBLIK/);

    const cssRes = await fetch(`${baseUrl}/styles.css`);
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get('content-type') || '', /text\/css/);

    const jsRes = await fetch(`${baseUrl}/app.js`);
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get('content-type') || '', /javascript/);
  });

  it('serves /api/briefing in demo mode via GET and POST', async () => {
    const res = await fetch(`${baseUrl}/api/briefing?demo=1&name=Freja&tz=Europe/Copenhagen`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.demoMode, true);
    assert.equal(data.personName, 'Freja');
    assert.equal(data.locale, 'da-DK');
    assert.ok(Array.isArray(data.today.events));
    assert.ok(Array.isArray(data.tomorrow.events));
    assert.ok(typeof data.summary.text === 'string' && data.summary.text.length > 10);

    const postRes = await fetch(`${baseUrl}/api/briefing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demo: '1', name: 'Sofie', note: 'God dag!' }),
    });
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.personName, 'Sofie');
    assert.equal(postData.personalNote, 'God dag!');
  });

  it('ensures every DOM ID referenced in app.js exists in index.html', async () => {
    const html = await (await fetch(`${baseUrl}/`)).text();
    const js = await (await fetch(`${baseUrl}/app.js`)).text();
    const css = await (await fetch(`${baseUrl}/styles.css`)).text();

    const ids = [...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    const missing = ids.filter((id) => !html.includes(`id="${id}"`));
    assert.deepEqual(missing, []);
    assert.match(css, /\.week-view/);
  });

  it('blocks path traversal attempts', async () => {
    const res = await fetch(`${baseUrl}/../package.json`);
    assert.ok(res.status === 403 || res.status === 404);
  });
});
