// Horoscope readings built from real transits: the reading for a sign depends on which house
// (counted from that sign) the Moon, Sun and Jupiter currently occupy.
const { WESTERN_SIGNS, VEDIC_SIGNS, transitSignIndex } = require('./astro');

const HOUSE_THEMES = [
  { area: 'self', tone: 'strong', text: 'Your energy and confidence are high. It is a good time to take the lead and start something new.' },
  { area: 'money', tone: 'mixed', text: 'Money and family matters need attention. Be careful with spending and choose your words wisely.' },
  { area: 'courage', tone: 'strong', text: 'Courage and communication come easily. Short trips, messages and siblings bring good news.' },
  { area: 'home', tone: 'mixed', text: 'Home and inner peace take priority. Spend time with your mother or family and avoid emotional overreactions.' },
  { area: 'creativity', tone: 'good', text: 'Creativity, romance and learning flow well. Children or students may bring joy.' },
  { area: 'health', tone: 'good', text: 'You can beat obstacles and competitors today. Keep a steady routine and look after your health.' },
  { area: 'partnership', tone: 'good', text: 'Partnerships take centre stage. Meetings, agreements and time with your spouse go well.' },
  { area: 'change', tone: 'challenging', text: 'Unexpected changes are possible. Avoid risky decisions and stay calm under pressure.' },
  { area: 'fortune', tone: 'good', text: 'Luck and guidance are on your side. Teachers, elders or a journey can widen your outlook.' },
  { area: 'career', tone: 'strong', text: 'Career and public image get a boost. Your efforts at work are noticed by people who matter.' },
  { area: 'gains', tone: 'strong', text: 'Gains and wishes come closer to fulfilment. Friends and networks work in your favour.' },
  { area: 'rest', tone: 'challenging', text: 'Energy may feel low. Rest, reflect and avoid unnecessary expenses or late nights.' },
];

const COLORS = ['Red', 'White', 'Green', 'Silver', 'Gold', 'Yellow', 'Pink', 'Maroon', 'Orange', 'Blue', 'Violet', 'Sea green'];
const TONE_SCORE = { strong: 5, good: 4, mixed: 3, challenging: 2 };

// Small deterministic hash so a sign gets the same lucky number all day.
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h);
}

const houseFrom = (signIndex, transitIndex) => ((transitIndex - signIndex + 12) % 12) + 1;

function reading(system, signIndex, period, date = new Date()) {
  const names = system === 'vedic' ? VEDIC_SIGNS : WESTERN_SIGNS;
  // Faster planets drive short periods; slower ones drive longer periods.
  const drivers = { daily: ['Moon', 'Sun'], weekly: ['Sun', 'Mars'], monthly: ['Jupiter', 'Saturn'] }[period];
  const [main, second] = drivers.map((body) => ({ body, house: houseFrom(signIndex, transitSignIndex(body, date, system)) }));
  const mainTheme = HOUSE_THEMES[main.house - 1];
  const secondTheme = HOUSE_THEMES[second.house - 1];
  const score = Math.round((TONE_SCORE[mainTheme.tone] * 2 + TONE_SCORE[secondTheme.tone]) / 3);
  const seed = seeded(`${system}-${signIndex}-${period}-${date.toISOString().slice(0, 10)}`);

  return {
    system,
    period,
    sign: names[signIndex],
    signIndex,
    date: date.toISOString().slice(0, 10),
    summary: mainTheme.text,
    detail: `${['Sun', 'Moon'].includes(second.body) ? 'The ' : ''}${second.body} in your ${ordinal(second.house)} house adds focus on ${secondTheme.area}. ${secondTheme.text}`,
    transits: [main, second],
    rating: score,
    luckyNumber: (seed % 9) + 1,
    luckyColor: COLORS[seed % COLORS.length],
  };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

module.exports = { reading };
