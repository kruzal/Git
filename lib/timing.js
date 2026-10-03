/*
 * TIMING — when a topic is most active.
 *
 * Nobody asks "what does my 7th house mean" first. They ask "when". The tradition
 * answers with dasha: a period is relevant to a topic when the planets running it are
 * the ones tied to that topic's houses. This module scores every antardasha in a
 * window ahead by exactly that and reports where the activity concentrates.
 *
 * What it does NOT do: name events. A high-scoring window is a stretch of time in which
 * the chart gives a topic more to work with, never a promise that something happens.
 * Every result carries `caution` so no consumer can drop that framing by accident.
 */

const { SIGN_LORDS } = require('./astro');
const { LIFE_AREAS } = require('./lenses');
const { ordinal } = require('./bhava');

const CAUTION = 'Windows show when the chart gives this area more to work with, not when something will happen. What you do in them is what counts.';

/**
 * Planets tied to a topic, with how strongly and why.
 * The area's first house counts most; its lord, its occupants and the natural
 * significators of the area all add weight.
 */
function significators(chart, topicKey) {
  const area = LIFE_AREAS.find((a) => a.key === topicKey);
  if (!area) return new Map();
  const found = new Map();
  const add = (planet, weight, reason) => {
    const cur = found.get(planet) || { planet, weight: 0, reasons: [] };
    cur.weight += weight;
    cur.reasons.push(reason);
    found.set(planet, cur);
  };

  area.houses.forEach((h, k) => {
    const share = k === 0 ? 3 : k === 1 ? 2 : 1;
    const lord = SIGN_LORDS[(chart.ascendant.signIndex + h - 1) % 12];
    add(lord, share, `rules your ${ordinal(h)} house`);
    chart.planets.filter((p) => p.house === h)
      .forEach((p) => add(p.name, share > 1 ? 2 : 1, `sits in your ${ordinal(h)} house`));
  });
  area.planets.forEach((p) => add(p, 1.5, 'is a natural significator'));
  return found;
}

/**
 * Antardasha windows for a topic across the next `years`, plus the one running now.
 * Score is 0-1: the mahadasha lord counts 60%, the antardasha lord 40%, each against
 * the strongest significator for the topic.
 */
function windows(chart, dasha, topicKey, { now = new Date(), years = 12 } = {}) {
  const sig = significators(chart, topicKey);
  if (!sig.size) return { topic: topicKey, caution: CAUTION, significators: [], windows: [] };
  const top = Math.max(...[...sig.values()].map((s) => s.weight));
  const w = (planet) => (sig.get(planet)?.weight || 0) / top;
  const horizon = new Date(now.getTime() + years * 365.2425 * 86400000);

  const list = [];
  dasha.periods.forEach((m) => m.antardashas.forEach((a) => {
    if (a.end <= now || a.start >= horizon) return;
    const score = 0.6 * w(m.lord) + 0.4 * w(a.lord);
    const reasons = [];
    if (sig.get(m.lord)) reasons.push(`${m.lord} (${m.lord === a.lord ? 'both periods' : 'main period'}) ${sig.get(m.lord).reasons[0]}`);
    if (sig.get(a.lord) && a.lord !== m.lord) reasons.push(`${a.lord} (sub-period) ${sig.get(a.lord).reasons[0]}`);
    list.push({
      start: a.start.toISOString().slice(0, 10), end: a.end.toISOString().slice(0, 10),
      maha: m.lord, antar: a.lord, score: Math.round(score * 100) / 100,
      current: a.start <= now && now < a.end, why: reasons,
    });
  }));

  const best = Math.max(0, ...list.map((x) => x.score));
  // "Peak" windows are those within reach of the best one in the horizon, not an absolute bar,
  // so a topic with a quiet chart still shows where its relatively best stretch is.
  list.forEach((x) => { x.level = best && x.score >= best * 0.85 ? 'peak' : x.score >= 0.4 ? 'active' : 'quiet'; });

  return {
    topic: topicKey, caution: CAUTION,
    significators: [...sig.values()].sort((a, b) => b.weight - a.weight)
      .map((s) => ({ planet: s.planet, weight: s.weight, reasons: s.reasons })),
    windows: list,
  };
}

/** Merge adjacent same-level antardashas so the display shows stretches, not fragments. */
function stretches(list) {
  const out = [];
  list.forEach((x) => {
    const last = out.at(-1);
    if (last && last.level === x.level && last.end === x.start && last.level !== 'quiet') {
      last.end = x.end; last.current = last.current || x.current;
      last.score = Math.max(last.score, x.score);
      last.why = [...new Set([...last.why, ...x.why])];
      last.parts.push({ maha: x.maha, antar: x.antar, start: x.start, end: x.end });
    } else out.push({ ...x, parts: [{ maha: x.maha, antar: x.antar, start: x.start, end: x.end }] });
  });
  return out;
}

module.exports = { windows, stretches, significators, CAUTION };
