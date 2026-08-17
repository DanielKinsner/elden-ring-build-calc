#!/usr/bin/env node
'use strict';

const { chromium } = require('./browser-lifecycle');

const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/build/';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const PROFILE = { viewport:{ width:390, height:844 }, latency:150, downloadThroughput:200000, uploadThroughput:80000 };

function number(value) { return Math.round(value * 10) / 10; }

async function main() {
  const browser = await chromium.launch({ headless:true, executablePath:EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport:PROFILE.viewport });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled:true });
    await session.send('Network.emulateNetworkConditions', { offline:false, latency:PROFILE.latency, downloadThroughput:PROFILE.downloadThroughput, uploadThroughput:PROFILE.uploadThroughput, connectionType:'cellular3g' });
    await page.addInitScript(() => {
      const observe = () => {
        const stat = document.querySelector('#stats .stat');
        if (stat && stat.getBoundingClientRect().width > 0 && getComputedStyle(stat).visibility !== 'hidden') {
          const resources = performance.getEntriesByType('resource');
          window.__tarnishedFirstUseful = {
            time:performance.now(),
            resourceCount:resources.length,
            encodedBytes:resources.reduce((total, entry) => total + (entry.encodedBodySize || 0), 0)
          };
          return;
        }
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    await page.goto(BASE, { waitUntil:'domcontentloaded', timeout:120000 });
    await page.locator('#stats .stat').first().waitFor({ state:'visible', timeout:120000 });
    await page.waitForFunction(() => typeof window.__tarnishedFirstUseful === 'object', null, { timeout:120000 });
    await page.waitForLoadState('networkidle', { timeout:120000 });
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd,
        firstUseful: window.__tarnishedFirstUseful,
        settled:{ resourceCount:resources.length, encodedBytes:resources.reduce((total, entry) => total + (entry.encodedBodySize || 0), 0) },
        overflow: { scroll:document.documentElement.scrollWidth, inner:window.innerWidth }
      };
    });
    if (metrics.overflow.scroll > metrics.overflow.inner) throw new Error(`390px performance profile has horizontal overflow (${metrics.overflow.scroll}px > ${metrics.overflow.inner}px)`);
    console.log('Performance profile: Chromium 390x844; cache disabled; 150ms latency; 200000 B/s down; 80000 B/s up; local uncompressed server.');
    console.log(`DOMContentLoaded: ${number(metrics.domContentLoaded)} ms`);
    console.log(`First visible #stats .stat: ${number(metrics.firstUseful.time)} ms`);
    console.log(`At first useful: ${metrics.firstUseful.resourceCount} resources; ${metrics.firstUseful.encodedBytes} encoded bytes`);
    console.log(`After network idle (deferred totals): ${metrics.settled.resourceCount} resources; ${metrics.settled.encodedBytes} encoded bytes`);
    console.log('390px overflow: none');
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.stack); process.exit(1); });
