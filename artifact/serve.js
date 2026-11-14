// Serves dist/ for a local look at the built page: node artifact/serve.js [port]
// Open http://localhost:3101/preview.html. Outside a Claude viewer the page saves to this browser only.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.argv[2]) || 3101;
const dist = path.join(__dirname, 'dist');

http.createServer((req, res) => {
  const name = path.basename(decodeURIComponent(new URL(req.url, 'http://x').pathname)) || 'preview.html';
  fs.readFile(path.join(dist, name), (err, body) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
}).listen(port, () => console.log(`Vidhya artifact preview at http://localhost:${port}/preview.html`));
