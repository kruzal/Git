/*
 * JANMA — the birth moment as a chain, from the widest cause to the narrowest.
 *
 *   KARMA     what was carried in: the atmakaraka, the 5th (merit from before), the nodes,
 *             and which karma the running dasha is ripening now
 *   LINEAGE   the family line it arrived through: 9th (father, ancestors), 4th (mother),
 *             2nd (family), with the Sun and Moon as their karakas
 *   PLACE     where on earth: the place decides which sign was rising, and so every house
 *   TIME      the day: the five limbs of the panchang at the moment of birth
 *   GHADI     the instant: ghati and pala after sunrise, the hora, and how many minutes
 *             the lagna had left — which is why the exact time matters
 *
 * Each level narrows the one above it. The same karma could arrive through many
 * families; the same family in many places; the same place on many days; the same
 * day at many instants. The chart is the one instant where all five met.
 *
 * Units: 1 ghati (ghadi) = 24 minutes, 60 ghati to a day. 1 pala = 24 seconds,
 * 60 pala to a ghati.
 */

const A = require('astronomy-engine');
const { birthChart } = require('./astro');
const { BHAVAS, ordinal } = require('./bhava');
const { limbsAt, sunriseWeekday, VARA } = require('./panchang');
const { karakas } = require('./lenses');

const CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];
const DAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const MIN = 60000;

const the = (planet) => (planet === 'Sun' || planet === 'Moon' ? `the ${planet}` : planet);
const The = (planet) => (planet === 'Sun' || planet === 'Moon' ? `The ${planet}` : planet);
/** "it is flowing", "it is mixed", "it needs care" */
const is = (st) => (st === 'needs care' ? 'needs care' : `is ${st}`);

/** Sunrise that began the Vedic day containing `date`, plus that day's sunset and the next sunrise. */
function vedicDay(date, lat, lon) {
  const obs = new A.Observer(lat, lon, 0);
  let rise = A.SearchRiseSet(A.Body.Sun, obs, +1, new Date(date.getTime() - 30 * 3600000), 2).date;
  for (;;) {
    const next = A.SearchRiseSet(A.Body.Sun, obs, +1, new Date(rise.getTime() + MIN), 2).date;
    if (next > date) break;
    rise = next;
  }
  const set = A.SearchRiseSet(A.Body.Sun, obs, -1, rise, 1).date;
  const nextRise = A.SearchRiseSet(A.Body.Sun, obs, +1, set, 1).date;
  return { rise, set, nextRise };
}

function ghatiPala(ms) {
  const ghatiFloat = ms / (24 * MIN);
  const ghati = Math.floor(ghatiFloat);
  const palaFloat = (ghatiFloat - ghati) * 60;
  const pala = Math.floor(palaFloat);
  return { ghati, pala, vipala: Math.floor((palaFloat - pala) * 60), label: `${ghati} ghati ${pala} pala` };
}

/** Minutes until the lagna leaves its sign, and since it entered — the birth time's margin. */
function lagnaMargin(utc, lat, lon) {
  const signAt = (t) => birthChart(new Date(t), lat, lon, 'vedic').ascendant.signIndex;
  const here = signAt(utc.getTime());
  const edge = (dir) => {
    let lo = 0, hi = 4 * 60;   // no sign takes longer than about 3 hours to rise
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      if (signAt(utc.getTime() + dir * mid * MIN) === here) lo = mid; else hi = mid;
    }
    return Math.round(lo);
  };
  return { minutesLeft: edge(+1), minutesIn: edge(-1) };
}

function state(rel, house) {
  const v = rel.houses[house - 1];
  return { house, name: v.name, state: v.state, because: (v.state === 'needs care' ? v.cautions : v.supports)[0]?.text || null };
}

