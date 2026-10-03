/*
 * SUB-MODELS — the catalogue of every reading the app can give.
 *
 * The findings model (lib/findings.js) is the single place a sentence is scored. A
 * sub-model is a named question put to that pool: "when are my best career periods",
 * "does my partnership promise hold up", "what is live right now". It declares:
 *
 *   id          stable name, topic.reading
 *   group       the eight life topics, plus right now / your year / you / other systems
 *   question    the question it answers, in the words a person would use
 *   intents     which kinds of question call it up (overview, timing, strength, obstacle, ...)
 *   what it uses  houses, planets, source patterns, systems, kinds
 *
 * and returns one uniform result: ranked findings, the facts behind them, timing windows
 * where relevant, action plans, and the houses and planets to light up on the chart.
 *
 * Two things trigger a sub-model: a person opening it from the catalogue, or a question
 * routed to it by lib/intent.js. Both run the same code, so the answer to "when will I
 * have good career periods" and the "career timing" card are the same model.
 */

const { SIGN_LORDS, VEDIC_SIGNS } = require('./astro');
const { LIFE_AREAS } = require('./lenses');
const { connectedToHouse } = require('./aspects');
const { ordinal } = require('./bhava');
const { DEVATAS } = require('./devata');
const Findings = require('./findings');
const Timing = require('./timing');
const Actions = require('./actions');
const Divisional = require('./divisional');

// ------------------------------------------------------------------ groups
const GROUPS = [
  ...Findings.TOPICS.map((t) => ({ key: t.key, name: t.name, blurb: Findings.TOPIC_BLURB[t.key], life: true })),
  { key: 'now', name: 'Right now', blurb: 'The period you are living through', life: false },
  { key: 'year', name: 'Your year', blurb: 'Birthday to birthday', life: false },
  { key: 'self', name: 'You', blurb: 'Who you are, and how you are read', life: false },
  { key: 'systems', name: 'Other systems', blurb: 'Western astrology and numerology', life: false },
];

