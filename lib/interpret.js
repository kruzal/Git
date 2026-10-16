/*
 * INTERPRETATION LAYER
 *
 * Turns a computed chart into readable sections. Everything here is composed,
 * not hand-written per chart: a line is built from (planet × house × strength)
 * or (house × lord × placement), so 108 placements come from ~30 tables.
 *
 * Every line carries a `tier`:
 *   open        shown to everyone
 *   guarded     shown, framed as a tendency to watch rather than a verdict
 *   restricted  never auto-shown — consultation only
 *
 * Content excluded by policy (not merely tiered): predictions of infidelity,
 * mental illness, addiction, third-party medical diagnosis, and any advice
 * that reduces someone's contact with people who support them.
 */

const { SIGN_LORDS, VEDIC_SIGNS } = require('./astro');
const { aspectedHouses, conjunctions, connectedToHouse, mutualAspect } = require('./aspects');
const { evaluateAll } = require('./strength');
const { BHAVAS, aspectEffect, tags } = require('./bhava');

// ---------------------------------------------------------------- houses
const HOUSES = [
  { n: 1, name: 'Self', area: 'body, personality, how you come across', group: 'kendra', keywords: ['appearance', 'health', 'outlook'] },
  { n: 2, name: 'Wealth & speech', area: 'money you earn, family, what you say', group: 'neutral', keywords: ['savings', 'family', 'voice', 'food'] },
  { n: 3, name: 'Effort', area: 'courage, siblings, short travel, communication', group: 'upachaya', keywords: ['hard work', 'siblings', 'writing', 'marketing'] },
  { n: 4, name: 'Home', area: 'mother, property, vehicles, peace of mind', group: 'kendra', keywords: ['home', 'comfort', 'land', 'schooling'] },
  { n: 5, name: 'Creativity', area: 'children, education, romance, intelligence', group: 'trikona', keywords: ['learning', 'children', 'creativity', 'speculation'] },
  { n: 6, name: 'Obstacles', area: 'work, service, debts, competition, health', group: 'dusthana', keywords: ['job', 'rivals', 'loans', 'routine'] },
  { n: 7, name: 'Partnership', area: 'marriage, business partners, public dealings', group: 'kendra', keywords: ['spouse', 'partnership', 'contracts'] },
  { n: 8, name: 'Transformation', area: 'sudden change, inheritance, research, hidden things', group: 'dusthana', keywords: ['crisis', 'occult', 'inheritance', 'research'] },
  { n: 9, name: 'Fortune', area: 'luck, father, teachers, belief, long journeys', group: 'trikona', keywords: ['luck', 'guru', 'travel', 'dharma'] },
  { n: 10, name: 'Career', area: 'work, reputation, status, what you are known for', group: 'kendra', keywords: ['profession', 'authority', 'karma'] },
  { n: 11, name: 'Gains', area: 'income, friends, networks, fulfilled wishes', group: 'upachaya', keywords: ['gains', 'friends', 'elder siblings'] },
  { n: 12, name: 'Release', area: 'expense, foreign lands, sleep, solitude, letting go', group: 'dusthana', keywords: ['expenses', 'foreign', 'meditation', 'investment'] },
];

// ---------------------------------------------------------------- planets
const PLANETS = {
  Sun: { quality: 'authority and the need to be seen', karaka: 'father, status, confidence', nature: 'mild malefic', operator: 'illuminates' },
  Moon: { quality: 'feeling, memory and changeability', karaka: 'mother, mind, cash flow', nature: 'benefic', operator: 'softens' },
  Mars: { quality: 'drive, heat and the willingness to fight', karaka: 'siblings, property, courage', nature: 'malefic', operator: 'forces' },
  Mercury: { quality: 'analysis, speech and quick handling of detail', karaka: 'learning, trade, communication', nature: 'benefic', operator: 'sharpens' },
  Jupiter: { quality: 'growth, guidance and a sense of meaning', karaka: 'teachers, children, wealth', nature: 'benefic', operator: 'expands' },
  Venus: { quality: 'comfort, taste and the pull towards people', karaka: 'spouse, beauty, pleasure', nature: 'benefic', operator: 'refines' },
  Saturn: { quality: 'delay, discipline and the weight of responsibility', karaka: 'work, endurance, elders', nature: 'malefic', operator: 'tests' },
  Rahu: { quality: 'hunger, ambition and unusual routes', karaka: 'foreign things, obsession', nature: 'malefic', operator: 'magnifies' },
  Ketu: { quality: 'detachment, doubt and sudden letting go', karaka: 'liberation, instinct', nature: 'malefic', operator: 'withdraws' },
};

