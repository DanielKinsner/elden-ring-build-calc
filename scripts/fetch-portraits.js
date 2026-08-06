/*
 * fetch-portraits.js — download one portrait per questline NPC and per boss from wiki.gg,
 * saved locally keyed by our own `id` slugs (same source + license as scripts/fetch-icons.js).
 *
 * eldenring.wiki.gg does not run the PageImages extension (prop=pageimages is unrecognized —
 * verified during S1), so unlike fetch-icons.js this does not read a pre-built image index.
 * Instead it reads the Infobox_Character/Infobox_Boss template's `image=` wikitext param —
 * the same image the wiki's own sidebar renders — via prop=revisions, then downloads the
 * thumbnail from the same /images/thumb/<file>/<size>px-<file> pattern fetch-icons.js uses.
 *
 * The id -> wiki title map below is hard-coded (resolved once, by hand, against the live API —
 * see docs/superpowers/plans/2026-08-05-guides-tales-deckout-execution-plan.md Checkpoint 1
 * deviation log for the resolution notes). Two ids carry an explicit `image` override because
 * their page has more than one infobox and generic "first image on the page" picks the wrong
 * one: volcano-manor (the plain title resolves to a location page, not an NPC) and
 * consort-radahn (shares a page with base-game Radahn; the override points at the DLC's own
 * Phase 1 art instead of duplicating radahn's portrait).
 *
 * Usage: node scripts/fetch-portraits.js [--only npcs|bosses]
 * Idempotent (skips ids already in the manifest), rate-limited to 1 req / 250ms, retries a
 * blocked (403/429) request once after a 2s backoff, then stops the whole run cleanly and
 * reports fetched vs blocked — partial coverage ships fine; the UI letter-falls-back per image.
 *
 * Source: https://eldenring.wiki.gg — CC BY-SA 4.0 compilation license (see footer credit).
 * Non-commercial fan use; game assets are FromSoftware / Bandai Namco property.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RATE_LIMIT_MS = 250;
const USER_AGENT = 'elden-ring-build-calc (https://github.com/DanielKinsner/elden-ring-build-calc) portrait fetch';
const API = 'https://eldenring.wiki.gg/api.php';
const THUMB_SIZE = 160;
const REPO = path.resolve(__dirname, '..');

const NPC_TITLES = {
  ranni: { title: 'Ranni the Witch' },
  blaidd: { title: 'Blaidd the Half-Wolf' },
  roderika: { title: 'Roderika' },
  rogier: { title: 'Sorcerer Rogier' },
  fia: { title: 'Fia' },
  'd-brothers': { title: 'D, Hunter of the Dead' },
  goldmask: { title: 'Goldmask' },
  nepheli: { title: 'Nepheli Loux' },
  'dung-eater': { title: 'Dung Eater' },
  millicent: { title: 'Millicent' },
  sellen: { title: 'Sorceress Sellen' },
  'volcano-manor': { title: 'Tanith, Volcano Manor Proprietress', image: 'ER NPC Tanith (Volcano Manor) (9.16).png' },
  patches: { title: 'Patches' },
  diallos: { title: 'Diallos' },
  varre: { title: 'Varré' },
  boc: { title: 'Boc the Seamster' },
  latenna: { title: 'Latenna the Albinauric' },
  yura: { title: 'Yura, Hunter of Bloody Fingers' },
  alexander: { title: 'Alexander' },
  hyetta: { title: 'Hyetta' },
  thops: { title: 'Thops' }
};

const BOSS_TITLES = {
  margit: { title: 'Margit, the Fell Omen' },
  godrick: { title: 'Godrick the Grafted' },
  rennala: { title: 'Rennala, Queen of the Full Moon' },
  radahn: { title: 'Starscourge Radahn' },
  morgott: { title: 'Morgott, the Omen King' },
  'fire-giant': { title: 'Fire Giant' },
  'godskin-duo': { title: 'Godskin Duo' },
  maliketh: { title: 'Maliketh, the Black Blade' },
  godfrey: { title: 'Godfrey' },
  'radagon-elden-beast': { title: 'Radagon' },
  mohg: { title: 'Mohg, Lord of Blood' },
  malenia: { title: 'Malenia, Blade of Miquella' },
  astel: { title: 'Astel' },
  'dancing-lion': { title: 'Divine Beast Dancing Lion' },
  rellana: { title: 'Rellana, Twin Moon Knight' },
  messmer: { title: 'Messmer the Impaler' },
  bayle: { title: 'Bayle the Dread' },
  midra: { title: 'Midra, Lord of Frenzied Flame' },
  romina: { title: 'Romina, Saint of the Bud' },
  'consort-radahn': { title: 'Starscourge Radahn', image: 'Promised Consort Boss.jpg' },
  rykard: { title: 'Rykard, Lord of Blasphemy' }
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class BlockedError extends Error {
  constructor(status) { super('blocked: HTTP ' + status); this.status = status; }
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 403 || res.status === 429) {
      if (attempt === 0) { await sleep(2000); continue; }
      throw new BlockedError(res.status);
    }
    return res;
  }
}

function extractImage(wikitext) {
  const m = /\|\s*image\s*=\s*([^\n]*)/.exec(wikitext);
  if (!m) return null;
  let val = m[1].trim();
  if (!val) return null;
  if (/^<gallery/i.test(val)) {
    const start = m.index + m[0].length;
    const end = wikitext.indexOf('</gallery>', start);
    const block = wikitext.slice(start, end >= 0 ? end : start + 300);
    const line = block.split('\n').map(l => l.trim()).find(Boolean);
    if (!line) return null;
    val = line.split('|')[0].trim();
    return val || null;
  }
  const link = val.match(/\[\[(?:File|Image):([^|\]]+)/i);
  if (link) val = link[1].trim();
  val = val.split('|')[0].split('}}')[0].trim();
  return val || null;
}

async function resolveImageFilename(title) {
  const url = API + '?action=query&titles=' + encodeURIComponent(title) +
    '&redirects=1&prop=revisions&rvprop=content&rvslots=main&format=json';
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query && data.query.pages;
  const page = pages && Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  const text = page.revisions && page.revisions[0] && page.revisions[0].slots.main['*'];
  return text ? extractImage(text) : null;
}

/* the naive /images/thumb/<file>/<size>px-<file> pattern (what fetch-icons.js uses) fails on
   some sources (e.g. .webp gets thumbnailed to a differently-named .png with a cache-bust hash)
   — ask the API for the real thumb URL instead of guessing it. */
