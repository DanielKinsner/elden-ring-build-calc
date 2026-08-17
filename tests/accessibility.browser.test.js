'use strict';

/* Focused production-browser accessibility regression checks for Build Lab and Atlas. */
const assert = require('assert');
const { chromium } = require('./browser-lifecycle');
const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/';
const ORIGIN = process.env.ER_SITE_ORIGIN || new URL(BASE).origin;
const BUILD = new URL('/build/', ORIGIN).toString();
const ATLAS = new URL('/atlas/', ORIGIN).toString();

function ok(value, message) { assert(value, message); console.log('  ✓ ' + message); }
async function dimensions(page) { return page.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:innerWidth })); }
async function keyActivate(page, locator, label) {
  // Check native focus atomically with selection of the generated element; the protocol's
  // separate focus/evaluate round trips can span a Build re-render.
  ok(await locator.evaluate((element) => { element.focus(); return document.activeElement === element; }), 'keyboard focus reaches ' + label);
  await locator.press('Enter');
}
async function functionalContrast(page) {
  return page.evaluate(() => {
    const channel = (color) => (color.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
    const linear = (value) => { value /= 255; return value <= .03928 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4); };
    const luminance = (rgb) => .2126 * linear(rgb[0]) + .7152 * linear(rgb[1]) + .0722 * linear(rgb[2]);
    const contrast = (foreground, background) => {
      const a = luminance(channel(foreground)), b = luminance(background);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    return ['.weapon-atlas-link', '.ar-label', '.buff-cat'].map((selector) => {
      const element = document.querySelector(selector);
      return { selector, color:getComputedStyle(element).color, ratio:contrast(getComputedStyle(element).color, [17, 14, 10]) };
    });
  });
}
async function unmetSuggestionContrast(page) {
  return page.evaluate(() => {
    const channel = (color) => (color.match(/\d+(?:\.\d+)?/g) || []).slice(0, 4).map(Number);
    const rgb = (color) => { const values = channel(color); return [values[0], values[1], values[2], values[3] == null ? 1 : values[3]]; };
    const mix = (foreground, background, alpha) => [0, 1, 2].map((index) => foreground[index] * alpha + background[index] * (1 - alpha));
    const linear = (value) => { value /= 255; return value <= .03928 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4); };
    const luminance = (color) => .2126 * linear(color[0]) + .7152 * linear(color[1]) + .0722 * linear(color[2]);
    const ratio = (foreground, background) => (Math.max(luminance(foreground), luminance(background)) + .05) / (Math.min(luminance(foreground), luminance(background)) + .05);
    const row = document.querySelector('.sug-row.bad'), parent = rgb(getComputedStyle(document.body).backgroundColor), rowStyle = getComputedStyle(row);
    const rowColor = rgb(rowStyle.backgroundColor), opacity = Number(rowStyle.opacity);
    const backdrop = mix(rowColor, parent, rowColor[3]);
    const compositedBackdrop = mix(backdrop, parent, opacity);
    return ['.sug-rank', '.sug-name small', '.sug-ar', '.sug-atlas'].map((selector) => {
      const text = row.querySelector(selector), foreground = rgb(getComputedStyle(text).color);
      return { selector, opacity, ratio:ratio(mix(foreground, backdrop, foreground[3] * opacity), compositedBackdrop) };
    });
  });
}

