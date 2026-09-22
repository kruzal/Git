/*
 * WESTERN (tropical) layer.
 *
 * Same ephemeris, no ayanamsa. Different questions: elements and modalities
 * instead of dignity, degree-based aspects (major and minor, with proper
 * per-aspect orbs) instead of whole-sign drishti.
 *
 * Reference: AstroLibrary's "Free Astrology Lessons" 1-18 (basics, glyphs,
 * chart layout, houses, planets, rising sign, elements/qualities/polarities,
 * zodiac signs, aspects & orbs, chart synthesis, and the outline of synastry
 * and transits). Content below is paraphrased into this app's own voice and
 * restructured into typed data, not copied — see docs/model.md on sourcing.
 *
 * Everything here is built to double as ML features: every categorical has
 * a small fixed vocabulary, every scalar is a plain number, and ids are
 * stable across charts so per-user rows stack into one feature matrix. See
 * lib/indicators.js, which turns this into the `west.*` indicator block.
 */

const { WESTERN_SIGNS } = require('./astro');

const ELEMENT = ['Fire', 'Earth', 'Air', 'Water'];
const MODALITY = ['Cardinal', 'Fixed', 'Mutable'];
const POLARITY = ['Yang', 'Yin']; // alternates by sign index: Aries=Yang, Taurus=Yin, ...
const LUMINARIES = new Set(['Sun', 'Moon']);

const ELEMENT_TRAIT = {
  Fire: 'initiative and heat — you move first and ask later',
  Earth: 'substance and patience — you trust what you can touch',
  Air: 'ideas and contact — you think by talking to people',
  Water: 'feeling and undertow — you read a room before it speaks',
};
const MODALITY_TRAIT = {
  Cardinal: 'you start things',
  Fixed: 'you hold things',
  Mutable: 'you adapt to things',
};
const POLARITY_TRAIT = {
  Yang: 'active and outward — you reach out to meet the world',
  Yin: 'receptive and inward — you let the world come to you first',
};

const SIGN_TRAIT = {
  Aries: 'direct, impatient, first through the door',
  Taurus: 'steady, sensory, immovable once settled',
  Gemini: 'quick, curious, several conversations at once',
  Cancer: 'protective, tidal, remembers everything',
  Leo: 'warm, proud, needs an audience it respects',
  Virgo: 'precise, useful, quietly critical',
  Libra: 'balancing, charming, allergic to unfairness',
  Scorpio: 'private, intense, all the way down or not at all',
  Sagittarius: 'expansive, blunt, believes before proving',
  Capricorn: 'structural, patient, playing a long game',
  Aquarius: 'detached, systemic, sees the pattern first',
  Pisces: 'porous, imaginative, absorbs the room',
};

// -------------------------------------------------------------- aspects
// Major (Ptolemaic) aspects use a 6° base orb, widened to 9° when either
// body is a luminary. Minor aspects keep a narrow 2-3° orb regardless.
const ASPECTS = [
  { name: 'conjunction', angle: 0, orb: 6, major: true, tone: 'fused', harmony: 'neutral',
    meaning: 'The two blend into one signal, for better or worse depending on what they are.' },
  { name: 'sextile', angle: 60, orb: 6, major: true, tone: 'easy', harmony: 'harmonious',
    meaning: 'An easy opening between the two. It helps only if you actually act on it.' },
  { name: 'square', angle: 90, orb: 6, major: true, tone: 'tense', harmony: 'challenging',
    meaning: 'Friction that forces the two into contact. Growth here comes from repeated effort, not luck.' },
  { name: 'trine', angle: 120, orb: 6, major: true, tone: 'flowing', harmony: 'harmonious',
    meaning: 'The most comfortable channel in the chart, natural enough that it sometimes goes undeveloped.' },
  { name: 'opposition', angle: 180, orb: 6, major: true, tone: 'polarised', harmony: 'challenging',
    meaning: 'Two demands pulling opposite ways. Balance comes from treating them as one whole, not picking a side.' },
  { name: 'semi-sextile', angle: 30, orb: 2, major: false, tone: 'faint', harmony: 'neutral',
    meaning: 'A faint link between signs that share neither element nor mode, more background noise than signal.' },
  { name: 'semi-square', angle: 45, orb: 3, major: false, tone: 'mildly tense', harmony: 'challenging',
    meaning: 'A minor square: low-grade inner irritation rather than open conflict.' },
  { name: 'sesquiquadrate', angle: 135, orb: 3, major: false, tone: 'mildly tense', harmony: 'challenging',
    meaning: 'Reads like the semi-square, but the friction tends to show up as outside difficulty rather than mood.' },
  { name: 'quincunx', angle: 150, orb: 3, major: false, tone: 'adjusting', harmony: 'challenging',
    meaning: 'The two share nothing in common and keep demanding small adjustments, rarely resolved outright.' },
  { name: 'quintile', angle: 72, orb: 2, major: false, tone: 'gifted', harmony: 'harmonious',
    meaning: 'A narrow, talent-shaped link, usually a specific skill rather than a life theme.' },
  { name: 'biquintile', angle: 144, orb: 2, major: false, tone: 'gifted', harmony: 'harmonious',
    meaning: 'Reads like the quintile: a narrow creative talent rather than a broad pressure.' },
];

