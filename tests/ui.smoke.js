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

async function memorize(page, query, exactName) {
  await page.locator('#addSpell').click();
  await page.locator('#spellSearch').fill(query);
  const result = page.locator('.spell-result').filter({ has: page.locator('b', { hasText: exactName }) }).first();
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
    assert(await page.locator('#skillName').textContent() === 'Corpse Piler', 'fixed unique weapon exposes its real skill');
    assert(await page.locator('#skillEvent option').count() === 18, 'fixed skill exposes every exact attack event');
    assert(Number(await page.locator('#skillPreDamage').textContent()) > 0, 'fixed skill event produces pre-defense damage');
    const rawAR = Number(await page.locator('#ar').textContent());
    await equip(page, 0, 'Claw Talisman', 'Claw Talisman');
    assert(Number(await page.locator('#ar').textContent()) === rawAR, 'contextual talisman does not contaminate neutral AR');
    await page.locator('#attackProfile').selectOption('jump');
    const jumpAR = Number(await page.locator('#ar').textContent());
    assert(jumpAR > rawAR, 'jump lens applies Claw Talisman to live output');
    assert((await page.locator('#attackLensState').textContent()).includes('matched modifier'), 'attack lens exposes matched move math');
    await page.locator('[data-tali-clear="0"]').click();
    await page.locator('#attackProfile').selectOption('neutral');
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
    assert(Number(await page.locator('#survHP').textContent()) === Math.floor(1900 * 1.06), 'param-derived max HP changes live survival math');
    await page.locator('[data-tali-slot="3"]').click();
    await page.locator('#talismanSearch').fill('Crimson Amber Medallion +1');
    const conflict = page.locator('.talisman-result').filter({ has: page.locator('b', { hasText: 'Crimson Amber Medallion +1' }) }).first();
    assert(await conflict.isDisabled(), 'game-param conflict group blocks impossible talisman variants');
    await page.locator('#talismanPickerClose').click();
    await page.locator('[data-tali-clear="2"]').click();
    await equip(page, 2, 'Green Turtle', 'Green Turtle Talisman');
    assert((await page.locator('#survUtility').textContent()).includes('+8 stamina/s'), 'utility talismans surface non-AR build outputs');

    await equip(page, 3, 'Dragoncrest Greatshield', 'Dragoncrest Greatshield Talisman');
    const physicalDefense = page.locator('#armorNegation .defense-row').filter({ hasText: 'Physical' });
    assert((await physicalDefense.textContent()).includes('20.0'), 'PvE context applies the datamined Dragoncrest multiplier');
    await page.locator('#combatContext').selectOption('pvp');
    assert((await physicalDefense.textContent()).includes('5.0'), 'PvP context switches to its separate Dragoncrest multiplier');
    await page.locator('#attackProfile').selectOption('jump');

    await page.locator('[data-box="INT"]').fill('80');
    await page.locator('#catalystSelect').selectOption('astrologers-staff');
    await page.locator('#catalystUpgrade').selectOption('25');
    await memorize(page, 'Comet', 'Comet');
    assert(await page.locator('#memoryBudget').textContent() === '1 / 10 slots', 'spell memory accounts for the selected spell');
    assert(await page.locator('#spellBuff').textContent() === '340', 'param graph produces 340 Spell Buff at 80 INT');
    assert(await page.locator('#spellOutput').textContent() === '992', 'Comet motion value produces 992 pre-defense magic damage');
    assert((await page.locator('#spellCosts').textContent()).startsWith('24 / 31'), 'spell output exposes FP and stamina costs');
    assert((await page.locator('#activeSpellReqs').textContent()).includes('ready'), 'spell analysis validates catalyst and attribute requirements');
    await page.locator('#enemyPickerOpen').click();
    await page.locator('#enemySearch').fill('Malenia, Blade of Miquella');
    await page.locator('.enemy-result').filter({ hasText: "Miquella's Haligtree" }).first().click();
    assert(await page.locator('#enemyHP').textContent() === '18,473', 'encounter profile exposes exact NG health');
    assert(await page.locator('#enemySpellDamage').textContent() === '714', 'enemy defense and negation produce final Comet damage');
    assert(await page.locator('#enemySkillDamage').textContent() !== '—', 'selected skill event flows through enemy defense');
    assert((await page.locator('#enemyStatus').textContent()).includes('7 hits · 420'), 'enemy status threshold drives exact hits-to-proc');
    await page.locator('#weaponMove').selectOption('2h-jumping-r2');
    assert((await page.locator('#enemyWeaponNote').textContent()).includes('135 MV'), 'weapon encounter uses the selected exact motion value');
    assert(await page.locator('#attackProfile').inputValue() === 'jump', 'exact jumping move synchronizes the talisman attack lens');
    await page.locator('#ngCycle').selectOption('7');
    assert(await page.locator('#enemyHP').textContent() === '26,250', 'NG+7 changes the same encounter profile');
    assert(await page.locator('#enemySpellDamage').textContent() !== '714', 'NG+7 defense changes final spell damage');

    await page.waitForTimeout(350); // persistence is intentionally debounced by 250ms
    const url = page.url();
    assert(url.includes('tl='), 'share URL contains positional talisman state');
    assert(url.includes('ctx=pvp'), 'share URL preserves PvE/PvP calculation context');
    assert(url.includes('mv=jump'), 'share URL preserves the move under analysis');
    assert(url.includes('cat=astrologers-staff'), 'share URL preserves the catalyst');
    assert(url.includes('sp=comet'), 'share URL preserves memorized spells');
    assert(url.includes('sa=comet'), 'share URL preserves the active spell');
    assert(url.includes('en=malenia-blade-of-miquella-'), 'share URL preserves the enemy profile');
    assert(url.includes('ng=7'), 'share URL preserves the NG cycle');
    assert(url.includes('wm=2h-jumping-r2'), 'share URL preserves the exact weapon move');
    await page.reload({ waitUntil: 'networkidle' });
    const restoredRack = await page.locator('#talismanRack').textContent();
    if (!restoredRack.includes("Great-Jar's Arsenal")) console.error('reload URL: ' + url + '\nrack: ' + restoredRack);
    assert(restoredRack.includes('Ritual Sword Talisman'), 'talisman state survives reload');
    assert(restoredRack.includes("Great-Jar's Arsenal"), 'multi-slot talisman state survives reload');
    assert(await page.locator('#combatContext').inputValue() === 'pvp', 'combat context survives reload');
    assert(await page.locator('#attackProfile').inputValue() === 'jump', 'attack lens survives reload');
    assert(await page.locator('#catalystSelect').inputValue() === 'astrologers-staff', 'catalyst state survives reload');
    assert((await page.locator('#spellRack').textContent()).includes('Comet'), 'spell memory survives reload');
    assert(await page.locator('#spellOutput').textContent() === '992', 'spell output survives shared-link reload');
    assert((await page.locator('#enemySummary').textContent()).includes('Malenia'), 'enemy profile survives shared-link reload');
    assert(await page.locator('#ngCycle').inputValue() === '7', 'NG cycle survives shared-link reload');
    assert(await page.locator('#weaponMove').inputValue() === '2h-jumping-r2', 'exact weapon move survives shared-link reload');
    await page.screenshot({ path: '/tmp/elden-talisman-desktop.png', fullPage: true });

    const rangedUrl = new URL(BASE);
    rangedUrl.searchParams.set('w', 'spread-crossbow');
    rangedUrl.searchParams.set('rh', 'spread-crossbow~Standard~25,-,-');
    rangedUrl.searchParams.set('en', new URL(url).searchParams.get('en'));
    rangedUrl.searchParams.set('am', 'bloodbone-bolt');
    const ranged = await context.newPage();
    ranged.on('pageerror', (error) => errors.push('ranged page: ' + error.message));
    await ranged.goto(rangedUrl.toString(), { waitUntil: 'networkidle' });
    assert(await ranged.locator('#ammoControl').isVisible(), 'ranged armament exposes an ammunition slot');
    assert(await ranged.locator('#ammoSelect option').count() === 20, 'crossbows expose all 20 compatible bolts');
    assert(await ranged.locator('#ammoSelect').inputValue() === 'bloodbone-bolt', 'shared link restores exact ammunition');
    assert((await ranged.locator('#enemyWeaponNote').textContent()).includes('3 projectiles'), 'Spread Crossbow exposes its exact three-projectile profile');
    assert(await ranged.locator('#enemyWeaponDamage').textContent() === '387', 'three projectiles receive enemy defense independently');
    assert((await ranged.locator('#enemyStatus').textContent()).includes('4 hits · 420'), 'ammo status motion drives enemy hits-to-proc');
    await ranged.locator('#ammoSelect').selectOption('bolt');
    await ranged.waitForTimeout(350);
    assert(ranged.url().includes('am=bolt'), 'ammunition selection persists into the share URL');
    await ranged.reload({ waitUntil:'networkidle' });
    assert(await ranged.locator('#ammoSelect').inputValue() === 'bolt', 'ammunition survives shared-link reload');
    await ranged.screenshot({ path:'/tmp/elden-ranged-desktop.png', fullPage:true });

    const skillUrl = new URL(BASE);
    skillUrl.searchParams.set('b', '10.10.10.20.20.10.10.80');
    skillUrl.searchParams.set('w', 'longsword');
    skillUrl.searchParams.set('a', 'Blood');
    skillUrl.searchParams.set('u', '25');
    skillUrl.searchParams.set('rh', 'longsword~Blood~25,-,-');
    skillUrl.searchParams.set('en', new URL(url).searchParams.get('en'));
    const skillPage = await context.newPage();
    skillPage.on('pageerror', (error) => errors.push('skill page: ' + error.message));
    await skillPage.goto(skillUrl.toString(), { waitUntil:'networkidle' });
    assert(!(await skillPage.locator('#skillSelect').isDisabled()), 'infusable weapon exposes legal Ash selection');
    assert(await skillPage.locator('#skillSelect option').count() > 30, 'weapon and affinity filter the full legal Ash list');
    await skillPage.locator('#skillSelect').selectOption('bloody-slash');
    assert(await skillPage.locator('#skillEvent').inputValue() === 'bloody-slash-300000057', 'Ash selection resolves its exact default attack event');
    assert(await skillPage.locator('#skillPreDamage').textContent() === '1708', 'AtkParam base, reinforcement, Arcane graph, and affinity produce exact Bloody Slash output');
    assert(await skillPage.locator('#enemySkillDamage').textContent() === '1383', 'Bloody Slash applies Malenia defense and negation');
    assert((await skillPage.locator('#skillTrace').textContent()).includes('AtkParam component'), 'skill trace separates projectile-param and weapon-MV math');
    await skillPage.waitForTimeout(350);
    const savedArmament = new URL(skillPage.url()).searchParams.get('rh');
    assert(savedArmament.includes('bloody-slash') && savedArmament.includes('bloody-slash-300000057'), 'share state preserves Ash and event per armament slot');
    await skillPage.reload({ waitUntil:'networkidle' });
    assert(await skillPage.locator('#skillSelect').inputValue() === 'bloody-slash', 'Ash selection survives shared-link reload');
    assert(await skillPage.locator('#skillPreDamage').textContent() === '1708', 'skill math survives shared-link reload');
    await skillPage.screenshot({ path:'/tmp/elden-skill-desktop.png', fullPage:true });

    const riteUrl = new URL(BASE);
    riteUrl.searchParams.set('b', '60.20.30.24.58.9.15.40');
    riteUrl.searchParams.set('w', 'rivers-of-blood');
    riteUrl.searchParams.set('u', '10');
    riteUrl.searchParams.set('rh', 'rivers-of-blood~Standard~10,-,-');
    const ritePage = await context.newPage();
    ritePage.on('pageerror', (error) => errors.push('rite page: ' + error.message));
    await ritePage.goto(riteUrl.toString(), { waitUntil:'networkidle' });
    assert(await ritePage.locator('#physickOne option').count() === 38, 'Physick rack exposes all 37 unique tears');
    assert(await ritePage.locator('#greatRune option').count() === 7, 'Great Rune rack exposes all six equipable runes');
    const riteRawAR = Number(await ritePage.locator('#ar').textContent());
    await ritePage.locator('#physickOne').selectOption('strength-knot-crystal-tear');
    const tearAR = Number(await ritePage.locator('#ar').textContent());
    assert(tearAR > riteRawAR, 'active stat-knot tear changes live weapon output');
    assert(await ritePage.locator('#physickTwo option[value="strength-knot-crystal-tear"]').getAttribute('disabled') !== null, 'the same tear cannot occupy both mixture slots');
    await ritePage.locator('#physickTwo').selectOption('flame-shrouding-tear');
    assert(Number(await ritePage.locator('#ar').textContent()) > tearAR, 'second tear stacks its typed damage through the attack engine');
    await ritePage.locator('#physickActive + i').click();
    assert(Number(await ritePage.locator('#ar').textContent()) === riteRawAR, 'Physick activation switch removes both tear effects');
    await ritePage.locator('#physickActive + i').click();
    await ritePage.locator('#greatRune').selectOption('godricks-great-rune');
    const runedAR = Number(await ritePage.locator('#ar').textContent());
    assert(runedAR > tearAR, 'Rune Arc activation applies Godrick attribute math');
    await ritePage.locator('#runeArcActive + i').click();
    assert(Number(await ritePage.locator('#ar').textContent()) < runedAR, 'Rune Arc switch removes Great Rune math without unequipping it');
    await ritePage.locator('#runeArcActive + i').click();
    assert((await ritePage.locator('#effectStack').textContent()).includes("Godrick's Great Rune"), 'effect trace names the equipped Great Rune');
    await ritePage.waitForTimeout(350);
    const sharedRiteUrl = ritePage.url();
    assert(sharedRiteUrl.includes('ph=strength-knot-crystal-tear%2Cflame-shrouding-tear'), 'share URL preserves both Physick tears');
    assert(sharedRiteUrl.includes('gr=godricks-great-rune'), 'share URL preserves the Great Rune');
    await ritePage.reload({ waitUntil:'networkidle' });
    assert(await ritePage.locator('#physickOne').inputValue() === 'strength-knot-crystal-tear' && await ritePage.locator('#physickTwo').inputValue() === 'flame-shrouding-tear', 'two-tear mixture survives shared-link reload');
    assert(await ritePage.locator('#greatRune').inputValue() === 'godricks-great-rune', 'Great Rune survives shared-link reload');
    assert(Number(await ritePage.locator('#ar').textContent()) === runedAR, 'rite calculations survive shared-link reload');
    await ritePage.screenshot({ path:'/tmp/elden-rites-desktop.png', fullPage:true });

    const legacyRiteUrl = new URL(BASE);
    legacyRiteUrl.searchParams.set('b', '60.20.30.24.58.9.15.40');
    legacyRiteUrl.searchParams.set('w', 'rivers-of-blood');
    legacyRiteUrl.searchParams.set('bf', 'flame-shrouding-tear');
    const legacyRitePage = await context.newPage();
    await legacyRitePage.goto(legacyRiteUrl.toString(), { waitUntil:'networkidle' });
    assert(await legacyRitePage.locator('#physickOne').inputValue() === 'flame-shrouding-tear', 'legacy one-tear buff links migrate into the Physick rack');
    await legacyRitePage.waitForTimeout(350);
    assert(legacyRitePage.url().includes('ph=flame-shrouding-tear') && !legacyRitePage.url().includes('bf=flame-shrouding-tear'), 'migrated links rewrite into canonical rite state');

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on('pageerror', (error) => errors.push('mobile page: ' + error.message));
    await mobile.goto(url, { waitUntil: 'networkidle' });
    const overflow = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    assert(overflow.scroll <= overflow.inner, '390px layout has no horizontal overflow');
    assert(await mobile.locator('.tali-slot').count() === 4, 'mobile retains all four equipment slots');
    assert((await mobile.locator('#spellRack').textContent()).includes('Comet'), 'mobile retains spell memory and casting state');
    assert((await mobile.locator('#enemySummary').textContent()).includes('Malenia'), 'mobile retains encounter state');
    await mobile.screenshot({ path: '/tmp/elden-talisman-mobile.png', fullPage: true });

    const rangedMobile = await browser.newPage({ viewport:{ width:390, height:844 } });
    await rangedMobile.goto(ranged.url(), { waitUntil:'networkidle' });
    const rangedOverflow = await rangedMobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(rangedOverflow.scroll <= rangedOverflow.inner, 'ranged encounter has no 390px horizontal overflow');
    assert(await rangedMobile.locator('#ammoControl').isVisible(), 'mobile retains its ammunition slot');

    const skillMobile = await browser.newPage({ viewport:{ width:390, height:844 } });
    await skillMobile.goto(skillPage.url(), { waitUntil:'networkidle' });
    const skillOverflow = await skillMobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(skillOverflow.scroll <= skillOverflow.inner, 'skill lab has no 390px horizontal overflow');
    assert(await skillMobile.locator('#skillSelect').inputValue() === 'bloody-slash', 'mobile retains per-armament Ash state');

    const riteMobile = await browser.newPage({ viewport:{ width:390, height:844 } });
    await riteMobile.goto(ritePage.url(), { waitUntil:'networkidle' });
    const riteOverflow = await riteMobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(riteOverflow.scroll <= riteOverflow.inner, 'Physick and Great Rune rack has no 390px horizontal overflow');
    assert(await riteMobile.locator('#physickOne').inputValue() === 'strength-knot-crystal-tear', 'mobile retains the shared Physick mixture');

    const homeContext = await browser.newContext({ viewport:{ width:1440, height:1000 } });
    await homeContext.addInitScript(() => {
      localStorage.setItem('er-build', JSON.stringify({ schemaVersion:7, level:150, stats:{ VIG:60 }, weapon:'rivers-of-blood' }));
      localStorage.setItem('er-my-builds', JSON.stringify([{ name:'Blood Lord' },{ name:'Dark Moon' }]));
      localStorage.setItem('er-guides', JSON.stringify({ steps:{ 'ranni-0':1 }, bosses:{ margit:1 } }));
      localStorage.setItem('er-tales', JSON.stringify({ kindling:{ chapter:'ch01', read:{ ch01:{ t:Date.now() } } } }));
    });
    const home = await homeContext.newPage();
    home.on('pageerror', (error) => errors.push('home page: ' + error.message));
    await home.goto(new URL('../', BASE).toString(), { waitUntil:'networkidle' });
    assert(await home.locator('#ledgerBuild').textContent() === 'RL 150', 'returning Grace restores the active build summary');
    assert(await home.locator('#ledgerJourney').textContent() === '1 / 109', 'returning Grace counts only valid quest steps');
    assert(await home.locator('#ledgerBosses').textContent() === '1 / 21', 'returning Grace restores boss progress');
    assert(await home.locator('#ledgerTales').textContent() === '1 / 48', 'returning Grace spans all three Tales manifests');
    assert((await home.locator('#ledgerResume').getAttribute('href')).includes('work=kindling&ch=ch02'), 'returning Grace points to the next unread chapter');
    assert((await home.locator('.film-ribbon').getAttribute('href')) === 'kindling/', 'homepage gives the first film a direct front door');
    await home.screenshot({ path:'/tmp/elden-home-desktop.png', fullPage:true });
    await homeContext.close();

    const homeMobileContext = await browser.newContext({ viewport:{ width:390, height:844 } });
    const homeMobile = await homeMobileContext.newPage();
    await homeMobile.goto(new URL('../', BASE).toString(), { waitUntil:'networkidle' });
    const homeOverflow = await homeMobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(homeOverflow.scroll <= homeOverflow.inner, 'returning Grace has no 390px horizontal overflow');
    assert(await homeMobile.locator('.ledger-metric').count() === 4, 'mobile keeps all four Archive pillars visible');
    await homeMobile.screenshot({ path:'/tmp/elden-home-mobile.png', fullPage:true });
    await homeMobileContext.close();

    const guideContext = await browser.newContext({ viewport:{ width:1440, height:1000 } });
    await guideContext.addInitScript(() => localStorage.clear());
    const guide = await guideContext.newPage();
    guide.on('console', (msg) => { if (msg.type() === 'error') errors.push('guides console: ' + msg.text()); });
    guide.on('pageerror', (error) => errors.push('guides page: ' + error.message));
    guide.on('response', (response) => { if (response.status() >= 400) errors.push('guides http ' + response.status() + ': ' + response.url()); });
    await guide.goto(new URL('../guides/#trophies', BASE).toString(), { waitUntil:'networkidle' });
    assert(await guide.locator('.trophy-card').count() === 42, 'trophy guide renders the complete cross-platform list');
    assert(await guide.locator('.trophy-tier.platinum').count() === 1 && await guide.locator('.trophy-tier.gold').count() === 3 && await guide.locator('.trophy-tier.silver').count() === 14 && await guide.locator('.trophy-tier.bronze').count() === 24, 'trophy guide preserves every PlayStation grade');
    assert((await guide.locator('.hero-stat-list').textContent()).includes('0 / 1,000G'), 'trophy guide exposes Xbox Gamerscore progress');
    await guide.locator('#trophy-legendary-armaments .trophy-check').click();
    assert((await guide.locator('.hero-stat-list').textContent()).includes('30 / 1,000G'), 'trophy completion updates and persists Gamerscore');
    assert(await guide.evaluate(() => !!JSON.parse(localStorage.getItem('er-guides')).trophies['legendary-armaments']), 'trophy completion is saved in the shared guide store');
    await guide.locator('#guideSearch').fill('Placidusax');
    await guide.locator('.guide-search-item').first().click();
    assert((await guide.locator('#trophy-dragonlord-placidusax').getAttribute('id')) === 'trophy-dragonlord-placidusax', 'instant search routes directly to trophy entries');
    await guide.screenshot({ path:'/tmp/elden-trophies-desktop.png', fullPage:true });
    await guideContext.close();

    const guideMobileContext = await browser.newContext({ viewport:{ width:390, height:844 } });
    const guideMobile = await guideMobileContext.newPage();
    await guideMobile.goto(new URL('../guides/#trophies', BASE).toString(), { waitUntil:'networkidle' });
    const guideOverflow = await guideMobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(guideOverflow.scroll <= guideOverflow.inner, 'trophy guide has no 390px horizontal overflow');
    assert(await guideMobile.locator('.trophy-card').count() === 42, 'mobile retains all trophy requirements');
    await guideMobile.screenshot({ path:'/tmp/elden-trophies-mobile.png', fullPage:true });
    await guideMobileContext.close();

    const filmContext = await browser.newContext({ viewport:{ width:1900, height:1000 } });
    const film = await filmContext.newPage();
    film.on('console', (msg) => { if (msg.type() === 'error') errors.push('film console: ' + msg.text()); });
    film.on('pageerror', (error) => errors.push('film page: ' + error.message));
    film.on('response', (response) => { if (response.status() >= 400) errors.push('film http ' + response.status() + ': ' + response.url()); });
    await film.goto(new URL('../kindling/', BASE).toString(), { waitUntil:'networkidle' });
    assert((await film.locator('#kindlingStatus').textContent()).includes('In production'), 'KINDLING has a deliberate pre-release state');
    assert(await film.locator('.kindling-movement').count() === 9, 'KINDLING exposes all nine written movements');
    assert((await film.locator('.kindling-movement').first().getAttribute('href')).includes('work=kindling&ch=ch01'), 'first movement opens the exact Tale chapter');
    assert(await film.locator('link[rel="canonical"]').getAttribute('href') === 'https://elden-ring-build-calc.vercel.app/kindling/', 'KINDLING publishes its canonical URL');
    assert(await film.locator('.kindling-poster').evaluate((image) => image.complete && image.naturalWidth === 1672 && image.naturalHeight === 941), 'KINDLING loads the full-resolution Melina film poster');
    assert((await film.locator('meta[property="og:image"]').getAttribute('content')).endsWith('/assets/kindling-melina.webp'), 'KINDLING shares with its dedicated Melina artwork');
    const kindlingTitleBox = await film.locator('#kindlingTitle').boundingBox();
    const kindlingFrameBox = await film.locator('.kindling-frame-wrap').boundingBox();
    assert(kindlingTitleBox.x + kindlingTitleBox.width < kindlingFrameBox.x, 'KINDLING title remains clear of the film frame');
    await film.screenshot({ path:'/tmp/elden-kindling-desktop.png', fullPage:true });
    const tales = await filmContext.newPage();
    await tales.goto(new URL('../tales/', BASE).toString(), { waitUntil:'networkidle' });
    assert(await tales.locator('.tale-companion').count() === 3, 'Tales exposes all three Archive Film companions');
    assert((await tales.locator('.tale-card').nth(0).locator('.tale-companion').getAttribute('href')) === '../gold-and-shadow/', 'written Gold and Shadow points back to Archive Film III');
    assert((await tales.locator('.tale-card').nth(1).locator('.tale-companion').getAttribute('href')) === '../kindling/', 'written KINDLING points back to Archive Film I');
    assert((await tales.locator('.tale-card').nth(2).locator('.tale-companion').getAttribute('href')) === '../ranni/', 'written Ranni points back to Archive Film II');

    const ranni = await filmContext.newPage();
    ranni.on('console', (msg) => { if (msg.type() === 'error') errors.push('ranni console: ' + msg.text()); });
    ranni.on('pageerror', (error) => errors.push('ranni page: ' + error.message));
    ranni.on('response', (response) => { if (response.status() >= 400) errors.push('ranni http ' + response.status() + ': ' + response.url()); });
    await ranni.goto(new URL('../ranni/', BASE).toString(), { waitUntil:'networkidle' });
    assert((await ranni.locator('#ranniStatus').textContent()).includes('In production'), 'Film II has a deliberate pre-release state');
    assert(await ranni.locator('.ranni-movement').count() === 22, 'Film II exposes the prologue, twenty movements, and coda');
    assert((await ranni.locator('.ranni-movement').first().getAttribute('href')).includes('work=ranni&ch=prologue'), 'Film II begins at the canonical Ranni prologue');
    assert((await ranni.locator('.ranni-movement').last().getAttribute('href')).includes('work=ranni&ch=coda'), 'Film II ends at the canonical Ranni coda');
    assert(await ranni.locator('link[rel="canonical"]').getAttribute('href') === 'https://elden-ring-build-calc.vercel.app/ranni/', 'Film II publishes its canonical URL');
    assert(await ranni.locator('.ranni-poster').evaluate(async (image) => { await image.decode(); return image.naturalWidth === 1672 && image.naturalHeight === 941; }), 'Film II loads its full-resolution title poster');
    assert(await ranni.locator('.ranni-vow img').evaluate(async (image) => { await image.decode(); return image.naturalWidth === 1672 && image.naturalHeight === 941; }), 'Film II loads the fractured-moon artwork');
    assert(await ranni.locator('.ranni-coda img').evaluate(async (image) => { await image.decode(); return image.naturalWidth === 1672 && image.naturalHeight === 941; }), 'Film II loads the crescent portrait');
    assert((await ranni.locator('meta[property="og:image"]').getAttribute('content')).endsWith('/assets/ranni-film-ii.webp'), 'Film II shares with its dedicated title artwork');
    await ranni.screenshot({ path:'/tmp/elden-ranni-desktop.png', fullPage:true });

    const goldShadow = await filmContext.newPage();
    goldShadow.on('console', (msg) => { if (msg.type() === 'error') errors.push('gold shadow console: ' + msg.text()); });
    goldShadow.on('pageerror', (error) => errors.push('gold shadow page: ' + error.message));
    goldShadow.on('response', (response) => { if (response.status() >= 400) errors.push('gold shadow http ' + response.status() + ': ' + response.url()); });
    await goldShadow.goto(new URL('../gold-and-shadow/', BASE).toString(), { waitUntil:'networkidle' });
    assert((await goldShadow.locator('#goldShadowStatus').textContent()).includes('In production'), 'Film III has a deliberate pre-release state');
    assert(await goldShadow.locator('.gold-shadow-chapter').count() === 17, 'Film III exposes the prologue, fourteen chapters, and two appendices');
    assert((await goldShadow.locator('.gold-shadow-chapter').first().getAttribute('href')).includes('work=gold-and-shadow&ch=prologue'), 'Film III begins at the canonical prologue');
    assert((await goldShadow.locator('.gold-shadow-chapter').last().getAttribute('href')).includes('work=gold-and-shadow&ch=appendix-b'), 'Film III ends at the canonical source appendix');
    assert(await goldShadow.locator('link[rel="canonical"]').getAttribute('href') === 'https://elden-ring-build-calc.vercel.app/gold-and-shadow/', 'Film III publishes its canonical URL');
    assert(await goldShadow.locator('.gold-shadow-poster').evaluate(async (image) => { await image.decode(); return image.naturalWidth === 1672 && image.naturalHeight === 941; }), 'Film III loads its full-resolution title poster');
    assert(await goldShadow.locator('.gold-shadow-method img').evaluate(async (image) => { await image.decode(); return image.naturalWidth === 1672 && image.naturalHeight === 941; }), 'Film III loads the candlelit study artwork');
    assert((await goldShadow.locator('meta[property="og:image"]').getAttribute('content')).endsWith('/assets/gold-shadow-film-iii.webp'), 'Film III shares with its dedicated title artwork');
    await goldShadow.screenshot({ path:'/tmp/elden-gold-shadow-desktop.png', fullPage:true });
    await filmContext.close();

    const filmMobileContext = await browser.newContext({ viewport:{ width:390, height:844 } });
    const filmMobile = await filmMobileContext.newPage();
    await filmMobile.goto(new URL('../kindling/', BASE).toString(), { waitUntil:'networkidle' });
    const filmOverflow = await filmMobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(filmOverflow.scroll <= filmOverflow.inner, 'KINDLING has no 390px horizontal overflow');
    assert(await filmMobile.locator('.kindling-movement').count() === 9, 'mobile retains the complete written film spine');
    await filmMobile.screenshot({ path:'/tmp/elden-kindling-mobile.png', fullPage:true });

    const ranniMobile = await filmMobileContext.newPage();
    await ranniMobile.goto(new URL('../ranni/', BASE).toString(), { waitUntil:'networkidle' });
    const ranniOverflow = await ranniMobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(ranniOverflow.scroll <= ranniOverflow.inner, 'Film II has no 390px horizontal overflow');
    assert(await ranniMobile.locator('.ranni-movement').count() === 22, 'mobile retains the complete Ranni testament');
    await ranniMobile.evaluate(() => Promise.all(Array.from(document.querySelectorAll('.ranni-page img')).map((image) => image.decode())));
    await ranniMobile.screenshot({ path:'/tmp/elden-ranni-mobile.png', fullPage:true });

    const goldShadowMobile = await filmMobileContext.newPage();
    await goldShadowMobile.goto(new URL('../gold-and-shadow/', BASE).toString(), { waitUntil:'networkidle' });
    const goldShadowOverflow = await goldShadowMobile.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
    assert(goldShadowOverflow.scroll <= goldShadowOverflow.inner, 'Film III has no 390px horizontal overflow');
    assert(await goldShadowMobile.locator('.gold-shadow-chapter').count() === 17, 'mobile retains the complete Gold and Shadow chronicle');
    await goldShadowMobile.evaluate(() => Promise.all(Array.from(document.querySelectorAll('.gold-shadow-page img')).map((image) => image.decode())));
    await goldShadowMobile.screenshot({ path:'/tmp/elden-gold-shadow-mobile.png', fullPage:true });
    await filmMobileContext.close();

    const liveFilmContext = await browser.newContext({ viewport:{ width:1280, height:800 } });
    await liveFilmContext.route('**/data/releases.json', (route) => route.fulfill({
      contentType:'application/json',
      body:JSON.stringify({ schemaVersion:1, releases:{ kindling:{ title:'KINDLING — The Story of Melina', status:'live', youtubeId:'abcdefghijk', published:'2026-08-14', duration:'PT18M42S' } } })
    }));
    await liveFilmContext.route('https://www.youtube-nocookie.com/**', (route) => route.abort());
    const liveFilm = await liveFilmContext.newPage();
    await liveFilm.goto(new URL('../kindling/', BASE).toString(), { waitUntil:'domcontentloaded' });
    await liveFilm.locator('.kindling-video').waitFor();
    assert((await liveFilm.locator('.kindling-video').getAttribute('src')).includes('/abcdefghijk'), 'release switch installs the configured privacy-enhanced embed');
    assert((await liveFilm.locator('#kindlingWatch').getAttribute('href')).endsWith('v=abcdefghijk'), 'release switch turns the primary action into a YouTube watch link');
    assert((await liveFilm.locator('#kindlingSchema').textContent()).includes('VideoObject'), 'release switch emits video structured data');
    await liveFilmContext.close();

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
