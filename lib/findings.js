/*
 * FINDINGS — the one model every reading passes through.
 *
 * Before this, each page told its own story from its own template: the daily
 * reading came from one table, the kundli panels from another, the year page
 * from a third. Nothing was comparable and nothing was ranked. This module
 * replaces that with a single unit and a single score.
 *
 *   FLOW       chart -> indicators -> FINDINGS -> render
 *   UNIT       one finding = ONE sentence making ONE claim about ONE area of life
 *   SCORE      power, 0-100, from five components, identical for every reading
 *   SEGMENT    the user picks up to three topics, in order; that choice reweights
 *              and filters findings but never changes their power
 *
 * Why sentences. A paragraph such as "Saturn brings delay to work. It is
 * debilitated here. Results come through pressure." carries three claims with
 * three different weights. Dismantling it lets the page show the one that
 * matters and drop the filler, which is what "quality over quantity" means in
 * practice: fewer lines, each one earned.
 *
 * Why one power model. A finding about Saturn and a finding about the 7th house
 * are scored with the same five components, so any two readings are directly
 * comparable and any change to the weights changes every reading at once.
 * The weights live in WEIGHTS below and nowhere else.
 *
 * Findings keep a `basis` list of indicator ids from lib/indicators.js, so a
 * sentence can always be traced back to the measurements it rests on.
 */

const { SIGN_LORDS, VEDIC_SIGNS } = require('./astro');
const { LIFE_AREAS, REMEDIES, arudhaLagna, PUBLIC_IMAGE } = require('./lenses');
const { BHAVAS, ASPECT_MODE, ordinal } = require('./bhava');
const { PLANETS, interpret } = require('./interpret');
const Divisional = require('./divisional');
const { ELEMENT_TRAIT } = require('./western');

const MODEL_VERSION = 2;

// ------------------------------------------------------------ the one score
// Five components, each 0-1, combined by fixed weights that sum to 1.
const WEIGHTS = {
  salience: 0.28,       // how far the planet involved sits from unremarkable (very strong OR very weak)
  house: 0.18,          // how much weight the house carries in any chart
  activation: 0.28,     // is it live now: running dasha, this year's muntha, slow transits
  convergence: 0.16,    // how many separate factors land on the same house
  actionability: 0.10,  // is there something the person can actually do about it
};

const BASELINE_ACTIVATION = 0.15; // natal promise always counts for something
const ROLE_FACTOR = { claim: 1, detail: 0.85 }; // later sentences of a source rank under its first
// Vedic is the primary system here; the others are cross-views and carry a lower prior.
const SYSTEM_FACTOR = { vedic: 1, western: 0.8, numbers: 0.7 };
const MIN_POWER = 45;         // below this a sentence is not worth a person's attention
const PER_TOPIC = 4;          // quality gate: at most this many findings per chosen topic
const PER_SOURCE = 2;         // and at most this many sentences from any one source
const FOCUS_WEIGHT = [1, 0.8, 0.6]; // first choice counts fully, third choice a little less
const MAX_FOCUS = FOCUS_WEIGHT.length;

// ------------------------------------------------------------------ topics
// One taxonomy, shared with the life-area lens. Nothing is defined twice.
const TOPICS = LIFE_AREAS.map((a) => ({ key: a.key, name: a.name }));

const TOPIC_BLURB = {
  career: 'Work, standing, and what you are building',
  money: 'Earning, saving, and what actually stays',
  marriage: 'A partner, commitment, how you pair',
  family: 'Home, parents, siblings, and peace of mind',
  health: 'Energy, routine and stamina',
  education: 'Learning, creativity and children',
  foreign: 'Distance, travel and living elsewhere',
  spiritual: 'Meaning, practice and letting go',
};

