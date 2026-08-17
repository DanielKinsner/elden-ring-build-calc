#!/usr/bin/env node
'use strict';

// Runs the checked-out test harness and pinned Playwright Chromium against both a detached
// historical content worktree and this checkout. The server implementation is always this file's
// checkout, so the only comparison variable is authored site content.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, createStaticServer, listen, close } = require('./static-server');

const BASE_SHA = process.env.ER_PERFORMANCE_BASE_SHA || 'fc64a89d7c902bf6c9a319c7f29d42ecb3ae996c';
const HEAD_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd:ROOT, encoding:'utf8' }).trim();
const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'er-performance-base-'));
let worktreeAdded = false;

function run(command, args, options = {}) { return execFileSync(command, args, { cwd:ROOT, encoding:'utf8', stdio:['ignore', 'pipe', 'pipe'], ...options }); }
function runProfile(root, label) {
  return new Promise(async (resolve, reject) => {
    const server = createStaticServer({ root });
    try {
      const address = await listen(server, 0);
      const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'performance.browser.test.js')], {
        cwd:ROOT,
        env:{ ...process.env, ER_SITE_URL:`http://127.0.0.1:${address.port}/build/` },
        stdio:['ignore', 'pipe', 'pipe']
      });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; process.stdout.write(`[${label}] ${chunk}`); });
      child.stderr.on('data', chunk => { output += chunk; process.stderr.write(`[${label}] ${chunk}`); });
      child.once('error', reject);
      child.once('exit', async code => {
        await close(server);
        if (code) return reject(new Error(`${label} performance profile exited ${code}`));
        const values = {
          domContentLoaded:(output.match(/DOMContentLoaded: ([\d.]+) ms/) || [])[1],
          firstUseful:(output.match(/First visible #stats \.stat: ([\d.]+) ms/) || [])[1],
          resources:(output.match(/At first useful: (\d+) resources/) || [])[1],
          encodedBytes:(output.match(/At first useful: \d+ resources; (\d+) encoded bytes/) || [])[1]
        };
        if (Object.values(values).some(value => value == null)) return reject(new Error(`${label} output did not contain a complete first-useful snapshot`));
        resolve(values);
      });
    } catch (error) {
      await close(server);
      reject(error);
    }
  });
}

(async () => {
  try {
    run('git', ['worktree', 'add', '--detach', baseRoot, BASE_SHA]); worktreeAdded = true;
    const base = await runProfile(baseRoot, 'base');
    const head = await runProfile(ROOT, 'head');
    console.log(JSON.stringify({ baseSha:BASE_SHA, headSha:HEAD_SHA, profile:{ browser:'Playwright bundled Chromium', viewport:'390x844', cacheDisabled:true, latencyMs:150, downloadBytesPerSecond:200000, uploadBytesPerSecond:80000, server:'current checkout uncompressed static-server.js' }, base, head }, null, 2));
  } finally {
    if (worktreeAdded) {
      // The generated path is an exact OS-temp worktree created above; do not target any user path.
      try { run('git', ['worktree', 'remove', '--force', baseRoot]); } catch (_) {}
    }
    if (fs.existsSync(baseRoot)) fs.rmSync(baseRoot, { recursive:true, force:true, maxRetries:3 });
  }
})().catch(error => { console.error(error.stack); process.exit(1); });
