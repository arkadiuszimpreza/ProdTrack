import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, writeBatch, doc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, PackageMinus, FileSpreadsheet, User, ClipboardList, ChevronRight, ChevronLeft, X, Box, CheckCircle, Calendar as CalendarIcon } from 'lucide-react';
import { InventoryBatch, MaterialWithdrawal } from '../../types';
import * as XLSX from 'xlsx';
import { compareMaterialNames } from "../../utils/materialUtils";
import { cn } from '../../utils/firestore-helpers';

// Półautomat do kategoryzowania materiałów.
// Przyjmuje opcjonalny numer artykułu z ERP, który ma najwyższy priorytet –
// dzięki temu SKT/SKD/SKK/SKC (kształtowniki, ceowniki, profile specjalne)
// są zawsze klasyfikowane jako 'PR', niezależnie od nazwy słownej.
const guessPrefix = (name: string, articleNumber?: string): string => {
  // PRIORYTET 1: Klasyfikacja po prefiksie numeru ERP (deterministyczna)
  // SK* = kształtowniki / ceowniki / profile specjalne → traktowane jak profile (PR)
  if (articleNumber) {
    const num = articleNumber.trim().toUpperCase();
    if (
      num.startsWith('SKT') ||
      num.startsWith('SKD') ||
      num.startsWith('SKK') ||
      num.startsWith('SKC')
    ) return 'PR';
  }

  // PRIORYTET 2: Analiza nazwy słownej (fallback gdy brak numeru ERP)
  if (!name) return 'INNE';
  const n = name.toLowerCase();
  if (n.includes('rura')) return 'RU';
  if (n.includes('płyta') || n.includes('plyta')) return 'PL';
  if (n.includes('blacha')) return 'BL';
  if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik') || n.includes('dwuteownik') || n.includes('kątownik') || n.includes('teownik') || n.includes('płaskownik') || n.includes('wałek')) return 'PR';
  if (n.includes('farba') || n.includes('proszek')) return 'FA';
  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
  return 'INNE'; 
};
type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'PL' | 'FA' | 'SR';

interface MaterialWithdrawalViewProps {
  currentUser?: string; 
}

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

