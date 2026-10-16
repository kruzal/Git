/*
 * RELATIONS — how the twelve houses work on each other.
 *
 * A house is never read alone. The tradition judges it through four links, and this
 * module computes every one of them from the chart:
 *
 *   lord        where the house's ruler sits, counted from the lagna AND from the house
 *               itself (bhavat bhavam: the lord in the 6th/8th/12th from its own house
 *               works away from home)
 *   occupants   who sits there, how strong, and in what avastha (a graha in its youth,
 *               the middle 12–18° of a sign, gives its full result)
 *   drishti     who looks at it — benefics protect, malefics press
 *   axis        the house opposite. Every graha aspects the 7th from itself, so the two
 *               ends of an axis are permanently in conversation
 *
 * On top of that, lords that touch each other form yogas: exchanges (parivartana),
 * kendra–trikona links (raja yoga), wealth links (dhana yoga). And the 10th — karma —
 * is read for direction: where its lord goes is where your work is meant to land.
 *
 * Tone rule: a line only says something is good when a named factor in this chart
 * supports it. Encouragement that the chart does not back is not given.
 */

const { SIGN_LORDS } = require('./astro');
const { BHAVAS, ordinal } = require('./bhava');
const { aspectsOnHouse, mutualAspect } = require('./aspects');

const KENDRA = [1, 4, 7, 10];
const TRIKONA = [1, 5, 9];
const DUSTHANA = [6, 8, 12];
const UPACHAYA = [3, 6, 10, 11];
const MALEFICS = new Set(['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu']);

const wrap = (n) => ((n - 1 + 120) % 12) + 1;
/** Count from house `a` to house `b`, with `a` as 1. */
const countFrom = (a, b) => wrap(b - a + 1);
const lower = (n) => BHAVAS[n - 1].name.toLowerCase();
const list = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

// The six axes. Each pair is one question asked from two ends.
const AXES = [
  { pair: [1, 7], name: 'Self and other', question: 'who you are, and who you meet' },
  { pair: [2, 8], name: 'What you hold and what you share', question: 'your own resources, and the joint, hidden or inherited ones' },
  { pair: [3, 9], name: 'Effort and fortune', question: 'what you push for, and what is given' },
  { pair: [4, 10], name: 'Roots and reach', question: 'home and inner peace, and career and public life' },
  { pair: [5, 11], name: 'Creation and return', question: 'what you make, and what it brings back' },
  { pair: [6, 12], name: 'Service and release', question: 'daily work and struggle, and rest, loss and letting go' },
];

/** The Moon is a benefic only while bright — roughly 72° or more from the Sun either way. */
function isBenefic(name, chart) {
  if (name === 'Moon') {
    const sun = chart.planets.find((p) => p.name === 'Sun').longitude;
    const moon = chart.planets.find((p) => p.name === 'Moon').longitude;
    const gap = ((moon - sun) % 360 + 360) % 360;
    return gap >= 72 && gap <= 288;
  }
  return !MALEFICS.has(name);
}

/** Houses (from the lagna) a planet rules. Nodes rule none. */
function ruledHouses(chart, planet) {
  return Array.from({ length: 12 }, (_, i) => i + 1)
    .filter((h) => SIGN_LORDS[(chart.ascendant.signIndex + h - 1) % 12] === planet);
}

/**
 * Functional nature for this lagna. Trikona lordship makes a planet a friend of the
 * chart; lordship of 6, 8 or 12 makes it carry trouble; ruling a kendra and a trikona
 * together makes it the yogakaraka — the single best planet the lagna can have.
 */
function functionalNature(chart, planet) {
  const ruled = ruledHouses(chart, planet);
  if (!ruled.length) return { nature: MALEFICS.has(planet) ? 'malefic' : 'neutral', ruled };
  const trikona = ruled.some((h) => [5, 9].includes(h)) || ruled.includes(1);
  const kendra = ruled.some((h) => [4, 7, 10].includes(h));
  const dusthana = ruled.some((h) => DUSTHANA.includes(h));
  if (trikona && kendra && !ruled.includes(1)) return { nature: 'yogakaraka', ruled };
  if (trikona) return { nature: 'benefic', ruled };
  if (dusthana || ruled.some((h) => [3, 11].includes(h))) return { nature: 'malefic', ruled };
  return { nature: 'neutral', ruled };
}

