'use strict';

// Browser tests load this module instead of Playwright directly so a suite signal closes every
// launched browser before Node exits. It deliberately manages only browsers this process launched.
const { chromium } = require('playwright');
const browsers = new Set();
const cleanups = new Set();
const launch = chromium.launch.bind(chromium);
let stopping = null;

chromium.launch = async function trackedLaunch(...args) {
  const browser = await launch(...args);
  browsers.add(browser);
  browser.once('disconnected', () => browsers.delete(browser));
  return browser;
};

function addCleanup(callback) {
  cleanups.add(callback);
  return () => cleanups.delete(callback);
}

async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    await Promise.allSettled([...browsers].map(browser => browser.close()));
    for (const cleanup of [...cleanups]) {
      try { await cleanup(); } catch (_) { /* preserve the original signal exit status */ }
    }
  })();
  return stopping;
}

function signalExit(code) {
  stop().finally(() => process.exit(code));
}

process.once('SIGINT', () => signalExit(130));
process.once('SIGTERM', () => signalExit(143));
if (process.send) process.on('message', message => {
  if (message && message.type === 'shutdown') signalExit(143);
});
// Adding a message listener refs Node's IPC channel. Keep it available for runner shutdown while
// allowing a completed test process to exit normally once its browser and other handles are closed.
if (process.channel) process.channel.unref();

module.exports = { chromium, addCleanup };
