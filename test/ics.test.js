import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseIcsFeeds } from '../lib/env.js';
import { parseIcs, unfoldIcsLines, unescapeIcsText, zonedToUtc } from '../lib/ics.js';

describe('parseIcsFeeds', () => {
  it('parses labeled, unlabeled, and Apple webcal:// URLs', () => {
    const raw = [
      'Personal|https://calendar.google.com/calendar/ical/test/basic.ics',
      'Work|webcal://p123-caldav.icloud.com/published/2/abc',
      'https://example.com/shared.ics',
    ].join('\n');

    const feeds = parseIcsFeeds(raw);
    assert.equal(feeds.length, 3);
    assert.deepEqual(feeds[0], {
      label: 'Personal',
      url: 'https://calendar.google.com/calendar/ical/test/basic.ics',
    });
    assert.deepEqual(feeds[1], {
      label: 'Work',
      url: 'https://p123-caldav.icloud.com/published/2/abc',
    });
    assert.equal(feeds[2].label, 'Calendar 3');
  });
});

describe('ICS parsing', () => {
  it('unfolds folded lines and unescapes RFC 5545 text', () => {
    const folded = 'SUMMARY:Coffee\\, Cake\\; &\r\n  Catch-up\\nDownstairs';
    const lines = unfoldIcsLines(folded);
    assert.equal(lines.length, 1);
    assert.equal(
      unescapeIcsText(lines[0].slice('SUMMARY:'.length)),
      'Coffee, Cake; & Catch-up\nDownstairs',
    );
  });

  it('expands WEEKLY RRULE with BYDAY, respects EXDATE and RECURRENCE-ID override', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'X-WR-CALNAME:Maya Work',
      'BEGIN:VEVENT',
      'UID:standup-1',
      'SUMMARY:Design Standup',
      'DTSTART;TZID=America/Los_Angeles:20261102T093000',
      'DTEND;TZID=America/Los_Angeles:20261102T100000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
      'EXDATE;TZID=America/Los_Angeles:20261125T093000',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:standup-1',
      'RECURRENCE-ID;TZID=America/Los_Angeles:20261123T093000',
      'SUMMARY:Design Standup (Moved)',
      'DTSTART;TZID=America/Los_Angeles:20261123T110000',
      'DTEND;TZID=America/Los_Angeles:20261123T113000',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const tz = 'America/Los_Angeles';
    const rangeStart = zonedToUtc({ year: 2026, month: 11, day: 23, hour: 0 }, tz);
    const rangeEnd = zonedToUtc({ year: 2026, month: 11, day: 28, hour: 0 }, tz);

    const events = parseIcs(ics, { rangeStart, rangeEnd, timeZone: tz });
    // Expect Mon Nov 23 (overridden to 11:00 AM) and Fri Nov 27 (9:30 AM); Wed Nov 25 excluded by EXDATE
    assert.equal(events.length, 2);

    const titles = events.map((e) => e.title).sort();
    assert.deepEqual(titles, ['Design Standup', 'Design Standup (Moved)']);
    assert.equal(events[0].calendar, 'Maya Work');
  });

  it('handles MONTHLY BYDAY ordinal rules, Windows TZIDs, DURATION, and skips CANCELLED', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:monthly-1',
      'SUMMARY:Book Club',
      'DTSTART;TZID="Pacific Standard Time":20260126T180000',
      'DURATION:PT1H30M',
      'RRULE:FREQ=MONTHLY;BYDAY=4MO',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:cancelled-1',
      'SUMMARY:Cancelled Sync',
      'STATUS:CANCELLED',
      'DTSTART;TZID=America/Los_Angeles:20261123T150000',
      'DTEND;TZID=America/Los_Angeles:20261123T160000',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const tz = 'America/Los_Angeles';
    // 4th Monday of Nov 2026 is Nov 23, 2026
    const rangeStart = zonedToUtc({ year: 2026, month: 11, day: 23, hour: 0 }, tz);
    const rangeEnd = zonedToUtc({ year: 2026, month: 11, day: 24, hour: 0 }, tz);

    const events = parseIcs(ics, { rangeStart, rangeEnd, timeZone: tz, calendarName: 'Personal' });
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Book Club');
    const durationMin = (new Date(events[0].end) - new Date(events[0].start)) / 60000;
    assert.equal(durationMin, 90);
  });

  it('handles all-day VALUE=DATE events without timezone bleed', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:allday-1',
      'SUMMARY:Anniversary',
      'DTSTART;VALUE=DATE:20261123',
      'DTEND;VALUE=DATE:20261124',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const tz = 'America/Los_Angeles';
    const rangeStart = zonedToUtc({ year: 2026, month: 11, day: 23, hour: 0 }, tz);
    const rangeEnd = zonedToUtc({ year: 2026, month: 11, day: 24, hour: 0 }, tz);

    const events = parseIcs(ics, { rangeStart, rangeEnd, timeZone: tz });
    assert.equal(events.length, 1);
    assert.equal(events[0].allDay, true);
    assert.equal(events[0].title, 'Anniversary');
  });
});
