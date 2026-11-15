const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const db = require('./db');
const { birthChart } = require('./lib/astro');
const { reading } = require('./lib/horoscope');
const { CITIES, localToUtc } = require('./lib/cities');
const { timeline } = require('./lib/dasha');
const { panchang } = require('./lib/panchang');
const { suggestSyllable } = require('./lib/nwaran');
const { personalReading } = require('./lib/rules');
const { interpret } = require('./lib/interpret');
const { evaluateAll } = require('./lib/strength');
const { karakas, arudhaLagna, PUBLIC_IMAGE, LIFE_AREAS, lifeArea, remedies } = require('./lib/lenses');
const { profile: numerologyProfile } = require('./lib/numerology');
const { westernProfile } = require('./lib/western');
const { yearReport } = require('./lib/varsha');
const { vector, schema } = require('./lib/indicators');
const { devataReport } = require('./lib/devata');
const Findings = require('./lib/findings');
const Submodels = require('./lib/submodels');
const Intent = require('./lib/intent');
const Actions = require('./lib/actions');
const { REMEDIES } = require('./lib/lenses');
const { relations } = require('./lib/relations');
const { janma } = require('./lib/janma');
const Muhurta = require('./lib/muhurta');
const Significators = require('./lib/significators');
const Discover = require('./lib/discover');
const Anthropic = require('@anthropic-ai/sdk');
const Guide = require('./lib/guide');
const Compatibility = require('./lib/compatibility');

const app = express();
const PORT = process.env.PORT || 3100;
const SESSION_COOKIE = 'vidhya_session';
const SESSION_DAYS = 30;
const OPEN_PAGES = new Set(['/login', '/register']);

app.use(express.json());

// ---------- auth helpers ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function readCookie(req, name) {
  const match = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + maxAge);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge });
}

function currentUser(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now()) || null;
}

const getProfile = (userId) => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) || null;

function requireUser(req, res, next) {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

function requireProfile(req, res, next) {
  req.profile = getProfile(req.user.id);
  if (!req.profile) return res.status(428).json({ error: 'Add your birth details first.' });
  next();
}

// ---------- everything is behind the login ----------
app.use((req, res, next) => {
  const isPage = req.method === 'GET' && !req.path.startsWith('/api') && !path.extname(req.path);
  if (!isPage) return next();

  const user = currentUser(req);
  if (!user) return OPEN_PAGES.has(req.path) ? next() : res.redirect('/login');
  if (OPEN_PAGES.has(req.path)) return res.redirect('/home');

  // A logged-in user without birth details is sent to set them up first.
  const hasProfile = !!getProfile(user.id);
  if (!hasProfile && req.path !== '/onboarding') return res.redirect('/onboarding');
  // Birth details are edited on the account page, with the email and password.
  if (hasProfile && req.path === '/onboarding') return res.redirect(req.query.edit === undefined ? '/home' : '/account');
  if (req.path === '/') return res.redirect('/home');
  if (req.path === '/priorities') return res.redirect('/space');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: false }));