function aspectBetween(lonA, lonB, nameA, nameB) {
  let gap = Math.abs(lonA - lonB);
  if (gap > 180) gap = 360 - gap;
  const luminary = LUMINARIES.has(nameA) || LUMINARIES.has(nameB);
  for (const a of ASPECTS) {
    const orb = a.major && luminary ? a.orb + 3 : a.orb;
    const off = Math.abs(gap - a.angle);
    if (off <= orb) {
      return {
        name: a.name, angle: a.angle, major: a.major, tone: a.tone, harmony: a.harmony, meaning: a.meaning,
        orb, exactness: Math.round((1 - off / orb) * 100), separation: Math.round(gap * 100) / 100,
      };
    }
  }
  return null;
}

// -------------------------------------------------------------- houses
// Lesson 4's table of natural house rulers — the archetype each house
// carries independent of any particular chart. `traditionalRuler` predates
// the outer planets; `naturalRuler` is the modern co-ruler where one exists.
const WESTERN_HOUSES = [
  { n: 1, name: 'Self', keywords: ['self-awareness', 'the physical body', 'personality', 'appearance', 'early environment', 'beginnings'], naturalSign: 'Aries', naturalRuler: 'Mars', traditionalRuler: 'Mars', angular: true },
  { n: 2, name: 'Possessions', keywords: ['own money and possessions', 'what you value', 'hidden talents', 'self-worth'], naturalSign: 'Taurus', naturalRuler: 'Venus', traditionalRuler: 'Venus', angular: false },
  { n: 3, name: 'Communication', keywords: ['communication', 'siblings', 'neighbours', 'short journeys', 'the lower mind', 'early education'], naturalSign: 'Gemini', naturalRuler: 'Mercury', traditionalRuler: 'Mercury', angular: false },
  { n: 4, name: 'Home', keywords: ['home and family', 'land', 'inner emotional security', 'roots', 'one parent'], naturalSign: 'Cancer', naturalRuler: 'Moon', traditionalRuler: 'Moon', angular: true },
  { n: 5, name: 'Pleasure', keywords: ['children', 'creativity', 'romance', 'hobbies', 'risk-taking', 'self-expression'], naturalSign: 'Leo', naturalRuler: 'Sun', traditionalRuler: 'Sun', angular: false },
  { n: 6, name: 'Work & health', keywords: ['daily work', 'service', 'diet and health', 'employees', 'routine'], naturalSign: 'Virgo', naturalRuler: 'Mercury', traditionalRuler: 'Mercury', angular: false },
  { n: 7, name: 'Partnership', keywords: ['marriage', 'business partnerships', 'contracts', 'open enemies', 'cooperative relationships'], naturalSign: 'Libra', naturalRuler: 'Venus', traditionalRuler: 'Venus', angular: true },
  { n: 8, name: 'Shared resources', keywords: ['joint finances', 'death and regeneration', 'taxes', 'inheritance', 'transformation', 'the actual act of sex'], naturalSign: 'Scorpio', naturalRuler: 'Pluto', traditionalRuler: 'Mars', angular: false },
  { n: 9, name: 'Higher mind', keywords: ['philosophy', 'religion', 'law', 'higher education', 'long journeys', 'publishing'], naturalSign: 'Sagittarius', naturalRuler: 'Jupiter', traditionalRuler: 'Jupiter', angular: false },
  { n: 10, name: 'Career', keywords: ['status and honour', 'career', 'reputation', 'the dominant parent', 'public recognition'], naturalSign: 'Capricorn', naturalRuler: 'Saturn', traditionalRuler: 'Saturn', angular: true },
  { n: 11, name: 'Community', keywords: ['friends', 'large groups', 'hopes and goals', 'associations', 'self-realisation'], naturalSign: 'Aquarius', naturalRuler: 'Uranus', traditionalRuler: 'Saturn', angular: false },
  { n: 12, name: 'The unconscious', keywords: ['the subconscious', 'hidden matters', 'seclusion', 'self-undoing', 'institutions'], naturalSign: 'Pisces', naturalRuler: 'Neptune', traditionalRuler: 'Jupiter', angular: false },
];

