'use strict';

console.log('fixture ready');
function stop(label) { process.stdout.write(`fixture received ${label}\n`, () => process.exit(143)); }
process.once('SIGTERM', () => stop('SIGTERM'));
if (process.send) process.on('message', message => { if (message && message.type === 'shutdown') stop('shutdown'); });
setInterval(() => {}, 1000);
