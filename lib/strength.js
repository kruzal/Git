/*
 * PLANETARY STRENGTH
 *
 * Six independent inputs, each from a different source in the corpus, combined
 * into one 0–10 score. See docs/corpus.md for provenance.
 *
 *   dignity     sign the planet occupies (exalted → debilitated)
 *   natural     Kaal Purusha: the house whose natural sign it would be exalted in
 *   avastha     degree within the sign (infant → dead)
 *   combustion  proximity to the Sun
 *   motion      retrograde
 *   dispositor  condition of the lord of the sign it sits in
 */

const { SIGN_LORDS } = require('./astro');

const EXALTED = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBILITATED = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };

// Naisargika friendship — whose house a planet is comfortable visiting.
const FRIENDS = {
  Sun: ['Moon', 'Mars', 'Jupiter'], Moon: ['Sun', 'Mercury'],
  Mars: ['Sun', 'Moon', 'Jupiter'], Mercury: ['Sun', 'Venus'],
  Jupiter: ['Sun', 'Moon', 'Mars'], Venus: ['Mercury', 'Saturn'],
  Saturn: ['Mercury', 'Venus'], Rahu: ['Venus', 'Saturn', 'Mercury'], Ketu: ['Mars', 'Venus', 'Saturn'],
};
const ENEMIES = {
  Sun: ['Venus', 'Saturn'], Moon: [], Mars: ['Mercury'], Mercury: ['Moon'],
  Jupiter: ['Mercury', 'Venus'], Venus: ['Sun', 'Moon'], Saturn: ['Sun', 'Moon', 'Mars'],
  Rahu: ['Sun', 'Moon', 'Mars'], Ketu: ['Sun', 'Moon'],
};

// Degrees from the Sun within which a planet is burnt (asta).
const COMBUSTION_ORB = { Moon: 12, Mars: 17, Mercury: 14, Jupiter: 11, Venus: 10, Saturn: 15 };

// Baladi avastha by degree within the sign. Odd signs run infant→dead;
// even signs run the sequence in reverse, which is why the index flips below.
const AVASTHA = [
  { name: 'Infant', factor: 0.25 }, { name: 'Adolescent', factor: 0.5 },
  { name: 'Youth', factor: 1.0 }, { name: 'Old', factor: 0.5 }, { name: 'Dead', factor: 0.25 },
];

function dignity(planet, signIndex) {
  if (EXALTED[planet] === signIndex) return { label: 'exalted', score: 10 };
  if (DEBILITATED[planet] === signIndex) return { label: 'debilitated', score: 2 };
  const lord = SIGN_LORDS[signIndex];
  if (lord === planet) return { label: 'own sign', score: 9 };
  if ((FRIENDS[planet] || []).includes(lord)) return { label: "a friend's sign", score: 7 };
  if ((ENEMIES[planet] || []).includes(lord)) return { label: "an enemy's sign", score: 3 };
  return { label: 'a neutral sign', score: 5 };
}

// Kaal Purusha: house 1 carries Aries' nature, house 2 Taurus', and so on.
function naturalDignity(planet, house) {
  if (EXALTED[planet] === house - 1) return { label: 'naturally exalted by house', score: 9 };
  if (DEBILITATED[planet] === house - 1) return { label: 'naturally debilitated by house', score: 3 };
  return { label: null, score: 5 };
}

function avastha(degree, signIndex) {
  const step = Math.min(4, Math.floor(degree / 6));
  // Even signs (index 1, 3, 5…) reverse the sequence.
  const index = signIndex % 2 === 1 ? 4 - step : step;
  return { ...AVASTHA[index], score: AVASTHA[index].factor * 10 };
}

function combustion(planet, longitude, sunLongitude) {
  const orb = COMBUSTION_ORB[planet];
  if (!orb) return { combust: false, score: 5 };
  let gap = Math.abs(longitude - sunLongitude);
  if (gap > 180) gap = 360 - gap;
  return gap <= orb ? { combust: true, gap, score: 2 } : { combust: false, gap, score: 5 };
}

/** Full strength report for one planet. `chart` is a Vedic chart from astro.birthChart. */
function evaluate(planet, chart) {
  const p = chart.planets.find((x) => x.name === planet.name || x.name === planet);
  const sun = chart.planets.find((x) => x.name === 'Sun');
  const byName = Object.fromEntries(chart.planets.map((x) => [x.name, x]));

  const dig = dignity(p.name, p.signIndex);
  const nat = naturalDignity(p.name, p.house);
  const ava = avastha(p.degree, p.signIndex);
  const comb = p.name === 'Sun' ? { combust: false, score: 5 } : combustion(p.name, p.longitude, sun.longitude);
  const motion = { retrograde: p.retrograde, score: p.retrograde && !['Rahu', 'Ketu'].includes(p.name) ? 6 : 5 };

  // Dispositor: lord of the sign this planet occupies. Judged by its own
  // dignity and by whether it sits in a difficult house (3, 6, 8, 12).
  const dispositorName = SIGN_LORDS[p.signIndex];
  const disp = byName[dispositorName];
  let dispositor = { name: dispositorName, score: 5, note: null, self: dispositorName === p.name };
  if (dispositor.self) {
    dispositor = { ...dispositor, score: 8, note: 'it rules its own sign, so it answers to nobody' };
  } else if (disp) {
    const dd = dignity(disp.name, disp.signIndex);
    const inDifficultHouse = [3, 6, 8, 12].includes(disp.house);
    dispositor.score = dd.label === 'exalted' ? 9 : dd.label === 'debilitated' ? 2 : inDifficultHouse ? 3 : 6;
    dispositor.note = dd.label === 'exalted' ? `${disp.name} is exalted, which lifts it`
      : dd.label === 'debilitated' ? `${disp.name} is debilitated, which drags on it`
      : inDifficultHouse ? `${disp.name} sits in house ${disp.house}, a difficult placement`
      : `${disp.name} is steady in house ${disp.house}`;
    dispositor.house = disp.house;
  }

  // Dignity and the dispositor carry the most weight; the rest adjust.
  const score = (dig.score * 3 + nat.score + ava.score * 1.5 + comb.score + motion.score + dispositor.score * 2)
    / (3 + 1 + 1.5 + 1 + 1 + 2);

  return {
    planet: p.name,
    score: Math.round(score * 10) / 10,
    band: score >= 7 ? 'strong' : score >= 5 ? 'working' : score >= 3.5 ? 'strained' : 'weak',
    dignity: dig, natural: nat, avastha: ava, combustion: comb, motion, dispositor,
  };
}

const evaluateAll = (chart) => Object.fromEntries(chart.planets.map((p) => [p.name, evaluate(p, chart)]));

module.exports = { evaluate, evaluateAll, dignity, EXALTED, DEBILITATED, FRIENDS, ENEMIES };