// ----------------------------------------------------------------- registry
// `houses` and `planets` select findings by structure; `sources` by origin; `kinds` by tone.
// A topic model only takes findings that belong to its topic, so a Saturn sentence about the
// 5th house never leaks into a career reading just because Saturn is a career planet.
const SUBMODELS = [
  // ---- career
  { id: 'career.work', group: 'career', topic: 'career', houses: [10, 6], planets: ['Saturn', 'Sun'],
    title: 'Your work and where effort pays', question: 'What kind of work suits me, and where does my effort pay off?',
    intents: ['overview', 'strength', 'decision', 'obstacle'] },
  { id: 'career.standing', group: 'career', topic: 'career', houses: [10], sources: [/^arudha\./, /^lord\.h10/, /^drishti\..*\.h10$/],
    title: 'Standing and reputation', question: 'How is my work seen, and what gives me standing?', intents: ['overview', 'strength'] },
  { id: 'career.timing', group: 'career', topic: 'career', timing: true,
    title: 'When career themes are most active', question: 'When are the best periods for my career?', intents: ['timing', 'decision'] },
  { id: 'career.dashamsa', group: 'career', topic: 'career', sources: [/^div\.D10/], tables: ['D10'],
    title: 'Your career chart (dashamsa)', question: 'Does my career promise hold up in the detailed chart?', intents: ['overview', 'strength'] },

  // ---- money
  { id: 'money.earning', group: 'money', topic: 'money', houses: [11, 5], planets: ['Jupiter'],
    title: 'How money comes to you', question: 'Where does my income come from, and what grows it?', intents: ['overview', 'strength', 'decision'] },
  { id: 'money.keeping', group: 'money', topic: 'money', houses: [2, 12, 8], planets: ['Venus'],
    title: 'What you keep and what leaks', question: 'Can I hold on to money, and where does it slip away?', intents: ['overview', 'obstacle'] },
  { id: 'money.timing', group: 'money', topic: 'money', timing: true,
    title: 'When money themes are most active', question: 'When are the best periods for money?', intents: ['timing', 'decision'] },

  // ---- marriage
  { id: 'marriage.partner', group: 'marriage', topic: 'marriage', houses: [7], planets: ['Venus', 'Jupiter'],
    title: 'Your partner and how you partner', question: 'What kind of partner suits me, and how do I show up in a relationship?', intents: ['overview', 'strength', 'decision'] },
  { id: 'marriage.friction', group: 'marriage', topic: 'marriage', houses: [7, 2], planets: ['Saturn', 'Mars', 'Rahu'], kinds: ['challenge'],
    title: 'Where partnership asks the most of you', question: 'What gets hard in relationships, and what helps?', intents: ['obstacle', 'remedy'] },
  { id: 'marriage.navamsa', group: 'marriage', topic: 'marriage', sources: [/^div\.D9/], tables: ['D9'],
    title: 'Your partnership chart (navamsa)', question: 'Does the promise of partnership hold up under a closer look?', intents: ['overview', 'strength'] },
  { id: 'marriage.timing', group: 'marriage', topic: 'marriage', timing: true,
    title: 'When partnership themes are most active', question: 'When are the best periods for relationships?', intents: ['timing', 'decision'] },

  // ---- family
  { id: 'family.home', group: 'family', topic: 'family', houses: [4], planets: ['Moon'],
    title: 'Home and peace of mind', question: 'Do I feel settled, and what shapes my sense of home?', intents: ['overview', 'strength', 'obstacle'] },
  { id: 'family.parents', group: 'family', topic: 'family', houses: [4, 9], planets: ['Moon', 'Sun'],
    title: 'Parents and where you come from', question: 'What shaped me through my parents, and what do I carry?', intents: ['overview'] },
  { id: 'family.siblings', group: 'family', topic: 'family', houses: [3, 11], planets: ['Mars'],
    title: 'Siblings, courage and effort', question: 'What is my bond with siblings and my capacity for effort?', intents: ['overview', 'strength'] },

  // ---- health (energy and routine; never conditions)
  { id: 'health.energy', group: 'health', topic: 'health', houses: [1, 6], planets: ['Sun', 'Moon'],
    title: 'Your energy and constitution', question: 'How is my energy, and what supports it?', intents: ['overview', 'strength'],
    note: 'This reads energy and routine, not medical conditions. For anything about your health, see a doctor.' },
  { id: 'health.load', group: 'health', topic: 'health', houses: [6, 8, 12], planets: ['Saturn', 'Mars'],
    title: 'Strain and recovery', question: 'What puts pressure on me, and what restores me?', intents: ['obstacle', 'remedy'],
    note: 'This reads pressure and recovery, not medical conditions. For anything about your health, see a doctor.' },

  // ---- education
  { id: 'education.learning', group: 'education', topic: 'education', houses: [5, 4, 9], planets: ['Mercury', 'Jupiter'],
    title: 'How you learn', question: 'How do I learn best, and where does study pay off?', intents: ['overview', 'strength', 'decision'] },
  { id: 'education.creative', group: 'education', topic: 'education', houses: [5], planets: ['Venus', 'Jupiter'],
    title: 'Creativity and children', question: 'What do I create, and what is my connection to children?', intents: ['overview', 'strength'] },

  // ---- foreign
  { id: 'foreign.abroad', group: 'foreign', topic: 'foreign', houses: [12, 9, 3], planets: ['Rahu'],
    title: 'Distance and living away', question: 'Does distance help me, and is living away in my chart?', intents: ['overview', 'decision'] },
  { id: 'foreign.timing', group: 'foreign', topic: 'foreign', timing: true,
    title: 'When distance themes are most active', question: 'When are the best periods for travel or moving away?', intents: ['timing', 'decision'] },

  // ---- spiritual
  { id: 'spiritual.practice', group: 'spiritual', topic: 'spiritual', houses: [12, 9], planets: ['Ketu', 'Jupiter'],
    title: 'Your inner practice', question: 'What kind of inner practice suits me?', intents: ['overview', 'strength', 'remedy'] },
  { id: 'spiritual.depth', group: 'spiritual', topic: 'spiritual', houses: [8], planets: ['Saturn', 'Ketu'],
    title: 'Depth, change and the hidden', question: 'What am I drawn to look into, and what changes me?', intents: ['overview', 'obstacle'] },
  { id: 'spiritual.devata', group: 'spiritual', topic: 'spiritual', devata: true,
    title: 'The deities behind your chart', question: 'Which deity and which practice are tied to my chart?', intents: ['remedy', 'overview'] },

  // ---- right now / your year
  { id: 'now.live', group: 'now', sources: [/^timing\.(maha|antar)/, /^num\..*\.agrees/], floor: 0, facts: 'dasha',
    title: 'What is live in your life right now', question: 'What period am I in, and what is it about?', intents: ['overview', 'timing'] },
  { id: 'year.solar', group: 'year', sources: [/^timing\.(muntha|transit|sadesati)/], floor: 0, facts: 'year',
    title: 'What this year is about', question: 'What is this year about, and how do I make the most of it?', intents: ['overview', 'timing', 'remedy'] },

  // ---- you
  { id: 'self.core', group: 'self', sources: [/^placement\.(Sun|Moon)$/, /^yoga\./, /^lord\.h1$/], floor: 0, facts: 'core',
    title: 'Who you are', question: 'What am I like at the core?', intents: ['overview', 'strength'] },
  { id: 'self.image', group: 'self', sources: [/^arudha\./], floor: 0,
    title: 'How others read you', question: 'How do other people see me?', intents: ['overview'] },
  { id: 'self.strengths', group: 'self', all: true, kinds: ['strength'], title: 'Your strongest assets', limit: 6,
    question: 'What are my strengths?', intents: ['strength'] },
  { id: 'self.growth', group: 'self', all: true, kinds: ['challenge'], title: 'Where you grow by effort', limit: 6,
    question: 'What are my weak spots, and where do I have to work?', intents: ['obstacle', 'remedy'] },

  // ---- other systems
  { id: 'systems.western', group: 'systems', systems: ['western'], all: true, floor: 0, limit: 9,
    title: 'Western astrology: Sun, Moon and rising', question: 'What does Western astrology say about me?', intents: ['overview'] },
  { id: 'systems.numbers', group: 'systems', systems: ['numbers'], all: true, floor: 0, facts: 'numbers',
    title: 'Numerology: driver and conductor', question: 'What do my numbers say?', intents: ['overview'] },
];

