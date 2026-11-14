/*
 * GUIDE — "Ask Vidhya": helps a person find what they are looking for in their own chart.
 *
 * Claude reads the question in the person's own words, calls tools that run THIS app's
 * engine on THEIR chart, and answers in plain language with links to the page or lens
 * where they can explore further. It does not interpret the chart from general astrology
 * knowledge — every claim about the chart has to come back from a tool, which keeps the
 * guide consistent with every other page in the app.
 *
 * What stays deterministic, on purpose:
 *   - Boundaries (death, medical, gambling, infidelity, other people's charts, crisis) are
 *     checked with lib/intent.js BEFORE anything is sent to the model. A boundary question
 *     never leaves the server.
 *   - Nothing is stored. The conversation lives in the browser tab and is sent with each
 *     request; the server logs only which tools ran (the `asks` table), never the text.
 *
 * It also teaches: every answer shows the working (chart fact → meaning) and explains terms,
 * and "teach mode" walks through one idea at a time with the person's own chart as the example.
 *
 * Model: claude-opus-5-5, adaptive thinking, low effort (chat over computed facts), with
 * server-side refusal fallback ("default" routing). History from earlier turns is replayed
 * as plain text only, so no thinking block is ever replayed from a previous request; within
 * one request the tool loop is strictly append-only.
 */

const Anthropic = require('@anthropic-ai/sdk');
const Submodels = require('./submodels');
const Significators = require('./significators');
const Discover = require('./discover');
const { BHAVAS, ordinal } = require('./bhava');
const { EVENTS } = require('./muhurta');

const MODEL = 'claude-opus-5-5';
const MAX_STEPS = 6;
const GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const ALL_PLANETS = [...GRAHAS, 'Uranus', 'Neptune', 'Pluto'];
const HOUSE_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
const READING_IDS = Submodels.SUBMODELS.map((m) => m.id);

let client = null;
const anthropic = () => (client ||= new Anthropic());
/** Tests swap in a scripted client; nothing else should call this. */
const _setClientForTests = (fake) => { client = fake; };

// ------------------------------------------------------------------ prompt
// Built once at load and never changed, so the system prompt and tools cache across requests.
const PAGES = [
  ['/home', 'Today — daily priorities, the sky today, today\'s panchang'],
  ['/space', 'My space — every reading, the question box, and practices with weekly check-ins'],
  ['/kundli', 'My kundli — the chart, with lenses: Grahas, Bhavas, Relations, Birth chain, Life areas, Karakas, Patterns, Public image, Remedies, Devata, Timing; plus Western and Numbers'],
  ['/year', 'My year — the varshaphal from birthday to birthday'],
  ['/dasha', 'Dasha — the full Vimshottari timeline'],
  ['/panchang', 'Panchang — the five limbs of any day, and the muhurta finder'],
  ['/discover', 'Discover — every planet in every house, any conjunction, and a what-if sandbox of their chart'],
  ['/consult', 'Consult — book a priest (kundli matching, personal questions)'],
];

const SYSTEM = `You are the guide inside Vidhya, a Vedic astrology app with Western and numerology layers. People come to you to find what they are looking for in their own chart: an answer to something on their mind, the right reading, a good time to do something, or the page where it lives.

How you work
- Everything you say about this person's chart comes from your tools, which compute it from their birth details using Vidhya's own engine. If no tool covers something, say so plainly instead of filling it in from general astrology. You may explain general ideas (what a dasha or a nakshatra is) in plain words.
- Choose the one or two tools that fit the question rather than calling many. run_reading covers most life questions; the reading ids are listed below.
- Write the way a thoughtful friend who knows jyotish would talk: warm, direct, specific to them. Keep answers short — a few sentences, or a few short paragraphs for a big question. Name the chart reason behind a claim in everyday words ("your 10th-house lord sits in a strong house").
- Speak to who they are trying to become, but only call something favourable when a tool result supports it. Be honest about what needs care, and pair it with what helps.
- Timing comes as windows when an area is more active, not predictions of events. Say that when you give dates.
- Practices are something to try and track for a few weeks, never a guarantee of outcomes.
- Finish with where to go next: one to three markdown links, using only the "link" values your tools returned or the pages below.
- The chat panel renders plain paragraphs, **bold**, "- " bullet lines and [markdown links]. Nothing else — no headings or tables.

Teaching
- People here also want to learn to read their own chart. In every answer, show the working in a line or two — the chain from chart fact to meaning (for example: your 7th house is Kumbha, its lord Saturn sits in your 11th, so partnership runs through friends and networks) — so they can follow it and do it themselves next time.
- The first time you use a Sanskrit or technical term, give its meaning in a few words.
- In teach mode, teach one idea per answer with their own chart as the worked example: what the idea is, where it shows up in their chart, and what it means for them. Then give them one small thing to try — a question they can answer themselves by opening a specific lens (link it) — and offer the next idea. Build on what you already taught in this conversation instead of repeating it.

Limits — these are not answered with a reading
- When someone will die or how long they will live.
- Medical diagnosis, treatment or pregnancy — suggest a doctor; you can talk about energy and routine.
- Lottery, betting or which stock to buy.
- Whether a partner is or will be unfaithful.
- Another person's chart or compatibility — Vidhya reads only the user's own chart; kundli matching is done on the Consult page.
- If someone sounds like they are in crisis, respond with care, point them to local emergency services or a crisis line, and do not give a reading.
Astrology here is for reflection. It is not medical, legal or financial advice. If a request has nothing to do with the person's life, their chart or this app, say briefly what you can help with.

Pages
${PAGES.map(([href, what]) => `- ${href}: ${what}`).join('\n')}

Readings for run_reading (id — title — the question it answers)
${Submodels.SUBMODELS.map((m) => `- ${m.id} — ${m.title} — ${m.question}`).join('\n')}

Events for find_muhurta: ${Object.entries(EVENTS).map(([k, e]) => `${k} (${e.name})`).join('; ')}.`;

