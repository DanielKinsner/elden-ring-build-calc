/*
 * fetch-ui-icons.js — download the 8 attribute icons + 6 status-effect icons from wiki.gg
 * (Eldenpedia's own "Custom Stat Icon" set + top-level status-effect uploads).
 * Self-hosted, non-commercial fan use. See scripts/fetch-icons.js for the weapon-icon equivalent.
 *
 * Usage: node scripts/fetch-ui-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const USER_AGENT = 'elden-ring-build-calc icon fetch (contact: dannytownkins@gmail.com)';
const STAT_DIR = path.resolve(__dirname, '..', 'assets', 'icons', 'stats');
const STATUS_DIR = path.resolve(__dirname, '..', 'assets', 'icons', 'status');

const STATS = { VIG: 'Vigor', MND: 'Mind', END: 'Endurance', STR: 'Strength', DEX: 'Dexterity', INT: 'Intelligence', FAI: 'Faith', ARC: 'Arcane' };
const STATUSES = { bleed: 'Blood_Loss', frost: 'Frostbite', poison: 'Poison', rot: 'Scarlet_Rot', sleep: 'Sleep', madness: 'Madness' };

function thumbUrl(filename, size) {
  const enc = encodeURIComponent(filename);
  return `https://eldenring.wiki.gg/images/thumb/${enc}/${size}px-${enc}`;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return { ok: false, status: res.status };
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return { ok: true };
}

async function main() {
  fs.mkdirSync(STAT_DIR, { recursive: true });
  fs.mkdirSync(STATUS_DIR, { recursive: true });

  for (const [key, name] of Object.entries(STATS)) {
    const dest = path.join(STAT_DIR, key.toLowerCase() + '.png');
    if (fs.existsSync(dest)) { console.log('skip', key); continue; }
    // Uploads are inconsistent per stat (some only have "(Color)", some only plain) — use
    // "(Color)" uniformly across all 8 so the set is visually consistent.
    const r = await download(thumbUrl('ER_Custom_Stat_Icon_' + name + '_(Color).png', 64), dest);
    console.log('stat', key, r.ok ? 'ok' : 'FAIL ' + r.status);
    await sleep(600);
  }

  for (const [key, name] of Object.entries(STATUSES)) {
    const dest = path.join(STATUS_DIR, key + '.png');
    if (fs.existsSync(dest)) { console.log('skip', key); continue; }
    const r = await download(thumbUrl(name + '.png', 64), dest);
    console.log('status', key, r.ok ? 'ok' : 'FAIL ' + r.status);
    await sleep(600);
  }
}

main();
