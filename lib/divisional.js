/*
 * DIVISIONAL CHARTS (vargas)
 *
 * The birth chart (D1) answers "what is promised". A divisional chart cuts every
 * sign into equal parts and re-reads each planet by the part it falls in, which is
 * how the tradition checks whether a promise holds up under a closer look.
 *
 *   D9  Navamsa    9 parts of 3 deg 20 min. The partnership chart, and the standard
 *                  second opinion on any planet's real strength.
 *   D10 Dashamsa   10 parts of 3 deg. The career chart.
 *
 * Both are pure functions of a sidereal longitude, so they cost nothing to compute
 * and add no new inputs. A planet in the same sign in D1 and D9 is "vargottama",
 * classically read as doubled in strength.
 */

const { VEDIC_SIGNS } = require('./astro');
const { dignity } = require('./strength');

const norm = (d) => ((d % 360) + 360) % 360;

// Nine parts counted continuously from Aries around the zodiac. This single rule gives the
// usual "movable from itself, fixed from the 9th, dual from the 5th" pattern.
const navamsaSign = (lon) => Math.floor((norm(lon) * 9) / 30) % 12;

// Ten parts of 3 degrees. Odd signs count from themselves, even signs from their 9th.
function dashamsaSign(lon) {
  const l = norm(lon);
  const sign = Math.floor(l / 30);
  const part = Math.floor((l % 30) / 3);
  const start = sign % 2 === 0 ? sign : (sign + 8) % 12;
  return (start + part) % 12;
}

const DIVISIONS = {
  D9: { key: 'D9', name: 'Navamsa', about: 'the partnership chart and the second opinion on every planet', sign: navamsaSign },
  D10: { key: 'D10', name: 'Dashamsa', about: 'the career chart', sign: dashamsaSign },
};

const NODES = new Set(['Rahu', 'Ketu']);

/** One divisional chart for a birth chart. Houses are counted from the divisional lagna. */
function divisional(chart, key) {
  const d = DIVISIONS[key];
  const lagnaIndex = d.sign(chart.ascendant.longitude);
  const planets = chart.planets.map((p) => {
    const signIndex = d.sign(p.longitude);
    return {
      name: p.name, signIndex, sign: VEDIC_SIGNS[signIndex],
      house: ((signIndex - lagnaIndex + 12) % 12) + 1,
      rashiSign: p.sign,
      vargottama: key === 'D9' && signIndex === p.signIndex,
      dignity: NODES.has(p.name) ? null : dignity(p.name, signIndex).label,
    };
  });
  return { key, name: d.name, about: d.about, lagna: { signIndex: lagnaIndex, sign: VEDIC_SIGNS[lagnaIndex] }, planets };
}

const all = (chart) => ({ D9: divisional(chart, 'D9'), D10: divisional(chart, 'D10') });

module.exports = { divisional, all, DIVISIONS, navamsaSign, dashamsaSign };
