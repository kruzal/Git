/*
 * MUHURTA — choosing the moment for something that matters.
 *
 * A good day in the panchang is not automatically a good day for you. So every
 * candidate window is judged on two layers:
 *
 *   THE DAY (same for everyone)
 *     tithi        rikta tithis (4, 9, 14) and Amavasya are avoided
 *     yoga         nine of the 27 yogas are inauspicious
 *     karana       Vishti (Bhadra) is avoided
 *     nakshatra    each nakshatra has a nature — fixed, movable, swift, soft, fierce,
 *                  sharp, mixed — and each kind of work has natures that suit it
 *     vara         each kind of work has weekdays that suit it
 *     choghadiya   daylight cut into eight parts; Amrit, Shubh and Labh are good,
 *                  Chal is fine for travel, Udveg, Rog and Kaal are avoided
 *     kaal         Rahu kaal, Yamaganda and Gulika are cut out of every window
 *
 *   YOU (from the birth chart)
 *     tara bala    the day's nakshatra counted from your birth nakshatra, in nines
 *     chandra bala the Moon's sign counted from your birth Moon sign
 *
 * Every limb is read at the middle of the window itself, not at sunrise, because
 * tithi and nakshatra change during the day.
 */

const A = require('astronomy-engine');
const { transitSignIndex } = require('./astro');
const { limbsAt, sunriseWeekday } = require('./panchang');
const { ordinal } = require('./bhava');

const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];

const NATURE = {
  fixed: ['Rohini', 'Uttara Phalguni', 'Uttara Ashadha', 'Uttara Bhadrapada'],
  movable: ['Punarvasu', 'Swati', 'Shravana', 'Dhanishta', 'Shatabhisha'],
  swift: ['Ashwini', 'Pushya', 'Hasta'],
  soft: ['Mrigashira', 'Chitra', 'Anuradha', 'Revati'],
  fierce: ['Bharani', 'Magha', 'Purva Phalguni', 'Purva Ashadha', 'Purva Bhadrapada'],
  sharp: ['Ardra', 'Ashlesha', 'Jyeshtha', 'Mula'],
  mixed: ['Krittika', 'Vishakha'],
};
const natureOf = (nak) => Object.keys(NATURE).find((k) => NATURE[k].includes(nak));

// What each kind of work asks of the day. Weekdays are Sunday-first indices.
const EVENTS = {
  start: { name: 'Start work or a business', natures: ['swift', 'fixed', 'soft'], days: [3, 4, 5], chal: false },
  travel: { name: 'Travel', natures: ['movable', 'swift', 'soft'], days: [1, 3, 4, 5], chal: true },
  property: { name: 'Buy land, a home or a vehicle', natures: ['fixed', 'soft', 'movable'], days: [1, 4, 5], chal: false },
  study: { name: 'Begin study or a practice', natures: ['swift', 'soft', 'movable'], days: [3, 4], chal: false },
  marriage: { name: 'Marriage talks or engagement', natures: ['soft', 'fixed'], days: [1, 3, 4, 5], chal: false },
  health: { name: 'Start a health or fitness routine', natures: ['swift', 'fixed', 'soft'], days: [0, 3, 4], chal: true },
};

const RIKTA = [4, 9, 14];
const BAD_YOGAS = ['Vishkambha', 'Atiganda', 'Shula', 'Ganda', 'Vyaghata', 'Vajra', 'Vyatipata', 'Parigha', 'Vaidhriti'];

const TARA = [
  { name: 'Janma', good: null, note: 'your own star — steady, but not for big beginnings' },
  { name: 'Sampat', good: true, note: 'wealth' },
  { name: 'Vipat', good: false, note: 'danger' },
  { name: 'Kshema', good: true, note: 'well-being' },
  { name: 'Pratyak', good: false, note: 'obstacles' },
  { name: 'Sadhana', good: true, note: 'achievement' },
  { name: 'Naidhana', good: false, note: 'loss' },
  { name: 'Mitra', good: true, note: 'a friend' },
  { name: 'Parama Mitra', good: true, note: 'a close friend' },
];
const CHANDRA_GOOD = [1, 3, 6, 7, 10, 11];
const CHANDRA_BAD = [4, 8, 12];

// Day choghadiya follows the hora order, starting from the weekday's own lord.
const CHOGHADIYA = ['Udveg', 'Chal', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog'];
const CHOG_START = [0, 3, 6, 2, 5, 1, 4];   // Sun Udveg, Mon Amrit, Tue Rog, Wed Labh, Thu Shubh, Fri Chal, Sat Kaal
const CHOG_RANK = { Amrit: 3, Shubh: 2.5, Labh: 2, Chal: 1 };

const RAHU_PART = [8, 2, 7, 5, 6, 4, 3];
const GULIKA_PART = [7, 6, 5, 4, 3, 2, 1];
const YAMA_PART = [5, 4, 3, 2, 1, 7, 6];

const MIN = 60000;

function eighth(rise, set, part) {
  const slice = (set - rise) / 8;
  return { start: rise.getTime() + (part - 1) * slice, end: rise.getTime() + part * slice };
}

/** Remove blocked spans from a window; returns the longest remaining piece. */
function trim(win, blocked) {
  let pieces = [win];
  blocked.forEach((b) => {
    pieces = pieces.flatMap((p) => {
      if (b.end <= p.start || b.start >= p.end) return [p];
      return [{ ...p, end: b.start }, { ...p, start: b.end }].filter((x) => x.end - x.start >= 20 * MIN);
    });
  });
  return pieces.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0] || null;
}

