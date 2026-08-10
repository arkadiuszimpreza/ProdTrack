const fs = require('fs');
let file = fs.readFileSync('server.ts', 'utf8');

file = file.replace(
  'import * as admin from "firebase-admin";\\nif (!admin.apps.length) {\\n  try {\\n    admin.initializeApp();\\n  } catch (error) {\\n    console.error("Firebase admin initialization error", error);\\n  }\\n}',
  ''
);

file = file.replace(
  'import * as admin from "firebase-admin";',
  'import { initializeApp, apps } from "firebase-admin/app";\\nimport { getAuth } from "firebase-admin/auth";\\n\\nif (!apps.length) {\\n  try {\\n    initializeApp();\\n  } catch (error) {\\n    console.error("Firebase admin initialization error", error);\\n  }\\n}'
);

file = file.replace(
  'const decodedToken = await admin.auth().verifyIdToken(idToken);',
  'const decodedToken = await getAuth().verifyIdToken(idToken);'
);

fs.writeFileSync('server.ts', file);
