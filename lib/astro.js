// Planetary positions, ascendant and sign/nakshatra lookups for Vedic and Western charts.
const A = require('astronomy-engine');

const WESTERN_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const VEDIC_SIGNS = ['Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya', 'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'];
const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
const NAKSHATRA_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

const norm = (deg) => ((deg % 360) + 360) % 360;
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function julianCenturies(date) {
  return (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;
}

// Lahiri (Chitrapaksha) ayanamsa, linear approximation — accurate to about an arcminute for modern dates.
function lahiriAyanamsa(date) {
  const years = julianCenturies(date) * 100;
  return 23.85306 + (50.2788 / 3600) * years;
}

function tropicalLongitude(body, date) {
  if (body === 'Sun') return A.SunPosition(date).elon;
  if (body === 'Moon') return A.EclipticGeoMoon(date).lon;
  return A.Ecliptic(A.GeoVector(body, date, true)).elon;
}

// Mean lunar node (Rahu); Ketu is always opposite.
function meanNode(date) {
  const T = julianCenturies(date);
  return norm(125.04452 - 1934.136261 * T + 0.0020708 * T * T);
}

function ascendant(date, lat, lon) {
  const T = julianCenturies(date);
  const eps = rad(23.439291 - 0.0130042 * T);
  const ramc = rad(norm(A.SiderealTime(date) * 15 + lon));
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(rad(lat)) * Math.sin(eps)));
  return norm(deg(asc));
}

function signInfo(longitude, names) {
  const index = Math.floor(norm(longitude) / 30);
  return { index, name: names[index], degree: norm(longitude) - index * 30 };
}

function nakshatra(siderealLon) {
  const span = 360 / 27;
  const index = Math.floor(norm(siderealLon) / span);
  return {
    index,
    name: NAKSHATRAS[index],
    lord: NAKSHATRA_LORDS[index % 9],
    pada: Math.floor((norm(siderealLon) % span) / (span / 4)) + 1,
  };
}

function planetLongitudes(date) {
  const later = new Date(date.getTime() + 3600000);
  const planets = BODIES.map((name) => {
    const lon = tropicalLongitude(name, date);
    let motion = norm(tropicalLongitude(name, later) - lon);
    if (motion > 180) motion -= 360;
    return { name, lon, retrograde: motion < 0 && name !== 'Sun' && name !== 'Moon' };
  });
  const rahu = meanNode(date);
  planets.push({ name: 'Rahu', lon: rahu, retrograde: true });
  planets.push({ name: 'Ketu', lon: norm(rahu + 180), retrograde: true });
  return planets;
}

// Full birth chart. `date` is the UTC instant of birth.
function birthChart(date, lat, lon, system) {
  const vedic = system === 'vedic';
  const ayanamsa = vedic ? lahiriAyanamsa(date) : 0;
  const names = vedic ? VEDIC_SIGNS : WESTERN_SIGNS;
  const ascLon = norm(ascendant(date, lat, lon) - ayanamsa);
  const asc = signInfo(ascLon, names);

  const planets = planetLongitudes(date).map((p) => {
    const lonAdj = norm(p.lon - ayanamsa);
    const sign = signInfo(lonAdj, names);
    const entry = {
      name: p.name,
      longitude: lonAdj,
      sign: sign.name,
      signIndex: sign.index,
      degree: sign.degree,
      // Whole-sign houses counted from the ascendant sign.
      house: ((sign.index - asc.index + 12) % 12) + 1,
      retrograde: p.retrograde,
    };
    if (vedic) entry.nakshatra = nakshatra(lonAdj);
    return entry;
  });

  const moon = planets.find((p) => p.name === 'Moon');
  const sun = planets.find((p) => p.name === 'Sun');
  return {
    system,
    ayanamsa: vedic ? ayanamsa : null,
    ascendant: { longitude: ascLon, sign: asc.name, signIndex: asc.index, degree: asc.degree, lord: SIGN_LORDS[asc.index] },
    planets,
    moonSign: moon.sign,
    sunSign: sun.sign,
    nakshatra: vedic ? moon.nakshatra : null,
  };
}

// Current sign index of a body, used for transit-based horoscopes.
function transitSignIndex(body, date, system) {
  const ayanamsa = system === 'vedic' ? lahiriAyanamsa(date) : 0;
  return Math.floor(norm(tropicalLongitude(body, date) - ayanamsa) / 30);
}

module.exports = { WESTERN_SIGNS, VEDIC_SIGNS, SIGN_LORDS, birthChart, transitSignIndex, lahiriAyanamsa };
