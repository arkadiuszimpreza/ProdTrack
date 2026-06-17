const fs = require('fs');
let c = fs.readFileSync('src/components/wms/InventoryTakingView.tsx', 'utf8');

c = c.replace(
  '<p className="text-[10px] text-stone-400 font-semibold mt-0.5">Dost: {b.supplier} | {b.dimensions}</p>',
  `<p className="text-[10px] text-stone-400 font-semibold mt-0.5">Dost: {b.supplier} | {b.dimensions}</p>
                            <button 
                              onClick={() => openSplitModal(b)}
                              className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold mt-1.5 flex items-center gap-1 transition-all"
                            >
                              <Split size={12} /> Rozbij wsad
                            </button>`
);

// We need to inject the modal right before the final `</div>` of the component.
// Let's find the `return` statement's end.
const endTag = '    </div>\\n  );\\n}';
c = c.replace('    </div>\\n  );\\n}', `      {splittingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-stone-200 bg-stone-50 flex justify-between items-start">
              <div>
                <h3 className="font-black text-stone-900 flex items-center gap-2 text-lg">
                  <Split className="text-indigo-600" size={20} /> Rozbij wsad
                </h3>
                <p className="text-xs text-stone-500 font-medium mt-1">Podział wsadu {splittingBatch.batchNumber}</p>
              </div>
            </div>
            
            <form onSubmit={handleSplitSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Nowy nr wsadu:</label>
                <input 
                  autoFocus
                  required
                  type="text" 
                  value={splitNewNumber}
                  onChange={(e) => setSplitNewNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl font-black text-stone-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Wymiar (Długość/Arkusze):</label>
                <input 
                  type="text" 
                  value={splitDimensions}
                  onChange={(e) => setSplitDimensions(e.target.value)}
                  placeholder="np. 1500x3000 lub L.6000"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl font-bold text-stone-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                  <p className="text-[9px] text-stone-400 mt-1 leading-tight">Ilość, która zostanie odjęta z pierwotnego wsadu i zapisana jako stan systemowy nowego.</p>
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
                  <p className="text-[9px] text-stone-400 mt-1 leading-tight">Gotowe zliczenie - opcjonalne. Zapisze wynik bez dalszego wpisywania z palca.</p>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100 flex justify-end gap-2">
                 <button 
                   type="button" 
                   onClick={() => setSplittingBatch(null)}
                   className="px-4 py-2 font-black text-stone-500 hover:text-stone-700 text-sm transition-all"
                 >
                   Anuluj
                 </button>
                 <button 
                   type="submit" 
                   disabled={isSplitting}
                   className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg shadow-indigo-600/30 transition-all active:scale-95 text-sm flex items-center gap-2"
                 >
                   {isSplitting ? 'Zapisywanie...' : 'Zatwierdź Podział'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}`);

fs.writeFileSync('src/components/wms/InventoryTakingView.tsx', c);
