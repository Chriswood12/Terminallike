import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppServer } from '../server.js';
import { buildScriptableSource } from '../lib/scriptable-widget.js';

test('iOS Scriptable widget endpoint', async (t) => {
  await t.test('generates syntactically valid JS pre-configured with BASE_URL', () => {
    const src = buildScriptableSource('https://terminallike.vercel.app/');
    assert.match(src, /const BASE_URL = "https:\/\/terminallike\.vercel\.app";/);
    assert.match(src, /buildSmallWidget/);
    assert.match(src, /buildMediumWidget/);
    assert.match(src, /buildLargeWidget/);
    assert.match(src, /buildLockScreenWidget/);

    // Verify valid JS syntax (wrapped in async function because Scriptable supports top-level await)
    assert.doesNotThrow(() => new Function(`return async () => {\n${src}\n};`));
  });

  await t.test('serves /api/scriptable over HTTP with request origin injected', async () => {
    const server = createAppServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${base}/api/scriptable`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes(`const BASE_URL = "${base}";`), 'Expected BASE_URL to match request origin');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