function lordOf(chart, house) {
  return SIGN_LORDS[(chart.ascendant.signIndex + house - 1) % 12];
}

/**
 * The verdict for one house: what already supports it, what needs care, and the
 * resulting state. Each factor carries a weight so the verdict is explainable.
 */
function houseVerdict(chart, strengths, house) {
  const by = Object.fromEntries(chart.planets.map((p) => [p.name, p]));
  const supports = [];
  const cautions = [];
  const add = (list, weight, factor, text) => list.push({ weight, factor, text });

  // ---- the lord, from the lagna and from the house itself
  const lord = lordOf(chart, house);
  const lp = by[lord];
  const ls = strengths[lord];
  const fromSelf = countFrom(house, lp.house);

  if (lp.house === house) {
    add(supports, 2, 'lord at home', `${lord} rules your ${ordinal(house)} and sits in it, so this area answers to itself.`);
  } else if (DUSTHANA.includes(house) && DUSTHANA.includes(lp.house)) {
    // Viparita: the lord of a difficult house in another difficult house cancels trouble with trouble.
    add(supports, 2, 'viparita', `${lord}, lord of the ${ordinal(house)}, sits in the ${ordinal(lp.house)} — one difficult house inside another. The tradition reads this as trouble undoing trouble: setbacks here tend to turn.`);
  } else if (KENDRA.includes(lp.house) || TRIKONA.includes(lp.house)) {
    add(supports, 2, 'lord well placed', `${lord}, lord of the ${ordinal(house)}, sits in the ${ordinal(lp.house)} — a ${TRIKONA.includes(lp.house) ? 'trikona, a house of merit' : 'kendra, a pillar of the chart'}.`);
  } else if (DUSTHANA.includes(lp.house)) {
    add(cautions, 2, 'lord in dusthana', `${lord}, lord of the ${ordinal(house)}, sits in the ${ordinal(lp.house)}, so ${lower(house)} gets pulled into ${BHAVAS[lp.house - 1].summary}.`);
  }

  // For the 1st, "from the house" and "from the lagna" are the same count — do not score it twice.
  if (house === 1) {
    // already judged above
  } else if (lp.house !== house && [6, 8, 12].includes(fromSelf)) {
    add(cautions, 1, 'lord away from home', `Counted from the ${ordinal(house)} itself, its lord is ${ordinal(fromSelf)} away — it works for this area from a distance.`);
  } else if (lp.house !== house && [5, 9].includes(fromSelf)) {
    add(supports, 1, 'lord in trine to home', `Counted from the ${ordinal(house)} itself, its lord is in the ${ordinal(fromSelf)} — a supportive trine back to home.`);
  }

  if (ls.band === 'strong') add(supports, 2, 'strong lord', `${lord} is strong (${ls.score}/10), so it can deliver what this house promises.`);
  if (ls.band === 'weak') add(cautions, 2, 'weak lord', `${lord} is weak (${ls.score}/10), so results here come slower and need more effort from you.`);

  // ---- the karaka: a house is judged by itself, its lord, and its natural significator
  BHAVAS[house - 1].karaka.split(',').map((k) => k.trim()).filter((k) => k !== lord && strengths[k]).forEach((k) => {
    const ks = strengths[k];
    if (ks.band === 'strong') add(supports, 1, 'strong karaka', `${k}, the natural significator (karaka) of this house, is strong (${ks.score}/10).`);
    if (ks.band === 'weak') add(cautions, 1, 'weak karaka', `${k}, the natural significator (karaka) of this house, is weak (${ks.score}/10).`);
  });

  // ---- who sits here
  chart.planets.filter((p) => p.house === house).forEach((p) => {
    const s = strengths[p.name];
    const benefic = isBenefic(p.name, chart);
    if (s.dignity.label === 'exalted') add(supports, 2, 'exalted occupant', `${p.name} is exalted here — at its best.`);
    else if (s.dignity.label === 'own sign') add(supports, 2, 'occupant in own sign', `${p.name} sits in its own sign here and acts with confidence.`);
    if (s.dignity.label === 'debilitated') add(cautions, 2, 'debilitated occupant', `${p.name} is debilitated here — its themes need deliberate support.`);
    if (s.avastha.name === 'Youth') add(supports, 1, 'yuva avastha', `${p.name} is in its youth (yuva avastha), the age at which a graha gives its full result.`);
    if (['Infant', 'Dead'].includes(s.avastha.name)) add(cautions, 0.5, 'weak avastha', `${p.name} is in ${s.avastha.name === 'Infant' ? 'bala avastha (infancy)' : 'mrita avastha (the spent state)'}, so it gives only part of its result.`);
    if (s.combustion.combust) add(cautions, 1, 'combust occupant', `${p.name} is burnt by the Sun, so it works but is not seen.`);

    if (!benefic && UPACHAYA.includes(house)) {
      add(supports, 1.5, 'malefic in upachaya', `${p.name} is a hard planet in an upachaya house — the one place hard planets do well. It gives grit here, and this area improves with age.`);
    } else if (!benefic && !UPACHAYA.includes(house) && s.band !== 'strong') {
      add(cautions, 1, 'malefic occupant', `${p.name} sits here and presses on ${lower(house)}.`);
    } else if (benefic && s.band !== 'weak') {
      add(supports, 1.5, 'benefic occupant', `${p.name}, a natural benefic, sits here and eases ${lower(house)}.`);
    }
  });

  // ---- who looks at it
  aspectsOnHouse(chart, house).forEach((a) => {
    if (a.planet === 'Jupiter') add(supports, 1.5, 'Jupiter aspect', `Jupiter looks at this house (its ${ordinal(a.count)} aspect from your ${ordinal(a.from)}) and protects it.`);
    else if (isBenefic(a.planet, chart)) add(supports, 0.5, 'benefic aspect', `${a.planet} looks at this house from your ${ordinal(a.from)} and softens it.`);
    else if (!UPACHAYA.includes(house) && ['Saturn', 'Mars'].includes(a.planet)) add(cautions, 1, 'malefic aspect', `${a.planet} looks at this house from your ${ordinal(a.from)} and puts pressure on it.`);
  });

  const total = (list) => list.reduce((s, x) => s + x.weight, 0);
  const net = total(supports) - total(cautions);
  const state = net >= 2 ? 'flowing' : net <= -1.5 ? 'needs care' : 'mixed';

  return {
    house,
    name: BHAVAS[house - 1].name,
    sanskrit: BHAVAS[house - 1].sanskrit,
    lord, lordHouse: lp.house, lordFromSelf: fromSelf,
    supports: supports.sort((a, b) => b.weight - a.weight),
    cautions: cautions.sort((a, b) => b.weight - a.weight),
    net: Math.round(net * 10) / 10,
    state,
  };
}

