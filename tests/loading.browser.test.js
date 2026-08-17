'use strict';

const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/build/';
const EXECUTABLE = process.env.CHROMIUM_PATH;

async function open(browser, query) {
  const page = await browser.newPage({ viewport:{ width:390, height:844 } });
  await page.goto(BASE + query, { waitUntil:'domcontentloaded' });
  await page.locator('#stats .stat').first().waitFor({ state:'visible' });
  return page;
}

(async function () {
  const browser = await chromium.launch({ headless:true, executablePath:EXECUTABLE || undefined });
  try {
    const failed = await open(browser, '');
    await failed.route('**/data/spells.json', route => route.abort('failed'));
    await failed.getByRole('tab', { name:'Magic', exact:true }).click();
    await failed.locator('#magicDomainState').getByText('unavailable').waitFor();
    assert.strictEqual(await failed.locator('#stats .stat').count(), 8, 'secondary failure leaves the core stat controls usable');
    await failed.getByRole('tab', { name:'Character', exact:true }).click();
    const dexterity = failed.locator('#stats [data-box="DEX"]');
    const arBefore = Number(await failed.locator('#ar').textContent());
    assert.strictEqual(await dexterity.isEnabled(), true, 'secondary failure does not disable core stat editing');
    await dexterity.fill('70');
    await failed.waitForFunction(before => Number(document.querySelector('#ar').textContent) !== before, arBefore);
    assert.notStrictEqual(Number(await failed.locator('#ar').textContent()), arBefore, 'core AR remains reactive while Magic is unavailable');
    await failed.unroute('**/data/spells.json');
    await failed.getByRole('tab', { name:'Magic', exact:true }).click();
    await failed.locator('#magicDomainState').waitFor({ state:'hidden' });
    assert.strictEqual(await failed.locator('#catalystSelect').isDisabled(), false, 'retry restores the failed secondary domain');
    await failed.close();

    const ngOnly = await open(browser, '?ng=7');
    await ngOnly.waitForFunction(() => document.querySelector('#ngCycle').value === '7');
    assert.strictEqual(await ngOnly.locator('#ngCycle').inputValue(), '7', 'NG-only URL restores and hydrates encounter state');
    await ngOnly.close();

    const armamentOnly = await open(browser, '?rh=longsword~Blood~25~bloody-slash~bloody-slash-300000057,-,-');
    await armamentOnly.waitForFunction(() => document.querySelector('#skillSelect').value === 'bloody-slash');
    assert.strictEqual(await armamentOnly.locator('#weaponName').textContent(), 'Longsword', 'armament-only URL restores its selected weapon');
    assert.strictEqual(await armamentOnly.locator('#skillSelect').inputValue(), 'bloody-slash', 'armament-only URL hydrates its Ash');
    assert.strictEqual(await armamentOnly.locator('#skillEvent').inputValue(), 'bloody-slash-300000057', 'armament-only URL hydrates its exact event');
    await armamentOnly.close();

    const restored = await open(browser, '?cat=astrologers-staff&sp=comet&sa=comet&en=malenia-blade-of-miquella-128t7sv&ng=7&wm=2h-jumping-r2&rh=longsword~Blood~25~bloody-slash~bloody-slash-300000057,-,-');
    await restored.locator('#skillSelect').waitFor();
    await restored.locator('#enemySummary').getByText('Malenia, Blade of Miquella').waitFor();
    assert.strictEqual(await restored.locator('#weaponName').textContent(), 'Longsword', 'secondary-only armament URL restores its selected weapon');
    assert.strictEqual(await restored.locator('#skillSelect').inputValue(), 'bloody-slash', 'secondary-only armament URL restores its Ash');
    assert.strictEqual(await restored.locator('#skillEvent').inputValue(), 'bloody-slash-300000057', 'secondary-only armament URL restores its exact skill event');
    assert.strictEqual(await restored.locator('#catalystSelect').inputValue(), 'astrologers-staff', 'secondary-only URL restores catalyst state');
    assert((await restored.locator('#spellRack').textContent()).includes('Comet'), 'secondary-only URL restores spell state');
    assert.strictEqual(await restored.locator('#ngCycle').inputValue(), '7', 'secondary-only URL restores NG cycle');
    assert.strictEqual(await restored.locator('#weaponMove').inputValue(), '2h-jumping-r2', 'secondary-only URL restores weapon move');
    await restored.close();

    const ranged = await open(browser, '?w=spread-crossbow&en=malenia-blade-of-miquella-128t7sv&ng=7&am=bloodbone-bolt');
    await ranged.locator('#ammoControl').waitFor({ state:'visible' });
    assert.strictEqual(await ranged.locator('#ammoSelect').inputValue(), 'bloodbone-bolt', 'secondary-only ammunition state restores after encounter hydration');
    await ranged.close();

    console.log('loading browser regressions passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exit(1); });
