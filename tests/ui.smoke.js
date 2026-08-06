#!/usr/bin/env node
'use strict';

const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');

const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/build/';
const EXECUTABLE = process.env.CHROMIUM_PATH || '/home/dan/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

function assert(ok, message) {
  if (!ok) throw new Error(message);
  console.log('  ✓ ' + message);
}

async function equip(page, slot, query, exactName) {
  await page.locator('[data-tali-slot="' + slot + '"]').click();
  await page.locator('#talismanSearch').fill(query);
  const result = page.locator('.talisman-result').filter({ has: page.locator('b', { hasText: exactName }) }).first();
  await result.click();
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
    page.on('pageerror', (error) => errors.push('page: ' + error.message));
    page.on('response', (response) => { if (response.status() >= 400) errors.push('http ' + response.status() + ': ' + response.url()); });
    await page.goto(BASE, { waitUntil: 'networkidle' });

    assert(await page.locator('.tali-slot').count() === 4, 'renders four talisman slots');
    const rawAR = Number(await page.locator('#ar').textContent());
    await equip(page, 0, 'Ritual Sword', 'Ritual Sword Talisman');
    const ritualAR = Number(await page.locator('#ar').textContent());
    assert(ritualAR > rawAR, 'conditional Ritual Sword effect changes live AR');
    await page.locator('[data-tali-condition="0"]').uncheck();
    assert(Number(await page.locator('#ar').textContent()) === rawAR, 'condition switch removes its math immediately');
    await page.locator('[data-tali-condition="0"]').check();

    await equip(page, 1, 'Great-Jar', "Great-Jar's Arsenal");
    assert((await page.locator('#talismanWeight').textContent()).includes('2.4'), 'talisman weights aggregate across slots');
    assert((await page.locator('#effectStack').textContent()).includes('APPLIED'), 'effect trace exposes applied modifiers');

    await equip(page, 2, 'Crimson Amber Medallion', 'Crimson Amber Medallion');
    await page.locator('[data-tali-slot="3"]').click();
    await page.locator('#talismanSearch').fill('Crimson Amber Medallion +1');
    const conflict = page.locator('.talisman-result').filter({ has: page.locator('b', { hasText: 'Crimson Amber Medallion +1' }) }).first();
    assert(await conflict.isDisabled(), 'game-param conflict group blocks impossible talisman variants');
    await page.locator('#talismanPickerClose').click();

    await page.waitForTimeout(350); // persistence is intentionally debounced by 250ms
    const url = page.url();
    assert(url.includes('tl='), 'share URL contains positional talisman state');
    await page.reload({ waitUntil: 'networkidle' });
    const restoredRack = await page.locator('#talismanRack').textContent();
    if (!restoredRack.includes("Great-Jar's Arsenal")) console.error('reload URL: ' + url + '\nrack: ' + restoredRack);
    assert(restoredRack.includes('Ritual Sword Talisman'), 'talisman state survives reload');
    assert(restoredRack.includes("Great-Jar's Arsenal"), 'multi-slot talisman state survives reload');
    await page.screenshot({ path: '/tmp/elden-talisman-desktop.png', fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on('pageerror', (error) => errors.push('mobile page: ' + error.message));
    await mobile.goto(url, { waitUntil: 'networkidle' });
    const overflow = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    assert(overflow.scroll <= overflow.inner, '390px layout has no horizontal overflow');
    assert(await mobile.locator('.tali-slot').count() === 4, 'mobile retains all four equipment slots');
    await mobile.screenshot({ path: '/tmp/elden-talisman-mobile.png', fullPage: true });

    if (errors.length) console.error(errors.join('\n'));
    assert(errors.length === 0, 'no browser console or page errors');
    console.log('\nUI smoke passed');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
