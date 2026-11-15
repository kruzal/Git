// In-page port of ../../server.js. The same routes and the same logic, run inside the
// artifact: each request is a plain call instead of HTTP, the signed-in Claude account
// replaces login, and per-person documents in the artifact store replace the SQLite tables.
// Keep it in step with server.js when routes change there.
const { birthChart } = require('./lib/astro');
const { reading } = require('./lib/horoscope');
const { CITIES, localToUtc } = require('./lib/cities');
const { timeline } = require('./lib/dasha');
const { panchang } = require('./lib/panchang');
const { suggestSyllable } = require('./lib/nwaran');
const { personalReading } = require('./lib/rules');
const { interpret } = require('./lib/interpret');
const { evaluateAll } = require('./lib/strength');
const { karakas, arudhaLagna, PUBLIC_IMAGE, LIFE_AREAS, lifeArea, remedies } = require('./lib/lenses');
const { profile: numerologyProfile } = require('./lib/numerology');
const { westernProfile } = require('./lib/western');
const { yearReport } = require('./lib/varsha');
const { vector } = require('./lib/indicators');
const { devataReport } = require('./lib/devata');
const Findings = require('./lib/findings');
const Submodels = require('./lib/submodels');
const Intent = require('./lib/intent');
const Actions = require('./lib/actions');
const { REMEDIES } = require('./lib/lenses');
const { relations } = require('./lib/relations');
const { janma } = require('./lib/janma');
const Muhurta = require('./lib/muhurta');
const Significators = require('./lib/significators');
const Discover = require('./lib/discover');
const Guide = require('./lib/guide');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// ---------- storage: one document per former table, per person ----------
// profile  { full_name, nwaran_name, birth_date, birth_time, city, current_city, updated_at }
// focus    { topics, primary_topic, updated_at }
// practices { commitments: [{ action_id, planet, topic, day, started_on, status }], checkins: { [action_id]: [day] } }
// asks     { items: [{ asked_at, kind, boundary, topic, intent, models }] }  (routing metadata only, newest 500)
const getProfile = (store) => store.get('profile');
const readFocus = (store) => store.get('focus')?.topics || [];
const readPractices = (store) => store.get('practices') || { commitments: [], checkins: {} };

function logAsk(store, row) {
  const items = [...(store.get('asks')?.items || []), { asked_at: nowSql(), ...row }].slice(-500);
  store.put('asks', { items }).catch(() => { /* metadata only; never block an answer on it */ });
}

// ---------- profile ----------
const publicProfile = (p) => p && ({
  fullName: p.full_name, nwaranName: p.nwaran_name, birthDate: p.birth_date, birthTime: p.birth_time, city: p.city,
  currentCity: p.current_city || null,
});

const livingPlace = (profile) => CITIES.find((c) => c.name === (profile?.current_city || profile?.city)) || CITIES[0];

function chartFor(profile) {
  const place = CITIES.find((c) => c.name === profile.city);
  const utc = localToUtc(profile.birth_date, profile.birth_time, place.tz);
  const chart = birthChart(utc, place.lat, place.lon, 'vedic');
  return { place, utc, chart, dasha: timeline(chart.planets.find((p) => p.name === 'Moon').longitude, utc) };
}

const slimPeriod = (p) => p && ({ lord: p.lord, start: p.start.toISOString().slice(0, 10), end: p.end.toISOString().slice(0, 10) });

const discoverLibrary = Discover.library();

const focusPayload = (topics) => ({
  topics, primary: topics[0] || null,
  available: Findings.TOPICS.map((t) => ({ ...t, blurb: Findings.TOPIC_BLURB[t.key] })),
  max: Findings.MAX_FOCUS,
});

function spaceContext(req) {
  const { place, utc, chart, dasha } = chartFor(req.profile);
  const strengths = evaluateAll(chart);
  const year = yearReport(chart, dasha, req.profile, strengths);
  const western = westernProfile(birthChart(utc, place.lat, place.lon, 'western'));
  const numerology = numerologyProfile(req.profile.birth_date, req.profile.full_name);
  const visibleTiers = req.query.tone === 'gentle' ? ['open'] : ['open', 'guarded'];
  return Submodels.buildContext({ chart, dasha, strengths, year, western, numerology, visibleTiers });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayUtc = () => new Date().toISOString().slice(0, 10);
function plausibleDay(day) {
  if (typeof day !== 'string' || !DATE_RE.test(day)) return false;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) && Math.abs(t - Date.now()) <= 3 * 86400000;
}