// ---------- auth ----------
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8) {
    return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters.' });
  }
  const normalized = email.trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalized)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const { lastInsertRowid } = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(normalized, hashPassword(password));
  startSession(res, Number(lastInsertRowid));
  res.status(201).json({ next: '/onboarding' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  startSession(res, user.id);
  res.json({ next: getProfile(user.id) ? '/home' : '/onboarding' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

// ---------- account: changing the email or password needs the current password ----------
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const passwordMatches = (userId, password) => {
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  return !!user && verifyPassword(password || '', user.password_hash);
};

app.put('/api/account/email', requireUser, (req, res) => {
  const { email, password } = req.body || {};
  if (!passwordMatches(req.user.id, password)) return res.status(401).json({ error: 'Your current password is not right.' });
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Enter a valid email.' });
  const normalized = email.trim().toLowerCase();
  if (normalized === req.user.email) return res.status(400).json({ error: 'That is already your email.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalized)) {
    return res.status(409).json({ error: 'Another account already uses this email.' });
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(normalized, req.user.id);
  res.json({ ok: true, email: normalized });
});

// A new password signs out every other device, so an old session can't outlive it.
app.put('/api/account/password', requireUser, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!passwordMatches(req.user.id, currentPassword)) return res.status(401).json({ error: 'Your current password is not right.' });
  if ((newPassword || '').length < 8) return res.status(400).json({ error: 'Use at least 8 characters for the new password.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(req.user.id, readCookie(req, SESSION_COOKIE));
  res.json({ ok: true, signedOut: changes });
});

// ---------- profile ----------
const publicProfile = (p) => p && ({
  fullName: p.full_name, nwaranName: p.nwaran_name, birthDate: p.birth_date, birthTime: p.birth_time, city: p.city,
  currentCity: p.current_city || null,
});

// The chart is always cast for the birth place. Daily timings (sunrise, Rahu kaal, muhurta)
// belong to where the person lives now, which falls back to the birth place.
const livingPlace = (profile) => CITIES.find((c) => c.name === (profile?.current_city || profile?.city)) || CITIES[0];

app.get('/api/me', requireUser, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email }, profile: publicProfile(getProfile(req.user.id)) });
});

app.get('/api/cities', (req, res) => {
  res.json(CITIES.map(({ name, country }) => ({ name, country })));
});

app.put('/api/profile', requireUser, (req, res) => {
  const { fullName, nwaranName, birthDate, birthTime, city, currentCity } = req.body || {};
  const place = CITIES.find((c) => c.name === city);
  if (currentCity && !CITIES.some((c) => c.name === currentCity)) {
    return res.status(400).json({ error: 'Choose where you live now from the list, or leave it as your birth place.' });
  }
  if (!fullName?.trim() || !place || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '') || !/^\d{2}:\d{2}$/.test(birthTime || '')) {
    return res.status(400).json({ error: 'Enter your full name, birth date, birth time and birth place.' });
  }
  if (new Date(`${birthDate}T${birthTime}`) > new Date()) {
    return res.status(400).json({ error: 'Birth date and time cannot be in the future.' });
  }
  db.prepare(`
    INSERT INTO profiles (user_id, full_name, nwaran_name, birth_date, birth_time, city, current_city)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name, nwaran_name = excluded.nwaran_name, birth_date = excluded.birth_date,
      birth_time = excluded.birth_time, city = excluded.city, current_city = excluded.current_city, updated_at = datetime('now')`)
    .run(req.user.id, fullName.trim(), nwaranName?.trim() || null, birthDate, birthTime, city,
      currentCity && currentCity !== city ? currentCity : null);
  res.json({ ok: true, next: '/kundli' });
});

// ---------- compatibility: your chart against another person's ----------
// Their details are used for this answer only and never stored.
app.post('/api/compatibility', requireUser, requireProfile, (req, res) => {
  const { name, birthDate, birthTime, city, role } = req.body || {};
  if (!CITIES.some((c) => c.name === city) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '') || !/^\d{2}:\d{2}$/.test(birthTime || '')) {
    return res.status(400).json({ error: 'Enter their birth date, birth time and birth place.' });
  }
  if (!['groom', 'bride'].includes(role)) return res.status(400).json({ error: 'Choose whether you are the groom or the bride in this match.' });
  const mine = chartFor(req.profile), theirs = chartFor({ birth_date: birthDate, birth_time: birthTime, city });
  const [groom, bride] = role === 'groom' ? [mine, theirs] : [theirs, mine];
  const result = Compatibility.match(groom.chart, bride.chart, { dashas: { groom: groom.dasha, bride: bride.dasha } });
  res.json({ ...result, role, names: { you: req.profile.full_name, them: String(name || '').trim().slice(0, 80) || 'Them' } });
});

// ---------- personal chart, readings, dasha ----------
function chartFor(profile) {
  const place = CITIES.find((c) => c.name === profile.city);
  const utc = localToUtc(profile.birth_date, profile.birth_time, place.tz);
  const chart = birthChart(utc, place.lat, place.lon, 'vedic');
  return { place, utc, chart, dasha: timeline(chart.planets.find((p) => p.name === 'Moon').longitude, utc) };
}

// Dasha periods carry Date objects; the API sends plain date strings.
const slimPeriod = (p) => p && ({ lord: p.lord, start: p.start.toISOString().slice(0, 10), end: p.end.toISOString().slice(0, 10) });