async function resolveThumbUrl(filename) {
  const url = API + '?action=query&titles=' + encodeURIComponent('File:' + filename) +
    '&prop=imageinfo&iiprop=url&iiurlwidth=' + THUMB_SIZE + '&format=json';
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query && data.query.pages;
  const page = pages && Object.values(pages)[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  return (info && (info.thumburl || info.url)) || null;
}

function extFromMagic(buf) {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return '.gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
  return null;
}

async function processGroup(name, entries, outDir, report) {
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

  for (const [id, entry] of Object.entries(entries)) {
    if (manifest[id] && fs.existsSync(path.join(outDir, manifest[id]))) {
      report.alreadyHad.push(id);
      continue;
    }
    try {
      const filename = entry.image || await resolveImageFilename(entry.title);
      await sleep(RATE_LIMIT_MS);
      if (!filename) { report.unresolved.push({ id, title: entry.title, reason: 'no image param' }); continue; }

      const url = await resolveThumbUrl(filename);
      await sleep(RATE_LIMIT_MS);
      if (!url) { report.unresolved.push({ id, title: entry.title, reason: 'no imageinfo for ' + filename }); continue; }

      const imgRes = await fetchWithRetry(url);
      await sleep(RATE_LIMIT_MS);
      if (!imgRes.ok) { report.unresolved.push({ id, title: entry.title, reason: 'HTTP ' + imgRes.status }); continue; }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const ext = extFromMagic(buf);
      if (!ext || buf.length <= 1024) { report.unresolved.push({ id, title: entry.title, reason: 'bad image (size=' + buf.length + ')' }); continue; }

      const outFile = id + ext;
      fs.writeFileSync(path.join(outDir, outFile), buf);
      manifest[id] = outFile;
      report.fetched.push({ id, title: entry.title, file: outFile, bytes: buf.length });
    } catch (e) {
      if (e instanceof BlockedError) throw e;
      report.unresolved.push({ id, title: entry.title, reason: e.message });
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('[' + name + '] wrote', manifestPath);
}

async function main() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const report = { fetched: [], alreadyHad: [], unresolved: [] };

  try {
    if (!only || only === 'npcs') {
      await processGroup('npcs', NPC_TITLES, path.join(REPO, 'assets', 'icons', 'npcs'), report);
    }
    if (!only || only === 'bosses') {
      await processGroup('bosses', BOSS_TITLES, path.join(REPO, 'assets', 'icons', 'bosses'), report);
    }
  } catch (e) {
    if (e instanceof BlockedError) {
      console.log('\nBLOCKED by wiki.gg (HTTP ' + e.status + ') — stopped early. Partial coverage is fine; the UI falls back to letter avatars for missing ids.');
    } else {
      throw e;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('fetched:', report.fetched.length, '| already had:', report.alreadyHad.length, '| unresolved:', report.unresolved.length);
  if (report.fetched.length) console.table(report.fetched.map(r => ({ id: r.id, file: r.file, bytes: r.bytes })));
  if (report.unresolved.length) console.table(report.unresolved.map(r => ({ id: r.id, title: r.title, reason: r.reason })));

  fs.writeFileSync(path.join(__dirname, 'portrait-fetch-report.json'), JSON.stringify(report, null, 2));
  console.log('full report: scripts/portrait-fetch-report.json');
}

main();
