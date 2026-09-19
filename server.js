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
  if (hasProfile && req.path === '/onboarding' && req.query.edit === undefined) return res.redirect('/home');
  if (req.path === '/') return res.redirect('/home');
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

// ---------- profile ----------
const publicProfile = (p) => p && ({
  fullName: p.full_name, nwaranName: p.nwaran_name, birthDate: p.birth_date, birthTime: p.birth_time, city: p.city,
});

app.get('/api/me', requireUser, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email }, profile: publicProfile(getProfile(req.user.id)) });
});

app.get('/api/cities', (req, res) => {
  res.json(CITIES.map(({ name, country }) => ({ name, country })));
});

app.put('/api/profile', requireUser, (req, res) => {
  const { fullName, nwaranName, birthDate, birthTime, city } = req.body || {};
  const place = CITIES.find((c) => c.name === city);
  if (!fullName?.trim() || !place || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '') || !/^\d{2}:\d{2}$/.test(birthTime || '')) {
    return res.status(400).json({ error: 'Enter your full name, birth date, birth time and birth place.' });
  }
  if (new Date(`${birthDate}T${birthTime}`) > new Date()) {
    return res.status(400).json({ error: 'Birth date and time cannot be in the future.' });
  }
  db.prepare(`
    INSERT INTO profiles (user_id, full_name, nwaran_name, birth_date, birth_time, city)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name, nwaran_name = excluded.nwaran_name, birth_date = excluded.birth_date,
      birth_time = excluded.birth_time, city = excluded.city, updated_at = datetime('now')`)
    .run(req.user.id, fullName.trim(), nwaranName?.trim() || null, birthDate, birthTime, city);
  res.json({ ok: true, next: '/kundli' });
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
  res.json({
    profile: publicProfile(req.profile),
    place: `${place.name}, ${place.country}`,
    utc: utc.toISOString(),
    chart,
    nwaranSuggestion: suggestSyllable(chart.nakshatra.index, chart.nakshatra.pada),
    dasha: { current: slimPeriod(dasha.current), currentAntar: slimPeriod(dasha.currentAntar) },
    reading: sections,
    matchedRules,
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
  const place = CITIES.find((c) => c.name === (req.query.city || profile?.city)) || CITIES[0];
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
  const at = localToUtc(iso, '12:00', place.tz);
  res.json({ date: iso, place: `${place.name}, ${place.country}`, timezone: place.tz, ...panchang(at, place.lat, place.lon) });
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

app.listen(PORT, () => console.log(`Vidhya running at http://localhost:${PORT}`));