const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const TOOLS = [
  { name: 'get_overview', description: 'The person\'s chart at a glance: lagna, Moon sign, nakshatra, running dasha, strongest and most strained planets, which houses are already flowing and which need care, yogas, where their karma flows, numerology and Western big three. Use first for broad questions ("tell me about myself", "what is my chart like").',
    input_schema: obj({}), strict: true },
  { name: 'run_reading', description: 'Run one of Vidhya\'s readings on the person\'s chart. Returns the ranked findings, facts, timing windows (for timing readings) and the practice it points to. This answers most life questions: career, money, marriage, family, health energy, study, travel abroad, spiritual life, what is live now, the current year, personality.',
    input_schema: obj({ id: { type: 'string', enum: READING_IDS, description: 'Reading id from the system prompt list.' } }), strict: true },
  { name: 'get_house', description: 'One house (bhava) in the person\'s chart: what it covers, its lord and where the lord sits, who sits in it, who aspects it, whether it is flowing / mixed / needs care and why, the house that sustains it, and its significators.',
    input_schema: obj({ house: { type: 'integer', enum: HOUSE_NUMS } }), strict: true },
  { name: 'get_planet', description: 'One planet in the person\'s chart: sign, house, nakshatra, strength breakdown (dignity, avastha, combustion, retrograde), its functional nature for their lagna, the houses it rules and aspects, and its reading.',
    input_schema: obj({ planet: { type: 'string', enum: GRAHAS } }), strict: true },
  { name: 'get_relations', description: 'How the person\'s houses work together: houses already good and where effort pays, the six opposite-house axes, sign exchanges, raja / dhana / dharma-karma yogas, and where the 10th-house karma flows.',
    input_schema: obj({}), strict: true },
  { name: 'get_birth_chain', description: 'The birth moment as a chain: karma (atmakaraka, 5th house, nodes, the dasha ripening now), lineage, place, time (janma panchang) and the exact instant in ghati and pala, including how sensitive the lagna is to birth-time error.',
    input_schema: obj({}), strict: true },
  { name: 'find_muhurta', description: 'The best daytime windows in the coming days for one kind of event, judged by the panchang and by the person\'s own birth star and Moon sign, plus days to avoid. Times are local to their city.',
    input_schema: obj({
      event: { type: 'string', enum: Object.keys(EVENTS) },
      days: { type: 'integer', description: 'How far ahead to look, 7 to 60. Use 30 unless they say otherwise.' },
    }), strict: true },
  { name: 'get_today', description: 'Today for this person: the panchang at their city (vara, tithi, nakshatra, yoga, karana, Rahu kaal, Abhijit), the daily reading for their Moon sign, and which of their practices are due.',
    input_schema: obj({}), strict: true },
  { name: 'explore_placement', description: 'The general reference reading for any planet in any house (not specific to this chart), including Uranus, Neptune and Pluto from the Western layer. Use for "what does Saturn in the 7th mean" style questions.',
    input_schema: obj({ planet: { type: 'string', enum: ALL_PLANETS }, house: { type: 'integer', enum: HOUSE_NUMS } }), strict: true },
  { name: 'explore_conjunction', description: 'What two planets do together in one house, as a general reading. Use for "what does Moon with Saturn mean" style questions.',
    input_schema: obj({ a: { type: 'string', enum: ALL_PLANETS }, b: { type: 'string', enum: ALL_PLANETS } }), strict: true },
];

