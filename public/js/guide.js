// Ask Vidhya — the guide panel, mounted on every signed-in page by app.js.
// The conversation lives in sessionStorage: it follows the person across pages in this tab
// and is gone when the tab closes. The server keeps none of it.
(() => {
  const KEY = 'vidhya-guide';
  const e = Vidhya.escapeHtml;
  const localDay = () => new Date().toLocaleDateString('en-CA');
  const narrow = () => matchMedia('(max-width: 700px)').matches;

  const STARTERS = {
    answer: [
      'What is my chart already good at?',
      'Where does my career energy go?',
      'Find me a good day to start something new',
      'What is live for me right now?',
    ],
    teach: [
      'Teach me to read my lagna',
      'How do I read a house? Use my 10th',
      'What is a dasha, and which one am I in?',
      'What is a nakshatra? Use mine',
    ],
  };

  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; } };
  const st = { open: false, mode: 'answer', messages: [], busy: false, ...(load() || {}) };
  st.busy = false;
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ open: st.open, mode: st.mode, messages: st.messages })); } catch { /* storage unavailable */ } };

  // Tiny, safe markup: escape everything, then allow internal links, **bold** and "- " bullets.
  function markup(text) {
    const inline = (s) => e(s)
      .replace(/\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g, (m, label, href) => `<a href="${href}">${label}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return String(text).split(/\n{2,}/).map((block) => {
      const lines = block.split('\n').filter((l) => l.trim());
      if (lines.length && lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    }).join('');
  }

  const root = document.createElement('div');
  root.className = 'guide';
  root.innerHTML = `
    <button type="button" class="guide-fab" aria-expanded="false" aria-controls="guide-panel"><span aria-hidden="true">✶</span> Ask Vidhya</button>
    <section class="guide-panel" id="guide-panel" role="dialog" aria-label="Ask Vidhya" hidden>
      <header class="guide-head">
        <div class="guide-title"><strong>Ask Vidhya</strong><span>Reads your own chart</span></div>
        <div class="segmented guide-mode" role="group" aria-label="Mode">
          <button type="button" data-value="answer">Answer</button>
          <button type="button" data-value="teach">Teach me</button>
        </div>
        <button type="button" class="guide-x" aria-label="Close">×</button>
      </header>
      <div class="guide-log" aria-live="polite"></div>
      <form class="guide-form" autocomplete="off">
        <textarea rows="1" maxlength="1500" aria-label="Your question"></textarea>
        <button class="btn small" type="submit">Send</button>
      </form>
      <p class="guide-foot">Kept only in this tab · <button type="button" class="guide-clear">Start over</button></p>
    </section>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const fab = $('.guide-fab'), panel = $('.guide-panel'), log = $('.guide-log'), input = $('textarea');

  function render() {
    panel.hidden = !st.open;
    fab.setAttribute('aria-expanded', String(st.open));
    fab.classList.toggle('is-open', st.open);
    root.querySelectorAll('.guide-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === st.mode)));
    input.placeholder = st.mode === 'teach' ? 'What would you like to learn? Your chart is the example.' : 'Ask anything about your chart…';

    const intro = st.mode === 'teach'
      ? '<p>Pick something to learn. I will teach it with <strong>your own chart</strong> as the example, then give you something to try reading yourself.</p>'
      : '<p>Ask in your own words — about work, love, money, timing, a planet, a house — and I will find it in your chart and show you where to look.</p>';
    log.innerHTML = (st.messages.length ? '' : `<div class="guide-msg from-guide">${intro}</div>`)
      + st.messages.map((m) => (m.role === 'user'
        ? `<div class="guide-msg from-you">${e(m.text)}</div>`
        : `<div class="guide-msg from-guide">${markup(m.text)}
            ${m.links?.length ? `<div class="guide-links">${m.links.map((l) => `<a class="chip" href="${e(l.href)}">${e(l.label)} →</a>`).join('')}</div>` : ''}
            ${m.note ? `<p class="guide-note">${e(m.note)}</p>` : ''}</div>`)).join('')
      + (st.busy ? '<div class="guide-msg from-guide is-busy"><span class="guide-dots"><i></i><i></i><i></i></span> Reading your chart…</div>' : '')
      + (!st.busy && (!st.messages.length || st.messages.at(-1).role === 'assistant')
        ? `<div class="guide-starters">${STARTERS[st.mode].map((q) => `<button type="button" data-q="${e(q)}">${e(q)}</button>`).join('')}</div>` : '');
    log.scrollTop = log.scrollHeight;
    $('.guide-form button').disabled = st.busy;
  }

  async function send(text) {
    text = text.trim();
    if (!text || st.busy) return;
    st.messages.push({ role: 'user', text });
    st.busy = true; input.value = ''; render(); save();
    try {
      const r = await Vidhya.api('/api/guide', {
        method: 'POST',
        body: { messages: st.messages.map(({ role, text: t }) => ({ role, text: t })), mode: st.mode, today: localDay() },
      });
      st.messages.push({
        role: 'assistant', text: r.text, links: r.links || [],
        note: r.offline ? 'The AI guide is not connected yet, so this came from Vidhya\'s built-in reader.' : null,
      });
    } catch (err) {
      // Undo the unanswered question so the conversation stays in turn order, and give it back.
      st.messages.pop();
      input.value = text;
      log.insertAdjacentHTML('beforeend', `<div class="guide-msg from-guide is-error">${e(err.message)}</div>`);
    } finally {
      st.busy = false; save();
      const err = log.querySelector('.is-error')?.outerHTML || '';
      render();
      if (err) log.insertAdjacentHTML('beforeend', err);
    }
  }

  const toggle = (open = !st.open) => { st.open = open; save(); render(); if (open) setTimeout(() => input.focus(), 50); };
  fab.addEventListener('click', () => toggle());
  $('.guide-x').addEventListener('click', () => toggle(false));
  root.querySelectorAll('.guide-mode button').forEach((b) => b.addEventListener('click', () => { st.mode = b.dataset.value; save(); render(); input.focus(); }));
  $('.guide-clear').addEventListener('click', () => { st.messages = []; save(); render(); input.focus(); });
  $('.guide-form').addEventListener('submit', (ev) => { ev.preventDefault(); send(input.value); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; });
  log.addEventListener('click', (ev) => {
    const q = ev.target.closest('[data-q]');
    if (q) { send(q.dataset.q); return; }
    // On a phone the panel covers the page, so step aside when a link is followed.
    if (ev.target.closest('a') && narrow()) { st.open = false; save(); }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && st.open) toggle(false); });

  render();
})();