function karmaLevel(chart, strengths, rel, dasha) {
  const ak = karakas(chart)[0];
  const ketu = chart.planets.find((p) => p.name === 'Ketu');
  const rahu = chart.planets.find((p) => p.name === 'Rahu');
  const fifth = state(rel, 5);
  const lord = dasha.current?.lord;
  const ruled = lord ? rel.natures[lord]?.ruled || [] : [];
  const facts = [
    { label: 'Atmakaraka', value: `${ak.planet} in ${ak.sign}, house ${ak.house}` },
    { label: 'Purva punya (5th)', value: fifth.state },
    { label: 'Brought in (Ketu)', value: `house ${ketu.house} — ${BHAVAS[ketu.house - 1].name.toLowerCase()}` },
    { label: 'Hungry for (Rahu)', value: `house ${rahu.house} — ${BHAVAS[rahu.house - 1].name.toLowerCase()}` },
  ];
  if (lord) facts.push({ label: 'Ripening now', value: `${lord} period` });
  const lines = [
    `${The(ak.planet)} holds the highest degree in your chart, which makes it your atmakaraka — the planet that carries the lesson this life is organised around. It sits in your ${ordinal(ak.house)}, so the lesson plays out through ${BHAVAS[ak.house - 1].summary}. ${strengths[ak.planet].band === 'strong' || strengths[ak.planet].band === 'working' ? 'It is in good condition, so you meet the lesson with resources.' : 'It is under strain, so the lesson asks for patience before it pays.'}`,
    `Your 5th house is purva punya — merit carried in from before. It ${is(fifth.state)}.${fifth.because ? ` ${fifth.because}` : ''}`,
    `Ketu in your ${ordinal(ketu.house)} marks what you arrived already knowing — ${BHAVAS[ketu.house - 1].summary}. It comes easily and holds little appetite. Rahu opposite, in your ${ordinal(rahu.house)}, is what this life is hungry to learn: ${BHAVAS[rahu.house - 1].summary}.`,
  ];
  if (lord) {
    lines.push(`Of everything carried in, the ${lord} period decides what ripens now${ruled.length ? ` — the karma of your ${ruled.map(ordinal).join(' and ')} house${ruled.length > 1 ? 's' : ''}` : ''}, until ${dasha.current.end.toISOString().slice(0, 10)}.`);
  }
  return { id: 'karma', name: 'Karma', sanskrit: 'Prarabdha', decides: 'what you were born carrying', facts, lines };
}

function lineageLevel(chart, strengths, rel) {
  const by = Object.fromEntries(chart.planets.map((p) => [p.name, p]));
  const ninth = state(rel, 9), fourth = state(rel, 4), second = state(rel, 2);
  const sunWithNode = ['Rahu', 'Ketu', 'Saturn'].filter((n) => by[n].house === by.Sun.house);
  const nodeIn9 = ['Rahu', 'Ketu'].filter((n) => by[n].house === 9);
  const facts = [
    { label: "Father's line (9th)", value: ninth.state },
    { label: "Mother's line (4th)", value: fourth.state },
    { label: 'Family (2nd)', value: second.state },
    { label: 'Sun / Moon', value: `${strengths.Sun.band} · ${strengths.Moon.band}` },
  ];
  const lines = [
    `The 9th is the father's side and the ancestors behind it; it ${is(ninth.state)}. The Sun, its karaka, is ${strengths.Sun.band} (${strengths.Sun.score}/10).`,
    `The 4th is the mother and the ground you grew on; it ${is(fourth.state)}. The Moon, its karaka, is ${strengths.Moon.band} (${strengths.Moon.score}/10).`,
    `The 2nd is the family you were raised in and the values it handed you; it ${is(second.state)}.`,
  ];
  const strongest = [ninth, fourth, second].filter((x) => x.state === 'flowing');
  if (strongest.length) lines.push(`What the line already gives you: ${strongest.map((x) => x.because).filter(Boolean).join(' ')}`);
  if (sunWithNode.length || nodeIn9.length) {
    lines.push(`${sunWithNode.length ? `The Sun sits with ${sunWithNode.join(' and ')}` : `${nodeIn9.join(' and ')} sits in your 9th`}. The tradition reads this as an ancestral thread that asks to be remembered — tarpan or a simple offering on Amavasya is the customary way to honour it.`);
  }
  return { id: 'lineage', name: 'Lineage', sanskrit: 'Kula', decides: 'the family line it arrived through', facts, lines };
}

function placeLevel(chart, rel, place, margin) {
  const asc = chart.ascendant;
  const fourth = state(rel, 4);
  return {
    id: 'place', name: 'Place', sanskrit: 'Desha', decides: 'which sign was rising, and so every house',
    facts: [
      { label: 'Born in', value: `${place.name}, ${place.country}` },
      { label: 'Coordinates', value: `${Math.abs(place.lat).toFixed(2)}°${place.lat >= 0 ? 'N' : 'S'}, ${Math.abs(place.lon).toFixed(2)}°${place.lon >= 0 ? 'E' : 'W'}` },
      { label: 'Rising there', value: `${asc.sign} ${asc.degree.toFixed(1)}°` },
      { label: 'Land and home (4th)', value: fourth.state },
    ],
    lines: [
      `At that instant ${asc.sign} was rising on the eastern horizon of ${place.name}. Born at the same moment a few hundred kilometres east or west, a different degree would have been rising — the place is what fixed your lagna, and the lagna is what numbers all twelve houses.`,
      `The lord of that rising sign is ${the(asc.lord)}, so ${the(asc.lord)} is the planet that stands for you in this chart.`,
      `The 4th is land, home and the ground under you; in your chart it ${is(fourth.state)}.`,
    ],
  };
}