function houseReport(chart, placements) {
  return WESTERN_HOUSES.map((h) => {
    const cuspSignIndex = (chart.ascendant.signIndex + (h.n - 1)) % 12;
    const occupants = placements.filter((p) => p.house === h.n).map((p) => p.planet);
    return { ...h, cuspSign: WESTERN_SIGNS[cuspSignIndex], occupants };
  });
}

// -------------------------------------------------------------- chart ruler
// The planet ruling the rising sign colours the reading of every other
// placement — the "filter" the rest of the chart passes through.
const MODERN_RULER = { Scorpio: 'Pluto', Aquarius: 'Uranus', Pisces: 'Neptune' };

function chartRuler(chart, placements) {
  const sign = chart.ascendant.sign;
  const traditional = chart.ascendant.lord;
  const modern = MODERN_RULER[sign] || traditional;
  const seat = placements.find((p) => p.planet === traditional) || placements.find((p) => p.planet === modern);
  return {
    sign, traditional, modern, house: seat ? seat.house : null,
    text: `Your chart ruler is ${traditional}${modern !== traditional ? `, with ${modern} as its modern co-ruler` : ''}` +
      (seat ? ` — it sits in your ${ordinal(seat.house)} house, which colours how the rest of the chart gets filtered.`
             : ', outside the seven visible bodies tracked here.'),
  };
}