// ------------------------------------------------------------------- tools
const slimFinding = (f) => ({ sentence: f.sentence, kind: f.kind, topic: f.topic });
const link = (href, label) => ({ href, label });

function execute(name, input, w) {
  switch (name) {
    case 'get_overview': {
      const { chart, dasha } = w.base();
      const s = w.strengths();
      const rel = w.rel();
      const ranked = Object.values(s).sort((a, b) => b.score - a.score);
      const num = w.numerology();
      const west = w.western();
      return {
        lagna: `${chart.ascendant.sign} (ruled by ${chart.ascendant.lord})`,
        moonSign: chart.moonSign, nakshatra: `${chart.nakshatra.name} pada ${chart.nakshatra.pada}`,
        dasha: dasha.current && `${dasha.current.lord} mahadasha until ${dasha.current.end.toISOString().slice(0, 10)}${dasha.currentAntar ? `, ${dasha.currentAntar.lord} antardasha until ${dasha.currentAntar.end.toISOString().slice(0, 10)}` : ''}`,
        strongest: ranked.slice(0, 2).map((x) => `${x.planet} ${x.score}/10`),
        mostStrained: ranked.slice(-2).map((x) => `${x.planet} ${x.score}/10`),
        alreadyGood: rel.alreadyGood.map((h) => `${ordinal(h.house)} ${h.name}: ${h.because}`),
        needsCare: rel.needsCare.map((h) => `${ordinal(h.house)} ${h.name}: ${h.because}`),
        yogas: [...w.detail().yogas.map((y) => y.name), ...rel.yogas.map((y) => y.name), ...rel.exchanges.map((x) => `${x.kind} parivartana`)],
        karma: rel.karma.lines[0],
        numerology: `driver ${num.driver.value} (${num.driver.planet}), conductor ${num.conductor.value} (${num.conductor.planet}), life path ${num.lifePath.value}`,
        westernBigThree: `Sun ${west.bigThree.sun}, Moon ${west.bigThree.moon}, rising ${west.bigThree.rising}`,
        link: link('/kundli', 'Your kundli'),
      };
    }
    case 'run_reading': {
      const r = Submodels.run(input.id, w.space());
      if (!r) throw new Error(`No reading called ${input.id}.`);
      return {
        title: r.title, question: r.question, note: r.note || null,
        findings: r.findings.slice(0, 6).map(slimFinding),
        facts: r.facts.slice(0, 6),
        windows: r.windows ? { caution: r.windows.caution, windows: r.windows.windows.slice(0, 4).map(({ start, end, maha, antar, score, current }) => ({ start, end, maha, antar, score, current })) } : null,
        practice: r.actions[0] ? { planet: r.actions[0].planet, day: r.actions[0].day, do: r.actions[0].do, tiny: r.actions[0].tiny, marker: r.actions[0].marker } : null,
        link: link(`/space?reading=${encodeURIComponent(r.id)}`, r.title),
      };
    }
    case 'get_house': {
      const n = Number(input.house);
      const v = w.rel().houses[n - 1];
      const h = w.detail().houses[n - 1];
      const sig = Significators.forHouse(n);
      return {
        house: n, name: BHAVAS[n - 1].name, sanskrit: BHAVAS[n - 1].sanskrit, covers: BHAVAS[n - 1].summary,
        sign: h.sign, lord: `${h.lord} in house ${h.lordHouse} (${h.lordStrength})`, occupants: h.occupants,
        aspectedBy: h.aspectedBy.map((a) => a.planet), state: v.state,
        supports: v.supports.map((x) => x.text), cautions: v.cautions.map((x) => x.text),
        sustainedBy: `${ordinal(v.sustainedBy.house)} house (${v.sustainedBy.name}), which is ${v.sustainedBy.state}`,
        classicalKaraka: sig.classical,
        link: link(`/kundli?lens=houses&pick=${n}`, `Your ${ordinal(n)} house`),
      };
    }
    case 'get_planet': {
      const p = w.detail().placements.find((x) => x.planet === input.planet);
      const s = w.strengths()[input.planet];
      const nat = w.rel().natures[input.planet];
      return {
        planet: p.planet, sign: p.sign, house: p.house, degree: Math.round(p.degree * 10) / 10, nakshatra: p.nakshatra?.name,
        reading: p.text, strength: `${s.score}/10 (${s.band})`, dignity: s.dignity.label, avastha: s.avastha.name,
        combust: s.combustion.combust, retrograde: s.motion.retrograde,
        functionalNature: nat.nature, rules: nat.ruled.map(ordinal), aspects: p.aspects.map((a) => `${ordinal(a.house)} (${a.area})`),
        link: link(`/kundli?lens=planets&pick=${encodeURIComponent(p.planet)}`, `Your ${p.planet}`),
      };
    }
    case 'get_relations': {
      const rel = w.rel();
      return {
        alreadyGood: rel.alreadyGood, needsCare: rel.needsCare,
        axes: rel.axes.map((a) => ({ name: a.name, pair: a.pair, lean: a.lean, line: a.lines[0] })),
        exchanges: rel.exchanges.map((x) => x.text), yogas: rel.yogas.map((y) => `${y.name}: ${y.text}`),
        karma: rel.karma.lines,
        link: link('/kundli?lens=relations', 'How your houses work together'),
      };
    }
    case 'get_birth_chain': {
      const j = w.janma();
      return { levels: j.levels.map((l) => ({ name: l.name, sanskrit: l.sanskrit, facts: l.facts, lines: l.lines })), link: link('/kundli?lens=janma', 'Your birth chain') };
    }
    case 'find_muhurta': {
      const days = Math.min(60, Math.max(7, Number(input.days) || 30));
      const m = w.muhurta(input.event, days);
      return { ...m, link: link('/panchang', 'Muhurta finder') };
    }
    case 'get_today': return { ...w.today(), link: link('/panchang', 'Today\'s panchang') };
    case 'explore_placement': {
      const pl = Discover.placement(input.planet, Number(input.house));
      const mine = w.base().chart.planets.find((p) => p.name === input.planet);
      return { headline: pl.headline, text: pl.text, notes: pl.notes, gifts: pl.keywords?.gifts, edges: pl.keywords?.edges,
        theirs: mine ? `In their own chart ${input.planet} is in house ${mine.house}.` : null, link: link('/discover', 'Discover') };
    }
    case 'explore_conjunction': {
      const c = Discover.conjunction(input.a, input.b);
      const by = Object.fromEntries(w.base().chart.planets.map((p) => [p.name, p.house]));
      return { ...c, theirs: by[input.a] && by[input.a] === by[input.b] ? `They have this conjunction, in house ${by[input.a]}.` : 'They do not have this conjunction.', link: link('/discover', 'Discover') };
    }
    default: throw new Error(`Unknown tool ${name}.`);
  }
}