// How a placement tends to land, by planet nature and house group.
const OUTCOME = {
  'benefic|kendra': 'It supports you steadily here, and other people feel it.',
  'benefic|trikona': 'This is among the best places for it — it comes through as genuine good fortune.',
  'benefic|upachaya': 'It improves with age. What starts small here grows if you keep at it.',
  'benefic|dusthana': 'It softens a hard area, though you may give more here than you get back.',
  'benefic|neutral': 'It works quietly in your favour without much drama.',
  'malefic|kendra': 'It makes this area demanding. Results come, but through pressure.',
  'malefic|trikona': 'It complicates something that should be easy; patience matters more than force.',
  'malefic|upachaya': 'Malefics do well here. Early struggle turns into strength later.',
  'malefic|dusthana': 'Difficulty here is real but self-limiting — it burns out what it tests.',
  'malefic|neutral': 'It creates friction you can manage, mostly through how you speak and spend.',
  'mild malefic|kendra': 'It brings visibility, along with the burden of being watched.',
  'mild malefic|trikona': 'Pride is the risk; humility turns it into authority.',
  'mild malefic|upachaya': 'Effort is rewarded here, especially after thirty.',
  'mild malefic|dusthana': 'Strain shows here first. Rest is not optional for you.',
  'mild malefic|neutral': 'You are pushed to earn your standing rather than inherit it.',
};

// ---------------------------------------------------------------- lagna
const LAGNA = {
  Mesha: 'You start things. Initiative comes easily, patience less so.',
  Vrishabha: 'Steady and sensory. You build slowly and hold what you build.',
  Mithuna: 'Quick, curious, verbal. You think by talking.',
  Karka: 'Protective and tidal. Your mood is your weather system.',
  Simha: 'You take the room. Recognition matters more than you admit.',
  Kanya: 'Precise and useful. You fix things other people leave broken.',
  Tula: 'You weigh everything. Fairness is a need, not a preference.',
  Vrishchika: 'Private and intense. You go to the bottom of things or not at all.',
  Dhanu: 'Wide-ranging and faithful. You run on belief more than proof.',
  Makara: 'Structural and patient. You are building something with a long horizon.',
  Kumbha: 'Detached and systemic. You see the pattern before the people.',
  Meena: 'Porous and imaginative. You absorb the room whether you want to or not.',
};

