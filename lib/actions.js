/*
 * ACTIONS — turning a finding into something a person will actually keep doing.
 *
 * A remedy that reads well and is never done has changed nothing. The difference between
 * advice that is read and advice that is kept is mostly design, so every action here
 * carries the parts that make a habit stick:
 *
 *   why        built from THIS chart, in the person's own terms: the planet, the house,
 *              the sign, the running period. Not a generic line about the planet.
 *   do         the full practice
 *   tiny       a two-minute version, because the full one is what people skip
 *   when/cue   a day, a time of day and a trigger that already exists in their week
 *   marker     what they will notice in their own behaviour, so they can tell it is working
 *   trial      eight weeks, then look back, instead of an open-ended obligation
 *
 * And it can be committed to and checked in on (see progress), because a streak a person
 * can see is the single most reliable thing that keeps a practice going.
 *
 * Honesty rule: these are practices from the tradition, described as that. The text never
 * claims a practice changes a planet or guarantees an outcome. What it can truthfully offer
 * is a discipline, a schedule and a way to notice the difference.
 */

const { SIGN_LORDS, VEDIC_SIGNS } = require('./astro');
const { REMEDIES, LIFE_AREAS } = require('./lenses');
const { BHAVAS, ordinal } = require('./bhava');
const { PLANETS } = require('./interpret');

const PLAN = {
  Sun: { window: 'between 6 and 8 in the morning', minutes: 5, cue: 'when you first step outside on Sunday morning',
    tiny: 'Stand in the morning light for one minute and say aloud the one thing you will do today.',
    marker: 'You arrive when you said you would, and people start treating your word as a fixed point.',
    builds: 'reliability and a steady sense of your own authority' },
  Moon: { window: 'in the evening', minutes: 10, cue: 'after dinner on Monday',
    tiny: 'Ten slow breaths, longer on the way out, before you sleep.',
    marker: 'You notice a mood before it takes over your evening.',
    builds: 'emotional steadiness and care for the people closest to you' },
  Mars: { window: 'in the morning', minutes: 20, cue: 'before breakfast on Tuesday',
    tiny: 'Ten minutes of brisk walking or any hard physical effort.',
    marker: 'Heat finds somewhere to go that is not another person, and one avoided task gets done.',
    builds: 'directed energy and follow-through' },
  Mercury: { window: 'at any point in the day', minutes: 15, cue: 'at the start of your Wednesday work block',
    tiny: 'Teach someone one thing you know, in under five minutes.',
    marker: 'You explain things more clearly and put off fewer messages.',
    builds: 'clear speech and generosity with what you know' },
  Jupiter: { window: 'in the morning', minutes: 15, cue: 'with your first drink on Thursday',
    tiny: 'Write down one thing you learned this week and send it to someone who could use it.',
    marker: 'You ask for advice sooner, and give it more simply.',
    builds: 'good counsel, both given and received' },
  Venus: { window: 'in the evening', minutes: 15, cue: 'when you get home on Friday',
    tiny: 'Tidy one surface and keep one small promise you made.',
    marker: 'Your surroundings and your word both feel more kept.',
    builds: 'care, order, and being someone whose promises hold' },
  Saturn: { window: 'before noon', minutes: 15, cue: 'straight after your first tea on Saturday',
    tiny: 'Give a few minutes, or one small kindness, to someone whose work is physical.',
    marker: 'You finish a slow, unglamorous task you had been avoiding.',
    builds: 'patience, and showing up when nobody is watching' },
  Rahu: { window: 'at night', minutes: 10, cue: 'in bed, before you sleep, on Saturday',
    tiny: 'Write the next concrete step toward the life you want, in one line.',
    marker: 'Ambition turns into a next step you can actually take tomorrow.',
    builds: 'turning appetite into direction' },
  Ketu: { window: 'at any point in the day', minutes: 30, cue: 'on a Tuesday walk or short trip',
    tiny: 'Ten minutes outdoors with no phone, near water or open sky.',
    marker: 'You are calmer after somewhere quiet, and you let one thing go.',
    builds: 'detachment you choose, rather than detachment that happens to you' },
};

// What practising it means for each area of life, phrased as what changes in how you show up.
const LEVER = {
  career: 'the consistency people notice at work',
  money: 'follow-through on saving and spending',
  marriage: 'the patience and presence the people close to you feel',
  family: 'how settled you are with the people at home',
  health: 'a steadier routine and steadier energy',
  education: 'focus, and the habit of finishing what you study',
  foreign: 'readiness for change and for distance',
  spiritual: 'a practice you can keep when the mood has gone',
};

const TRIAL_WEEKS = 8;

/**
 * How a planet actually touches a topic in this chart, said precisely: which of the topic's
 * houses it rules or sits in, or that it is a natural significator. Then what practising it builds.
 */