app.get('/api/kundli/me', requireUser, requireProfile, (req, res) => {
  const { place, utc, chart, dasha } = chartFor(req.profile);
  const { sections, matchedRules } = personalReading(chart, dasha);
  // `tone=gentle` hides the guarded tier; `full` shows it.
  const visibleTiers = req.query.tone === 'gentle' ? ['open'] : ['open', 'guarded'];
  const detail = interpret(chart, dasha, { visibleTiers });

  res.json({
    profile: publicProfile(req.profile),
    place: `${place.name}, ${place.country}`,
    utc: utc.toISOString(),
    chart,
    nwaranSuggestion: suggestSyllable(chart.nakshatra.index, chart.nakshatra.pada),
    dasha: {
      current: slimPeriod(dasha.current),
      currentAntar: slimPeriod(dasha.currentAntar),
      balance: dasha.balance,
    },
    reading: sections,
    matchedRules,
    detail,
  });
});

// Everything the chart page needs beyond the core Vedic reading: the other
// systems, and the lenses that ask different questions of the same chart.
app.get('/api/lenses/me', requireUser, requireProfile, (req, res) => {
  const { place, utc, chart, dasha } = chartFor(req.profile);
  const strengths = evaluateAll(chart);
  const arudha = arudhaLagna(chart);
  const rel = relations(chart, strengths);
  const westernChart = birthChart(utc, place.lat, place.lon, 'western');

  res.json({
    karakas: karakas(chart),
    arudha: arudha && { ...arudha, readings: arudha.influences.map((p) => ({ planet: p, text: PUBLIC_IMAGE[p] })) },
    lifeAreas: LIFE_AREAS.map((a) => lifeArea(chart, strengths, a.key)),
    remedies: remedies(chart, strengths),
    numerology: numerologyProfile(req.profile.birth_date, req.profile.full_name),
    western: westernProfile(westernChart),
    relations: rel,
    janma: janma(chart, strengths, rel, dasha, utc, place),
    significators: {
      sources: Object.values(Significators.SOURCES),
      houses: Array.from({ length: 12 }, (_, i) => Significators.forHouse(i + 1)),
      activeVedic: Significators.active(chart),
      activeWestern: Significators.active(westernChart),
    },
    devata: devataReport(strengths, timeline(chart.planets.find((p) => p.name === 'Moon').longitude, utc).current?.lord),
  });
});

app.get('/api/dasha/me', requireUser, requireProfile, (req, res) => {
  const { dasha } = chartFor(req.profile);
  res.json({
    balance: dasha.balance,
    current: slimPeriod(dasha.current),
    currentAntar: slimPeriod(dasha.currentAntar),
    periods: dasha.periods.map((p) => ({ ...slimPeriod(p), years: p.years, antardashas: p.antardashas.map(slimPeriod) })),
  });
});

// Daily reading for the user's own Moon sign (rashi).
app.get('/api/reading/me', requireUser, requireProfile, (req, res) => {
  const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'daily';
  const { chart } = chartFor(req.profile);
  const moon = chart.planets.find((p) => p.name === 'Moon');
  res.json(reading('vedic', moon.signIndex, period));
});

// Panchang for today at the user's place (or their birth place as a fallback).
app.get('/api/panchang', requireUser, (req, res) => {
  const profile = getProfile(req.user.id);
  const place = CITIES.find((c) => c.name === req.query.city) || livingPlace(profile);
  // "Today" is the date where that place is, not the server's UTC date.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toLocaleDateString('en-CA', { timeZone: place.tz });
  const at = localToUtc(iso, '12:00', place.tz);
  res.json({ date: iso, place: `${place.name}, ${place.country}`, timezone: place.tz, ...panchang(at, place.lat, place.lon) });
});

// The best windows in the coming weeks for one kind of event, judged for this person.
app.get('/api/muhurta', requireUser, requireProfile, (req, res) => {
  const eventKey = Muhurta.EVENTS[req.query.event] ? req.query.event : 'start';
  const days = Math.min(60, Math.max(7, Number(req.query.days) || 30));
  const place = CITIES.find((c) => c.name === req.query.city) || livingPlace(req.profile);
  const { chart } = chartFor(req.profile);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: place.tz });
  const result = Muhurta.findMuhurta({
    eventKey, days, place,
    from: localToUtc(today, '00:00', place.tz),
    natal: { nakshatraIndex: chart.nakshatra.index, moonSignIndex: chart.planets.find((p) => p.name === 'Moon').signIndex },
  });
  const slim = ({ start, end, date, choghadiya, abhijit, score, good, bad, limbs, tara }) =>
    ({ start, end, date, choghadiya, abhijit, score, good, bad, tara, nakshatra: limbs.nakshatra, tithi: limbs.tithi.label });
  res.json({
    event: result.event, days, place: `${place.name}, ${place.country}`, timezone: place.tz,
    events: Object.entries(Muhurta.EVENTS).map(([key, e]) => ({ key, name: e.name })),
    best: result.best.map(slim), avoid: result.avoid.map(slim),
  });
});

