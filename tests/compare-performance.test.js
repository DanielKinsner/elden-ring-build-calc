#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { comparatorEnvironment } = require('../scripts/compare-performance');

const forced = comparatorEnvironment({ CHROMIUM_PATH:'untrusted-browser', KEEP:'yes' }, 'playwright-bundled-browser');
assert.strictEqual(forced.CHROMIUM_PATH, 'playwright-bundled-browser', 'comparator replaces a caller browser override with its bundled Chromium executable');
assert.strictEqual(forced.KEEP, 'yes', 'comparator preserves unrelated environment values');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'compare-performance.js'), 'utf8');
assert(source.includes("addDetachedWorktree(candidateRoot, headSha)"), 'candidate content is materialized in a detached worktree instead of serving the live checkout');
assert(source.includes("runProfile(candidateRoot, 'head', environment)"), 'candidate profile serves detached committed HEAD content');
assert(!source.includes("runProfile(ROOT, 'head'"), 'candidate profile cannot fall back to serving the live checkout');
assert(source.includes('removeDetachedWorktree(candidateRoot)'), 'candidate temporary worktree is removed in finally');
assert(source.includes('chromium.executablePath()'), 'comparator obtains the Playwright bundled Chromium executable explicitly');
assert(source.includes('revision'), 'comparison evidence records the bundled Chromium revision');

console.log('performance comparator adversarial checks passed');
