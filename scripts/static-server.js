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
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    // Test-only fixture hook used to prove close() cannot wait forever on an active loopback socket.
    if (options.stallPath && pathname === options.stallPath) {
      response.writeHead(200, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' });
      response.write('stalled');
      return;
    }
    const file = fileForRequest(pathname, root);
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
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  // Keep ownership local to this server; shutdown never discovers or touches unrelated sockets.
  Object.defineProperty(server, '__staticServerSockets', { value:sockets });
  return server;
}

function listen(server, port = 4173, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
  });
}

function timeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function close(server, options = {}) {
  const graceMs = timeout(options.graceMs ?? process.env.ER_STATIC_SERVER_CLOSE_GRACE_MS, 2000);
  const forceMs = timeout(options.forceMs ?? process.env.ER_STATIC_SERVER_CLOSE_FORCE_MS, 1000);
  const sockets = server.__staticServerSockets || new Set();
  if (!server.listening) {
    for (const socket of sockets) socket.destroy();
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let settled = false;
    let graceTimer;
    let forceTimer;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(graceTimer); clearTimeout(forceTimer);
      resolve();
    };
    const forceClose = () => {
      forceTimer = setTimeout(settle, forceMs);
      // Node supplies these on supported releases. The owned-socket fallback keeps the same
      // bounded semantics on older releases without killing any process or foreign connection.
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
    };
    graceTimer = setTimeout(forceClose, graceMs);
    try { server.close(settle); }
    catch (_) { settle(); }
  });
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