// ---------------------------------------------------------------- conjunctions
// Only pairs the corpus actually covers. Either order works; keys are normalised below.
const CONJUNCTIONS = {
  'Jupiter+Rahu': { name: 'Guru Chandal', tier: 'guarded', text: 'Jupiter with Rahu — the old teacher sitting beside the young rebel. Real teachers arrive late or not at all, so you learn by falling and getting up. Fortune rarely opens near your birthplace; distance tends to unlock it. You teach well, even if nobody taught you.' },
  'Jupiter+Ketu': { name: 'Guru and disciple', tier: 'open', text: 'Jupiter with Ketu is the teacher beside his own student. Blessings you give tend to land — people come to you for a word before they start things. Study and distance both work in your favour.' },
  'Moon+Jupiter': { name: 'Gajakesari', tier: 'open', text: 'Moon with Jupiter is Gajakesari. Support arrives through people — parents, partner, teachers, friends. You grow with age rather than peaking early, and education is the lever that moves everything else.' },
  'Sun+Mercury': { name: 'Budha-Aditya', tier: 'open', text: 'Sun with Mercury sharpens intelligence and speech. Work that involves explaining, writing or advising suits you better than silent labour. Common — roughly half of charts have it.' },
  'Moon+Mars': { name: 'Chandra-Mangal', tier: 'open', text: 'Moon with Mars gives instinct for money and risk, and a stubbornness that is hard to move once you have decided. You do your best work excited.' },
  'Sun+Moon': { name: 'Amavasya', tier: 'guarded', text: 'Sun with Moon — born near the new moon. Your inner world is larger than your outer one. The risk is drifting from ground reality: what you have decided in your head can run well ahead of what is actually built.' },
  'Moon+Mercury': { name: null, tier: 'open', text: 'Moon with Mercury: restless, curious, quick to pick things up. You learn better moving than sitting — walking, travelling, listening. Often a foreign connection in how you earn.' },
  'Moon+Venus': { name: null, tier: 'open', text: 'Moon with Venus: sweet-spoken and easy to be around. Your partner is emotionally attentive, sometimes almost parental. Music and art are not decoration for you.' },
  'Moon+Saturn': { name: null, tier: 'guarded', text: 'Moon with Saturn is a child in a room with an eighty-year-old. A pressure you cannot always name, and a face that reads as serious even when you are fine. The upside: you save and invest better than most.' },
  'Moon+Rahu': { name: null, tier: 'guarded', text: 'Moon with Rahu magnifies feeling. Whatever you are going through is visible — you are not built to hide it. Your read on other people is unusually sharp; you notice intentions others miss.' },
  'Moon+Ketu': { name: null, tier: 'guarded', text: 'Moon with Ketu keeps feeling inward. You understand others easily and are understood less often. Travel — mountains, water, distance — settles you more reliably than talking does.' },
  'Sun+Jupiter': { name: null, tier: 'open', text: 'Sun with Jupiter: high self-worth and a big heart. You know right from wrong and will say so. People notice when you walk in.' },
  'Sun+Mars': { name: null, tier: 'open', text: 'Sun with Mars is competitive fuel. You improve by measuring yourself against others, and you take risks that pay. Temper is the tax.' },
  'Sun+Venus': { name: null, tier: 'open', text: 'Sun with Venus: your life runs on giving, especially to your partner. You are proud of them publicly, and you treat a slight against them as a slight against you.' },
  'Sun+Saturn': { name: null, tier: 'guarded', text: 'Sun with Saturn: recognition arrives later than earned. Promotions and acknowledgement are delayed rather than denied, and authority has to be won rather than granted.' },
  'Sun+Rahu': { name: 'Grahan', tier: 'guarded', text: 'Sun with Rahu — respect is eclipsed. You often feel you are not getting the standing you have earned, at work and at home, regardless of how well things are actually going.' },
  'Sun+Ketu': { name: null, tier: 'guarded', text: 'Sun with Ketu keeps your capability internal. The leadership and the clarity are there; the world is slow to notice them. You let things go at moments when you should speak.' },
  'Mars+Rahu': { name: null, tier: 'guarded', text: 'Mars with Rahu is accelerated force — speed, machines, and a temper that arrives fast. Drive carefully and let the anger out somewhere safe before it reaches people.' },
  'Mars+Ketu': { name: null, tier: 'guarded', text: 'Mars with Ketu swallows anger. You smile and say nothing, which is harder to carry than saying it. People are surprised by what you eventually do.' },
  'Mercury+Rahu': { name: null, tier: 'open', text: 'Mercury with Rahu: a fast mind that does not always point where it should. You can clear in one night what others prepare for all year.' },
  'Mercury+Ketu': { name: null, tier: 'open', text: 'Mercury with Ketu turns intelligence inward — you want to know how a thing actually works, and why people do what they do. Rarely satisfied with your own understanding.' },
  'Jupiter+Venus': { name: 'Two teachers', tier: 'open', text: 'Jupiter with Venus puts two teachers in one house, and it makes your word binding. Promises you make have weight — keep them or feel the cost.' },
  'Jupiter+Saturn': { name: null, tier: 'open', text: 'Jupiter with Saturn joins book knowledge to earned experience. Older people will advise you, and the more you take their counsel, the faster you move.' },
  'Saturn+Rahu': { name: 'Shrapit', tier: 'guarded', text: 'Saturn with Rahu: relentless work with little choice about it. You are hard to defeat because you combine effort with a sharp mind — but watch the mid-thirties, when the pressure peaks.' },
  'Saturn+Ketu': { name: null, tier: 'open', text: 'Saturn with Ketu: your work tends to choose you rather than the other way round. Things arrive by coincidence, a friend, a chance suggestion — and they hold.' },
};