/**
 * Bhavat bhavam: the Nth house from the Nth holds up the Nth. The 4th from the 4th
 * (your 7th) is what makes a home last; the 9th from the 9th (your 5th) is where
 * fortune comes from.
 */
function sustainer(house) {
  return wrap(house + house - 1);
}

function axisReading(chart, verdicts, axis) {
  const [a, b] = axis.pair;
  const va = verdicts[a - 1];
  const vb = verdicts[b - 1];
  const inA = chart.planets.filter((p) => p.house === a).map((p) => p.name);
  const inB = chart.planets.filter((p) => p.house === b).map((p) => p.name);
  const lean = Math.abs(va.net - vb.net) < 1.5 ? null : va.net > vb.net ? a : b;
  const other = lean === a ? b : a;

  const lines = [];
  if (lean) {
    lines.push(`The weight of this axis sits in your ${ordinal(lean)} (${lower(lean)}). That end is already working, so it is the natural place to stand while you build up the ${ordinal(other)}.`);
  } else {
    lines.push(`Both ends are about even. Neither side carries the other, so this axis rewards keeping the two in balance.`);
  }
  [[inA, a, b], [inB, b, a]].forEach(([names, from, to]) => {
    if (!names.length) return;
    const good = names.filter((n) => isBenefic(n, chart));
    lines.push(`${list(names)} in your ${ordinal(from)} look${names.length === 1 ? 's' : ''} straight across at your ${ordinal(to)}${good.length ? ` — ${list(good)} carr${good.length === 1 ? 'ies' : 'y'} good across the axis` : ''}. What you do in ${lower(from)} lands in ${lower(to)}.`);
  });
  const lordA = lordOf(chart, a);
  const lordB = lordOf(chart, b);
  const pa = chart.planets.find((p) => p.name === lordA);
  const pb = chart.planets.find((p) => p.name === lordB);
  if (pa.house === b) lines.push(`The lord of your ${ordinal(a)} sits in your ${ordinal(b)}: ${lower(a)} is spent in the service of ${lower(b)}.`);
  if (pb.house === a) lines.push(`The lord of your ${ordinal(b)} sits in your ${ordinal(a)}: ${lower(b)} comes looking for you.`);

  return {
    id: `${a}-${b}`, pair: axis.pair, name: axis.name, question: axis.question,
    ends: [{ house: a, name: va.name, state: va.state, net: va.net, occupants: inA },
      { house: b, name: vb.name, state: vb.state, net: vb.net, occupants: inB }],
    lean, lines,
  };
}

