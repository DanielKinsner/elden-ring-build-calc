'use strict';

const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/build/';

async function openView(page, name) {
  await page.getByRole('tab', { name, exact:true }).click();
  await page.locator('[data-view-panel="' + ({ Character:'character', Loadout:'loadout', Damage:'damage', Defense:'defense', Magic:'magic', Encounter:'encounter', 'Advanced / Trace':'advanced' })[name] + '"]').waitFor({ state:'visible' });
}

async function main() {
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport:{ width:1280, height:900 } });
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(BASE, { waitUntil:'domcontentloaded' });
    await page.locator('#stats .stat').first().waitFor();

    assert.strictEqual(await page.getByRole('tab', { name:'Character', exact:true }).getAttribute('aria-selected'), 'true', 'Character is the default view');
    assert((await page.locator('#summaryTarget').textContent()).includes('General Build'), 'General Build is the default context');
    assert.strictEqual(await page.locator('#stats .stat').count(), 8, 'all eight freeform stat controls remain present');

    const dex = page.locator('#stats [data-box="DEX"]');
    await dex.fill('70');
    const dexValue = await dex.inputValue();
    await openView(page, 'Damage');
    assert.strictEqual(await page.locator('#summaryOutput').textContent(), (await page.locator('#ar').textContent()) + ' AR', 'persistent summary follows immediate output');
    await openView(page, 'Loadout');
    await openView(page, 'Character');
    assert.strictEqual(await dex.inputValue(), dexValue, 'view changes preserve the canonical stat state');

    await openView(page, 'Magic');
    await page.locator('#magicDomainState').waitFor({ state:'hidden' });
    assert.strictEqual(await page.locator('#catalystSelect').isDisabled(), false, 'Magic is reachable through its focused view');
    await openView(page, 'Advanced / Trace');
    await page.locator('#skillsDomainState').waitFor({ state:'hidden' });
    assert((await page.locator('#skillName').textContent()).length > 0, 'skill and trace analysis is reachable through Advanced / Trace');
    await openView(page, 'Defense');
    assert((await page.locator('#survRollState').textContent()).length > 0, 'Defense retains survival and roll outputs');

    await openView(page, 'Encounter');
    await page.locator('#encounterDomainState').waitFor({ state:'hidden' });
    await page.locator('#enemyPickerOpen').click();
    await page.locator('#enemySearch').fill('Malenia, Blade of Miquella');
    await page.locator('.enemy-result').first().click();
    assert(!(await page.locator('#summaryTarget').textContent()).includes('General Build'), 'optional encounter selection updates the summary only');
    await page.locator('#enemyClear').click();
    assert((await page.locator('#summaryTarget').textContent()).includes('General Build'), 'clearing an encounter restores the General Build lens');

    await openView(page, 'Advanced / Trace');
    const beforePreview = await dex.inputValue();
    await page.locator('#optimizeBtn').click();
    await page.locator('#optResult').getByText('Preview only').waitFor();
    assert.strictEqual(await dex.inputValue(), beforePreview, 'advisor preview never mutates live stats');
    const apply = page.locator('#optApply');
    assert.strictEqual(await apply.isDisabled(), false, 'advisor proposal exposes an explicit apply action');
    await apply.click();
    await page.locator('#optUndo').waitFor();
    assert.notStrictEqual(await dex.inputValue(), beforePreview, 'advisor apply changes only the proposed canonical stats');
    await page.locator('#optUndo').click();
    assert.strictEqual(await dex.inputValue(), beforePreview, 'advisor undo restores the exact prior spread');

    await openView(page, 'Character');
    await dex.fill('71');
    await openView(page, 'Advanced / Trace');
    await page.waitForTimeout(300);
    const shared = page.url();
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.locator('#stats .stat').first().waitFor({ state:'attached' });
    assert.strictEqual(await page.locator('#stats [data-box="DEX"]').inputValue(), '71', 'share URL still restores canonical stat state');
    assert(shared.includes('view=advanced'), 'focused-view selection persists with the shared build URL');
    await context.close();

    const mobileContext = await browser.newContext({ viewport:{ width:390, height:844 } });
    const mobile = await mobileContext.newPage();
    mobile.setDefaultTimeout(10000);
    await mobile.goto(BASE, { waitUntil:'domcontentloaded' });
    await mobile.locator('#stats .stat').first().waitFor();
    const dimensions = await mobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(dimensions.scroll <= dimensions.inner, '390px Build Lab has no horizontal overflow');
    assert.strictEqual(await mobile.getByRole('tab').count(), 7, '390px navigation retains plainly named focused views');
    await mobileContext.close();
    console.log('Build Lab view regressions passed');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack); process.exit(1); });