// ---------- discover: the open playground ----------
const discoverLibrary = Discover.library();

app.get('/api/discover/library', requireUser, requireProfile, (req, res) => {
  const { chart } = chartFor(req.profile);
  res.json({ ...discoverLibrary, mine: Object.fromEntries(chart.planets.map((p) => [p.name, p.house])) });
});

app.get('/api/discover/conjunction', requireUser, (req, res) => {
  const names = discoverLibrary.planets.map((p) => p.name);
  const { a, b, c } = req.query;
  const house = Number(req.query.house);
  if (!names.includes(a) || !names.includes(b) || (c && !names.includes(c))) return res.status(400).json({ error: 'Pick two or three planets.' });
  res.json(Discover.conjunction(a, b, house >= 1 && house <= 12 ? house : null, c || null));
});

// Rebuild the user's own chart with changes and return both readings, so the page can diff them.
app.post('/api/discover/simulate', requireUser, requireProfile, (req, res) => {
  const { chart } = chartFor(req.profile);
  const lagna = Number.isInteger(req.body?.lagna) ? req.body.lagna : null;
  const moves = req.body?.moves && typeof req.body.moves === 'object' ? req.body.moves : {};
  res.json({ base: Discover.snapshot(chart), sim: Discover.snapshot(Discover.rebuild(chart, { lagna, moves })) });
});

// ---------- consultations ----------
app.get('/api/priests', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM priests ORDER BY experience_years DESC').all());
});

// Consultation slots: the next seven days, 07:00–17:00 Nepal time, minus anything already booked.
function slotsFor(priestId) {
  const taken = new Set(db.prepare('SELECT slot_start FROM bookings WHERE priest_id = ? AND status != ?').all(priestId, 'cancelled').map((b) => b.slot_start));
  const slots = [];
  for (let day = 1; day <= 7; day++) {
    const date = new Date(Date.now() + day * 86400000).toISOString().slice(0, 10);
    for (const hour of ['07:00', '09:00', '11:00', '15:00', '17:00']) {
      const start = `${date} ${hour}`;
      if (!taken.has(start)) slots.push(start);
    }
  }
  return slots;
}

app.get('/api/priests/:id/slots', requireUser, (req, res) => {
  const priest = db.prepare('SELECT id FROM priests WHERE id = ?').get(req.params.id);
  if (!priest) return res.status(404).json({ error: 'Priest not found.' });
  res.json({ slots: slotsFor(priest.id) });
});

app.post('/api/bookings', requireUser, requireProfile, (req, res) => {
  const { priestId, slotStart, topic, question } = req.body || {};
  const priest = db.prepare('SELECT id FROM priests WHERE id = ?').get(priestId);
  if (!priest || !topic?.trim() || !slotsFor(priest.id).includes(slotStart)) {
    return res.status(400).json({ error: 'Choose a priest, an available time and a topic.' });
  }
  const { lastInsertRowid } = db.prepare('INSERT INTO bookings (user_id, priest_id, slot_start, topic, question) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, priest.id, slotStart, topic.trim(), question?.trim() || null);
  res.status(201).json({ id: Number(lastInsertRowid), status: 'requested' });
});

app.get('/api/bookings', requireUser, (req, res) => {
  res.json(db.prepare(`
    SELECT b.id, b.slot_start, b.topic, b.question, b.status, p.name AS priest_name, p.title AS priest_title, p.fee_npr
    FROM bookings b JOIN priests p ON p.id = b.priest_id
    WHERE b.user_id = ? ORDER BY b.slot_start`).all(req.user.id));
});

app.delete('/api/bookings/:id', requireUser, (req, res) => {
  const { changes } = db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status != 'cancelled'").run(req.params.id, req.user.id);
  if (!changes) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ ok: true });
});

// The year from birthday to birthday, and what to do with it.
app.get('/api/year/me', requireUser, requireProfile, (req, res) => {
  const { chart, dasha } = chartFor(req.profile);
  res.json(yearReport(chart, dasha, req.profile, evaluateAll(chart)));
});

