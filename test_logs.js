import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('./firebase-blueprint.json', 'utf8'));
console.log(data.models.workLogs);
