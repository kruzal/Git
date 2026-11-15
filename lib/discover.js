/*
 * DISCOVER — the open playground. Nothing here is about one person's chart until they
 * ask it to be: every planet in every house, any two planets together, and a sandbox
 * that rebuilds a chart after you move things and reports what changed.
 *
 * Three layers, each kept separate so a reader can see where a line comes from:
 *
 *   engine     composed from this app's own tables (lib/interpret.js, lib/bhava.js):
 *              planet nature × house group, natural dignity by house, dig bala, drishti
 *   S-AS-01    planets as house significators (lib/significators.js)
 *   S-CL-01    chartlune.com "Planets in houses" (fetched 2026-10-16). Its 120 placement
 *              pages are one template: every page for a planet carries the same
 *              strengths and growth edge, and every page for a house the same themes.
 *              So it reduces to the per-planet table below — recorded as keywords in
 *              this app's words, not copied. It is the only source here that covers
 *              Uranus, Neptune and Pluto through all twelve houses.
 */

const { SIGN_LORDS, VEDIC_SIGNS, nakshatra } = require('./astro');
const { aspectedHouses } = require('./aspects');
const { evaluateAll, EXALTED, DEBILITATED } = require('./strength');
const { BHAVAS, tags, ordinal } = require('./bhava');
const { interpret, HOUSES, PLANETS, CONJUNCTIONS, OUTCOME, pairKey } = require('./interpret');
const { relations } = require('./relations');
const { WESTERN_HOUSES } = require('./western');
const Significators = require('./significators');

const GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const OUTER = ['Uranus', 'Neptune', 'Pluto'];
const GLYPH = { Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿', Jupiter: '♃', Venus: '♀', Saturn: '♄', Rahu: '☊', Ketu: '☋', Uranus: '♅', Neptune: '♆', Pluto: '♇' };
const DIG_BALA = { Jupiter: 1, Mercury: 1, Moon: 4, Venus: 4, Saturn: 7, Sun: 10, Mars: 10 };

// S-CL-01, reduced: what each planet seeks, how it looks at its best, and its edge.
const CL = {
  Sun: { seeks: 'to be seen and to express who you are', gifts: ['confident', 'purposeful', 'vital'], edges: ['ego-driven', 'hungry for recognition'] },
  Moon: { seeks: 'comfort, safety and belonging', gifts: ['nurturing', 'intuitive', 'caring'], edges: ['moody', 'emotionally dependent'] },
  Mercury: { seeks: 'to think, question and communicate', gifts: ['clever', 'curious', 'articulate'], edges: ['scattered', 'over-analytical'] },
  Venus: { seeks: 'love, beauty, harmony and what you value', gifts: ['warm', 'charming', 'harmonious'], edges: ['indulgent', 'people-pleasing'] },
  Mars: { seeks: 'to act, assert yourself and go after what you want', gifts: ['energetic', 'brave', 'motivated'], edges: ['impatient', 'combative', 'reckless'] },
  Jupiter: { seeks: 'growth, opportunity and good fortune', gifts: ['optimistic', 'generous', 'fortunate'], edges: ['over-confident', 'excessive'] },
  Saturn: { seeks: 'mastery through lessons and patience', gifts: ['disciplined', 'responsible', 'enduring'], edges: ['fearful', 'blocked', 'self-limiting'] },
  Uranus: { seeks: 'freedom, originality and room to break pattern', gifts: ['original', 'inventive', 'free'], edges: ['erratic', 'rebellious', 'detached'] },
  Neptune: { seeks: 'to dream, idealise and connect with something larger', gifts: ['compassionate', 'creative', 'spiritual'], edges: ['escapist', 'foggy', 'easily deceived'] },
  Pluto: { seeks: 'depth, power and transformation', gifts: ['powerful', 'resilient', 'transformative'], edges: ['controlling', 'obsessive', 'destructive'] },
};

const OUTER_QUALITY = {
  Uranus: 'sudden change, originality and the need for freedom',
  Neptune: 'imagination, idealism and spiritual longing',
  Pluto: 'intensity, power and deep transformation',
};

const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** One planet in one house, with nothing chart-specific — the reference reading. */
function placement(planet, house) {
  const cl = CL[planet];
  const sig = Significators.ENTRIES.find((e) => e.planet === planet && e.house === house) || null;
  const keywords = cl && { seeks: cl.seeks, gifts: cl.gifts, edges: cl.edges, source: 'S-CL-01' };

  if (OUTER.includes(planet)) {
    const w = WESTERN_HOUSES[house - 1];
    return {
      planet, house, glyph: GLYPH[planet], system: 'western',
      headline: `${planet} in the ${ordinal(house)} — ${w.name}`,
      text: `${planet} brings ${OUTER_QUALITY[planet]} to ${list(w.keywords.slice(0, 4))}. Here you seek ${cl.seeks} through this part of life. At its best it makes you ${list(cl.gifts)}; the edge to watch is becoming ${list(cl.edges)}.`,
      short: `${list(cl.gifts.slice(0, 2))} · ${w.keywords[0]}`,
      house_: { name: w.name, keywords: w.keywords },
      notes: ['An outer planet moves slowly, so its house matters far more than its sign — a whole generation shares the sign.'],
      keywords, significator: sig, aspects: [],
    };
  }

  const info = PLANETS[planet];
  const h = HOUSES[house - 1];
  const b = BHAVAS[house - 1];
  const notes = [];
  if (EXALTED[planet] === house - 1) notes.push(`The ${ordinal(house)} carries ${VEDIC_SIGNS[house - 1]}'s nature, where ${planet} is exalted — it is naturally comfortable here (Kaal Purusha).`);
  if (DEBILITATED[planet] === house - 1) notes.push(`The ${ordinal(house)} carries ${VEDIC_SIGNS[house - 1]}'s nature, where ${planet} is debilitated — it has to work harder here (Kaal Purusha).`);
  if (DIG_BALA[planet] === house) notes.push(`${planet} gains dig bala (directional strength) in the ${ordinal(house)} — one of its most effective houses.`);
  if (SIGN_LORDS[house - 1] === planet) notes.push(`${planet} rules this house's natural sign, so it is at home in the themes even when the sign differs.`);
  if (['Rahu', 'Ketu'].includes(planet)) notes.push(`${planet === 'Rahu' ? 'Ketu' : 'Rahu'} is always in the ${ordinal(((house + 5) % 12) + 1)} when ${planet} is here — the two are read as one axis.`);

  return {
    planet, house, glyph: GLYPH[planet], system: 'vedic',
    headline: `${planet} in the ${ordinal(house)} — ${b.name}`,
    text: `${planet} brings ${info.quality} to ${h.area}. ${OUTCOME[`${info.nature}|${h.group}`]}`
      + (keywords ? ` At its best it makes you ${list(cl.gifts)}; the edge to watch is becoming ${list(cl.edges)}.` : ''),
    short: OUTCOME[`${info.nature}|${h.group}`].split('.')[0],
    house_: { name: b.name, sanskrit: b.sanskrit, summary: b.summary, tags: tags(house) },
    notes,
    keywords, significator: sig,
    aspects: aspectedHouses(planet, house).map((a) => ({ ...a, name: BHAVAS[a.house - 1].name })),
  };
}

const EASY_MIX = {
  3: 'Three easy planets together: this part of life tends to come easily and pleasantly — the risk is coasting.',
  2: 'Two easy planets and one demanding one: mostly smooth, with one planet that keeps it honest and adds staying power.',
  1: 'Two demanding planets and one easy one: real pressure here, softened by one planet that keeps it humane.',
  0: 'Three demanding planets together: a pressure point in the chart, and also where the most strength gets built.',
};

/** Three planets together: the three natures as one, then each pair inside it. */
function triple(planets, house) {
  if (new Set(planets).size < 3) return { error: 'Pick three different planets.' };
  if (planets.includes('Rahu') && planets.includes('Ketu')) {
    return { pair: planets, impossible: true, text: 'Rahu and Ketu are always exactly opposite each other, so they can never share a house. Read them as an axis instead.' };
  }
  const [a, b, c] = planets;
  const q = (p) => (OUTER.includes(p) ? OUTER_QUALITY[p] : PLANETS[p].quality);
  const easy = planets.filter((p) => !OUTER.includes(p) && PLANETS[p].nature === 'benefic').length;
  const pairs = [[a, b], [a, c], [b, c]].map(([x, y]) => {
    const r = conjunction(x, y);
    return { pair: [x, y], name: r.name, source: r.source, tier: r.tier, text: r.text };
  });
  const notes = ['Three planets in one house make it a focal point of the chart. They share its results, and the strongest of them by sign and degree tends to lead.'];
  const withSun = planets.includes('Sun') ? planets.filter((p) => p !== 'Sun' && !OUTER.includes(p) && !['Rahu', 'Ketu'].includes(p)) : [];
  if (withSun.length) notes.push(`If ${list(withSun)} ${withSun.length > 1 ? 'are' : 'is'} within a few degrees of the Sun, ${withSun.length > 1 ? 'they are' : 'it is'} combust — present but muted. Same house is not the same as same degree.`);
  if (planets.some((p) => OUTER.includes(p))) notes.push('Outer planets belong to the Western system; the Vedic corpus has no reading for them.');
  if (house) {
    const h = BHAVAS[house - 1];
    const malefics = planets.filter((p) => !OUTER.includes(p) && PLANETS[p].nature !== 'benefic');
    notes.push(`In your ${ordinal(house)} (${h.name.toLowerCase()}) this plays out through ${h.summary}.`);
    if (malefics.length && [3, 6, 10, 11].includes(house)) notes.push(`${list(malefics)} in an upachaya house is the classic exception: hard planets do well here, and this improves with age.`);
    if (malefics.length && [6, 8, 12].includes(house)) notes.push('In a dusthana the difficulty is real but tends to burn itself out.');
  }
  return {
    pair: planets, house, source: 'composed', name: null, tier: 'open',
    text: `${a} (${q(a)}), ${b} (${q(b)}) and ${c} (${q(c)}) share a house, so the three run together. ${EASY_MIX[easy]}`,
    notes, pairs,
  };
}

/** Any two planets together, optionally in a given house; pass a third planet for three together. */
function conjunction(a, b, house = null, c = null) {
  if (c) return triple([a, b, c], house);
  if (a === b) return { error: 'Pick two different planets.' };
  if ([a, b].sort().join() === 'Ketu,Rahu') {
    return { pair: [a, b], impossible: true, text: 'Rahu and Ketu are always exactly opposite each other, so they can never share a house. Read them as an axis instead.' };
  }
  const outer = [a, b].filter((p) => OUTER.includes(p));
  const entry = !outer.length && CONJUNCTIONS[pairKey(a, b)];
  let source, name, tier, text;

  if (entry) {
    ({ name, tier, text } = entry);
    source = 'corpus';
  } else {
    // Composed: the two natures meeting. Labelled so nobody mistakes it for a classical reading.
    const q = (p) => (OUTER.includes(p) ? OUTER_QUALITY[p] : PLANETS[p].quality);
    const benefic = (p) => !OUTER.includes(p) && PLANETS[p].nature === 'benefic';
    const both = [a, b].filter(benefic).length;
    const mix = both === 2
      ? 'Two easy planets together: this house tends to feel natural and pleasant — the risk is taking it for granted.'
      : both === 0
        ? 'Two demanding planets together: pressure doubles here, and so does the strength you build by handling it.'
        : 'One easy planet and one demanding one: the soft one takes the edge off, and the hard one gives it backbone.';
    text = `${a} (${q(a)}) and ${b} (${q(b)}) share a house, so the two run together. ${mix}`;
    source = 'composed';
    name = null;
    tier = 'open';
  }

  const notes = [];
  const withSun = [a, b].includes('Sun') ? [a, b].find((p) => p !== 'Sun') : null;
  if (withSun && !OUTER.includes(withSun) && !['Rahu', 'Ketu'].includes(withSun)) {
    notes.push(`If ${withSun} is within a few degrees of the Sun it is combust — present but muted. Same house is not the same as same degree.`);
  }
  if (outer.length) notes.push('Outer planets belong to the Western system; the Vedic corpus has no reading for them.');
  if (house) {
    const h = BHAVAS[house - 1];
    const malefics = [a, b].filter((p) => !OUTER.includes(p) && PLANETS[p].nature !== 'benefic');
    notes.push(`In your ${ordinal(house)} (${h.name.toLowerCase()}) this plays out through ${h.summary}.`);
    if (malefics.length && [3, 6, 10, 11].includes(house)) notes.push(`${list(malefics)} in an upachaya house is the classic exception: hard planets do well here, and this improves with age.`);
    if (malefics.length && [6, 8, 12].includes(house)) notes.push('In a dusthana the difficulty is real but tends to burn itself out.');
  }
  return { pair: [a, b], house, source, name, tier, text, notes };
}

// ----------------------------------------------------------------- sandbox

const norm = (d) => ((d % 360) + 360) % 360;

/**
 * Rebuild a Vedic chart from a base chart with a different lagna and/or planets moved.
 * `moves` maps planet → { house, degree }. Unmoved planets keep their sign, so changing
 * the lagna alone answers "what if I had been born a little earlier or later".
 */
function rebuild(base, { lagna = null, moves = {} } = {}) {
  const asc = Number.isInteger(lagna) && lagna >= 0 && lagna < 12 ? lagna : base.ascendant.signIndex;
  const target = {};
  Object.entries(moves).forEach(([name, m]) => {
    if (!GRAHAS.includes(name) || !m) return;
    const house = Number(m.house);
    const degree = Number(m.degree);
    target[name] = {
      sign: Number.isInteger(house) && house >= 1 && house <= 12 ? (asc + house - 1) % 12 : null,
      degree: Number.isFinite(degree) ? Math.min(29.99, Math.max(0, degree)) : null,
    };
  });
  // The nodes move together: whichever was moved drags the other to the opposite sign.
  const node = target.Rahu ? 'Rahu' : target.Ketu ? 'Ketu' : null;
  if (node) {
    const other = node === 'Rahu' ? 'Ketu' : 'Rahu';
    const own = base.planets.find((p) => p.name === node);
    const sign = target[node].sign ?? own.signIndex;
    const degree = target[node].degree ?? own.degree;
    target[other] = { sign: (sign + 6) % 12, degree };
  }

  const planets = base.planets.map((p) => {
    const t = target[p.name] || {};
    const signIndex = t.sign ?? p.signIndex;
    const degree = t.degree ?? p.degree;
    const longitude = norm(signIndex * 30 + degree);
    return {
      ...p, longitude, signIndex, degree, sign: VEDIC_SIGNS[signIndex],
      house: ((signIndex - asc + 12) % 12) + 1,
      nakshatra: nakshatra(longitude),
      moved: !!target[p.name],
    };
  });
  const moon = planets.find((p) => p.name === 'Moon');
  const ascDegree = base.ascendant.degree;
  return {
    ...base,
    ascendant: { longitude: asc * 30 + ascDegree, sign: VEDIC_SIGNS[asc], signIndex: asc, degree: ascDegree, lord: SIGN_LORDS[asc] },
    planets,
    moonSign: moon.sign,
    sunSign: planets.find((p) => p.name === 'Sun').sign,
    nakshatra: moon.nakshatra,
  };
}

/** Things a real sky cannot do. The sandbox still computes them, but says so. */
function skyWarnings(chart) {
  const by = Object.fromEntries(chart.planets.map((p) => [p.name, p]));
  const gap = (a, b) => { const d = Math.abs(by[a].longitude - by[b].longitude) % 360; return d > 180 ? 360 - d : d; };
  const out = [];
  if (gap('Mercury', 'Sun') > 28) out.push(`Mercury is ${Math.round(gap('Mercury', 'Sun'))}° from the Sun. In a real sky it never gets more than about 28° away.`);
  if (gap('Venus', 'Sun') > 47) out.push(`Venus is ${Math.round(gap('Venus', 'Sun'))}° from the Sun. In a real sky it never gets more than about 47° away.`);
  return out;
}

/** The compact reading of one chart that the sandbox diffs. */
function snapshot(chart) {
  const strengths = evaluateAll(chart);
  const rel = relations(chart, strengths);
  const detail = interpret(chart, null);
  const yogas = [
    ...detail.yogas.filter((y) => y.id !== 'strongest').map((y) => ({ id: 'i:' + y.id, name: y.name, text: y.text })),
    ...rel.yogas.map((y) => ({ id: y.id, name: `${y.name} (${y.planets.join(' + ')})`, text: y.text })),
    ...rel.exchanges.map((x) => ({ id: x.id, name: `${x.kind[0].toUpperCase() + x.kind.slice(1)} parivartana`, text: x.text })),
  ];
  return {
    chart: { ascendant: chart.ascendant, planets: chart.planets.map(({ name, sign, signIndex, degree, house, retrograde, moved, longitude }) => ({ name, sign, signIndex, degree, house, retrograde, moved, longitude })) },
    strengths: Object.fromEntries(Object.entries(strengths).map(([k, s]) => [k, {
      score: s.score, band: s.band, dignity: s.dignity.label, avastha: s.avastha.name, combust: s.combustion.combust,
    }])),
    houses: rel.houses.map((h) => ({ house: h.house, name: h.name, state: h.state, net: h.net, top: (h.state === 'needs care' ? h.cautions : h.supports)[0]?.text || null })),
    placements: Object.fromEntries(detail.placements.map((p) => [p.planet, p.text])),
    conjunctions: detail.conjunctions.map((c) => ({ id: c.pair.slice().sort().join('+'), pair: c.pair, house: c.house, name: c.name, text: c.text })),
    yogas,
    karma: { lord: rel.karma.lord, lordHouse: rel.karma.lordHouse, flowsInto: rel.karma.flowsInto },
    warnings: skyWarnings(chart),
  };
}

function library() {
  const planets = [...GRAHAS, ...OUTER];
  return {
    planets: planets.map((p) => ({ name: p, glyph: GLYPH[p], system: OUTER.includes(p) ? 'western' : 'vedic' })),
    placements: Object.fromEntries(planets.map((p) => [p, Array.from({ length: 12 }, (_, i) => placement(p, i + 1))])),
    covered: Object.keys(CONJUNCTIONS),
    signs: VEDIC_SIGNS,
    sources: [
      { id: 'S-CL-01', title: 'Planets in houses', publisher: 'chartlune.com', fetched: '2026-10-16', note: 'Templated source: one trait set per planet and one theme set per house. Used for gifts, edges and the outer planets.' },
      ...Object.values(Significators.SOURCES),
    ],
  };
}

module.exports = { library, placement, conjunction, rebuild, snapshot, skyWarnings, GRAHAS, OUTER, CL };