const byId = Object.fromEntries(SUBMODELS.map((m) => [m.id, m]));

// ------------------------------------------------------------------ context
/** Everything a sub-model needs, computed once per request. */
function buildContext({ chart, dasha, strengths, year, western, numerology, visibleTiers, now = new Date() }) {
  const all = Findings.buildFindings({ chart, dasha, strengths, year, western, numerology, visibleTiers });
  return { chart, dasha, strengths, year, western, numerology, all, now, div: Divisional.all(chart) };
}

// ------------------------------------------------------------------ selection
// Sources that answer one specific question (the arudha, a divisional chart, another system).
// They only ever appear in a reading that asks for them by name, never by house or planet.
const SPECIALIST = /^(arudha|div|west|num)\./;

function matches(m, f) {
  const systems = m.systems || ['vedic'];
  if (!systems.includes(f.system)) return false;
  if (m.kinds && !m.kinds.includes(f.kind)) return false;
  if (m.sources && m.sources.some((re) => re.test(f.source))) return true;
  if (m.all) return true;
  if (!m.topic || SPECIALIST.test(f.source)) return false;
  // A house selects on structure: the finding is about one of this reading's houses and the topic.
  if ((m.houses || []).includes(f.house) && f.topics.includes(m.topic)) return true;
  // A planet alone is not enough (Saturn is everywhere); the sentence itself has to name the topic.
  return (m.planets || []).includes(f.planet) && f.topicBasis === 'sentence' && f.topics[0] === m.topic;
}