// The research boundary: a flat, typed indicator vector for this chart.
app.get('/api/indicators/me', requireUser, requireProfile, (req, res) => {
  const { place, utc, chart, dasha } = chartFor(req.profile);
  const strengths = evaluateAll(chart);
  const extras = {
    dasha,
    varsha: yearReport(chart, dasha, req.profile, strengths),
    numerology: numerologyProfile(req.profile.birth_date, req.profile.full_name),
    western: westernProfile(birthChart(utc, place.lat, place.lon, 'western')),
  };
  res.json(req.query.format === 'map'
    ? vector(chart, extras, { asMap: true })
    : { count: vector(chart, extras).length, indicators: vector(chart, extras) });
});

// ---------- priorities: the one model every reading passes through ----------
const readFocus = (userId) => {
  const row = db.prepare('SELECT topics FROM focus WHERE user_id = ?').get(userId);
  return row ? JSON.parse(row.topics) : [];
};

const focusPayload = (topics) => ({
  topics, primary: topics[0] || null,
  available: Findings.TOPICS.map((t) => ({ ...t, blurb: Findings.TOPIC_BLURB[t.key] })),
  max: Findings.MAX_FOCUS,
});

app.get('/api/focus', requireUser, (req, res) => res.json(focusPayload(readFocus(req.user.id))));

app.put('/api/focus', requireUser, (req, res) => {
  const topics = req.body?.topics;
  const known = new Set(Findings.TOPICS.map((t) => t.key));
  if (!Array.isArray(topics) || topics.some((t) => !known.has(t)) || new Set(topics).size !== topics.length) {
    return res.status(400).json({ error: 'Choose from the listed topics, each only once.' });
  }
  if (topics.length > Findings.MAX_FOCUS) {
    return res.status(400).json({ error: `Choose at most ${Findings.MAX_FOCUS} — a priority list only works if it is short.` });
  }
  if (!topics.length) {
    db.prepare('DELETE FROM focus WHERE user_id = ?').run(req.user.id);
  } else {
    db.prepare(`
      INSERT INTO focus (user_id, topics, primary_topic) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET topics = excluded.topics, primary_topic = excluded.primary_topic, updated_at = datetime('now')`)
      .run(req.user.id, JSON.stringify(topics), topics[0]);
  }
  res.json(focusPayload(topics));
});

// Ranked findings for this person. `?topics=career,money` previews a focus without saving it;
// `?format=table` returns every sentence with its score components, unfiltered, for research.
app.get('/api/findings/me', requireUser, requireProfile, (req, res) => {
  const ctx = spaceContext(req);
  const all = ctx.all;

  if (req.query.format === 'table') return res.json({ model: Findings.MODEL_VERSION, weights: Findings.WEIGHTS, rows: Findings.table(all) });

  const saved = readFocus(req.user.id);
  const topics = typeof req.query.topics === 'string' ? req.query.topics.split(',').filter(Boolean) : saved;
  const minPower = Number(req.query.min) || Findings.MIN_POWER;
  res.json({
    focus: focusPayload(topics),
    ...Findings.forUser(all, topics, { minPower }),
    meta: { model: Findings.MODEL_VERSION, weights: Findings.WEIGHTS, minPower, candidates: all.length,
      eligible: all.filter((f) => f.power >= minPower).length, droppedFootnotes: all.droppedFootnotes },
  });
});

// ---------- the personal space: every reading, the question box, and the practices ----------
// One context per request: the chart, the findings pool and the other systems, shared by every
// sub-model so that a catalogue card and a typed question can never disagree.
function spaceContext(req) {
  const { place, utc, chart, dasha } = chartFor(req.profile);
  const strengths = evaluateAll(chart);
  const year = yearReport(chart, dasha, req.profile, strengths);
  const western = westernProfile(birthChart(utc, place.lat, place.lon, 'western'));
  const numerology = numerologyProfile(req.profile.birth_date, req.profile.full_name);
  const visibleTiers = req.query.tone === 'gentle' ? ['open'] : ['open', 'guarded'];
  return Submodels.buildContext({ chart, dasha, strengths, year, western, numerology, visibleTiers });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayUtc = () => new Date().toISOString().slice(0, 10);
// The server does not know the person's local date, so it takes the client's and only checks that
// it is plausible: a valid date within a few days of server UTC.
function plausibleDay(day) {
  if (typeof day !== 'string' || !DATE_RE.test(day)) return false;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) && Math.abs(t - Date.now()) <= 3 * 86400000;
}

