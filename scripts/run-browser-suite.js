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

function run(file, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(ROOT, file)], { cwd: ROOT, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${file} ${signal ? `stopped by ${signal}` : `exited ${code}`}`)));
  });
}

(async () => {
  const server = createStaticServer({ root: ROOT });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await close(server);
  };
  process.once('SIGINT', () => { shutdown().finally(() => process.exit(130)); });
  process.once('SIGTERM', () => { shutdown().finally(() => process.exit(143)); });
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