function practicesFor(store, ctx, today) {
  const { commitments, checkins } = readPractices(store);
  return [...commitments].sort((a, b) => a.started_on.localeCompare(b.started_on)).map((c) => {
    const plan = Actions.plan(c.planet, c.topic, ctx);
    const days = [...(checkins[c.action_id] || [])].sort();
    return { actionId: c.action_id, planet: c.planet, topic: c.topic, status: c.status, startedOn: c.started_on, day: c.day,
      plan, checkins: days.slice(-12), progress: Actions.progress({ checkins: days, startedOn: c.started_on, day: c.day, today }) };
  });
}

const activeIds = (store) => new Set(readPractices(store).commitments.filter((c) => c.status === 'active').map((c) => c.action_id));

// ---------- Ask Vidhya: the guide, answered by Claude through the artifact's `sample` capability ----------
function guideWorld(req, todayDate) {
  const memo = (fn) => { let done = false; let value; return () => (done ? value : (done = true, value = fn())); };
  const base = memo(() => chartFor(req.profile));
  const strengths = memo(() => evaluateAll(base().chart));
  const rel = memo(() => relations(base().chart, strengths()));
  const space = memo(() => spaceContext(req));
  const here = livingPlace(req.profile);
  const tz = () => here.tz;
  const clock = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz() });
  const dayName = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz() });
  return {
    profile: publicProfile(req.profile),
    todayDate,
    base, strengths, rel, space,
    detail: memo(() => interpret(base().chart, base().dasha, { visibleTiers: ['open', 'guarded'] })),
    numerology: memo(() => numerologyProfile(req.profile.birth_date, req.profile.full_name)),
    western: memo(() => westernProfile(birthChart(base().utc, base().place.lat, base().place.lon, 'western'))),
    janma: memo(() => janma(base().chart, strengths(), rel(), base().dasha, base().utc, base().place)),
    muhurta(event, days) {
      const { chart } = base();
      const place = here;
      const r = Muhurta.findMuhurta({
        eventKey: event, days, place,
        from: localToUtc(todayDate, '00:00', place.tz),
        natal: { nakshatraIndex: chart.nakshatra.index, moonSignIndex: chart.planets.find((p) => p.name === 'Moon').signIndex },
      });
      const slim = (w) => ({ when: `${dayName(w.start)}, ${clock(w.start)}–${clock(w.end)}`, choghadiya: w.choghadiya, tithi: w.limbs.tithi.label, nakshatra: w.limbs.nakshatra, good: w.good, against: w.bad });
      return { event: r.event.name, place: `${place.name}, ${place.country}`, best: r.best.map(slim), avoid: r.avoid.map((w) => ({ day: dayName(w.start), why: w.bad[0] })) };
    },
    today() {
      const { chart } = base();
      const place = here;
      const p = panchang(localToUtc(todayDate, '12:00', place.tz), place.lat, place.lon);
      const m = p.muhurtas;
      const daily = reading('vedic', chart.planets.find((x) => x.name === 'Moon').signIndex, 'daily');
      const practices = practicesFor(req.store, space(), todayDate).filter((x) => x.status === 'active')
        .map((x) => ({ planet: x.planet, day: x.day, dueToday: x.progress.dueToday, doneThisWeek: x.progress.doneThisWeek, tiny: x.plan.tiny }));
      return {
        date: todayDate, place: `${place.name}, ${place.country}`,
        vara: p.vara, tithi: p.tithi.label, nakshatra: p.nakshatra, yoga: p.yoga, karana: p.karana,
        sunrise: p.sunrise && clock(p.sunrise), sunset: p.sunset && clock(p.sunset),
        rahuKaal: m && `${clock(m.rahuKaal.start)}–${clock(m.rahuKaal.end)}`, abhijit: m && `${clock(m.abhijit.start)}–${clock(m.abhijit.end)}`,
        dailyReading: { moonSign: daily.sign, summary: daily.summary, detail: daily.detail },
        practices,
      };
    },
  };
}

