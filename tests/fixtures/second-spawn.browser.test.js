'use strict';

const fs = require('fs');

if (process.env.LIFECYCLE_SECOND_SPAWN_PROOF) fs.writeFileSync(process.env.LIFECYCLE_SECOND_SPAWN_PROOF, 'second fixture started');
console.log('second fixture started');
