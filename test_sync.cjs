const fs = require('fs');
console.log(fs.readFileSync('dev.log', 'utf8').split('\n').filter(l => l.includes('ybex_sync') || l.includes('Backup write status')).join('\n'));