function select(ctx, m) {
  const floor = m.floor ?? 30;
  const pool = ctx.all.filter((f) => matches(m, f) && f.power >= floor)
    .sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));
  // At most two sentences from any one source, so one rich source cannot crowd out the rest.
  const perSource = {};
  const picked = [];
  for (const f of pool) {
    if ((perSource[f.source] || 0) >= 2) continue;
    perSource[f.source] = (perSource[f.source] || 0) + 1;
    picked.push(f);
    if (picked.length >= (m.limit ?? 6)) break;
  }
  return picked;
}

// -------------------------------------------------------------------- facts
const ord = ordinal;

function houseFact(ctx, h) {
  const c = connectedToHouse(ctx.chart, h, SIGN_LORDS);
  const sign = VEDIC_SIGNS[c.signIndex];
  const bits = [sign, `lord ${c.lord} in house ${c.lordHouse}`];
  bits.push(c.occupants.length ? `${c.occupants.join(', ')} here` : 'empty');
  if (c.aspectedBy.length) bits.push(`aspected by ${[...new Set(c.aspectedBy.map((a) => a.planet))].join(', ')}`);
  return { label: `${ord(h)} house`, value: bits.join(' · ') };
}

function planetFact(ctx, name) {
  const p = ctx.chart.planets.find((x) => x.name === name);
  const s = ctx.strengths[name];
  return p && s ? { label: name, value: `${p.sign} · house ${p.house} · ${s.band} ${s.score}/10` } : null;
}

const when = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

function extraFacts(ctx, kind) {
  const { chart, dasha, year, numerology } = ctx;
  if (kind === 'dasha' && dasha?.current) {
    return [
      { label: 'Main period', value: `${dasha.current.lord} until ${when(dasha.current.end)}` },
      ...(dasha.currentAntar ? [{ label: 'Sub-period', value: `${dasha.currentAntar.lord} until ${when(dasha.currentAntar.end)}` }] : []),
      { label: 'Born into', value: `${dasha.balance.lord}, with ${dasha.balance.years.toFixed(1)} years left at birth` },
    ];
  }
  if (kind === 'year' && year) {
    return [
      { label: 'Solar year', value: `${year.window.start.toISOString().slice(0, 10)} to ${year.window.end.toISOString().slice(0, 10)}` },
      { label: 'Muntha', value: `${ord(year.muntha.house)} house, ruled by ${year.muntha.lord}` },
      { label: 'Personal year number', value: String(year.personalYear.value ?? year.personalYear) },
      ...year.transits.list.map((t) => ({ label: `Transiting ${t.planet}`, value: `${ord(t.houseFromLagna)} house from your lagna, ${ord(t.houseFromMoon)} from your Moon` })),
    ];
  }
  if (kind === 'core') {
    return [
      { label: 'Lagna', value: `${chart.ascendant.sign} ${chart.ascendant.degree.toFixed(1)}°, ruled by ${chart.ascendant.lord}` },
      { label: 'Moon', value: `${chart.moonSign}, ${chart.nakshatra.name} pada ${chart.nakshatra.pada}` },
    ];
  }
  if (kind === 'numbers' && numerology) {
    return [
      { label: 'Driver', value: `${numerology.driver.value} · ${numerology.driver.planet}` },
      { label: 'Conductor', value: `${numerology.conductor.value} · ${numerology.conductor.planet}` },
    ];
  }
  return [];
}

function factsFor(ctx, m) {
  const out = [];
  (m.houses || []).forEach((h) => out.push(houseFact(ctx, h)));
  (m.planets || []).forEach((p) => { const f = planetFact(ctx, p); if (f) out.push(f); });
  if (m.facts) out.push(...extraFacts(ctx, m.facts));
  return out;
}

