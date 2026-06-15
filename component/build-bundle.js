const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'js');
const parts = ['app-core.js', 'app-houses.js', 'app-boot.js'];
const out = parts.map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
fs.writeFileSync(path.join(jsDir, 'app.bundle.js'), out);
console.log('app.bundle.js rebuilt (' + out.split('\n').length + ' lines)');
