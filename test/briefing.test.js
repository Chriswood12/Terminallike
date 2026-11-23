import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildBriefing, computeDayRhythm, selectUpNext } from '../lib/briefing.js';
import { zonedToUtc } from '../lib/ics.js';

describe('Day Rhythm & Up Next', () => {
  const tz = 'America/Los_Angeles';
  const dayStart = zonedToUtc({ year: 2026, month: 11, day: 23, hour: 0 }, tz);

  const sampleEvents = [
    {
      id: 'e1',
      title: 'Morning Pilates',
      start: zonedToUtc({ year: 2026, month: 11, day: 23, hour: 8, minute: 0 }, tz).toISOString(),
      end: zonedToUtc({ year: 2026, month: 11, day: 23, hour: 9, minute: 0 }, tz).toISOString(),
      allDay: false,
      calendar: 'Personal',
    },
    {
      id: 'e2',
      title: 'Design Sync',
      start: zonedToUtc({ year: 2026, month: 11, day: 23, hour: 13, minute: 0 }, tz).toISOString(),
      end: zonedToUtc({ year: 2026, month: 11, day: 23, hour: 14, minute: 30 }, tz).toISOString(),
      allDay: false,
      calendar: 'Work',
    },
  ];

  it('computes 7 AM - 9 PM rhythm blocks, busy/free totals, and longest open window', () => {
    const now = zonedToUtc({ year: 2026, month: 11, day: 23, hour: 10, minute: 30 }, tz);
    const rhythm = computeDayRhythm(sampleEvents, now, tz, dayStart);

    assert.equal(rhythm.blocks.length, 2);
    assert.equal(rhythm.busyMinutes, 150);
    assert.equal(rhythm.freeMinutes, 840 - 150);
    assert.ok(rhythm.nowPct > 20 && rhythm.nowPct < 30);
    assert.equal(rhythm.longestOpenWindow.minutes, 390); // 2:30 PM - 9:00 PM
  });

  it('selects active now event, next upcoming event, or tomorrow fallback', () => {
    const duringFirst = zonedToUtc({ year: 2026, month: 11, day: 23, hour: 8, minute: 30 }, tz);
    const active = selectUpNext(sampleEvents, [], duringFirst);
    assert.equal(active.status, 'now');
    assert.equal(active.event.id, 'e1');
    assert.equal(active.minutesRemaining, 30);

    const beforeSecond = zonedToUtc({ year: 2026, month: 11, day: 23, hour: 12, minute: 0 }, tz);
    const next = selectUpNext(sampleEvents, [], beforeSecond);
    assert.equal(next.status, 'upcoming');
    assert.equal(next.event.id, 'e2');
    assert.equal(next.minutesUntil, 60);

    const evening = zonedToUtc({ year: 2026, month: 11, day: 23, hour: 20, minute: 0 }, tz);
    const tomorrowEvent = {
      id: 'tm1',
      title: 'Yoga',
      start: zonedToUtc({ year: 2026, month: 11, day: 24, hour: 8, minute: 0 }, tz).toISOString(),
      end: zonedToUtc({ year: 2026, month: 11, day: 24, hour: 9, minute: 0 }, tz).toISOString(),
      allDay: false,
      calendar: 'Personal',
    };
    const tom = selectUpNext(sampleEvents, [tomorrowEvent], evening);
    assert.equal(tom.status, 'tomorrow');
    assert.equal(tom.event.id, 'tm1');
  });
});

describe('buildBriefing', () => {
  it('assembles a complete demo briefing payload', async () => {
    const now = new Date('2026-11-23T17:30:00.000Z');
    const mockWeather = async () => ({
      available: true,
      locationName: 'San Francisco, CA',
      units: 'fahrenheit',
      unitSymbol: '°F',
      temperature: 62,
      high: 66,
      low: 52,
      precipChance: 10,
      condition: 'Mostly Clear',
      icon: 'sun-cloud',
      sunrise: '2026-11-23T06:58',
      sunset: '2026-11-23T16:54',
    });

    const briefing = await buildBriefing({
      query: { demo: '1', name: 'Claire', note: 'Love you!', tz: 'America/Los_Angeles' },
      now,
      weatherFetcher: mockWeather,
    });

    assert.equal(briefing.demoMode, true);
    assert.equal(briefing.personName, 'Claire');
    assert.equal(briefing.personalNote, 'Love you!');
    assert.ok(briefing.today.events.length > 0);
    assert.ok(briefing.tomorrow.events.length > 0);
    assert.equal(briefing.week.days.length, 7);
    assert.ok(briefing.week.totals.studieEvents > 0);
    assert.ok(briefing.week.totals.privatEvents > 0);
    assert.ok(briefing.summary.text.length > 20);
    assert.equal(briefing.weather.sunset, '2026-11-23T16:54');
  });
});
