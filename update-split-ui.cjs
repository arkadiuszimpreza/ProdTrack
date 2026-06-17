const fs = require('fs');
let c = fs.readFileSync('src/components/wms/InventoryTakingView.tsx', 'utf8');

const regex = /<div className="grid grid-cols-2 gap-4">([\s\S]*?)<div className="pt-4 border-t border-stone-100 flex justify-end gap-2">/;

const splitInputsUI = `<div className="grid grid-cols-2 gap-4">
                {guessPrefix(splittingBatch.articleName || '') === 'BL' ? (
                  <>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Stan w systemie (Szt)</label>
                      <input 
                        required
                        type="number" 
                        step="0.001"
                        min="0"
                        value={splitTransferPieces}
                        onChange={(e) => setSplitTransferPieces(e.target.value)}
                        placeholder="np. 4"
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl font-black text-emerald-700 bg-emerald-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                      <p className="text-[9px] text-stone-400 mt-1 leading-tight">Ilość szt. do wyodrębnienia. Kalkuluje: {splitTransferQty ? \`\${splitTransferQty} kg\` : '...'}</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-indigo-500 mb-1">Faktyczny spis (Szt)</label>
                      <input 
                        type="number" 
                        step="0.001"
                        min="0"
                        value={splitDraftPieces}
                        onChange={(e) => setSplitDraftPieces(e.target.value)}
                        placeholder="Opcjonalnie (arkuszy)"
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl font-black text-indigo-700 bg-indigo-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                      <p className="text-[9px] text-stone-400 mt-1 leading-tight">Wynik spisu w sztukach. Kalkuluje: {splitDraftQty ? \`\${splitDraftQty} kg\` : '...'}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Stan w systemie</label>
                      <input 
                        required
                        type="number" 
                        step="0.001"
                        min="0"
                        value={splitTransferQty}
                        onChange={(e) => setSplitTransferQty(e.target.value)}
                        placeholder="np. 100"
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl font-black text-emerald-700 bg-emerald-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 placeholder:text-emerald-300"
                      />
                      <p className="text-[9px] text-stone-400 mt-1 leading-tight">Ilość do wyodrębnienia na nowy wsad (systemowo).</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-indigo-500 mb-1">Faktyczny spis</label>
                      <input 
                        type="number" 
                        step="0.001"
                        min="0"
                        value={splitDraftQty}
                        onChange={(e) => setSplitDraftQty(e.target.value)}
                        placeholder="Opcjonalnie..."
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl font-black text-indigo-700 bg-indigo-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-indigo-300"
                      />
                      <p className="text-[9px] text-stone-400 mt-1 leading-tight">Gotowy wynik ze spisu (draft).</p>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-4 border-t border-stone-100 flex justify-end gap-2">`;

c = c.replace(regex, splitInputsUI);

// we need to make sure import of useEffect is there or add it if missing.
// It's probably already there, but just in case:
if (!c.includes('useEffect')) {
   c = c.replace('import React, { useState', 'import React, { useState, useEffect');
}

fs.writeFileSync('src/components/wms/InventoryTakingView.tsx', c);
