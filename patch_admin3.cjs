const fs = require('fs');
let file = fs.readFileSync('server.ts', 'utf8');

file = file.replace(
  'import { initializeApp, apps } from "firebase-admin/app";',
  'import { initializeApp, getApps } from "firebase-admin/app";'
);

file = file.replace(
  'if (!apps.length) {',
  'if (!getApps().length) {'
);

fs.writeFileSync('server.ts', file);
