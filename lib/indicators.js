/*
 * INDICATOR REGISTRY
 *
 * One chart in, a flat vector of typed, stably-named indicators out.
 *
 * This is the layer that makes the system researchable. Readings are prose
 * and cannot be counted; indicators can. Every indicator has:
 *
 *   id          stable dotted name, identical across every chart ever computed
 *   layer       natal | dasha | varsha | transit | numerology | western | derived
 *   kind        categorical | ordinal | scalar | boolean  (picks the statistics)
 *   subject     what it is about, for grouping
 *   value       the measurement
 *   derivation  how it was computed, so any number can be traced back
 *
 * Nothing here interprets. Interpretation lives in rules, which match on
 * these ids — so a rule's claim and the measurement it rests on stay separate
 * and can be tested against each other.
 */

const { SIGN_LORDS, VEDIC_SIGNS } = require('./astro');
const { aspectedHouses, connectedToHouse, conjunctions } = require('./aspects');
const { evaluateAll } = require('./strength');
const { karakas, arudhaLagna } = require('./lenses');

const GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const DIGNITY_ORDER = ['debilitated', "an enemy's sign", 'a neutral sign', "a friend's sign", 'own sign', 'exalted'];
const AVASTHA_ORDER = ['Dead', 'Old', 'Infant', 'Adolescent', 'Youth'];

const ind = (id, layer, kind, subject, value, derivation) => ({ id, layer, kind, subject, value, derivation });

/**
 * Natal indicators — everything fixed at birth.
 * Roughly 130 rows for a standard chart.
 */
function natalIndicators(chart) {
  const out = [];
  const strengths = evaluateAll(chart);
  const asc = chart.ascendant;

  // ---- lagna and derived points
  out.push(ind('point.lagna.sign', 'natal', 'categorical', 'lagna', asc.sign, 'ascendant sign at birth'));
  out.push(ind('point.lagna.degree', 'natal', 'scalar', 'lagna', round(asc.degree), 'degrees into the sign'));
  out.push(ind('point.lagna.lord', 'natal', 'categorical', 'lagna', asc.lord, 'ruler of the ascendant sign'));
  out.push(ind('point.moon.sign', 'natal', 'categorical', 'moon', chart.moonSign, 'sign of the Moon'));
  out.push(ind('point.moon.nakshatra', 'natal', 'categorical', 'moon', chart.nakshatra.name, 'nakshatra of the Moon'));
  out.push(ind('point.moon.pada', 'natal', 'ordinal', 'moon', chart.nakshatra.pada, 'quarter of the nakshatra'));

  const ar = arudhaLagna(chart);
  if (ar) {
    out.push(ind('point.arudha.house', 'natal', 'categorical', 'arudha', ar.house, 'lagna lord counted twice from the lagna'));
    out.push(ind('point.arudha.sign', 'natal', 'categorical', 'arudha', ar.sign, 'sign occupying the arudha house'));
  }

  // ---- one block per graha
  chart.planets.forEach((p) => {
    const s = strengths[p.name];
    const k = `graha.${p.name}`;
    out.push(ind(`${k}.house`, 'natal', 'categorical', p.name, p.house, 'whole-sign house from the lagna'));
    out.push(ind(`${k}.sign`, 'natal', 'categorical', p.name, p.sign, 'sidereal sign, Lahiri ayanamsa'));
    out.push(ind(`${k}.degree`, 'natal', 'scalar', p.name, round(p.degree), 'degrees into the sign'));
    out.push(ind(`${k}.nakshatra`, 'natal', 'categorical', p.name, p.nakshatra.name, 'nakshatra by longitude'));
    out.push(ind(`${k}.nakshatra_lord`, 'natal', 'categorical', p.name, p.nakshatra.lord, 'Vimshottari lord of that nakshatra'));
    out.push(ind(`${k}.retrograde`, 'natal', 'boolean', p.name, !!p.retrograde, 'apparent motion against the zodiac'));
    out.push(ind(`${k}.combust`, 'natal', 'boolean', p.name, !!s.combustion.combust, 'within the per-planet orb of the Sun'));
    out.push(ind(`${k}.dignity`, 'natal', 'ordinal', p.name, s.dignity.label, 'exaltation, ownership and friendship tables',
      ));
    out.push(ind(`${k}.dignity_rank`, 'natal', 'ordinal', p.name, DIGNITY_ORDER.indexOf(s.dignity.label), 'dignity as a 0–5 rank for statistics'));
    out.push(ind(`${k}.avastha`, 'natal', 'ordinal', p.name, s.avastha.name, 'Baladi avastha by degree, reversed in even signs'));
    out.push(ind(`${k}.avastha_rank`, 'natal', 'ordinal', p.name, AVASTHA_ORDER.indexOf(s.avastha.name), 'avastha as a 0–4 rank'));
    out.push(ind(`${k}.dispositor`, 'natal', 'categorical', p.name, s.dispositor.name, 'lord of the sign it occupies'));
    out.push(ind(`${k}.strength`, 'natal', 'scalar', p.name, s.score, 'weighted composite of six inputs, 0–10'));
    out.push(ind(`${k}.band`, 'natal', 'ordinal', p.name, s.band, 'strength bucketed into four bands'));
    aspectedHouses(p.name, p.house).forEach((a) =>
      out.push(ind(`${k}.aspects.${a.count}`, 'natal', 'categorical', p.name, a.house, `${a.count}th drishti counted from its own house`)));
  });

  // ---- one block per bhava
  for (let h = 1; h <= 12; h++) {
    const conn = connectedToHouse(chart, h, SIGN_LORDS);
    const k = `bhava.${h}`;
    out.push(ind(`${k}.sign`, 'natal', 'categorical', `house${h}`, VEDIC_SIGNS[conn.signIndex], 'sign in this house'));
    out.push(ind(`${k}.lord`, 'natal', 'categorical', `house${h}`, conn.lord, 'ruler of the sign in this house'));
    out.push(ind(`${k}.lord_house`, 'natal', 'categorical', `house${h}`, conn.lordHouse, 'where that ruler sits — the bhava-lord chain'));
    out.push(ind(`${k}.occupant_count`, 'natal', 'scalar', `house${h}`, conn.occupants.length, 'grahas sitting in this house'));
    out.push(ind(`${k}.occupants`, 'natal', 'categorical', `house${h}`, conn.occupants.join('|') || null, 'which grahas sit here'));
    out.push(ind(`${k}.aspect_count`, 'natal', 'scalar', `house${h}`, conn.aspectedBy.length, 'grahas casting drishti here'));
  }

  // ---- karakas and conjunctions
  karakas(chart).forEach((kk) =>
    out.push(ind(`karaka.${kk.key}`, 'natal', 'categorical', 'karaka', kk.planet, 'Jaimini rank by degree, highest first')));
  conjunctions(chart).forEach((c) => c.pairs.forEach(([a, b]) =>
    out.push(ind(`conj.${[a, b].sort().join('_')}`, 'natal', 'boolean', 'conjunction', true, `both in house ${c.house}`))));

  return out;
}

