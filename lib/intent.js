/*
 * INTENT — from a person's own words to the sub-models that answer them.
 *
 * "When will my career pick up?" and "Should I change jobs?" are about the same house
 * and need different models: the first wants timing windows, the second wants what
 * supports the move, what needs care, and what is live right now. So a question is read
 * for two things, and routed on both:
 *
 *   topic    what it is about  (career, marriage, money ...)
 *   intent   what kind of answer it wants  (timing, decision, obstacle, remedy, strength, overview)
 *
 * Everything is deterministic: a lexicon, not a language model. That is a limit, and it is
 * a deliberate one: the same question always gets the same answer, and every step of the
 * routing is shown to the person ("I read this as...") so a misunderstanding is visible
 * and fixable by rephrasing or by picking a reading from the catalogue.
 *
 * Boundaries come first. Some questions should not be answered by a chart at all, and the
 * right response to them is not a reading.
 */

const Findings = require('./findings');
const Submodels = require('./submodels');
const { VEDIC_SIGNS, WESTERN_SIGNS } = require('./astro');

// ------------------------------------------------------------------ boundaries
const BOUNDARIES = [
  { id: 'crisis', re: /\b(suicid\w*|kill myself|end my life|want to die|don'?t want to live|self[- ]?harm|hurt myself)\b/i,
    message: 'I am sorry things feel this heavy. A chart cannot help with this, and you deserve real support right now. If you may be in danger, please contact your local emergency number or a crisis line in your area, or reach someone you trust and tell them how you are. If it helps to talk to a person here, the Consult page can book a conversation, but please do not wait for that if you are not safe.',
    offer: null },
  { id: 'death', re: /\b(when (will|do|am) (i|he|she|they) (die|going to die)|how long (will|do) i live|longevity|lifespan|date of (my )?death|when will \w+ die)\b/i,
    message: 'I do not answer questions about death or how long someone will live. A chart cannot tell that, and a number would only do harm. If something is weighing on you, a priest on the Consult page can sit with you in a real conversation.',
    offer: 'consult' },
  { id: 'medical', re: /\b(cancer|tumou?r|diabet\w*|diagnos\w*|surgery|pregnan\w*|miscarriage|hiv|std|bipolar|schizo\w*|mental (illness|health)|depress\w*|disease)\b/i,
    message: 'I read energy and routine, not medical conditions, so I will not say anything about a diagnosis, a treatment or a pregnancy. For that, please see a doctor. If you want to know what pressures or restores your energy more generally, ask about your energy and I will read that.',
    offer: null },
  { id: 'gambling', re: /\b(lotter\w*|jackpot|gambl\w*|betting|casino|which stock|stock tip|crypto to buy)\b/i,
    message: 'A chart cannot pick winners, and I will not treat it as a way to place bets. I can tell you how your chart reads on money in general: what builds it, what leaks it, and when money themes are most active.',
    offer: null },
  { id: 'infidelity', re: /\b(cheat(ing|ed)?|affair|unfaithful|infidel\w*)\b/i,
    message: 'I do not predict whether anyone will be unfaithful. A chart cannot know that, and guessing would damage trust for no reason. I can read where partnership asks the most of you and what helps, if that is useful.',
    offer: null },
  { id: 'otherChart', re: /\b(compatib\w*|kundli milan|gun milan|match(ing)? (our|my|the) (kundli|chart)|will we (get|be)|are we (compatible|meant)|our (chart|kundli|horoscope))\b|\bmy (boyfriend|girlfriend|husband|wife|partner|boss|friend|mother|father|brother|sister)'?s? (chart|kundli|horoscope|future)\b/i,
    message: 'Kundli matching is on the Match page: add their birth details there for the guna milan out of 36, Mangal dosha, the 7th house, Navamsa and dasha timing for you both. Here I read only your own chart, including what you bring to a partnership.',
    offer: 'match' },
];

function boundary(question) {
  const hit = BOUNDARIES.find((b) => b.re.test(question));
  return hit ? { id: hit.id, message: hit.message, offer: hit.offer } : null;
}

// --------------------------------------------------------------------- intents
const INTENTS = [
  ['timing', /\b(when|how soon|how long|which (year|month|period|time)|by when|what time|timing|best (year|time|period|month)|dasha|next year|this year|coming (year|months?))\b/i],
  ['decision', /\b(should i|is it (a )?(good|wise|right|safe)|better to|worth|decide|deciding|choose|switch|change (my )?(job|career|field)|quit|resign|move to|invest|take (the|this)|go for)\b/i],
  ['obstacle', /\b(why (is|am|do|does|can'?t|isn'?t|aren'?t)|stuck|delay\w*|blocked|obstacle|struggl\w*|problem|not working|fail\w*|reject\w*|conflict|fight\w*|trouble|hard time|nothing works)\b/i],
  ['remedy', /\b(remed\w*|fix|improve|what can i do|what should i do|how (do|can) i|pray|puja|mantra|practice|gemstone|rudraksha|help me)\b/i],
  ['strength', /\b(good at|talent\w*|strength\w*|suit\w*|best at|gifts?|advantage\w*|potential)\b/i],
];
const INTENT_PRIORITY = ['timing', 'decision', 'obstacle', 'remedy', 'strength', 'overview'];

// Words people use in questions that the sentence lexicon in findings.js deliberately does not
// carry (they would mislabel finding text), kept here so only questions are read with them.
const QUESTION_EXTRA = {
  career: ['salary', 'boss', 'promot', 'resign', 'interview', 'startup', 'hire', 'office', 'colleague', 'workplace', 'entrepreneur'],
  money: ['rich', 'afford', 'rent', 'budget', 'profit', 'broke', 'pay', 'paid', 'wealthy'],
  marriage: ['marri', 'girlfriend', 'boyfriend', 'dating', 'proposal', 'engage', 'relationship', 'soulmate', 'single'],
  family: ['house', 'flat', 'mom', 'dad', 'kids?\\b', 'in-laws?', 'buy a home'],
  health: ['tired', 'stress', 'burn', 'fit', 'diet', 'insomnia'],
  education: ['exam', 'degree', 'college', 'universit', 'course', 'baby', 'babies', 'kid', 'pass'],
  foreign: ['visa', 'immigra', 'emigrat', 'settle abroad', 'relocat', 'move to', 'canada', 'usa', 'uk\\b', 'australia', 'dubai', 'qatar'],
  spiritual: ['god', 'temple', 'pray', 'puja', 'mantra', 'karma', 'purpose', 'peace'],
};
const EXTRA_MATCHERS = Object.fromEntries(Object.entries(QUESTION_EXTRA)
  .map(([k, terms]) => [k, terms.map((t) => new RegExp('\\b' + t, 'i'))]));

// Direct asks that name a reading outright.
const DIRECT = [
  [/\b(who am i|my personality|my nature|what am i like)\b/i, 'self.core'],
  [/\b(strengths?|good at|my talents?)\b/i, 'self.strengths'],
  [/\b(weakness\w*|weak spots?|what (do i|should i) work on)\b/i, 'self.growth'],
  [/\b(how (do )?(others|people) see me|my image|how am i (seen|perceived)|impression)\b/i, 'self.image'],
  [/\b(this year|my year|solar return|varsha|birthday year)\b/i, 'year.solar'],
  [/\b(right now|currently|current period|running dasha|mahadasha|antardasha|these days)\b/i, 'now.live'],
  [/\b(western|sun sign|zodiac|star sign|rising sign|ascendant)\b/i, 'systems.western'],
  [/\b(numerolog\w*|lucky number|driver number|conductor|mulank|bhagyank|my number)\b/i, 'systems.numbers'],
  [/\b(navamsa|d9|d-9)\b/i, 'marriage.navamsa'],
  [/\b(dashamsa|d10|d-10)\b/i, 'career.dashamsa'],
  [/\b(deit\w*|devata|which god|ishta)\b/i, 'spiritual.devata'],
];

const STOP = new Set('the a an and or of to in on for is are be my me i do does what when how why can will should it this that with at by from as about'.split(' '));
const tokens = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

function topicsOf(question) {
  const score = {};
  Findings.classify(question).forEach((x) => { score[x.topic] = (score[x.topic] || 0) + x.hits; });
  Object.entries(EXTRA_MATCHERS).forEach(([topic, res]) => {
    const hits = res.filter((re) => re.test(question)).length;
    if (hits) score[topic] = (score[topic] || 0) + hits;
  });
  return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([key, hits]) => ({ key, hits }));
}

function intentsOf(question) {
  const found = INTENTS.filter(([, re]) => re.test(question)).map(([id]) => id);
  const ordered = INTENT_PRIORITY.filter((i) => found.includes(i));
  return ordered.length ? ordered : ['overview'];
}

// ----------------------------------------------------------------- chart facts
// "What's my rashi?" is a lookup, not a reading. These questions are answered straight from the
// chart, and when the question names a sign ("is it Leo or Gemini?") the answer says where in
// this chart that sign actually appears — which is usually the source of the confusion.
const FACT_TERMS = {
  rashi: /\b(r(a|aa)a?shi|rasi|moon sign|chandra rashi)\b/i,
  lagna: /\b(lagna|lagan|ascendant|rising sign|rising)\b/i,
  nakshatra: /\b(nakshatr\w*|nakshyatra|birth star|janma tara)\b/i,
  sun: /\b(sun sign|star sign|zodiac sign|horoscope sign|my sign|which sign|what sign)\b/i,
};
// English names first, then the Sanskrit name and common Hindi/Nepali spellings.
const SIGN_ALIASES = [
  ['aries', 'mesha', 'mesh'], ['taurus', 'vrishabha', 'vrishabh', 'brish', 'brisha'], ['gemini', 'mithuna', 'mithun'],
  ['cancer', 'karka', 'kark', 'karkat'], ['leo', 'simha', 'singh', 'sinha'], ['virgo', 'kanya'], ['libra', 'tula'],
  ['scorpio', 'vrishchika', 'vrischika', 'brishchik', 'vrishchik'], ['sagittarius', 'dhanu', 'dhanus'],
  ['capricorn', 'makara', 'makar'], ['aquarius', 'kumbha', 'kumbh'], ['pisces', 'meena', 'meen'],
];

function signsNamed(question) {
  const words = new Set(String(question).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/));
  return SIGN_ALIASES.map((names, i) => (names.some((n) => words.has(n)) ? i : -1)).filter((i) => i >= 0);
}

function chartFacts(question, ctx) {
  const kinds = Object.keys(FACT_TERMS).filter((k) => FACT_TERMS[k].test(question));
  const named = signsNamed(question);
  const askingWhich = /\b(am i|is it|which|what)\b/i.test(question);
  if (!kinds.length && !(named.length && askingWhich)) return null;
  // A question about a life area ("what does my rashi say about my career") is a reading, not a lookup.
  if (topicsOf(question).length) return null;

  const { chart, western } = ctx;
  const en = (i) => WESTERN_SIGNS[i];
  const both = (i) => VEDIC_SIGNS[i] + ' (' + en(i) + ')';
  const moon = chart.planets.find((p) => p.name === 'Moon');
  const sun = chart.planets.find((p) => p.name === 'Sun');
  const asc = chart.ascendant;
  const nak = chart.nakshatra;
  const wIndex = (name) => WESTERN_SIGNS.indexOf(name);
  const W = western.bigThree;

  const points = [];
  let headline;
  const main = kinds[0] || 'sign';
  if (main === 'rashi' || main === 'sign') {
    headline = 'Your rashi is ' + moon.sign + ' — that is ' + en(moon.signIndex) + '.';
    points.push('In Vedic astrology your rashi is the sign the Moon was in when you were born. Yours was at ' + Math.floor(moon.degree) + '° ' + moon.sign + ', in ' + nak.name + ' nakshatra.');
  } else if (main === 'lagna') {
    headline = 'Your lagna is ' + both(asc.signIndex) + '.';
    points.push('The lagna is the sign that was rising in the east at the moment you were born. It sets your twelve houses and how you come across to people.');
    if (W.rising !== en(asc.signIndex)) points.push('Western astrology puts your rising sign in ' + W.rising + ', because it uses a zodiac shifted about 24° from the Vedic one.');
  } else if (main === 'nakshatra') {
    headline = 'Your janma nakshatra is ' + nak.name + ', pada ' + nak.pada + '.';
    points.push('It is the lunar mansion your Moon was in at birth, ruled by ' + nak.lord + '. Your dasha periods start from it.');
  } else {
    headline = 'In Western astrology you are a ' + W.sun + '. In Indian astrology "your sign" usually means your rashi, which is ' + both(moon.signIndex) + '.';
    points.push('Western horoscopes go by the Sun sign. Vedic astrology uses a zodiac shifted about 24°, which puts your Sun in ' + both(sun.signIndex) + ' and reads you mainly by your Moon: your rashi.');
  }

  // Say where every sign the person named turns up in this chart.
  named.filter((i) => !(main === 'rashi' || main === 'sign') || i !== moon.signIndex).forEach((i) => {
    const where = [];
    if (moon.signIndex === i) where.push('your rashi');
    if (asc.signIndex === i) where.push('your lagna');
    if (sun.signIndex === i) where.push('your Sun sign in Vedic astrology');
    if (wIndex(W.sun) === i) where.push('your Western Sun sign');
    if (wIndex(W.rising) === i) where.push('your Western rising sign');
    if (wIndex(W.moon) === i) where.push('your Moon sign in Western astrology');
    const list = where.length < 2 ? where.join('') : where.slice(0, -1).join(', ') + ' and ' + where.at(-1);
    points.push(where.length
      ? en(i) + ' (' + VEDIC_SIGNS[i] + ') is ' + list + ' — that is probably where you have seen it.'
      : en(i) + ' (' + VEDIC_SIGNS[i] + ') is not your rashi, your lagna or your Sun sign in either system.');
  });

  return {
    kind: 'fact', question,
    headline, points,
    facts: [
      { label: 'Rashi (Moon sign)', value: both(moon.signIndex) },
      { label: 'Lagna (rising)', value: both(asc.signIndex) },
      { label: 'Nakshatra', value: nak.name + ' pada ' + nak.pada },
      { label: 'Sun sign — Vedic', value: both(sun.signIndex) },
      { label: 'Sun sign — Western', value: W.sun },
    ],
    links: [{ href: '/kundli', label: 'Your kundli' }],
    highlights: { houses: [1, moon.house], planets: ['Moon'] },
  };
}

// --------------------------------------------------------------------- routing
function route(question, { focus = [] } = {}) {
  const topics = topicsOf(question).slice(0, 2);
  const intents = intentsOf(question);
  const qTokens = new Set(tokens(question));
  const direct = DIRECT.filter(([re]) => re.test(question)).map(([, id]) => id);
  const topicKeys = topics.map((t) => t.key);

  const scored = Submodels.SUBMODELS.map((m) => {
    let score = 0;
    const why = [];
    if (direct.includes(m.id)) { score += 6; why.push('you named it'); }
    const ti = topicKeys.indexOf(m.topic);
    if (m.topic && ti >= 0) { score += ti === 0 ? 4 : 2.5; why.push(`about ${m.group}`); }
    const shared = m.intents.filter((i) => intents.includes(i));
    if (shared.length && (ti >= 0 || direct.includes(m.id))) { score += 2 * shared.length; why.push(`answers a ${shared[0]} question`); }
    if (intents.includes('timing') && m.timing && ti >= 0) { score += 3; }
    const overlap = tokens(`${m.title} ${m.question}`).filter((w) => qTokens.has(w)).length;
    if (overlap && score > 0) { score += Math.min(2, overlap * 0.7); }
    if (score > 0 && focus.includes(m.topic)) score += 0.5;
    return { id: m.id, score, why };
  }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score);

  return { topics, intents, direct, models: scored.slice(0, 4) };
}

// ------------------------------------------------------------------- answering
const fmt = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function timingHeadline(w, topicName) {
  const live = w.stretches.find((s) => s.current && s.level !== 'quiet');
  const peaks = w.stretches.filter((s) => s.level === 'peak');
  const best = [...peaks].sort((a, b) => b.score - a.score)[0] || w.stretches.filter((s) => s.level === 'active')[0];
  if (live && best && live.start === best.start) {
    return `You are in your most active stretch for ${topicName} right now, until ${fmt(live.end)}.`;
  }
  if (best) {
    return `${live ? `You are in an active stretch for ${topicName} until ${fmt(live.end)}, and ` : ''}the most active period in the next twelve years starts ${fmt(best.start)} and runs to ${fmt(best.end)}.`.replace(/^(.)/, (c) => c.toUpperCase());
  }
  return `No stretch in the next twelve years stands out for ${topicName}; it stays steady rather than peaking.`;
}

/**
 * Answer one question. `ctx` is a sub-model context; `focus` the person's chosen topics.
 * Returns a boundary reply, a "tell me more" reply, or an answer built from sub-models.
 */
function answer(question, ctx, { focus = [] } = {}) {
  const q = String(question || '').trim().slice(0, 300);
  if (!q) return { kind: 'empty' };

  const b = boundary(q);
  if (b) return { kind: 'boundary', question: q, ...b };

  const fact = chartFacts(q, ctx);
  if (fact) return fact;

  const r = route(q, { focus });
  const catalog = Submodels.SUBMODELS;
  const suggestions = (keys) => catalog.filter((m) => keys.includes(m.topic || m.group)).slice(0, 4)
    .map((m) => ({ id: m.id, title: m.title, question: m.question }));

  if (!r.models.length) {
    const keys = focus.length ? focus : ['career', 'marriage', 'money'];
    return { kind: 'unclear', question: q,
      message: 'I could not tell which part of your chart this is about. Try naming the area (work, money, relationships, home, energy, study, travel, inner life) or pick one of these.',
      suggestions: suggestions(keys) };
  }

  const runs = r.models.map((m) => Submodels.run(m.id, ctx));
  const primary = r.intents[0];
  const topic = r.topics[0]?.key || runs[0].topic;
  const topicName = Findings.TOPICS.find((t) => t.key === topic)?.name.toLowerCase() || 'this';
  const timingRun = runs.find((x) => x.windows) || (topic && ['career', 'money', 'marriage', 'foreign'].includes(topic) ? Submodels.run(`${topic}.timing`, ctx) : null);

  // Findings are de-duplicated across everything routed to, strongest first.
  const seen = new Set();
  // When someone names a reading outright ("my Sun sign", "my numbers"), answer from it first.
  const named = r.direct.length ? runs.filter((x) => r.direct.includes(x.id)) : [];
  const source = named.length ? named : runs;
  const pool = source.flatMap((x) => x.findings).sort((a, b) => b.power - a.power).filter((f) => !seen.has(f.id) && seen.add(f.id));
  const live = Submodels.run('now.live', ctx).findings[0];
  const sections = [];
  const take = (kinds, n) => pool.filter((f) => kinds.includes(f.kind)).slice(0, n);

  let headline;
  if (primary === 'timing' && timingRun?.windows) {
    headline = timingHeadline(timingRun.windows, topicName);
    sections.push({ label: 'Why these stretches', findings: pool.slice(0, 3) });
  } else if (primary === 'decision') {
    headline = `A chart cannot make this decision for you. Here is what it weighs on ${topicName}.`;
    sections.push({ label: 'What supports it', findings: take(['strength', 'pattern'], 2) });
    sections.push({ label: 'What needs care', findings: take(['challenge'], 2) });
    if (live) sections.push({ label: 'What is live right now', findings: [live] });
  } else if (primary === 'obstacle') {
    const hard = take(['challenge'], 3);
    headline = hard[0] ? hard[0].sentence : `Nothing in your chart points to a specific block in ${topicName}.`;
    sections.push({ label: 'What is in the way', findings: hard });
    sections.push({ label: 'What is working for you', findings: take(['strength'], 2) });
  } else if (primary === 'remedy') {
    const acts = runs.flatMap((x) => x.actions);
    headline = acts[0] ? `The practice your chart points to first is ${acts[0].planet}'s: ${acts[0].tiny}` : 'There is no practice your chart singles out here.';
    sections.push({ label: 'What is behind it', findings: pool.slice(0, 3) });
  } else {
    headline = pool[0]?.sentence || runs[0].summary || 'Here is what your chart says.';
    sections.push({ label: primary === 'strength' ? 'What works for you' : 'What your chart says', findings: pool.slice(0, 4) });
  }

  // Actions: at most two practices, de-duplicated by planet, always tied to what was just read.
  const actions = [];
  runs.flatMap((x) => x.actions).forEach((a) => { if (!actions.some((y) => y.planet === a.planet)) actions.push(a); });

  const houses = [...new Set(runs.flatMap((x) => x.highlights.houses))].slice(0, 6);
  const planets = [...new Set(runs.flatMap((x) => x.highlights.planets))];
  const used = new Set(runs.map((x) => x.id));
  const followups = catalog.filter((m) => (m.topic === topic || r.models.some((x) => x.id === m.id)) && !used.has(m.id)).slice(0, 4)
    .map((m) => ({ id: m.id, title: m.title, question: m.question }));

  return {
    kind: 'answer', question: q,
    understood: {
      topics: r.topics.map((t) => ({ key: t.key, name: Findings.TOPICS.find((x) => x.key === t.key)?.name })),
      intent: primary, intents: r.intents,
      text: `I read this as ${/^[aeiou]/i.test(primary === 'overview' ? 'general' : primary) ? 'an' : 'a'} ${primary === 'overview' ? 'general' : primary} question about ${r.topics.length ? r.topics.map((t) => Findings.TOPICS.find((x) => x.key === t.key)?.name.toLowerCase()).join(' and ') : r.models[0] && Submodels.byId[r.models[0].id].title.toLowerCase()}.`,
    },
    headline, sections: sections.filter((s) => s.findings.length),
    windows: timingRun?.windows && (primary === 'timing' || r.intents.includes('timing')) ? timingRun.windows : null,
    actions: actions.slice(0, 2), highlights: { houses, planets },
    models: r.models.map((m) => ({ id: m.id, title: Submodels.byId[m.id].title, why: m.why })), followups,
    caution: primary === 'timing' ? timingRun?.windows?.caution || null : null,
  };
}

module.exports = { answer, route, boundary, chartFacts, topicsOf, intentsOf, BOUNDARIES };
