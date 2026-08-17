'use strict';

console.log('fixture ready');
process.on('message', () => console.log('fixture ignores IPC shutdown'));
process.on('SIGTERM', () => console.log('fixture ignores SIGTERM'));
setInterval(() => {}, 1000);
