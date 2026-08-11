const fs = require('fs');

let content = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

content = content.replace(
  "const [calcValues, setCalcValues] = useState<Record<string, { pieces: string; length: string; width?: string; height?: string }>>({});",
  "const [calcValues, setCalcValues] = useState<Record<string, { pieces: string; length: string; width?: string; height?: string; area?: string }>>({});"
);

const oldHandleCalcChange = `  const handleCalcChange = (batchId: string, field: 'pieces' | 'length' | 'width' | 'height', val: string, batch: InventoryBatch) => {
    setCalcValues(prev => {
      let dims = { width: '', height: '' };
      if (batch.dimensions) {
        const dimMatch = batch.dimensions.match(/(\\d+(?:[\\.,]\\d+)?)\\s*[xX×]\\s*(\\d+(?:[\\.,]\\d+)?)/);
        if (dimMatch && dimMatch[1] && dimMatch[2]) {
          dims.width = dimMatch[1].replace(',', '.');
          dims.height = dimMatch[2].replace(',', '.');
        }
      }
      const cur = prev[batchId] || { pieces: '', length: extractLengthFromDimensions(batch.dimensions), width: dims.width, height: dims.height };
      const next = { ...cur, [field]: val };
      const p = parseFloat(next.pieces.replace(/,/g, '.'));
      const type = guessPrefix(batch.articleName || '');

      let newWithdrawalQtyStr = '';

      if ((type === 'BL' || type === 'PL')) {
        const coeffStr = String(batch.coefficient || '').replace(/,/g, '.');
        const coeffNum = parseFloat(coeffStr);
        const w = parseFloat((next.width || '').replace(',', '.'));
        const h = parseFloat((next.height || '').replace(',', '.'));

        if (!isNaN(p) && p >= 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
          const totalAreaM2 = p * (w / 1000) * (h / 1000);
          const isM2 = (batch.unit || '').toLowerCase() === 'm2' || (batch.unit || '').toLowerCase() === 'm²';
          if (isM2) {
            newWithdrawalQtyStr = Number((totalAreaM2).toFixed(3)).toString();
          } else {
            newWithdrawalQtyStr = Number((totalAreaM2 * coeffNum).toFixed(3)).toString();
          }
        }
      } else {
        const l = parseFloat(next.length.replace(/,/g, '.'));
        if (!isNaN(p) && !isNaN(l) && p >= 0 && l >= 0) {
          newWithdrawalQtyStr = Number((p * l).toFixed(3)).toString();
        }
      }`;

const newHandleCalcChange = `  const handleCalcChange = (batchId: string, field: 'pieces' | 'length' | 'width' | 'height' | 'area', val: string, batch: InventoryBatch) => {
    setCalcValues(prev => {
      let dims = { width: '', height: '' };
      if (batch.dimensions) {
        const dimMatch = batch.dimensions.match(/(\\d+(?:[\\.,]\\d+)?)\\s*[xX×]\\s*(\\d+(?:[\\.,]\\d+)?)/);
        if (dimMatch && dimMatch[1] && dimMatch[2]) {
          dims.width = dimMatch[1].replace(',', '.');
          dims.height = dimMatch[2].replace(',', '.');
        }
      }
      const cur = prev[batchId] || { pieces: '', length: extractLengthFromDimensions(batch.dimensions), width: dims.width, height: dims.height, area: '' };
      const next = { ...cur, [field]: val };
      const p = parseFloat(next.pieces.replace(/,/g, '.'));
      const type = guessPrefix(batch.articleName || '');

      let newWithdrawalQtyStr = '';

      if ((type === 'BL' || type === 'PL')) {
        const coeffStr = String(batch.coefficient || '').replace(/,/g, '.');
        const coeffNum = parseFloat(coeffStr);
        const w = parseFloat((next.width || '').replace(',', '.'));
        const h = parseFloat((next.height || '').replace(',', '.'));
        const a = parseFloat((next.area || '').replace(',', '.'));

        if (!isNaN(a) && a > 0 && !isNaN(coeffNum) && coeffNum > 0) {
          const totalAreaM2 = a;
          const isM2 = (batch.unit || '').toLowerCase() === 'm2' || (batch.unit || '').toLowerCase() === 'm²';
          if (isM2) {
            newWithdrawalQtyStr = Number((totalAreaM2).toFixed(3)).toString();
          } else {
            newWithdrawalQtyStr = Number((totalAreaM2 * coeffNum).toFixed(3)).toString();
          }
        } else if (!isNaN(p) && p >= 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
          const totalAreaM2 = p * (w / 1000) * (h / 1000);
          const isM2 = (batch.unit || '').toLowerCase() === 'm2' || (batch.unit || '').toLowerCase() === 'm²';
          if (isM2) {
            newWithdrawalQtyStr = Number((totalAreaM2).toFixed(3)).toString();
          } else {
            newWithdrawalQtyStr = Number((totalAreaM2 * coeffNum).toFixed(3)).toString();
          }
        }
      } else {
        const l = parseFloat(next.length.replace(/,/g, '.'));
        if (!isNaN(p) && !isNaN(l) && p >= 0 && l >= 0) {
          newWithdrawalQtyStr = Number((p * l).toFixed(3)).toString();
        }
      }`;

content = content.replace(oldHandleCalcChange, newHandleCalcChange);

fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', content);