// --------------------------------------------------------------------- run
const PLANET_NAMES = new Set(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']);

function run(id, ctx) {
  const m = byId[id];
  if (!m) return null;
  const picked = select(ctx, m);
  const findings = Findings.table(picked);
  const spread = [];
  const seen = new Set();
  findings.forEach((f) => {
    const dup = f.action && seen.has(f.action.planet);
    if (f.action) seen.add(f.action.planet);
    spread.push(dup ? { ...f, action: null } : f);
  });

  // Action plans: the planets behind the strongest findings that carry an action.
  const planetsForActions = [];
  findings.forEach((f) => { if (f.action && !planetsForActions.includes(f.action.planet)) planetsForActions.push(f.action.planet); });
  if (!planetsForActions.length && m.planets) {
    const weak = m.planets.map((n) => ctx.strengths[n]).filter((s) => s && (s.band === 'weak' || s.band === 'strained'))
      .sort((a, b) => a.score - b.score)[0];
    if (weak) planetsForActions.push(weak.planet);
  }
  const windows = m.timing ? Timing.windows(ctx.chart, ctx.dasha, m.topic, { now: ctx.now }) : null;
  if (windows && !planetsForActions.length) {
    // A timing reading acts on the planets that drive its windows, the running or the strained ones first.
    windows.significators.forEach((sg) => {
      const s = ctx.strengths[sg.planet];
      if (s && (s.band === 'weak' || s.band === 'strained' || ctx.dasha?.current?.lord === sg.planet)) planetsForActions.push(sg.planet);
    });
  }
  const actions = planetsForActions.slice(0, 2).map((pl) => Actions.plan(pl, m.topic, ctx)).filter(Boolean);
  const tables = (m.tables || []).map((k) => ctx.div[k]);
  const devata = m.devata ? devataFacts(ctx) : null;

  // What to light up on the chart: the houses this reading is about, plus where its top findings point.
  const lead = findings.slice(0, 3);
  const area0 = LIFE_AREAS.find((a) => a.key === m.topic);
  const baseHouses = m.houses || (area0 ? area0.houses.slice(0, 2) : []);
  const sigPlanets = windows ? windows.significators.slice(0, 3).map((x) => x.planet) : [];
  const houses = [...new Set([...baseHouses, ...lead.map((f) => f.house).filter(Boolean)])];
  const planets = [...new Set([...(m.planets || []), ...sigPlanets, ...lead.map((f) => f.planet)])].filter((p) => PLANET_NAMES.has(p));
  actions.forEach((a) => { a.highlights.houses.forEach((h) => houses.includes(h) || houses.push(h)); });

  const area = LIFE_AREAS.find((a) => a.key === m.topic);
  return {
    id: m.id, group: m.group, topic: m.topic || null, title: m.title, question: m.question, intents: m.intents, note: m.note || null,
    findings: spread, facts: [...factsFor(ctx, m), ...tables.map((t) => ({ label: `${t.name} rising`, value: t.lagna.sign }))], windows: windows && { ...windows, stretches: Timing.stretches(windows.windows) },
    tables, devata, actions, highlights: { houses: houses.slice(0, 6), planets },
    summary: findings.length ? findings[0].sentence
      : (m.timing || m.devata || tables.length ? null : `Nothing in your chart carries real weight here${area ? ` for ${area.name.toLowerCase()}` : ''}. That is itself a finding: no special pressure, and no special lever.`),
    quiet: !findings.length && !m.timing && !m.devata && !tables.length,
  };
}

function devataFacts(ctx) {
  const rep = require('./devata').devataReport(ctx.strengths, ctx.dasha?.current?.lord);
  const row = (label, d) => d && { label, planet: d.graha || null, adhidevata: d.adhidevata, popular: d.popular, observance: d.observance, day: d.day, reason: d.reason };
  return [row('Running period', rep.current), row('Most strained graha', rep.primary), row('Already working for you', rep.strongest)].filter(Boolean);
}

/** The whole catalogue, each reading with a one-line preview, so nothing needs looking up elsewhere. */
function catalog(ctx) {
  return SUBMODELS.map((m) => {
    const r = run(m.id, ctx);
    const top = r.findings[0];
    return {
      id: m.id, group: m.group, topic: m.topic || null, title: m.title, question: m.question, intents: m.intents,
      preview: top ? { sentence: top.sentence, power: top.power, kind: top.kind } : null,
      count: r.findings.length, hasTiming: !!m.timing, hasActions: r.actions.length > 0,
      hasTables: r.tables.length > 0, quiet: r.quiet,
    };
  });
}

module.exports = { GROUPS, SUBMODELS, byId, buildContext, run, catalog, select };
