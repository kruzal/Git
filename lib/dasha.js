// Vimshottari dasha: the 120-year cycle of planetary periods, started from the Moon's nakshatra at birth.
const ORDER = [
  { lord: 'Ketu', years: 7 },
  { lord: 'Venus', years: 20 },
  { lord: 'Sun', years: 6 },
  { lord: 'Moon', years: 10 },
  { lord: 'Mars', years: 7 },
  { lord: 'Rahu', years: 18 },
  { lord: 'Jupiter', years: 16 },
  { lord: 'Saturn', years: 19 },
  { lord: 'Mercury', years: 17 },
];
const TOTAL_YEARS = 120;
const YEAR_MS = 365.2425 * 86400000;

const addYears = (date, years) => new Date(date.getTime() + years * YEAR_MS);

// Sub-periods (antardasha) inside one mahadasha, in the same planetary order.
function antardashas(lord, start, mahaYears) {
  const from = ORDER.findIndex((p) => p.lord === lord);
  let cursor = start;
  return ORDER.map((_, i) => {
    const sub = ORDER[(from + i) % 9];
    const years = (mahaYears * sub.years) / TOTAL_YEARS;
    const period = { lord: sub.lord, start: cursor, end: addYears(cursor, years), years };
    cursor = period.end;
    return period;
  });
}

// `moonLongitude` is sidereal. Returns the full mahadasha timeline plus what is running now.
function timeline(moonLongitude, birthDate, now = new Date()) {
  const span = 360 / 27;
  const nakIndex = Math.floor(((moonLongitude % 360) + 360) % 360 / span);
  const traversed = ((((moonLongitude % 360) + 360) % 360) % span) / span;
  const startIndex = nakIndex % 9;

  // The dasha at birth is already partly elapsed; the rest of it is the "balance".
  const first = ORDER[startIndex];
  const balanceYears = first.years * (1 - traversed);
  let cursor = addYears(birthDate, -(first.years - balanceYears));

  const periods = [];
  for (let i = 0; i < 9; i++) {
    const p = ORDER[(startIndex + i) % 9];
    const period = { lord: p.lord, start: cursor, end: addYears(cursor, p.years), years: p.years };
    period.antardashas = antardashas(p.lord, period.start, p.years);
    periods.push(period);
    cursor = period.end;
  }

  const current = periods.find((p) => now >= p.start && now < p.end) || null;
  const currentAntar = current?.antardashas.find((a) => now >= a.start && now < a.end) || null;
  return {
    balance: { lord: first.lord, years: balanceYears },
    periods,
    current: current && { lord: current.lord, start: current.start, end: current.end },
    currentAntar: currentAntar && { lord: currentAntar.lord, start: currentAntar.start, end: currentAntar.end },
  };
}

module.exports = { timeline, ORDER };