function practicesFor(userId, ctx, today) {
  const rows = db.prepare('SELECT * FROM commitments WHERE user_id = ? ORDER BY started_on').all(userId);
  return rows.map((c) => {
    const plan = Actions.plan(c.planet, c.topic, ctx);
    const checkins = db.prepare('SELECT day_done FROM checkins WHERE user_id = ? AND action_id = ? ORDER BY day_done')
      .all(userId, c.action_id).map((r) => r.day_done);
    return { actionId: c.action_id, planet: c.planet, topic: c.topic, status: c.status, startedOn: c.started_on, day: c.day,
      plan, checkins: checkins.slice(-12), progress: Actions.progress({ checkins, startedOn: c.started_on, day: c.day, today }) };
  });
}

const activeIds = (userId) => new Set(db.prepare("SELECT action_id FROM commitments WHERE user_id = ? AND status = 'active'")
  .all(userId).map((r) => r.action_id));

app.get('/api/space/me', requireUser, requireProfile, (req, res) => {
  const ctx = spaceContext(req);
  const focus = readFocus(req.user.id);
  const today = plausibleDay(req.query.today) ? req.query.today : todayUtc();
  const order = [...focus, ...Submodels.GROUPS.map((g) => g.key).filter((k) => !focus.includes(k))];
  res.json({
    focus: focusPayload(focus),
    groups: order.map((k) => ({ ...Submodels.GROUPS.find((g) => g.key === k), rank: focus.indexOf(k) + 1 || null })),
    catalog: Submodels.catalog(ctx),
    chart: ctx.chart, strengths: ctx.strengths,
    practices: practicesFor(req.user.id, ctx, today),
    meta: { model: Findings.MODEL_VERSION, readings: Submodels.SUBMODELS.length, findings: ctx.all.length },
  });
});

app.get('/api/space/me/reading/:id', requireUser, requireProfile, (req, res) => {
  const ctx = spaceContext(req);
  const reading = Submodels.run(req.params.id, ctx);
  if (!reading) return res.status(404).json({ error: 'No such reading.' });
  const mine = activeIds(req.user.id);
  reading.actions.forEach((a) => { a.committed = mine.has(a.id); });
  res.json(reading);
});

// Ask in your own words. Only routing metadata is kept (topic, intent, outcome, models used), never
// the question text: enough to learn what people look for, without holding what they typed.
app.get('/api/ask', requireUser, requireProfile, (req, res) => {
  const ctx = spaceContext(req);
  const ans = Intent.answer(req.query.q, ctx, { focus: readFocus(req.user.id) });
  if (ans.kind === 'empty') return res.status(400).json({ error: 'Ask a question first.' });
  db.prepare('INSERT INTO asks (user_id, kind, boundary, topic, intent, models) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, ans.kind, ans.id || null, ans.understood?.topics?.[0]?.key || null, ans.understood?.intent || null,
    ans.models ? ans.models.map((m) => m.id).join(',') : null);
  if (ans.actions) {
    const mine = activeIds(req.user.id);
    ans.actions.forEach((a) => { a.committed = mine.has(a.id); });
  }
  res.json(ans);
});

app.post('/api/practices', requireUser, requireProfile, (req, res) => {
  const { planet, topic, today } = req.body || {};
  if (!REMEDIES[planet] || !plausibleDay(today)) return res.status(400).json({ error: 'Choose a practice and send today\u2019s date.' });
  const known = new Set(Findings.TOPICS.map((t) => t.key));
  db.prepare(`
    INSERT INTO commitments (user_id, action_id, planet, topic, day, started_on, status) VALUES (?, ?, ?, ?, ?, ?, 'active')
    ON CONFLICT(user_id, action_id) DO UPDATE SET status = 'active', topic = excluded.topic`)
    .run(req.user.id, `act.${planet}`, planet, known.has(topic) ? topic : null, REMEDIES[planet].day, today);
  res.json({ practices: practicesFor(req.user.id, spaceContext(req), today) });
});