/** Time-varying layers, recomputed whenever asked. */
function timeIndicators({ dasha, varsha, numerology, western }) {
  const out = [];
  if (dasha?.current) {
    out.push(ind('dasha.maha.lord', 'dasha', 'categorical', 'dasha', dasha.current.lord, 'Vimshottari mahadasha running now'));
    out.push(ind('dasha.maha.end', 'dasha', 'scalar', 'dasha', dasha.current.end, 'when it ends'));
  }
  if (dasha?.currentAntar) out.push(ind('dasha.antar.lord', 'dasha', 'categorical', 'dasha', dasha.currentAntar.lord, 'antardasha running now'));

  if (varsha) {
    out.push(ind('varsha.muntha.house', 'varsha', 'categorical', 'varsha', varsha.muntha.house, 'advances one house per year of life'));
    out.push(ind('varsha.muntha.lord', 'varsha', 'categorical', 'varsha', varsha.muntha.lord, 'ruler of the muntha sign'));
    out.push(ind('varsha.age', 'varsha', 'scalar', 'varsha', varsha.window.age, 'completed years at the solar return'));
    out.push(ind('varsha.elapsed', 'varsha', 'scalar', 'varsha', round(varsha.window.elapsed), 'fraction of the year gone'));
    out.push(ind('transit.sadesati', 'transit', 'boolean', 'transit', varsha.transits.sadeSati.active, 'Saturn in the 12th, 1st or 2nd from the natal Moon'));
    varsha.transits.list.forEach((t) => {
      out.push(ind(`transit.${t.planet}.house_lagna`, 'transit', 'categorical', t.planet, t.houseFromLagna, 'house from the natal lagna'));
      out.push(ind(`transit.${t.planet}.house_moon`, 'transit', 'categorical', t.planet, t.houseFromMoon, 'house from the natal Moon'));
    });
  }

  if (numerology) {
    out.push(ind('num.driver', 'numerology', 'ordinal', 'numerology', numerology.driver.value, 'birth day reduced'));
    out.push(ind('num.conductor', 'numerology', 'ordinal', 'numerology', numerology.conductor.value, 'whole birth date reduced'));
    out.push(ind('num.driver.planet', 'numerology', 'categorical', 'numerology', numerology.driver.planet, 'number mapped to graha'));
  }

  if (western) {
    out.push(ind('west.sun.sign', 'western', 'categorical', 'western', western.bigThree.sun, 'tropical zodiac'));
    out.push(ind('west.moon.sign', 'western', 'categorical', 'western', western.bigThree.moon, 'tropical zodiac'));
    out.push(ind('west.rising.sign', 'western', 'categorical', 'western', western.bigThree.rising, 'tropical zodiac'));
    Object.entries(western.balance.element).forEach(([el, n]) =>
      out.push(ind(`west.element.${el.toLowerCase()}`, 'western', 'scalar', 'western', n, 'count of the seven visible bodies')));
  }
  return out;
}

const round = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);

/** Everything, as one vector. Pass `{ asMap: true }` for keyed lookup. */
function vector(chart, extras = {}, { asMap = false } = {}) {
  const all = [...natalIndicators(chart), ...timeIndicators(extras)];
  return asMap ? Object.fromEntries(all.map((i) => [i.id, i.value])) : all;
}

/** Column names only — the schema, without any chart attached. */
function schema(chart) {
  return natalIndicators(chart).map(({ id, layer, kind, derivation }) => ({ id, layer, kind, derivation }));
}

module.exports = { vector, schema, natalIndicators, timeIndicators, GRAHAS };
