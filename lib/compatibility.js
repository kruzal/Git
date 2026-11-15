/*
 * COMPATIBILITY — Ashtakoota (guna milan) between two Vedic charts, out of 36, and Mangal dosha for both.
 *
 * All eight kootas read the two Moons: their signs, degrees and nakshatras. Tradition reads the match as
 * groom and bride, and four kootas (Varna, Vashya, Tara, Gana) are not symmetric, so the caller says who
 * is who. Scoring tables differ a little between traditions; these are the ones most calculators use.
 */
const { VEDIC_SIGNS, SIGN_LORDS } = require('./astro');
const { FRIENDS, ENEMIES } = require('./strength');

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

const MANGLIK_HOUSES = [1, 4, 7, 8, 12];
const MARS_STRONG = new Set([0, 7, 9]); // Mesha and Vrishchika (own), Makara (exalted)

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

function manglik(chart) {
  const mars = chart.planets.find((p) => p.name === 'Mars');
  const moon = moonOf(chart);
  const fromLagna = mars.house, fromMoon = count(moon.signIndex, mars.signIndex, 12);
  return {
    fromLagna, fromMoon,
    lagna: MANGLIK_HOUSES.includes(fromLagna),
    moon: MANGLIK_HOUSES.includes(fromMoon),
    softened: MARS_STRONG.has(mars.signIndex), // Mars in its own or exalted sign is traditionally held to cancel the dosha
    sign: mars.sign,
  };
}

const verdictFor = (total) => (total >= 33 ? 'Excellent match' : total >= 25 ? 'Very good match' : total >= 18 ? 'Acceptable match' : 'Not recommended by tradition');

// ---------- the match ----------
function match(groomChart, brideChart) {
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
  const groomMars = manglik(groomChart), brideMars = manglik(brideChart);
  const isM = (m) => m.lagna && !m.softened;
  const marsMatch = isM(groomMars) === isM(brideMars)
    ? (isM(groomMars) ? 'Both are Manglik, which tradition holds balances out.' : 'Neither is Manglik from the ascendant, so there is no Mangal dosha to match.')
    : `Only the ${isM(groomMars) ? 'groom' : 'bride'} is Manglik. Tradition asks for care here, or for the other chart to carry Mars in a Manglik house too.`;
  return {
    total, max: 36, verdict: verdictFor(total), kootas,
    doshas: kootas.filter((k) => k.note && (k.score === 0 || k.id === 'gana' && k.score <= 1)).map((k) => ({ name: k.name, note: k.note, cancelled: !!k.cancelled })),
    manglik: { groom: groomMars, bride: brideMars, summary: marsMatch },
    moons: {
      groom: { sign: gm.sign, nakshatra: gm.nakshatra.name, pada: gm.nakshatra.pada },
      bride: { sign: bm.sign, nakshatra: bm.nakshatra.name, pada: bm.nakshatra.pada },
    },
  };
}

module.exports = { match, manglik, YONI, GANA_OF, nadiOf, VEDIC_SIGNS };
