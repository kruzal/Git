/*
 * WESTERN (tropical) layer.
 *
 * Same ephemeris, no ayanamsa. Different questions: elements and modalities
 * instead of dignity, degree-based aspects instead of whole-sign drishti.
 */

const { WESTERN_SIGNS } = require('./astro');

const ELEMENT = ['Fire', 'Earth', 'Air', 'Water'];
const MODALITY = ['Cardinal', 'Fixed', 'Mutable'];

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

// Major (Ptolemaic) aspects, with the orb each is allowed.
const ASPECTS = [
  { name: 'conjunction', angle: 0, orb: 8, tone: 'fused' },
  { name: 'sextile', angle: 60, orb: 6, tone: 'easy' },
  { name: 'square', angle: 90, orb: 8, tone: 'tense' },
  { name: 'trine', angle: 120, orb: 8, tone: 'flowing' },
  { name: 'opposition', angle: 180, orb: 8, tone: 'polarised' },
];

function aspectBetween(lonA, lonB) {
  let gap = Math.abs(lonA - lonB);
  if (gap > 180) gap = 360 - gap;
  for (const a of ASPECTS) {
    const off = Math.abs(gap - a.angle);
    if (off <= a.orb) return { ...a, exactness: Math.round((1 - off / a.orb) * 100), separation: gap };
  }
  return null;
}

/** `chart` must be a tropical chart from astro.birthChart(..., 'western'). */
function westernProfile(chart) {
  const counts = { element: {}, modality: {} };
  const placements = chart.planets
    .filter((p) => !['Rahu', 'Ketu'].includes(p.name))
    .map((p) => {
      const element = ELEMENT[p.signIndex % 4];
      const modality = MODALITY[p.signIndex % 3];
      counts.element[element] = (counts.element[element] || 0) + 1;
      counts.modality[modality] = (counts.modality[modality] || 0) + 1;
      return { planet: p.name, sign: p.sign, degree: p.degree, house: p.house, element, modality,
        retrograde: p.retrograde, trait: SIGN_TRAIT[p.sign] };
    });

  const bodies = chart.planets.filter((p) => !['Rahu', 'Ketu'].includes(p.name));
  const aspects = bodies.flatMap((a, i) => bodies.slice(i + 1).map((b) => {
    const asp = aspectBetween(a.longitude, b.longitude);
    return asp && { pair: [a.name, b.name], ...asp };
  }).filter(Boolean)).sort((x, y) => y.exactness - x.exactness);

  const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
  const [domElement, elCount] = top(counts.element);
  const [domModality, modCount] = top(counts.modality);

  return {
    sun: placements.find((p) => p.planet === 'Sun'),
    moon: placements.find((p) => p.planet === 'Moon'),
    rising: { sign: chart.ascendant.sign, degree: chart.ascendant.degree, trait: SIGN_TRAIT[chart.ascendant.sign] },
    placements,
    aspects,
    balance: {
      element: counts.element, modality: counts.modality,
      dominant: `${domElement} ${domModality}`,
      text: `Your chart leans ${domElement} (${elCount} of 7) and ${domModality} (${modCount} of 7) — ${ELEMENT_TRAIT[domElement]}, and ${MODALITY_TRAIT[domModality]}.`,
      missing: ELEMENT.filter((el) => !counts.element[el]),
    },
    // The big three, which is how most people meet Western astrology.
    bigThree: {
      sun: placements.find((p) => p.planet === 'Sun').sign,
      moon: placements.find((p) => p.planet === 'Moon').sign,
      rising: chart.ascendant.sign,
    },
  };
}

module.exports = { westernProfile, aspectBetween, SIGN_TRAIT, ELEMENT_TRAIT, WESTERN_SIGNS };
