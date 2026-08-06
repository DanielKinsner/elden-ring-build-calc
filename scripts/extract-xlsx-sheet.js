#!/usr/bin/env node
'use strict';

/* Dependency-free XLSX worksheet reader for the public datamine workbooks.
 * Usage: node scripts/extract-xlsx-sheet.js workbook.xlsx "Sheet name" [--json]
 * XLSX is OOXML in a zip container; `unzip` is already required by our param importers.
 */

const { execFileSync } = require('child_process');

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

const file = process.argv[2];
const sheetName = process.argv[3];
const asJson = process.argv.includes('--json');
if (!file || !sheetName) {
  console.error('usage: extract-xlsx-sheet.js <workbook.xlsx> <sheet name> [--json]');
  process.exit(2);
}

function unzip(entry) {
  return execFileSync('unzip', ['-p', file, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function attr(xml, name) {
  const match = xml.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"'));
  return match ? decodeXml(match[1]) : null;
}

function columnIndex(ref) {
  const letters = String(ref || '').match(/^[A-Z]+/i);
  if (!letters) return 0;
  return letters[0].toUpperCase().split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

const workbook = unzip('xl/workbook.xml');
const rels = unzip('xl/_rels/workbook.xml.rels');
const sheetTag = (workbook.match(/<sheet\b[^>]*\/?\s*>/g) || []).find((tag) => attr(tag, 'name') === sheetName);
if (!sheetTag) throw new Error('worksheet not found: ' + sheetName);
const relId = attr(sheetTag, 'r:id');
const relTag = (rels.match(/<Relationship\b[^>]*\/?\s*>/g) || []).find((tag) => attr(tag, 'Id') === relId);
if (!relTag) throw new Error('worksheet relationship not found: ' + relId);
const target = attr(relTag, 'Target').replace(/^\/?/, '');
const sheetPath = target.startsWith('xl/') ? target : 'xl/' + target;

let shared = [];
try {
  const stringsXml = unzip('xl/sharedStrings.xml');
  shared = (stringsXml.match(/<si\b[\s\S]*?<\/si>/g) || []).map((item) => {
    return decodeXml((item.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map((tag) => tag.replace(/^<t\b[^>]*>|<\/t>$/g, '')).join(''));
  });
} catch (_) {}

const sheet = unzip(sheetPath);
const rows = (sheet.match(/<row\b[\s\S]*?<\/row>/g) || []).map((rowXml) => {
  const row = [];
  (rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach((cellXml) => {
    const open = cellXml.match(/^<c\b[^>]*\/?\s*>/)[0];
    const index = columnIndex(attr(open, 'r'));
    const type = attr(open, 't');
    const raw = (cellXml.match(/<v>([\s\S]*?)<\/v>/) || [,''])[1];
    const inline = (cellXml.match(/<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/) || [,''])[1];
    row[index] = type === 's' ? (shared[Number(raw)] || '') : type === 'inlineStr' ? decodeXml(inline) : decodeXml(raw);
  });
  while (row.length && (row[row.length - 1] == null || row[row.length - 1] === '')) row.pop();
  return row.map((value) => value == null ? '' : value);
});

if (asJson) process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
else rows.forEach((row) => process.stdout.write(row.map((value) => String(value).replace(/[\t\r\n]+/g, ' ')).join('\t') + '\n'));
