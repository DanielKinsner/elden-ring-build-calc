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
const GRACE_MS = Number(process.env.ER_RUNNER_GRACE_MS || 5000);
const TERMINATE_MS = Number(process.env.ER_RUNNER_TERMINATE_MS || 3000);

function waitForExit(child, timeout) {
  return new Promise(resolve => {
    if (child.exitCode != null || child.signalCode) { resolve(true); return; }
    const timer = setTimeout(() => { child.off('exit', exited); resolve(false); }, timeout);
    const exited = () => { clearTimeout(timer); resolve(true); };
    child.once('exit', exited);
  });
}

function signalChild(child, signal) {
  try { return child.kill(signal); }
  catch (_) { return false; }
}

function run(file, env) {
  if (shuttingDown) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    if (shuttingDown) { resolve(false); return; }
    const child = spawn(process.execPath, [path.resolve(ROOT, file)], { cwd: ROOT, env, stdio:['inherit', 'inherit', 'inherit', 'ipc'] });
    activeChild = child;
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (activeChild === child) activeChild = null;
      (code === 0 || shuttingDown) ? resolve(!shuttingDown) : reject(new Error(`${file} ${signal ? `stopped by ${signal}` : `exited ${code}`}`));
    });
  });
}

function stopActiveChild() {
  if (!activeChild || activeChild.exitCode != null || activeChild.signalCode) return Promise.resolve();
  const child = activeChild;
  return (async () => {
    // Browser tests receive this platform-neutral graceful-stop message and close only their own
    // Playwright browsers/temp files. No broad process-tree signal is ever sent.
    if (child.connected) {
      try {
        child.send({ type:'shutdown' }, () => {});
      } catch {
        // The child can disconnect between checking `connected` and sending.
      }
    }
    if (await waitForExit(child, GRACE_MS)) return;
    console.error(`Browser suite: ${path.basename(child.spawnargs[1] || 'child')} ignored graceful shutdown after ${GRACE_MS}ms; sending direct SIGTERM.`);
    signalChild(child, 'SIGTERM');
    if (await waitForExit(child, TERMINATE_MS)) return;
    console.error(`Browser suite: direct child still running after ${TERMINATE_MS}ms; sending direct SIGKILL.`);
    signalChild(child, 'SIGKILL');
    if (!await waitForExit(child, TERMINATE_MS)) console.error('Browser suite: direct child did not report exit after SIGKILL; continuing shutdown without a broad process-tree kill.');
  })();
}

(async () => {
  const server = createStaticServer({ root: ROOT, stallPath:process.env.ER_STATIC_SERVER_STALL_PATH });
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
    if (shuttingDown) return;
    const origin = `http://127.0.0.1:${address.port}`;
    console.log(`\nBrowser suite server: ${origin} (temporary port; uncompressed)\n`);
    const env = { ...process.env, ER_SITE_ORIGIN: origin, ER_SITE_URL: origin + '/build/' };
    for (const file of tests) {
      if (shuttingDown) break;
      await run(file, env);
      if (shuttingDown) break;
    }
  } finally {
    await shutdown();
  }
})().catch((error) => { console.error(`\nBrowser suite failed: ${error.message}`); process.exit(1); });