function judge(mid, natal, event, weekday) {
  const limbs = limbsAt(new Date(mid));
  const nakIndex = NAKSHATRAS.indexOf(limbs.nakshatra);
  const tara = TARA[(nakIndex - natal.nakshatraIndex + 27) % 27 % 9];
  const moonFrom = ((transitSignIndex('Moon', new Date(mid), 'vedic') - natal.moonSignIndex + 12) % 12) + 1;
  const nature = natureOf(limbs.nakshatra);
  const within = limbs.tithi.index > 15 ? limbs.tithi.index - 15 : limbs.tithi.index;

  const good = [];
  const bad = [];
  let score = 0;
  const plus = (n, text) => { score += n; good.push(text); };
  const minus = (n, text) => { score -= n; bad.push(text); };

  if (tara.good === true) plus(2, `Tara bala: ${tara.name} (${tara.note}) from your birth star`);
  else if (tara.good === false) minus(3, `Tara bala: ${tara.name} (${tara.note}) from your birth star`);
  else minus(1, `Your janma tara — ${tara.note}`);

  if (CHANDRA_GOOD.includes(moonFrom)) plus(2, `Chandra bala: the Moon is ${ordinal(moonFrom)} from your Moon sign`);
  else if (CHANDRA_BAD.includes(moonFrom)) minus(3, `The Moon is ${ordinal(moonFrom)} from your Moon sign — weak chandra bala`);

  if (limbs.tithi.name === 'Amavasya') minus(4, 'Amavasya — the dark moon, kept for ancestors and rest');
  else if (RIKTA.includes(within)) minus(2, `${limbs.tithi.label} is a rikta (empty) tithi`);
  else plus(1, `${limbs.tithi.label} is a usable tithi`);

  if (BAD_YOGAS.includes(limbs.yoga)) minus(2, `${limbs.yoga} yoga is inauspicious`);
  if (limbs.karana === 'Vishti') minus(2, 'Vishti karana (Bhadra) is running');

  if (event.natures.includes(nature)) plus(2, `${limbs.nakshatra} is a ${nature} nakshatra, which suits this`);
  else if (['fierce', 'sharp'].includes(nature)) minus(2, `${limbs.nakshatra} is a ${nature} nakshatra — not for gentle beginnings`);

  if (event.days.includes(weekday)) plus(1, 'The weekday suits this kind of work');

  return { score, good, bad, limbs, tara: tara.name, chandra: moonFrom, nature };
}

/**
 * Best windows over the next `days` days for `eventKey`, at `place`, for a person
 * whose birth nakshatra and Moon sign are given in `natal`.
 */
function findMuhurta({ eventKey, from, days = 30, place, natal, now = Date.now() }) {
  const event = EVENTS[eventKey];
  if (!event) throw new Error(`Unknown event: ${eventKey}`);
  const obs = new A.Observer(place.lat, place.lon, 0);
  const results = [];

  let cursor = new Date(from.getTime());
  for (let d = 0; d < days; d++) {
    const rise = A.SearchRiseSet(A.Body.Sun, obs, +1, cursor, 2)?.date;
    if (!rise) break;
    const set = A.SearchRiseSet(A.Body.Sun, obs, -1, rise, 1).date;
    cursor = new Date(set.getTime() + MIN);
    const weekday = sunriseWeekday(rise, place.lon);

    const blocked = [eighth(rise, set, RAHU_PART[weekday]), eighth(rise, set, YAMA_PART[weekday]), eighth(rise, set, GULIKA_PART[weekday])];
    const abhijitSlice = (set - rise) / 15;
    const abhijit = { start: rise.getTime() + 7 * abhijitSlice, end: rise.getTime() + 8 * abhijitSlice };

    const windows = Array.from({ length: 8 }, (_, i) => ({
      ...eighth(rise, set, i + 1),
      choghadiya: CHOGHADIYA[(CHOG_START[weekday] + i) % 7],
    }))
      .filter((w) => CHOG_RANK[w.choghadiya] && (w.choghadiya !== 'Chal' || event.chal))
      .map((w) => trim(w, blocked))
      .filter((w) => w && w.end > now)
      .map((w) => {
        const verdict = judge((w.start + w.end) / 2, natal, event, weekday);
        // Abhijit is the midday muhurta; tradition sets it aside on Wednesdays.
        const hasAbhijit = weekday !== 3 && w.start <= abhijit.start && w.end >= abhijit.end;
        if (hasAbhijit) verdict.good.push('Contains Abhijit, the midday muhurta');
        verdict.good.push(`${w.choghadiya} choghadiya`);
        return { start: new Date(w.start), end: new Date(w.end), choghadiya: w.choghadiya, abhijit: hasAbhijit,
          ...verdict, score: verdict.score + CHOG_RANK[w.choghadiya] + (hasAbhijit ? 1 : 0) };
      });

    const best = windows.sort((a, b) => b.score - a.score)[0];
    if (best) results.push({ date: rise, weekday, ...best });
  }

  const ranked = [...results].sort((a, b) => b.score - a.score);
  return {
    event: { key: eventKey, name: event.name },
    days,
    best: ranked.filter((r) => r.score >= 5).slice(0, 5),
    avoid: results.filter((r) => r.score < 0).slice(0, 8),
    all: results,
  };
}

module.exports = { findMuhurta, EVENTS, NATURE, TARA };
