import { parseMaterialDimensions, compareMaterialNames } from './src/utils/materialUtils';

const items = [
  "Ceownik CZ 120",
  "Ceownik CZ 50",
  "Ceownik CZ 65",
  "Ceownik CZ 200",
  "Ceownik CZ 100 gat S355J2 gw",
  "Ceownik CZ 80 gat S355J2",
  "Dwuteownik CZ IPE 220",
  "Dwuteownik CZ IPE 180",
  "Kątownik CZ 40x40x4 gat S355J2",
  "Kątownik CZ 50x50x4",
  "Kątownik CZ 120x80x8",
  "Kątownik CZ 60x60x6",
  "Kątownik CZ 30x30x4",
  "Kątownik CZ 200x100x10 gat S235",
  "Pręt okrągły CZ fi 08 żebrowany",
  "Pręt okrągły CZ fi 10 żebrowany",
  "Pręt okrągły CZ fi 16 żebrowany",
  "Pręt okrągły CZ fi 12 żebrowany",
  "Pręt okrągły CZ fi 20 gat S355J2"
];

items.sort(compareMaterialNames);
console.log(items.join('\n'));
