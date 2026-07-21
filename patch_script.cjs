const fs = require('fs');
let code = fs.readFileSync('src/utils/inventoryExcelParser.ts', 'utf-8');
const search = `          // ROZSZERZONE ŁAPANIE CENY (Złapie "Cena (wal.podst.)", "Cena jedn.", itp.)
          const rawUnitPrice = safeParseNumber(getVal(row, ['Cena (wal.podst.)', 'Cena', 'Cena jedn.', 'Cena netto', 'Wartość']));
          const priceUnit = safeParseNumber(getVal(row, ['jc', 'pe', 'jednostka cenowa', 'jc.'])) || 1;
          const unitPrice = priceUnit > 0 ? Number((rawUnitPrice / priceUnit).toFixed(6)) : rawUnitPrice;`;
const replacement = `          // ROZSZERZONE ŁAPANIE CENY (Złapie "Cena (wal.podst.)", "Cena jedn.", itp.)
          const rawUnitPrice = safeParseNumber(getVal(row, ['Cena (wal.podst.)', 'Cena', 'Cena jedn.', 'Cena netto', 'Wartość']));
          const priceUnitCode = String(getVal(row, ['jc', 'pe', 'jednostka cenowa', 'jc.']) || '1').trim();
          let priceUnitMultiplier = 1;
          if (priceUnitCode === '2') priceUnitMultiplier = 10;
          else if (priceUnitCode === '3') priceUnitMultiplier = 100;
          else if (priceUnitCode === '4') priceUnitMultiplier = 1000;
          else if (priceUnitCode === '10' || priceUnitCode === '100' || priceUnitCode === '1000') priceUnitMultiplier = Number(priceUnitCode);
          else priceUnitMultiplier = safeParseNumber(priceUnitCode) > 0 ? safeParseNumber(priceUnitCode) : 1;
          
          const unitPrice = priceUnitMultiplier > 0 ? Number((rawUnitPrice / priceUnitMultiplier).toFixed(6)) : rawUnitPrice;`;
code = code.replace(search, replacement);
fs.writeFileSync('src/utils/inventoryExcelParser.ts', code);