function topicLink(planet, topic, p, ruled) {
  const name = topic.name.toLowerCase();
  const houseLinks = [];
  const ruledHere = ruled.filter((h) => topic.houses.includes(h));
  if (ruledHere.length) houseLinks.push(`rules your ${listed(ruledHere.map(ordinal))} house${ruledHere.length > 1 ? 's' : ''}`);
  if (topic.houses.includes(p.house)) houseLinks.push(`sits in your ${ordinal(p.house)} house`);
  const significator = topic.planets.includes(planet);

  const parts = [];
  if (houseLinks.length) parts.push(`${planet} ${listed(houseLinks)}, so it touches ${name} directly`);
  if (significator) parts.push(houseLinks.length ? `it is also a natural significator of ${name}` : `${planet} is a natural significator of ${name}`);
  const touch = parts.length ? `${parts.join('; ')}.` : `${planet} touches ${name} only indirectly in your chart.`;
  return `${touch} Practising it builds ${PLAN[planet].builds}. That is the part of ${name} that depends on you.`;
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const when = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

/** Houses a planet rules, for the given lagna. Rahu and Ketu rule none. */
const housesRuledBy = (planet, ascIndex) =>
  Array.from({ length: 12 }, (_, i) => i + 1).filter((h) => SIGN_LORDS[(ascIndex + h - 1) % 12] === planet);

const listed = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);

/**
 * One action plan, anchored to this chart. `topicKey` only changes the framing of why it
 * matters; the practice itself is per planet, so a person is never handed five practices
 * for one planet.
 */
function plan(planet, topicKey, { chart, strengths, dasha }) {
  const base = REMEDIES[planet];
  const extra = PLAN[planet];
  if (!base || !extra) return null;

  const p = chart.planets.find((x) => x.name === planet);
  const s = strengths[planet];
  const ruled = housesRuledBy(planet, chart.ascendant.signIndex);
  const topic = LIFE_AREAS.find((a) => a.key === topicKey);
  const running = dasha?.current?.lord === planet ? `runs your main period (mahadasha) until ${when(dasha.current.end)}`
    : dasha?.currentAntar?.lord === planet ? `runs your current sub-period (antardasha) until ${when(dasha.currentAntar.end)}` : null;

  const why = [
    { label: 'In your chart', text: `${planet} sits in your ${ordinal(p.house)} house (${BHAVAS[p.house - 1].name.toLowerCase()}) in ${p.sign}, at ${s.score}/10 (${s.band}).` },
    ...(ruled.length || running ? [{ label: 'Its role', text:
      `${ruled.length ? `It rules your ${listed(ruled.map(ordinal))} house${ruled.length > 1 ? 's' : ''}` : 'It rules no house of its own'}${running ? ` and ${running}` : ''}.` }] : []),
    ...(topic ? [{ label: `Why it matters for ${topic.name.toLowerCase()}`, text: topicLink(planet, topic, p, ruled) }] : []),
    { label: 'The tradition', text: `The tradition gives ${planet} ${base.day}s and this practice. Whatever you believe about the planets, the practice itself is something you can do, schedule and track.` },
    { label: 'What you are building', text: `${extra.builds[0].toUpperCase()}${extra.builds.slice(1)}.` },
  ];

  return {
    id: `act.${planet}`, planet, topic: topicKey || null,
    day: base.day, window: extra.window, minutes: extra.minutes, cue: extra.cue,
    do: base.do, tiny: extra.tiny, marker: extra.marker,
    trial: { weeks: TRIAL_WEEKS, review: `After ${TRIAL_WEEKS} weeks, look for this in yourself: ${extra.marker.charAt(0).toLowerCase()}${extra.marker.slice(1)}` },
    optional: { give: base.give, wear: base.wear, avoid: base.avoid },
    why,
    highlights: { houses: [p.house, ...ruled], planets: [planet] },
    sign: VEDIC_SIGNS[p.signIndex], band: s.band, score: s.score,
    live: !!running,
  };
}

// ------------------------------------------------------------------ progress
// Weekly cadence on the planet's day. A week counts if there is any check-in in it, so one
// missed day never breaks a streak that a missed week would.

/** Index of the Monday-start week containing a YYYY-MM-DD date. 1970-01-05 was a Monday. */
function weekIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1970, 0, 5)) / (7 * 86400000));
}

const dayOfWeek = (dateStr) => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const addDays = (dateStr, n) => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** Next date on or after `today` that falls on `dayName`. */
function nextDue(dayName, today) {
  const diff = (DAYS.indexOf(dayName) - dayOfWeek(today) + 7) % 7;
  return addDays(today, diff);
}

/**
 * Where someone stands on a practice. `checkins` are YYYY-MM-DD strings, `today` likewise.
 * streakWeeks counts consecutive weeks with a check-in, ending this week or last week, so the
 * streak is still alive on the Monday after a good week.
 */
function progress({ checkins, startedOn, day, today }) {
  const weeks = new Set(checkins.map(weekIndex));
  const thisWeek = weekIndex(today);
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - 1;
  let streak = 0;
  while (weeks.has(cursor)) { streak += 1; cursor -= 1; }

  const startWeek = weekIndex(startedOn);
  const weekNumber = thisWeek - startWeek + 1;
  return {
    total: checkins.length,
    doneThisWeek: weeks.has(thisWeek),
    streakWeeks: streak,
    weekNumber: Math.max(1, weekNumber),
    trialWeeks: TRIAL_WEEKS,
    trialComplete: weekNumber > TRIAL_WEEKS,
    weekDots: Array.from({ length: TRIAL_WEEKS }, (_, i) => weeks.has(startWeek + i)),
    lastDone: checkins.length ? [...checkins].sort().at(-1) : null,
    nextDue: nextDue(day, today),
    dueToday: dayOfWeek(today) === DAYS.indexOf(day),
  };
}

module.exports = { plan, progress, weekIndex, nextDue, housesRuledBy, PLAN, LEVER, TRIAL_WEEKS };