const pairKey = (a, b) => [a, b].sort().join('+');

// Lookups sort the pair, so the table must be keyed the same way. Several entries were
// written in reading order (Moon+Jupiter, Sun+Mercury…) and were never matched; normalise
// once here so new entries can be written in either order.
Object.keys(CONJUNCTIONS).forEach((key) => {
  const sorted = pairKey(...key.split('+'));
  if (sorted !== key) { CONJUNCTIONS[sorted] = CONJUNCTIONS[key]; delete CONJUNCTIONS[key]; }
});

// ---------------------------------------------------------------- composition
function placementLine(p, strength) {
  const info = PLANETS[p.name];
  const house = HOUSES[p.house - 1];
  const outcome = OUTCOME[`${info.nature}|${house.group}`];
  const dignityNote = strength.dignity.label === 'exalted'
    ? ' It is exalted here — its strongest condition.'
    : strength.dignity.label === 'debilitated'
      ? ' It is debilitated here, so its results come unevenly and need conscious effort.'
      : strength.dignity.label === 'own sign'
        ? ' It rules this sign, so it acts freely and on its own terms.' : '';
  const combustNote = strength.combustion.combust
    ? ` It is combust — burnt by the Sun at ${strength.combustion.gap.toFixed(1)}° — which mutes it.` : '';
  const retroNote = p.retrograde && !['Rahu', 'Ketu'].includes(p.name)
    ? ' Retrograde, so it works inwardly and on its own schedule.' : '';

  return {
    planet: p.name,
    house: p.house,
    tier: 'open',
    headline: `${p.name} in house ${p.house} — ${house.name}`,
    text: `${p.name} brings ${info.quality} to ${house.area}.${dignityNote}${combustNote}${retroNote} ${outcome}`,
  };
}

