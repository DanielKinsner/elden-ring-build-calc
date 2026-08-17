#!/usr/bin/env node
'use strict';

// Comparison content is always served from detached worktrees. A dirty integration checkout is
// intentionally harmless: it supplies the harness/server only, never the candidate site files.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT, createStaticServer, listen, close } = require('./static-server');

const BASE_SHA = process.env.ER_PERFORMANCE_BASE_SHA || 'fc64a89d7c902bf6c9a319c7f29d42ecb3ae996c';

function git(args) { return execFileSync('git', args, { cwd:ROOT, encoding:'utf8', stdio:['ignore', 'pipe', 'pipe'] }); }
function comparatorEnvironment(parentEnvironment, executablePath) {
  // A caller-provided CHROMIUM_PATH must never change a comparison result.
  return { ...parentEnvironment, CHROMIUM_PATH:executablePath };
}
function addDetachedWorktree(root, sha) { git(['worktree', 'add', '--detach', root, sha]); }
function removeDetachedWorktree(root) {
  try { git(['worktree', 'remove', '--force', root]); } catch (_) {}
  if (fs.existsSync(root)) fs.rmSync(root, { recursive:true, force:true, maxRetries:3 });
}
async function chromiumEvidence() {
  const executablePath = chromium.executablePath();
  if (!executablePath || !fs.existsSync(executablePath)) throw new Error('Playwright bundled Chromium executable is unavailable; run npm run install:browsers');
  const browser = await chromium.launch({ headless:true, executablePath });
  try {
    const revision = (executablePath.match(/[\\/]chromium-(\d+)[\\/]/i) || [])[1] || 'unparsed';
    return {
      executablePath,
      executable:path.basename(executablePath),
      version:browser.version(),
      revision,
      playwrightVersion:require('playwright/package.json').version
    };
  }
  finally { await browser.close(); }
}
function runProfile(root, label, environment) {
  return new Promise(async (resolve, reject) => {
    const server = createStaticServer({ root });
    try {
      const address = await listen(server, 0);
      const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'performance.browser.test.js')], {
        cwd:ROOT,
        env:{ ...environment, ER_SITE_URL:`http://127.0.0.1:${address.port}/build/` },
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
async function main() {
  const headSha = git(['rev-parse', 'HEAD']).trim();
  const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'er-performance-base-'));
  const candidateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'er-performance-candidate-'));
  try {
    addDetachedWorktree(baseRoot, BASE_SHA);
    addDetachedWorktree(candidateRoot, headSha);
    const browser = await chromiumEvidence();
    const environment = comparatorEnvironment(process.env, browser.executablePath);
    const base = await runProfile(baseRoot, 'base', environment);
    const head = await runProfile(candidateRoot, 'head', environment);
    console.log(JSON.stringify({
      baseSha:BASE_SHA,
      headSha,
      candidateSource:'detached worktree at committed HEAD; live checkout dirt is not served',
      browser:{ executable:browser.executable, version:browser.version, revision:browser.revision, playwrightVersion:browser.playwrightVersion },
      profile:{ viewport:'390x844', cacheDisabled:true, latencyMs:150, downloadBytesPerSecond:200000, uploadBytesPerSecond:80000, server:'current checkout uncompressed static-server.js' },
      base,
      head
    }, null, 2));
  } finally {
    // Both are exact OS-temp directories created above; no user worktree is a cleanup target.
    removeDetachedWorktree(candidateRoot);
    removeDetachedWorktree(baseRoot);
  }
}

if (require.main === module) main().catch(error => { console.error(error.stack); process.exit(1); });

module.exports = { comparatorEnvironment, addDetachedWorktree, removeDetachedWorktree };
