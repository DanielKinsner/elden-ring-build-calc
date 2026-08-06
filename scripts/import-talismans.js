#!/usr/bin/env node
'use strict';

/*
 * Build the complete talisman inventory from traceable sources.
 *
 * - Names, DLC membership, icons, display effects, and DLC weights:
 *   Eldenpedia (eldenring.wiki.gg), CC BY-SA 4.0.
 * - Base-game row IDs, weights, and accessory conflict groups:
 *   ERDB's game-param export (EquipParamAccessory, game 1.10).
 * - Calculation fields:
 *   merged from the hand-reviewed models in data/buffs.json.
 *
 * The importer intentionally does not infer numeric math from prose. An item without a
 * reviewed model remains selectable and weighted, while the UI labels its math coverage.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WIKI = 'https://eldenring.wiki.gg';
const LIST_URL = WIKI + '/wiki/Talismans';
const ERDB_ZIP = process.env.ERDB_GAMEDATA_ZIP || path.join(os.tmpdir(), 'erdb-gamedata-1.10.0.zip');
const ERDB_ZIP_URL = 'https://raw.githubusercontent.com/EldenRingDatabase/erdb/e2028a6e044b920a471388fb4e1c468b31b64350/src/erdb/data/gamedata/1.10.0.zip';
const OUT = path.join(ROOT, 'data', 'talismans.json');
const ICON_DIR = path.join(ROOT, 'assets', 'icons', 'talismans');

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function slugify(name) {
  return decodeHtml(name)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanWikitext(value) {
  return decodeHtml(String(value || ''))
    .replace(/<br\s*\/?\s*>/gi, ' · ')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getInfoboxField(raw, field) {
  const start = raw.indexOf('{{Infobox_Item');
  if (start < 0) return null;
  const end = raw.indexOf('\n}}', start);
  const box = raw.slice(start, end < 0 ? start + 4000 : end);
  const match = box.match(new RegExp('\\n\\|\\s*' + field + '\\s*=\\s*([\\s\\S]*?)(?=\\n\\|\\s*[a-zA-Z_]+\\s*=|$)', 'i'));
  return match ? match[1].trim() : null;
}

function readBaseParamRows() {
  if (!fs.existsSync(ERDB_ZIP)) return new Map();
  const csv = execFileSync('unzip', ['-p', ERDB_ZIP, 'EquipParamAccessory.csv'], { encoding: 'utf8' });
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift().split(';');
  const at = (name) => header.indexOf(name);
  const byName = new Map();
  lines.forEach((line) => {
    const cells = line.split(';');
    const name = cells[at('Row Name')];
    if (!name || name.startsWith('[ERROR]')) return;
    byName.set(name, {
      rowId: Number(cells[at('Row ID')]),
      weight: Number(cells[at('weight')]),
      conflictGroup: Number(cells[at('accessoryGroup')]) || null,
      effectId: Number(cells[at('refId')]) || null,
      iconId: Number(cells[at('iconId')]) || null
    });
  });
  return byName;
}

function existingModels() {
  const buffs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'buffs.json'), 'utf8'));
  const map = new Map();
  (buffs.talismans || []).forEach((item) => {
    map.set(item.id, item);
    map.set('name:' + item.name, item);
  });
  return map;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'TarnishedArchiveDataImporter/1.0 (non-commercial fan project)' } });
  if (!res.ok) throw new Error('fetch ' + url + ' -> ' + res.status);
  return res.text();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function downloadIcon(url, target) {
  if (fs.existsSync(target) && fs.statSync(target).size > 1000) return;
  const res = await fetch(url, { headers: { 'user-agent': 'TarnishedArchiveDataImporter/1.0 (non-commercial fan project)' } });
  if (!res.ok) throw new Error('icon ' + url + ' -> ' + res.status);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

async function ensureErdbZip() {
  if (fs.existsSync(ERDB_ZIP) && fs.statSync(ERDB_ZIP).size > 10000) return;
  const res = await fetch(ERDB_ZIP_URL, { headers: { 'user-agent': 'TarnishedArchiveDataImporter/1.0' } });
  if (!res.ok) throw new Error('ERDB gamedata ' + ERDB_ZIP_URL + ' -> ' + res.status);
  fs.writeFileSync(ERDB_ZIP, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  await ensureErdbZip();
  const html = await fetchText(LIST_URL);
  const blocks = html.match(/<li class="gallerybox"[\s\S]*?<\/li>/g) || [];
  const entries = [];
  const seen = new Set();
  blocks.forEach((block) => {
    const link = block.match(/<div class="thumb"[\s\S]*?<a href="([^"]+)" title="([^"]+)"/);
    const image = block.match(/<div class="thumb"[\s\S]*?<img[^>]+src="([^"]+)"/);
    if (!link || !image || !/^\/wiki\//.test(link[1])) return;
    const name = decodeHtml(link[2]);
    if (seen.has(name)) return;
    seen.add(name);
    entries.push({
      name,
      pagePath: decodeHtml(link[1]),
      imageUrl: new URL(decodeHtml(image[1]), WIKI).href,
      source: /alt="SOTE"/.test(block) ? 'dlc' : 'base'
    });
  });
  if (entries.length < 110) throw new Error('expected 110+ talismans, found ' + entries.length);

  const params = readBaseParamRows();
  const models = existingModels();
  fs.mkdirSync(ICON_DIR, { recursive: true });

  const items = await mapLimit(entries, 6, async (entry, index) => {
    const raw = await fetchText(WIKI + entry.pagePath + '?action=raw');
    const id = slugify(entry.name);
    const param = params.get(entry.name) || null;
    const reviewed = models.get(id) || models.get('name:' + entry.name) || null;
    const wikiWeight = Number(getInfoboxField(raw, 'weight'));
    const itemEffect = cleanWikitext(getInfoboxField(raw, 'item_effect')) || 'See item description';
    const iconFile = path.join(ICON_DIR, id + '.png');
    await downloadIcon(entry.imageUrl, iconFile);

    const item = {
      id,
      name: entry.name,
      source: entry.source,
      weight: param ? param.weight : (Number.isFinite(wikiWeight) ? wikiWeight : 0),
      effect: itemEffect,
      icon: 'assets/icons/talismans/' + id + '.png',
      wiki: WIKI + entry.pagePath,
      param: param ? {
        rowId: param.rowId,
        effectId: param.effectId,
        iconId: param.iconId,
        conflictGroup: param.conflictGroup
      } : null,
      conflictGroup: param && param.conflictGroup ? 'param-' + param.conflictGroup : null,
      modelStatus: reviewed ? 'modeled' : 'inventory'
    };
    if (reviewed && reviewed.id !== id) item.legacyIds = [reviewed.id];
    if (reviewed) {
      ['statBonus', 'mult', 'flat', 'statusFlat', 'survival', 'defense', 'condition', 'note', 'confirmed'].forEach((key) => {
        if (reviewed[key] != null) item[key] = reviewed[key];
      });
    }
    process.stdout.write('\r' + String(index + 1).padStart(3) + '/' + entries.length + ' ' + entry.name.slice(0, 42).padEnd(42));
    return item;
  });

  items.sort((a, b) => a.name.localeCompare(b.name));
  const payload = {
    schemaVersion: 1,
    gameVersion: '1.16',
    generatedAt: new Date().toISOString(),
    sources: [
      {
        name: 'Eldenpedia talisman catalog',
        url: LIST_URL,
        license: 'CC BY-SA 4.0',
        fields: ['name', 'source', 'weight (DLC)', 'effect', 'icon', 'wiki']
      },
      {
        name: 'ERDB EquipParamAccessory 1.10',
        url: 'https://github.com/EldenRingDatabase/erdb',
        revision: 'e2028a6',
        fields: ['rowId', 'weight (base)', 'effectId', 'iconId', 'conflictGroup']
      },
      {
        name: 'Tarnished Archive reviewed effect models',
        path: 'data/buffs.json',
        fields: ['statBonus', 'mult', 'survival', 'conditions']
      }
    ],
    coverage: {
      inventory: items.length,
      modeled: items.filter((item) => item.modelStatus === 'modeled').length,
      base: items.filter((item) => item.source === 'base').length,
      dlc: items.filter((item) => item.source === 'dlc').length
    },
    items
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  process.stdout.write('\nWrote ' + items.length + ' talismans and icons to ' + path.relative(ROOT, OUT) + '\n');
}

main().catch((error) => {
  console.error('\n' + error.stack);
  process.exit(1);
});
