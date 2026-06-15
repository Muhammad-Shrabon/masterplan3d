const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);
const htmlDir = path.join(root, 'html');

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const loader = fs.readFileSync(path.join(htmlDir, 'loader.html'), 'utf8').trim();
const debug = fs.readFileSync(path.join(htmlDir, 'camera-debug.html'), 'utf8').trim();
const controls = fs.readFileSync(path.join(htmlDir, 'camera-controls.html'), 'utf8').trim();

const mountUi = `/* Regenerate: node component/build-mount.js */
(function () {
    var parts = [
        \`${esc(loader)}\`,
        \`${esc(debug)}\`,
        \`${esc(controls)}\`
    ];
    var mount = document.createElement('div');
    mount.id = 'component-mount';
    mount.innerHTML = parts.join('\\n');
    document.body.insertBefore(mount, document.body.firstChild);
    while (mount.firstChild) {
        document.body.insertBefore(mount.firstChild, mount);
    }
    mount.remove();
})();
`;

fs.writeFileSync(path.join(root, 'mount-ui.js'), mountUi);
console.log('mount-ui.js rebuilt');
