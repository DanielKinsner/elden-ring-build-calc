#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { ROOT, createStaticServer, listen, close } = require('./static-server');

const tests = process.argv.slice(2);
if (!tests.length) {
  console.error('usage: node scripts/run-browser-suite.js tests/example.browser.test.js [...]');
  process.exit(2);
}

let activeChild = null;
let shuttingDown = false;

function run(file, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(ROOT, file)], { cwd: ROOT, env, stdio:['inherit', 'inherit', 'inherit', 'ipc'] });
    activeChild = child;
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (activeChild === child) activeChild = null;
      (code === 0 || shuttingDown) ? resolve() : reject(new Error(`${file} ${signal ? `stopped by ${signal}` : `exited ${code}`}`));
    });
  });
}

function stopActiveChild() {
  if (!activeChild || activeChild.exitCode != null || activeChild.signalCode) return Promise.resolve();
  const child = activeChild;
  return new Promise(resolve => {
    const done = () => resolve();
    child.once('exit', done);
    const fallback = setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) { done(); } }, 5000);
    fallback.unref();
    // Browser tests receive this platform-neutral graceful-stop message and close only their own
    // Playwright browsers/temp files. A bounded direct-child SIGTERM fallback avoids a hung child.
    if (child.connected) child.send({ type:'shutdown' }, error => { if (error) { try { child.kill('SIGTERM'); } catch (_) { done(); } } });
    else { try { child.kill('SIGTERM'); } catch (_) { done(); } }
  });
}

(async () => {
  const server = createStaticServer({ root: ROOT });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    shuttingDown = true;
    await stopActiveChild();
    await close(server);
  };
  let exitRequested = false;
  const requestExit = async (code) => {
    if (exitRequested) return;
    exitRequested = true;
    await shutdown();
    process.exit(code);
  };
  process.once('SIGINT', () => { requestExit(130); });
  process.once('SIGTERM', () => { requestExit(143); });
  // IPC is a platform-neutral test/control path that exercises the exact same cleanup sequence.
  // It is useful on Windows, where child.kill('SIGTERM') force-terminates rather than delivering
  // a catchable signal to Node. Normal package scripts do not create an IPC channel.
  if (process.send) process.on('message', message => {
    if (message && message.type === 'shutdown') requestExit(143);
  });
  try {
    const address = await listen(server, 0);
    const origin = `http://127.0.0.1:${address.port}`;
    console.log(`\nBrowser suite server: ${origin} (temporary port; uncompressed)\n`);
    const env = { ...process.env, ER_SITE_ORIGIN: origin, ER_SITE_URL: origin + '/build/' };
    for (const file of tests) await run(file, env);
  } finally {
    await shutdown();
  }
})().catch((error) => { console.error(`\nBrowser suite failed: ${error.message}`); process.exit(1); });
