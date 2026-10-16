/*
 * SIGNIFICATORS — which planets stand for which houses, by source.
 *
 * The classical Parashari answer (sthira karakas) already lives in lib/bhava.js as each
 * house's `karaka`. This file adds other sources' answers beside it, without replacing
 * it, and audits each claim against what the tradition can attest. Per docs/model.md:
 * schools are recorded, not resolved, and disagreements are flagged, not merged.
 *
 * Every entry carries a BASIS, worked out here rather than taken from the source:
 *
 *   karaka         agrees with the classical sthira karaka of that house
 *   natural-ruler  the planet rules the house's natural sign (Aries = 1st … Pisces = 12th),
 *                  traditional or modern rulership
 *   dig-bala       the planet gains directional strength in that house
 *                  (Jupiter and Mercury 1st, Moon and Venus 4th, Saturn 7th, Sun and Mars 10th)
 *   unattested     none of the above — the claim is kept, marked, and given low confidence
 *
 * Source S-AS-01: "Planets as Significators for Houses", astroskills.org, 16 March 2025.
 * A blended Western/Vedic blog source. Paraphrased into this app's own voice; nothing
 * is copied. Its claims read as "a planet in this house brings…", so they are stored as
 * placement tendencies that apply when the planet actually occupies the house.
 */

const { BHAVAS } = require('./bhava');

const SOURCES = {
  'S-AS-01': {
    id: 'S-AS-01',
    title: 'Planets as Significators for Houses',
    publisher: 'astroskills.org',
    date: '2025-03-16',
    school: 'modern',
    note: 'Blog source mixing Western and Vedic ideas. Includes the outer planets, which the Vedic system does not use.',
  },
};

// Natural sign rulers, by house (the house's Kaal Purusha / natural-zodiac sign).
const NATURAL_RULERS = {
  1: ['Mars'], 2: ['Venus'], 3: ['Mercury'], 4: ['Moon'], 5: ['Sun'], 6: ['Mercury'],
  7: ['Venus'], 8: ['Mars', 'Pluto'], 9: ['Jupiter'], 10: ['Saturn'], 11: ['Saturn', 'Uranus'], 12: ['Jupiter', 'Neptune'],
};
const DIG_BALA = { Jupiter: 1, Mercury: 1, Moon: 4, Venus: 4, Saturn: 7, Sun: 10, Mars: 10 };
const OUTER = new Set(['Uranus', 'Neptune', 'Pluto']);

// [planet, house, theme, what it brings when the planet sits there]
const S_AS_01 = [
  ['Sun', 1, 'identity', 'Confidence and a clear sense of who you are; you are noticed for your individuality.'],
  ['Sun', 5, 'creativity', 'Creative force and warmth — romance, play, children and making things carry real energy.'],
  ['Moon', 4, 'home', 'A nurturing instinct and a close bond with home and family.'],
  ['Moon', 8, 'emotional depth', 'Feelings run deep and bond intensely; emotional life changes through close, shared ties.'],
  ['Mercury', 3, 'communication', 'Quick communication, curiosity and learning; lively exchange with siblings and neighbours.'],
  ['Mercury', 6, 'routine', 'An analytical approach to health, work and daily routine — you fix things by understanding them.'],
  ['Venus', 2, 'values', 'A love of beauty and quality, and an easier relationship with money and what you value.'],
  ['Venus', 7, 'partnership', 'Harmony and attraction in partnership; relationships tend to be graceful.'],
  ['Mars', 1, 'drive', 'Drive, competitiveness and physical confidence.'],
  ['Mars', 10, 'ambition', 'Ambition and a strong push to achieve in career.'],
  ['Jupiter', 9, 'wisdom', 'Love of learning, travel and philosophy; growth through teachers and belief.'],
  ['Jupiter', 11, 'networks', 'Luck and abundance through friends, groups and social connection.'],
  ['Saturn', 10, 'discipline', 'A serious, patient approach to career and long-term goals.'],
  ['Saturn', 4, 'foundations', 'Some weight in family dynamics or home life, which over time builds lasting stability.'],
  ['Uranus', 11, 'freedom', 'A need for freedom in groups, and unconventional friendships.'],
  ['Uranus', 7, 'unusual bonds', 'Unexpected or unusual partnerships; space and independence matter in relationships.'],
  ['Neptune', 12, 'spirit', 'Spiritual growth, compassion and strong intuition.'],
  ['Neptune', 4, 'inner home', 'A deep, almost mystical feeling about home and family.'],
  ['Pluto', 8, 'transformation', 'Profound transformation through relationships and shared resources.'],
  ['Pluto', 1, 'intensity', 'Intense personal reinvention and a powerful presence.'],
];

function classicalKaraka(house) {
  return BHAVAS[house - 1].karaka.split(',').map((s) => s.trim());
}

/** Work out why (or whether) the tradition backs a planet-for-house claim. */
function basisOf(planet, house) {
  if (classicalKaraka(house).includes(planet)) return 'karaka';
  if (NATURAL_RULERS[house].includes(planet)) return 'natural-ruler';
  if (DIG_BALA[planet] === house) return 'dig-bala';
  return 'unattested';
}

const CONFIDENCE = { karaka: 0.8, 'natural-ruler': 0.6, 'dig-bala': 0.6, unattested: 0.3 };

const ENTRIES = S_AS_01.map(([planet, house, theme, text]) => {
  const basis = basisOf(planet, house);
  return {
    id: `sig.${planet}.h${house}`,
    planet, house, theme, text, basis,
    source: 'S-AS-01',
    school: SOURCES['S-AS-01'].school,
    system: OUTER.has(planet) ? 'western' : 'both',
    confidence: CONFIDENCE[basis],
    tier: basis === 'unattested' ? 'guarded' : 'open',
  };
});

/** Per house: the classical karakas, every sourced significator, and where they disagree. */
function forHouse(house) {
  const classical = classicalKaraka(house);
  const sourced = ENTRIES.filter((e) => e.house === house);
  return {
    house,
    classical,
    sourced,
    // Classical karakas the source leaves out, and source claims that are not karakas.
    disagreement: {
      missingClassical: classical.filter((k) => !sourced.some((s) => s.planet === k)),
      notClassical: sourced.filter((s) => s.basis !== 'karaka').map((s) => s.planet),
    },
  };
}

/**
 * Applied to a chart: which significators actually sit in the house they signify.
 * `chart` may be Vedic or Western; outer planets only match if the chart has them.
 */
function active(chart) {
  return ENTRIES.flatMap((e) => {
    const p = chart.planets.find((x) => x.name === e.planet);
    return p && p.house === e.house ? [{ ...e, sign: p.sign }] : [];
  });
}

/** Self-check against the deterministic tables, for the ingest audit in docs/model.md §7. */
function audit() {
  return ENTRIES.map((e) => ({ id: e.id, basis: e.basis, confidence: e.confidence }))
    .reduce((acc, e) => { (acc[e.basis] ||= []).push(e.id); return acc; }, {});
}

module.exports = { SOURCES, ENTRIES, forHouse, active, audit, basisOf, NATURAL_RULERS, DIG_BALA };
