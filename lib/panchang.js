// Panchang: the five limbs of the day (tithi, vara, nakshatra, yoga, karana) plus muhurta timings.
const A = require('astronomy-engine');
const { lahiriAyanamsa } = require('./astro');

const TITHI_NAMES = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
const YOGA_NAMES = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyan', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti'];
const MOVABLE_KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];
const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
const VARA = ['Ravivar (Sunday)', 'Somvar (Monday)', 'Mangalvar (Tuesday)', 'Budhvar (Wednesday)', 'Brihaspativar (Thursday)', 'Shukravar (Friday)', 'Shanivar (Saturday)'];

// Which eighth of the daylight span Rahu kaal falls in, indexed by weekday (Sunday first).
const RAHU_PART = [8, 2, 7, 5, 6, 4, 3];
const GULIKA_PART = [7, 6, 5, 4, 3, 2, 1];
const YAMA_PART = [5, 4, 3, 2, 1, 7, 6];

const norm = (d) => ((d % 360) + 360) % 360;

function tithiOf(sunLon, moonLon) {
  const index = Math.floor(norm(moonLon - sunLon) / 12);
  const paksha = index < 15 ? 'Shukla' : 'Krishna';
  const within = index % 15;
  const name = within === 14 ? (paksha === 'Shukla' ? 'Purnima' : 'Amavasya') : TITHI_NAMES[within];
  return { index: index + 1, name, paksha, label: name === 'Purnima' || name === 'Amavasya' ? name : `${paksha} ${name}` };
}

function karanaOf(sunLon, moonLon) {
  const half = Math.floor(norm(moonLon - sunLon) / 6);
  if (half === 0) return 'Kimstughna';
  if (half === 57) return 'Shakuni';
  if (half === 58) return 'Chatushpada';
  if (half === 59) return 'Naga';
  return MOVABLE_KARANAS[(half - 1) % 7];
}

// Splits daylight into eight equal parts and returns the nth (1-based).
function dayPart(sunrise, sunset, part) {
  const slice = (sunset - sunrise) / 8;
  return { start: new Date(sunrise.getTime() + (part - 1) * slice), end: new Date(sunrise.getTime() + part * slice) };
}

// `date` is any instant on the day; timings are computed for the given place.
function panchang(date, lat, lon) {
  const observer = new A.Observer(lat, lon, 0);
  const dayStart = new Date(date.getTime() - 12 * 3600000);
  const sunrise = A.SearchRiseSet(A.Body.Sun, observer, +1, dayStart, 2)?.date;
  const sunset = sunrise ? A.SearchRiseSet(A.Body.Sun, observer, -1, sunrise, 2)?.date : null;
  const moonrise = A.SearchRiseSet(A.Body.Moon, observer, +1, dayStart, 2)?.date || null;

  // Panchang limbs are read at sunrise, the traditional start of the day.
  const at = sunrise || date;
  const ayanamsa = lahiriAyanamsa(at);
  const sunLon = norm(A.SunPosition(at).elon - ayanamsa);
  const moonLon = norm(A.EclipticGeoMoon(at).lon - ayanamsa);
  const nakIndex = Math.floor(moonLon / (360 / 27));
  const weekday = sunrise ? sunriseWeekday(sunrise, lon) : date.getUTCDay();

  const muhurtas = sunrise && sunset ? {
    rahuKaal: dayPart(sunrise, sunset, RAHU_PART[weekday]),
    gulikaKaal: dayPart(sunrise, sunset, GULIKA_PART[weekday]),
    yamaganda: dayPart(sunrise, sunset, YAMA_PART[weekday]),
    // Abhijit: the eighth of fifteen muhurtas of daylight, midday — auspicious for starting work.
    abhijit: (() => {
      const slice = (sunset - sunrise) / 15;
      return { start: new Date(sunrise.getTime() + 7 * slice), end: new Date(sunrise.getTime() + 8 * slice) };
    })(),
  } : null;

  return {
    sunrise, sunset, moonrise,
    vara: VARA[weekday],
    tithi: tithiOf(sunLon, moonLon),
    nakshatra: NAKSHATRAS[nakIndex],
    yoga: YOGA_NAMES[Math.floor(norm(sunLon + moonLon) / (360 / 27))],
    karana: karanaOf(sunLon, moonLon),
    moonSignIndex: Math.floor(moonLon / 30),
    muhurtas,
  };
}

/** The limbs at an exact instant (a birth, an event), not at sunrise. */
function limbsAt(date) {
  const ayanamsa = lahiriAyanamsa(date);
  const sunLon = norm(A.SunPosition(date).elon - ayanamsa);
  const moonLon = norm(A.EclipticGeoMoon(date).lon - ayanamsa);
  return {
    tithi: tithiOf(sunLon, moonLon),
    nakshatra: NAKSHATRAS[Math.floor(moonLon / (360 / 27))],
    yoga: YOGA_NAMES[Math.floor(norm(sunLon + moonLon) / (360 / 27))],
    karana: karanaOf(sunLon, moonLon),
  };
}

// Weekday at the place of observation, not in UTC.
function sunriseWeekday(sunrise, lon) {
  const localish = new Date(sunrise.getTime() + (lon / 15) * 3600000);
  return localish.getUTCDay();
}

module.exports = { panchang, limbsAt, sunriseWeekday, VARA };
