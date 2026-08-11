const fs = require('fs');

let content = fs.readFileSync('src/components/production/OperatorPanelTablice.tsx', 'utf8');

const target = `                  />
                </div>
              ) : (`;
const replacement = `                  />
                  
                  {/* Floating Action Button (Mobile) */}
                  <div className="lg:hidden absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 px-4 z-20 pointer-events-none">
                    {selectedPanelIds.length > 0 && (
                      <div className="bg-stone-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg pointer-events-auto">
                        Zaznaczono: {selectedPanelIds.length}
                      </div>
                    )}
                    <div className="flex w-full gap-2 pointer-events-auto">
                      <button 
                        onClick={() => setShowElementsList(true)}
                        className="flex-1 py-4 bg-white text-stone-700 font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 border border-stone-200"
                      >
                        <List size={20} /> Lista
                      </button>
                      <button 
                        onClick={handleReportPanels}
                        disabled={selectedPanelIds.length === 0 || reporting}
                        className="flex-[2] py-4 bg-emerald-600 disabled:bg-stone-400 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2"
                      >
                        {reporting ? 'Zapisywanie...' : 'Zamelduj panele'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (`;

content = content.replace(target, replacement);

fs.writeFileSync('src/components/production/OperatorPanelTablice.tsx', content);
