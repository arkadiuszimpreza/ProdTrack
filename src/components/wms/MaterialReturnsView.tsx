import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, doc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, RotateCcw, FileSpreadsheet, User, ClipboardList, X, PackageMinus } from 'lucide-react';
import { InventoryBatch, MaterialWithdrawal } from '../../types';
import * as XLSX from 'xlsx';
import { cn } from '../../utils/firestore-helpers';

const guessPrefix = (name: string): string => {
  if (!name) return 'INNE';
  const n = name.toLowerCase();
  if (n.includes('rura')) return 'RU';
  if (n.includes('płyta') || n.includes('plyta')) return 'PL';
  if (n.includes('blacha')) return 'BL';
  if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik')) return 'PR';
  if (n.includes('farba') || n.includes('proszek')) return 'FA';
  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
  return 'INNE'; 
};

type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'PL' | 'FA' | 'SR';

interface MaterialReturnsViewProps {
  currentUser?: string; 
}

export function MaterialReturnsView({ currentUser = 'Zalogowany Pracownik' }: MaterialReturnsViewProps) {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [withdrawals, setWithdrawals] = useState<MaterialWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchArticle, setSearchArticle] = useState('');
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');

  const [returnModalItem, setReturnModalItem] = useState<MaterialWithdrawal | null>(null);
  const [returnInputQty, setReturnInputQty] = useState<string>('');
  
  const [returnCalcPieces, setReturnCalcPieces] = useState<string>('');
  const [returnCalcLength, setReturnCalcLength] = useState<string>('');
  const [returnCalcWidth, setReturnCalcWidth] = useState<string>('');
  const [returnCalcHeight, setReturnCalcHeight] = useState<string>('');

  const extractLengthFromDimensions = (dim?: string): string => {
    if (!dim) return '';
    const match = dim.match(/L[\s\.\=]*(\d+[\,\.]\d+|\d+)/i);
    if (match && match[1]) {
      return match[1].replace(',', '.');
    }
    return '';
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

  const openReturnModal = (w: MaterialWithdrawal) => {
    const withdrawnSum = w.quantityWithdrawn || 0;
    const returnedSum = w.returnedQuantity || 0;
    const maxToReturn = Number((withdrawnSum - returnedSum).toFixed(3));

    if (maxToReturn <= 0) {
      return alert('Cała pobrana ilość została już zwrócona.');
    }

    setReturnModalItem(w);
    setReturnInputQty(String(maxToReturn));
    
    setReturnCalcPieces('');
    const batch = batches.find(b => b.batchNumber === w.batchNumber);
    if (batch) {
      setReturnCalcLength(extractLengthFromDimensions(batch.dimensions));
      const dimMatch = batch.dimensions?.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]\s*(\d+(?:[\.,]\d+)?)/);
      if (dimMatch && dimMatch[1] && dimMatch[2]) {
         setReturnCalcWidth(dimMatch[1].replace(',', '.'));
         setReturnCalcHeight(dimMatch[2].replace(',', '.'));
      } else {
         setReturnCalcWidth('');
         setReturnCalcHeight('');
      }
    } else {
      setReturnCalcLength('');
      setReturnCalcWidth('');
      setReturnCalcHeight('');
    }
  };

  const closeReturnModal = () => {
    setReturnModalItem(null);
    setReturnInputQty('');
    setReturnCalcPieces('');
    setReturnCalcLength('');
    setReturnCalcWidth('');
    setReturnCalcHeight('');
  };

  const handleReturnCalcChange = (field: 'pieces' | 'length' | 'width' | 'height', val: string) => {
    if (!returnModalItem) return;
    
    let pieces = returnCalcPieces;
    let len = returnCalcLength;
    let wVal = returnCalcWidth;
    let hVal = returnCalcHeight;
    if (field === 'pieces') {
      pieces = val;
      setReturnCalcPieces(val);
    } else if (field === 'length') {
      len = val;
      setReturnCalcLength(val);
    } else if (field === 'width') {
      wVal = val;
      setReturnCalcWidth(val);
    } else if (field === 'height') {
      hVal = val;
      setReturnCalcHeight(val);
    }
    
    const batch = batches.find(b => b.batchNumber === returnModalItem.batchNumber);
    if (!batch) return;

    const p = parseFloat(pieces.replace(/,/g, '.'));
    const type = guessPrefix(batch.articleName || '');

    let newReturnQtyStr = '';

    if ((type === 'BL' || type === 'PL')) {
      const coeffStr = String(batch.coefficient || '').replace(/,/g, '.');
      const coeffNum = parseFloat(coeffStr);
      const wNum = parseFloat(wVal.replace(/,/g, '.'));
      const hNum = parseFloat(hVal.replace(/,/g, '.'));

      if (!isNaN(p) && p >= 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(wNum) && wNum > 0 && !isNaN(hNum) && hNum > 0) {
        const totalAreaM2 = p * (wNum / 1000) * (hNum / 1000);
        const isM2 = (batch.unit || '').toLowerCase() === 'm2' || (batch.unit || '').toLowerCase() === 'm²';
        if (isM2) {
          newReturnQtyStr = Number((totalAreaM2).toFixed(3)).toString();
        } else {
          newReturnQtyStr = Number((totalAreaM2 * coeffNum).toFixed(3)).toString();
        }
      }
    } else {
      const l = parseFloat(len.replace(/,/g, '.'));
      if (!isNaN(p) && !isNaN(l) && p >= 0 && l >= 0) {
        newReturnQtyStr = Number((p * l).toFixed(3)).toString();
      }
    }

    if (newReturnQtyStr) {
      const withdrawnSum = returnModalItem.quantityWithdrawn || 0;
      const returnedSum = returnModalItem.returnedQuantity || 0;
      const maxToReturn = Number((withdrawnSum - returnedSum).toFixed(3));
      
      setReturnInputQty(String(Math.min(maxToReturn, parseFloat(newReturnQtyStr))));
    } else {
      setReturnInputQty('');
    }
  };

  const confirmReturn = async () => {
    if (!returnModalItem) return;
    if (isSubmitting) return;
    
    const returnQty = parseFloat(returnInputQty.replace(',', '.'));
    if (isNaN(returnQty) || returnQty <= 0) {
      return alert('Wprowadzono nieprawidłową ilość zwrotu!');
    }

    setIsSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      await runTransaction(db, async (transaction) => {
        const withdrawalRef = doc(db, 'materialWithdrawals', returnModalItem.id as string);
        const withdrawalSnap = await transaction.get(withdrawalRef);
        if (!withdrawalSnap.exists()) throw new Error("Pobranie nie istnieje.");
        
        const withdrawalData = withdrawalSnap.data();
        const withdrawnSum = withdrawalData.quantityWithdrawn || 0;
        const returnedSum = withdrawalData.returnedQuantity || 0;
        const maxToReturn = Number((withdrawnSum - returnedSum).toFixed(3));

        if (returnQty > maxToReturn) {
          throw new Error('Wprowadzono nieprawidłową lub zbyt dużą ilość zwrotu! Maksymalnie: ' + maxToReturn);
        }

        const yardSnap = batches.find(b => b.batchNumber === withdrawalData.batchNumber);
        let batchRef = null;
        let batchData = null;
        
        if (yardSnap && yardSnap.id) {
          batchRef = doc(db, 'inventoryBatches', yardSnap.id);
          const batchSnap = await transaction.get(batchRef);
          if (batchSnap.exists()) {
            batchData = batchSnap.data();
          }
        }

        const newReturnRef = doc(collection(db, 'materialWithdrawals'));
        const returnData: MaterialWithdrawal = {
          withdrawalDate: todayStr,
          workerName: currentUser,
          articleNumber: withdrawalData.articleNumber,
          articleName: withdrawalData.articleName,
          batchNumber: withdrawalData.batchNumber,
          sourcePurchaseOrderId: withdrawalData.sourcePurchaseOrderId || '',
          quantityWithdrawn: returnQty,
          returnedQuantity: 0, 
          type: 'RETURN',
          originalWithdrawalId: withdrawalRef.id, 
          createdAt: serverTimestamp(),
          createdBy: currentUser
        };
        
        transaction.set(newReturnRef, returnData);
        transaction.update(withdrawalRef, {
          returnedQuantity: returnedSum + returnQty
        });

        if (batchRef && batchData) {
          const currentQty = batchData.numericQuantity || 0;
          const currentWithdrawn = batchData.withdrawnQuantity || 0;
          
          const newBatchQty = Number((currentQty + returnQty).toFixed(3));
          const newWithdrawnQty = Number(Math.max(0, currentWithdrawn - returnQty).toFixed(3)); 
          const unitLabel = batchData.quantityString?.split(' ')[1] || '';
          
          transaction.update(batchRef, {
            numericQuantity: newBatchQty,
            withdrawnQuantity: newWithdrawnQty,
            quantityString: `${newBatchQty} ${unitLabel}`
          });
        }
      });
      
      closeReturnModal();
      
    } catch (err: any) {
      console.error(err);
      alert(`Wystąpił błąd: ${err.message || 'Nieznany błąd zapisu'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportToERP = () => {
    const returnList = withdrawals.filter(w => w.type === 'RETURN');
    if (returnList.length === 0) return alert('Brak zwrotów do wyeksportowania.');

    const exportRows = returnList.map(w => ({
      'Data operacji': w.withdrawalDate,
      'Typ': 'Zwrot (MM+)',
      'Artykuł-Nr (Indeks)': w.articleNumber,
      'Nazwa asortymentu': w.articleName,
      'Nr Wsadu': w.batchNumber,
      'Ilość Przesunięcia': w.quantityWithdrawn,
      'Zalogowany Pracownik': w.workerName
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Zwroty_MM');

    worksheet['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 45 }, { wch: 18 }, { wch: 15 }, { wch: 25 }];
    XLSX.writeFile(workbook, `Ksiega_Zwrotow_MM_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Filter withdrawals that can be returned
  const pendingReturns = useMemo(() => {
    let result = withdrawals.filter(w => w.type === 'WITHDRAWAL' && (w.quantityWithdrawn - (w.returnedQuantity || 0)) > 0);

    if (materialFilter !== 'ALL') {
      result = result.filter(w => guessPrefix(w.articleName) === materialFilter);
    }

    const term = (searchArticle || '').toLowerCase().trim();
    if (term) {
      result = result.filter(w => {
        return (w.articleNumber || '').toLowerCase().includes(term) || 
               (w.articleName || '').toLowerCase().includes(term) ||
               (w.batchNumber || '').toLowerCase().includes(term);
      });
    }

    return result;
  }, [withdrawals, searchArticle, materialFilter]);

  const historyReturns = useMemo(() => {
    return withdrawals.filter(w => w.type === 'RETURN');
  }, [withdrawals]);

  if (loading) return <div className="p-8 text-center text-stone-400 font-bold">Inicjalizacja modułu zwrotów...</div>;

  return (
    <div className="space-y-6 relative">
      
      {/* SEKCJA A: Główne filtry i wyszukiwarka */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl p-4 sm:p-6 flex flex-col gap-4">
        <h2 className="text-sm font-black text-stone-900 flex items-center gap-2">
          <RotateCcw className="text-emerald-600" size={18} /> Zwrot Materiału na Magazyn (WIP)
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <div className="flex-1 flex bg-stone-100 p-2 rounded-xl border border-stone-200 items-center">
            <Search size={16} className="text-stone-400 ml-1 mr-2" />
            <input 
              type="text" 
              placeholder="Szukaj po indeksie, nazwie lub wsadzie..."
              value={searchArticle}
              onChange={(e) => setSearchArticle(e.target.value)}
              className="bg-transparent w-full border-none focus:outline-none text-xs font-bold text-stone-700"
            />
          </div>

          <div className="flex flex-wrap gap-1 items-center">
            {['ALL', 'RU', 'PR', 'BL', 'PL', 'FA', 'SR'].map(f => (
              <button 
                key={f} 
                onClick={() => setMaterialFilter(f as MaterialFilter)} 
                className={cn(
                  "px-3 py-2 rounded-lg text-[10px] font-black transition-all", 
                  materialFilter === f ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                )}
              >
                {f === 'ALL' ? 'WSZYSTKO' : f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SEKCJA B: LISTA POBRAŃ Z MOŻLIWOŚCIĄ ZWROTU */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center gap-2">
          <PackageMinus className="text-stone-500" size={18} />
          <h3 className="font-black text-stone-800 text-xs uppercase tracking-wider">Otwarte Pobrania (Możliwe do zwrotu)</h3>
        </div>

        <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-xs whitespace-nowrap table-fixed">
            <thead className="sticky top-0 bg-stone-100 z-10">
              <tr className="border-b border-stone-200 text-[10px] font-black uppercase text-stone-500 select-none">
                <th className="p-2 w-24">Data Pobr.</th>
                <th className="p-2 w-28">Artykuł-Nr</th>
                <th className="p-2 w-48">Nazwa asortymentu</th>
                <th className="p-2 w-28">Nr Wsadu</th>
                <th className="p-2 w-24 text-right">Zostało do zwrotu</th>
                <th className="p-2 w-32">Kto pobrał</th>
                <th className="p-2 w-24 text-center">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-[11px] font-medium text-stone-700">
              {pendingReturns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-stone-400 font-normal">Brak aktywnych pobrań do zwrotu.</td>
                </tr>
              ) : (
                pendingReturns.map(w => {
                  const toReturn = (w.quantityWithdrawn - (w.returnedQuantity || 0)).toFixed(3);
                  return (
                    <tr key={w.id} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="p-2 font-semibold text-stone-500">{w.withdrawalDate}</td>
                      <td className="p-2 font-mono text-stone-500">{w.articleNumber}</td>
                      <td className="p-2 truncate font-bold text-stone-800" title={w.articleName}>{w.articleName}</td>
                      <td className="p-2 font-black text-stone-900">{w.batchNumber}</td>
                      <td className="p-2 text-right font-black text-sm text-amber-600">
                        {toReturn}
                      </td>
                      <td className="p-2 font-bold text-stone-600 truncate">{w.workerName}</td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => openReturnModal(w)}
                          className="px-3 py-1.5 border-2 rounded-lg text-[10px] font-black uppercase transition-all shadow-sm active:scale-95 border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-600 hover:border-emerald-600 hover:text-white"
                        >
                          Zwróć
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SEKCJA C: KSIĘGA ZWROTÓW */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mt-6">
        <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="text-emerald-600" size={18} />
            <h3 className="font-black text-emerald-800 text-xs uppercase tracking-wider">Księga Zwrotów Na Magazyn</h3>
          </div>
          
          <button 
            onClick={handleExportToERP}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-lg shadow-sm transition-colors uppercase select-none"
          >
            <FileSpreadsheet size={13} />
            Eksportuj zwroty (.xlsx)
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap table-fixed">
            <thead>
              <tr className="bg-emerald-50/50 border-b border-emerald-100 text-[10px] font-black uppercase text-emerald-700 select-none">
                <th className="p-2 w-24">Data Zwrotu</th>
                <th className="p-2 w-28">Artykuł-Nr</th>
                <th className="p-2 w-48">Nazwa asortymentu</th>
                <th className="p-2 w-28">Nr Wsadu</th>
                <th className="p-2 w-24 text-right">Zwrócono</th>
                <th className="p-2 w-32">Od kogo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-[11px] font-medium text-stone-700">
              {historyReturns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-stone-400 font-normal">Brak zarejestrowanych zwrotów.</td>
                </tr>
              ) : (
                historyReturns.map(w => (
                  <tr key={w.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="p-2 font-semibold text-stone-500">{w.withdrawalDate}</td>
                    <td className="p-2 font-mono text-stone-500">{w.articleNumber}</td>
                    <td className="p-2 truncate font-bold text-stone-800" title={w.articleName}>{w.articleName}</td>
                    <td className="p-2 font-black text-stone-900">{w.batchNumber}</td>
                    <td className="p-2 text-right font-black text-sm text-emerald-600">
                      +{w.quantityWithdrawn}
                    </td>
                    <td className="p-2 font-bold text-stone-600 truncate">{w.workerName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SEKCJA D: AUTORSKIE OKNO MODAL ZWROTU      */}
      {returnModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            
            <div className="p-5 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <div>
                <h3 className="font-black text-emerald-700 text-lg">Zgłoś Zwrot Materiału</h3>
                <p className="text-xs text-stone-500 font-medium mt-1">Przyjęcie resztek na główny magazyn</p>
              </div>
              <button onClick={closeReturnModal} className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                <p className="text-[10px] uppercase font-black text-emerald-600 tracking-wider">Zwracany wsad</p>
                <p className="text-xl font-black text-stone-900 mt-1">{returnModalItem.batchNumber}</p>
                <p className="text-xs font-bold text-stone-600 truncate mt-1">{returnModalItem.articleName}</p>
              </div>

              <div>
                <label className="block text-xs font-black text-stone-700 uppercase mb-2">Ilość do zwrotu</label>
                <input
                  type="text"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  max={(returnModalItem.quantityWithdrawn - (returnModalItem.returnedQuantity || 0)).toFixed(3)}
                  value={returnInputQty}
                  onChange={(e) => {
                    setReturnInputQty(e.target.value);
                    setReturnCalcPieces(''); // Clear calc if manual entry
                  }}
                  className="w-full text-center text-3xl font-black text-emerald-700 bg-stone-50 border-2 border-emerald-200 rounded-2xl py-4 focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                  autoFocus
                />
                
                {['PR', 'RU', 'BL', 'PL'].includes(guessPrefix(returnModalItem.articleName || '')) && (
                  <div className="mt-4 pt-4 border-t border-stone-100">
                    <div className="text-[10px] uppercase font-bold text-stone-400 mb-2 flex justify-between items-center">
                      <span>Kalkulator resztek</span>
                      {['BL', 'PL'].includes(guessPrefix(returnModalItem.articleName || '')) && <span className="text-amber-500">Szacunkowo dla blach</span>}
                    </div>
                    <div className="flex gap-2 h-12">
                      {['BL', 'PL'].includes(guessPrefix(returnModalItem.articleName || '')) ? (
                        <>
                          <input
                            type="text"
                            inputMode="decimal"
                            min="0"
                            placeholder="Szer (mm)"
                            value={returnCalcWidth}
                            onChange={(e) => handleReturnCalcChange('width', e.target.value)}
                            className={cn(
                              "w-full px-2 py-2 border-2 rounded-xl text-center font-black text-sm transition-all outline-none focus:border-emerald-500",
                              returnCalcWidth ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200"
                            )}
                          />
                          <div className="flex items-center justify-center text-stone-300 font-black text-xl">×</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            min="0"
                            placeholder="Wys (mm)"
                            value={returnCalcHeight}
                            onChange={(e) => handleReturnCalcChange('height', e.target.value)}
                            className={cn(
                              "w-full px-2 py-2 border-2 rounded-xl text-center font-black text-sm transition-all outline-none focus:border-emerald-500",
                              returnCalcHeight ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200"
                            )}
                          />
                          <div className="flex items-center justify-center text-stone-300 font-black text-xl">×</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            min="0"
                            placeholder="Szt"
                            value={returnCalcPieces}
                            onChange={(e) => handleReturnCalcChange('pieces', e.target.value)}
                            className={cn(
                              "w-full px-2 py-2 border-2 rounded-xl text-center font-black text-sm transition-all outline-none focus:border-emerald-500",
                              returnCalcPieces ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200"
                            )}
                          />
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            inputMode="decimal"
                            min="0"
                            placeholder="Ilość sztuk"
                            value={returnCalcPieces}
                            onChange={(e) => handleReturnCalcChange('pieces', e.target.value)}
                            className={cn(
                              "w-full px-4 py-2 border-2 rounded-xl text-center font-black text-lg transition-all outline-none focus:border-emerald-500",
                              returnCalcPieces ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200"
                            )}
                          />
                          <div className="flex items-center justify-center px-2 text-stone-300 font-black text-xl">×</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            step="0.001"
                            min="0"
                            placeholder="Długość (m)"
                            value={returnCalcLength}
                            onChange={(e) => handleReturnCalcChange('length', e.target.value)}
                            className={cn(
                              "w-full px-4 py-2 border-2 rounded-xl text-center font-black text-lg transition-all outline-none focus:border-emerald-500",
                              returnCalcLength ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-stone-50 border-stone-200"
                            )}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-center text-[10px] text-stone-400 mt-3 font-bold uppercase">
                  Maksymalnie: {(returnModalItem.quantityWithdrawn - (returnModalItem.returnedQuantity || 0)).toFixed(3)}
                </p>
              </div>
            </div>

            <div className="p-5 bg-stone-50 border-t border-stone-100 flex gap-3">
              <button 
                onClick={closeReturnModal}
                className="flex-1 py-3 px-4 bg-white border-2 border-stone-200 text-stone-600 rounded-xl font-black text-sm uppercase hover:bg-stone-100 hover:border-stone-300 transition-all"
              >
                Anuluj
              </button>
              <button 
                onClick={confirmReturn}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl font-black text-sm uppercase hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? 'Przetwarzanie...' : 'Zatwierdź Zwrot'}
              </button>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}
