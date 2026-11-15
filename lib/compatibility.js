/*
 * COMPATIBILITY — kundli matching between two Vedic charts, step by step:
 *   1. Ashtakoota (guna milan) out of 36, with Bhakoot and Nadi cancellations (parihara)
 *   2. Mangal dosha for both, counted from the ascendant, the Moon and Venus
 *   3. The marriage in each chart: the 7th house and its lord, Venus, Jupiter, the ascendant lords
 *   4. Navamsa (D9), the marriage chart
 *   5. Dasha timing for both
 *   6. Remedies for what was found, and a red-flags summary
 *
 * The eight kootas read the two Moons: their signs, degrees and nakshatras. Tradition reads the match as
 * groom and bride, and four kootas (Varna, Vashya, Tara, Gana) are not symmetric, so the caller says who
 * is who. Scoring tables differ a little between traditions; these are the ones most calculators use.
 */
const { VEDIC_SIGNS, SIGN_LORDS } = require('./astro');
const { FRIENDS, ENEMIES, evaluate } = require('./strength');
const { divisional } = require('./divisional');
const { REMEDIES } = require('./lenses');

// ---------- the tables ----------
const VARNAS = ['Kshatriya', 'Vaishya', 'Shudra', 'Brahmin']; // Moon sign index % 4: Mesha is Kshatriya, Vrishabha Vaishya...
const VARNA_RANK = { Brahmin: 4, Kshatriya: 3, Vaishya: 2, Shudra: 1 };