function cleanHistory(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const turns = raw.slice(-20).map((m) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    text: String(m?.text || '').trim().slice(0, m?.role === 'assistant' ? 6000 : 1500),
  })).filter((m) => m.text);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const alternates = turns.every((m, i) => i === 0 || m.role !== turns[i - 1].role);
  return turns.length && alternates && turns.at(-1).role === 'user' ? turns : null;
}

function offlineAnswer(req, question) {
  const ans = Intent.answer(question, spaceContext(req), { focus: readFocus(req.store) });
  if (ans.kind === 'fact') return { text: [ans.headline, ...ans.points].join('\n\n'), links: ans.links };
  if (!ans.sections) {
    return { text: ans.message || 'Try asking about one area: work, money, relationships, home, energy, study, travel or inner life.', links: [{ href: '/space', label: 'My space' }] };
  }
  const lines = [ans.headline, ...ans.sections.flatMap((s) => s.findings.slice(0, 2).map((f) => `- ${f.sentence}`))];
  return { text: lines.join('\n'), links: ans.models.slice(0, 2).map((m) => ({ href: `/space?reading=${encodeURIComponent(m.id)}`, label: m.title })) };
}

// Same wording as lib/guide.js, which keeps these two internal.
const REFUSAL = 'I can\'t help with that one. I\'m here for your chart, your timing and finding your way around Vidhya — try asking about one of those.';
function contextLine(w) {
  const p = w.profile;
  const lives = p.currentCity && p.currentCity !== p.city ? ` and lives in ${p.currentCity}, so daily timings are for ${p.currentCity}` : '';
  return `[Context] The person is ${p.fullName}, born in ${p.city}${lives}. Their local date today is ${w.todayDate}. This is their own account; the tools read their chart, which is always cast for the birth place.`;
}

const plain = (x) => JSON.parse(JSON.stringify(x));

// One turn of the guide through `sample`: the system prompt and context go first as a user
// turn (sample has no system role), and lib/guide.js's tools run here in the page.
async function respond(history, w, { mode, sample }) {
  const links = new Map();
  const used = [];
  const limits = await sample.limits().catch(() => null);
  const max = limits?.tools?.maxCount || 0;
  const tools = max ? Guide.TOOLS.slice(0, max).map((t) => ({
    name: t.name, description: t.description, inputSchema: t.input_schema,
    execute(input) {
      const out = plain(Guide.execute(t.name, input || {}, w));
      used.push(t.name === 'run_reading' ? `run_reading:${input.id}` : t.name);
      if (out.link) links.set(out.link.href, out.link);
      return out;
    },
  })) : null;
  // Without page tools, hand over the two broadest tool results up front instead.
  const facts = tools ? '' : `\n\nTools are not available in this view. Answer from these results, which the tools would have returned:\n${
    JSON.stringify({ get_overview: plain(Guide.execute('get_overview', {}, w)), get_today: plain(Guide.execute('get_today', {}, w)) })}`;
  if (!tools) { links.set('/kundli', { href: '/kundli', label: 'Your kundli' }); used.push('get_overview', 'get_today'); }

  const turns = [{ role: 'user', content: `Instructions for this conversation:\n\n${Guide.SYSTEM}\n\n${contextLine(w)}${facts}` },
    ...history.map((m) => ({ role: m.role, content: m.text }))];
  if (mode === 'teach') turns[turns.length - 1] = { role: 'user', content: `${turns.at(-1).content}\n\n(Teach mode is on for this message.)` };

  const out = await sample(turns, { cache: false, ...(tools ? { tools } : {}) });
  return { text: out.text.trim() || 'I could not put an answer together for that — try asking it another way.', links: [...links.values()], used };
}

let samplePromise = null;
const getSample = () => (samplePromise ||= (async () => {
  try { return typeof window !== 'undefined' && window.claude?.use ? await window.claude.use('sample') : null; } catch { return null; }
})());

const UNAVAILABLE = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable']);

// ---------- routes ----------
const routes = [];
const route = (method, pattern, ...handlers) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (m, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, keys, handlers });
};

const requireProfile = (req) => {
  req.profile = getProfile(req.store);
  if (!req.profile) throw new HttpError(428, 'Add your birth details first.');
};

route('GET', '/api/me', (req) => ({ user: { id: req.store.uid, email: null }, profile: publicProfile(getProfile(req.store)) }));

