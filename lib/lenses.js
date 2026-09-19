/*
 * LENSES — different questions asked of the same chart.
 *
 *   karakas    Jaimini: the seven planets sorted by degree, each rank owning a life domain
 *   arudha     how the world reads you, as distinct from who you are
 *   lifeAreas  the way people actually ask — career, money, marriage, health
 *   remedies   what to do about it, planet-keyed
 */

const { SIGN_LORDS, VEDIC_SIGNS } = require('./astro');
const { connectedToHouse, aspectedHouses } = require('./aspects');

// ------------------------------------------------------------- karakas
// Rank by degree within sign, highest first. Rahu and Ketu are excluded here.
const KARAKA_RANKS = [
  { key: 'atma', name: 'Atmakaraka', domain: 'self, soul, the thread of your life', note: 'The planet that carries your central lesson. Its condition colours everything.' },
  { key: 'amatya', name: 'Amatyakaraka', domain: 'career and profession', note: 'What you do, and the style you do it in.' },
  { key: 'bhratri', name: 'Bhratrikaraka', domain: 'siblings, courage, effort', note: 'Where your fight and your support come from.' },
  { key: 'matri', name: 'Matrikaraka', domain: 'mother, home, comfort', note: 'The shape of your early ground.' },
  { key: 'pitri', name: 'Pitrikaraka', domain: 'father, fortune, guidance', note: 'Who taught you, and what luck you inherited.' },
  { key: 'putra', name: 'Putrakaraka', domain: 'children, creativity, learning', note: 'What you make and what you pass on.' },
  { key: 'dara', name: 'Darakaraka', domain: 'spouse and partnership', note: 'Describes the partner more than the marriage.' },
];

function karakas(chart) {
  const ranked = chart.planets
    .filter((p) => !['Rahu', 'Ketu'].includes(p.name))
    .sort((a, b) => b.degree - a.degree);
  return KARAKA_RANKS.map((rank, i) => ranked[i] && ({
    ...rank, planet: ranked[i].name, sign: ranked[i].sign,
    house: ranked[i].house, degree: ranked[i].degree,
  })).filter(Boolean);
}

// -------------------------------------------------------------- arudha
/**
 * Arudha Lagna — the public image. Count from house 1 to the lagna lord,
 * then the same distance again from the lord. It can never land on the
 * 1st or 7th; in those cases take the 10th house from the result.
 */
function arudhaLagna(chart) {
  const lord = chart.planets.find((p) => p.name === chart.ascendant.lord);
  if (!lord) return null;
  const distance = lord.house;
  let al = ((lord.house + distance - 2) % 12) + 1;
  let adjusted = null;
  if (al === 1) { al = 10; adjusted = 'the lagna lord sits in the 1st, so the 10th house is used instead'; }
  else if (al === 7) { al = 4; adjusted = 'the result fell on the 7th, so the 4th house is used instead'; }

  const conn = connectedToHouse(chart, al, SIGN_LORDS);
  // A planet counts as shaping the image if it sits there, rules it, or aspects it.
  const influences = [...new Set([...conn.occupants, ...(conn.occupants.length ? [] : [conn.lord]), ...conn.aspectedBy.map((a) => a.planet)])];
  return { house: al, sign: VEDIC_SIGNS[conn.signIndex], adjusted, occupants: conn.occupants,
    lord: conn.lord, aspectedBy: conn.aspectedBy, influences };
}

const PUBLIC_IMAGE = {
  Sun: 'Prestigious, royal, a natural leader — and a little egotistic. People assume authority you may not hold.',
  Moon: 'Caring, emotional, a good listener. People bring you their troubles.',
  Mars: 'Hardworking, energetic, always busy — even when you are not. Some read you as sharp-tempered.',
  Mercury: 'Young, funny, everyone’s friend, good with words. Also read as talkative and a bit clever.',
  Jupiter: 'Wiser and more religious than you actually are. Assumed prosperous and well-born regardless of your bank balance.',
  Venus: 'Rich, attractive, pleasant to be around. People assume a comfortable life.',
  Saturn: 'The one whose advice everyone wants — assumed experienced, fair, and reliably late.',
  Rahu: 'Persistently misread. People see the opposite of what you are, and envy you with little to envy.',
  Ketu: 'Unreadable. One group treats you as almost holy; another thinks you are slow. Both are confident.',
};

// ----------------------------------------------------------- life areas
const LIFE_AREAS = [
  { key: 'career', name: 'Work & career', houses: [10, 6, 1], karaka: 'amatya', planets: ['Saturn', 'Sun'] },
  { key: 'money', name: 'Money', houses: [2, 11, 5], karaka: null, planets: ['Jupiter', 'Venus'] },
  { key: 'marriage', name: 'Marriage & partnership', houses: [7, 2, 11], karaka: 'dara', planets: ['Venus', 'Jupiter'] },
  { key: 'family', name: 'Family & home', houses: [4, 2, 3], karaka: 'matri', planets: ['Moon'] },
  { key: 'health', name: 'Health & energy', houses: [1, 6, 8], karaka: null, planets: ['Sun', 'Moon'] },
  { key: 'education', name: 'Learning', houses: [5, 9, 4], karaka: 'putra', planets: ['Jupiter', 'Mercury'] },
  { key: 'foreign', name: 'Foreign & travel', houses: [12, 9, 3], karaka: null, planets: ['Rahu'] },
  { key: 'spiritual', name: 'Inner life', houses: [12, 9, 8], karaka: null, planets: ['Ketu', 'Jupiter'] },
];

