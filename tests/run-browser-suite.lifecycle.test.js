#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const runner = path.join(ROOT, 'scripts', 'run-browser-suite.js');

function request(origin) {
  return new Promise(resolve => http.get(origin, response => { response.resume(); resolve(true); }).once('error', () => resolve(false)));
}
function waitFor(child, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} reject(new Error(`process did not exit within ${timeout}ms`)); }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
}
function ready(output) {
  const match = output.match(/\{"type":"ready","artifact":"([^"]+)","proof":"([^"]+)"\}/);
  return match && { artifact:match[1], proof:match[2] };
}
async function directSignal(signal) {
  const child = spawn(process.execPath, ['tests/fixtures/tracked-browser.browser.test.js'], { cwd:ROOT, env:{ ...process.env, LIFECYCLE_SIGNAL:signal }, stdio:['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const result = await waitFor(child);
  const state = ready(output);
  assert(state, `${signal} fixture reported its tracked browser and temporary artifact`);
  assert.strictEqual(result.code, signal === 'SIGINT' ? 130 : 143, `${signal} exits through browser lifecycle cleanup`);
  assert.strictEqual(fs.existsSync(state.artifact), false, `${signal} removes the registered temporary artifact (${state.artifact}); output was:\n${output}`);
  assert.strictEqual(fs.readFileSync(state.proof, 'utf8'), 'browser disconnected', `${signal} closes the actual tracked Playwright browser`);
  fs.rmSync(state.proof, { force:true });
}
async function deliveredPosixSignal(signal) {
  const child = spawn(process.execPath, ['tests/fixtures/tracked-browser.browser.test.js'], { cwd:ROOT, env:process.env, stdio:['ignore', 'pipe', 'pipe'] });
  let output = '';
  const state = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${signal} fixture did not become ready`)), 10000);
    const receive = chunk => {
      output += chunk;
      const readyState = ready(output);
      if (readyState) { clearTimeout(timer); resolve(readyState); }
    };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.once('error', reject);
  });
  child.kill(signal);
  const result = await waitFor(child);
  assert.strictEqual(result.code, signal === 'SIGINT' ? 130 : 143, `${signal} is delivered to the browser lifecycle handler on POSIX`);
  assert.strictEqual(fs.existsSync(state.artifact), false, `${signal} removes the registered temporary artifact after OS delivery`);
  assert.strictEqual(fs.readFileSync(state.proof, 'utf8'), 'browser disconnected', `${signal} closes the actual tracked browser after OS delivery`);
  fs.rmSync(state.proof, { force:true });
}
async function runnerCase(fixture, options = {}) {
  const child = spawn(process.execPath, [runner, fixture], { cwd:ROOT, env:{ ...process.env, ...options.env }, stdio:['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '', origin, sent = false;
  child.stdout.on('data', chunk => {
    output += chunk;
    const match = output.match(/Browser suite server: (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) origin = match[1];
    if (options.shutdownWhen && !sent && output.includes(options.shutdownWhen) && child.connected) { sent = true; child.send({ type:'shutdown' }); }
  });
  child.stderr.on('data', chunk => { output += chunk; });
  const result = await waitFor(child);
  return { result, output, origin };
}

(async () => {
  const graceful = await runnerCase('tests/fixtures/tracked-browser.browser.test.js', { shutdownWhen:'"type":"ready"' });
  const gracefulState = ready(graceful.output);
  assert(graceful.origin && gracefulState, `runner reported a server plus actual tracked-browser fixture state; output was:\n${graceful.output}`);
  assert.strictEqual(graceful.result.code, 143, 'runner graceful IPC shutdown retains its SIGTERM-equivalent status');
  assert.strictEqual(fs.existsSync(gracefulState.artifact), false, 'runner IPC shutdown removes the browser fixture artifact');
  assert.strictEqual(fs.readFileSync(gracefulState.proof, 'utf8'), 'browser disconnected', 'runner IPC shutdown closes the actual tracked Playwright browser');
  fs.rmSync(gracefulState.proof, { force:true });
  assert.strictEqual(await request(graceful.origin), false, 'runner graceful shutdown closes its temporary server');

  await directSignal('SIGINT');
  await directSignal('SIGTERM');
  if (process.platform !== 'win32') {
    await deliveredPosixSignal('SIGINT');
    await deliveredPosixSignal('SIGTERM');
  }

  const stubborn = await runnerCase('tests/fixtures/ignore-shutdown.browser.test.js', { shutdownWhen:'fixture ready', env:{ ER_RUNNER_GRACE_MS:'100', ER_RUNNER_TERMINATE_MS:'100' } });
  assert.strictEqual(stubborn.result.code, 143, 'unresponsive child is bounded and runner exits with shutdown status');
  assert(stubborn.output.includes('ignored graceful shutdown after 100ms') && (process.platform === 'win32' || stubborn.output.includes('direct child still running after 100ms')), `unresponsive child produces actionable escalation output; output was:\n${stubborn.output}`);
  assert.strictEqual(await request(stubborn.origin), false, 'runner closes the server after forced direct-child termination');

  const nonzero = await runnerCase('tests/fixtures/nonzero.browser.test.js');
  assert.strictEqual(nonzero.result.code, 1, 'nonzero browser child propagates a failing runner exit status');
  assert(nonzero.output.includes('exited 7'), 'nonzero browser child failure names its exit code');
  assert.strictEqual(await request(nonzero.origin), false, 'runner closes the server after a nonzero child exit');

  console.log('browser-suite lifecycle cases passed');
})().catch(error => { console.error(error.stack); process.exit(1); });
