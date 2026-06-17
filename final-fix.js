const fs = require('fs');

const code = `import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, PackageMinus, FileSpreadsheet, User, ClipboardList, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { InventoryBatch, MaterialWithdrawal } from '../../types';
import * as XLSX from 'xlsx';
import { cn } from '../../utils/firestore-helpers';

const guessPrefix = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('rura')) return 'RU';
  if (n.includes('blacha') || n.includes('płyta')) return 'BL';
  if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik')) return 'PR';
  if (n.includes('farba') || n.includes('proszek')) return 'FA';
  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
  return 'INNE'; 
};

type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'FA' | 'SR';

interface MaterialWithdrawalViewProps {
  currentUser?: string; 
}

export function MaterialWithdrawalView({ currentUser = 'Zalogowany Pracownik' }: MaterialWithdrawalViewProps) {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [withdrawals, setWithdrawals] = useState<MaterialWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchArticle, setSearchArticle] = useState('');
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [withdrawalQuantities, setWithdrawalQuantities] = useState<Record<string, number>>({});
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
        setWithdrawalQuantities(wq => ({ ...wq, [batchId]: Math.min(batch.numericQuantity || 0, parseFloat(newWithdrawalQtyStr)) }));
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

  useEffect(() => {
    const qBatches = query(collection(db, 'inventoryBatches'));
    const qWithdrawals = query(collection(db, 'materialWithdrawals'), orderBy('createdAt', 'desc'));

    const unsubBatches = onSnapshot(qBatches, (snap) => {
      setBatches(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryBatch)));
    });

    const unsubWithdrawals = onSnapshot(qWithdrawals, (snap) => {
      setWithdrawals(snap.docs.map(d => ({ ...d.data(), id: d.id } as MaterialWithdrawal)));
      setLoading(false);
    });

    return () => { unsubBatches(); unsubWithdrawals(); };
  }, []);

  const availableArticles = useMemo(() => {
    const map = new Map<string, { articleNumber: string; articleName: string; availableQty: number }>();
    batches.forEach(b => {
      if (!b.articleNumber) return;
      const currentQty = b.numericQuantity || 0;
      if (currentQty <= 0) return;

      const key = String(b.articleNumber).trim().toUpperCase();
      const existing = map.get(key);
      if (existing) {
        existing.availableQty += currentQty;
      } else {
        map.set(key, { articleNumber: key, articleName: b.articleName || '', availableQty: currentQty });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.articleName.localeCompare(b.articleName));
  }, [batches]);

  const filteredArticles = useMemo(() => {
    let result = availableArticles;

    if (materialFilter !== 'ALL') {
      result = result.filter(a => guessPrefix(a.articleName) === materialFilter);
    }

    const term = searchArticle.toLowerCase().trim();
    if (term) {
      result = result.filter(a => {
        const matchesBasic = a.articleNumber.toLowerCase().includes(term) || a.articleName.toLowerCase().includes(term);
        if (matchesBasic) return true;

        return batches.some(b => 
          String(b.articleNumber || '').trim().toUpperCase() === String(a.articleNumber).trim().toUpperCase() && 
          (b.numericQuantity || 0) > 0 && 
          b.batchNumber.toLowerCase().includes(term)
        );
      });
    }

    return result;
  }, [availableArticles, searchArticle, materialFilter, batches]);

  const activeBatches = useMemo(() => {
    if (!selectedArticle) return [];
    let list = batches.filter(b => String(b.articleNumber || '').trim().toUpperCase() === String(selectedArticle).trim().toUpperCase() && (b.numericQuantity || 0) > 0);

    const term = searchArticle.toLowerCase().trim();
    if (term) {
      list = [...list].sort((a, b) => {
        const aMatches = a.batchNumber.toLowerCase().includes(term);
        const bMatches = b.batchNumber.toLowerCase().includes(term);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
    }
    return list;
  }, [batches, selectedArticle, searchArticle]);

  const totalEnteredQty = useMemo(() => {
    return Object.values(withdrawalQuantities).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [withdrawalQuantities]);

  const handleConfirmWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalEnteredQty <= 0) return alert('Wprowadź ilości pobierane z konkretnych wsadów!');

    try {
      const batchWrite = writeBatch(db);
      const todayStr = new Date().toISOString().split('T')[0];

      for (const [batchId, qtyToTake] of Object.entries(withdrawalQuantities)) {
        if (qtyToTake <= 0) continue;

        const originalBatch = batches.find(b => b.id === batchId);
        if (!originalBatch) continue;

        const currentAvailable = originalBatch.numericQuantity || 0;
        if (qtyToTake > currentAvailable) {
          alert(\`Błąd: Próbujesz pobrać więcej niż jest na wsadzie \${originalBatch.batchNumber}!\`);
          return;
        }

        const withdrawalRef = doc(collection(db, 'materialWithdrawals'));
        const withdrawalData: MaterialWithdrawal = {
          withdrawalDate: todayStr,
          workerName: currentUser, 
          articleNumber: originalBatch.articleNumber || '',
          articleName: originalBatch.articleName || '',
          batchNumber: originalBatch.batchNumber,
          sourcePurchaseOrderId: originalBatch.sourcePurchaseOrderId || '',
          quantityWithdrawn: qtyToTake,
          type: 'WITHDRAWAL',
          createdAt: serverTimestamp(),
          createdBy: currentUser
        };
        batchWrite.set(withdrawalRef, withdrawalData);

        const batchRef = doc(db, 'inventoryBatches', batchId);
        const newBatchQty = Number((currentAvailable - qtyToTake).toFixed(3));
        const currentWithdrawn = originalBatch.withdrawnQuantity || 0;
        const newWithdrawnQty = Number((currentWithdrawn + qtyToTake).toFixed(3));
        
        const unitLabel = originalBatch.quantityString?.split(' ')[1] || '';
        batchWrite.update(batchRef, {
          numericQuantity: newBatchQty,
          withdrawnQuantity: newWithdrawnQty,
          quantityString: \`\${newBatchQty} \${unitLabel}\`
        });
      }

      await batchWrite.commit();
      alert(\`Pomyślnie wydano \${totalEnteredQty} jednostek do produkcji!\`);
      
      setWithdrawalQuantities({});
      setSelectedArticle(null);
      setCalcValues({});
    } catch (err) {
      console.error(err);
      alert('Wystąpił błąd zapisu dokumentu pobrania.');
    }
  };

  const handleExportToERP = () => {
    if (withdrawals.length === 0) return alert('Brak pobrań do wyeksportowania!');
    
    const exportData = withdrawals.map(w => ({
      'Data Pobrania': w.withdrawalDate,
      'Nr Artykułu': w.articleNumber,
      'Nazwa': w.articleName,
      'Nr Wsadu': w.batchNumber,
      'Ilość Pobrana': w.quantityWithdrawn,
      'Operacja': w.type === 'WITHDRAWAL' ? 'Pobranie' : 'Zwrot',
      'Pracownik': w.workerName
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pobrania");
    XLSX.writeFile(wb, \`Eksport_Pobran_\${new Date().toISOString().slice(0,10)}.xlsx\`);
  };

  if (loading) return <div className="p-8 text-center text-stone-400 font-bold text-sm">Ładowanie pobrań...</div>;

  return (
    <div className="flex flex-col md:flex-row gap-6 p-6">
      
      {/* LEWY PANEL - ASORTYMENT */}
      <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-stone-100 bg-stone-50">
            <h3 className="font-black text-stone-800 text-sm uppercase tracking-wider mb-3">Wybierz Materiał</h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Wyszukaj z dostępnych..."
                  value={searchArticle}
                  onChange={(e) => setSearchArticle(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
              {searchArticle && (
                <button 
                  onClick={() => setSearchArticle('')}
                  className="w-10 h-10 flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 rounded-xl transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex gap-1.5 mt-3 overflow-x-auto custom-scrollbar pb-1">
              {['ALL', 'RU', 'PR', 'BL', 'FA', 'SR'].map(f => (
                <button
                  key={f}
                  onClick={() => setMaterialFilter(f as any)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all",
                    materialFilter === f 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-stone-200/50 text-stone-500 hover:bg-stone-200"
                  )}
                >
                  {f === 'ALL' ? 'WSZYSTKO' : f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {filteredArticles.length === 0 ? (
              <div className="text-center p-6 text-stone-400 text-xs font-semibold">
                Brak materiałów spełniających kryteria na placu
              </div>
            ) : (
              filteredArticles.map(a => (
                  <button
                    key={a.articleNumber}
                    onClick={() => {
                      setSelectedArticle(a.articleNumber);
                      setWithdrawalQuantities({});
                      setCalcValues({});
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all border",
                      selectedArticle === a.articleNumber 
                        ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                        : "bg-white border-transparent hover:border-stone-200 hover:bg-white"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-2">
                        <div className="text-[10px] font-mono font-bold text-stone-500">{a.articleNumber}</div>
                        <div className={cn("text-xs font-black truncate mt-0.5", selectedArticle === a.articleNumber ? "text-indigo-900" : "text-stone-700")} title={a.articleName}>
                          {a.articleName}
                        </div>
                      </div>
                      <ChevronRight size={16} className={cn("shrink-0 mt-2 transition-transform", selectedArticle === a.articleNumber ? "text-indigo-600 translate-x-1" : "text-stone-300")} />
                    </div>
                  </button>
                ))
            )}
          </div>
        </div>
      </div>

      {/* PRAWA KOLUMNA */}
      <div className={cn(
        "w-full lg:w-2/3 bg-white flex-col h-full relative overflow-hidden",
         !selectedArticle ? "hidden lg:flex" : "flex"
      )}>
        {!selectedArticle ? (
          <div className="flex-1 flex flex-col items-center justify-center text-stone-400 p-8">
            <PackageMinus size={48} strokeWidth={1} className="mb-4 opacity-20" />
            <p className="font-bold text-sm">Wybierz artykuł z listy po lewej stronie, aby pobrać materiał.</p>
          </div>
        ) : (
          <>
            <div className="p-4 sm:p-6 border-b border-stone-100 flex justify-between items-start bg-stone-50">
              <div className="flex items-start gap-3 sm:gap-4">
                <button 
                  onClick={() => setSelectedArticle(null)} 
                  className="lg:hidden shrink-0 p-2 sm:p-2.5 bg-white border border-stone-200 rounded-xl text-stone-500 hover:text-indigo-600 shadow-sm mt-1"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase text-indigo-600 tracking-wider mb-1">Wybrany asortyment</p>
                  <h3 className="text-lg sm:text-xl font-black text-stone-900 leading-tight">
                    {availableArticles.find(a => a.articleNumber === selectedArticle)?.articleName}
                  </h3>
                  <p className="text-xs font-mono font-bold text-stone-500 mt-1">{selectedArticle}</p>
                </div>
              </div>
              
              <div className="text-right shrink-0 ml-4 hidden sm:block">
                <p className="text-[10px] font-black uppercase text-stone-500 tracking-wider mb-1">Konto Pobierające</p>
                <div className="flex items-center justify-end gap-2 text-sm font-bold text-stone-700 bg-white px-3 py-1.5 rounded-lg border border-stone-200">
                  <User size={14} className="text-indigo-600" />
                  {currentUser}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-stone-50/50 custom-scrollbar">
              <div className="grid sm:grid-cols-2 gap-4">
                {activeBatches.map(b => {
                  const isMatchedBySearch = !!(searchArticle.trim() && b.batchNumber.toLowerCase().includes(searchArticle.toLowerCase().trim()));
                  const isSelectedAndEntered = withdrawalQuantities[b.id as string] > 0;

                  return (
                    <div key={b.id} className={cn(
                      "p-4 bg-white rounded-2xl border transition-all shadow-sm relative overflow-hidden",
                      isSelectedAndEntered 
                        ? "border-indigo-400 shadow-indigo-150" 
                        : isMatchedBySearch 
                          ? "border-amber-400 shadow-amber-100 bg-amber-50/10" 
                          : "border-stone-200"
                    )}>
                      {isMatchedBySearch && (
                        <div className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-bl-lg">
                          Wyszukany wsad
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="font-black text-stone-900 text-sm block">{b.batchNumber}</span>
                          <p className="text-[10px] text-stone-400 font-semibold mt-0.5">Dost: {b.supplier} | {b.dimensions}</p>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] font-bold text-stone-400 uppercase">Na placu:</span>
                          <span className="text-xs font-black text-emerald-600">{b.numericQuantity}</span>
                        </div>
                      </div>
                      
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
                                        [b.id as string]: Math.min(b.numericQuantity || 0, parseFloat(val) || 0)
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 bg-white border-t border-stone-200 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400">Łącznie do pobrania</p>
                <p className="text-2xl font-black text-indigo-700 leading-none mt-1">
                  {totalEnteredQty.toFixed(3)}
                </p>
              </div>
              <button
                onClick={handleConfirmWithdrawal}
                disabled={totalEnteredQty <= 0}
                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-40 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
              >
                Zatwierdź Przesunięcie
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
`;
fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', code);