function lifeArea(chart, strengths, key) {
  const area = LIFE_AREAS.find((a) => a.key === key);
  const ks = karakas(chart);
  const houses = area.houses.map((h) => {
    const conn = connectedToHouse(chart, h, SIGN_LORDS);
    const lordPlanet = chart.planets.find((p) => p.name === conn.lord);
    return { house: h, sign: VEDIC_SIGNS[conn.signIndex], occupants: conn.occupants,
      lord: conn.lord, lordHouse: conn.lordHouse, lordStrength: strengths[conn.lord]?.band,
      aspectedBy: conn.aspectedBy.map((a) => a.planet) };
  });
  const signifiers = area.planets.map((p) => ({ planet: p, ...strengths[p],
    house: chart.planets.find((x) => x.name === p).house }));
  const karaka = area.karaka ? ks.find((k) => k.key === area.karaka) : null;

  // The strongest and weakest thing touching this area, which is the honest summary.
  const touching = [...new Set([...houses.flatMap((h) => [...h.occupants, h.lord]), ...area.planets])];
  const scored = touching.map((p) => strengths[p]).filter(Boolean).sort((a, b) => b.score - a.score);

  return { ...area, houses, signifiers, karaka,
    strongest: scored[0], weakest: scored[scored.length - 1],
    verdict: scored.length
      ? `${scored[0].planet} is the strongest influence here (${scored[0].score}/10) and ${scored[scored.length - 1].planet} the most strained (${scored[scored.length - 1].score}/10).`
      : null };
}

// ------------------------------------------------------------ remedies
// Behaviour first, objects second. No health claims — see docs/policy.
const REMEDIES = {
  Sun: { day: 'Sunday', do: 'Offer water to the rising sun between 6 and 8am, and keep your word about time — arrive when you said you would.', give: 'Wheat, jaggery', wear: '1 or 12 mukhi rudraksha', avoid: 'Accepting red or gold items as gifts' },
  Moon: { day: 'Monday', do: 'Make kheer yourself and take it to an old-age home, once a month. Ten minutes of bhramari or breath work before sleep.', give: 'Rice, milk, white cloth', wear: '2 mukhi rudraksha', avoid: 'Accepting water vessels or white foods as gifts' },
  Mars: { day: 'Tuesday', do: 'Give the heat somewhere to go — train, walk, build. Handle property paperwork rather than postponing it.', give: 'Red lentils', wear: '3 mukhi rudraksha', avoid: 'Accepting sweets or property as gifts' },
  Mercury: { day: 'Wednesday', do: 'Sponsor a child’s schooling for a year, or teach someone a skill you already have.', give: 'Green gram, books', wear: '4 mukhi rudraksha', avoid: 'Accepting stationery or plants as gifts' },
  Jupiter: { day: 'Thursday', do: 'Find a teacher, and teach out loud whatever you already know. Pour turmeric water on a banana tree.', give: 'Chana dal, turmeric', wear: 'Gold; 5 mukhi rudraksha', avoid: 'Accepting religious books or idols as gifts' },
  Venus: { day: 'Friday', do: 'Keep yourself and your surroundings well kept — it is not vanity here. Keep promises you make; they carry more weight than you think.', give: 'White sweets, perfume', wear: '6 mukhi rudraksha', avoid: 'Accepting perfume or clothes as gifts' },
  Saturn: { day: 'Saturday', do: 'Water a peepal tree on Saturdays. Eat simply one day a week. Feed labourers, rickshaw pullers, anyone whose work is physical.', give: 'Black sesame, urad dal, mustard oil', wear: '7 or 14 mukhi rudraksha', avoid: 'Accepting shoes, leather or iron as gifts' },
  Rahu: { day: 'Saturday', do: 'Picture, in practical detail, the life you want — at night, before sleeping. Watch how you speak about yourself; it tends to come true.', give: 'Blankets to those sleeping rough', wear: '8 mukhi rudraksha', avoid: 'Accepting electronics as gifts' },
  Ketu: { day: 'Tuesday', do: 'Travel — mountains, water, distance. It settles you more reliably than talking does.', give: 'Blankets, food at a shrine', wear: '9 mukhi rudraksha', avoid: 'Accepting rudraksha or gemstones from strangers' },
};

function remedies(chart, strengths) {
  // Weakest planets first — that is where a remedy actually has work to do.
  return Object.values(strengths)
    .sort((a, b) => a.score - b.score)
    .map((s) => ({ planet: s.planet, score: s.score, band: s.band, priority: s.score < 5 ? 'high' : s.score < 6.5 ? 'medium' : 'low', ...REMEDIES[s.planet] }));
}

module.exports = { karakas, arudhaLagna, PUBLIC_IMAGE, LIFE_AREAS, lifeArea, remedies, REMEDIES };
