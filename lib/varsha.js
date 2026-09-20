/*
 * VARSHAPHAL — the year from birthday to birthday.
 *
 * The astrological year does not start in January. It starts at the solar
 * return: the instant the Sun comes back to the exact sidereal longitude it
 * held at birth. Everything here is scoped to that window.
 *
 *   solarReturn   the exact start and end of your year
 *   muntha        a point that advances one house per year of life
 *   personalYear  the numerology counterpart, day + month + current year
 *   segments      which dasha sub-periods fall inside the window
 *   transits      where the slow planets sit relative to your natal chart
 */

const A = require('astronomy-engine');
const { lahiriAyanamsa, SIGN_LORDS, VEDIC_SIGNS } = require('./astro');
const { reduce, NUMBER_PLANET, NUMBER_TRAIT } = require('./numerology');

const norm = (d) => ((d % 360) + 360) % 360;
const sunSidereal = (date) => norm(A.SunPosition(date).elon - lahiriAyanamsa(date));

/**
 * The instant the Sun returns to `natalSunLon` in the given calendar year.
 * The Sun moves about 0.9856° a day, so a few Newton steps converge fast.
 */
function solarReturn(natalSunLon, birthDate, year) {
  const [, m, d] = birthDate.split('-').map(Number);
  let guess = new Date(Date.UTC(year, m - 1, d, 0, 0, 0));
  for (let i = 0; i < 8; i++) {
    let diff = natalSunLon - sunSidereal(guess);
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) < 1e-6) break;
    guess = new Date(guess.getTime() + (diff / 0.985647) * 86400000);
  }
  return guess;
}

/** Which solar-return year we are currently inside, and its exact bounds. */
function currentYearWindow(natalSunLon, birthDate, now = new Date()) {
  let start = solarReturn(natalSunLon, birthDate, now.getUTCFullYear());
  if (start > now) start = solarReturn(natalSunLon, birthDate, now.getUTCFullYear() - 1);
  const end = solarReturn(natalSunLon, birthDate, new Date(start).getUTCFullYear() + 1);
  const elapsed = (now - start) / (end - start);
  return { start, end, elapsed: Math.max(0, Math.min(1, elapsed)),
    daysIn: Math.floor((now - start) / 86400000), daysLeft: Math.ceil((end - now) / 86400000) };
}

// ---------------------------------------------------------------- muntha
// Muntha starts on the natal lagna and moves forward one house each year.
const MUNTHA = [
  { house: 1, focus: 'you', text: 'The year points back at you — health, appearance, how you carry yourself. Changes you make to yourself now set the tone for the ones that follow.' },
  { house: 2, focus: 'money and family', text: 'Income, savings and what you say. A good year to fix your financial habits rather than chase a windfall.' },
  { house: 3, focus: 'effort and communication', text: 'Courage, siblings, short travel, writing and selling. Push — this house rewards effort more than luck.' },
  { house: 4, focus: 'home and peace', text: 'Property, vehicles, mother, the atmosphere at home. Settling your base matters more than advancing outside it.' },
  { house: 5, focus: 'learning and creativity', text: 'Study, children, romance, anything you make. A year to start something creative rather than optimise something old.' },
  { house: 6, focus: 'work and obstacles', text: 'Service, routine, competition, debts. Unglamorous but useful — you clear things this year rather than build them.' },
  { house: 7, focus: 'partnership', text: 'Marriage, business partners, dealings with the public. Decisions about other people take centre stage.' },
  { house: 8, focus: 'change', text: 'Sudden shifts, research, inherited or shared money. Hold plans loosely; what closes this year was probably due to close.' },
  { house: 9, focus: 'fortune and belief', text: 'Teachers, long journeys, higher study, father. One of the better years — luck responds to effort more readily than usual.' },
  { house: 10, focus: 'career', text: 'Work, reputation, status. What you do this year is unusually visible, for better and worse.' },
  { house: 11, focus: 'gains and networks', text: 'Income, friends, fulfilled wishes. Traditionally the strongest position — things you have been waiting for tend to land.' },
  { house: 12, focus: 'release', text: 'Expense, foreign matters, rest, letting go. A closing year rather than an opening one; conserve rather than expand.' },
];

function muntha(chart, ageAtYearStart) {
  const house = (ageAtYearStart % 12) + 1;
  const signIndex = (chart.ascendant.signIndex + ageAtYearStart) % 12;
  const lord = SIGN_LORDS[signIndex];
  const lordPlanet = chart.planets.find((p) => p.name === lord);
  return { ...MUNTHA[house - 1], age: ageAtYearStart, sign: VEDIC_SIGNS[signIndex],
    lord, lordHouse: lordPlanet ? lordPlanet.house : null };
}

// --------------------------------------------------------- personal year
function personalYear(birthDate, calendarYear) {
  const [, m, d] = birthDate.split('-').map(Number);
  const total = d + m + String(calendarYear).split('').reduce((s, x) => s + Number(x), 0);
  const r = reduce(total);
  return { ...r, planet: NUMBER_PLANET[r.value], trait: NUMBER_TRAIT[r.value], year: calendarYear };
}