route('GET', '/api/cities', () => CITIES.map(({ name, country }) => ({ name, country })));

route('PUT', '/api/profile', async (req) => {
  const { fullName, nwaranName, birthDate, birthTime, city, currentCity } = req.body || {};
  const place = CITIES.find((c) => c.name === city);
  if (currentCity && !CITIES.some((c) => c.name === currentCity)) {
    throw new HttpError(400, 'Choose where you live now from the list, or leave it as your birth place.');
  }
  if (!fullName?.trim() || !place || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '') || !/^\d{2}:\d{2}$/.test(birthTime || '')) {
    throw new HttpError(400, 'Enter your full name, birth date, birth time and birth place.');
  }
  if (new Date(`${birthDate}T${birthTime}`) > new Date()) {
    throw new HttpError(400, 'Birth date and time cannot be in the future.');
  }
  await req.store.put('profile', {
    full_name: fullName.trim(), nwaran_name: nwaranName?.trim() || null, birth_date: birthDate, birth_time: birthTime, city,
    current_city: currentCity && currentCity !== city ? currentCity : null, updated_at: nowSql(),
  });
  return { ok: true, next: '/kundli' };
});

route('GET', '/api/kundli/me', requireProfile, (req) => {
  const { place, utc, chart, dasha } = chartFor(req.profile);
  const { sections, matchedRules } = personalReading(chart, dasha);
  const visibleTiers = req.query.tone === 'gentle' ? ['open'] : ['open', 'guarded'];
  const detail = interpret(chart, dasha, { visibleTiers });
  return {
    profile: publicProfile(req.profile),
    place: `${place.name}, ${place.country}`,
    utc: utc.toISOString(),
    chart,
    nwaranSuggestion: suggestSyllable(chart.nakshatra.index, chart.nakshatra.pada),
    dasha: { current: slimPeriod(dasha.current), currentAntar: slimPeriod(dasha.currentAntar), balance: dasha.balance },
    reading: sections,
    matchedRules,
    detail,
  };
});

route('GET', '/api/lenses/me', requireProfile, (req) => {
  const { place, utc, chart, dasha } = chartFor(req.profile);
  const strengths = evaluateAll(chart);
  const arudha = arudhaLagna(chart);
  const rel = relations(chart, strengths);
  const westernChart = birthChart(utc, place.lat, place.lon, 'western');
  return {
    karakas: karakas(chart),
    arudha: arudha && { ...arudha, readings: arudha.influences.map((p) => ({ planet: p, text: PUBLIC_IMAGE[p] })) },
    lifeAreas: LIFE_AREAS.map((a) => lifeArea(chart, strengths, a.key)),
    remedies: remedies(chart, strengths),
    numerology: numerologyProfile(req.profile.birth_date, req.profile.full_name),
    western: westernProfile(westernChart),
    relations: rel,
    janma: janma(chart, strengths, rel, dasha, utc, place),
    significators: {
      sources: Object.values(Significators.SOURCES),
      houses: Array.from({ length: 12 }, (_, i) => Significators.forHouse(i + 1)),
      activeVedic: Significators.active(chart),
      activeWestern: Significators.active(westernChart),
    },
    devata: devataReport(strengths, timeline(chart.planets.find((p) => p.name === 'Moon').longitude, utc).current?.lord),
  };
});

route('GET', '/api/dasha/me', requireProfile, (req) => {
  const { dasha } = chartFor(req.profile);
  return {
    balance: dasha.balance,
    current: slimPeriod(dasha.current),
    currentAntar: slimPeriod(dasha.currentAntar),
    periods: dasha.periods.map((p) => ({ ...slimPeriod(p), years: p.years, antardashas: p.antardashas.map(slimPeriod) })),
  };
});

route('GET', '/api/reading/me', requireProfile, (req) => {
  const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'daily';
  const { chart } = chartFor(req.profile);
  const moon = chart.planets.find((p) => p.name === 'Moon');
  return reading('vedic', moon.signIndex, period);
});

route('GET', '/api/panchang', (req) => {
  const profile = getProfile(req.store);
  const place = CITIES.find((c) => c.name === req.query.city) || livingPlace(profile);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toLocaleDateString('en-CA', { timeZone: place.tz });
  const at = localToUtc(iso, '12:00', place.tz);
  return { date: iso, place: `${place.name}, ${place.country}`, timezone: place.tz, ...panchang(at, place.lat, place.lon) };
});