function houseReport(chart, house, strengths) {
  const conn = connectedToHouse(chart, house, SIGN_LORDS);
  const dict = BHAVAS[house - 1];
  const lordStrength = strengths[conn.lord];
  const lordPlanet = chart.planets.find((p) => p.name === conn.lord);

  return {
    house,
    // ---- reference data, identical for every chart
    sanskrit: dict.sanskrit,
    name: dict.name,
    area: dict.summary,
    significations: dict.significations,
    karaka: dict.karaka,
    bodyPart: dict.bodyPart,
    relation: dict.relation,
    asks: dict.asks,
    note: dict.note,
    tags: tags(house),
    // ---- this chart
    sign: VEDIC_SIGNS[conn.signIndex],
    occupants: conn.occupants,
    lord: conn.lord,
    lordHouse: conn.lordHouse,
    lordStrength: lordStrength ? lordStrength.band : null,
    lordScore: lordStrength ? lordStrength.score : null,
    aspectedBy: conn.aspectedBy.map((a) => ({ ...a, ...aspectEffect(a.planet, house, a.count) })),
    // The bhava-lord chain: lord of X sitting in Y ties the two areas together.
    chain: lordPlanet
      ? `The lord of your ${ordinal(house)} house is ${conn.lord}, sitting in house ${conn.lordHouse} — so ${dict.name.toLowerCase()} is tied to ${BHAVAS[conn.lordHouse - 1].summary}.`
      : null,
    // A house with nothing in it and nothing aspecting it is genuinely quiet.
    activity: conn.occupants.length + conn.aspectedBy.length,
  };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Named patterns the chart matches. Detection only — no fear framing. */
function detectYogas(chart, strengths) {
  const found = [];
  const by = Object.fromEntries(chart.planets.map((p) => [p.name, p]));
  const kendraFrom = (from, planet) => [0, 3, 6, 9].includes((by[planet].signIndex - by[from].signIndex + 12) % 12);

  if (kendraFrom('Moon', 'Jupiter')) {
    found.push({ id: 'gajakesari', name: 'Gajakesari', tier: 'open',
      text: 'Jupiter sits in a kendra from your Moon. People tend to trust your judgement, and help arrives through respected elders.' });
  }
  if (by.Jupiter.house === by.Rahu.house || mutualAspect(chart, 'Jupiter', 'Rahu')) {
    found.push({ id: 'guru-chandal', name: 'Guru Chandal', tier: 'guarded',
      text: 'Jupiter and Rahu are linked. Teachers arrive late, distance from your birthplace unlocks things, and you teach better than you were taught. It activates during Jupiter or Rahu periods.' });
  }
  const strongestPlanet = Object.values(strengths).sort((a, b) => b.score - a.score)[0];
  found.push({ id: 'strongest', name: `${strongestPlanet.planet} leads your chart`, tier: 'open',
    text: `${strongestPlanet.planet} scores highest for strength in your chart (${strongestPlanet.score}/10), which means its themes — ${PLANETS[strongestPlanet.planet].karaka} — carry further than the rest.` });
  return found;
}

/** The whole interpretation. `visibleTiers` controls what is returned. */
function interpret(chart, dasha, { visibleTiers = ['open', 'guarded'] } = {}) {
  const strengths = evaluateAll(chart);
  const conj = conjunctions(chart);
  const allow = (item) => visibleTiers.includes(item.tier || 'open');

  const conjunctionReadings = conj.flatMap((group) =>
    group.pairs.map(([a, b]) => {
      const entry = CONJUNCTIONS[pairKey(a, b)];
      return entry && { ...entry, pair: [a, b], house: group.house, sign: group.sign, tier: entry.tier };
    }).filter(Boolean)).filter(allow);

  const placements = chart.planets.map((p) => ({
    ...placementLine(p, strengths[p.name]),
    strength: strengths[p.name],
    aspects: aspectedHouses(p.name, p.house).map((a) => ({ ...a, area: HOUSES[a.house - 1].name })),
    nakshatra: p.nakshatra,
    sign: p.sign,
    degree: p.degree,
  }));

  const houses = HOUSES.map((h) => houseReport(chart, h.n, strengths));
  const asc = chart.ascendant;

  return {
    ascendant: {
      sign: asc.sign, degree: asc.degree, lord: asc.lord,
      lordHouse: chart.planets.find((p) => p.name === asc.lord)?.house,
      text: LAGNA[asc.sign],
      lordText: `${asc.sign} is ruled by ${asc.lord}, and that ruler sits in house ${chart.planets.find((p) => p.name === asc.lord)?.house} — so ${HOUSES[(chart.planets.find((p) => p.name === asc.lord)?.house || 1) - 1].area} is where your story keeps returning.`,
    },
    placements,
    houses,
    conjunctions: conjunctionReadings,
    yogas: detectYogas(chart, strengths).filter(allow),
    strengths,
    dasha,
  };
}

module.exports = { interpret, HOUSES, PLANETS, CONJUNCTIONS, OUTCOME, placementLine, pairKey, ordinal };
