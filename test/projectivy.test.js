import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppServer } from '../server.js';
import { buildBriefing } from '../lib/briefing.js';
import { buildWallpaperSvg, renderWallpaperPng, resolveWallpaperTheme } from '../lib/wallpaper.js';

const MOCK_WEATHER = async () => ({
  locationName: 'Aarhus, DK',
  units: 'celsius',
  temperature: 9,
  high: 11,
  low: 4,
  condition: 'Let skyet',
  icon: 'sun-cloud',
  sunrise: '2026-11-23T08:02',
  sunset: '2026-11-23T15:54',
});

test('Projectivy Overflight & Wallpaper renderer', async (t) => {
  await t.test('resolves paper by day and oled after sunset in auto mode', () => {
    const dayBriefing = {
      generatedAt: '2026-11-23T11:00:00Z', // 12:00 CET
      timezone: 'Europe/Copenhagen',
      weather: { sunrise: '2026-11-23T08:02', sunset: '2026-11-23T15:54' },
    };
    const nightBriefing = {
      generatedAt: '2026-11-23T19:00:00Z', // 20:00 CET
      timezone: 'Europe/Copenhagen',
      weather: { sunrise: '2026-11-23T08:02', sunset: '2026-11-23T15:54' },
    };
    assert.equal(resolveWallpaperTheme(dayBriefing, 'auto'), 'paper');
    assert.equal(resolveWallpaperTheme(nightBriefing, 'auto'), 'oled');
    assert.equal(resolveWallpaperTheme(dayBriefing, 'oled'), 'oled');
    assert.equal(resolveWallpaperTheme(nightBriefing, 'paper'), 'paper');
  });

  await t.test('renders valid SVG and PNG buffers for both paper and oled themes', async () => {
    const briefing = await buildBriefing({
      query: { demo: '1', name: 'Anne', city: 'Aarhus, DK' },
      now: new Date('2026-11-23T10:30:00Z'),
      weatherFetcher: MOCK_WEATHER,
    });

    const svg = buildWallpaperSvg(briefing, { themeMode: 'oled' });
    assert.match(svg, /<svg[^>]+width="1920" height="1080"/);
    assert.match(svg, /DAGENS PROGRAM/);
    assert.match(svg, /Aarhus, DK/);

    const png = renderWallpaperPng(briefing, { themeMode: 'oled', width: 1280 });
    assert.ok(Buffer.isBuffer(png));
    assert.ok(png.length > 10_000, `Expected non-trivial PNG, got ${png.length} bytes`);
    // PNG magic signature: 89 50 4E 47 0D 0A 1A 0A
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  });

  await t.test('serves /api/projectivy JSON feed and /api/wallpaper PNG over HTTP', async () => {
    const server = createAppServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    try {
      const feedRes = await fetch(`${base}/api/projectivy?theme=oled&demo=1`);
      assert.equal(feedRes.status, 200);
      assert.match(feedRes.headers.get('content-type') || '', /application\/json/);
      const feed = await feedRes.json();
      assert.ok(Array.isArray(feed) && feed.length === 1);
      assert.equal(feed[0].author, 'Terminallike');
      assert.match(feed[0].url_img, /\/api\/wallpaper\?/);
      assert.match(feed[0].url_img, /theme=oled/);
      assert.match(feed[0].url_img, /t=\d+/);

      const imgRes = await fetch(feed[0].url_img);
      assert.equal(imgRes.status, 200);
      assert.equal(imgRes.headers.get('content-type'), 'image/png');
      const buf = Buffer.from(await imgRes.arrayBuffer());
      assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