// -------------------------------------------------------------- segments
/** Dasha sub-periods that overlap the year window. */
function segments(dasha, start, end) {
  const out = [];
  dasha.periods.forEach((maha) => {
    maha.antardashas.forEach((antar) => {
      if (antar.end > start && antar.start < end) {
        out.push({ maha: maha.lord, antar: antar.lord,
          start: new Date(Math.max(antar.start, start)), end: new Date(Math.min(antar.end, end)),
          startsInYear: antar.start > start });
      }
    });
  });
  return out.sort((a, b) => a.start - b.start);
}

// -------------------------------------------------------------- transits
const SLOW = ['Saturn', 'Jupiter', 'Rahu'];

function transits(chart, at) {
  const ayan = lahiriAyanamsa(at);
  const moonSignIndex = chart.planets.find((p) => p.name === 'Moon').signIndex;
  const ascIndex = chart.ascendant.signIndex;

  const list = SLOW.map((name) => {
    let lon;
    if (name === 'Rahu') {
      const T = (at.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;
      lon = norm(125.04452 - 1934.136261 * T);
    } else {
      lon = norm(A.Ecliptic(A.GeoVector(name, at, true)).elon);
    }
    const signIndex = Math.floor(norm(lon - ayan) / 30);
    return { planet: name, sign: VEDIC_SIGNS[signIndex], signIndex,
      houseFromLagna: ((signIndex - ascIndex + 12) % 12) + 1,
      houseFromMoon: ((signIndex - moonSignIndex + 12) % 12) + 1 };
  });

  // Sade sati: Saturn crossing the 12th, 1st or 2nd from the natal Moon.
  const saturn = list.find((x) => x.planet === 'Saturn');
  const sadeSati = [12, 1, 2].includes(saturn.houseFromMoon);
  return {
    list,
    sadeSati: sadeSati ? {
      active: true, phase: saturn.houseFromMoon === 12 ? 'rising' : saturn.houseFromMoon === 1 ? 'peak' : 'setting',
      text: saturn.houseFromMoon === 12
        ? 'Saturn is in the 12th from your Moon — the first of the three phases. Expenses and sleep are where it shows first.'
        : saturn.houseFromMoon === 1
          ? 'Saturn is on your Moon — the middle and heaviest phase. Mood and energy carry the weight.'
          : 'Saturn is in the 2nd from your Moon — the last phase. Money and family take the strain, and it eases from here.',
    } : { active: false },
    // Saturn in the 4th or 8th from the Moon is the shorter dhaiya.
    dhaiya: [4, 8].includes(saturn.houseFromMoon)
      ? { active: true, house: saturn.houseFromMoon } : { active: false },
  };
}

// -------------------------------------------------------------- maturity
const MATURITY = { Jupiter: 16, Sun: 22, Moon: 24, Venus: 25, Mars: 28, Mercury: 32, Saturn: 36, Rahu: 42, Ketu: 48 };

const maturing = (ageStart, ageEnd) =>
  Object.entries(MATURITY).filter(([, age]) => age > ageStart && age <= ageEnd)
    .map(([planet, age]) => ({ planet, age }));

/**
 * The whole year report. `strengths` comes from lib/strength so the
 * suggestions can point at the planets that actually need work.
 */
function yearReport(chart, dasha, profile, strengths, now = new Date()) {
  const natalSun = chart.planets.find((p) => p.name === 'Sun').longitude;
  const window = currentYearWindow(natalSun, profile.birth_date, now);
  const birth = new Date(`${profile.birth_date}T${profile.birth_time}:00`);
  const ageAtStart = Math.round((window.start - birth) / 31557600000);

  const m = muntha(chart, ageAtStart);
  const seg = segments(dasha, window.start, window.end);
  const tr = transits(chart, window.start);
  const py = personalYear(profile.birth_date, window.start.getUTCFullYear());

  // The manifestation chain: the 11th lord's house says which activity
  // actually moves your wishes along. See docs — source 007.
  const eleventhSignIndex = (chart.ascendant.signIndex + 10) % 12;
  const eleventhLord = SIGN_LORDS[eleventhSignIndex];
  const eleventhLordPlanet = chart.planets.find((p) => p.name === eleventhLord);

  const weakest = Object.values(strengths).sort((a, b) => a.score - b.score)[0];

  return {
    window: { start: window.start, end: window.end, elapsed: window.elapsed,
      daysIn: window.daysIn, daysLeft: window.daysLeft, age: ageAtStart },
    muntha: m,
    personalYear: py,
    segments: seg,
    current: seg.find((s) => s.start <= now && now < s.end) || null,
    transits: tr,
    maturing: maturing(ageAtStart, ageAtStart + 1),
    manifestation: { lord: eleventhLord, house: eleventhLordPlanet ? eleventhLordPlanet.house : null },
    weakest: { planet: weakest.planet, score: weakest.score },
  };
}

module.exports = { yearReport, solarReturn, currentYearWindow, muntha, personalYear, transits, MUNTHA };
