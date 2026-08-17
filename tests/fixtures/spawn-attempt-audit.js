'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const auditPath = process.env.LIFECYCLE_SPAWN_ATTEMPTS;
const auditTarget = process.env.LIFECYCLE_SPAWN_AUDIT_TARGET;
const isRunner = auditTarget ? path.resolve(process.argv[1] || '') === path.resolve(auditTarget) : /(?:^|[\\/])run-browser-suite\.js$/i.test(process.argv[1] || '');
if (auditPath && isRunner) {
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = function auditedSpawn(command, args) {
    fs.appendFileSync(auditPath, JSON.stringify({ command, target:Array.isArray(args) ? args[0] : null }) + '\n');
    return originalSpawn.apply(this, arguments);
  };
}