const VASHYA = ['Chatushpada (four-footed)', 'Manava (human)', 'Jalachara (water)', 'Vanachara (wild)', 'Keeta (insect)'];
// Dhanu is human for its first half and four-footed for its second; Makara four-footed, then water.
const VASHYA_OF_SIGN = [0, 0, 1, 2, 3, 1, 1, 4, [1, 0], [0, 2], 1, 2];
const VASHYA_SCORE = [
  [2, 1, 1, 0.5, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0.5, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
];

const TARAS = ['Janma', 'Sampat', 'Vipat', 'Kshema', 'Pratyak', 'Sadhana', 'Naidhana', 'Mitra', 'Param Mitra'];
const BAD_TARAS = new Set([3, 5, 7]); // Vipat, Pratyak, Naidhana

const ANIMALS = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Deer', 'Monkey', 'Mongoose', 'Lion'];
// The yoni of each nakshatra, Ashwini first: [animal, male or female].
const YONI = [['Horse', 'm'], ['Elephant', 'm'], ['Sheep', 'f'], ['Serpent', 'm'], ['Serpent', 'f'], ['Dog', 'f'], ['Cat', 'f'], ['Sheep', 'm'], ['Cat', 'm'],
  ['Rat', 'm'], ['Rat', 'f'], ['Cow', 'm'], ['Buffalo', 'f'], ['Tiger', 'f'], ['Buffalo', 'm'], ['Tiger', 'm'], ['Deer', 'f'], ['Deer', 'm'],
  ['Dog', 'm'], ['Monkey', 'm'], ['Mongoose', 'm'], ['Monkey', 'f'], ['Lion', 'f'], ['Horse', 'f'], ['Lion', 'm'], ['Cow', 'f'], ['Elephant', 'f']];
// Same animal 4, sworn enemies 0 (Horse-Buffalo, Elephant-Lion, Sheep-Monkey, Serpent-Mongoose, Dog-Deer, Cat-Rat, Cow-Tiger).
const YONI_SCORE = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

const GANAS = ['Deva', 'Manushya', 'Rakshasa'];
const GANA_OF = [0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0];
const GANA_SCORE = [ // [groom][bride]
  [6, 6, 1],
  [5, 6, 0],
  [1, 0, 6],
];

const NADIS = ['Adi (Vata)', 'Madhya (Pitta)', 'Antya (Kapha)'];
const nadiOf = (nak) => [0, 1, 2, 2, 1, 0][nak % 6];

const MANGLIK_HOUSES = [1, 2, 4, 7, 8, 12];
const MARS_STRONG = new Set([0, 7, 9]); // Mesha and Vrishchika (own), Makara (exalted)
const MALEFICS = new Set(['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu']);
const HARD_DASHAS = new Set(['Saturn', 'Rahu']), SOFT_DASHAS = new Set(['Venus', 'Jupiter']);

// ---------- helpers ----------
const moonOf = (chart) => chart.planets.find((p) => p.name === 'Moon');
const count = (from, to, n) => ((to - from + n) % n) + 1;
const relation = (a, b) => (a === b ? 'same' : (FRIENDS[a] || []).includes(b) ? 'friend' : (ENEMIES[a] || []).includes(b) ? 'enemy' : 'neutral');
const vashyaOf = (moon) => { const g = VASHYA_OF_SIGN[moon.signIndex]; return Array.isArray(g) ? g[moon.degree < 15 ? 0 : 1] : g; };

function maitriScore(r1, r2) {
  const pair = [r1, r2].sort().join('+');
  return {
    'same+same': 5, 'friend+friend': 5, 'friend+same': 5, 'same+friend': 5,
    'friend+neutral': 4, 'neutral+neutral': 3, 'enemy+friend': 1, 'enemy+neutral': 0.5, 'enemy+enemy': 0,
  }[pair] ?? 3;
}

// Two planets' natural friendship, read both ways.
function friendship(a, b) {
  const r1 = relation(a, b), r2 = relation(b, a);
  if (r1 === 'same') return { label: `Both ruled by ${a}`, good: true };
  if (r1 === 'friend' && r2 === 'friend') return { label: `${a} and ${b} are friends`, good: true };
  if (r1 === 'enemy' && r2 === 'enemy') return { label: `${a} and ${b} are enemies`, good: false };
  return { label: `${a} sees ${b} as ${r1}, ${b} sees ${a} as ${r2}`, good: r1 !== 'enemy' && r2 !== 'enemy' };
}

// Mars counted from the ascendant, the Moon and Venus. Each one that puts Mars in a Manglik house adds to the dosha.
function manglik(chart) {
  const at = (name) => chart.planets.find((p) => p.name === name);
  const mars = at('Mars');
  const from = { ascendant: mars.house, Moon: count(at('Moon').signIndex, mars.signIndex, 12), Venus: count(at('Venus').signIndex, mars.signIndex, 12) };
  const hits = Object.keys(from).filter((k) => MANGLIK_HOUSES.includes(from[k]));
  // Tradition cancels the dosha when Mars is in its own or exaltation sign, or when Jupiter
  // sits with Mars or aspects it (Jupiter's aspects fall on the 5th, 7th and 9th signs from it).
  const eased = [];
  if (MARS_STRONG.has(mars.signIndex)) eased.push(`Mars is in ${mars.sign}, its own or exaltation sign`);
  const fromJupiter = count(at('Jupiter').signIndex, mars.signIndex, 12);
  if (fromJupiter === 1) eased.push('Jupiter sits with Mars');
  else if ([5, 7, 9].includes(fromJupiter)) eased.push(`Jupiter aspects Mars (Mars is ${fromJupiter}th from Jupiter)`);
  const cancelled = hits.length > 0 && eased.length > 0;
  return { from, hits, sign: mars.sign, eased, cancelled, manglik: hits.length > 0 && !cancelled,
    level: !hits.length ? 'none' : cancelled ? 'cancelled' : ['', 'mild', 'moderate', 'strong'][hits.length] };
}

// The marriage in one chart: the 7th house, its lord and occupants, Venus and Jupiter.
function marriageSide(chart) {
  const at = (name) => chart.planets.find((p) => p.name === name);
  const strength = (name) => { const e = evaluate(name, chart); return { score: e.score, band: e.band, sign: at(name).sign, house: at(name).house }; };
  const seventh = (chart.ascendant.signIndex + 6) % 12, lord = SIGN_LORDS[seventh];
  const occupants = chart.planets.filter((p) => p.house === 7).map((p) => p.name);
  const malefics = occupants.filter((n) => MALEFICS.has(n));
  return {
    ascendant: chart.ascendant.sign, ascendantLord: chart.ascendant.lord,
    seventh: { sign: VEDIC_SIGNS[seventh], signIndex: seventh, lord, lordAt: strength(lord) },
    occupants, malefics, afflicted: malefics.length >= 2,
    venus: strength('Venus'), jupiter: strength('Jupiter'),
  };
}

// Navamsa (D9), the marriage chart: its ascendant, its 7th lord, and Venus.
function navamsaSide(chart) {
  const d9 = divisional(chart, 'D9'), at = (name) => d9.planets.find((p) => p.name === name);
  const seventh = (d9.lagna.signIndex + 6) % 12, lord = SIGN_LORDS[seventh], venus = at('Venus');
  return {
    lagna: d9.lagna.sign, lagnaLord: SIGN_LORDS[d9.lagna.signIndex],
    seventh: VEDIC_SIGNS[seventh], seventhLord: lord, seventhLordSign: at(lord).sign, seventhLordDignity: at(lord).dignity,
    venusSign: venus.sign, venusDignity: venus.dignity, venusVargottama: venus.vargottama,
  };
}

// The mahadasha running now and the next one. Venus, Jupiter and the 7th lord are the traditional marriage periods.
const isoDay = (d) => d.toISOString().slice(0, 10);
function dashaSide(dasha, chart, now) {
  if (!dasha || !dasha.current) return null;
  const next = dasha.periods.find((p) => p.start > now);
  const seventhLord = SIGN_LORDS[(chart.ascendant.signIndex + 6) % 12];
  return {
    maha: dasha.current.lord, until: isoDay(dasha.current.end), antar: dasha.currentAntar ? dasha.currentAntar.lord : null,
    next: next ? { lord: next.lord, from: isoDay(next.start) } : null,
    marriagePeriod: ['Venus', 'Jupiter', seventhLord].includes(dasha.current.lord),
  };
}

const remedy = (forWhat, planet) => ({ for: forWhat, planet, ...REMEDIES[planet] });

// One person's Mars against the other's Venus: the sign distance between them reads the pull.
const PULL = {
  1: ['strong', 'in the same sign: strong, immediate attraction'],
  7: ['strong', 'opposite each other: the classic magnetic pull'],
  5: ['easy', 'in trine: warm, natural chemistry'], 9: ['easy', 'in trine: warm, natural chemistry'],
  3: ['easy', 'three signs apart: playful and friendly'], 11: ['easy', 'three signs apart: playful and friendly'],
  4: ['tense', 'square: passion with friction'], 10: ['tense', 'square: passion with friction'],
  2: ['awkward', 'next-door signs: slow to spark'], 12: ['awkward', 'next-door signs: slow to spark'],
  6: ['awkward', 'six and eight apart: drawn in but often at odds'], 8: ['awkward', 'six and eight apart: drawn in but often at odds'],
};
function chemistry(marsChart, venusChart) {
  const mars = marsChart.planets.find((p) => p.name === 'Mars'), venus = venusChart.planets.find((p) => p.name === 'Venus');
  const [tone, about] = PULL[count(venus.signIndex, mars.signIndex, 12)];
  return { mars: mars.sign, venus: venus.sign, tone, about };
}

const verdictFor = (total) => (total >= 33 ? 'Excellent match' : total >= 25 ? 'Very good match' : total >= 18 ? 'Acceptable match' : 'Not recommended by tradition');

// ---------- the match ----------
// `dashas` is { groom, bride }: each person's dasha timeline, when the caller has it.
function match(groomChart, brideChart, { dashas = {}, now = new Date() } = {}) {
  const gm = moonOf(groomChart), bm = moonOf(brideChart);
  const gn = gm.nakshatra.index, bn = bm.nakshatra.index;
  const kootas = [];
  const add = (k) => kootas.push(k);

  // 1. Varna: the groom's varna should be equal to or above the bride's.
  const gv = VARNAS[gm.signIndex % 4], bv = VARNAS[bm.signIndex % 4];
  add({ id: 'varna', name: 'Varna', max: 1, score: VARNA_RANK[gv] >= VARNA_RANK[bv] ? 1 : 0, groom: gv, bride: bv,
    about: 'Spiritual and working temperament: how the two egos sit together.' });

  // 2. Vashya: who naturally draws or yields to whom.
  const gw = vashyaOf(gm), bw = vashyaOf(bm);
  add({ id: 'vashya', name: 'Vashya', max: 2, score: VASHYA_SCORE[gw][bw], groom: VASHYA[gw], bride: VASHYA[bw],
    about: 'Mutual attraction and influence: whether each one is drawn to and can steer the other.' });

  // 3. Tara: the birth stars counted both ways; Vipat, Pratyak and Naidhana are the hard ones.
  const toGroom = count(bn, gn, 27), toBride = count(gn, bn, 27);
  const tGood = BAD_TARAS.has(((toGroom - 1) % 9) + 1) ? 0 : 1, bGood = BAD_TARAS.has(((toBride - 1) % 9) + 1) ? 0 : 1;
  add({ id: 'tara', name: 'Tara', max: 3, score: 1.5 * (tGood + bGood),
    groom: `${TARAS[(toGroom - 1) % 9]} from the bride's star`, bride: `${TARAS[(toBride - 1) % 9]} from the groom's star`,
    about: 'Birth-star harmony: health, wellbeing and luck brought into each other\'s lives.' });

  // 4. Yoni: the animal nature of each birth star.
  const gy = YONI[gn], by = YONI[bn];
  const ys = YONI_SCORE[ANIMALS.indexOf(gy[0])][ANIMALS.indexOf(by[0])];
  add({ id: 'yoni', name: 'Yoni', max: 4, score: ys, groom: `${gy[0]} (${gy[1] === 'm' ? 'male' : 'female'})`, bride: `${by[0]} (${by[1] === 'm' ? 'male' : 'female'})`,
    about: 'Physical and intimate compatibility, and comfort in each other\'s company.', note: ys === 0 ? 'These two animals are traditional enemies (Yoni dosha).' : null });

  // 5. Graha Maitri: friendship between the lords of the two Moon signs.
  const gl = SIGN_LORDS[gm.signIndex], bl = SIGN_LORDS[bm.signIndex];
  const r1 = relation(gl, bl), r2 = relation(bl, gl);
  add({ id: 'maitri', name: 'Graha Maitri', max: 5, score: maitriScore(r1, r2), groom: `${gl} (Moon sign lord)`, bride: `${bl} (Moon sign lord)`,
    about: 'Mental friendship: how easily the two minds understand and like each other.',
    note: gl === bl ? 'The same planet rules both Moon signs.' : `${gl} sees ${bl} as ${r1 === 'neutral' ? 'neutral' : `a${r1 === 'enemy' ? 'n' : ''} ${r1}`}; ${bl} sees ${gl} as ${r2 === 'neutral' ? 'neutral' : `a${r2 === 'enemy' ? 'n' : ''} ${r2}`}.` });

  // 6. Gana: divine, human or demonic temperament.
  const gg = GANA_OF[gn], bg = GANA_OF[bn];
  const gs = GANA_SCORE[gg][bg];
  add({ id: 'gana', name: 'Gana', max: 6, score: gs, groom: GANAS[gg], bride: GANAS[bg],
    about: 'Temperament: how the two natures handle conflict, routine and each other\'s moods.', note: gs <= 1 && gg !== bg ? 'A wide gap in temperament (Gana dosha).' : null });

  // 7. Bhakoot: how the Moon signs sit from each other. 2/12, 5/9 and 6/8 are the hard pairs.
  const b1 = count(gm.signIndex, bm.signIndex, 12), b2 = count(bm.signIndex, gm.signIndex, 12);
  const pair = [b1, b2].sort((a, b) => a - b).join('/');
  const bhakootDosha = ['2/12', '5/9', '6/8'].includes(pair);
  const bhakootCancel = bhakootDosha && (gl === bl || (relation(gl, bl) === 'friend' && relation(bl, gl) === 'friend'));
  add({ id: 'bhakoot', name: 'Bhakoot', max: 7, score: bhakootDosha ? 0 : 7, groom: gm.sign, bride: bm.sign,
    about: 'Emotional bond, family welfare and money: the Moons in a ' + pair + ' relationship.',
    note: bhakootDosha ? `A ${pair} placement is Bhakoot dosha.${bhakootCancel ? ' It is traditionally cancelled because the two Moon sign lords are the same or friends to each other.' : ''}` : null, cancelled: bhakootCancel });

  // 8. Nadi: the constitution of each birth star. The same nadi is the heaviest dosha in matching.
  const gd = nadiOf(gn), bd = nadiOf(bn);
  const nadiDosha = gd === bd;
  const nadiCancel = nadiDosha && ((gm.signIndex === bm.signIndex && gn !== bn) || (gn === bn && gm.nakshatra.pada !== bm.nakshatra.pada) || (gn === bn && gm.signIndex !== bm.signIndex));
  add({ id: 'nadi', name: 'Nadi', max: 8, score: nadiDosha ? 0 : 8, groom: NADIS[gd], bride: NADIS[bd],
    about: 'Health and constitution, and traditionally children: the most heavily weighted koota.',
    note: nadiDosha ? `Both are ${NADIS[gd]} nadi: Nadi dosha.${nadiCancel ? ' It is traditionally eased because the stars or padas differ within the same sign, or the same star falls in different signs.' : ''}` : null, cancelled: nadiCancel });

  const total = kootas.reduce((a, k) => a + k.score, 0);

  // ---------- Mangal dosha ----------
  const gMars = manglik(groomChart), bMars = manglik(brideChart);
  const marsSummary = gMars.manglik === bMars.manglik
    ? (gMars.manglik ? 'Both are Manglik, which tradition holds balances the dosha out.' : 'Neither is Manglik, so there is no Mangal dosha to match.')
    : `Only the ${gMars.manglik ? 'groom' : 'bride'} is Manglik (${(gMars.manglik ? gMars : bMars).level}). Tradition asks for care here, or for the other chart to carry Mars in a Manglik house too.`;
  const severeMars = [[gMars, bMars], [bMars, gMars]].some(([a, b]) => ['moderate', 'strong'].includes(a.level) && b.level === 'none');

  // ---------- the marriage in each chart ----------
  const gSide = marriageSide(groomChart), bSide = marriageSide(brideChart);
  const links = [];
  if (gSide.seventh.signIndex === brideChart.ascendant.signIndex) links.push("The groom's 7th house falls on the bride's ascendant, a classic marriage link.");
  if (bSide.seventh.signIndex === groomChart.ascendant.signIndex) links.push("The bride's 7th house falls on the groom's ascendant, a classic marriage link.");
  if (gSide.seventh.signIndex === bm.signIndex) links.push("The groom's 7th house falls on the bride's Moon sign: she fits what he looks for in a partner.");
  if (bSide.seventh.signIndex === gm.signIndex) links.push("The bride's 7th house falls on the groom's Moon sign: he fits what she looks for in a partner.");

  // ---------- Navamsa and dasha ----------
  const gD9 = navamsaSide(groomChart), bD9 = navamsaSide(brideChart);
  const gDasha = dashaSide(dashas.groom, groomChart, now), bDasha = dashaSide(dashas.bride, brideChart, now);
  const dashaClash = !!(gDasha && bDasha) && ((HARD_DASHAS.has(gDasha.maha) && SOFT_DASHAS.has(bDasha.maha)) || (HARD_DASHAS.has(bDasha.maha) && SOFT_DASHAS.has(gDasha.maha)));

  // ---------- remedies for what was found ----------
  const remedies = [];
  // When both are Manglik the doshas balance out, so only a one-sided Mangal dosha needs a remedy.
  if (gMars.manglik && !bMars.manglik) remedies.push(remedy("Mangal dosha in the groom's chart", 'Mars'));
  if (bMars.manglik && !gMars.manglik) remedies.push(remedy("Mangal dosha in the bride's chart", 'Mars'));
  if (bhakootDosha && !bhakootCancel) [...new Set([gl, bl])].forEach((lord) => {
    const why = `Bhakoot dosha: ${lord} rules ${gl === bl ? 'both Moon signs' : lord === gl ? "the groom's Moon sign" : "the bride's Moon sign"}`;
    const same = remedies.find((x) => x.planet === lord); // one planet, one remedy: list every reason on it
    if (same) same.for += `; ${why}`; else remedies.push(remedy(why, lord));
  });
  if (nadiDosha && !nadiCancel) remedies.push({ for: 'Nadi dosha', traditional: 'Tradition prescribes a Nadi dosha nivaran puja before the wedding and the Mahamrityunjaya mantra, 108 times a day, for both.' });

  // ---------- red flags ----------
  const flag = (name, on, eased, detail) => ({ name, status: on ? (eased ? 'eased' : 'flag') : 'clear', detail });
  const redFlags = [
    flag('Nadi score is zero', nadiDosha, nadiCancel, nadiDosha ? 'Same nadi: the health and children concern.' : 'Different nadis.'),
    flag('Bhakoot score is zero', bhakootDosha, bhakootCancel, bhakootDosha ? `The Moons sit ${pair}: the family and money concern.` : `The Moons sit ${pair}.`),
    flag('Severe Mangal dosha mismatch', severeMars, false, severeMars ? 'One chart is moderately or strongly Manglik and the other not at all.' : marsSummary),
    flag('Both 7th houses heavily afflicted', gSide.afflicted && bSide.afflicted, false,
      `Malefics in the 7th: groom ${gSide.malefics.join(', ') || 'none'}; bride ${bSide.malefics.join(', ') || 'none'}.`),
    gDasha && bDasha
      ? flag('Clashing dasha periods', dashaClash, false, `Groom in ${gDasha.maha} mahadasha, bride in ${bDasha.maha}.`)
      : { name: 'Clashing dasha periods', status: 'unknown', detail: 'Dasha periods were not given.' },
  ];

  return {
    total, max: 36, verdict: verdictFor(total), kootas,
    doshas: kootas.filter((k) => k.note && (k.score === 0 || k.id === 'gana' && k.score <= 1)).map((k) => ({ name: k.name, note: k.note, cancelled: !!k.cancelled })),
    manglik: { groom: gMars, bride: bMars, summary: marsSummary },
    marriage: { groom: gSide, bride: bSide, ascendantLords: friendship(gSide.ascendantLord, bSide.ascendantLord), links,
      chemistry: { groomMars: chemistry(groomChart, brideChart), brideMars: chemistry(brideChart, groomChart) } },
    navamsa: { groom: gD9, bride: bD9, lagnaLords: friendship(gD9.lagnaLord, bD9.lagnaLord) },
    dasha: { groom: gDasha, bride: bDasha, clash: dashaClash },
    remedies, redFlags,
    moons: {
      groom: { sign: gm.sign, nakshatra: gm.nakshatra.name, pada: gm.nakshatra.pada },
      bride: { sign: bm.sign, nakshatra: bm.nakshatra.name, pada: bm.nakshatra.pada },
    },
  };
}

module.exports = { match, manglik, YONI, GANA_OF, nadiOf, VEDIC_SIGNS };
