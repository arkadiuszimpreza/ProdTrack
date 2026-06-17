const fs = require('fs');
let c = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

c = c.replace("import { InventoryBatch, MaterialWithdrawal } from '../../types';", "import { InventoryBatch, MaterialWithdrawal } from '../../types';\nimport { getFallbackUnit } from '../../utils/erpUnitMap';");

const definitions = `
  const [calcValues, setCalcValues] = useState<Record<string, { pieces: string; length: string }>>({});

  const getBlachaCalculatedMetrics = (b: InventoryBatch) => {
    const type = guessPrefix(b.articleName || '');
    if (type !== 'BL') return null;
    if (!b.coefficient) return null;
    if (b.unit && b.unit.toLowerCase() !== 'kg') return null;
    
    const coeffStr = String(b.coefficient).replace(/,/g, '.');
    const coeffNum = parseFloat(coeffStr);
    if (isNaN(coeffNum) || coeffNum <= 0) return null;
    const totalAreaM2 = (b.numericQuantity || 0) / coeffNum;
    let sheets = undefined;
    if (b.dimensions) {
      const dimMatch = b.dimensions.match(/(\\d+(?:[\\.,]\\d+)?)[\\s]*[xX×][\\s]*(\\d+(?:[\\.,]\\d+)?)/);
      if (dimMatch && dimMatch[1] && dimMatch[2]) {
         const w = parseFloat(dimMatch[1].replace(/,/g, '.'));
         const h = parseFloat(dimMatch[2].replace(/,/g, '.'));
         if (w > 0 && h > 0) {
            const sheetAreaM2 = (w / 1000) * (h / 1000);
            sheets = totalAreaM2 / sheetAreaM2;
         }
      }
    }
    return { m2: totalAreaM2, sheets };
  };

  const extractLengthFromDimensions = (dim?: string): string => {
    if (!dim) return '';
    const match = dim.match(/L[\\s\\.\\=]*(\\d+[\\,\\.]\\d+|\\d+)/i);
    if (match && match[1]) {
      return match[1].replace(',', '.');
    }
    return '';
  };

  const handleCalcChange = (batchId: string, field: 'pieces' | 'length', val: string, batch: InventoryBatch) => {
    setCalcValues(prev => {
      const cur = prev[batchId] || { pieces: '', length: extractLengthFromDimensions(batch.dimensions) };
      const next = { ...cur, [field]: val };
      const p = parseFloat(next.pieces.replace(/,/g, '.'));
      const type = guessPrefix(batch.articleName || '');

      let newWithdrawalQtyStr = '';

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
              newWithdrawalQtyStr = Number((totalAreaM2 * coeffNum).toFixed(3)).toString();
            }
          }
        }
      } else {
        const l = parseFloat(next.length.replace(/,/g, '.'));
        if (!isNaN(p) && !isNaN(l) && p >= 0 && l >= 0) {
          newWithdrawalQtyStr = Number((p * l).toFixed(3)).toString();
        }
      }
      
      if (newWithdrawalQtyStr) {
        setWithdrawalQuantities(wq => ({ ...wq, [batchId]: Math.min(batch.numericQuantity, parseFloat(newWithdrawalQtyStr)) }));
      } else {
        setWithdrawalQuantities(wq => {
          const copy = { ...wq };
          delete copy[batchId];
          return copy;
        });
      }

      return { ...prev, [batchId]: next };
    });
  };

`;

c = c.replace("const [withdrawalQuantities, setWithdrawalQuantities] = useState<Record<string, number>>({});", "const [withdrawalQuantities, setWithdrawalQuantities] = useState<Record<string, number>>({});\n" + definitions);

const uiRegexStr = '<div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-3 mt-1">';
const idx = c.indexOf(uiRegexStr);

