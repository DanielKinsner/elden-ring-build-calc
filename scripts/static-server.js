#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

function fileForRequest(urlPath, root) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (_) { return null; }
  const relative = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(root, relative || 'index.html');
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  try {
    return fs.statSync(candidate).isDirectory() ? path.join(candidate, 'index.html') : candidate;
  } catch (_) {
    return candidate;
  }
}

function createStaticServer(options = {}) {
  const root = path.resolve(options.root || ROOT);
  return http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    const file = fileForRequest(new URL(request.url, 'http://localhost').pathname, root);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    if (request.method === 'HEAD') { response.end(); return; }
    fs.createReadStream(file).on('error', () => { response.destroy(); }).pipe(response);
  });
}

function listen(server, port = 4173, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise(resolve => server.close(resolve));
}

module.exports = { ROOT, createStaticServer, listen, close };

if (require.main === module) {
  const server = createStaticServer();
  const port = Number(process.env.PORT || 4173);
  listen(server, port).then((address) => {
    console.log(`Static site: http://127.0.0.1:${address.port}/ (uncompressed; Ctrl+C to stop)`);
  }).catch((error) => { console.error(error.stack); process.exit(1); });
  const stop = () => close(server).finally(() => process.exit());
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