app.delete('/api/practices/:actionId', requireUser, requireProfile, (req, res) => {
  const r = db.prepare("UPDATE commitments SET status = 'paused' WHERE user_id = ? AND action_id = ?").run(req.user.id, req.params.actionId);
  if (!r.changes) return res.status(404).json({ error: 'No such practice.' });
  res.json({ practices: practicesFor(req.user.id, spaceContext(req), plausibleDay(req.query.today) ? req.query.today : todayUtc()) });
});

app.post('/api/practices/:actionId/checkin', requireUser, requireProfile, (req, res) => {
  const day = req.body?.day;
  const own = db.prepare("SELECT 1 FROM commitments WHERE user_id = ? AND action_id = ? AND status = 'active'").get(req.user.id, req.params.actionId);
  if (!own) return res.status(404).json({ error: 'Start this practice first.' });
  if (!plausibleDay(day)) return res.status(400).json({ error: 'Send the date you did it.' });
  db.prepare('INSERT OR IGNORE INTO checkins (user_id, action_id, day_done) VALUES (?, ?, ?)').run(req.user.id, req.params.actionId, day);
  res.json({ practices: practicesFor(req.user.id, spaceContext(req), day) });
});

app.delete('/api/practices/:actionId/checkin/:day', requireUser, requireProfile, (req, res) => {
  db.prepare('DELETE FROM checkins WHERE user_id = ? AND action_id = ? AND day_done = ?').run(req.user.id, req.params.actionId, req.params.day);
  res.json({ practices: practicesFor(req.user.id, spaceContext(req), plausibleDay(req.params.day) ? req.params.day : todayUtc()) });
});

// ---------- Ask Vidhya: the AI guide ----------
// Each person's chart, computed only as far as the tools actually ask for it.
function guideWorld(req, todayDate) {
  const memo = (fn) => { let done = false; let value; return () => (done ? value : (done = true, value = fn())); };
  const base = memo(() => chartFor(req.profile));
  const strengths = memo(() => evaluateAll(base().chart));
  const rel = memo(() => relations(base().chart, strengths()));
  const space = memo(() => spaceContext(req));
  const here = livingPlace(req.profile);
  const tz = () => here.tz;
  const clock = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz() });
  const dayName = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz() });
  return {
    profile: publicProfile(req.profile),
    todayDate,
    base, strengths, rel, space,
    detail: memo(() => interpret(base().chart, base().dasha, { visibleTiers: ['open', 'guarded'] })),
    numerology: memo(() => numerologyProfile(req.profile.birth_date, req.profile.full_name)),
    western: memo(() => westernProfile(birthChart(base().utc, base().place.lat, base().place.lon, 'western'))),
    janma: memo(() => janma(base().chart, strengths(), rel(), base().dasha, base().utc, base().place)),
    muhurta(event, days) {
      const { chart } = base();
      const place = here;
      const r = Muhurta.findMuhurta({
        eventKey: event, days, place,
        from: localToUtc(todayDate, '00:00', place.tz),
        natal: { nakshatraIndex: chart.nakshatra.index, moonSignIndex: chart.planets.find((p) => p.name === 'Moon').signIndex },
      });
      const slim = (w) => ({ when: `${dayName(w.start)}, ${clock(w.start)}–${clock(w.end)}`, choghadiya: w.choghadiya, tithi: w.limbs.tithi.label, nakshatra: w.limbs.nakshatra, good: w.good, against: w.bad });
      return { event: r.event.name, place: `${place.name}, ${place.country}`, best: r.best.map(slim), avoid: r.avoid.map((w) => ({ day: dayName(w.start), why: w.bad[0] })) };
    },
    today() {
      const { chart } = base();
      const place = here;
      const p = panchang(localToUtc(todayDate, '12:00', place.tz), place.lat, place.lon);
      const m = p.muhurtas;
      const daily = reading('vedic', chart.planets.find((x) => x.name === 'Moon').signIndex, 'daily');
      const practices = practicesFor(req.user.id, space(), todayDate).filter((x) => x.status === 'active')
        .map((x) => ({ planet: x.planet, day: x.day, dueToday: x.progress.dueToday, doneThisWeek: x.progress.doneThisWeek, tiny: x.plan.tiny }));
      return {
        date: todayDate, place: `${place.name}, ${place.country}`,
        vara: p.vara, tithi: p.tithi.label, nakshatra: p.nakshatra, yoga: p.yoga, karana: p.karana,
        sunrise: p.sunrise && clock(p.sunrise), sunset: p.sunset && clock(p.sunset),
        rahuKaal: m && `${clock(m.rahuKaal.start)}–${clock(m.rahuKaal.end)}`, abhijit: m && `${clock(m.abhijit.start)}–${clock(m.abhijit.end)}`,
        dailyReading: { moonSign: daily.sign, summary: daily.summary, detail: daily.detail },
        practices,
      };
    },
  };
}

