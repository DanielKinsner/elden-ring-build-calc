'use strict';

const assert = require('assert');
const { chromium } = require('./browser-lifecycle');

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
    await restored.locator('#skillSelect').waitFor({ state:'attached' });
    await restored.getByRole('tab', { name:'Encounter', exact:true }).click();
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
    await ranged.getByRole('tab', { name:'Encounter', exact:true }).click();
    await ranged.locator('#ammoControl').waitFor({ state:'visible' });
    assert.strictEqual(await ranged.locator('#ammoSelect').inputValue(), 'bloodbone-bolt', 'secondary-only ammunition state restores after encounter hydration');
    await ranged.close();

    const invalidUrl = await open(browser, '?w=longsword&cat=not-a-catalyst&sp=not-a-spell&sa=not-a-spell&sv=not-a-variant&en=not-an-enemy&wm=not-a-move&am=not-ammo&rh=longsword~Blood~25~not-a-skill~not-an-event,-,-');
    await invalidUrl.locator('#buildRestoreNotice').waitFor({ state:'visible' });
    await invalidUrl.evaluate(() => Promise.all(['magic', 'skills', 'encounter'].map(name => window.ERBuild.ensureDomain(name))));
    await invalidUrl.waitForFunction(() => {
      const q = new URL(location.href).searchParams;
      return ['cat', 'sp', 'sa', 'sv', 'en', 'wm', 'am'].every(key => !q.has(key)) && !location.href.includes('not-a-skill') && !location.href.includes('not-an-event');
    });
    assert((await invalidUrl.locator('#buildRestoreNotice').textContent()).includes('removed unavailable'), 'invalid deferred URL values receive a visible restoration warning');
    await invalidUrl.getByRole('tab', { name:'Encounter', exact:true }).click();
    assert.strictEqual(await invalidUrl.locator('#summaryTarget').textContent(), 'General Build', 'invalid enemy restoration returns the summary to General Build');
    assert.strictEqual(await invalidUrl.locator('#enemyClear').isHidden(), true, 'invalid enemy restoration leaves no stale clear action');
    const invalidPersisted = await invalidUrl.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('er-build'));
      const slot = saved.loadout.rightHand[0];
      return { saved, ok:saved.magic.catalystId === null && saved.magic.spells.length === 0 && saved.encounter.enemyId === null && !slot.skillId && !slot.skillEventId };
    });
    assert(invalidPersisted.ok, 'invalid deferred URL values are cleared before local persistence: ' + JSON.stringify(invalidPersisted.saved));
    await invalidUrl.close();

    const stored = await browser.newPage({ viewport:{ width:390, height:844 } });
    await stored.addInitScript(() => localStorage.setItem('er-build', JSON.stringify({
      weapon:'longsword', affinity:'Blood', upgrade:25,
      magic:{ catalystId:'not-a-catalyst', spells:['not-a-spell'], activeSpell:'not-a-spell', variantId:'not-a-variant' },
      encounter:{ enemyId:'not-an-enemy', ng:7, moveId:'not-a-move', ammoId:'not-ammo' },
      loadout:{ rightHand:[{ weaponId:'longsword', affinity:'Blood', upgrade:25, skillId:'not-a-skill', skillEventId:'not-an-event' }], leftHand:[] }
    })));
    await stored.goto(BASE, { waitUntil:'domcontentloaded' });
    await stored.locator('#stats .stat').first().waitFor({ state:'visible' });
    await stored.locator('#buildRestoreNotice').waitFor({ state:'visible' });
    await stored.evaluate(() => Promise.all(['magic', 'skills', 'encounter'].map(name => window.ERBuild.ensureDomain(name))));
    await stored.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem('er-build'));
      return saved.magic.catalystId === null && saved.magic.spells.length === 0 && saved.encounter.enemyId === null && !saved.loadout.rightHand[0].skillId;
    });
    assert.strictEqual(await stored.locator('#summaryTarget').textContent(), 'General Build', 'invalid saved deferred values restore the General Build state');
    assert((await stored.locator('#buildRestoreNotice').textContent()).includes('unavailable'), 'invalid saved deferred values disclose their removal');
    await stored.close();

    const named = await browser.newPage({ viewport:{ width:390, height:844 } });
    await named.addInitScript(() => localStorage.setItem('er-my-builds', JSON.stringify([{
      name:'Bad loaded build', state:{ weapon:'longsword', affinity:'Blood', upgrade:25,
        magic:{ catalystId:'not-a-catalyst', spells:['not-a-spell'], activeSpell:'not-a-spell' },
        encounter:{ enemyId:'not-an-enemy', moveId:'not-a-move', ammoId:'not-ammo' },
        loadout:{ rightHand:[{ weaponId:'longsword', affinity:'Fire', upgrade:25, skillId:'bloody-slash', skillEventId:'bloody-slash-300000057' }], leftHand:[{ weaponId:'longsword', affinity:'Blood', upgrade:25, skillId:'bloody-slash', skillEventId:'square-off-r1-300000700' }] }
      }
    }])));
    await named.goto(BASE, { waitUntil:'domcontentloaded' });
    await named.locator('#stats .stat').first().waitFor({ state:'visible' });
    await named.evaluate(() => Promise.all(['magic', 'skills', 'encounter'].map(name => window.ERBuild.ensureDomain(name))));
    await named.getByRole('button', { name:'Bad loaded build', exact:true }).click();
    await named.locator('#buildRestoreNotice').waitFor({ state:'visible' });
    await named.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem('er-build'));
      const right = saved.loadout.rightHand[0], left = saved.loadout.leftHand[0];
      return !saved.magic.catalystId && !saved.encounter.enemyId && !right.skillId && !right.skillEventId && left.skillId === 'bloody-slash' && !left.skillEventId;
    });
    const namedNotice = await named.locator('#buildRestoreNotice').textContent();
    assert(namedNotice.includes('catalyst') && namedNotice.includes('enemy') && namedNotice.includes('skill') && namedNotice.includes('skill event'), 'already-loaded named restoration aggregates every dropped deferred category');
    assert.strictEqual(await named.locator('#summaryTarget').textContent(), 'General Build', 'already-loaded named restoration clears the stale target summary');
    await named.getByRole('tab', { name:'Encounter', exact:true }).click();
    assert.strictEqual(await named.locator('#enemyClear').isHidden(), true, 'already-loaded named restoration leaves no enemy clear action');
    await named.close();

    console.log('loading browser regressions passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exit(1); });
