const fs = require('fs');

let content = fs.readFileSync('src/components/production/OperatorPanelTablice.tsx', 'utf8');

const target = `export const TABLICA_OPERATIONS = [
  { id: 'wycinanie', name: 'Wycinanie tab WS', getValue: (e: BoardDrawingElement) => e.areaSquareMeters || 0, unit: 'm2' },
  { id: 'zamki', name: 'Wklejanie zamków', getValue: (e: BoardDrawingElement) => e.locksLength || 0, unit: 'mb' },
  { id: 'profil', name: 'Wklejanie profila tablicy WS', getValue: (e: BoardDrawingElement) => e.profilesLength || 0, unit: 'mb' },
  { id: 'oklejanie', name: 'Oklejanie tab WS', getValue: (e: BoardDrawingElement) => e.areaSquareMeters || 0, unit: 'm2' },
  { id: 'oprawa', name: 'Oprawanie tablic', getValue: (e: BoardDrawingElement) => e.frameLength || 0, unit: 'mb' }
];`;

const replacement = `export const TABLICA_OPERATIONS = [
  { id: 'wycinanie', name: 'Wycinanie tab WS', getValue: (e: BoardDrawingElement) => e.areaSquareMeters || 0, unit: 'm2' },
  { id: 'zamki', name: 'Wklejanie zamków', getValue: (e: BoardDrawingElement) => e.locksLength || 0, unit: 'mb' },
  { id: 'profil', name: 'Wklejanie profila tablicy WS', getValue: (e: BoardDrawingElement) => e.profilesLength || 0, unit: 'mb' },
  { id: 'oklejanie', name: 'Oklejanie tab WS', getValue: (e: BoardDrawingElement) => e.areaSquareMeters || 0, unit: 'm2' },
  { id: 'oprawa', name: 'Oprawanie tablic', getValue: (e: BoardDrawingElement) => e.frameLength || 0, unit: 'mb' },
  { id: 'pakowanie', name: 'Pakowanie (nowa operacja)', getValue: (e: BoardDrawingElement) => 1, unit: 'szt' }
];`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/production/OperatorPanelTablice.tsx', content);
