const fs = require('fs');
let content = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

const summarySection = `              <div className="p-6 bg-white border-t border-stone-200 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-stone-400">Łącznie do pobrania</p>
                  <p className="text-2xl font-black text-indigo-700 leading-none mt-1">
                    {totalEnteredQty.toFixed(3)}
                  </p>
                </div>
                <button
                  onClick={() => setIsConfirming(true)}
                  disabled={totalEnteredQty <= 0 || isSubmitting}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-40 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                  {isSubmitting ? 'Zatwierdzanie...' : 'Zatwierdź Przesunięcie'}
                </button>
              </div>`;

// Remove it from the bottom
content = content.replace(summarySection + `\n            </>\n          )}\n        </div>`, `            </>\n          )}\n        </div>`);

// Insert it after the header
const headerEnd = `                  <p className="text-[10px] font-black uppercase text-stone-500 tracking-wider mb-1">Konto Pobierające</p>
                  <div className="flex items-center justify-end gap-2 text-sm font-bold text-stone-700 bg-white px-3 py-1.5 rounded-lg border border-stone-200">
                    <User size={14} className="text-indigo-600" />
                    {currentUser}
                  </div>
                </div>
              </div>`;

const newHeaderEnd = headerEnd + `\n\n` + summarySection.replace('border-t', 'border-b').replace('shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]', 'shadow-sm z-10 relative');

content = content.replace(headerEnd, newHeaderEnd);

fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', content);

