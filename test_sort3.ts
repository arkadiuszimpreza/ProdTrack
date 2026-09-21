import { parseMaterialDimensions, compareMaterialNames } from './src/utils/materialUtils';

const items = [
  "Profil CZ 200x200x5",
  "Profil CZ 1000x100x5",
  "Profil CZ 40x40x2"
];

items.sort(compareMaterialNames);
console.log(items.join('\n'));
