const fs = require('fs');

let content = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

const oldUI = `                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        min="0"
                                        placeholder="Szt"
                                        value={(calcValues[b.id as string] || { pieces: '' }).pieces}
                                        onChange={(e) => handleCalcChange(b.id as string, 'pieces', e.target.value, b)}
                                        className={cn(
                                          "flex-1 w-0 px-1 py-1 border rounded-lg text-center font-bold text-xs transition-all outline-none min-w-0",
                                          calcValues[b.id as string]?.pieces ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
                                        )}
                                      />
                                    </>`;

const newUI = `                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        min="0"
                                        placeholder="Szt"
                                        value={(calcValues[b.id as string] || { pieces: '' }).pieces}
                                        onChange={(e) => handleCalcChange(b.id as string, 'pieces', e.target.value, b)}
                                        className={cn(
                                          "flex-1 w-0 px-1 py-1 border rounded-lg text-center font-bold text-xs transition-all outline-none min-w-0",
                                          calcValues[b.id as string]?.pieces ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
                                        )}
                                      />
                                      <div className="flex items-center text-stone-400 text-[10px] font-bold px-0.5">LUB</div>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        min="0"
                                        placeholder="m²"
                                        value={(calcValues[b.id as string] || {}).area || ''}
                                        onChange={(e) => handleCalcChange(b.id as string, 'area', e.target.value, b)}
                                        className={cn(
                                          "flex-1 w-0 px-1 py-1 border rounded-lg text-center font-bold text-xs transition-all outline-none min-w-0",
                                          calcValues[b.id as string]?.area ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
                                        )}
                                      />
                                    </>`;

content = content.replace(oldUI, newUI);

fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', content);

