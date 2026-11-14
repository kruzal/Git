// The artifact shell: the person's documents in the Claude artifact store, the in-page API,
// the header, and a router that swaps Vidhya's pages inside this one document.
(() => {
  const Server = __require('server');
  const ROUTES = ['home', 'space', 'kundli', 'year', 'dasha', 'panchang', 'discover', 'onboarding'];
  const LOCAL_KEY = 'vidhya-store';
  const THEME_KEY = 'vidhya-theme';
  const clone = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------------------------ storage
  // Signed in to Claude: one private document per former SQLite table under data/users/<id>.
  // Anywhere else (a page opened outside a Claude viewer, a signed-out visitor): this browser only.
  const Store = {
    mode: 'local', uid: 'local', cache: {}, col: null, chains: {},
    get(key) { return this.cache[key] ?? null; },
    put(key, value) {
      const v = clone(value);
      if (v === null) delete this.cache[key]; else this.cache[key] = v;
      if (this.mode === 'local') {
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.cache)); } catch { /* storage unavailable */ }
        return Promise.resolve();
      }
      // One write at a time per document.
      const ref = this.col.doc(key);
      const write = () => (v === null ? ref.delete() : ref.set(v));
      const next = (this.chains[key] || Promise.resolve()).catch(() => {})
        .then(() => write().catch((err) => (err?.code === 'unavailable' ? pause(400 + Math.random() * 600).then(write) : Promise.reject(err))))
        .catch((err) => {
          if (err?.code === 'quota_exceeded') throw new Error('Your Vidhya storage is full, so this was not saved.');
          throw new Error('This could not be saved to your Claude account. Check your connection and try again.');
        });
      this.chains[key] = next;
      return next;
    },
  };

  async function openStore() {
    const c = window.claude;
    if (c && typeof c.use === 'function') {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      const uid = user ? await user.id() : null;
      if (db && uid) {
        Store.mode = 'claude';
        Store.uid = uid;
        Store.col = db.collection(`data/users/${uid}`);
        const read = () => Store.col.get();
        const snap = await read().catch((err) => (err?.code === 'unavailable' ? pause(800).then(read) : Promise.reject(err)));
        snap.docs.forEach((d) => { Store.cache[d.id] = clone(d.data()); });
        // Changes made on another device arrive here; the next page opened shows them.
        Store.col.onSnapshot((s) => {
          if (s.metadata.hasPendingWrites || s.metadata.fromCache) return;
          const next = {};
          s.docs.forEach((d) => { next[d.id] = clone(d.data()); });
          Store.cache = next;
        }, () => { /* keep the cache we have */ });
        return;
      }
    }
    try { Store.cache = JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { Store.cache = {}; }
  }

  // ------------------------------------------------------------------ in-page API
  Vidhya.api = async (url, options = {}) => {
    const res = await Server.handle({ method: options.method || 'GET', url, body: options.body }, Store);
    if (res.status >= 400) throw new Error(res.data?.error || 'Something went wrong.');
    return res.data;
  };

  // ------------------------------------------------------------------ export
  // My space offers everything as one JSON file: the saved documents as they are stored,
  // plus the chart and dashas worked out from them, so other tools need no astronomy engine.
  const useDownloads = () => (window.claude && typeof window.claude.use === 'function'
    ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null));

  async function exportData() {
    const chart = {};
    for (const [key, url] of [['kundli', '/api/kundli/me'], ['dasha', '/api/dasha/me']]) {
      try { chart[key] = await Vidhya.api(url); } catch { /* no birth details yet */ }
    }
    return { app: 'vidhya', format: 1, exportedAt: new Date().toISOString(), saved: clone(Store.cache), chart };
  }

  async function wireExport(root) {
    const card = root.querySelector('#export-card');
    if (!card) return;
    const downloads = await useDownloads();
    if (!downloads || !root.isConnected) return;
    card.hidden = false;
    const btn = root.querySelector('#export-json');
    const msg = root.querySelector('#export-msg');
    btn.addEventListener('click', async () => {
      msg.textContent = '';
      btn.disabled = true;
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      try {
        const res = await downloads.save({ filename: `vidhya-${day}.json`, data: JSON.stringify(await exportData(), null, 2) });
        msg.textContent = res?.status === 'delivered' ? '' : 'Saved.';
      } catch (err) {
        const code = err?.code;
        if (code === 'declined') msg.textContent = '';
        else if (code === 'rate_limited') msg.textContent = 'A save is already waiting for you to confirm.';
        else { msg.textContent = 'Downloads aren\'t available here.'; btn.hidden = true; }
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ------------------------------------------------------------------ header
  const systemTheme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const currentTheme = () => document.documentElement.dataset.theme || systemTheme();
  function paintToggle() {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const dark = currentTheme() === 'dark';
    btn.textContent = dark ? '☀︎' : '☾︎';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  let route = { path: 'home', search: '' };
  function renderHeader(profile) {
    const link = (href, label) => `<a href="/${href}" class="${route.path === href ? 'active' : ''}">${label}</a>`;
    document.querySelector('.site-header').innerHTML = `
      <nav class="nav">
        <a class="brand" href="/home"><span class="brand-mark">✶</span> Vidhya</a>
        <button class="theme-toggle" type="button"></button>
        ${profile ? `<div class="nav-links">
          ${link('home', 'Today')}
          ${link('space', 'My space')}
          ${link('kundli', 'My kundli')}
          ${link('year', 'My year')}
          ${link('dasha', 'Dasha')}
          ${link('panchang', 'Panchang')}
          ${link('discover', 'Discover')}
        </div>` : ''}
      </nav>
      ${Store.mode === 'local' ? '<p class="store-note">Not signed in to Claude here, so your details are saved in this browser only.</p>' : ''}`;
    document.querySelector('.theme-toggle').addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
      paintToggle();
    });
    paintToggle();
    // On a phone the links scroll sideways; keep the current page in view.
    const links = document.querySelector('.nav-links');
    const active = links?.querySelector('.active');
    if (links && active && links.scrollWidth > links.clientWidth) {
      links.scrollLeft = active.offsetLeft - (links.clientWidth - active.offsetWidth) / 2;
    }
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', paintToggle);
  new MutationObserver(paintToggle).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let guideMounted = false;
  Vidhya.init = async () => {
    const me = await Vidhya.api('/api/me');
    renderHeader(me.profile);
    // The guide needs a chart to read, so it appears once birth details exist.
    if (me.profile && !guideMounted) { guideMounted = true; mountGuide(); }
    return me;
  };

  // ------------------------------------------------------------------ dialogs
  // The viewer shows no alert(), so it is drawn in the page.
  Vidhya.toast = (message) => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('leaving'), 4200);
    setTimeout(() => el.remove(), 4700);
  };

  // ------------------------------------------------------------------ router
  const app = document.getElementById('app');
  let current = null;

  // Each page script runs as it did on its own page, but `document` lookups reach only its
  // own view, so a slow request from a page already left never writes into the next one.
  function scopedDocument(root) {
    const own = {
      getElementById: (id) => root.querySelector(`#${CSS.escape(id)}`),
      querySelector: (sel) => root.querySelector(sel),
      querySelectorAll: (sel) => root.querySelectorAll(sel),
      body: root,
    };
    return new Proxy(document, {
      get(target, key) {
        if (key in own) return own[key];
        const v = Reflect.get(target, key);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }

  function parse(href) {
    const u = new URL(href, 'https://vidhya.invalid/');
    return { path: u.pathname.replace(/^\/+|\/+$|\.html$/g, ''), search: u.search };
  }

  // The same gates the server put in front of every page.
  function resolve({ path, search }) {
    let p = path || 'home';
    if (p === 'priorities') p = 'space';
    if (!ROUTES.includes(p)) p = 'home';
    if (!Store.get('profile')) return { path: 'onboarding', search: '' };
    if (p === 'onboarding' && !new URLSearchParams(search).has('edit')) return { path: 'home', search: '' };
    return { path: p, search: p === 'onboarding' || p === 'kundli' || p === 'space' ? search : '' };
  }

  function show(next) {
    route = next;
    if (current) current.remove();
    document.querySelectorAll('.sky-veil').forEach((el) => el.remove());
    const view = VIEWS[route.path];
    const root = document.createElement('div');
    root.className = 'view';
    root.dataset.view = route.path;
    root.innerHTML = view.html;
    app.replaceChildren(root);
    current = root;
    window.scrollTo(0, 0);
    const loc = {
      pathname: `/${route.path}`, search: route.search, hash: '',
      get href() { return `/${route.path}${route.search}`; },
      set href(v) { go(v); },
      assign: (v) => go(v),
      replace: (v) => go(v, { replace: true }),
      reload: () => show(route),
    };
    view.run(scopedDocument(root), loc, (message) => Vidhya.toast(String(message)));
    wireExport(root);
  }

  function go(href, { replace = false } = {}) {
    const next = resolve(parse(href));
    try {
      const state = { href: `/${next.path}${next.search}` };
      if (replace) history.replaceState(state, '', `#${next.path}`); else history.pushState(state, '', `#${next.path}`);
    } catch { /* history unavailable in this frame */ }
    show(next);
  }
  Vidhya.go = go;

  document.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    const a = ev.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('/') && !href.startsWith('//')) { ev.preventDefault(); go(href); }
  });
  window.addEventListener('popstate', (ev) => {
    const href = ev.state?.href || `/${location.hash.slice(1)}`;
    show(resolve(parse(href)));
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const msg = ev.reason?.message;
    if (msg) Vidhya.toast(msg);
  });

  // ------------------------------------------------------------------ boot
  (async () => {
    try {
      await openStore();
    } catch {
      Store.mode = 'local';
      try { Store.cache = JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { Store.cache = {}; }
    }
    const token = location.hash.slice(1);
    go(`/${/^[a-z]+$/.test(token) ? token : 'home'}`, { replace: true });
  })();
})();
