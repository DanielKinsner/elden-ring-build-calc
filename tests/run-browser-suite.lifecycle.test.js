#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const runner = path.join(ROOT, 'scripts', 'run-browser-suite.js');
const fixture = 'tests/fixtures/signal-wait.browser.test.js';

function request(origin) {
  return new Promise(resolve => http.get(origin, response => { response.resume(); resolve(true); }).once('error', () => resolve(false)));
}

(async () => {
  const child = spawn(process.execPath, [runner, fixture], { cwd:ROOT, stdio:['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '', origin;
  child.stdout.on('data', chunk => {
    output += chunk;
    const match = output.match(/Browser suite server: (http:\/\/127\.0\.0\.1:\d+)/);
    if (match && !origin) origin = match[1];
    if (output.includes('fixture ready') && child.connected) child.send({ type:'shutdown' });
  });
  child.stderr.on('data', chunk => { output += chunk; });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  assert(origin, 'runner reported its temporary server origin before shutdown');
  assert(output.includes('fixture received shutdown'), `runner terminates its active child before closing the server; output was:\n${output}`);
  assert.strictEqual(result.code, 143, `runner exits with the SIGTERM status (got ${result.code}/${result.signal})`);
  assert.strictEqual(await request(origin), false, 'runner closes its temporary static server after signal shutdown');
  console.log('browser-suite signal lifecycle passed');
})().catch(error => { console.error(error.stack); process.exit(1); });
