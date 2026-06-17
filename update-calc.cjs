const fs = require('fs');
let c = fs.readFileSync('src/components/wms/InventoryTakingView.tsx', 'utf8');

const regex = /const handleCalcChange = \([^)]+\) => \{[\s\S]*?\n  \};\n/;

const calcChangeCode = `const handleCalcChange = (batchId: string, field: 'pieces' | 'length', val: string, batch: InventoryBatch) => {
    setCalcValues(prev => {
      const cur = prev[batchId] || { pieces: '', length: extractLengthFromDimensions(batch.dimensions) };
      const next = { ...cur, [field]: val };
      const p = parseFloat(next.pieces.replace(',', '.'));
      const type = guessPrefix(batch.articleName || '');

      if (type === 'BL') {
        const coeffStr = String(batch.coefficient || '').replace(/,/g, '.');
        const coeffNum = parseFloat(coeffStr);
        if (!isNaN(p) && p >= 0 && !isNaN(coeffNum) && coeffNum > 0 && batch.dimensions) {
          const dimMatch = batch.dimensions.match(/(\\d+(?:[\\.,]\\d+)?)\\s*[xX×]\\s*(\\d+(?:[\\.,]\\d+)?)/);
          if (dimMatch && dimMatch[1] && dimMatch[2]) {
            const w = parseFloat(dimMatch[1].replace(/,/g, '.'));
            const h = parseFloat(dimMatch[2].replace(/,/g, '.'));
            if (w > 0 && h > 0) {
              const sheetAreaM2 = (w / 1000) * (h / 1000);
              const totalAreaM2 = p * sheetAreaM2;
              handleQtyChange(batchId, Number((totalAreaM2 * coeffNum).toFixed(3)).toString());
            } else {
              handleQtyChange(batchId, '');
            }
          } else {
            handleQtyChange(batchId, '');
          }
        } else {
          handleQtyChange(batchId, '');
        }
      } else {
        const l = parseFloat(next.length.replace(',', '.'));
        if (!isNaN(p) && !isNaN(l) && p >= 0 && l >= 0) {
          handleQtyChange(batchId, Number((p * l).toFixed(3)).toString());
        } else {
          handleQtyChange(batchId, '');
        }
      }
      return { ...prev, [batchId]: next };
    });
  };
`;

c = c.replace(regex, calcChangeCode);

fs.writeFileSync('src/components/wms/InventoryTakingView.tsx', c);
