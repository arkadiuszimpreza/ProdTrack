const fs = require('fs');
let c = fs.readFileSync('src/components/wms/InventoryTakingView.tsx', 'utf8');

const regexToReplace = /\{useCalc \? \([\s\S]*?\)\s*:\s*\(\s*<input\s+type="number"[\s\S]*?className=\{cn\([^]+\)\}\s*\/>\s*\)\}/;

const goodBlock = `{useCalc ? (
                               <div className="flex flex-1 gap-1 h-[44px]">
                                 <input
                                   type="number"
                                   min="0"
                                   placeholder="Szt"
                                   value={cv.pieces}
                                   onChange={(e) => handleCalcChange(b.id as string, 'pieces', e.target.value, b)}
                                   className={cn(
                                     (guessPrefix(b.articleName || '') === 'BL') ? "w-full px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0" : "w-1/2 px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0",
                                     cv.pieces ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
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
                                       value={cv.length}
                                       onChange={(e) => handleCalcChange(b.id as string, 'length', e.target.value, b)}
                                       className={cn(
                                         "w-1/2 px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0",
                                         cv.length ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-stone-50 border-stone-200"
                                       )}
                                     />
                                   </>
                                 )}
                               </div>
                            ) : (
                              <input 
                                type="number" 
                                step="0.001"
                                min="0"
                                placeholder={isDrafted ? "Dopisz ilość..." : "Wpisz stan..."}
                                value={inputVal}
                                onChange={(e) => handleQtyChange(b.id as string, e.target.value)}
                                className={cn(
                                  "flex-1 px-3 py-2 border rounded-xl font-black text-sm transition-all outline-none h-[44px]",
                                  hasInput ? "bg-amber-50 border-amber-300 text-amber-700 placeholder:text-amber-300/50" : "bg-stone-50 border-stone-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 placeholder:text-stone-300",
                                  isDrafted && !hasInput && "bg-white border-indigo-300 text-indigo-700"
                                )}
                              />
                            )}`;

c = c.replace(regexToReplace, goodBlock);

fs.writeFileSync('src/components/wms/InventoryTakingView.tsx', c);