// house -> topics, derived from LIFE_AREAS. A house sits nearer the heart of an
// area the earlier it appears in that area's list, so the first entry is primary.
const HOUSE_TOPICS = Object.fromEntries(Array.from({ length: 12 }, (_, i) => {
  const h = i + 1;
  const keys = LIFE_AREAS
    .map((a, order) => ({ key: a.key, rank: a.houses.indexOf(h), order }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((x) => x.key);
  return [h, keys];
}));

// planet -> topics it is a natural significator of
const PLANET_TOPICS = {};
LIFE_AREAS.forEach((a) => a.planets.forEach((p) => { (PLANET_TOPICS[p] ||= []).push(a.key); }));

// ----------------------------------------------------------------- what a sentence is about
// A finding's house says where it plays out; its sentence says what it is actually
// about. "Promises you make have weight" sits in the 12th house but is about commitment,
// not travel. So each sentence is read for the topics it names, and only falls back to
// its house when it names none. Terms are regex stems matched at a word start; a trailing
// ~ means the word must also end there.
const TOPIC_TERMS = {
  career: ['work', 'career', 'profession', 'job', 'employ', 'service', 'status', 'reputation', 'authority', 'promotion',
    'recogni', 'standing', 'leader', 'public', 'business', 'superior', 'rival', 'compet', 'ambition', 'known for'],
  money: ['money', 'income', 'earn', 'saving', 'wealth', 'gains?~', 'financ', 'invest', 'cash', 'debt', 'loan', 'expens', 'spend', 'prosper'],
  marriage: ['marriage', 'spouse', 'partner', 'relationship', 'romance', 'romantic', 'wedding', 'commit', 'husband', 'wife', 'love~'],
  family: ['home~', 'mother', 'father', 'parent', 'family', 'sibling', 'brother', 'sister', 'property', 'land~', 'vehicle', 'belong', 'peace of mind', 'roots'],
  health: ['health', 'body', 'energy', 'vitality', 'stamina', 'routine', 'sleep', 'constitution', 'physical'],
  education: ['learn', 'study', 'school', 'teach', 'educat', 'student', 'knowledge', 'creativ', 'child', 'writ', 'intelligen', 'skill', 'mantra'],
  foreign: ['foreign', 'abroad', 'travel', 'journey', 'distance', 'overseas', 'migrat', 'pilgrim', 'trip'],
  spiritual: ['spiritual', 'meditat', 'practice', 'faith', 'belief', 'guru', 'meaning', 'dharma', 'solitude', 'letting go', 'moksha', 'liberation', 'detach', 'religio'],
};
const TOPIC_MATCHERS = Object.fromEntries(Object.entries(TOPIC_TERMS)
  .map(([k, terms]) => [k, terms.map((t) => new RegExp('\\b' + t.replace(/~/g, '\\b'), 'i'))]));

/** Topics a sentence names, strongest first: [{ topic, hits }]. */
function classify(sentence) {
  return Object.entries(TOPIC_MATCHERS)
    .map(([topic, res]) => ({ topic, hits: res.filter((re) => re.test(sentence)).length }))
    .filter((x) => x.hits > 0);
}

// ----------------------------------------------------------- components
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round2 = (x) => Math.round(x * 100) / 100;

// Planet strength is 0-10 with 5.5 about unremarkable; 3.5 or 7.5 is as salient as it gets.
const salience = (score) => clamp01(Math.abs(score - 5.5) / 2);

// House weight comes straight from the bhava dictionary's classification flags.
const houseWeight = (h) => {
  const b = BHAVAS[h - 1];
  return clamp01(0.4 + (b.angular === 'kendra' ? 0.3 : 0) + (b.isTrikona ? 0.3 : 0)
    + (b.isUpachaya ? 0.1 : 0) + (b.isDusthana ? 0.1 : 0));
};

function liveContext(chart, dasha, year) {
  const slow = year ? year.transits.list : [];
  return {
    maha: dasha?.current?.lord || null,
    antar: dasha?.currentAntar?.lord || null,
    muntha: year?.muntha?.house || null,
    transitHouses: new Set(slow.map((t) => t.houseFromLagna)),
    ascIndex: chart.ascendant.signIndex,
  };
}

function activationOf(live, planet, house) {
  let a = BASELINE_ACTIVATION;
  if (planet === live.maha) a = Math.max(a, 1);
  else if (planet === live.antar) a = Math.max(a, 0.7);
  if (house) {
    if (live.muntha === house) a = Math.max(a, 0.7);
    if (live.transitHouses.has(house)) a = Math.max(a, 0.6);
    const lord = SIGN_LORDS[(live.ascIndex + house - 1) % 12];
    if (lord === live.maha) a = Math.max(a, 0.9);
    else if (lord === live.antar) a = Math.max(a, 0.6);
  }
  return a;
}

// ----------------------------------------------------------- sentences
/** Split prose into sentences without breaking on decimals, degrees or "5.8/10". */
function dismantle(text) {
  return String(text).split(/(?<=[.!?])\s+(?=[A-Z“"‘'])/).map((s) => s.trim()).filter(Boolean);
}

const kindFromScore = (score) => (score >= 7 ? 'strength' : score < 5 ? 'challenge' : 'pattern');

function actionFor(planet) {
  const r = REMEDIES[planet];
  return r ? { planet, text: r.do, day: r.day } : null;
}

// ----------------------------------------------------------- generators
/**
 * Every generator hands `emit` the same shape; `emit` is the only place a
 * score is computed, which is what keeps the model single.
 */
function buildFindings({ chart, dasha, strengths, year = null, western = null, numerology = null, visibleTiers = ['open', 'guarded'] }) {
  const live = liveContext(chart, dasha, year);
  const detail = interpret(chart, dasha, { visibleTiers });
  const houseInfo = Object.fromEntries(detail.houses.map((h) => [h.house, h]));
  const out = [];
  out.droppedFootnotes = 0; // footnote sentences that could not stand alone, counted for transparency

  const convergenceOf = (house) => (house ? clamp01((houseInfo[house]?.activity || 0) / 4) : 0);

  /**
   * source    stable id of the thing the sentences came from
   * sentences already-split array, or a single string
   * planet    the principal graha (drives salience, activation, the action)
   * house     the principal house, or null for planet-only findings
   */
  function emit({ source, sentences, planet, house = null, kind, tier = 'open', horizon = 'life',
    basis = [], liveOverride = 0, wantsAction = null, topics = null, subjects = null, system = 'vedic', convergence = null }) {
    const split = Array.isArray(sentences) ? sentences : dismantle(sentences);
    const names = subjects || [planet];
    // A footnote sentence is kept only if it stands on its own. A leading "It" is resolved to
    // the planet; anything that still names no subject ("Strain shows here first.") is dropped,
    // because on its own it would read as noise. The claim sentence always stays.
    const list = split.map((s, i) => {
      if (i === 0) return s;
      const resolved = s.replace(/^It\b/, planet).replace(/^Its\b/, `${planet}'s`);
      return names.some((n) => resolved.includes(n)) ? resolved : null;
    });
    out.droppedFootnotes += list.filter((s) => s === null).length;

    const strength = strengths[planet];
    const band = strength?.band;
    const action = (wantsAction ?? (band === 'strained' || band === 'weak' || planet === live.maha || planet === live.antar))
      ? actionFor(planet) : null;

    // Structural topics: where it plays out. House-derived first, then what the planet signifies.
    const structural = topics || [...(house ? HOUSE_TOPICS[house] : []),
      ...(PLANET_TOPICS[planet] || []).filter((t) => !(house && HOUSE_TOPICS[house].includes(t)))];
    const houseCount = topics ? topics.length : (house ? HOUSE_TOPICS[house].length : 0);
    const rank = (t) => { const i = structural.indexOf(t); return i < 0 ? 99 : i; };

    let claimTopics = null;
    list.forEach((sentence, i) => {
      if (sentence === null) return;
      const role = i === 0 ? 'claim' : 'detail';

      // What the sentence is actually about decides its topic; the house is only the fallback.
      const named = classify(sentence)
        .sort((a, b) => b.hits - a.hits || rank(a.topic) - rank(b.topic) || TOPICS.findIndex((t) => t.key === a.topic) - TOPICS.findIndex((t) => t.key === b.topic))
        .slice(0, 3).map((x) => x.topic);
      let ordered, relevance, topicBasis;
      if (named.length) {
        ordered = named; topicBasis = 'sentence';
        relevance = Object.fromEntries(ordered.map((t, k) => [t, k === 0 ? 1 : 0.8]));
      } else if (i > 0 && claimTopics) {
        // a footnote belongs where its claim belongs
        ({ ordered, relevance } = claimTopics); topicBasis = 'claim';
      } else {
        ordered = structural; topicBasis = 'house';
        relevance = Object.fromEntries(ordered.map((t, k) => [t, k === 0 ? 1 : k < houseCount ? 0.75 : 0.6]));
      }
      if (i === 0) claimTopics = { ordered, relevance };

      const components = {
        salience: round2(strength ? salience(strength.score) : 0),
        house: round2(house ? houseWeight(house) : 0.4),
        activation: round2(Math.max(activationOf(live, planet, house), liveOverride)),
        convergence: round2(convergence ?? convergenceOf(house)),
        actionability: action ? 1 : 0,
      };
      const raw = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * components[k], 0);
      out.push({
        id: `${source}#${i}`, source, role, sentence, kind: kind || kindFromScore(strength?.score ?? 5.5),
        topic: ordered[0] || 'spiritual', topics: ordered, relevance, topicBasis,
        planet, house, horizon, tier, basis, components,
        system, power: Math.round(100 * raw * ROLE_FACTOR[role] * SYSTEM_FACTOR[system]),
        action: i === 0 ? action : null, // the action belongs to the claim, not to its footnotes
      });
    });
  }

  // 1. what each graha does where it sits
  detail.placements.forEach((p) => emit({
    source: `placement.${p.planet}`, sentences: p.text, planet: p.planet, house: p.house,
    kind: kindFromScore(p.strength.score), basis: [`graha.${p.planet}.house`, `graha.${p.planet}.strength`],
  }));

  // 2. the bhava-lord chain — where each house's ruler sits ties two areas together
  detail.houses.forEach((h) => h.chain && emit({
    source: `lord.h${h.house}`, sentences: [h.chain], planet: h.lord, house: h.house,
    kind: kindFromScore(h.lordScore ?? 5.5), basis: [`bhava.${h.house}.lord`, `bhava.${h.house}.lord_house`],
  }));

  // 3. drishti — influence from a distance, one sentence per aspect
  detail.houses.forEach((h) => h.aspectedBy.forEach((a) => {
    const mode = ASPECT_MODE[a.planet];
    emit({
      source: `drishti.${a.planet}.h${h.house}`,
      sentences: `${a.planet} looks at your ${ordinal(h.house)} house (${h.name.toLowerCase()}) from house ${a.from} and ${mode.effect}.`,
      planet: a.planet, house: h.house,
      kind: a.protective ? 'strength' : ['Saturn', 'Mars', 'Rahu', 'Ketu'].includes(a.planet) ? 'challenge' : 'pattern',
      basis: [`bhava.${h.house}.aspect_count`, `graha.${a.planet}.aspects.${a.count}`],
    });
  }));

  // 4. conjunctions and yogas — named configurations
  detail.conjunctions.forEach((c) => emit({
    source: `conj.${[...c.pair].sort().join('_')}`, sentences: c.text, planet: c.pair[0], house: c.house, subjects: c.pair,
    tier: c.tier, kind: kindFromScore((strengths[c.pair[0]].score + strengths[c.pair[1]].score) / 2),
    basis: [`conj.${[...c.pair].sort().join('_')}`],
  }));
  detail.yogas.forEach((y) => {
    const planet = y.id === 'strongest' ? y.name.split(' ')[0] : 'Jupiter';
    const home = chart.planets.find((p) => p.name === planet);
    emit({ source: `yoga.${y.id}`, sentences: y.text, planet, house: home ? home.house : null,
      tier: y.tier, kind: y.id === 'guru-chandal' ? 'challenge' : 'strength', basis: [`graha.${planet}.strength`] });
  });

  // 5. what is live now — the running dasha, and the year's slow movers
  const when = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  if (dasha?.current) {
    const l = dasha.current.lord;
    const home = chart.planets.find((p) => p.name === l);
    emit({ source: 'timing.maha', planet: l, house: home?.house || null, kind: 'timing', horizon: 'period',
      sentences: [`You are in the ${l} mahadasha until ${when(dasha.current.end)}, so ${PLANETS[l].karaka} are the themes that keep returning.`],
      basis: ['dasha.maha.lord', 'dasha.maha.end'], wantsAction: true });
  }
  if (dasha?.currentAntar) {
    const l = dasha.currentAntar.lord;
    const home = chart.planets.find((p) => p.name === l);
    emit({ source: 'timing.antar', planet: l, house: home?.house || null, kind: 'timing', horizon: 'period',
      sentences: [`Inside it, the ${l} antardasha (to ${when(dasha.currentAntar.end)}) is the immediate chapter, bringing ${PLANETS[l].quality}.`],
      basis: ['dasha.antar.lord'], wantsAction: true });
  }
  if (year) {
    emit({ source: 'timing.muntha', planet: year.muntha.lord, house: year.muntha.house, kind: 'timing', horizon: 'year',
      sentences: [`Your muntha sits in the ${ordinal(year.muntha.house)} house this year, so ${BHAVAS[year.muntha.house - 1].summary} is where the year puts its weight.`],
      basis: ['varsha.muntha.house', 'varsha.muntha.lord'] });
    year.transits.list.forEach((t) => {
      const mode = ASPECT_MODE[t.planet];
      emit({ source: `timing.transit.${t.planet}`, planet: t.planet, house: t.houseFromLagna, kind: 'timing',
        horizon: 'year', liveOverride: 0.8,
        sentences: `Transiting ${t.planet} is in your ${ordinal(t.houseFromLagna)} house (${BHAVAS[t.houseFromLagna - 1].name.toLowerCase()}), where it ${mode.effect}.`,
        basis: [`transit.${t.planet}.house_lagna`] });
    });
    if (year.transits.sadeSati.active) {
      emit({ source: 'timing.sadesati', planet: 'Saturn', house: null, kind: 'timing', horizon: 'year', liveOverride: 0.9,
        sentences: year.transits.sadeSati.text, topics: PLANET_TOPICS.Moon, basis: ['transit.sadesati'] });
    }
  }

  // 6. divisional charts: the tradition's second opinion on what the birth chart promises
  const div = Divisional.all(chart);
  const natalHouse = (name) => chart.planets.find((p) => p.name === name)?.house || null;
  const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
  const verdict = (d) => (d === 'debilitated' ? 'challenge' : 'strength');
  const notable = (d) => ['exalted', 'own sign', 'debilitated'].includes(d);

  div.D9.planets.filter((p) => p.vargottama).forEach((p) => emit({
    source: `div.D9.vargottama.${p.name}`, planet: p.name, house: natalHouse(p.name), kind: 'strength',
    sentences: [`${p.name} is vargottama: it holds ${p.sign} in both your birth chart and your navamsa, which the tradition reads as a doubling of its strength.`],
    basis: [`div.D9.${p.name}.vargottama`],
  }));

  const venus9 = div.D9.planets.find((p) => p.name === 'Venus');
  if (notable(venus9.dignity)) {
    emit({ source: 'div.D9.venus', planet: 'Venus', house: natalHouse('Venus'), kind: verdict(venus9.dignity),
      sentences: [venus9.dignity === 'debilitated'
        ? 'Venus, the main significator of partnership, is debilitated in your navamsa, so relationships ask for more conscious effort than the birth chart alone suggests.'
        : `Venus, the main significator of partnership, is ${venus9.dignity} in your navamsa, which supports whatever your 7th house promises.`],
      basis: ['div.D9.Venus.dignity'] });
  }
  const lord7 = SIGN_LORDS[(chart.ascendant.signIndex + 6) % 12];
  const lord7in9 = div.D9.planets.find((p) => p.name === lord7);
  if (lord7in9 && notable(lord7in9.dignity)) {
    emit({ source: 'div.D9.lord7', planet: lord7, house: 7, kind: verdict(lord7in9.dignity),
      sentences: [lord7in9.dignity === 'debilitated'
        ? `Your 7th lord ${lord7} is debilitated in your navamsa, so partnership needs patience and deliberate effort to hold its promise.`
        : `Your 7th lord ${lord7} is ${lord7in9.dignity} in your navamsa, so the promise of partnership holds up under a closer look.`],
      basis: [`div.D9.${lord7}.dignity`] });
  }
  const in10 = div.D10.planets.filter((p) => p.house === 10).map((p) => p.name);
  if (in10.length) {
    emit({ source: 'div.D10.house10', planet: in10[0], house: 10, subjects: in10, kind: 'pattern',
      sentences: [`Your dashamsa, the career chart, places ${listed(in10)} in its 10th house, so ${in10.length > 1 ? 'those planets carry' : 'that planet carries'} the weight of your public work.`],
      basis: [`div.D10.${in10[0]}.sign`] });
  }
  const lord10 = SIGN_LORDS[(chart.ascendant.signIndex + 9) % 12];
  const lord10in10 = div.D10.planets.find((p) => p.name === lord10);
  if (lord10in10 && notable(lord10in10.dignity)) {
    emit({ source: 'div.D10.lord10', planet: lord10, house: 10, kind: verdict(lord10in10.dignity),
      sentences: [lord10in10.dignity === 'debilitated'
        ? `Your 10th lord ${lord10} is debilitated in your dashamsa, so your standing at work is built through steady effort rather than handed to you.`
        : `Your 10th lord ${lord10} is ${lord10in10.dignity} in your dashamsa, which supports your standing at work.`],
      basis: [`div.D10.${lord10}.dignity`] });
  }

  // 7. Western astrology: a cross-view on the same person, labelled as such
  if (western) {
    ['sun', 'moon'].forEach((key) => {
      const planet = key === 'sun' ? 'Sun' : 'Moon';
      emit({ source: `west.${key}`, system: 'western', planet, kind: 'pattern', basis: [`west.${key}.sign`],
        sentences: [`Western astrology places your ${planet} in ${western[key].sign}: ${western[key].trait}.`] });
    });
    emit({ source: 'west.rising', system: 'western', planet: western.chartRuler.traditional, kind: 'pattern', basis: ['west.rising.sign'],
      sentences: [`Your Western rising sign is ${western.rising.sign}: ${western.rising.trait}.`] });
    emit({ source: 'west.ruler', system: 'western', planet: western.chartRuler.traditional, kind: 'pattern', basis: ['west.chart_ruler.planet'],
      sentences: [western.chartRuler.text] });
    emit({ source: 'west.love', system: 'western', planet: 'Venus', kind: 'pattern', basis: ['west.love_language.element'],
      sentences: [western.loveLanguage.text.split('. ')[0].replace(/\.$/, '') + '.'] });
    const b = western.balance;
    b.predominantElement.forEach((el) => emit({ source: `west.element.${el}`, system: 'western', planet: 'Moon', kind: 'pattern',
      basis: [`west.balance.element.${el.toLowerCase()}`],
      sentences: [`${el} predominates in your Western chart (${b.element[el]} of ${b.total}): ${ELEMENT_TRAIT[el]}.`] }));
    b.weakestElement.forEach((el) => emit({ source: `west.missing.${el}`, system: 'western', planet: 'Moon', kind: 'challenge',
      basis: [`west.balance.element.${el.toLowerCase()}`],
      sentences: [`${el} is almost absent from your Western chart (${b.element[el] || 0} of ${b.total}), so its qualities are ones you build deliberately rather than inherit.`] }));
    western.aspects.filter((a) => a.toAngle && a.major && a.exactness >= 50).slice(0, 2).forEach((a) => emit({
      source: `west.angle.${a.pair[0]}`, system: 'western', planet: a.pair[0], kind: a.harmony === 'challenging' ? 'challenge' : 'pattern',
      basis: [`west.aspect.${[...a.pair].sort().join('_').toLowerCase()}.exactness`],
      sentences: [`In Western astrology ${a.pair[0]} forms a ${a.name} with your Ascendant (${a.exactness}% exact): ${a.meaning}`] }));
  }

  // 8. numerology, joined to the chart through the graha each number belongs to
  if (numerology) {
    [['driver', numerology.driver], ['conductor', numerology.conductor]].forEach(([key, x]) => {
      emit({ source: `num.${key}`, system: 'numbers', planet: x.planet, kind: 'pattern', basis: [`num.${key}`],
        sentences: [`Your ${key} number is ${x.value} (${x.planet}): ${x.trait}`] });
      // When the number's planet is also the planet running now, two systems point at one place.
      const running = x.planet === live.maha ? 'mahadasha' : x.planet === live.antar ? 'antardasha' : null;
      if (running) {
        emit({ source: `num.${key}.agrees`, system: 'numbers', planet: x.planet, kind: 'timing', horizon: 'period',
          convergence: 1, liveOverride: 1, basis: [`num.${key}`, 'dasha.maha.lord'],
          sentences: [`Numerology and your dasha agree: your ${key} number belongs to ${x.planet}, and ${x.planet} is running your ${running}, so its themes carry double emphasis right now.`] });
      }
    });
    if (numerology.resonance) {
      emit({ source: 'num.resonance', system: 'numbers', planet: numerology.driver.planet, kind: 'pattern', basis: ['num.driver', 'num.conductor'],
        sentences: [numerology.resonance] });
    }
  }

  // 9. how the world reads you: the arudha lagna, one sentence per planet shaping the image
  const arudha = arudhaLagna(chart);
  if (arudha) {
    arudha.influences.filter((pl) => PUBLIC_IMAGE[pl]).forEach((pl) => emit({
      source: `arudha.${pl}`, planet: pl, house: arudha.house, kind: 'pattern',
      sentences: [`The world reads you through ${pl}: ${PUBLIC_IMAGE[pl]}`],
      basis: ['point.arudha.house', 'point.arudha.sign'],
    }));
  }
  return out;
}

// --------------------------------------------------------------- ranking
/**
 * How closely a finding belongs to a topic. A sentence that names topics belongs to those
 * (1 for the main one, 0.8 for others); one that names none falls back to its house
 * (1 primary, 0.75 other house topics, 0.6 planet-derived).
 */
const relevance = (f, topic) => f.relevance[topic] || 0;

const shape = (f, priority) => ({
  id: f.id, source: f.source, role: f.role, sentence: f.sentence, kind: f.kind, topic: f.topic,
  topics: f.topics, topicBasis: f.topicBasis, system: f.system, planet: f.planet, house: f.house, horizon: f.horizon, tier: f.tier,
  power: f.power, priority: Math.round(priority), action: f.action, components: f.components, basis: f.basis,
});

/**
 * The same remedy repeated under five sentences is noise, not guidance. Within one
 * list, only the first finding for a planet keeps its action; the rest still count
 * toward the ranking but do not repeat the instruction.
 */
function spreadActions(list) {
  const seen = new Set();
  return list.map((f) => {
    if (!f.action) return f;
    if (seen.has(f.action.planet)) return { ...f, action: null, actionShownAbove: f.action.planet };
    seen.add(f.action.planet);
    return f;
  });
}

/**
 * Apply one person's priorities. `power` never changes here; only the order and
 * the selection do. Each finding appears under the first chosen topic that claims it.
 */
function forUser(findings, topics = [], { minPower = MIN_POWER, perTopic = PER_TOPIC, perSource = PER_SOURCE } = {}) {
  const chosen = topics.filter((t) => TOPICS.some((x) => x.key === t)).slice(0, MAX_FOCUS);
  const eligible = findings.filter((f) => f.power >= minPower);

  const take = (pool, score, limit) => {
    const perSrc = {};
    const picked = [];
    for (const f of pool.sort((a, b) => score(b) - score(a))) {
      if ((perSrc[f.source] || 0) >= perSource) continue;
      perSrc[f.source] = (perSrc[f.source] || 0) + 1;
      picked.push(f);
      if (picked.length >= limit) break;
    }
    return picked;
  };

  if (!chosen.length) {
    const top = take([...eligible], (f) => f.power, 6);
    return { chosen: [], sections: [], top: spreadActions(top.map((f) => shape(f, f.power))) };
  }

  const used = new Set();
  const raw = chosen.map((key, rank) => {
    const weight = FOCUS_WEIGHT[rank];
    const score = (f) => f.power * relevance(f, key) * weight;
    // The quality gate applies to power as it lands on this topic: a sentence that only
    // half-belongs here has to be twice as strong to earn the space.
    const pool = eligible.filter((f) => !used.has(f.id) && f.power * relevance(f, key) >= minPower);
    const picked = take(pool, score, perTopic);
    picked.forEach((f) => used.add(f.id));
    return { key, name: TOPICS.find((t) => t.key === key).name, blurb: TOPIC_BLURB[key], rank: rank + 1, weight,
      findings: picked.map((f) => shape(f, score(f))) };
  });

  // The "do first" list: the strongest priorities across everything chosen, preferring things you can act on.
  // Built from the full, unspread findings so a sentence never loses its action just because a
  // sibling in its own topic section already showed the same one.
  const flat = raw.flatMap((s) => s.findings);
  const top = spreadActions([...flat].sort((a, b) => (b.priority + (b.action ? 8 : 0)) - (a.priority + (a.action ? 8 : 0))).slice(0, 3));
  const sections = raw.map((s) => ({ ...s, findings: spreadActions(s.findings) }));
  return { chosen, sections, top };
}

/** Unfiltered rows, for research use: one flat table of every sentence and its components. */
const table = (findings) => findings.map((f) => shape(f, f.power));

module.exports = {
  MODEL_VERSION, WEIGHTS, SYSTEM_FACTOR, MIN_POWER, PER_TOPIC, PER_SOURCE, FOCUS_WEIGHT, MAX_FOCUS,
  TOPICS, TOPIC_BLURB, TOPIC_TERMS, HOUSE_TOPICS, PLANET_TOPICS,
  buildFindings, forUser, table, dismantle, classify, relevance,
};
