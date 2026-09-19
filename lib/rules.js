/*
 * READING RULES — this file decides what every personal reading says.
 *
 * A reading is built in three passes:
 *   1. FACTS    — plain statements pulled out of the chart (see buildFacts below).
 *   2. PATTERNS — planet + house combinations, described from the tables in this file.
 *   3. RULES    — named overrides for notable placements and yogas, checked against the facts.
 *
 * To change what users read, edit the tables and the RULES array here. Nothing else needs to change.
 * Each rule is: { id, area, when: {…}, weight, text }
 *   when supports:  planetInHouse: ['Jupiter', 5] | planetInSign: ['Saturn', 'Makara']
 *                   lagnaSign: 'Simha' | lagnaLordInHouse: 10 | moonNakshatra: 'Revati'
 *                   dashaLord: 'Venus' | exalted: 'Sun' | debilitated: 'Mars' | retrograde: 'Saturn'
 *                   conjunct: ['Moon', 'Jupiter'] | planetInHouses: ['Mars', [1,4,7,8,12]]
 *   weight orders the lines; higher shows first. Area must be one of AREAS.
 */

const { SIGN_LORDS, VEDIC_SIGNS } = require('./astro');

const AREAS = {
  nature: 'Your nature',
  career: 'Work and direction',
  wealth: 'Money and resources',
  relationships: 'Relationships and family',
  health: 'Health and energy',
  timing: 'This period of your life',
};

// What each planet brings to whatever it touches.
const PLANETS = {
  Sun: { quality: 'authority and a need to be recognised', nature: 'mild malefic', karaka: 'father, status, confidence' },
  Moon: { quality: 'feeling, memory and changeability', nature: 'benefic', karaka: 'mother, mind, comfort' },
  Mars: { quality: 'drive, heat and a willingness to fight', nature: 'malefic', karaka: 'siblings, property, courage' },
  Mercury: { quality: 'analysis, speech and quick handling of detail', nature: 'benefic', karaka: 'learning, trade, communication' },
  Jupiter: { quality: 'growth, guidance and a sense of meaning', nature: 'benefic', karaka: 'teachers, children, wealth' },
  Venus: { quality: 'comfort, taste and the pull towards people', nature: 'benefic', karaka: 'spouse, beauty, pleasure' },
  Saturn: { quality: 'delay, discipline and the weight of responsibility', nature: 'malefic', karaka: 'work, endurance, elders' },
  Rahu: { quality: 'hunger, ambition and unusual routes', nature: 'malefic', karaka: 'foreign things, obsession' },
  Ketu: { quality: 'detachment, doubt and sudden letting go', nature: 'malefic', karaka: 'liberation, loss, instinct' },
};

// What each house governs, and how gently it treats a planet placed there.
const HOUSES = [
  { area: 'nature', label: 'body, self and how you come across', group: 'kendra' },
  { area: 'wealth', label: 'money, family and speech', group: 'neutral' },
  { area: 'career', label: 'courage, effort and siblings', group: 'upachaya' },
  { area: 'relationships', label: 'home, mother and peace of mind', group: 'kendra' },
  { area: 'nature', label: 'learning, children and creativity', group: 'trikona' },
  { area: 'health', label: 'illness, debt and daily obstacles', group: 'dusthana' },
  { area: 'relationships', label: 'marriage, partnership and dealings with others', group: 'kendra' },
  { area: 'health', label: 'crisis, inheritance and hidden things', group: 'dusthana' },
  { area: 'nature', label: 'belief, teachers, luck and long journeys', group: 'trikona' },
  { area: 'career', label: 'work, reputation and public standing', group: 'kendra' },
  { area: 'wealth', label: 'gains, networks and fulfilled wishes', group: 'upachaya' },
  { area: 'health', label: 'expense, sleep, solitude and letting go', group: 'dusthana' },
];