/** Parivartana: two planets each in the other's sign. The two houses act as one. */
function exchanges(chart) {
  const out = [];
  const ps = chart.planets.filter((p) => !['Rahu', 'Ketu'].includes(p.name));
  ps.forEach((a, i) => ps.slice(i + 1).forEach((b) => {
    if (SIGN_LORDS[a.signIndex] !== b.name || SIGN_LORDS[b.signIndex] !== a.name) return;
    const houses = [a.house, b.house];
    const kind = houses.some((h) => DUSTHANA.includes(h)) ? 'dainya' : houses.includes(3) ? 'khala' : 'maha';
    const text = {
      maha: `${a.name} and ${b.name} sit in each other's signs, binding your ${ordinal(a.house)} and ${ordinal(b.house)} together. This is a maha parivartana — the strongest kind. ${BHAVAS[a.house - 1].name} and ${lower(b.house)} rise together.`,
      khala: `${a.name} and ${b.name} exchange signs across your ${ordinal(a.house)} and ${ordinal(b.house)}. A khala parivartana: real gains, through restless effort and sometimes changing course.`,
      dainya: `${a.name} and ${b.name} exchange signs across your ${ordinal(a.house)} and ${ordinal(b.house)}. A dainya parivartana: one end is a difficult house, so the other end goes through tests before it settles. Effort turns it.`,
    }[kind];
    out.push({ id: `x:${a.name}-${b.name}`, planets: [a.name, b.name], houses, kind, text });
  }));
  return out;
}

/** Are two planets linked — together, looking at each other, or exchanged? */
function linkBetween(chart, a, b) {
  if (a === b) return null;
  const pa = chart.planets.find((p) => p.name === a);
  const pb = chart.planets.find((p) => p.name === b);
  if (pa.house === pb.house) return 'together';
  if (SIGN_LORDS[pa.signIndex] === b && SIGN_LORDS[pb.signIndex] === a) return 'exchange';
  if (mutualAspect(chart, a, b)) return 'mutual aspect';
  return null;
}

const LINK_PHRASE = { together: 'sitting together', exchange: 'an exchange of signs', 'mutual aspect': 'mutual aspect' };