(async function main() {
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH || undefined });
  try {
    const desktop = await browser.newPage({ viewport:{ width:1280, height:900 } });
    await desktop.goto(BUILD, { waitUntil:'domcontentloaded' });
    await desktop.locator('#stats .stat').first().waitFor();
    await desktop.locator('#buildActionStatus').waitFor();
    await desktop.evaluate(() => { window.__m3ActionStatusNode = document.querySelector('#buildActionStatus'); });

    ok(await desktop.locator('h1').count() === 1 && await desktop.locator('h1').textContent() === 'Full Build Lab', 'Build has exactly one correct h1');
    ok(await desktop.locator('h2').count() > 4, 'Build retains h2 sections beneath its h1');
    const stats = await desktop.locator('#stats .stat').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('input')).map((input) => ({ id:input.id, name:input.name, label:input.getAttribute('aria-label') }))));
    ok(stats.length === 8 && stats.every((pair) => pair.length === 2 && pair.every((input) => input.id && input.name && input.label) && pair[0].label !== pair[1].label), 'stat range and number inputs have durable distinct names');
    ok(await desktop.locator('input[type=search]').evaluateAll((inputs) => inputs.every((input) => input.getAttribute('aria-label'))), 'all Build searches have accessible names');
    ok(await desktop.getByRole('link', { name:/Open Weapon Atlas/ }).count() > 0, 'icon-only navigation has an explicit durable name');
    ok(await desktop.locator('[role=tab]').evaluateAll((tabs) => tabs.every((tab) => tab.id && tab.getAttribute('aria-controls') && document.getElementById(tab.getAttribute('aria-controls')))), 'Build tabs point to real tabpanels');
    ok(await desktop.locator('[role=tabpanel]').evaluateAll((panels) => panels.every((panel) => panel.id && panel.getAttribute('aria-labelledby') && document.getElementById(panel.getAttribute('aria-labelledby')))), 'Build tabpanels point back to their tabs');
    await desktop.getByRole('tab', { name:'Character', exact:true }).click();
    const headArmor = desktop.locator('[data-armor-slot="head"]');
    ok(await headArmor.getAttribute('aria-label') === 'Head: Empty slot' && await headArmor.locator('.armor-slot-mark').getAttribute('aria-hidden') === 'true', 'armor names are exact and exclude the decorative slot glyph');
    await desktop.locator('#build-view-tab-character').focus(); await desktop.keyboard.press('ArrowRight');
    ok(await desktop.evaluate(() => document.activeElement.id === 'build-view-tab-loadout' && document.querySelector('[role=tab][aria-selected=true]').id === 'build-view-tab-loadout'), 'Build view navigation supports ArrowRight');
    ok(await desktop.locator('.rack-slot-main').evaluateAll((items) => items.length === 6 && items.every((item) => item.tagName === 'BUTTON' && item.getAttribute('aria-label'))), 'generated rack controls are real named buttons');

    const emptyLeft = desktop.locator('.rack-slot-main[data-rack-hand="left"][data-rack-index="0"]');
    await keyActivate(desktop, emptyLeft, 'an empty armament rack slot');
    await desktop.getByRole('tab', { name:'Damage' }).waitFor({ state:'visible' });
    await desktop.waitForFunction(() => document.activeElement === document.querySelector('#weaponSearch'));
    await desktop.locator('#weaponSearch').fill('Longsword');
    const longsword = desktop.getByRole('button', { name:'Equip Longsword', exact:true });
    await longsword.waitFor();
    await keyActivate(desktop, longsword, 'a generated weapon search result');
    ok(await desktop.locator('#weaponName').textContent() === 'Longsword', 'keyboard activates generated weapon picker choices');
    await desktop.getByRole('tab', { name:'Loadout' }).click();
    await keyActivate(desktop, desktop.locator('.rack-slot-main[data-rack-hand="right"][data-rack-index="0"]'), 'an occupied armament rack slot');
    const rack = desktop.locator('.rack-slot', { has:desktop.locator('.rack-clear[data-rack-hand="left"][data-rack-index="0"]') });
    const main = rack.locator('.rack-slot-main');
    const rackBox = await rack.boundingBox(), mainBox = await main.boundingBox();
    ok(mainBox.width >= rackBox.width - 2 && mainBox.height >= rackBox.height - 2, 'armament main button covers the full rack rectangle');
    const unequip = desktop.getByRole('button', { name:'Unequip Longsword from Left Hand 1', exact:true });
    await keyActivate(desktop, unequip, 'the named Unequip action');
    ok(await desktop.locator('.rack-slot-main[data-rack-hand="left"][data-rack-index="0"]').getAttribute('aria-label') === 'Left Hand 1: empty', 'keyboard Unequip clears the selected armament');

    console.log('  … checking generated analysis, suggestions, and actions');
    const advancedTab = desktop.getByRole('tab', { name:'Advanced / Trace' });
    await advancedTab.click();
    console.log('  … Advanced view selected');
    const statChoice = desktop.locator('#byStat button[data-stat]').first();
    await statChoice.waitFor({ state:'visible' });
    const statName = (await statChoice.getAttribute('aria-label')).replace('View ', '').replace(' soft-cap analysis', '');
    console.log('  … ' + statName + ' choice resolved');
    await advancedTab.evaluate((element) => element.focus());
    let statFocused = false;
    for (let step = 0; step < 40 && !statFocused; step++) {
      await desktop.keyboard.press('Tab');
      statFocused = await desktop.evaluate(() => document.activeElement && document.activeElement.matches('#byStat button[data-stat]'));
    }
    ok(statFocused, 'keyboard focus reaches a generated stat-analysis choice');
    await desktop.keyboard.press('Enter');
    console.log('  … ' + statName + ' choice activated');
    ok((await desktop.locator('#softcapHeader').textContent()).indexOf(statName) >= 0, 'keyboard activates generated stat-analysis choices');
    await desktop.getByRole('tab', { name:'Damage' }).click();
    const suggestion = desktop.locator('#suggest .sug-select').first();
    const suggestionName = (await suggestion.getAttribute('aria-label')).replace('Equip suggested weapon ', '');
    await keyActivate(desktop, suggestion, 'a suggested weapon choice');
    ok(await desktop.locator('#weaponName').textContent() === suggestionName, 'keyboard activates suggested weapon choices');
    ok(await desktop.getByRole('link', { name:'Open ' + suggestionName + ' in Weapon Atlas', exact:true }).count() === 1, 'suggested Weapon Atlas link has a weapon-specific name');

    await desktop.getByRole('tab', { name:'Advanced / Trace' }).click();
    await desktop.locator('#addCompare').click();
    await desktop.waitForFunction((name) => document.querySelector('#buildActionStatus').textContent === name, suggestionName + ' added to comparison');
    ok(await desktop.getByRole('button', { name:'Add to Compare', exact:true }).count() === 1 && await desktop.evaluate(() => { const node = document.querySelector('#buildActionStatus'); return node === window.__m3ActionStatusNode && node.getAttribute('role') === 'status' && node.getAttribute('aria-live') === 'polite'; }), 'comparison keeps its stable name and uses the persistent polite status node');
    const removeCompare = desktop.getByRole('button', { name:'Remove ' + suggestionName + ' from comparison', exact:true });
    await removeCompare.waitFor();
    await keyActivate(desktop, removeCompare, 'a named comparison removal action');
    ok(!(await desktop.locator('.compare-bar').evaluate((bar) => bar.classList.contains('show'))), 'keyboard comparison removal changes live state');

    const quotedBuildName = 'Dex "Quality" <unsafe>';
    desktop.once('dialog', (dialog) => dialog.accept(quotedBuildName));
    await keyActivate(desktop, desktop.getByRole('button', { name:'Save', exact:true }), 'the Save action');
    await desktop.waitForFunction(() => document.querySelector('#buildActionStatus').textContent === 'Build saved');
    ok(await desktop.getByRole('button', { name:'Save', exact:true }).count() === 1 && await desktop.evaluate(() => { const node = document.querySelector('#buildActionStatus'); return node === window.__m3ActionStatusNode && node.getAttribute('role') === 'status' && node.getAttribute('aria-live') === 'polite'; }), 'Save keeps its stable name and uses the persistent polite status node');
    await desktop.getByRole('tab', { name:'Character' }).click();
    const deleteSave = desktop.getByRole('button', { name:'Delete saved build ' + quotedBuildName, exact:true });
    await deleteSave.waitFor();
    ok(await deleteSave.getAttribute('aria-label') === 'Delete saved build ' + quotedBuildName && await desktop.locator('#myBuilds unsafe').count() === 0, 'quoted saved-build names remain one safe complete delete label');
    desktop.once('dialog', (dialog) => dialog.accept());
    await keyActivate(desktop, deleteSave, 'a named saved-build delete action');
    ok(await desktop.getByRole('button', { name:'Delete saved build ' + quotedBuildName, exact:true }).count() === 0, 'saved-build delete is a separate named keyboard action');
    await desktop.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:() => Promise.resolve() } }));
    await desktop.getByRole('button', { name:'Share', exact:true }).click();
    await desktop.waitForFunction(() => document.querySelector('#buildActionStatus').textContent === 'Build link copied');
    ok(await desktop.getByRole('button', { name:'Share', exact:true }).count() === 1 && await desktop.evaluate(() => { const node = document.querySelector('#buildActionStatus'); return node === window.__m3ActionStatusNode && node.getAttribute('role') === 'status' && node.getAttribute('aria-live') === 'polite'; }), 'Share keeps its stable name and uses the persistent polite status node');

    const focusStyle = await desktop.locator('#stat-vig-number').evaluate((element) => { element.focus(); const style = getComputedStyle(element); return { outline:style.outlineStyle, width:parseFloat(style.outlineWidth) }; });
    ok(focusStyle.outline !== 'none' && focusStyle.width >= 2, 'Build number inputs receive a keyboard-visible focus treatment');
    const contrast = await functionalContrast(desktop);
    ok(contrast.every((item) => item.ratio >= 4.5), 'functional Build text clears 4.5:1 contrast on its rendered dark surface');

    const unmet = await browser.newPage({ viewport:{ width:1280, height:900 } });
    await unmet.goto(BUILD, { waitUntil:'domcontentloaded' }); await unmet.locator('#stats .stat').first().waitFor();
    for (const stat of ['vig', 'mnd', 'end', 'str', 'dex', 'int', 'fai', 'arc']) await unmet.locator('#stat-' + stat + '-number').fill('1');
    await unmet.getByRole('tab', { name:'Damage' }).click();
    await unmet.locator('.sug-row.bad').first().waitFor();
    const unmetContrast = await unmetSuggestionContrast(unmet);
    ok(unmetContrast.every((item) => item.opacity === 1 && item.ratio >= 4.5), 'enabled unmet suggestion rank, type, AR, and Atlas text retain 4.5:1 composited contrast');

    console.log('  … checking Build mobile geometry and motion');
    const mobile = await browser.newPage({ viewport:{ width:390, height:844 } });
    await mobile.goto(BUILD, { waitUntil:'domcontentloaded' }); await mobile.locator('#stats .stat').first().waitFor();
    const buildSize = await dimensions(mobile);
    ok(buildSize.scroll <= buildSize.inner, '390px Build has no horizontal overflow');
    ok(await mobile.locator('#summarySave, #build-view-tab-character, #stat-vig-number').evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 40)), 'critical Build mobile controls meet the 40px target');
    await mobile.getByRole('tab', { name:'Damage' }).click();
    const suggestionAtlasBox = await mobile.locator('#suggest .sug-atlas').first().boundingBox();
    mobile.once('dialog', (dialog) => dialog.accept('Mobile target build'));
    await mobile.getByRole('button', { name:'Save', exact:true }).click();
    await mobile.getByRole('tab', { name:'Character' }).click();
    const savedDeleteBox = await mobile.getByRole('button', { name:'Delete saved build Mobile target build', exact:true }).boundingBox();
    await mobile.getByRole('tab', { name:'Advanced / Trace' }).click();
    await mobile.locator('#addCompare').click();
    const compareRemoveBox = await mobile.locator('.cmp-x').boundingBox();
    ok([suggestionAtlasBox, savedDeleteBox, compareRemoveBox].every((box) => box.width >= 40 && box.height >= 40), 'mobile icon-only suggestion, saved-delete, and comparison-remove targets are at least 40px in both dimensions');
    const postActionSize = await dimensions(mobile);
    ok(postActionSize.scroll <= postActionSize.inner, 'mobile icon-only target sizing adds no horizontal overflow');
    await mobile.getByRole('tab', { name:'Character' }).click();
    await mobile.locator('#stat-vig-number').focus(); await mobile.keyboard.press('Tab');
    ok(await mobile.evaluate(() => { const item = document.activeElement, box = item.getBoundingClientRect(); return item.matches('a,button,input,select,textarea') && !item.closest('[hidden]') && box.width > 0 && box.height > 0; }), '390px Build keyboard walk keeps focus on a visible interactive control');
    await mobile.getByRole('tab', { name:'Loadout' }).click();
    await mobile.locator('.rack-slot-main[data-rack-hand="left"][data-rack-index="0"]').click();
    await mobile.locator('#weaponSearch').fill('Longsword');
    await mobile.getByRole('button', { name:'Equip Longsword', exact:true }).click();
    await mobile.getByRole('tab', { name:'Loadout' }).click();
    await mobile.locator('.rack-slot-main[data-rack-hand="right"][data-rack-index="0"]').click();
    const rackClear = mobile.locator('.rack-clear[data-rack-hand="left"][data-rack-index="0"]');
    const rackClearBox = await rackClear.boundingBox();
    ok(rackClearBox.width >= 40 && rackClearBox.height >= 40, '390px armament removal target is at least 40px in both dimensions');
    await rackClear.click();
    ok(await mobile.locator('.rack-slot-main[data-rack-hand="left"][data-rack-index="0"]').getAttribute('aria-label') === 'Left Hand 1: empty', '390px armament removal target mutates the intended rack slot');
    await mobile.locator('[data-tali-slot="0"]').click();
    await mobile.locator('#talismanSearch').fill('Claw Talisman');
    await mobile.locator('.talisman-result').filter({ has:mobile.locator('b', { hasText:'Claw Talisman' }) }).first().click();
    const taliClear = mobile.locator('.tali-clear[data-tali-clear="0"]');
    const taliClearBox = await taliClear.boundingBox();
    ok(taliClearBox.width >= 40 && taliClearBox.height >= 40, '390px talisman removal target is at least 40px in both dimensions');
    await taliClear.click();
    ok(await mobile.locator('[data-tali-slot="0"]').getAttribute('aria-label') === 'Talisman slot 1: empty', '390px talisman removal target mutates the intended slot');
    const removalSize = await dimensions(mobile);
    ok(removalSize.scroll <= removalSize.inner, '40px mobile removal controls add no horizontal overflow');
    await mobile.emulateMedia({ reducedMotion:'reduce' }); await mobile.reload({ waitUntil:'domcontentloaded' }); await mobile.locator('#build-view-tab-character').click(); await mobile.locator('[data-view-panel="character"]').waitFor({ state:'visible' }); await mobile.locator('#stats .stat').first().waitFor({ state:'visible' });
    ok(await mobile.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches && Number.parseFloat(getComputedStyle(document.querySelector('.build-page .panel')).animationDuration) <= .001 && Number.parseFloat(getComputedStyle(document.querySelector('.rack-slot')).transitionDuration) <= .001), 'Build suppresses animation and transition motion');

    console.log('  … checking Atlas semantics, geometry, and motion');
    await desktop.goto(ATLAS, { waitUntil:'domcontentloaded' }); await desktop.locator('.atlas-card').first().waitFor();
    ok(await desktop.locator('h1').count() === 1 && await desktop.locator('h1').textContent() === 'Weapon Atlas', 'Atlas has exactly one correct h1');
    ok(await desktop.locator('h2.atlas-type-header').count() > 0 && await desktop.locator('#atlasSearch').getAttribute('aria-label') === 'Search weapons', 'Atlas generated sections are h2 headings and its search is named');
    ok(await desktop.locator('.atlas-chip').evaluateAll((chips) => chips.every((chip) => chip.hasAttribute('aria-pressed'))), 'Atlas filter controls expose toggle state');
    const atlasTabs = desktop.locator('.atlas-tab');
    ok(await atlasTabs.evaluateAll((tabs) => tabs.every((tab) => tab.getAttribute('aria-pressed') === 'true' || tab.getAttribute('aria-pressed') === 'false')), 'Atlas attack filters expose pressed state');
    await keyActivate(desktop, atlasTabs.nth(1), 'an Atlas attack filter');
    ok(await atlasTabs.nth(1).getAttribute('aria-pressed') === 'true', 'keyboard activation updates Atlas attack-filter state');
    ok(await desktop.locator('.atlas-tab').evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height < 40)), 'Atlas desktop filters retain compact desktop geometry');

    await mobile.emulateMedia({ reducedMotion:'no-preference' }); await mobile.goto(ATLAS, { waitUntil:'domcontentloaded' }); await mobile.locator('.atlas-card').first().waitFor();
    const atlasSize = await dimensions(mobile);
    ok(atlasSize.scroll <= atlasSize.inner, '390px Atlas has no horizontal overflow');
    ok(await mobile.locator('#atlasSearch, .atlas-tab, .atlas-chip').evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 40)), 'critical Atlas mobile controls meet the 40px target');
    await mobile.locator('#atlasSearch').focus(); await mobile.keyboard.press('Tab');
    ok(await mobile.evaluate(() => { const item = document.activeElement, box = item.getBoundingClientRect(); return item.matches('a,button,input,select,textarea') && !item.closest('[hidden]') && box.width > 0 && box.height > 0; }), '390px Atlas keyboard walk keeps focus on a visible interactive control');
    await mobile.emulateMedia({ reducedMotion:'reduce' }); await mobile.reload({ waitUntil:'domcontentloaded' }); await mobile.locator('.atlas-card').first().waitFor();
    ok(await mobile.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches && Number.parseFloat(getComputedStyle(document.querySelector('.atlas-card')).transitionDuration) <= .001), 'Atlas suppresses transition motion');
    console.log('\nAccessibility browser assertions passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exit(1); });
