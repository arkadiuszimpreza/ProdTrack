const fs = require('fs');
let code = fs.readFileSync('src/utils/materialUtils.ts', 'utf8');

code = code.replace(/padStart\(3, '0'\)/g, "padStart(5, '0')");

fs.writeFileSync('src/utils/materialUtils.ts', code);