function timeLevel(utc, day, place) {
  const limbs = limbsAt(utc);
  const weekday = sunriseWeekday(day.rise, place.lon);
  return {
    id: 'time', name: 'Time', sanskrit: 'Kala', decides: 'the quality of the day',
    facts: [
      { label: 'Vara', value: VARA[weekday] },
      { label: 'Tithi', value: limbs.tithi.label },
      { label: 'Nakshatra', value: limbs.nakshatra },
      { label: 'Yoga', value: limbs.yoga },
      { label: 'Karana', value: limbs.karana },
    ],
    weekdayLord: DAY_LORDS[weekday],
    lines: [
      `You were born on a ${VARA[weekday].split(' ')[0]} — a day of ${the(DAY_LORDS[weekday])}. The Vedic day runs sunrise to sunrise, so this is the day by the sun, not the calendar.`,
      `The tithi was ${limbs.tithi.label}: the angle between the Sun and Moon, ${limbs.tithi.paksha === 'Shukla' ? 'with the Moon growing' : 'with the Moon waning'}. It is the relationship between what you are and what you feel.`,
      `The Moon was in ${limbs.nakshatra}, the yoga was ${limbs.yoga} and the karana was ${limbs.karana}. These five limbs are your janma panchang — the same five a priest reads for any important day.`,
    ],
  };
}

function ghadiLevel(utc, day, place, margin) {
  const isDay = utc >= day.rise && utc < day.set;
  const since = ghatiPala(utc - day.rise);
  const span = isDay ? (day.set - day.rise) : (day.nextRise - day.set);
  const from = isDay ? day.rise : day.set;
  const part = Math.floor(((utc - from) / span) * 12);
  const weekday = sunriseWeekday(day.rise, place.lon);
  const horaIndex = (isDay ? 0 : 12) + part;
  const hora = CHALDEAN[(CHALDEAN.indexOf(DAY_LORDS[weekday]) + horaIndex) % 7];
  const muhurta = Math.floor(((utc - from) / span) * 15) + 1;
  const tight = Math.min(margin.minutesLeft, margin.minutesIn);
  return {
    id: 'ghadi', name: 'Ghadi and pala', sanskrit: 'Ishtakala', decides: 'the exact instant',
    facts: [
      { label: 'After sunrise', value: since.label },
      { label: 'Born in the', value: isDay ? 'day' : 'night' },
      { label: 'Hora', value: `${hora} (${ordinal(part + 1)} of 12)` },
      { label: 'Muhurta', value: `${ordinal(muhurta)} of 15${isDay && muhurta === 8 ? ' — Abhijit' : ''}` },
      { label: 'Lagna margin', value: `${margin.minutesIn} min in · ${margin.minutesLeft} min left` },
    ],
    ishtakala: since,
    hora,
    lines: [
      `You were born ${since.label} after sunrise (${since.ghati} × 24 minutes, plus ${since.pala} × 24 seconds). This is the ishtakala — the traditional way a birth time is written, counted from the sun rather than the clock.`,
      `It was the ${ordinal(part + 1)} hora of the ${isDay ? 'day' : 'night'}, ruled by ${the(hora)}. ${The(hora)} coloured the hour you arrived in.`,
      tight < 10
        ? `Your lagna is ${tight} minutes from a sign boundary. A birth time off by that much changes the lagna and every house — if your time is not certain to the minute, treat house readings as provisional.`
        : `Your lagna had been rising for ${margin.minutesIn} minutes and had ${margin.minutesLeft} left, so a birth time a few minutes off does not change your houses.`,
    ],
  };
}

/** The whole chain. `rel` is relations(chart, strengths). */
function janma(chart, strengths, rel, dasha, utc, place) {
  const day = vedicDay(utc, place.lat, place.lon);
  const margin = lagnaMargin(utc, place.lat, place.lon);
  const levels = [
    karmaLevel(chart, strengths, rel, dasha),
    lineageLevel(chart, strengths, rel),
    placeLevel(chart, rel, place, margin),
    timeLevel(utc, day, place),
    ghadiLevel(utc, day, place, margin),
  ];
  return {
    levels,
    sunrise: day.rise,
    summary: 'Each level narrows the one above it. The same karma could arrive through many families, the same family in many places, the same place on many days, the same day at many instants. Your chart is the one instant where all five met.',
  };
}

module.exports = { janma, ghatiPala, vedicDay, lagnaMargin };
