
const fs = require('fs');
const path = require('path');
try {
    const file = fs.readFileSync('d:\\MYSPACE\\Animation\\index.html', 'utf8');
    const scriptMatches = file.match(/<script>([\s\S]*?)<\/script>/g);
    if (!scriptMatches) {
        console.error('No script tags found');
        process.exit(1);
    }
    scriptMatches.forEach((tag, i) => {
        const code = tag.replace(/<\/?script>/g, '');
        try {
            new Function(code);
            console.log(`Script ${i} is syntactically correct`);
        } catch (e) {
            console.error(`Syntax Error in Script ${i}:`, e.message);
            // Try to find the line number
            const lines = code.split('\n');
            // Unfortunately new Function doesn't give a line number easily
        }
    });
} catch (e) {
    console.error('Error reading file:', e);
}