route('GET', '/api/muhurta', requireProfile, (req) => {
  const eventKey = Muhurta.EVENTS[req.query.event] ? req.query.event : 'start';
  const days = Math.min(60, Math.max(7, Number(req.query.days) || 30));
  const place = CITIES.find((c) => c.name === req.query.city) || livingPlace(req.profile);
  const { chart } = chartFor(req.profile);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: place.tz });
  const result = Muhurta.findMuhurta({
    eventKey, days, place,
    from: localToUtc(today, '00:00', place.tz),
    natal: { nakshatraIndex: chart.nakshatra.index, moonSignIndex: chart.planets.find((p) => p.name === 'Moon').signIndex },
  });
  const slim = ({ start, end, date, choghadiya, abhijit, score, good, bad, limbs, tara }) =>
    ({ start, end, date, choghadiya, abhijit, score, good, bad, tara, nakshatra: limbs.nakshatra, tithi: limbs.tithi.label });
  return {
    event: result.event, days, place: `${place.name}, ${place.country}`, timezone: place.tz,
    events: Object.entries(Muhurta.EVENTS).map(([key, e]) => ({ key, name: e.name })),
    best: result.best.map(slim), avoid: result.avoid.map(slim),
  };
});

route('GET', '/api/discover/library', requireProfile, (req) => {
  const { chart } = chartFor(req.profile);
  return { ...discoverLibrary, mine: Object.fromEntries(chart.planets.map((p) => [p.name, p.house])) };
});

route('GET', '/api/discover/conjunction', (req) => {
  const names = discoverLibrary.planets.map((p) => p.name);
  const { a, b, c } = req.query;
  const house = Number(req.query.house);
  if (!names.includes(a) || !names.includes(b) || (c && !names.includes(c))) throw new HttpError(400, 'Pick two or three planets.');
  return Discover.conjunction(a, b, house >= 1 && house <= 12 ? house : null, c || null);
});

route('POST', '/api/discover/simulate', requireProfile, (req) => {
  const { chart } = chartFor(req.profile);
  const lagna = Number.isInteger(req.body?.lagna) ? req.body.lagna : null;
  const moves = req.body?.moves && typeof req.body.moves === 'object' ? req.body.moves : {};
  return { base: Discover.snapshot(chart), sim: Discover.snapshot(Discover.rebuild(chart, { lagna, moves })) };
});

route('GET', '/api/year/me', requireProfile, (req) => {
  const { chart, dasha } = chartFor(req.profile);
  return yearReport(chart, dasha, req.profile, evaluateAll(chart));
});

route('GET', '/api/indicators/me', requireProfile, (req) => {
  const { place, utc, chart, dasha } = chartFor(req.profile);
  const strengths = evaluateAll(chart);
  const extras = {
    dasha,
    varsha: yearReport(chart, dasha, req.profile, strengths),
    numerology: numerologyProfile(req.profile.birth_date, req.profile.full_name),
    western: westernProfile(birthChart(utc, place.lat, place.lon, 'western')),
  };
  return req.query.format === 'map'
    ? vector(chart, extras, { asMap: true })
    : { count: vector(chart, extras).length, indicators: vector(chart, extras) };
});

route('GET', '/api/focus', (req) => focusPayload(readFocus(req.store)));

route('PUT', '/api/focus', async (req) => {
  const topics = req.body?.topics;
  const known = new Set(Findings.TOPICS.map((t) => t.key));
  if (!Array.isArray(topics) || topics.some((t) => !known.has(t)) || new Set(topics).size !== topics.length) {
    throw new HttpError(400, 'Choose from the listed topics, each only once.');
  }
  if (topics.length > Findings.MAX_FOCUS) {
    throw new HttpError(400, `Choose at most ${Findings.MAX_FOCUS} — a priority list only works if it is short.`);
  }
  await req.store.put('focus', topics.length ? { topics, primary_topic: topics[0], updated_at: nowSql() } : null);
  return focusPayload(topics);
});

