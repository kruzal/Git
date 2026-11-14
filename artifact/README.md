# Vidhya as a claude.ai Artifact

The same app as `server.js`, packed into one private Artifact page so it runs on a phone and
saves to the signed-in Claude account. The Node server is untouched and still works on its own.

- `build.js` bundles `lib/`, `public/js/` and the page scripts from `public/*.html` into
  `dist/vidhya.html` (to publish) and `dist/preview.html` (to open locally). Run `node artifact/build.js`.
- `src/server.js` is the in-page copy of the API routes in `server.js`; keep the two in step.
- `src/shell.js` routes between the pages, stores data, and draws the header.
- `serve.js` serves `dist/` on port 3101 for a local look (`node artifact/serve.js`).

What changes inside the Artifact:

- No login or sign-up page: the Claude account is the login. Each person's profile, focus,
  practices and check-ins are private documents under `data/users/<id>/` in the
  Artifact's `db` store.
- Ask Vidhya answers through the Artifact's `sample` capability (the viewer's own Claude usage)
  with the same tools as `lib/guide.js`, so no API key is needed. Without it, the built-in
  reader answers, as the server does when no key is set.
- Consult (priests and bookings) is left out; it exists only in the server app.
- My space has "Download everything (JSON)" through the `downloads` capability:
  `{ app, format: 1, exportedAt, saved: { profile, focus, practices, asks }, chart: { kundli, dasha } }`.
  `saved` holds the documents exactly as stored; `chart` is the `/api/kundli/me` and `/api/dasha/me` answers,
  so another tool can read the chart without the astronomy engine.

Publish with capabilities `db`, `user`, `sample` and `downloads`.
