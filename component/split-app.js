const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'js');
const app = fs.readFileSync(path.join(jsDir, 'app.js'), 'utf8');
const lines = app.split('\n');

// 1-based line numbers from grep (createHouse starts ~5828, bootstrap ~7871)
const core = lines.slice(0, 5827).join('\n') + '\n';
const houses = lines.slice(5827, 7870).join('\n') + '\n';
const boot = lines.slice(7870).join('\n');

fs.writeFileSync(path.join(jsDir, 'app-core.js'), core);
fs.writeFileSync(path.join(jsDir, 'app-houses.js'), houses);
fs.writeFileSync(path.join(jsDir, 'app-boot.js'), boot);

console.log('Split:', { core: 5827, houses: 7870 - 5827, boot: lines.length - 7870 });
