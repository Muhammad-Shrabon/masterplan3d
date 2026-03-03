const fs = require('fs');
const content = fs.readFileSync(process.argv[2], 'utf8');
let openBraces = 0;
let lineNum = 1;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') openBraces++;
    if (content[i] === '}') openBraces--;
    if (content[i] === '\n') lineNum++;
    if (openBraces < 0) {
        console.log(`Unexpected closing brace at line ${lineNum}`);
        process.exit(1);
    }
}
if (openBraces > 0) {
    console.log(`Unclosed braces: ${openBraces}`);
    process.exit(1);
}
console.log('Braces balanced');
