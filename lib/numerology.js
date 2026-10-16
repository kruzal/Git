/*
 * NUMEROLOGY
 *
 * Driver (mulank)    — the birth day reduced to a single digit
 * Conductor (bhagyank) — the whole birth date reduced
 * Life path          — the Western reading of the same date: month, day and year reduced
 *                      separately, then summed, and master numbers 11, 22, 33 are kept
 * Name number        — letters scored, Chaldean or Pythagorean
 * Lo Shu grid        — digit frequency laid on the 3×3 magic square
 *
 * Every number maps to a graha, which is what joins this to the Vedic side:
 * a Driver 8 is a Saturn person, and their Saturn is already in the chart.
 */

const NUMBER_PLANET = {
  1: 'Sun', 2: 'Moon', 3: 'Jupiter', 4: 'Rahu', 5: 'Mercury',
  6: 'Venus', 7: 'Ketu', 8: 'Saturn', 9: 'Mars',
};

const NUMBER_TRAIT = {
  1: 'Leads by default. Wants to be first, dislikes being managed.',
  2: 'Reads the room before speaking. Cooperative, moody, needs harmony.',
  3: 'Teaches and expands. Optimistic, talkative, drawn to knowledge.',
  4: 'Unconventional and restless. Builds by breaking the usual route.',
  5: 'Quick, commercial, adaptable. Bored by repetition.',
  6: 'Aesthetic and relational. Comfort and beauty are not luxuries to you.',
  7: 'Inward and questioning. Drawn to what cannot be seen directly.',
  8: 'Structural and patient. Builds slowly, carries weight, arrives late but arrives.',
  9: 'Fights for things. High energy, quick temper, hard to stop.',
};

// Master numbers are not reduced on the Western side. Each still sits on its root's planet.
const MASTER = new Set([11, 22, 33]);
const LIFE_PATH_TRAIT = {
  1: 'Here to start things and stand on your own. The lesson is leading without needing permission.',
  2: 'Here to partner, mediate and notice what others miss. The lesson is trusting your own sensitivity.',
  3: 'Here to express — speech, writing, art, teaching. The lesson is finishing what you start.',
  4: 'Here to build something that lasts. The lesson is that slow, steady work is the shortcut.',
  5: 'Here to move, try and adapt. The lesson is freedom that does not scatter you.',
  6: 'Here to care for people and make places beautiful. The lesson is serving without carrying everyone.',
  7: 'Here to study, question and go inward. The lesson is trusting what you find in quiet.',
  8: 'Here to handle power, money and responsibility. The lesson is using weight well.',
  9: 'Here to give back and close cycles. The lesson is letting go without bitterness.',
  11: 'Master 11 — the intuitive. A 2 with the volume turned up: insight arrives before reasons do. The lesson is grounding it.',
  22: 'Master 22 — the master builder. A 4 with a larger blueprint: ideas meant to become structures that serve many.',
  33: 'Master 33 — the teacher of care. A 6 lifted: compassion turned into guidance. The lesson is not martyrdom.',
};

/** Reduce, but stop at a master number. */
function reduceKeepingMaster(n) {
  const steps = [n];
  while (n > 9 && !MASTER.has(n)) {
    n = String(n).split('').reduce((s, d) => s + Number(d), 0);
    steps.push(n);
  }
  return { value: n, steps };
}

function lifePath(y, m, d) {
  const parts = [m, d, y].map(reduceKeepingMaster);
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = reduceKeepingMaster(total);
  const root = MASTER.has(r.value) ? reduce(r.value).value : r.value;
  return {
    ...r,
    steps: [`${parts.map((p) => p.value).join(' + ')} = ${total}`, ...r.steps.slice(1)],
    master: MASTER.has(r.value), root,
    planet: NUMBER_PLANET[root], trait: LIFE_PATH_TRAIT[r.value],
    label: 'Life path', from: `month ${m}, day ${d} and year ${y}, each reduced first`,
  };
}

// Chaldean has no 9 — it was reserved. Pythagorean runs straight A=1 to I=9.
const CHALDEAN = { A:1,I:1,J:1,Q:1,Y:1, B:2,K:2,R:2, C:3,G:3,L:3,S:3, D:4,M:4,T:4,
  E:5,H:5,N:5,X:5, U:6,V:6,W:6, O:7,Z:7, F:8,P:8 };
const PYTHAGOREAN = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch, i) => { PYTHAGOREAN[ch] = (i % 9) + 1; });

/** Reduce to a single digit, keeping the running total for display. */
function reduce(n) {
  const steps = [n];
  while (n > 9) {
    n = String(n).split('').reduce((s, d) => s + Number(d), 0);
    steps.push(n);
  }
  return { value: n, steps };
}

function nameNumber(name, system = 'chaldean') {
  const table = system === 'pythagorean' ? PYTHAGOREAN : CHALDEAN;
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '').split('');
  const total = letters.reduce((s, ch) => s + (table[ch] || 0), 0);
  return { system, total, ...reduce(total), letters: letters.length };
}

// The Lo Shu square. Each cell counts how often that digit appears in the date.
const LO_SHU_LAYOUT = [[4, 9, 2], [3, 5, 7], [8, 1, 6]];

function loShu(birthDate) {
  const digits = birthDate.replace(/-/g, '').split('').map(Number).filter((d) => d > 0);
  const counts = {};
  digits.forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
  return {
    grid: LO_SHU_LAYOUT.map((row) => row.map((n) => ({ n, count: counts[n] || 0, planet: NUMBER_PLANET[n] }))),
    missing: Object.keys(NUMBER_PLANET).map(Number).filter((n) => !counts[n]),
    repeated: Object.entries(counts).filter(([, c]) => c > 1).map(([n, c]) => ({ n: Number(n), count: c })),
  };
}

/** Full numerology profile for one person. `birthDate` is YYYY-MM-DD. */
function profile(birthDate, fullName) {
  const [y, m, d] = birthDate.split('-').map(Number);
  const driver = reduce(d);
  const conductor = reduce(d + m + String(y).split('').reduce((s, x) => s + Number(x), 0));

  return {
    driver: { ...driver, planet: NUMBER_PLANET[driver.value], trait: NUMBER_TRAIT[driver.value],
      label: 'Driver (Mulank)', from: `birth day ${d}` },
    conductor: { ...conductor, planet: NUMBER_PLANET[conductor.value], trait: NUMBER_TRAIT[conductor.value],
      label: 'Conductor (Bhagyank)', from: `whole date ${birthDate}` },
    lifePath: lifePath(y, m, d),
    name: fullName ? {
      chaldean: nameNumber(fullName, 'chaldean'),
      pythagorean: nameNumber(fullName, 'pythagorean'),
    } : null,
    loShu: loShu(birthDate),
    // Driver and Conductor sharing a planet concentrates that planet's themes.
    resonance: driver.value === conductor.value
      ? `Driver and Conductor are both ${driver.value}, so everything doubles down on ${NUMBER_PLANET[driver.value]}.`
      : null,
  };
}

module.exports = { profile, reduce, lifePath, nameNumber, loShu, NUMBER_PLANET, NUMBER_TRAIT };
