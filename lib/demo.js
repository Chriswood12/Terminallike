import { getZonedParts, zonedToUtc } from './ics.js';

/**
 * Genererer en realistisk 7-dages dansk demo-kalender med både Studie (VIA) og Privat,
 * så både dags- og ugeoverblikket ser levende ud indtil private .ics-kalendere tilføjes.
 */
export function buildDemoEvents(now, timeZone) {
  const today = getZonedParts(now, timeZone);
  const todayNoon = zonedToUtc(
    { year: today.year, month: today.month, day: today.day, hour: 12 },
    timeZone,
  );

  const dayPartsAt = (offsetDays) =>
    getZonedParts(new Date(todayNoon.getTime() + offsetDays * 24 * 60 * 60 * 1000), timeZone);

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

  const allEvents = [];

  for (let offset = 0; offset < 7; offset++) {
    const d = dayPartsAt(offset);
    const wd = d.weekday; // 0=Sun .. 6=Sat

    if (offset === 0 && wd >= 1 && wd <= 5) {
      allEvents.push(makeAllDay(d, `d${offset}_all`, 'Projektuge på VIA', 'Studie'));
    }

    if (wd === 1) {
      allEvents.push(
        makeTimed(d, `d${offset}_1`, 'Forelæsning: Metode & teori', 9, 0, 11, 30, 'VIA Campus C', 'Studie'),
        makeTimed(d, `d${offset}_2`, 'Studiegruppe', 12, 30, 14, 30, 'Lokale C2.14', 'Studie'),
        makeTimed(d, `d${offset}_3`, 'Aftensmad & gåtur', 18, 30, 20, 0, 'Aarhus Ø', 'Privat'),
      );
    } else if (wd === 2) {
      allEvents.push(
        makeTimed(d, `d${offset}_1`, 'Workshop: Praksis & cases', 8, 30, 11, 0, 'VIA Campus C', 'Studie'),
        makeTimed(d, `d${offset}_2`, 'Frokost med Emma', 12, 0, 13, 0, 'Street Food', 'Privat'),
        makeTimed(d, `d${offset}_3`, 'Træning', 17, 0, 18, 0, 'Fitness', 'Privat'),
      );
    } else if (wd === 3) {
      allEvents.push(
        makeTimed(d, `d${offset}_1`, 'Undervisning: Fagmodul', 10, 0, 13, 0, 'VIA Campus C', 'Studie'),
        makeTimed(d, `d${offset}_2`, 'Vejledning', 14, 0, 14, 45, 'Lokale A1.08', 'Studie'),
        makeTimed(d, `d${offset}_3`, 'Lave pasta sammen', 18, 30, 19, 45, 'Hjemme', 'Privat'),
      );
    } else if (wd === 4) {
      allEvents.push(
        makeTimed(d, `d${offset}_1`, 'Læsedag & opgaveskrivning', 9, 30, 12, 30, 'Dokk1', 'Studie'),
        makeTimed(d, `d${offset}_2`, 'Kaffe med Sofie', 14, 30, 16, 0, 'La Cabra', 'Privat'),
      );
    } else if (wd === 5) {
      allEvents.push(
        makeTimed(d, `d${offset}_1`, 'Fredagsundervisning', 9, 0, 11, 30, 'VIA Campus C', 'Studie'),
        makeTimed(d, `d${offset}_2`, 'Fredagsbar / hygge', 16, 30, 18, 30, 'Midtbyen', 'Privat'),
      );
    } else if (wd === 6) {
      allEvents.push(
        makeTimed(d, `d${offset}_1`, 'Bager & morgenkaffe', 9, 30, 11, 0, 'Jumbo Bakery', 'Privat'),
        makeTimed(d, `d${offset}_2`, 'Middag ude', 19, 0, 21, 0, 'Frederiksbjerg', 'Privat'),
      );
    } else {
      allEvents.push(
        makeTimed(d, `d${offset}_1`, 'Gåtur ved Marselisborg', 11, 0, 12, 30, 'Skoven', 'Privat'),
        makeTimed(d, `d${offset}_2`, 'Forberedelse til ny uge', 16, 0, 17, 30, 'Hjemme', 'Studie'),
      );
    }
  }

  return { allEvents };
}