// -------------------------------------------------------------- love language
// Venus's element, per Lesson 12 — the flavour of energy someone needs to
// register as being loved, distinct from what their Sun or Moon need.
const LOVE_LANGUAGE = {
  Water: 'You love through emotional depth. Words and touch alone will not land until the other person can feel that you are actually with them.',
  Fire: 'You love through shared motion. Activity, adventure and physical closeness are how the feeling becomes real to you.',
  Earth: 'You love through steadiness. Showing up, staying, and handling the practical is how you say it, more than words do.',
  Air: 'You love through conversation and companionship. Talking, sharing ideas, and being genuinely interesting to each other matters most.',
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// -------------------------------------------------------------- profile
/** `chart` must be a tropical chart from astro.birthChart(..., 'western'). */
function westernProfile(chart) {
  const bodies = chart.planets.filter((p) => !['Rahu', 'Ketu'].includes(p.name));

  const placements = bodies.map((p) => ({
    planet: p.name, sign: p.sign, degree: p.degree, house: p.house,
    element: ELEMENT[p.signIndex % 4], modality: MODALITY[p.signIndex % 3], polarity: POLARITY[p.signIndex % 2],
    retrograde: p.retrograde, trait: SIGN_TRAIT[p.sign],
  }));

  // planet-to-planet aspects
  const aspects = bodies.flatMap((a, i) => bodies.slice(i + 1).map((b) => {
    const asp = aspectBetween(a.longitude, b.longitude, a.name, b.name);
    return asp && { pair: [a.name, b.name], toAngle: false, ...asp };
  }).filter(Boolean));

  // conjunctions/aspects to the Ascendant — the single most-weighted contact
  // in synthesis (Lesson 10): a planet tied to an angle reads as amplified.
  bodies.forEach((p) => {
    const asp = aspectBetween(p.longitude, chart.ascendant.longitude, p.name, 'Ascendant');
    if (asp) aspects.push({ pair: [p.name, 'Ascendant'], toAngle: true, ...asp });
  });
  aspects.sort((x, y) => (y.exactness + (y.toAngle && y.name === 'conjunction' ? 50 : 0))
    - (x.exactness + (x.toAngle && x.name === 'conjunction' ? 50 : 0)));

  // element / modality / polarity balance — Sun and Moon count double, and
  // the Ascendant is tallied alongside the seven bodies (Lesson 10).
  const counts = { element: {}, modality: {}, polarity: {} };
  const bump = (set, key, weight) => { set[key] = (set[key] || 0) + weight; };
  const tally = (signIndex, weight) => {
    bump(counts.element, ELEMENT[signIndex % 4], weight);
    bump(counts.modality, MODALITY[signIndex % 3], weight);
    bump(counts.polarity, POLARITY[signIndex % 2], weight);
  };
  bodies.forEach((p) => tally(p.signIndex, LUMINARIES.has(p.name) ? 2 : 1));
  tally(chart.ascendant.signIndex, 1);
  const total = ELEMENT.reduce((s, el) => s + (counts.element[el] || 0), 0); // 10 for a standard chart

  const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
  const [domElement, elCount] = top(counts.element);
  const [domModality, modCount] = top(counts.modality);
  const [domPolarity] = top(counts.polarity);
  // Lesson 10's thresholds: 5+ of an element/modality is "predominant", 0-1 is "weakest".
  const predominantElement = ELEMENT.filter((el) => (counts.element[el] || 0) >= 5);
  const weakestElement = ELEMENT.filter((el) => (counts.element[el] || 0) <= 1);
  const predominantModality = MODALITY.filter((m) => (counts.modality[m] || 0) >= 5);
  const weakestModality = MODALITY.filter((m) => (counts.modality[m] || 0) <= 1);

  const venus = placements.find((p) => p.planet === 'Venus');

  return {
    sun: placements.find((p) => p.planet === 'Sun'),
    moon: placements.find((p) => p.planet === 'Moon'),
    rising: { sign: chart.ascendant.sign, degree: chart.ascendant.degree, trait: SIGN_TRAIT[chart.ascendant.sign] },
    placements,
    aspects,
    houses: houseReport(chart, placements),
    chartRuler: chartRuler(chart, placements),
    loveLanguage: { element: venus.element, text: LOVE_LANGUAGE[venus.element] },
    balance: {
      element: counts.element, modality: counts.modality, polarity: counts.polarity, total,
      dominant: `${domElement} ${domModality}`,
      text: `Your chart leans ${domElement} (${elCount} of ${total}) and ${domModality} (${modCount} of ${total}) — ${ELEMENT_TRAIT[domElement]}, and ${MODALITY_TRAIT[domModality]}.`,
      missing: ELEMENT.filter((el) => !counts.element[el]),
      predominantElement, weakestElement, predominantModality, weakestModality,
      polarityDominant: domPolarity, polarityText: POLARITY_TRAIT[domPolarity],
    },
    // The big three, which is how most people meet Western astrology.
    bigThree: {
      sun: placements.find((p) => p.planet === 'Sun').sign,
      moon: placements.find((p) => p.planet === 'Moon').sign,
      rising: chart.ascendant.sign,
    },
  };
}

module.exports = {
  westernProfile, aspectBetween, SIGN_TRAIT, ELEMENT_TRAIT, MODALITY_TRAIT, POLARITY_TRAIT,
  WESTERN_SIGNS, WESTERN_HOUSES, ASPECTS, ordinal,
};
