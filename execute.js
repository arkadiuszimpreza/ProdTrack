const fs = require('fs');
let c = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

const uiRegexObj = new RegExp('<div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-3 mt-1">[\\s\\S]*?</div>', 'g');

const newUI = `                        <div className="flex flex-col gap-2 border-t border-stone-100 pt-3 mt-1">
                          
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
                                    const metrics = getBlachaCalculatedMetrics({ ...b, numericQuantity: withdrawalQuantities[b.id as string], unit: b.unit } as InventoryBatch);
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
                        </div>`;

c = c.replace(uiRegexObj, newUI);

// the clear calc view logic
const regexClear = /setSelectedArticle\([\s\S]*?setWithdrawalQuantities\(\{\}\);\s*\}\}/;
c = c.replace(regexClear, "setSelectedArticle(a.articleNumber);\n                      setWithdrawalQuantities({});\n                      setCalcValues({});\n                    }}");

const regexClear2 = /setWithdrawalQuantities\(\{\}\);\s*setSelectedArticle\(null\);/;
c = c.replace(regexClear2, "setWithdrawalQuantities({});\n      setSelectedArticle(null);\n      setCalcValues({});");


fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', c);