// How the placement tends to play out, by planet nature and house group.
const OUTCOMES = {
  'benefic|kendra': 'This is a strong placement — it supports you steadily and other people feel it.',
  'benefic|trikona': 'This is one of the best places for it; it comes through as genuine good fortune.',
  'benefic|upachaya': 'It improves with age. What starts small here grows if you keep at it.',
  'benefic|dusthana': 'It softens a difficult area, but you may give more here than you receive.',
  'benefic|neutral': 'It works quietly in your favour without much drama.',
  'malefic|kendra': 'It makes this area demanding. Results come, but only through pressure and effort.',
  'malefic|trikona': 'It complicates something that should be easy; patience matters more than force.',
  'malefic|upachaya': 'Malefics do well here. Struggle early turns into strength later.',
  'malefic|dusthana': 'Difficulty here is real but self-limiting; it burns out what it tests.',
  'malefic|neutral': 'It creates friction you can manage, mostly through how you speak and spend.',
  'mild malefic|kendra': 'It brings visibility along with the burden of being watched.',
  'mild malefic|trikona': 'Pride is the risk here; humility turns it into authority.',
  'mild malefic|upachaya': 'Effort is rewarded here, especially after thirty.',
  'mild malefic|dusthana': 'Strain shows up here first; rest is not optional for you.',
  'mild malefic|neutral': 'It pushes you to earn your own standing rather than inherit it.',
};

const EXALTED = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBILITATED = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };

// Named overrides. These are checked against the facts and added on top of the general patterns.
const RULES = [
  { id: 'gajakesari', area: 'nature', weight: 9, when: { kendraFrom: ['Moon', 'Jupiter'] },
    text: 'Jupiter sits in a kendra from your Moon — the Gajakesari pattern. It gives a steady reputation: people tend to trust your judgement, and help arrives through respected elders.' },
  { id: 'chandra-mangal', area: 'wealth', weight: 7, when: { conjunct: ['Moon', 'Mars'] },
    text: 'Moon with Mars gives a sharp instinct for money and risk. You can earn well through your own initiative, but impulsive decisions cost you as fast as they pay.' },
  { id: 'budha-aditya', area: 'career', weight: 7, when: { conjunct: ['Sun', 'Mercury'] },
    text: 'Sun with Mercury sharpens intelligence and speech. Work that involves explaining, writing or advising suits you better than silent labour.' },
  { id: 'saturn-lagna', area: 'nature', weight: 6, when: { planetInHouse: ['Saturn', 1] },
    text: 'Saturn on your ascendant makes you serious early. Life asks for maturity before it is due, and your results arrive later but last longer.' },
  { id: 'mangal-dosha', area: 'relationships', weight: 8, when: { planetInHouses: ['Mars', [1, 4, 7, 8, 12]] },
    text: 'Mars falls in a Manglik house from your ascendant. Traditionally this asks for care in marriage timing and matching; practically, it means heat and impatience need somewhere to go before they reach your partner.' },
  { id: 'rahu-tenth', area: 'career', weight: 7, when: { planetInHouse: ['Rahu', 10] },
    text: 'Rahu in the tenth pushes you towards unconventional or foreign work, and towards visibility. Ambition is high; the risk is chasing the image of success rather than the thing itself.' },
  { id: 'ketu-twelfth', area: 'nature', weight: 5, when: { planetInHouse: ['Ketu', 12] },
    text: 'Ketu in the twelfth turns you inward. Solitude restores you, and you are more suited to quiet practice than to crowds.' },
  { id: 'jupiter-fifth', area: 'nature', weight: 6, when: { planetInHouse: ['Jupiter', 5] },
    text: 'Jupiter in the fifth is a classic placement for learning and for children. Teaching, studying or guiding others gives back more than it takes from you.' },
  { id: 'venus-seventh', area: 'relationships', weight: 6, when: { planetInHouse: ['Venus', 7] },
    text: 'Venus in the seventh favours partnership. You are happiest paired, though comfort can make you slow to leave what no longer fits.' },
];

const norm12 = (n) => ((n - 1) % 12) + 1;

function buildFacts(chart) {
  const by = Object.fromEntries(chart.planets.map((p) => [p.name, p]));
  const lagnaLord = SIGN_LORDS[chart.ascendant.signIndex];
  return {
    chart,
    planets: by,
    lagnaSign: chart.ascendant.sign,
    lagnaSignIndex: chart.ascendant.signIndex,
    lagnaLord,
    lagnaLordHouse: by[lagnaLord]?.house ?? null,
    moonNakshatra: chart.nakshatra?.name ?? null,
    houseOf: (name) => by[name]?.house ?? null,
    signIndexOf: (name) => by[name]?.signIndex ?? null,
  };
}

