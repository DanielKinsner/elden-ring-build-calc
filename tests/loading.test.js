'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function tick() { await new Promise(resolve => setImmediate(resolve)); }

async function weaponShardsStartTogether() {
  const loaderPath = path.resolve(__dirname, '../src/data-loader.js');
  delete require.cache[loaderPath];
  const ERData = require(loaderPath);
  const previousFetch = global.fetch;
  const pending = {};
  const started = [];
  global.fetch = function (url) {
    started.push(url);
    return new Promise(resolve => { pending[url] = resolve; });
  };
  try {
    const loaded = ERData.loadWeapons('data/');
    await tick();
    assert.deepStrictEqual(started, ['data/weapons/manifest.json'], 'loads the manifest before requesting shards');
    pending['data/weapons/manifest.json']({ ok:true, json:async () => ({ base:['base/a.json', 'base/b.json'], dlc:['dlc/c.json'] }) });
    await tick();
    assert.deepStrictEqual(started.slice(1), [
      'data/weapons/base/a.json', 'data/weapons/base/b.json', 'data/weapons/dlc/c.json'
    ], 'starts every manifest shard without serial waits');
    pending['data/weapons/base/a.json']({ ok:true, json:async () => [{ id:'a' }] });
    pending['data/weapons/base/b.json']({ ok:true, json:async () => [{ id:'b' }] });
    pending['data/weapons/dlc/c.json']({ ok:true, json:async () => [{ id:'c' }] });
    assert.deepStrictEqual(await loaded, [{ id:'a' }, { id:'b' }, { id:'c' }], 'preserves manifest order in the flattened return value');
  } finally {
    global.fetch = previousFetch;
  }
}

function deliveryAssetsRemainLightweight() {
  const root = path.resolve(__dirname, '..');
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const atlas = fs.readFileSync(path.join(root, 'atlas/index.js'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'assets/build.js'), 'utf8');
  assert(!/<iframe\b/i.test(home), 'homepage preview does not embed the Build Lab');
  assert(atlas.includes('loading="lazy"'), 'Atlas cards use native lazy images');
  assert(!atlas.includes('new Image()'), 'Atlas does not eagerly construct icon images');
  assert(build.includes('ensureDomain'), 'Build Lab exposes an explicit secondary-domain loader');
  assert(build.includes("domain.state = 'failed'") && build.includes('data-domain-retry'), 'secondary failures remain visible and retryable');
  assert(build.includes("q.get('cat')") && build.includes("q.get('en')"), 'secondary-only share URLs enter the hydration path');
  assert(build.includes('magicState.catalystId || magicState.spells.length') && build.includes("ensureDomain('encounter')"), 'saved secondary state requests hydration instead of being discarded');
  ['moonrithyll-s-knight-sword.png', 'greatsword-of-radahn-light.png', 'bonny-butchering-knife.png', 'unarmed.png'].forEach(name => {
    const file = path.join(root, 'assets/icons/weapons', name);
    const bytes = fs.readFileSync(file);
    assert(bytes.length > 8 && bytes.subarray(1, 4).toString() === 'PNG', name + ' is a self-hosted PNG');
  });
}

(async function () {
  await weaponShardsStartTogether();
  deliveryAssetsRemainLightweight();
  console.log('loading delivery checks passed');
})().catch(error => { console.error(error.stack); process.exit(1); });