// Spend guard: the guide calls a paid API, so each person gets a daily allowance.
const GUIDE_DAILY_LIMIT = Number(process.env.GUIDE_DAILY_LIMIT) || 40;
const guideUse = new Map();
function guideAllowance(userId, day) {
  const u = guideUse.get(userId);
  if (!u || u.day !== day) { guideUse.set(userId, { day, count: 1 }); return true; }
  if (u.count >= GUIDE_DAILY_LIMIT) return false;
  u.count += 1;
  return true;
}

function cleanHistory(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const turns = raw.slice(-20).map((m) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    text: String(m?.text || '').trim().slice(0, m?.role === 'assistant' ? 6000 : 1500),
  })).filter((m) => m.text);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const alternates = turns.every((m, i) => i === 0 || m.role !== turns[i - 1].role);
  return turns.length && alternates && turns.at(-1).role === 'user' ? turns : null;
}

// Without the AI (no credentials configured), answer from the deterministic router instead.
function offlineAnswer(req, question) {
  const ans = Intent.answer(question, spaceContext(req), { focus: readFocus(req.user.id) });
  if (ans.kind === 'fact') return { text: [ans.headline, ...ans.points].join('\n\n'), links: ans.links };
  if (!ans.sections) {
    return { text: ans.message || 'Try asking about one area: work, money, relationships, home, energy, study, travel or inner life.', links: [{ href: '/space', label: 'My space' }] };
  }
  const lines = [ans.headline, ...ans.sections.flatMap((s) => s.findings.slice(0, 2).map((f) => `- ${f.sentence}`))];
  return { text: lines.join('\n'), links: ans.models.slice(0, 2).map((m) => ({ href: `/space?reading=${encodeURIComponent(m.id)}`, label: m.title })) };
}

app.post('/api/guide', requireUser, requireProfile, async (req, res) => {
  const history = cleanHistory(req.body?.messages);
  if (!history) return res.status(400).json({ error: 'Send the conversation, ending with your question.' });
  const mode = req.body?.mode === 'teach' ? 'teach' : 'answer';
  const today = plausibleDay(req.body?.today) ? req.body.today : todayUtc();
  const question = history.at(-1).text;
  const log = (kind, extra = {}) => db.prepare('INSERT INTO asks (user_id, kind, boundary, topic, intent, models) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, kind, extra.boundary || null, extra.topic || null, mode, extra.models || null);

  // Boundaries are decided here, deterministically, and never sent to the model.
  const b = Intent.boundary(question);
  if (b) {
    log('guide-boundary', { boundary: b.id });
    const links = { consult: [{ href: '/consult', label: 'Talk to a priest' }], match: [{ href: '/compatibility', label: 'Open Match' }] }[b.offer] || [];
    return res.json({ text: b.message, links, boundary: b.id });
  }
  if (!guideAllowance(req.user.id, today)) {
    return res.status(429).json({ error: `You have used today's ${GUIDE_DAILY_LIMIT} questions. The guide resets tomorrow; My space still answers in the meantime.` });
  }

  try {
    const out = await Guide.respond(history, guideWorld(req, today), { mode });
    const used = out.used.find((u) => u.startsWith('run_reading:'));
    log('guide', { topic: used ? used.split(':')[1].split('.')[0] : null, models: out.used.join(',') || null });
    res.json({ text: out.text, links: out.links, refused: !!out.refused });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(503).json({ error: 'The guide is busy right now. Try again in a minute.' });
    if (err instanceof Anthropic.APIError && !(err instanceof Anthropic.AuthenticationError) && !(err instanceof Anthropic.PermissionDeniedError)) {
      console.error('guide API error', err.status, err.message);
      return res.status(502).json({ error: 'The guide could not answer just now. Try again shortly.' });
    }
    // Missing or rejected credentials (or no network): fall back so the panel still helps.
    console.error('guide offline:', err.message);
    log('guide-offline');
    res.json({ ...offlineAnswer(req, question), offline: true });
  }
});

app.listen(PORT, () => console.log(`Vidhya running at http://localhost:${PORT}`));
