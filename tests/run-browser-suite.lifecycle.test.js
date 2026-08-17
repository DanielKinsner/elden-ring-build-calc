#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const runner = path.join(ROOT, 'scripts', 'run-browser-suite.js');
const spawnAudit = path.join(ROOT, 'tests', 'fixtures', 'spawn-attempt-audit.js');

function request(origin, timeout = 2000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const client = http.get(origin, response => { response.resume(); finish(true); });
    const timer = setTimeout(() => { client.destroy(); finish(false); }, timeout);
    client.setTimeout(timeout, () => { client.destroy(); finish(false); });
    client.once('error', () => finish(false));
  });
}
function stalledRequest(origin, timeout = 2000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => { if (!settled) { settled = true; clearTimeout(timer); client.destroy(); reject(error); } };
    const client = http.get(new URL('/__lifecycle-stall', origin), response => {
      response.once('data', () => { if (!settled) { settled = true; clearTimeout(timer); resolve({ client, response }); } });
      response.once('error', fail);
    });
    const timer = setTimeout(() => fail(new Error(`stalled request did not receive a response within ${timeout}ms`)), timeout);
    client.setTimeout(timeout, () => fail(new Error(`stalled request timed out after ${timeout}ms`)));
    client.once('error', fail);
  });
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
function requestRunnerShutdown(child, signal) {
  if (signal && process.platform !== 'win32') child.kill(signal);
  else if (child.connected) child.send({ type:'shutdown' });
}
async function runnerCase(fixtures, options = {}) {
  const files = Array.isArray(fixtures) ? fixtures : [fixtures];
  const child = spawn(process.execPath, [options.runner || runner, ...files], { cwd:ROOT, env:{ ...process.env, ...options.env }, stdio:['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '', origin, sent = false;
  child.stdout.on('data', chunk => {
    output += chunk;
    const match = output.match(/Browser suite server: (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) origin = match[1];
    if (options.shutdownWhen && !sent && output.includes(options.shutdownWhen)) { sent = true; requestRunnerShutdown(child, options.signal); }
  });
  child.stderr.on('data', chunk => { output += chunk; });
  const result = await waitFor(child);
  return { result, output, origin };
}
function auditedEnv(attempts, values = {}, auditTarget = runner) {
  const preload = `--require "${spawnAudit.replace(/\\/g, '/')}"`;
  return {
    ...values,
    LIFECYCLE_SPAWN_ATTEMPTS:attempts,
    LIFECYCLE_SPAWN_AUDIT_TARGET:auditTarget,
    NODE_OPTIONS:[process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ')
  };
}
function spawnAttempts(attempts) {
  return fs.existsSync(attempts) ? fs.readFileSync(attempts, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line).target) : [];
}
function mutateRunnerWithoutShutdownGuards() {
  const original = fs.readFileSync(runner, 'utf8');
  const mutated = original
    .replace("require('./static-server')", `require(${JSON.stringify(path.join(ROOT, 'scripts', 'static-server.js'))})`)
    .replace('  if (shuttingDown) return Promise.resolve(false);\n', '')
    .replace('    if (shuttingDown) { resolve(false); return; }\n', '')
    .replace('    if (shuttingDown) return;\n', '')
    .replace(/      if \(shuttingDown\) break;\n/g, '');
  const mutant = path.join(os.tmpdir(), `tarnished-runner-no-shutdown-guard-${process.pid}.js`);
  fs.writeFileSync(mutant, mutated);
  return mutant;
}
async function stalledServerCase() {
  const child = spawn(process.execPath, [runner, 'tests/fixtures/ignore-shutdown.browser.test.js'], {
    cwd:ROOT,
    env:{ ...process.env, ER_RUNNER_GRACE_MS:'100', ER_RUNNER_TERMINATE_MS:'100', ER_STATIC_SERVER_STALL_PATH:'/__lifecycle-stall', ER_STATIC_SERVER_CLOSE_GRACE_MS:'100', ER_STATIC_SERVER_CLOSE_FORCE_MS:'100' },
    stdio:['ignore', 'pipe', 'pipe', 'ipc']
  });
  let output = '', origin, started = false, held;
  const begin = async () => {
    if (started || !origin) return;
    started = true;
    held = await stalledRequest(origin);
    if (child.connected) child.send({ type:'shutdown' });
  };
  child.stdout.on('data', chunk => {
    output += chunk;
    const match = output.match(/Browser suite server: (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) { origin = match[1]; begin().catch(error => child.emit('error', error)); }
  });
  child.stderr.on('data', chunk => { output += chunk; });
  const startedAt = Date.now();
  const result = await waitFor(child);
  if (held) { held.client.destroy(); held.response.destroy(); }
  return { result, output, origin, elapsed:Date.now() - startedAt };
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

  const spawnAuditDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tarnished-lifecycle-spawn-audit-'));
  const attempts = path.join(spawnAuditDirectory, 'guarded.jsonl');
  try {
    const multi = await runnerCase(['tests/fixtures/ignore-shutdown.browser.test.js', 'tests/fixtures/second-spawn.browser.test.js'], {
      shutdownWhen:'fixture ready',
      signal:process.platform === 'win32' ? null : 'SIGTERM',
      env:auditedEnv(attempts, { ER_RUNNER_GRACE_MS:'100', ER_RUNNER_TERMINATE_MS:'100' })
    });
    assert.strictEqual(multi.result.code, 143, 'runner shutdown retains SIGTERM-equivalent status during the first of multiple files');
    assert.deepStrictEqual(spawnAttempts(attempts), [path.resolve(ROOT, 'tests/fixtures/ignore-shutdown.browser.test.js')], `shutdown during fixture one never attempts fixture two spawn; output was:\n${multi.output}`);
    assert.strictEqual(await request(multi.origin), false, 'multi-file shutdown closes its temporary server');

    const mutantAttempts = path.join(spawnAuditDirectory, 'mutant.jsonl');
    const mutant = mutateRunnerWithoutShutdownGuards();
    try {
      const mutantCase = await runnerCase(['tests/fixtures/ignore-shutdown.browser.test.js', 'tests/fixtures/second-spawn.browser.test.js'], {
        runner:mutant,
        shutdownWhen:'fixture ready',
        signal:process.platform === 'win32' ? null : 'SIGTERM',
        env:auditedEnv(mutantAttempts, { ER_RUNNER_GRACE_MS:'100', ER_RUNNER_TERMINATE_MS:'100' }, mutant)
      });
      assert.strictEqual(mutantCase.result.code, 143, 'guard-removal mutant retains the requested shutdown status');
      assert.deepStrictEqual(spawnAttempts(mutantAttempts), [
        path.resolve(ROOT, 'tests/fixtures/ignore-shutdown.browser.test.js'),
        path.resolve(ROOT, 'tests/fixtures/second-spawn.browser.test.js')
      ], `the spawn audit detects fixture two with guards removed; output was:\n${mutantCase.output}`);
    } finally {
      fs.rmSync(mutant, { force:true });
    }
  } finally {
    fs.rmSync(spawnAuditDirectory, { recursive:true, force:true });
  }

  if (process.platform !== 'win32') {
    const sigintRunner = await runnerCase('tests/fixtures/ignore-shutdown.browser.test.js', { shutdownWhen:'fixture ready', signal:'SIGINT', env:{ ER_RUNNER_GRACE_MS:'100', ER_RUNNER_TERMINATE_MS:'100' } });
    assert.strictEqual(sigintRunner.result.code, 130, 'a real OS SIGINT reaches the runner shutdown path');
    assert.strictEqual(await request(sigintRunner.origin), false, 'runner SIGINT closes its temporary server');
  }

  const stalled = await stalledServerCase();
  assert.strictEqual(stalled.result.code, 143, 'stalled server shutdown preserves the requested status');
  assert(stalled.elapsed < 2000, `stalled loopback socket is forcibly bounded (${stalled.elapsed}ms); output was:\n${stalled.output}`);
  assert.strictEqual(await request(stalled.origin), false, 'stalled server shutdown closes its loopback port');

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
