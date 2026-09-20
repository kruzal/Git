/*
 * BHAVA DATA DICTIONARY
 *
 * One complete, structured entry per house. This is reference data, not
 * interpretation — every field is a classical attribute that does not depend
 * on any particular chart.
 *
 * Classification axes, all standard and all independent of each other:
 *
 *   kendra / panapara / apoklima   angular position (1-4-7-10 / 2-5-8-11 / 3-6-9-12)
 *   trikona                        1, 5, 9 — the houses of merit
 *   dusthana                       6, 8, 12 — the houses of difficulty
 *   upachaya                       3, 6, 10, 11 — houses that improve with time
 *   maraka                         2, 7 — houses that mark endings
 *   purushartha                    dharma / artha / kama / moksha, cycling 1-2-3-4
 *
 * A house can be several of these at once. The 6th is apoklima, dusthana and
 * upachaya together, which is exactly why malefics there are said to do well.
 */

const BHAVAS = [
  {
    n: 1, sanskrit: 'Tanu', name: 'Self',
    summary: 'body, personality, and how you come across before you speak',
    significations: ['physical body', 'appearance', 'health and vitality', 'temperament', 'how others first read you', 'the whole chart in miniature'],
    karaka: 'Sun', bodyPart: 'head', relation: null,
    angular: 'kendra', purushartha: 'dharma', isTrikona: true, isDusthana: false, isUpachaya: false, isMaraka: false,
    asks: ['What am I like?', 'How do I come across?', 'What is my constitution?'],
    note: 'The strongest house in the chart. Whatever touches the 1st colours everything else, because every other house is counted from it.',
  },
  {
    n: 2, sanskrit: 'Dhana', name: 'Wealth & speech',
    summary: 'money you accumulate, the family you were raised in, and what you say',
    significations: ['savings and accumulated wealth', 'immediate family', 'speech and voice', 'food and eating', 'face, teeth, right eye', 'values you were taught'],
    karaka: 'Jupiter', bodyPart: 'face, throat', relation: 'family of origin',
    angular: 'panapara', purushartha: 'artha', isTrikona: false, isDusthana: false, isUpachaya: false, isMaraka: true,
    asks: ['Can I keep money, not just earn it?', 'What is my family like?', 'How do I speak to people?'],
    note: 'Earning is the 10th and 11th. The 2nd is whether it stays.',
  },
  {
    n: 3, sanskrit: 'Sahaja', name: 'Effort & courage',
    summary: 'initiative, younger siblings, short journeys, and hands-on communication',
    significations: ['courage and self-effort', 'younger siblings', 'short travel', 'writing, marketing, selling', 'hands and arms', 'hobbies and skills'],
    karaka: 'Mars', bodyPart: 'arms, shoulders, ears', relation: 'younger siblings',
    angular: 'apoklima', purushartha: 'kama', isTrikona: false, isDusthana: false, isUpachaya: true, isMaraka: false,
    asks: ['Will effort pay here?', 'What am I willing to push for?'],
    note: 'An upachaya house — it rewards repetition. What is weak here at twenty is often strong at forty.',
  },
  {
    n: 4, sanskrit: 'Sukha', name: 'Home & peace',
    summary: 'mother, property, vehicles, and the inner sense of being settled',
    significations: ['mother', 'home and land', 'vehicles', 'peace of mind', 'early schooling', 'comfort and belonging'],
    karaka: 'Moon', bodyPart: 'chest, heart, lungs', relation: 'mother',
    angular: 'kendra', purushartha: 'moksha', isTrikona: false, isDusthana: false, isUpachaya: false, isMaraka: false,
    asks: ['Do I feel at home anywhere?', 'What is my base?'],
    note: 'Called sukha — happiness — because the tradition treats settledness, not achievement, as its source.',
  },
  {
    n: 5, sanskrit: 'Putra', name: 'Creativity & children',
    summary: 'what you make, what you learn, and what you carry from before',
    significations: ['children', 'higher intelligence', 'romance', 'creative work', 'mantra and practice', 'merit carried from past action', 'speculation'],
    karaka: 'Jupiter', bodyPart: 'stomach, upper abdomen', relation: 'children',
    angular: 'panapara', purushartha: 'dharma', isTrikona: true, isDusthana: false, isUpachaya: false, isMaraka: false,
    asks: ['What do I make?', 'What comes easily that should not?'],
    note: 'A trikona — a house of merit. Good results here are usually described as already earned rather than newly won.',
  },
  {
    n: 6, sanskrit: 'Ari', name: 'Obstacles & service',
    summary: 'work you do for others, what stands against you, and daily routine',
    significations: ['service and employment', 'competition and rivals', 'debts and loans', 'illness', 'daily routine', 'maternal uncle', 'pets'],
    karaka: 'Mars, Saturn', bodyPart: 'waist, digestion', relation: 'maternal uncle',
    angular: 'apoklima', purushartha: 'artha', isTrikona: false, isDusthana: true, isUpachaya: true, isMaraka: false,
    asks: ['What do I have to overcome?', 'What is the daily grind?'],
    note: 'Both dusthana and upachaya. Malefics here are traditionally welcome — they fight the things the house represents.',
  },
  {
    n: 7, sanskrit: 'Yuvati', name: 'Partnership',
    summary: 'marriage, business partners, and every dealing with the public',
    significations: ['spouse', 'business partnership', 'contracts', 'public dealings', 'open enemies', 'travel away from home'],
    karaka: 'Venus', bodyPart: 'pelvis, lower abdomen', relation: 'spouse',
    angular: 'kendra', purushartha: 'kama', isTrikona: false, isDusthana: false, isUpachaya: false, isMaraka: true,
    asks: ['Who do I pair with?', 'Am I better alone or with someone?'],
    note: 'Directly opposite the 1st, so it is permanently in view of the self — which is why partnership tends to expose what the 1st hides.',
  },
  {
    n: 8, sanskrit: 'Randhra', name: 'Transformation',
    summary: 'sudden change, what is hidden, and money that is not yours',
    significations: ['longevity', 'sudden events', 'inheritance and shared money', 'research and the occult', 'chronic conditions', 'in-laws', 'secrets'],
    karaka: 'Saturn', bodyPart: 'reproductive organs', relation: 'in-laws',
    angular: 'panapara', purushartha: 'moksha', isTrikona: false, isDusthana: true, isUpachaya: false, isMaraka: false,
    asks: ['What changes me without asking?', 'What am I drawn to investigate?'],
    note: 'The house of what cannot be planned. Also the house of genuine depth — most serious researchers and astrologers have it active.',
  },
  {
    n: 9, sanskrit: 'Dharma', name: 'Fortune & belief',
    summary: 'luck, teachers, father, long journeys, and what you take on faith',
    significations: ['fortune and grace', 'father', 'teachers and gurus', 'higher study', 'long-distance travel', 'religion and ethics', 'pilgrimage'],
    karaka: 'Jupiter, Sun', bodyPart: 'thighs, hips', relation: 'father, teacher',
    angular: 'apoklima', purushartha: 'dharma', isTrikona: true, isDusthana: false, isUpachaya: false, isMaraka: false,
    asks: ['Does luck meet my effort?', 'Who taught me?'],
    note: 'The strongest trikona. Traditionally what the 9th gives, no other house takes away.',
  },
  {
    n: 10, sanskrit: 'Karma', name: 'Career & standing',
    summary: 'work, reputation, and what you are publicly known for',
    significations: ['profession', 'status and authority', 'public reputation', 'government and superiors', 'action in the world', 'father (some schools)'],
    karaka: 'Sun, Mercury, Jupiter, Saturn', bodyPart: 'knees', relation: 'superiors',
    angular: 'kendra', purushartha: 'artha', isTrikona: false, isDusthana: false, isUpachaya: true, isMaraka: false,
    asks: ['What do I do?', 'What am I known for?'],
    note: 'Kendra and upachaya together — visible now, and it keeps improving if you keep working.',
  },
  {
    n: 11, sanskrit: 'Labha', name: 'Gains & networks',
    summary: 'income, friends, elder siblings, and wishes that actually land',
    significations: ['income and gains', 'friends and networks', 'elder siblings', 'fulfilled desires', 'social circles', 'large organisations'],
    karaka: 'Jupiter', bodyPart: 'calves, ankles', relation: 'elder siblings, friends',
    angular: 'panapara', purushartha: 'kama', isTrikona: false, isDusthana: false, isUpachaya: true, isMaraka: false,
    asks: ['What comes in?', 'Do my wishes get fulfilled?'],
    note: 'The house of desire fulfilled — and, for the same reason, of desire that never stops.',
  },
  {
    n: 12, sanskrit: 'Vyaya', name: 'Release & expense',
    summary: 'what leaves, foreign lands, sleep, solitude, and letting go',
    significations: ['expenditure', 'foreign residence', 'sleep and dreams', 'isolation', 'meditation and moksha', 'hospitals and confinement', 'investment', 'hidden enemies'],
    karaka: 'Saturn, Ketu', bodyPart: 'feet, left eye', relation: null,
    angular: 'apoklima', purushartha: 'moksha', isTrikona: false, isDusthana: true, isUpachaya: false, isMaraka: false,
    asks: ['What am I spending?', 'What needs to end?'],
    note: 'Loss and liberation are the same house. Everything it takes is something you were holding.',
  },
];

