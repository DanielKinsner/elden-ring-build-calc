'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, addCleanup, shutdownForSignal } = require('../browser-lifecycle');

(async () => {
  const artifact = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tarnished-lifecycle-')), 'artifact.txt');
  const proof = path.join(os.tmpdir(), `tarnished-lifecycle-browser-${process.pid}.txt`);
  fs.writeFileSync(artifact, 'remove me');
  addCleanup(() => fs.rmSync(path.dirname(artifact), { recursive:true, force:true }));
  const browser = await chromium.launch({ headless:true });
  browser.once('disconnected', () => fs.writeFileSync(proof, 'browser disconnected'));
  console.log(JSON.stringify({ type:'ready', artifact, proof }));
  if (process.env.LIFECYCLE_SIGNAL) setTimeout(() => shutdownForSignal(process.env.LIFECYCLE_SIGNAL === 'SIGINT' ? 130 : 143), 50);
})().catch(error => { console.error(error.stack); process.exit(1); });