if (idx > -1) {
  
  const uiRegexObj = new RegExp('<div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-3 mt-1">[\\\\s\\\\S]*?</div>', 'g');
  
  const newUI = `
                        <div className="flex flex-col gap-2 border-t border-stone-100 pt-3 mt-1">
                          
                          {guessPrefix(b.articleName || '') !== 'INNE' && guessPrefix(b.articleName || '') !== 'FA' && guessPrefix(b.articleName || '') !== 'SR' ? (
                            <div className="flex flex-1 gap-1 h-[44px]">
                                 <input
                                   type="number"
                                   min="0"
                                   placeholder="Szt"
                                   value={(calcValues[b.id as string] || { pieces: '', length: extractLengthFromDimensions(b.dimensions) }).pieces}
                                   onChange={(e) => handleCalcChange(b.id as string, 'pieces', e.target.value, b)}
                                   className={cn(
                                     (guessPrefix(b.articleName || '') === 'BL') ? "w-full px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0" : "w-1/2 px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0",
                                     (calcValues[b.id as string]?.pieces) ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
                                   )}
                                 />
                                 
                                 {guessPrefix(b.articleName || '') !== 'BL' && (
                                   <>
                                     <div className="flex items-center text-stone-400 text-xs font-bold px-1">x</div>
                                     <input
                                       type="number"
                                       step="0.001"
                                       min="0"
                                       placeholder="Dł(m)"
                                       value={(calcValues[b.id as string] || { pieces: '', length: extractLengthFromDimensions(b.dimensions) }).length}
                                       onChange={(e) => handleCalcChange(b.id as string, 'length', e.target.value, b)}
                                       className={cn(
                                         "w-1/2 px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0",
                                         (calcValues[b.id as string]?.length) ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-stone-50 border-stone-200"
                                       )}
                                      />
                                   </>
                                 )}
                            </div>
                          ) : null}

                          <div className="flex flex-col gap-1 w-full justify-end">
                            <div className="flex items-center justify-between gap-3 w-full">
                                <span className="text-xs font-black text-stone-600 uppercase">Pobieram:</span>
                                <input 
                                  type="number" 
                                  step="0.001"
                                  min="0"
                                  max={b.numericQuantity}
                                  value={withdrawalQuantities[b.id as string] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                      setWithdrawalQuantities(prev => {
                                        const copy = { ...prev };
                                        delete copy[b.id as string];
                                        return copy;
                                      });
                                    } else {
                                      setWithdrawalQuantities(prev => ({ 
                                        ...prev, 
                                        [b.id as string]: Math.min(b.numericQuantity, parseFloat(val) || 0)
                                      }));
                                    }
                                  }}
                                  className={cn(
                                    "w-32 px-3 py-2 border rounded-xl text-right font-black text-sm transition-all",
                                    isMatchedBySearch
                                      ? "bg-amber-50 border-amber-200 text-amber-700 focus:ring-2 focus:ring-amber-500 focus:bg-white"
                                      : "bg-indigo-50 border-indigo-100 text-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                                  )}
                                  placeholder="Wpisz..."
                                />
                            </div>
                            <div className="flex justify-end">
                                  {(() => {
                                    if (!withdrawalQuantities[b.id as string]) return null;
                                    const metrics = getBlachaCalculatedMetrics({ ...b, numericQuantity: withdrawalQuantities[b.id as string], unit: b.unit || getFallbackUnit(b) } as InventoryBatch);
                                    if (!metrics) return null;
                                    const textParts = [];
                                    if (metrics.sheets !== undefined) {
                                       textParts.push(\`\${Math.round(metrics.sheets)} ark.\`);
                                    }
                                    textParts.push(\`\${parseFloat(metrics.m2.toFixed(3))} m²\`);
                                    return (
                                      <span className="text-[10px] text-indigo-500/80 font-bold whitespace-nowrap">
                                        ≈ {textParts.join(' | ')}
                                      </span>
                                    );
                                  })()}
                            </div>
                          </div>

                        </div>
`;

  c = c.replace(uiRegexObj, newUI);
}

// also we need to clear calc view on change of material.
c = c.replace("setSelectedArticle(a.articleNumber);\n                      setWithdrawalQuantities({});", "setSelectedArticle(a.articleNumber);\n                      setWithdrawalQuantities({});\n                      setCalcValues({});");


fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', c);
