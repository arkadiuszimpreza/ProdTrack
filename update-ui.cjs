const fs = require('fs');
let c = fs.readFileSync('src/components/wms/InventoryTakingView.tsx', 'utf8');

c = c.replace(/<div className="flex items-center text-stone-400 text-xs font-bold px-1">x<\/div>\s*<input[^>]+placeholder="Dł\(m\)"[^>]+>/, `
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
`);

// also adjust width of Szt input for 'BL'
c = c.replace(/className=\{cn\([^"]+"w-1\/2 px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0",[^"}]+\)\}/, `className={cn(
                                     (guessPrefix(b.articleName || '') === 'BL') ? "w-full px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0" : "w-1/2 px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0",
                                     cv.pieces ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
                                   )}`);

c = c.replace(/useCalc \? \([\s\S]*?<div className="flex flex-1 gap-1 h-\[44px\]">/, `useCalc ? (
                               <div className="flex flex-1 gap-1 h-[44px]">`);

fs.writeFileSync('src/components/wms/InventoryTakingView.tsx', c);