route('GET', '/api/findings/me', requireProfile, (req) => {
  const ctx = spaceContext(req);
  const all = ctx.all;
  if (req.query.format === 'table') return { model: Findings.MODEL_VERSION, weights: Findings.WEIGHTS, rows: Findings.table(all) };
  const saved = readFocus(req.store);
  const topics = typeof req.query.topics === 'string' ? req.query.topics.split(',').filter(Boolean) : saved;
  const minPower = Number(req.query.min) || Findings.MIN_POWER;
  return {
    focus: focusPayload(topics),
    ...Findings.forUser(all, topics, { minPower }),
    meta: { model: Findings.MODEL_VERSION, weights: Findings.WEIGHTS, minPower, candidates: all.length,
      eligible: all.filter((f) => f.power >= minPower).length, droppedFootnotes: all.droppedFootnotes },
  };
});

route('GET', '/api/space/me', requireProfile, (req) => {
  const ctx = spaceContext(req);
  const focus = readFocus(req.store);
  const today = plausibleDay(req.query.today) ? req.query.today : todayUtc();
  const order = [...focus, ...Submodels.GROUPS.map((g) => g.key).filter((k) => !focus.includes(k))];
  return {
    focus: focusPayload(focus),
    groups: order.map((k) => ({ ...Submodels.GROUPS.find((g) => g.key === k), rank: focus.indexOf(k) + 1 || null })),
    catalog: Submodels.catalog(ctx),
    chart: ctx.chart, strengths: ctx.strengths,
    practices: practicesFor(req.store, ctx, today),
    meta: { model: Findings.MODEL_VERSION, readings: Submodels.SUBMODELS.length, findings: ctx.all.length },
  };
});

route('GET', '/api/space/me/reading/:id', requireProfile, (req) => {
  const ctx = spaceContext(req);
  const result = Submodels.run(req.params.id, ctx);
  if (!result) throw new HttpError(404, 'No such reading.');
  const mine = activeIds(req.store);
  result.actions.forEach((a) => { a.committed = mine.has(a.id); });
  return result;
});

route('GET', '/api/ask', requireProfile, (req) => {
  const ctx = spaceContext(req);
  const ans = Intent.answer(req.query.q, ctx, { focus: readFocus(req.store) });
  if (ans.kind === 'empty') throw new HttpError(400, 'Ask a question first.');
  logAsk(req.store, { kind: ans.kind, boundary: ans.id || null, topic: ans.understood?.topics?.[0]?.key || null,
    intent: ans.understood?.intent || null, models: ans.models ? ans.models.map((m) => m.id).join(',') : null });
  if (ans.actions) {
    const mine = activeIds(req.store);
    ans.actions.forEach((a) => { a.committed = mine.has(a.id); });
  }
  return ans;
});

route('POST', '/api/practices', requireProfile, async (req) => {
  const { planet, topic, today } = req.body || {};
  if (!REMEDIES[planet] || !plausibleDay(today)) throw new HttpError(400, 'Choose a practice and send today’s date.');
  const known = new Set(Findings.TOPICS.map((t) => t.key));
  const pr = readPractices(req.store);
  const actionId = `act.${planet}`;
  const exists = pr.commitments.some((c) => c.action_id === actionId);
  const commitments = exists
    ? pr.commitments.map((c) => (c.action_id === actionId ? { ...c, status: 'active', topic: known.has(topic) ? topic : null } : c))
    : [...pr.commitments, { action_id: actionId, planet, topic: known.has(topic) ? topic : null, day: REMEDIES[planet].day, started_on: today, status: 'active' }];
  await req.store.put('practices', { ...pr, commitments });
  return { practices: practicesFor(req.store, spaceContext(req), today) };
});

route('DELETE', '/api/practices/:actionId', requireProfile, async (req) => {
  const pr = readPractices(req.store);
  if (!pr.commitments.some((c) => c.action_id === req.params.actionId)) throw new HttpError(404, 'No such practice.');
  await req.store.put('practices', { ...pr, commitments: pr.commitments.map((c) => (c.action_id === req.params.actionId ? { ...c, status: 'paused' } : c)) });
  return { practices: practicesFor(req.store, spaceContext(req), plausibleDay(req.query.today) ? req.query.today : todayUtc()) };
});

