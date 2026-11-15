// Shared helpers: theme, header, API calls and formatting.
const Vidhya = (() => {
  const THEME_KEY = 'vidhya-theme';
  const GLYPHS = ['♈︎', '♉︎', '♊︎', '♋︎', '♌︎', '♍︎', '♎︎', '♏︎', '♐︎', '♑︎', '♒︎', '♓︎'];
  const VEDIC_ENGLISH = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
  };

  const currentTheme = () => document.documentElement.dataset.theme;

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    store.set(THEME_KEY, theme);
    const btn = document.querySelector('.theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀︎' : '☾︎';
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  function renderHeader(profile) {
    const page = location.pathname.replace(/^\/|\.html$/g, '') || 'home';
    const link = (href, label) => `<a href="/${href}" class="${page === href ? 'active' : ''}">${label}</a>`;
    document.querySelector('.site-header').innerHTML = `
      <nav class="nav">
        <a class="brand" href="/home"><span class="brand-mark">✶</span> Vidhya</a>
        <div class="nav-links">
          ${profile ? `
            ${link('home', 'Today')}
            ${link('space', 'My space')}
            ${link('kundli', 'My kundli')}
            ${link('year', 'My year')}
            ${link('dasha', 'Dasha')}
            ${link('panchang', 'Panchang')}
            ${link('discover', 'Discover')}
            ${link('consult', 'Consult')}
            ${link('account', 'Account')}
            <a href="#" id="logout-link">Log out</a>` : ''}
          <button class="theme-toggle" type="button"></button>
        </div>
      </nav>`;
    document.querySelector('.theme-toggle').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
    setTheme(currentTheme());
    document.getElementById('logout-link')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/api/auth/logout', { method: 'POST' });
      location.href = '/login';
    });
  }

  // Loads the signed-in user and their birth profile, then draws the header.
  async function init({ anonymous = false } = {}) {
    if (anonymous) { renderHeader(null); return null; }
    let me = null;
    try { me = await api('/api/me'); } catch { location.href = '/login'; return null; }
    renderHeader(me.profile);
    // The guide needs a chart to read, so it appears once birth details exist.
    if (me.profile && !document.querySelector('script[data-guide]')) {
      const s = document.createElement('script');
      s.src = '/js/guide.js';
      s.dataset.guide = '';
      document.body.appendChild(s);
    }
    return me;
  }

  function bindSegmented(container, value, onChange) {
    const buttons = [...container.querySelectorAll('button')];
    const sync = (v) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
    sync(value);
    buttons.forEach((b) => b.addEventListener('click', () => { sync(b.dataset.value); onChange(b.dataset.value); }));
  }

  // Full-screen interstitial for the moment a chart is being calculated.
  function skyVeil(messages) {
    const el = document.createElement('div');
    el.className = 'sky-veil';
    el.innerHTML = `<div><div class="orbit"><i></i><i></i></div><p class="status">${messages[0]}</p></div>`;
    document.body.appendChild(el);
    const status = el.querySelector('.status');
    let i = 0;
    const cycle = setInterval(() => { i = (i + 1) % messages.length; status.textContent = messages[i]; }, 900);
    const started = Date.now();
    return {
      // Keeps the moment on screen long enough to feel deliberate, never longer than needed.
      async done(minimumMs = 2200) {
        await new Promise((r) => setTimeout(r, Math.max(0, minimumMs - (Date.now() - started))));
        clearInterval(cycle);
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 600);
      },
    };
  }

  // One finding, one sentence. The same markup everywhere a finding is shown, so a
  // sentence looks and scores identically on the home page and the priorities page.
  const KIND_LABEL = { strength: 'works for you', challenge: 'needs care', pattern: 'pattern', timing: 'live now' };
  const SYSTEM_LABEL = { western: 'Western astrology', numbers: 'Numerology' };
  const COMPONENT_LABEL = { salience: 'planet salience', house: 'house weight', activation: 'activation now', convergence: 'convergence', actionability: 'actionable' };
  function findingHtml(f, { why = true, action = true } = {}) {
    const esc = escapeHtml;
    return `<div class="finding">
      <p class="finding-sentence">${esc(f.sentence)}</p>
      <div class="finding-meta">
        <span class="band kind--${f.kind}">${KIND_LABEL[f.kind] || f.kind}</span>
        ${SYSTEM_LABEL[f.system] ? `<span class="band band--working">${SYSTEM_LABEL[f.system]}</span>` : ''}
        ${f.tier === 'guarded' ? '<span class="band band--strained">a tendency, not a verdict</span>' : ''}
        <span class="power" title="Power: how much this matters in your chart right now, 0 to 100">
          <span class="power-track"><span class="power-fill" style="display:block;width:${f.power}%"></span></span>
          <span>power <strong>${f.power}</strong></span>
        </span>
      </div>
      ${action && f.action ? `<div class="do-this"><b>Do this</b> ${esc(f.action.text)} <span class="hint" style="display:inline">Best on ${esc(f.action.day)}.</span></div>` : ''}
      ${why ? `<details><summary>How this was scored</summary><div class="why">
        ${Object.entries(f.components).map(([k, v]) => `${COMPONENT_LABEL[k]} ${v}`).join(' · ')}<br>
        measured from <code>${f.basis.map(esc).join('</code>, <code>')}</code></div></details>` : ''}
    </div>`;
  }

  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const degrees = (d) => `${Math.floor(d)}°${String(Math.floor((d % 1) * 60)).padStart(2, '0')}′`;
  const prettyDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  // Panchang timings belong to the place, not to whoever is looking — always pass its time zone.
  const clockTime = (iso, timeZone) => (iso
    ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) })
    : '—');
  const firstName = (name) => String(name || '').trim().split(/\s+/)[0];

  return { init, api, skyVeil, GLYPHS, VEDIC_ENGLISH, bindSegmented, stars, escapeHtml, degrees, prettyDate, clockTime, firstName, findingHtml };
})();