/*
 * DRISHTI EFFECTS
 *
 * An aspect is influence at a distance, and reads differently from residence.
 * A graha sitting in a house *is* that area of life; a graha aspecting it
 * *acts on* that area from elsewhere, and keeps a foot in its own house.
 */
const ASPECT_MODE = {
  Sun: { verb: 'lights up', effect: 'exposes this area to view — what happens here is seen, and your standing rides on it' },
  Moon: { verb: 'softens', effect: 'makes this area emotionally live, and changeable month to month' },
  Mars: { verb: 'presses on', effect: 'pushes and agitates here — things move, sometimes by force, and friction comes with them' },
  Mercury: { verb: 'analyses', effect: 'brings talk, paperwork and calculation to this area; it gets thought about more than felt' },
  Jupiter: { verb: 'protects', effect: 'cushions this area. Whatever damages it is softened, and help tends to arrive late but in time' },
  Venus: { verb: 'sweetens', effect: 'brings ease and appetite here — pleasant, and occasionally indulgent' },
  Saturn: { verb: 'weighs on', effect: 'slows and tests this area. Results come, but late, and only against sustained effort' },
  Rahu: { verb: 'magnifies', effect: 'inflates this area and pulls it out of proportion — hunger, and never quite enough of it' },
  Ketu: { verb: 'withdraws from', effect: 'quietly drains interest here. Capacity remains; appetite does not' },
};

// Jupiter's aspect is the one the corpus repeatedly treats as mitigating —
// it is the reason a badly-placed house can still hold together.
const PROTECTIVE = new Set(['Jupiter']);

/** What it means that `planet` casts its `count`-th aspect onto `house`. */
function aspectEffect(planet, house, count) {
  const b = BHAVAS[house - 1];
  const mode = ASPECT_MODE[planet];
  return {
    planet, house, count,
    headline: `${planet} ${mode.verb} your ${ordinal(house)} — ${b.name.toLowerCase()}`,
    text: `From a distance, ${planet} ${mode.effect}. Here that lands on ${b.summary}.`,
    protective: PROTECTIVE.has(planet),
  };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Tags that describe a house's classification, for display. */
function tags(n) {
  const b = BHAVAS[n - 1];
  const t = [b.angular, b.purushartha];
  if (b.isTrikona) t.push('trikona');
  if (b.isDusthana) t.push('dusthana');
  if (b.isUpachaya) t.push('upachaya');
  if (b.isMaraka) t.push('maraka');
  return t;
}

module.exports = { BHAVAS, ASPECT_MODE, aspectEffect, tags, ordinal };
