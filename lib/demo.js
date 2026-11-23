import { getZonedParts, zonedToUtc } from './ics.js';

/**
 * Generates a realistic, time-zone-aware demo schedule for today and tomorrow
 * so the 4K TV display looks great immediately before private .ics feeds are added.
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
        makeAllDay(today, 't_allday', 'Farmers Market & Slow Morning', 'Personal'),
        makeTimed(today, 't1', 'Pilates Reformer Class', 9, 0, 10, 0, 'Core Studio', 'Personal'),
        makeTimed(today, 't2', 'Coffee & Catch-up with Hannah', 11, 0, 12, 15, 'Sightglass Coffee', 'Personal'),
        makeTimed(today, 't3', 'Botanical Garden Walk', 14, 30, 16, 0, 'Golden Gate Park', 'Together'),
        makeTimed(today, 't4', 'Dinner Reservation at Nopa', 19, 0, 20, 45, '560 Divisadero St', 'Together'),
      ]
    : [
        makeAllDay(today, 't_allday', 'Design Sprint Week', 'Work'),
        makeTimed(today, 't1', 'Morning Pilates & Espresso', 8, 0, 9, 0, 'Neighborhood Studio', 'Personal'),
        makeTimed(today, 't2', 'Product Design Standup', 10, 0, 10, 30, 'Google Meet', 'Work'),
        makeTimed(today, 't3', 'Brand Refresh Critique', 11, 15, 12, 15, 'Studio Room B', 'Work'),
        makeTimed(today, 't4', 'Lunch with Claire', 12, 45, 13, 45, 'Tartine Manufactory', 'Personal'),
        makeTimed(today, 't5', 'Deep Work: Prototype Polish', 14, 30, 16, 30, 'Home Office', 'Work'),
        makeTimed(today, 't6', 'Dinner & Sunset Walk', 18, 45, 20, 15, 'Marina Green', 'Together'),
      ];

  const tomorrowEvents = isTomorrowWeekend
    ? [
        makeTimed(tomorrow, 'tm1', 'Saturday Farmers Market', 9, 30, 11, 0, 'Ferry Building', 'Together'),
        makeTimed(tomorrow, 'tm2', 'Ceramics Open Studio', 13, 0, 15, 0, 'Clayroom', 'Personal'),
        makeTimed(tomorrow, 'tm3', 'Movie Night at Home', 19, 30, 21, 30, 'Living Room', 'Together'),
      ]
    : [
        makeTimed(tomorrow, 'tm1', 'Yoga Flow', 7, 45, 8, 30, 'Home', 'Personal'),
        makeTimed(tomorrow, 'tm2', 'Weekly Planning Sync', 10, 0, 10, 45, 'Zoom', 'Work'),
        makeTimed(tomorrow, 'tm3', 'Dentist Checkup', 14, 0, 15, 0, 'Union Square Dental', 'Personal'),
        makeTimed(tomorrow, 'tm4', 'Cook Thai Basil Stir-Fry', 18, 30, 19, 30, 'Home', 'Together'),
      ];

  return {
    todayEvents,
    tomorrowEvents,
  };
}