/** Lord-to-lord yogas: raja (kendra + trikona), dharma–karma (9 + 10), dhana (wealth + merit). */
function lordYogas(chart) {
  const found = [];
  const seen = new Set();
  const push = (y) => {
    const key = y.kind + ':' + [...y.planets].sort().join('-');
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ ...y, id: 'y:' + key });
  };

  const l = (h) => lordOf(chart, h);
  const dk = linkBetween(chart, l(9), l(10));
  if (dk) {
    push({ kind: 'dharma-karma', name: 'Dharma–Karma Adhipati yoga', planets: [l(9), l(10)], houses: [9, 10], link: dk,
      text: `${l(9)} (lord of fortune, your 9th) and ${l(10)} (lord of karma, your 10th) are linked by ${LINK_PHRASE[dk]}. What you believe and what you do point the same way. This is the yoga of work that feels like purpose.` });
  }
  [1, 4, 7, 10].forEach((k) => [5, 9].forEach((t) => {
    const link = linkBetween(chart, l(k), l(t));
    if (link && !(k === 10 && t === 9)) {
      push({ kind: 'raja', name: 'Raja yoga', planets: [l(k), l(t)], houses: [k, t], link,
        text: `${l(k)} (lord of your ${ordinal(k)}, a kendra) and ${l(t)} (lord of your ${ordinal(t)}, a trikona) are linked by ${LINK_PHRASE[link]}. Effort meets merit here — standing rises through ${lower(k)} and ${lower(t)}.` });
    }
  }));
  [2, 11].forEach((w) => [1, 5, 9].forEach((t) => {
    const link = linkBetween(chart, l(w), l(t));
    if (link) {
      push({ kind: 'dhana', name: 'Dhana yoga', planets: [l(w), l(t)], houses: [w, t], link,
        text: `${l(w)} (lord of your ${ordinal(w)}, ${w === 2 ? 'what you keep' : 'what comes in'}) and ${l(t)} (lord of your ${ordinal(t)}) are linked by ${LINK_PHRASE[link]}. Money follows ${lower(t)} in this chart.` });
    }
  }));
  return found;
}

/**
 * The 10th is karma: what you do in the world. Its lord's house is where that work is
 * meant to land, and what supports the 10th decides how far it carries.
 */
function karmaDirection(chart, strengths, verdicts) {
  const lord = lordOf(chart, 10);
  const lp = chart.planets.find((p) => p.name === lord);
  const v = verdicts[9];
  const into = BHAVAS[lp.house - 1];
  const saturn = strengths.Saturn;
  const lines = [
    `The lord of your 10th is ${lord}, sitting in your ${ordinal(lp.house)}. Your karma flows into ${into.name.toLowerCase()} — ${into.summary}. Your work is meant to land there.`,
  ];
  if (v.state === 'flowing') lines.push(`The 10th itself is well supported. ${v.supports[0].text}`);
  else if (v.state === 'needs care') lines.push(`The 10th itself needs care. ${v.cautions[0].text}`);
  const occ = chart.planets.filter((p) => p.house === 10).map((p) => p.name);
  if (occ.length) lines.push(`${list(occ)} sit${occ.length === 1 ? 's' : ''} in the 10th itself, so ${occ.length === 1 ? 'its' : 'their'} nature colours how you work and how you are seen.`);
  lines.push(saturn.band === 'strong' || saturn.band === 'working'
    ? `Saturn, the karaka of karma, is ${saturn.band} (${saturn.score}/10): steady, patient effort is rewarded in full.`
    : `Saturn, the karaka of karma, is ${saturn.band} (${saturn.score}/10): results come through routine and humility, not shortcuts.`);
  return {
    lord, lordHouse: lp.house, flowsInto: into.name, state: v.state, lines,
    supports: v.supports, cautions: v.cautions,
  };
}

/** Everything, for one chart. `strengths` comes from strength.evaluateAll. */
function relations(chart, strengths) {
  const verdicts = Array.from({ length: 12 }, (_, i) => houseVerdict(chart, strengths, i + 1));
  verdicts.forEach((v) => {
    const s = sustainer(v.house);
    v.sustainedBy = { house: s, name: BHAVAS[s - 1].name, state: verdicts[s - 1].state };
  });

  const natures = Object.fromEntries(chart.planets.map((p) => [p.name, { ...functionalNature(chart, p.name), benefic: isBenefic(p.name, chart) }]));
  const ranked = [...verdicts].sort((a, b) => b.net - a.net);

  return {
    houses: verdicts,
    axes: AXES.map((a) => axisReading(chart, verdicts, a)),
    exchanges: exchanges(chart),
    yogas: lordYogas(chart),
    karma: karmaDirection(chart, strengths, verdicts),
    natures,
    // What to build on, and where effort pays most.
    alreadyGood: ranked.filter((v) => v.state === 'flowing').map((v) => ({ house: v.house, name: v.name, net: v.net, because: v.supports[0]?.text })),
    needsCare: ranked.filter((v) => v.state === 'needs care').reverse().map((v) => ({ house: v.house, name: v.name, net: v.net, because: v.cautions[0]?.text })),
  };
}

module.exports = { relations, houseVerdict, functionalNature, isBenefic, sustainer, AXES };
