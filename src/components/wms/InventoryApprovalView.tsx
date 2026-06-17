import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, writeBatch, doc, serverTimestamp, runTransaction, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ClipboardCheck, FileSpreadsheet, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';
import { InventoryBatch, InventoryAdjustment, InventoryCount } from '../../types';
import * as XLSX from 'xlsx';
import { cn } from '../../utils/firestore-helpers';

const guessPrefix = (name: string): string => {
  if (!name) return 'INNE';
  const n = name.toLowerCase();
  if (n.includes('rura')) return 'RU';
  if (n.includes('blacha') || n.includes('płyta')) return 'BL';
  if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik')) return 'PR';
  if (n.includes('farba') || n.includes('proszek')) return 'FA';
  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
  return 'INNE'; 
};

const getMonday = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'FA' | 'SR' | 'INNE';

interface Props {
  currentUser?: string;
}

export function InventoryApprovalView({ currentUser = 'Inwentaryzator' }: Props) {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Stany ekranu zatwierdzania
  const [approvalCategory, setApprovalCategory] = useState<MaterialFilter>('ALL');
  const [approvalDraftEdits, setApprovalDraftEdits] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const setDateRange = (weeksAgo: number) => {
    const now = new Date();
    const monday = getMonday(now);
    monday.setDate(monday.getDate() - (weeksAgo * 7));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    
    setStartDate(formatDate(monday));
    setEndDate(formatDate(sunday));
  };

  useEffect(() => {
    const qBatches = query(collection(db, 'inventoryBatches'));
    const qAdjustments = query(collection(db, 'inventoryAdjustments'), orderBy('createdAt', 'desc'));

    const unsubBatches = onSnapshot(qBatches, (snap) => {
      setBatches(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryBatch)));
      setLoading(false);
    });

    const unsubAdjustments = onSnapshot(qAdjustments, (snap) => {
      setAdjustments(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryAdjustment)));
    });

    return () => { unsubBatches(); unsubAdjustments(); };
  }, []);

  const pendingDrafts = useMemo(() => batches.filter(b => b.draftQuantity !== undefined && b.draftQuantity !== null), [batches]);

  const handleApproveInventory = async () => {
    const draftsToApprove = pendingDrafts.filter(b => approvalCategory === 'ALL' || guessPrefix(b.articleName || '') === approvalCategory);

    if (draftsToApprove.length === 0) return alert('Brak wsadów do zatwierdzenia w wybranym asortymencie.');
    if (!window.confirm(`Zatwierdzić inwentaryzację dla ${draftsToApprove.length} wsadów z asortymentu ${approvalCategory}?\nZostaną zaktualizowane stany magazynowe i powstanie lista różnic.`)) return;

    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      await runTransaction(db, async (transaction) => {
        // Read all current quantities inside the transaction to avoid race condition
        const batchSnapshots = await Promise.all(
          draftsToApprove.map(batch => transaction.get(doc(db, 'inventoryBatches', batch.id as string)))
        );

        draftsToApprove.forEach((batch, idx) => {
          const snap = batchSnapshots[idx];
          if (!snap.exists()) return;
          
          const dbData = snap.data();
          const currentQty = dbData.numericQuantity || 0;
          
          const editedVal = approvalDraftEdits[batch.id as string];
          let countedQty = batch.draftQuantity!;
          if (editedVal !== undefined) {
             const parsedEdit = parseFloat(editedVal.replace(',', '.'));
             if (!isNaN(parsedEdit) && parsedEdit >= 0) {
               countedQty = parsedEdit;
             }
          }

          const difference = Number((countedQty - currentQty).toFixed(3));

          const auditRef = doc(collection(db, 'inventoryAdjustments'));
          transaction.set(auditRef, {
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            articleNumber: batch.articleNumber || '',
            articleName: batch.articleName || '',
            oldQuantity: currentQty,
            newQuantity: countedQty,
            difference: difference,
            approvedBy: currentUser,
            countedBy: batch.draftUpdatedBy || 'Nieznany',
            date: todayStr,
            createdAt: serverTimestamp()
          });

          const batchRef = doc(db, 'inventoryBatches', batch.id as string);
          const unitLabel = batch.quantityString?.split(' ')[1] || '';
          
          transaction.update(batchRef, {
            numericQuantity: countedQty,
            quantityString: `${countedQty} ${unitLabel}`.trim(),
            draftQuantity: null, 
            draftUpdatedAt: null,
            draftUpdatedBy: null,
            lastInventoriedAt: serverTimestamp(),
            lastInventoriedBy: currentUser
          });
        });
      });

      // Zarchiwizuj połączone historyczne zliczenia.
      // USUNIĘTO: Chcemy zachować te wpisy historii dla pracownika produkcyjnego, by po zatwierdzeniu
      // nadal widział z jakich odcinków (sztuk/metrów) składał się ten wsad.
      // (zliczane wpisy zachowują flagę archived: false aż do usunięcia przez inwentaryzatora lub zliczenia od nowa)

      alert('Wybrane różnice zostały zatwierdzone!');
      setApprovalDraftEdits({});
    } catch (err) {
      console.error(err);
      alert('Wystąpił błąd podczas zatwierdzania.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateDraftInApproval = async (batchId: string, newDraftQtyStr: string) => {
    const enteredQty = parseFloat(newDraftQtyStr.replace(',', '.'));
    if (isNaN(enteredQty) || enteredQty < 0) return alert('Wprowadzono nieprawidłową ilość!');
    
    try {
      const batchRef = doc(db, 'inventoryBatches', batchId);
      await writeBatch(db).update(batchRef, {
        draftQuantity: enteredQty,
        draftUpdatedAt: serverTimestamp(),
        draftUpdatedBy: currentUser
      }).commit();
      setApprovalDraftEdits(p => { const n = {...p}; delete n[batchId]; return n; });
    } catch(err) {
      alert("Błąd poprawy");
    }
  };

  const filteredAdjustments = useMemo(() => {
    let filtered = adjustments;
    if (startDate) {
      filtered = filtered.filter(a => a.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(a => a.date <= endDate);
    }
    return filtered;
  }, [adjustments, startDate, endDate]);

  const handleExportFullReport = () => {
    // bDate is derived from lastInventoriedAt
    let finalBatches = batches.filter(b => b.lastInventoriedAt);
    
    // We should probably filter finalBatches by startDate / endDate as well, based on lastInventoriedAt. 
    // And also, if adjustments are filtered, we'll only see the adjustments in that date range.
    if (startDate || endDate) {
      finalBatches = finalBatches.filter(b => {
         const d = (b.lastInventoriedAt as any).toDate ? (b.lastInventoriedAt as any).toDate() : new Date((b.lastInventoriedAt as any).seconds * 1000);
         const bDate = d.toISOString().split('T')[0];
         if (startDate && bDate < startDate) return false;
         if (endDate && bDate > endDate) return false;
         return true;
      });
    }

    if (finalBatches.length === 0) return alert('Brak zinwentaryzowanych wsadów w tym przedziale czasu.');

    const exportRows = finalBatches.map(b => {
      let bDate = '-';
      if (b.lastInventoriedAt) {
        const d = (b.lastInventoriedAt as any).toDate ? (b.lastInventoriedAt as any).toDate() : new Date((b.lastInventoriedAt as any).seconds * 1000);
        bDate = d.toISOString().split('T')[0];
      }

      // We look at filteredAdjustments to make sure we get an adjustment in that time range
      let adj = filteredAdjustments.find(a => a.batchId === b.id && a.date === bDate);
      
      if (!adj) {
         const latestAdj = filteredAdjustments.find(a => a.batchId === b.id);
         if (latestAdj && latestAdj.date === bDate) {
           adj = latestAdj;
         }
      }

      return {
        'Data Zatwierdzenia': adj ? adj.date : bDate,
        'Fizycznie Zliczył': adj ? (adj.countedBy || '-') : (b.lastInventoriedBy || '-'),
        'Zatwierdził (System)': adj ? adj.approvedBy : (b.lastInventoriedBy || '-'),
        'Indeks (Artykuł)': b.articleNumber || '',
        'Nazwa asortymentu': b.articleName || '',
        'Nr Wsadu': b.batchNumber,
        'Stan Stary (ERP/WMS)': adj ? adj.oldQuantity : (b.numericQuantity || 0),
        'Stan Nowy (Zliczony)': adj ? adj.newQuantity : (b.numericQuantity || 0),
        'RÓŻNICA (Do Przesunięcia)': adj ? adj.difference : 0,
      };
    }).sort((a,b) => a['Nr Wsadu'].localeCompare(b['Nr Wsadu']));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pelny_Raport_Inwentaryzacyjny');
    worksheet['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 45 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
    const fileName = (startDate || endDate) 
        ? `Pelny_Raport_Inwentaryzacyjny_${startDate || 'Poczatek'}_${endDate || 'Koniec'}.xlsx`
        : `Pelny_Raport_Inwentaryzacyjny_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handleExportDifferences = () => {
    if (filteredAdjustments.length === 0) return alert('Brak zapisanych różnic w bazie w tym wprzedziale czasu.');

    const exportRows = filteredAdjustments.map(a => ({
      'Data Zatwierdzenia': a.date,
      'Fizycznie Zliczył': a.countedBy || '-',
      'Zatwierdził (System)': a.approvedBy,
      'Indeks (Artykuł)': a.articleNumber,
      'Nazwa asortymentu': a.articleName,
      'Nr Wsadu': a.batchNumber,
      'Stan Stary (ERP/WMS)': a.oldQuantity,
      'Stan Nowy (Zliczony)': a.newQuantity,
      'RÓŻNICA (Do Przesunięcia)': a.difference,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Roznice_Inwentaryzacyjne');
    worksheet['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 45 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
    const fileName = (startDate || endDate) 
        ? `Roznice_Inwentaryzacyjne_${startDate || 'Poczatek'}_${endDate || 'Koniec'}.xlsx`
        : `Roznice_Inwentaryzacyjne_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  if (loading) return <div className="p-8 text-center text-stone-400 font-bold">Ładowanie systemu inwentaryzacji...</div>;

  return (
    <div className="space-y-6 relative">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden flex flex-col h-[calc(100vh-230px)] lg:h-[600px]">
        <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-black uppercase text-stone-500 mr-2">Asortyment:</span>
            {['ALL', 'RU', 'PR', 'BL', 'FA', 'SR', 'INNE'].map(f => (
              <button 
                key={f} 
                onClick={() => setApprovalCategory(f as MaterialFilter)} 
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all", 
                  approvalCategory === f ? "bg-amber-600 text-white shadow-md shadow-amber-600/20" : "bg-white border border-stone-200 text-stone-500 hover:bg-stone-100"
                )}
              >
                {f === 'ALL' ? 'WSZYSTKO' : f}
              </button>
            ))}
          </div>
          
          <button
            onClick={handleApproveInventory}
            disabled={pendingDrafts.filter(b => approvalCategory === 'ALL' || guessPrefix(b.articleName || '') === approvalCategory).length === 0 || isProcessing}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-emerald-700 disabled:bg-stone-300 disabled:text-stone-500 transition-all shadow-sm active:scale-95 flex items-center gap-2"
          >
            <AlertTriangle size={16} /> Zatwierdź dla: {approvalCategory === 'ALL' ? 'WSZYSTKO' : approvalCategory}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {pendingDrafts.filter(b => approvalCategory === 'ALL' || guessPrefix(b.articleName || '') === approvalCategory).length === 0 ? (
            <div className="h-full flex items-center justify-center text-stone-400 font-bold text-sm">
              Brak wykrytych różnic / wsadów do zatwierdzenia w tym asortymencie.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingDrafts
                .filter(b => approvalCategory === 'ALL' || guessPrefix(b.articleName || '') === approvalCategory)
                .map(b => {
                const diff = Number((b.draftQuantity! - (b.numericQuantity || 0)).toFixed(3));
                const editStr = approvalDraftEdits[b.id as string];
                const hasEdits = editStr !== undefined && editStr !== String(b.draftQuantity);
                
                return (
                  <div key={b.id as string} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 sm:p-4 bg-white border border-stone-200 rounded-xl shadow-sm gap-4">
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-stone-900 font-mono text-sm">{b.articleNumber}</span>
                        <span className="text-xs text-stone-400 truncate">{b.articleName}</span>
                      </div>
                      <span className="font-black text-indigo-900 border border-indigo-200 bg-indigo-50 px-2 py-0.5 rounded text-xs">Ws: {b.batchNumber}</span>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 bg-stone-50 p-2 rounded-lg border border-stone-200 w-full sm:w-auto">
                      <div className="text-center">
                        <p className="text-[9px] uppercase font-bold text-stone-400 mb-0.5">WMS</p>
                        <p className="text-xs font-black text-stone-600">{b.numericQuantity}</p>
                      </div>
                      <div className="text-stone-300">➜</div>
                      
                      <div className="text-center flex flex-col items-center">
                          <p className="text-[9px] uppercase font-bold text-indigo-400 mb-0.5">Zliczone</p>
                          <input 
                            type="number"
                            step="0.001"
                            value={editStr !== undefined ? editStr : b.draftQuantity}
                            onChange={(e) => setApprovalDraftEdits(prev => ({...prev, [b.id as string]: e.target.value}))}
                            className={cn("w-20 text-center font-black text-sm px-1 py-0.5 rounded border transition-colors outline-none", 
                              hasEdits ? "border-amber-400 text-amber-700 bg-amber-50" : "border-stone-300 text-indigo-700 focus:border-indigo-400"
                            )}
                          />
                          {hasEdits && (
                            <button onClick={() => handleUpdateDraftInApproval(b.id as string, editStr)} className="mt-1 text-[9px] font-black uppercase text-amber-600 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded">Zastąp</button>
                          )}
                      </div>

                      <div className="ml-2 pl-4 border-l border-stone-200 text-center w-16">
                          <p className="text-[9px] uppercase font-bold text-stone-400 mb-0.5">Różnica</p>
                          <p className={cn("text-xs font-black", diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-stone-500")}>
                            {diff > 0 ? '+' : ''}{diff}
                          </p>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mt-6">
        <div className="p-4 border-b border-stone-200 bg-stone-50 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <h3 className="font-black text-stone-700 uppercase tracking-tight text-sm flex items-center gap-2">
            <ClipboardCheck size={18} className="text-indigo-600" />
            Historia Zmian Inwentaryzacyjnych
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportFullReport}
              className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-colors flex items-center gap-2 shadow-sm"
            >
              <FileSpreadsheet size={16} />
              Pełny Raport (Zgodne + Różnice)
            </button>
            <button
              onClick={handleExportDifferences}
              disabled={filteredAdjustments.length === 0}
              className="px-4 py-2 bg-white border border-stone-300 text-stone-600 rounded-xl font-bold text-xs hover:bg-stone-50 disabled:bg-stone-100 transition-colors flex items-center gap-2 shadow-sm"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" />
              Eksportuj Różnice
            </button>
          </div>
        </div>

        {/* Sekcja filtrów daty */}
        <div className="p-3 bg-stone-100/50 border-b border-stone-200 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <CalendarIcon size={14} className="text-stone-500" />
              <span className="text-[10px] font-black uppercase text-stone-500">Zakres:</span>
            </div>
            <div className="flex gap-2 items-center">
              <input 
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border border-stone-200 bg-white shadow-sm font-bold text-stone-700"
              />
              <span className="text-stone-400 text-xs">-</span>
              <input 
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border border-stone-200 bg-white shadow-sm font-bold text-stone-700"
              />
            </div>
            
            {(startDate || endDate) && (
              <button 
               onClick={() => { setStartDate(''); setEndDate(''); }}
               className="text-[10px] font-black uppercase text-stone-400 hover:text-stone-600 bg-white border border-stone-200 px-2 py-1.5 rounded-lg shadow-sm"
              >
                Wyczyść
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDateRange(0)}
              className="text-[10px] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 font-black uppercase hover:bg-stone-50"
            >
              Obecny Tydzień
            </button>
            <button
              onClick={() => setDateRange(1)}
              className="text-[10px] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 font-black uppercase hover:bg-stone-50"
            >
              Poprzedni Tydzień
            </button>
            <button
              onClick={() => setDateRange(2)}
              className="text-[10px] px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 font-black uppercase hover:bg-stone-50"
            >
              2 Tygodnie Temu
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 text-[10px] font-black uppercase tracking-wider text-stone-400 border-b border-stone-200">
                <th className="p-4">Data</th>
                <th className="p-4">Osoba (Zliczył / Zatwierdził)</th>
                <th className="p-4">Indeks / Wsad</th>
                <th className="p-4 text-right">Start / Koniec</th>
                <th className="p-4 text-right border-l border-stone-200">Różnica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs">
              {filteredAdjustments.slice(0, 50).map(adj => (
                <tr key={adj.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="p-4 font-mono text-stone-500">{adj.date}</td>
                  <td className="p-4 flex flex-col">
                    <span className="font-bold text-stone-700 text-[10px] uppercase">Zliczył: <span className="text-indigo-600">{adj.countedBy || '-'}</span></span>
                    <span className="font-bold text-stone-500 text-[10px] uppercase">Zatw: {adj.approvedBy}</span>
                  </td>
                  <td className="p-4">
                    <div className="font-mono font-black text-stone-800">{adj.articleNumber}</div>
                    <div className="text-[10px] text-stone-400 uppercase truncate max-w-[200px]">{adj.articleName}</div>
                    <div className="mt-1 inline-block px-1.5 py-0.5 bg-stone-100 border border-stone-200 text-stone-600 text-[9px] font-bold rounded">WS: {adj.batchNumber}</div>
                  </td>
                  <td className="p-4 text-right font-mono">
                    <div className="text-stone-400">{adj.oldQuantity}</div>
                    <div className="text-stone-800 font-bold">{adj.newQuantity}</div>
                  </td>
                  <td className="p-4 border-l border-stone-200 text-right">
                    <span className={cn("font-black px-2 py-1 rounded text-[11px]", adj.difference > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                      {adj.difference > 0 ? '+' : ''}{adj.difference}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredAdjustments.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-stone-400 font-bold">Brak historii różnic.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
