import { parseMaterialDimensions, compareMaterialNames } from './src/utils/materialUtils';

const items = [
  "Kątownik CZ 40x40x4",
  "Kątownik CZ 40x40x3",
  "Kątownik CZ 100x50x6",
  "Kątownik CZ 50x50x4"
];

items.sort(compareMaterialNames);
console.log(items.join('\n'));