export function MaterialWithdrawalView({ currentUser = 'Zalogowany Pracownik' }: MaterialWithdrawalViewProps) {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [withdrawals, setWithdrawals] = useState<MaterialWithdrawal[]>([]);
  const [inventoryCounts, setInventoryCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [searchArticle, setSearchArticle] = useState('');
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [withdrawalQuantities, setWithdrawalQuantities] = useState<Record<string, any>>({});
  const [calcValues, setCalcValues] = useState<Record<string, { pieces: string; length: string; width?: string; height?: string }>>({});

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewMode, setViewMode] = useState<'HISTORY' | 'AGGREGATED'>('HISTORY');
  const [hideExported, setHideExported] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());

  const setDateRange = (weeksAgo: number) => {
    const now = new Date();
    const monday = getMonday(now);
    monday.setDate(monday.getDate() - (weeksAgo * 7));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    
    setStartDate(formatDate(monday));
    setEndDate(formatDate(sunday));
  };

  const getBlachaCalculatedMetrics = (b: InventoryBatch) => {
    const type = guessPrefix(b.articleName || '');
    if ((type !== 'BL' && type !== 'PL')) return null;
    if (!b.coefficient) return null;
    if (b.unit && b.unit.toLowerCase() !== 'kg') return null;
    
    const coeffStr = String(b.coefficient).replace(/,/g, '.');
    const coeffNum = parseFloat(coeffStr);
    if (isNaN(coeffNum) || coeffNum <= 0) return null;
    const totalAreaM2 = (b.numericQuantity || 0) / coeffNum;
    let sheets = undefined;
    if (b.dimensions) {
      const dimMatch = b.dimensions.match(/(\d+(?:[\.,]\d+)?)[\s]*[xX×][\s]*(\d+(?:[\.,]\d+)?)/);
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
    const match = dim.match(/L[\s\.\=]*(\d+[\,\.]\d+|\d+)/i);
    if (match && match[1]) {
      return match[1].replace(',', '.');
    }
    return '';
  };

  const handleCalcChange = (batchId: string, field: 'pieces' | 'length' | 'width' | 'height', val: string, batch: InventoryBatch) => {
    setCalcValues(prev => {
      let dims = { width: '', height: '' };
      if (batch.dimensions) {
        const dimMatch = batch.dimensions.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]\s*(\d+(?:[\.,]\d+)?)/);
        if (dimMatch && dimMatch[1] && dimMatch[2]) {
          dims.width = dimMatch[1].replace(',', '.');
          dims.height = dimMatch[2].replace(',', '.');
        }
      }
      const cur = prev[batchId] || { pieces: '', length: extractLengthFromDimensions(batch.dimensions), width: dims.width, height: dims.height };
      const next = { ...cur, [field]: val };
      const p = parseFloat(next.pieces.replace(/,/g, '.'));
      const type = guessPrefix(batch.articleName || '');

      let newWithdrawalQtyStr = '';

      if ((type === 'BL' || type === 'PL')) {
        const coeffStr = String(batch.coefficient || '').replace(/,/g, '.');
        const coeffNum = parseFloat(coeffStr);
        const w = parseFloat((next.width || '').replace(',', '.'));
        const h = parseFloat((next.height || '').replace(',', '.'));

        if (!isNaN(p) && p >= 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
          const totalAreaM2 = p * (w / 1000) * (h / 1000);
          const isM2 = (batch.unit || '').toLowerCase() === 'm2' || (batch.unit || '').toLowerCase() === 'm²';
          if (isM2) {
            newWithdrawalQtyStr = Number((totalAreaM2).toFixed(3)).toString();
          } else {
            newWithdrawalQtyStr = Number((totalAreaM2 * coeffNum).toFixed(3)).toString();
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
    const qCounts = query(collection(db, 'inventoryCounts'), orderBy('createdAt', 'desc'));

    const unsubBatches = onSnapshot(qBatches, (snap) => {
      setBatches(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryBatch)));
    });

    const unsubWithdrawals = onSnapshot(qWithdrawals, (snap) => {
      setWithdrawals(snap.docs.map(d => ({ ...d.data(), id: d.id } as MaterialWithdrawal)));
      setLoading(false);
    });

    const unsubCounts = onSnapshot(qCounts, (snap) => {
      setInventoryCounts(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    return () => { unsubBatches(); unsubWithdrawals(); unsubCounts(); };
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
    return Array.from(map.values()).sort((a, b) => compareMaterialNames(a.articleName, b.articleName));
  }, [batches]);

  const filteredArticles = useMemo(() => {
    let result = availableArticles;

    if (materialFilter !== 'ALL') {
      result = result.filter(a => guessPrefix(a.articleName) === materialFilter);
    }

    const term = searchArticle.toLowerCase().trim();
    if (term) {
      result = result.filter(a => {
        const matchesBasic = (a.articleNumber || '').toLowerCase().includes(term) || (a.articleName || '').toLowerCase().includes(term);
        if (matchesBasic) return true;

        return batches.some(b => 
          String(b.articleNumber || '').trim().toUpperCase() === String(a.articleNumber).trim().toUpperCase() && 
          (b.numericQuantity || 0) > 0 && 
          (b.batchNumber || '').toLowerCase().includes(term)
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
        const aMatches = (a.batchNumber || '').toLowerCase().includes(term);
        const bMatches = (b.batchNumber || '').toLowerCase().includes(term);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
    }
    return list;
  }, [batches, selectedArticle, searchArticle]);

  const totalEnteredQty = useMemo(() => {
    return Object.values(withdrawalQuantities).reduce((sum, val) => {
      const num = parseFloat(String(val).replace(',', '.'));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [withdrawalQuantities]);

  const applyCountToWithdrawal = (count: any, batch: InventoryBatch) => {
    if (count.calculatorDetails) {
      const parts = count.calculatorDetails.split('x').map((pt: string) => pt.trim());
      if (parts.length === 3 && ['BL', 'PL'].includes(guessPrefix(batch.articleName || '', batch.articleNumber))) {
        handleCalcChange(batch.id as string, 'width', parts[0], batch);
        setTimeout(() => handleCalcChange(batch.id as string, 'height', parts[1], batch), 0);
        setTimeout(() => handleCalcChange(batch.id as string, 'pieces', parts[2], batch), 10);
        return;
      } else if (parts.length === 2 && guessPrefix(batch.articleName || '') !== 'INNE') {
        handleCalcChange(batch.id as string, 'pieces', parts[0], batch);
        setTimeout(() => handleCalcChange(batch.id as string, 'length', parts[1], batch), 0);
        return;
      }
    }
    // Fallback: just set the withdrawal quantity directly if no calc details or simple pieces
    setWithdrawalQuantities(prev => ({
      ...prev,
      [batch.id as string]: Math.min(batch.numericQuantity || 0, count.quantity || 0)
    }));
  };

  const handleConfirmWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalEnteredQty <= 0) return alert('Wprowadź ilości pobierane z konkretnych wsadów!');
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      await runTransaction(db, async (transaction) => {
        const reads = [];
        for (const [batchId, rawQtyToTake] of Object.entries(withdrawalQuantities)) {
          const qtyToTake = parseFloat(String(rawQtyToTake).replace(',', '.'));
          if (isNaN(qtyToTake) || qtyToTake <= 0) continue;
          const batchRef = doc(db, 'inventoryBatches', batchId);
          reads.push(transaction.get(batchRef).then(snap => ({ snap, qtyToTake, batchRef, batchId })));
        }
        
        const snaps = await Promise.all(reads);
        
        for (const { snap, qtyToTake, batchId } of snaps) {
          if (!snap.exists()) {
             throw new Error(`Wsad nie istnieje.`);
          }
          const batchData = snap.data();
          const currentAvailable = batchData.numericQuantity || 0;
          if (currentAvailable < qtyToTake) {
             throw new Error(`Próbujesz pobrać więcej niż jest na wsadzie ${batchData.batchNumber}! Dostępne: ${currentAvailable}, Próba: ${qtyToTake}`);
          }
        }
        
        for (const { snap, qtyToTake, batchRef, batchId } of snaps) {
          const batchData = snap.data();
          const currentAvailable = batchData.numericQuantity || 0;
          const newBatchQty = Number((currentAvailable - qtyToTake).toFixed(3));
          const currentWithdrawn = batchData.withdrawnQuantity || 0;
          const newWithdrawnQty = Number((currentWithdrawn + qtyToTake).toFixed(3));
          
          const unitLabel = batchData.quantityString?.split(' ')[1] || '';
          
          transaction.update(batchRef, {
            numericQuantity: newBatchQty,
            withdrawnQuantity: newWithdrawnQty,
            quantityString: `${newBatchQty} ${unitLabel}`
          });
          
          const cv = calcValues[batchId];
          let calcDetails = '';
          if (cv) {
            const isBL = ['BL', 'PL'].includes(guessPrefix(batchData.articleName || '', batchData.articleNumber));
            if (isBL && cv.width && cv.height && cv.pieces) {
              calcDetails = `${cv.width} x ${cv.height} x ${cv.pieces}`;
            } else if (cv.pieces && cv.length) {
              calcDetails = `${cv.pieces} x ${cv.length}`;
            } else if (cv.pieces) {
              calcDetails = `${cv.pieces} szt`;
            }
          }

          const withdrawalRef = doc(collection(db, 'materialWithdrawals'));
          const withdrawalData: MaterialWithdrawal = {
            withdrawalDate: todayStr,
            workerName: currentUser, 
            articleNumber: batchData.articleNumber || '',
            articleName: batchData.articleName || '',
            batchNumber: batchData.batchNumber,
            sourcePurchaseOrderId: batchData.sourcePurchaseOrderId || '',
            quantityWithdrawn: qtyToTake,
            type: 'WITHDRAWAL',
            calculatorDetails: calcDetails,
            createdAt: serverTimestamp(),
            createdBy: currentUser
          };
          transaction.set(withdrawalRef, withdrawalData);
        }
      });

      setSuccessMessage(`Pomyślnie wydano ${totalEnteredQty} jednostek do produkcji!`);
      setTimeout(() => {
        setSuccessMessage('');
        setIsConfirming(false);
        setWithdrawalQuantities({});
        setSelectedArticle(null);
        setCalcValues({});
      }, 1500);
    } catch (err: any) {
      console.error(err);
      alert(`Wystąpił błąd: ${err.message || 'Nieznany błąd podczas zapisu'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredHistory = useMemo(() => {
    let filtered = withdrawals;
    if (startDate) {
      filtered = filtered.filter(w => w.withdrawalDate >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(w => w.withdrawalDate <= endDate);
    }
    if (hideExported) {
      filtered = filtered.filter(w => !w.erpExportDate);
    }
    return filtered;
  }, [withdrawals, startDate, endDate, hideExported]);

  const aggregatedWithdrawals = useMemo(() => {
    let filtered = withdrawals;
    if (startDate) {
      filtered = filtered.filter(w => w.withdrawalDate >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(w => w.withdrawalDate <= endDate);
    }
    if (hideExported) {
      filtered = filtered.filter(w => !w.erpExportDate);
    }
    
    // Group by articleNumber_batchNumber
    const grouped = new Map<string, any>();
    
    filtered.forEach(w => {
      const key = `${w.articleNumber}_${w.batchNumber}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          articleNumber: w.articleNumber,
          articleName: w.articleName,
          batchNumber: w.batchNumber,
          netQuantity: 0,
          workerNames: new Set<string>(),
          sourceIds: [] // track original ids
        });
      }
      const group = grouped.get(key);
      group.workerNames.add(w.workerName);
      if (w.id) {
        group.sourceIds.push(w.id);
      }
      if (w.type === 'WITHDRAWAL') {
        group.netQuantity += w.quantityWithdrawn;
      } else if (w.type === 'RETURN') {
        group.netQuantity -= w.quantityWithdrawn;
      }
    });

    return Array.from(grouped.values()).map(g => ({
      ...g,
      workerName: Array.from(g.workerNames).join(', '),
      netQuantity: Number(g.netQuantity.toFixed(3))
    })).filter(g => g.netQuantity !== 0); // Omit 0 net balances
  }, [withdrawals, startDate, endDate, hideExported]);

  const handleExportToERP = async () => {
    let listToExport: any[] = viewMode === 'AGGREGATED' ? aggregatedWithdrawals : filteredHistory;
    
    // If items are selected, only export those
    if (selectedForExport.size > 0) {
      listToExport = listToExport.filter(w => selectedForExport.has(w.id as string));
    }

    if (listToExport.length === 0) return alert('Brak pobrań do wyeksportowania!');
    
    let exportData;
    if (viewMode === 'AGGREGATED') {
      exportData = (listToExport as any[]).map(w => ({
        'Zakres Od': startDate || 'Wszystko',
        'Zakres Do': endDate || 'Wszystko',
        'Nr Artykułu': w.articleNumber,
        'Nazwa': w.articleName,
        'Nr Wsadu': w.batchNumber,
        'Ilość Pobrana Netto': w.netQuantity,
        'Pracownicy': w.workerName
      }));
    } else {
      exportData = (listToExport as MaterialWithdrawal[]).map(w => ({
        'Zakres Od': startDate || 'Wszystko',
        'Zakres Do': endDate || 'Wszystko',
        'Data Operacji': w.withdrawalDate,
        'Typ': w.type === 'WITHDRAWAL' ? 'Pobranie' : 'Zwrot',
        'Nr Artykułu': w.articleNumber,
        'Nazwa': w.articleName,
        'Nr Wsadu': w.batchNumber,
        'Ilość': w.quantityWithdrawn,
        'Konto Systemowe': w.workerName,
        'Data Eksportu': w.erpExportDate || ''
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, viewMode === 'AGGREGATED' ? "Pobrania Sumaryczne" : "Historia Pobrań");
    XLSX.writeFile(wb, `Eksport_${viewMode === 'AGGREGATED' ? 'Sumaryczny' : 'Historia'}${startDate ? '_' + startDate : ''}.xlsx`);

    // Mark as exported in database
    try {
      const nowStr = new Date().toLocaleString('pl-PL');
      const batch = writeBatch(db);
      if (viewMode === 'HISTORY') {
        listToExport.forEach((w: MaterialWithdrawal) => {
          if (w.id) {
            const ref = doc(db, 'materialWithdrawals', w.id);
            batch.update(ref, { erpExportDate: nowStr });
          }
        });
        setSelectedForExport(new Set()); // clear selection
      } else {
        listToExport.forEach((w: any) => {
          if (w.sourceIds && Array.isArray(w.sourceIds)) {
            w.sourceIds.forEach((id: string) => {
              const ref = doc(db, 'materialWithdrawals', id);
              batch.update(ref, { erpExportDate: nowStr });
            });
          }
        });
      }
      await batch.commit();
      setSelectedForExport(new Set()); // clear selection
    } catch (error) {
      console.error('Error updating export date:', error);
    }
  };

  if (loading) return <div className="p-8 text-center text-stone-400 font-bold text-sm">Ładowanie pobrań...</div>;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto items-start p-6">
      
      <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
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
                {['ALL', 'RU', 'PR', 'BL', 'PL', 'FA', 'SR'].map(f => (
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
          "w-full lg:flex-1 bg-white flex-col h-full relative overflow-hidden rounded-2xl border border-stone-200 shadow-sm",
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
                <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                  {activeBatches.map(b => {
                    const isMatchedBySearch = !!(searchArticle.trim() && (b.batchNumber || '').toLowerCase().includes(searchArticle.toLowerCase().trim()));
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

                        {(() => {
                           const batchCounts = inventoryCounts.filter(c => c.batchId === b.id && !c.archived);
                           if (batchCounts.length === 0) return null;
                           return (
                             <div className="bg-stone-50 border border-stone-100 rounded-xl p-2 mb-3">
                               <div className="flex items-center gap-1 mb-2 px-1">
                                 <ClipboardList size={12} className="text-stone-400" />
                                 <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Historia zliczeń (kliknij by użyć)</span>
                               </div>
                               <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                                 {batchCounts.map(count => (
                                   <div 
                                     key={count.id} 
                                     className="bg-white border text-sm border-stone-200 rounded-lg p-2 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group" 
                                     onClick={() => applyCountToWithdrawal(count, b)}
                                   >
                                     <div className="flex justify-between items-center bg-transparent">
                                       <span className="font-black text-stone-800 group-hover:text-indigo-700 transition-colors">{count.quantity} {b.unit || ''}</span>
                                     </div>
                                     <div className="flex justify-between items-center mt-1">
                                       <span className="text-xs text-stone-600 font-bold font-mono bg-stone-100 px-1.5 py-0.5 rounded group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                         {count.calculatorDetails ? count.calculatorDetails : 'Szt / Całość'}
                                       </span>
                                       <span className="text-[10px] text-stone-400 font-bold">
                                         {count.createdAt ? new Date(count.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                       </span>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           );
                        })()}

                        <div className="flex flex-col gap-2 border-t border-stone-100 pt-3 mt-1">
                            
                            {guessPrefix(b.articleName || '') !== 'INNE' && guessPrefix(b.articleName || '') !== 'FA' && guessPrefix(b.articleName || '') !== 'SR' ? (
                              <div className="flex flex-col gap-1.5 w-full">
                                {['BL', 'PL'].includes(guessPrefix(b.articleName || '')) && (
                                  <div className="flex items-center justify-between w-full px-1">
                                    <span className="text-[9px] uppercase font-bold text-stone-400 shrink-0">Kalk:</span>
                                    <div className="text-[10px] font-bold text-stone-500 text-right truncate">
                                      {(() => {
                                        const cv = calcValues[b.id as string] || { pieces: '', length: '', width: '', height: '' };
                                        const p = parseFloat((cv.pieces || '').replace(',', '.'));
                                        const wStr = cv.width !== undefined ? cv.width : (() => {
                                          if (b.dimensions) {
                                            const dimMatch = b.dimensions.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]\s*(\d+(?:[\.,]\d+)?)/);
                                            if (dimMatch && dimMatch[1]) return dimMatch[1].replace(',', '.');
                                          }
                                          return '';
                                        })();
                                        const hStr = cv.height !== undefined ? cv.height : (() => {
                                          if (b.dimensions) {
                                            const dimMatch = b.dimensions.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]\s*(\d+(?:[\.,]\d+)?)/);
                                            if (dimMatch && dimMatch[2]) return dimMatch[2].replace(',', '.');
                                          }
                                          return '';
                                        })();
                                        const coeffNum = parseFloat(String(b.coefficient || '').replace(/,/g, '.'));
                                        const w = parseFloat(wStr.replace(',', '.'));
                                        const h = parseFloat(hStr.replace(',', '.'));
                                        if (!isNaN(p) && p > 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
                                              const m2 = p * (w / 1000) * (h / 1000);
                                              const kg = m2 * coeffNum;
                                              return <span title={`${m2.toFixed(3)} m² = ${kg.toFixed(1)} kg`}>{m2.toFixed(3)} m² = {kg.toFixed(1)} kg</span>;
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </div>
                                )}
                                <div className="flex flex-1 gap-1 h-[32px] items-center">
                                  {['BL', 'PL'].includes(guessPrefix(b.articleName || '')) ? (
                                    <>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        min="0"
                                        placeholder="Szer(mm)"
                                        value={calcValues[b.id as string]?.width !== undefined ? calcValues[b.id as string].width : (() => {
                                          if (b.dimensions) {
                                            const dimMatch = b.dimensions.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]\s*(\d+(?:[\.,]\d+)?)/);
                                            if (dimMatch && dimMatch[1]) return dimMatch[1].replace(',', '.');
                                          }
                                          return '';
                                        })()}
                                        onChange={(e) => handleCalcChange(b.id as string, 'width', e.target.value, b)}
                                        className={cn(
                                          "flex-1 w-0 px-1 py-1 border rounded-lg text-center font-bold text-xs transition-all outline-none min-w-0",
                                          calcValues[b.id as string]?.width || (b.dimensions && b.dimensions.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]/)) ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
                                        )}
                                      />
                                      <div className="flex items-center text-stone-400 text-xs font-bold px-0.5">x</div>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        min="0"
                                        placeholder="Wys(mm)"
                                        value={calcValues[b.id as string]?.height !== undefined ? calcValues[b.id as string].height : (() => {
                                          if (b.dimensions) {
                                            const dimMatch = b.dimensions.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]\s*(\d+(?:[\.,]\d+)?)/);
                                            if (dimMatch && dimMatch[2]) return dimMatch[2].replace(',', '.');
                                          }
                                          return '';
                                        })()}
                                        onChange={(e) => handleCalcChange(b.id as string, 'height', e.target.value, b)}
                                        className={cn(
                                          "flex-1 w-0 px-1 py-1 border rounded-lg text-center font-bold text-xs transition-all outline-none min-w-0",
                                          calcValues[b.id as string]?.height || (b.dimensions && b.dimensions.match(/[xX×]\s*(\d+(?:[\.,]\d+)?)/)) ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
                                        )}
                                      />
                                      <div className="flex items-center text-stone-400 text-xs font-bold px-0.5">x</div>
                                      <input
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
                                    </>
                                  ) : (
                                    <>
                                       <input
                                         type="text"
                                         inputMode="decimal"
                                         min="0"
                                         placeholder="Szt"
                                         value={(calcValues[b.id as string] || { pieces: '', length: extractLengthFromDimensions(b.dimensions) }).pieces}
                                         onChange={(e) => handleCalcChange(b.id as string, 'pieces', e.target.value, b)}
                                         className={cn(
                                           "flex-1 w-0 px-1 py-1 border rounded-lg text-center font-bold text-xs transition-all outline-none min-w-0",
                                           (calcValues[b.id as string]?.pieces) ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
                                         )}
                                       />
                                       
                                       <div className="flex items-center text-stone-400 text-xs font-bold px-0.5">x</div>
                                       <input
                                         type="text"
                                         inputMode="decimal"
                                         step="0.001"
                                         min="0"
                                         placeholder="Dł(m)"
                                         value={(calcValues[b.id as string] || { pieces: '', length: extractLengthFromDimensions(b.dimensions) }).length}
                                         onChange={(e) => handleCalcChange(b.id as string, 'length', e.target.value, b)}
                                         className={cn(
                                           "flex-1 w-0 px-1 py-1 border rounded-lg text-center font-bold text-xs transition-all outline-none min-w-0",
                                           (calcValues[b.id as string]?.length) ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-stone-50 border-stone-200"
                                         )}
                                        />
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : null}

                            <div className="flex flex-col gap-1 w-full justify-end">
                              <div className="flex items-center justify-between gap-3 w-full">
                                  <span className="text-xs font-black text-stone-600 uppercase">Pobieram:</span>
                                  <input 
                                    type="text" 
                                    inputMode="decimal"
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
                                        let parsedVal = val.replace(',', '.');
                                        const parsed = parseFloat(parsedVal);
                                        const maxQty = b.numericQuantity || 0;
                                        
                                        if (!isNaN(parsed) && parsed > maxQty) {
                                          // Limit to maxQty, but strip formatting only if exceeded
                                          const limitedVal = maxQty.toString();
                                          e.target.value = limitedVal;
                                          setWithdrawalQuantities(prev => ({ 
                                            ...prev, 
                                            [b.id as string]: limitedVal
                                          }));
                                        } else {
                                          // Keep exact string (e.g. "1." or "0,5") to allow typing decimals smoothly
                                          setWithdrawalQuantities(prev => ({ 
                                            ...prev, 
                                            [b.id as string]: val
                                          }));
                                        }
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
                                         textParts.push(`${Math.round(metrics.sheets)} ark.`);
                                      }
                                      textParts.push(`${parseFloat(metrics.m2.toFixed(3))} m²`);
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
                  onClick={() => setIsConfirming(true)}
                  disabled={totalEnteredQty <= 0 || isSubmitting}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-40 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                  {isSubmitting ? 'Zatwierdzanie...' : 'Zatwierdź Przesunięcie'}
                </button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* SEKCJA B: HISTORIA POBRAŃ SUMARYCZNA */}
      <div className="w-full bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="text-stone-500" size={18} />
            <h3 className="font-black text-stone-800 text-xs uppercase tracking-wider">
              {viewMode === 'AGGREGATED' ? 'Księga Przesunięć Sumarycznych (Netto)' : 'Księga Przesunięć (Chronologicznie)'}
            </h3>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex gap-1 p-1 bg-stone-200/50 rounded-xl">
              <button
                onClick={() => { setViewMode('HISTORY'); setSelectedForExport(new Set()); }}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase ${viewMode === 'HISTORY' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Historia
              </button>
              <button
                onClick={() => { setViewMode('AGGREGATED'); setSelectedForExport(new Set()); }}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase ${viewMode === 'AGGREGATED' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Zsumowane
              </button>
            </div>
            <button 
              onClick={handleExportToERP}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-lg shadow-sm transition-colors uppercase select-none w-full sm:w-auto justify-center"
            >
              <FileSpreadsheet size={13} />
              Eksportuj (.xlsx)
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

            <div className="flex items-center gap-2 ml-0 sm:ml-4 bg-white border border-stone-200 px-3 py-1.5 rounded-lg shadow-sm">
              <input
                type="checkbox"
                id="hideExported"
                checked={hideExported}
                onChange={(e) => setHideExported(e.target.checked)}
                className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="hideExported" className="text-[10px] font-black uppercase text-stone-600 cursor-pointer select-none">
                Ukryj wyeksportowane
              </label>
            </div>
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
          {viewMode === 'AGGREGATED' ? (
            <table className="w-full text-left text-xs table-fixed">
              <thead>
                <tr className="bg-stone-100 border-b border-stone-200 text-[10px] font-black uppercase text-stone-500 select-none">
                  <th className="p-2 w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={aggregatedWithdrawals.length > 0 && selectedForExport.size === aggregatedWithdrawals.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedForExport(new Set(aggregatedWithdrawals.map(w => w.id as string)));
                        } else {
                          setSelectedForExport(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="p-2 w-20 sm:w-24">Artykuł-Nr</th>
                  <th className="p-2 w-auto">Nazwa asortymentu</th>
                  <th className="p-2 w-24 sm:w-32">Nr Wsadu</th>
                  <th className="p-2 w-20 sm:w-24 text-right">Suma Netto</th>
                  <th className="p-2 w-28 sm:w-40">Konto logowania</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-[11px] font-medium text-stone-700">
                {aggregatedWithdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-stone-400 font-normal">Brak operacji w wybranym przedziale czasowym.</td>
                  </tr>
                ) : (
                  aggregatedWithdrawals.map(w => (
                    <tr key={w.id} className={cn("transition-colors", selectedForExport.has(w.id as string) ? "bg-indigo-50/50" : "hover:bg-stone-50/50")}>
                      <td className="p-2 text-center">
                        <input 
                          type="checkbox"
                          className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={selectedForExport.has(w.id as string)}
                          onChange={(e) => {
                            const newSet = new Set(selectedForExport);
                            if (e.target.checked) {
                              newSet.add(w.id as string);
                            } else {
                              newSet.delete(w.id as string);
                            }
                            setSelectedForExport(newSet);
                          }}
                        />
                      </td>
                      <td className="p-2 font-mono text-stone-500">{w.articleNumber}</td>
                      <td className="p-2 font-bold text-stone-800 whitespace-normal leading-tight">{w.articleName}</td>
                      <td className="p-2 font-black text-stone-900 text-[10px]">{w.batchNumber}</td>
                      <td className={cn(
                        "p-2 text-right font-black text-sm", 
                        w.netQuantity > 0 ? "text-indigo-600" : "text-emerald-600"
                      )}>
                        {w.netQuantity > 0 ? '+' : ''}{w.netQuantity}
                      </td>
                      <td className="p-2 font-bold text-stone-600 truncate" title={w.workerName}>{w.workerName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs table-fixed">
              <thead>
                <tr className="bg-stone-100 border-b border-stone-200 text-[10px] font-black uppercase text-stone-500 select-none">
                  <th className="p-2 w-8 sm:w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={filteredHistory.length > 0 && selectedForExport.size === filteredHistory.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedForExport(new Set(filteredHistory.map(w => w.id as string)));
                        } else {
                          setSelectedForExport(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="p-2 w-16 sm:w-20">Data</th>
                  <th className="p-2 w-14 sm:w-16">Typ</th>
                  <th className="p-2 w-20 sm:w-24">Artykuł-Nr</th>
                  <th className="p-2 w-auto">Nazwa asortymentu</th>
                  <th className="p-2 w-20 sm:w-24">Nr Wsadu</th>
                  <th className="p-2 w-16 sm:w-20 text-right">Ilość</th>
                  <th className="p-2 w-24 sm:w-32">Konto</th>
                  <th className="p-2 w-20 sm:w-24">Data Eksportu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-[11px] font-medium text-stone-700">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-stone-400 font-normal">Brak operacji w wybranym przedziale czasowym.</td>
                  </tr>
                ) : (
                  filteredHistory.map(w => (
                    <tr key={w.id} className={cn("transition-colors", selectedForExport.has(w.id as string) ? "bg-indigo-50/50" : "hover:bg-stone-50/50")}>
                      <td className="p-2 text-center">
                        <input 
                          type="checkbox"
                          className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={selectedForExport.has(w.id as string)}
                          onChange={(e) => {
                            const newSet = new Set(selectedForExport);
                            if (e.target.checked) {
                              newSet.add(w.id as string);
                            } else {
                              newSet.delete(w.id as string);
                            }
                            setSelectedForExport(newSet);
                          }}
                        />
                      </td>
                      <td className="p-2 font-bold text-stone-600">{w.withdrawalDate}</td>
                      <td className="p-2">
                        {w.type === 'WITHDRAWAL' ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 font-black text-[9px] uppercase">Pobranie</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-black text-[9px] uppercase">Zwrot</span>
                        )}
                      </td>
                      <td className="p-2 font-mono text-stone-500">{w.articleNumber}</td>
                      <td className="p-2 font-bold text-stone-800 whitespace-normal leading-tight">{w.articleName}</td>
                      <td className="p-2 font-black text-stone-900 text-[10px]">{w.batchNumber}</td>
                      <td className={cn(
                        "p-2 text-right font-black text-sm", 
                        w.type === 'WITHDRAWAL' ? "text-indigo-600" : "text-emerald-600"
                      )}>
                        {w.type === 'WITHDRAWAL' ? '-' : '+'}{w.quantityWithdrawn}
                      </td>
                      <td className="p-2 font-bold text-stone-600 truncate" title={w.workerName}>{w.workerName}</td>
                      <td className="p-2 font-bold text-stone-500 text-[10px]">
                        {w.erpExportDate ? (
                          <div className="flex flex-col">
                            <span>{w.erpExportDate.split(', ')[0]}</span>
                            <span className="text-[9px] text-stone-400">{w.erpExportDate.split(', ')[1]}</span>
                          </div>
                        ) : (
                          ''
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {isConfirming && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <h2 className="text-xl font-black text-stone-800 uppercase tracking-tight flex items-center gap-3">
                <Box size={24} className="text-indigo-600" />
                Potwierdzenie pobrania
              </h2>
              <button onClick={() => setIsConfirming(false)} className="p-2 text-stone-400 hover:text-rose-500 transition-colors bg-white rounded-full shadow-sm">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4">
              <p className="text-sm font-bold text-stone-500 uppercase tracking-wider mb-2 px-1">Wydawane pozycje ({Object.entries(withdrawalQuantities).filter(([_, q]) => q > 0).length})</p>
              {Object.entries(withdrawalQuantities).map(([batchId, qty]) => {
                 if (qty <= 0) return null;
                 const batch = batches.find(b => b.id === batchId);
                 if (!batch) return null;
                 const calc = calcValues[batchId];

                 return (
                   <div key={batchId} className="flex flex-col p-4 border border-stone-200 rounded-2xl bg-white shadow-sm">
                     <div className="flex justify-between items-start mb-2">
                       <div>
                         <div className="text-[10px] font-mono font-bold text-stone-400">{batch.articleNumber}</div>
                         <div className="font-black text-stone-800 text-sm leading-tight mt-0.5">{batch.articleName}</div>
                       </div>
                       <div className="flex flex-col items-end">
                         <span className="text-[10px] uppercase font-bold text-stone-400">Wsad</span>
                         <span className="font-black text-stone-700 bg-stone-100 px-2 py-0.5 rounded text-xs">{batch.batchNumber}</span>
                       </div>
                     </div>
                     
                     <div className="pt-3 border-t border-stone-100 mt-2 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                         {calc && calc.pieces && (
                           <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-stone-400 uppercase">Sztuki</span>
                              <span className="font-black text-amber-600 text-sm">{calc.pieces} szt.</span>
                           </div>
                         )}
                         {calc && calc.length && !['BL', 'PL'].includes(guessPrefix(batch.articleName || '')) && (
                           <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-stone-400 uppercase">Długość</span>
                              <span className="font-black text-indigo-600 text-sm">{calc.length} mb</span>
                           </div>
                         )}
                       </div>
                       <div className="flex flex-col items-end">
                         <span className="text-[10px] font-bold text-stone-400 uppercase">Wydana ilość</span>
                         <span className="font-black text-indigo-600 text-lg">{qty} <span className="text-xs font-bold text-stone-500">{batch.quantityString?.split(' ')[1] || 'jedn.'}</span></span>
                       </div>
                     </div>
                   </div>
                 );
              })}
            </div>

            <div className="p-6 border-t border-stone-100 bg-stone-50 flex items-center justify-between shrink-0">
               <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Razem POBIERANE</span>
                  <span className="font-black text-2xl text-indigo-700 leading-none">{totalEnteredQty.toFixed(3)}</span>
               </div>
               <div className="flex gap-3">
                 <button 
                   onClick={() => setIsConfirming(false)}
                   disabled={isSubmitting}
                   className="px-6 py-3 bg-white border border-stone-200 text-stone-600 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-50"
                 >
                   Popraw
                 </button>
                 <button 
                   onClick={(e) => { handleConfirmWithdrawal(e); }}
                   disabled={isSubmitting || !!successMessage}
                   className={cn(
                     "px-8 py-3 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-2",
                     successMessage ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20" : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20",
                     (isSubmitting || !!successMessage) && "opacity-90 active:scale-100"
                   )}
                 >
                   {isSubmitting ? 'Zatwierdzanie...' : successMessage ? (
                       <><CheckCircle size={16} /> Pobrano!</>
                   ) : 'Zatwierdź Ostatecznie'}
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