// -------------------------------------------------------------------- loop
const REFUSAL = 'I can\'t help with that one. I\'m here for your chart, your timing and finding your way around Vidhya — try asking about one of those.';

function buildMessages(history, w) {
  const p = w.profile;
  const lives = p.currentCity && p.currentCity !== p.city ? ` and lives in ${p.currentCity}, so daily timings are for ${p.currentCity}` : '';
  const context = `[Context] The person is ${p.fullName}, born in ${p.city}${lives}. Their local date today is ${w.todayDate}. This is their own account; the tools read their chart, which is always cast for the birth place.`;
  return history.map((m, i) => (m.role === 'user'
    ? { role: 'user', content: i === 0 ? [{ type: 'text', text: context }, { type: 'text', text: m.text }] : m.text }
    : { role: 'assistant', content: m.text }));
}

/**
 * One turn of the conversation. `history` is [{ role, text }, …] ending with the user's
 * message; `w` is the lazy world the server builds for this person (see server.js).
 */
async function respond(history, w, { mode = 'answer' } = {}) {
  const messages = buildMessages(history, w);
  // Mode is an operator instruction for this turn only, appended after the user's message so the
  // system prompt and tools stay byte-identical (and cached) across every request.
  if (mode === 'teach') messages.push({ role: 'system', content: 'Teach mode is on for this message.' });
  const links = new Map();
  const used = [];
  let lastText = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM,
      tools: TOOLS,
      // On the last allowed step, ask for an answer from what has been gathered.
      ...(step === MAX_STEPS - 1 ? { tool_choice: { type: 'none' } } : {}),
      messages,
    });

    if (response.stop_reason === 'refusal') return { text: REFUSAL, links: [], used, refused: true };

    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
    if (text) lastText = text;
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue;
    const calls = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !calls.length) {
      return { text: lastText || 'I could not put an answer together for that — try asking it another way.', links: [...links.values()], used, truncated: response.stop_reason === 'max_tokens' };
    }

    // Every result goes back in one user message, errors included.
    messages.push({
      role: 'user',
      content: calls.map((call) => {
        try {
          const out = execute(call.name, call.input, w);
          used.push(call.name === 'run_reading' ? `run_reading:${call.input.id}` : call.name);
          if (out.link) links.set(out.link.href, out.link);
          return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) };
        } catch (err) {
          return { type: 'tool_result', tool_use_id: call.id, is_error: true, content: err.message };
        }
      }),
    });
  }
  return { text: lastText || 'That took more steps than I allow for one answer — try a narrower question.', links: [...links.values()], used };
}

module.exports = { respond, execute, TOOLS, SYSTEM, MODEL, _setClientForTests };
