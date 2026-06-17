const fs = require('fs');
let c = fs.readFileSync('src/components/wms/InventoryTakingView.tsx', 'utf8');

const calcTransferCode = `
  const [splitDraftPieces, setSplitDraftPieces] = useState('');
  const [splitTransferPieces, setSplitTransferPieces] = useState('');

  // Auto-calculate kg for BL based on dimensions and pieces
  useEffect(() => {
    if (!splittingBatch) return;
    if (guessPrefix(splittingBatch.articleName || '') === 'BL') {
      const coeffStr = String(splittingBatch.coefficient || '').replace(/,/g, '.');
      const coeffNum = parseFloat(coeffStr);
      let sheetAreaM2 = 0;
      if (splitDimensions.trim()) {
        const dimMatch = splitDimensions.match(/(\\d+(?:[\\.,]\\d+)?)\\s*[xX×]\\s*(\\d+(?:[\\.,]\\d+)?)/);
        if (dimMatch && dimMatch[1] && dimMatch[2]) {
          const w = parseFloat(dimMatch[1].replace(/,/g, '.'));
          const h = parseFloat(dimMatch[2].replace(/,/g, '.'));
          if (w > 0 && h > 0) {
            sheetAreaM2 = (w / 1000) * (h / 1000);
          }
        }
      }

      if (sheetAreaM2 > 0 && coeffNum > 0) {
        const tP = parseFloat(splitTransferPieces.replace(/,/g, '.'));
        if (!isNaN(tP)) {
          setSplitTransferQty(Number((tP * sheetAreaM2 * coeffNum).toFixed(3)).toString());
        } else {
          setSplitTransferQty('');
        }

        const dP = parseFloat(splitDraftPieces.replace(/,/g, '.'));
        if (!isNaN(dP)) {
          setSplitDraftQty(Number((dP * sheetAreaM2 * coeffNum).toFixed(3)).toString());
        } else {
          setSplitDraftQty('');
        }
      } else {
        // If dimensions are missing/invalid, do not try to wipe but user can't reliably type pieces
      }
    }
  }, [splitTransferPieces, splitDraftPieces, splitDimensions, splittingBatch]);

  const openSplitModal = (b: InventoryBatch) => {
    setSplittingBatch(b);
    setSplitNewNumber(\`25\${guessPrefix(b.articleName || '')}...\`);
    setSplitDimensions(b.dimensions || '');
    setSplitTransferQty('');
    setSplitDraftQty('');
    setSplitTransferPieces('');
    setSplitDraftPieces('');
  };
`;

c = c.replace(/const openSplitModal = \([^)]+\) => \{[\s\S]*?\n  \};\n/, calcTransferCode);

fs.writeFileSync('src/components/wms/InventoryTakingView.tsx', c);
