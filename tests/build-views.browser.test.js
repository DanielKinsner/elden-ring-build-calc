'use strict';

const assert = require('assert');
const { chromium } = require('./browser-lifecycle');
const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/build/';

async function openView(page, name) {
  await page.getByRole('tab', { name, exact:true }).click();
  await page.locator('[data-view-panel="' + ({ Character:'character', Loadout:'loadout', Damage:'damage', Defense:'defense', Magic:'magic', Encounter:'encounter', 'Advanced / Trace':'advanced' })[name] + '"]').waitFor({ state:'visible' });
}

async function main() {
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport:{ width:1280, height:900 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin:new URL(BASE).origin });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(BASE, { waitUntil:'domcontentloaded' });
    await page.locator('#stats .stat').first().waitFor();
    await page.evaluate(() => localStorage.clear());

    assert.strictEqual(await page.getByRole('tab', { name:'Character', exact:true }).getAttribute('aria-selected'), 'true', 'Character is the default section target');
    assert((await page.locator('#summaryTarget').textContent()).includes('General Build'), 'General Build is the default context');
    assert.strictEqual(await page.locator('#stats .stat').count(), 8, 'all eight freeform stat controls remain present');
    assert.strictEqual(await page.locator('[data-view-panel]:visible').count(), 7, 'all seven calculator sections remain visible together');

    const dex = page.locator('#stats [data-box="DEX"]');
    await dex.fill('70');
    const dexValue = await dex.inputValue();
    assert.strictEqual(await page.locator('#summaryOutput').textContent(), (await page.locator('#ar').textContent()) + ' AR', 'stat changes update visible output without changing sections');
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
    await openView(page, 'Character');
    await page.locator('#twoHand').evaluate(input => { input.checked = false; input.dispatchEvent(new Event('change', { bubbles:true })); });
    assert.strictEqual(await page.locator('#twoHand').isChecked(), false, 'context change applies before advisor invalidation');
    await openView(page, 'Advanced / Trace');
    assert.strictEqual(await page.locator('#optApply').isVisible(), false, 'changing context invalidates a stale advisor preview before Apply');
    await page.locator('#optimizeBtn').click();
    await page.locator('#optResult').getByText('Preview only').waitFor();
    const apply = page.locator('#optApply');
    assert.strictEqual(await apply.isDisabled(), false, 'advisor proposal exposes an explicit apply action');
    await apply.click();
    await page.locator('#optUndo').waitFor();
    assert.notStrictEqual(await dex.inputValue(), beforePreview, 'advisor apply changes only the proposed canonical stats');
    await page.locator('#optUndo').click();
    assert.strictEqual(await dex.inputValue(), beforePreview, 'advisor undo restores the exact prior spread');

    await page.locator('#optimizeBtn').click();
    await page.locator('#optApply').click();
    await openView(page, 'Character');
    await dex.fill(String(Number(beforePreview) + 1));
    await openView(page, 'Advanced / Trace');
    assert.strictEqual(await page.locator('#optUndo').isVisible(), false, 'manual stat changes invalidate Undo instead of overwriting a later build');

    const presetContext = await browser.newContext({ viewport:{ width:1280, height:900 } });
    const presetPage = await presetContext.newPage();
    presetPage.setDefaultTimeout(10000);
    await presetPage.goto(BASE, { waitUntil:'domcontentloaded' });
    await presetPage.locator('#stats .stat').first().waitFor();
    await presetPage.locator('#stats [data-box="DEX"]').fill('70');
    await presetPage.locator('#twoHand').evaluate(input => { input.checked = false; input.dispatchEvent(new Event('change', { bubbles:true })); });
    await openView(presetPage, 'Advanced / Trace');
    await presetPage.locator('#skillsDomainState').waitFor({ state:'hidden' });
    await presetPage.locator('#optimizeBtn').click();
    await presetPage.locator('#optResult').getByText('Preview only').waitFor();
    const presetApply = presetPage.locator('#optApply');
    assert.strictEqual(await presetApply.isDisabled(), false, 'preset-context advisor proposal remains explicitly applicable');
    await presetApply.click();
    await presetPage.waitForFunction(() => Boolean(document.querySelector('#optUndo')));
    await openView(presetPage, 'Character');
    await presetPage.locator('#presetBtns [data-p]').first().click();
    await openView(presetPage, 'Advanced / Trace');
    assert.strictEqual(await presetPage.locator('#optUndo').isVisible(), false, 'preset changes invalidate Undo instead of overwriting a later build');
    await presetContext.close();

    await openView(page, 'Loadout');
    await page.locator('[data-rack-hand="left"][data-rack-index="1"]').click();
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'weaponSearch');
    assert.strictEqual(await page.locator('#weaponSearch').isVisible(), true, 'empty inactive armament selection focuses the already-visible weapon picker');
    await page.locator('#weaponSearch').fill('Longsword');
    await page.locator('#weaponList [data-id="longsword"]').click();
    assert((await page.locator('#summaryWeapon').textContent()).includes('Longsword'), 'equipping an inactive slot synchronizes the persistent summary');
    await openView(page, 'Loadout');
    await page.locator('[data-rack-hand="right"][data-rack-index="1"]').click();
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'weaponSearch');
    assert.strictEqual(await page.locator('#weaponSearch').isVisible(), true, 'right inactive armament selection also focuses the visible weapon picker');
    await page.locator('#weaponSearch').fill('Longsword');
    await page.locator('#weaponList [data-id="longsword"]').click();
    assert((await page.locator('#summaryWeapon').textContent()).includes('Longsword'), 'right inactive armament equip also synchronizes the persistent summary');

    await openView(page, 'Character');
    await dex.fill('71');
    await openView(page, 'Advanced / Trace');
    await page.waitForTimeout(300);
    page.on('dialog', dialog => dialog.accept('Focused browser save'));
    await page.locator('#summarySave').click();
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('er-my-builds')).some(entry => entry.name === 'Focused browser save')), true, 'summary Save delegates to named-build persistence');
    await page.locator('#summaryShare').click();
    const shared = await page.evaluate(() => navigator.clipboard.readText());
    assert.strictEqual(shared, page.url(), 'summary Share delegates to the canonical copied share URL');

    const restoredContext = await browser.newContext({ viewport:{ width:1280, height:900 } });
    const restored = await restoredContext.newPage();
    restored.setDefaultTimeout(10000);
    await restored.goto(shared, { waitUntil:'domcontentloaded' });
    await restored.locator('[data-view-panel="advanced"]').waitFor({ state:'visible' });
    await restored.locator('#skillsDomainState').waitFor({ state:'hidden' });
    assert.strictEqual(await restored.getByRole('tab', { name:'Advanced / Trace', exact:true }).getAttribute('aria-selected'), 'true', 'share reload restores the requested Advanced view');
    assert.strictEqual(await restored.locator('#stats [data-box="DEX"]').inputValue(), '71', 'clean share reload restores canonical stat state');
    assert.strictEqual(await restored.locator('#skillSelect').isDisabled(), false, 'restored Advanced view hydrates its secondary skill domain');
    await restoredContext.close();
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
