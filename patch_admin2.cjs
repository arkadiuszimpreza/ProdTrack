const fs = require('fs');
let file = fs.readFileSync('server.ts', 'utf8');

const regex = /import { initializeApp, apps } from "firebase-admin\/app";[\s\S]*?const upload = multer/s;
file = file.replace(regex, 
`import { initializeApp, apps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (!apps.length) {
  try {
    initializeApp();
  } catch (error) {
    console.error("Firebase admin initialization error", error);
  }
}

const upload = multer`);

fs.writeFileSync('server.ts', file);