route('POST', '/api/practices/:actionId/checkin', requireProfile, async (req) => {
  const day = req.body?.day;
  const pr = readPractices(req.store);
  const id = req.params.actionId;
  if (!pr.commitments.some((c) => c.action_id === id && c.status === 'active')) throw new HttpError(404, 'Start this practice first.');
  if (!plausibleDay(day)) throw new HttpError(400, 'Send the date you did it.');
  const days = pr.checkins[id] || [];
  if (!days.includes(day)) await req.store.put('practices', { ...pr, checkins: { ...pr.checkins, [id]: [...days, day] } });
  return { practices: practicesFor(req.store, spaceContext(req), day) };
});

route('DELETE', '/api/practices/:actionId/checkin/:day', requireProfile, async (req) => {
  const pr = readPractices(req.store);
  const { actionId, day } = req.params;
  const days = pr.checkins[actionId] || [];
  if (days.includes(day)) await req.store.put('practices', { ...pr, checkins: { ...pr.checkins, [actionId]: days.filter((d) => d !== day) } });
  return { practices: practicesFor(req.store, spaceContext(req), plausibleDay(day) ? day : todayUtc()) };
});

route('POST', '/api/guide', requireProfile, async (req) => {
  const history = cleanHistory(req.body?.messages);
  if (!history) throw new HttpError(400, 'Send the conversation, ending with your question.');
  const mode = req.body?.mode === 'teach' ? 'teach' : 'answer';
  const today = plausibleDay(req.body?.today) ? req.body.today : todayUtc();
  const question = history.at(-1).text;
  const log = (kind, extra = {}) => logAsk(req.store, { kind, boundary: extra.boundary || null, topic: extra.topic || null, intent: mode, models: extra.models || null });

  // Boundaries are decided here, deterministically, and never sent to the model.
  const b = Intent.boundary(question);
  if (b) {
    log('guide-boundary', { boundary: b.id });
    return { text: b.message, links: [], boundary: b.id };
  }

  const sample = await getSample();
  if (!sample) {
    log('guide-offline');
    return { ...offlineAnswer(req, question), offline: true };
  }
  try {
    const out = await respond(history, guideWorld(req, today), { mode, sample });
    const used = out.used.find((u) => u.startsWith('run_reading:'));
    log('guide', { topic: used ? used.split(':')[1].split('.')[0] : null, models: out.used.join(',') || null });
    return { text: out.text, links: out.links };
  } catch (err) {
    const code = err?.code;
    if (code === 'refused') return { text: REFUSAL, links: [], refused: true };
    if (UNAVAILABLE.has(code)) {
      log('guide-offline');
      return { ...offlineAnswer(req, question), offline: true };
    }
    if (code === 'rate_limited') throw new HttpError(503, 'The guide is busy or you have reached your Claude usage limit for now. Try again in a little while; My space still answers in the meantime.');
    if (code === 'session_expired') throw new HttpError(401, 'Sign in to Claude again to use the guide.');
    if (code === 'prompt_too_large') throw new HttpError(400, 'This conversation has grown too long for the guide. Choose Start over and ask again.');
    if (code) throw new HttpError(502, 'The guide could not answer just now. Try again shortly.');
    throw err;
  }
});

/**
 * Handle one API call. `store` is { uid, get(key), put(key, value) } over the person's documents.
 * Resolves { status, data } with data as plain JSON, the way it would have crossed the wire.
 */
async function handle({ method = 'GET', url, body }, store) {
  const u = new URL(url, 'https://vidhya.invalid');
  const req = { method: method.toUpperCase(), path: u.pathname, query: Object.fromEntries(u.searchParams), body: body ?? null, store, params: {} };
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(req.path);
    if (!m) continue;
    r.keys.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); });
    try {
      let out;
      for (const h of r.handlers) out = await h(req);
      const res = out && typeof out === 'object' && 'status' in out && 'data' in out && Object.keys(out).length === 2 ? out : { status: 200, data: out };
      return { status: res.status, data: JSON.parse(JSON.stringify(res.data ?? null)) };
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, data: { error: err.message } };
      console.error(`${req.method} ${req.path} failed`, err);
      return { status: 500, data: { error: err?.message ? `Something went wrong: ${err.message}` : 'Something went wrong.' } };
    }
  }
  return { status: 404, data: { error: 'Not found.' } };
}

module.exports = { handle };
