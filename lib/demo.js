import { getZonedParts, zonedToUtc } from './ics.js';

/**
 * Genererer en realistisk dansk demo-kalender for i dag og i morgen,
 * så skærmen ser levende ud indtil private .ics-kalendere tilføjes.
 */
export function buildDemoEvents(now, timeZone) {
  const today = getZonedParts(now, timeZone);
  const tomorrowDate = new Date(
    zonedToUtc({ year: today.year, month: today.month, day: today.day, hour: 12 }, timeZone).getTime() +
      24 * 60 * 60 * 1000,
  );
  const tomorrow = getZonedParts(tomorrowDate, timeZone);

  const isWeekend = today.weekday === 0 || today.weekday === 6;
  const isTomorrowWeekend = tomorrow.weekday === 0 || tomorrow.weekday === 6;

  const makeTimed = (dayParts, id, title, startH, startM, endH, endM, location, calendar) => {
    const start = zonedToUtc(
      { year: dayParts.year, month: dayParts.month, day: dayParts.day, hour: startH, minute: startM },
      timeZone,
    );
    const end = zonedToUtc(
      { year: dayParts.year, month: dayParts.month, day: dayParts.day, hour: endH, minute: endM },
      timeZone,
    );
    return {
      id: `demo_${id}`,
      uid: `demo_${id}`,
      title,
      description: '',
      location,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      calendar,
    };
  };

  const makeAllDay = (dayParts, id, title, calendar) => {
    const start = zonedToUtc(
      { year: dayParts.year, month: dayParts.month, day: dayParts.day, hour: 0, minute: 0 },
      timeZone,
    );
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return {
      id: `demo_${id}`,
      uid: `demo_${id}`,
      title,
      description: '',
      location: '',
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: true,
      calendar,
    };
  };

  const todayEvents = isWeekend
    ? [
        makeAllDay(today, 't_allday', 'Rolig weekend & torvedag', 'Privat'),
        makeTimed(today, 't1', 'Reformer Pilates', 9, 0, 10, 0, 'Vesterbro Studio', 'Privat'),
        makeTimed(today, 't2', 'Kaffe og rundstykker med Sofie', 11, 0, 12, 15, 'Juno the Bakery', 'Privat'),
        makeTimed(today, 't3', 'Gåtur ved Søerne', 14, 30, 16, 0, 'Østerbro', 'Sammen'),
        makeTimed(today, 't4', 'Middag ude', 19, 0, 21, 0, 'Bistro Boheme', 'Sammen'),
      ]
    : [
        makeAllDay(today, 't_allday', 'Projektuge', 'Arbejde'),
        makeTimed(today, 't1', 'Morgentræning & kaffe', 8, 0, 9, 0, 'Lokalt studie', 'Privat'),
        makeTimed(today, 't2', 'Morgenmøde med teamet', 10, 0, 10, 30, 'Google Meet', 'Arbejde'),
        makeTimed(today, 't3', 'Designgennemgang', 11, 15, 12, 15, 'Mødelokale B', 'Arbejde'),
        makeTimed(today, 't4', 'Frokost med Emma', 12, 45, 13, 45, 'Torvehallerne', 'Privat'),
        makeTimed(today, 't5', 'Fokustid: Præsentation', 14, 30, 16, 30, 'Hjemmekontor', 'Arbejde'),
        makeTimed(today, 't6', 'Aftensmad & gåtur', 18, 45, 20, 15, 'Havnefronten', 'Sammen'),
      ];

  const tomorrowEvents = isTomorrowWeekend
    ? [
        makeTimed(tomorrow, 'tm1', 'Lørdagskaffe & bager', 9, 30, 11, 0, 'Hart Bageri', 'Sammen'),
        makeTimed(tomorrow, 'tm2', 'Keramikværksted', 13, 0, 15, 0, 'Nørrebro', 'Privat'),
        makeTimed(tomorrow, 'tm3', 'Filmaften derhjemme', 19, 30, 21, 30, 'Stuen', 'Sammen'),
      ]
    : [
        makeTimed(tomorrow, 'tm1', 'Morgenyoga', 7, 45, 8, 30, 'Hjemme', 'Privat'),
        makeTimed(tomorrow, 'tm2', 'Ugentlig planlægning', 10, 0, 10, 45, 'Teams', 'Arbejde'),
        makeTimed(tomorrow, 'tm3', 'Tandlæge', 14, 0, 15, 0, 'Indre By', 'Privat'),
        makeTimed(tomorrow, 'tm4', 'Lave pasta sammen', 18, 30, 19, 30, 'Hjemme', 'Sammen'),
      ];

  return {
    todayEvents,
    tomorrowEvents,
  };
}