function matches(when, facts, context) {
  const tests = {
    planetInHouse: ([p, h]) => facts.houseOf(p) === h,
    planetInHouses: ([p, list]) => list.includes(facts.houseOf(p)),
    planetInSign: ([p, sign]) => facts.planets[p]?.sign === sign,
    lagnaSign: (sign) => facts.lagnaSign === sign,
    lagnaLordInHouse: (h) => facts.lagnaLordHouse === h,
    moonNakshatra: (n) => facts.moonNakshatra === n,
    dashaLord: (p) => context.dashaLord === p,
    exalted: (p) => facts.signIndexOf(p) === EXALTED[p],
    debilitated: (p) => facts.signIndexOf(p) === DEBILITATED[p],
    retrograde: (p) => !!facts.planets[p]?.retrograde,
    conjunct: ([a, b]) => facts.signIndexOf(a) !== null && facts.signIndexOf(a) === facts.signIndexOf(b),
    // Kendras are houses 1, 4, 7 and 10 counted from the first planet.
    kendraFrom: ([from, planet]) => {
      const a = facts.signIndexOf(from), b = facts.signIndexOf(planet);
      if (a === null || b === null) return false;
      return [0, 3, 6, 9].includes((b - a + 12) % 12);
    },
  };
  return Object.entries(when).every(([key, value]) => tests[key]?.(value));
}

function dignityNote(planet, signIndex) {
  if (EXALTED[planet] === signIndex) return ' It is exalted here, which is its strongest condition.';
  if (DEBILITATED[planet] === signIndex) return ' It is debilitated here, so its results come unevenly and need conscious effort.';
  if (SIGN_LORDS[signIndex] === planet) return ' It rules this sign, so it acts freely and on its own terms.';
  return '';
}

// The general pattern line for one planet, from the tables above.
function patternLine(p) {
  const info = PLANETS[p.name];
  const house = HOUSES[p.house - 1];
  const outcome = OUTCOMES[`${info.nature}|${house.group}`];
  return {
    area: house.area,
    weight: ['Sun', 'Moon'].includes(p.name) ? 4 : 3,
    text: `${p.name} in house ${p.house} brings ${info.quality} to ${house.label}.${dignityNote(p.name, p.signIndex)} ${outcome}`,
  };
}

function dashaLines(dasha, facts) {
  if (!dasha?.current) return [];
  const lines = [];
  const lord = dasha.current.lord;
  const placed = facts.planets[lord];
  const until = dasha.current.end.toISOString().slice(0, 10);
  lines.push({
    area: 'timing',
    weight: 10,
    text: `You are running the ${lord} mahadasha until ${until}. ${placed
      ? `In your chart ${lord} sits in house ${placed.house} (${HOUSES[placed.house - 1].label}), so these years keep pulling your attention there.`
      : `These years carry the quality of ${PLANETS[lord].quality}.`}`,
  });
  if (dasha.currentAntar) {
    const sub = dasha.currentAntar.lord;
    lines.push({
      area: 'timing',
      weight: 9,
      text: `Within it, the ${sub} antardasha runs until ${dasha.currentAntar.end.toISOString().slice(0, 10)}, colouring this stretch with ${PLANETS[sub].quality}.`,
    });
  }
  return lines;
}

/** Builds the full personal reading. `chart` must be a Vedic chart from astro.birthChart. */
function personalReading(chart, dasha) {
  const facts = buildFacts(chart);
  const context = { dashaLord: dasha?.current?.lord || null };

  const lines = [
    ...chart.planets.map(patternLine),
    ...RULES.filter((r) => matches(r.when, facts, context)).map((r) => ({ area: r.area, weight: r.weight, text: r.text, id: r.id })),
    ...dashaLines(dasha, facts),
    {
      area: 'nature',
      weight: 8,
      text: `Your ascendant is ${facts.lagnaSign}, ruled by ${facts.lagnaLord}${facts.lagnaLordHouse
        ? `, and that ruler sits in house ${facts.lagnaLordHouse} — so ${HOUSES[facts.lagnaLordHouse - 1].label} is where your life story keeps returning.` : '.'}`,
    },
  ];

  const sections = Object.entries(AREAS).map(([key, title]) => ({
    key,
    title,
    lines: lines.filter((l) => l.area === key).sort((a, b) => b.weight - a.weight).map((l) => l.text),
  })).filter((s) => s.lines.length);

  return { sections, matchedRules: lines.filter((l) => l.id).map((l) => l.id) };
}

module.exports = { personalReading, AREAS, PLANETS, HOUSES, RULES, norm12, VEDIC_SIGNS };
