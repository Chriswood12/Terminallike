import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearAiCache,
  generateDailySummary,
  generateLocalSummary,
  resolveAiProvider,
} from '../lib/ai.js';

describe('AI summary engine', () => {
  beforeEach(() => {
    clearAiCache();
  });

  it('resolves providers in priority order for auto mode', () => {
    assert.equal(resolveAiProvider({ provider: 'auto' }).provider, 'local');
    assert.equal(
      resolveAiProvider({ provider: 'auto', geminiKey: 'g-key', openaiKey: 'o-key' }).provider,
      'gemini',
    );
    assert.equal(
      resolveAiProvider({ provider: 'openai', geminiKey: 'g-key', openaiKey: 'o-key' }).provider,
      'openai',
    );
    assert.equal(
      resolveAiProvider({ provider: 'anthropic', anthropicKey: 'a-key' }).provider,
      'anthropic',
    );
    assert.equal(
      resolveAiProvider({ provider: 'none', geminiKey: 'g-key' }).provider,
      'local',
    );
  });

  it('generates a natural smart local fallback summary', () => {
    const now = new Date('2026-11-23T16:00:00.000Z'); // 8:00 AM PST
    const text = generateLocalSummary({
      personName: 'Maya',
      now,
      timeZone: 'America/Los_Angeles',
      todayEvents: [
        {
          id: '1',
          title: 'Design Critique',
          start: '2026-11-23T18:00:00.000Z',
          end: '2026-11-23T19:00:00.000Z',
          allDay: false,
          calendar: 'Work',
        },
        {
          id: '2',
          title: 'Dinner at Nopa',
          start: '2026-11-24T03:00:00.000Z',
          end: '2026-11-24T04:30:00.000Z',
          allDay: false,
          location: 'Divisadero',
          calendar: 'Together',
        },
      ],
      tomorrowEvents: [],
      weather: {
        available: true,
        condition: 'Partly Cloudy',
        high: 64,
        unitSymbol: '°F',
        precipChance: 10,
      },
      dayRhythm: {
        busyMinutes: 150,
        longestOpenWindow: { minutes: 360, label: '11 AM – 5 PM' },
      },
    });

    assert.match(text, /Design Critique/);
    assert.match(text, /64°F/);
  });

  it('calls Gemini and caches subsequent identical requests', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'A bright, balanced Monday awaits with plenty of breathing room.' }],
              },
            },
          ],
        }),
      };
    };

    const ctx = {
      personName: 'Maya',
      now: new Date('2026-11-23T16:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      todayEvents: [],
      tomorrowEvents: [],
      weather: { available: false },
      dayRhythm: { busyMinutes: 0, longestOpenWindow: null },
    };
    const cfg = { provider: 'gemini', geminiKey: 'test-key', cacheMinutes: 30 };

    const first = await generateDailySummary(ctx, cfg, mockFetch);
    const second = await generateDailySummary(ctx, cfg, mockFetch);

    assert.equal(calls, 1);
    assert.equal(first.provider, 'gemini');
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(second.text, first.text);
  });

  it('falls back to local summary gracefully if AI provider fails', async () => {
    const failingFetch = async () => ({ ok: false, status: 503 });
    const ctx = {
      personName: 'Maya',
      now: new Date('2026-11-23T16:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      todayEvents: [],
      tomorrowEvents: [],
      weather: { available: false },
      dayRhythm: { busyMinutes: 0, longestOpenWindow: null },
    };

    const result = await generateDailySummary(
      ctx,
      { provider: 'openai', openaiKey: 'test-key' },
      failingFetch,
    );
    assert.equal(result.provider, 'local');
    assert.ok(result.text.length > 20);
    assert.match(result.fallbackReason, /503/);
  });
});
