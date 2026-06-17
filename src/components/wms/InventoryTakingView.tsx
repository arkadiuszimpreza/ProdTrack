import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, writeBatch, doc, serverTimestamp, increment, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, ClipboardCheck, FileSpreadsheet, User, ChevronRight, ChevronLeft, Save, CheckCircle2, AlertTriangle, RefreshCcw, Plus, Trash2, Split, Clock, Calculator, X } from 'lucide-react';
import { InventoryBatch, InventoryAdjustment, InventoryCount, InventoryArticle } from '../../types';
import * as XLSX from 'xlsx';
import { cn } from '../../utils/firestore-helpers';

// Półautomat do kategoryzowania materiałów
const guessPrefix = (name: string): string => {
  if (!name) return 'INNE';
  const n = name.toLowerCase();
  if (n.includes('rura')) return 'RU';
  if (n.includes('blacha') || n.includes('płyta')) return 'BL';
  if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik') || n.includes('dwuteownik') || n.includes('kątownik') || n.includes('teownik') || n.includes('płaskownik') || n.includes('wałek')) return 'PR';
  if (n.includes('farba') || n.includes('proszek')) return 'FA';
  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
  return 'INNE'; 
};

type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'FA' | 'SR';

interface Props {
  currentUser?: string;
}

export function InventoryTakingView({ currentUser = 'Inwentaryzator' }: Props) {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [catalogArticles, setCatalogArticles] = useState<InventoryArticle[]>([]);
  const [loading, setLoading] = useState(true);

  // Stany formularza inwentaryzacji
  const [searchArticle, setSearchArticle] = useState('');
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  // Przechowuje wartości wpisane aktualnie z palca
  const [actualQuantities, setActualQuantities] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const [calcValues, setCalcValues] = useState<Record<string, { pieces: string; length: string }>>({});

  const [splittingBatch, setSplittingBatch] = useState<InventoryBatch | null>(null);
  const [splitNewNumber, setSplitNewNumber] = useState('');
  const [splitDimensions, setSplitDimensions] = useState('');
  const [splitTransferQty, setSplitTransferQty] = useState('');
  const [splitDraftQty, setSplitDraftQty] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);

  
  const [splitDraftPieces, setSplitDraftPieces] = useState('');
  const [splitTransferPieces, setSplitTransferPieces] = useState('');

  // Auto-calculate kg for BL based on dimensions and pieces
  useEffect(() => {
    if (!splittingBatch) return;
    if (guessPrefix(splittingBatch.articleName || '') === 'BL') {
      const coeffStr = String(splittingBatch.coefficient || '').replace(/,/g, '.');
      const coeffNum = parseFloat(coeffStr);
      let sheetAreaM2 = 0;
      if (splitDimensions.trim()) {
        const dimMatch = splitDimensions.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]\s*(\d+(?:[\.,]\d+)?)/);
        if (dimMatch && dimMatch[1] && dimMatch[2]) {
          const w = parseFloat(dimMatch[1].replace(/,/g, '.'));
          const h = parseFloat(dimMatch[2].replace(/,/g, '.'));
          if (w > 0 && h > 0) {
            sheetAreaM2 = (w / 1000) * (h / 1000);
          }
        }
      }

      if (sheetAreaM2 > 0 && coeffNum > 0) {
        const tP = parseFloat(splitTransferPieces.replace(/,/g, '.'));
        if (!isNaN(tP)) {
          setSplitTransferQty(Number((tP * sheetAreaM2 * coeffNum).toFixed(3)).toString());
        } else {
          setSplitTransferQty('');
        }

        const dP = parseFloat(splitDraftPieces.replace(/,/g, '.'));
        if (!isNaN(dP)) {
          setSplitDraftQty(Number((dP * sheetAreaM2 * coeffNum).toFixed(3)).toString());
        } else {
          setSplitDraftQty('');
        }
      } else {
        // If dimensions are missing/invalid, do not try to wipe but user can't reliably type pieces
      }
    }
  }, [splitTransferPieces, splitDraftPieces, splitDimensions, splittingBatch]);

  const openSplitModal = (b: InventoryBatch) => {
    setSplittingBatch(b);
    setSplitNewNumber(`25${guessPrefix(b.articleName || '')}...`);
    setSplitDimensions(b.dimensions || '');
    setSplitTransferQty('');
    setSplitDraftQty('');
    setSplitTransferPieces('');
    setSplitDraftPieces('');
  };

  const handleSplitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!splittingBatch) return;
    const transferQ = splitTransferQty ? parseFloat(splitTransferQty.replace(/,/g, '.')) : 0;
    const draftQStr = splitDraftQty.trim() ? parseFloat(splitDraftQty.replace(/,/g, '.')) : null;
    if (isNaN(transferQ) || transferQ < 0) return alert('Nieprawidłowa ilość przenoszona');
    if (isSplitting) return;
    setIsSplitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const oldRef = doc(db, 'inventoryBatches', splittingBatch.id as string);
        const oldSnap = await transaction.get(oldRef);
        if (!oldSnap.exists()) throw new Error('Wsad nie istnieje!');
        
        const oldData = oldSnap.data() as InventoryBatch;
        let newOldSysQty = (oldData.numericQuantity || 0) - transferQ;
        if (newOldSysQty < 0) newOldSysQty = 0;
        
        const newRef = doc(collection(db, 'inventoryBatches'));
        const newBatchData = { 
          ...oldData, 
          batchNumber: splitNewNumber.trim(), 
          dimensions: splitDimensions.trim(), 
          numericQuantity: Number(transferQ.toFixed(3)), 
          initialQuantity: Number(transferQ.toFixed(3)), 
          draftQuantity: (draftQStr !== null && !isNaN(draftQStr)) ? draftQStr : null, 
          draftUpdatedAt: (draftQStr !== null && !isNaN(draftQStr)) ? serverTimestamp() : null, 
          draftUpdatedBy: (draftQStr !== null && !isNaN(draftQStr)) ? currentUser : null 
        };
        delete newBatchData.id;
        
        transaction.update(oldRef, { numericQuantity: Number(newOldSysQty.toFixed(3)) });
        transaction.set(newRef, newBatchData);
      });
      setSplittingBatch(null);
    } catch(err: any) { 
        console.error(err); 
        alert(`Błąd rozbijania wsadu: ${err.message}`); 
    } finally { 
        setIsSplitting(false); 
    }
  };



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

  // =========================================================
  // POBIERANIE DANYCH Z BAZY
  // =========================================================
  useEffect(() => {
    const qBatches = query(collection(db, 'inventoryBatches'));
    const qAdjustments = query(collection(db, 'inventoryAdjustments'), orderBy('createdAt', 'desc'));
    const qCounts = query(collection(db, 'inventoryCounts'), orderBy('createdAt', 'desc'));
    const qArticles = query(collection(db, 'inventoryArticles'));

    const unsubBatches = onSnapshot(qBatches, (snap) => {
      setBatches(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryBatch)));
      setLoading(false);
    });

    const unsubAdjustments = onSnapshot(qAdjustments, (snap) => {
      setAdjustments(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryAdjustment)));
    });

    const unsubCounts = onSnapshot(qCounts, (snap) => {
      setCounts(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryCount)));
    });

    const unsubArticles = onSnapshot(qArticles, (snap) => {
      setCatalogArticles(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryArticle)));
    });

    return () => { unsubBatches(); unsubAdjustments(); unsubCounts(); unsubArticles(); };
  }, []);

  // Wsady, które czekają na zatwierdzenie (mają wpisaną wartość roboczą)
  const pendingDrafts = useMemo(() => batches.filter(b => b.draftQuantity !== undefined && b.draftQuantity !== null), [batches]);

  // =========================================================
  // LEWA KOLUMNA: GRUPOWANIE PO ARTYKULE
  // =========================================================
  const availableArticles = useMemo(() => {
    const map = new Map<string, { articleNumber: string; articleName: string; systemQty: number; draftedCount: number; totalBatches: number, _fromCatalog?: boolean }>();
    
    // Zapisz wpierw katalog indeksów jako puste pozycje
    catalogArticles.forEach(ca => {
      const key = String(ca.articleNumber || ca.articleName || '').trim().toUpperCase();
      if (!key) return;
      map.set(key, {
        articleNumber: ca.articleNumber || '',
        articleName: ca.articleName || '',
        systemQty: 0,
        draftedCount: 0,
        totalBatches: 0,
        _fromCatalog: true
      });
    });

    // Zaktualizuj bazując na istniejących wsadach
    batches.forEach(b => {
      const key = String(b.articleNumber || b.articleName || '').trim().toUpperCase();
      if (!key) return;
      const existing = map.get(key);
      
      const currentQty = b.numericQuantity || 0;
      const isDrafted = b.draftQuantity !== undefined && b.draftQuantity !== null ? 1 : 0;

      if (existing) {
        existing.systemQty += currentQty;
        existing.draftedCount += isDrafted;
        existing.totalBatches += 1;
        // zaktualizuj nazwę jeśli z katalogu brakowało
        if (existing.articleName === '' && b.articleName) existing.articleName = b.articleName;
        if (existing.articleNumber === '' && b.articleNumber) existing.articleNumber = b.articleNumber;
      } else {
        map.set(key, { 
          articleNumber: b.articleNumber || '', 
          articleName: b.articleName || '', 
          systemQty: currentQty,
          draftedCount: isDrafted,
          totalBatches: 1
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.articleName.localeCompare(b.articleName));
  }, [batches, catalogArticles]);

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
        // Wyszukiwanie też po wsadzie
        return batches.some(b => 
          String(b.articleNumber || '').trim().toUpperCase() === String(a.articleNumber || '').trim().toUpperCase() && 
          (b.batchNumber || '').toLowerCase().includes(term)
        );
      });
    }

    return result;
  }, [availableArticles, searchArticle, materialFilter, batches]);

  // =========================================================
  // PRAWA KOLUMNA: WSADY DLA ARTYKUŁU
  // =========================================================
  const activeBatches = useMemo(() => {
    if (!selectedArticle) return [];
    let list = batches.filter(b => String(b.articleNumber || b.articleName || '').trim().toUpperCase() === String(selectedArticle || '').trim().toUpperCase());

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
    // Wsady niezliczone wyżej
    return list.sort((a, b) => {
      const aDrafted = a.draftQuantity !== undefined && a.draftQuantity !== null;
      const bDrafted = b.draftQuantity !== undefined && b.draftQuantity !== null;
      if (aDrafted === bDrafted) return a.batchNumber.localeCompare(b.batchNumber);
      return aDrafted ? 1 : -1;
    });
  }, [batches, selectedArticle, searchArticle]);

  // =========================================================
  // AKCJE INWENTARYZACJI (LOGIKA)
  // =========================================================
  
  const handleCalcChange = (batchId: string, field: 'pieces' | 'length', val: string, batch: InventoryBatch) => {
    setCalcValues(prev => {
      const cur = prev[batchId] || { pieces: '', length: extractLengthFromDimensions(batch.dimensions) };
      const next = { ...cur, [field]: val };
      const p = parseFloat(next.pieces.replace(',', '.'));
      const type = guessPrefix(batch.articleName || '');

      if (type === 'BL') {
        const coeffStr = String(batch.coefficient || '').replace(/,/g, '.');
        const coeffNum = parseFloat(coeffStr);
        if (!isNaN(p) && p >= 0 && !isNaN(coeffNum) && coeffNum > 0 && batch.dimensions) {
          const dimMatch = batch.dimensions.match(/(\d+(?:[\.,]\d+)?)\s*[xX×]\s*(\d+(?:[\.,]\d+)?)/);
          if (dimMatch && dimMatch[1] && dimMatch[2]) {
            const w = parseFloat(dimMatch[1].replace(/,/g, '.'));
            const h = parseFloat(dimMatch[2].replace(/,/g, '.'));
            if (w > 0 && h > 0) {
              const sheetAreaM2 = (w / 1000) * (h / 1000);
              const totalAreaM2 = p * sheetAreaM2;
              handleQtyChange(batchId, Number((totalAreaM2 * coeffNum).toFixed(3)).toString());
            } else {
              handleQtyChange(batchId, '');
            }
          } else {
            handleQtyChange(batchId, '');
          }
        } else {
          handleQtyChange(batchId, '');
        }
      } else {
        const l = parseFloat(next.length.replace(',', '.'));
        if (!isNaN(p) && !isNaN(l) && p >= 0 && l >= 0) {
          const unit = batch.unit || (batch.quantityString || '').split(' ')[1] || 'kg';
          const coeffStr = String(batch.coefficient || '').replace(/,/g, '.');
          const coeffNum = parseFloat(coeffStr);
          if (!isNaN(coeffNum) && coeffNum > 0 && (unit || '').toLowerCase() === 'kg') {
            handleQtyChange(batchId, Number((p * l * coeffNum).toFixed(3)).toString());
          } else {
            handleQtyChange(batchId, Number((p * l).toFixed(3)).toString());
          }
        } else {
          handleQtyChange(batchId, '');
        }
      }
      return { ...prev, [batchId]: next };
    });
  };

  const handleQtyChange = (batchId: string, value: string) => {
    setActualQuantities(prev => ({ ...prev, [batchId]: value }));
  };

  const handleSaveDraft = async (batch: InventoryBatch, mode: 'add' | 'replace') => {
    const rawVal = actualQuantities[batch.id as string];
    if (rawVal === undefined || rawVal === '') return;

    const enteredQty = parseFloat(rawVal.replace(',', '.'));
    if (isNaN(enteredQty) || enteredQty < 0) return alert('Wprowadzono nieprawidłową ilość!');

    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const batchRef = doc(db, 'inventoryBatches', batch.id as string);
      
      const newCountRef = doc(collection(db, 'inventoryCounts'));
      const cv = calcValues[batch.id as string];
      let calcDetails = '';
      if (cv) {
        if (cv.pieces && cv.length) {
          calcDetails = `${cv.pieces} x ${cv.length}`;
        } else if (cv.pieces) {
          calcDetails = `${cv.pieces} szt`;
        }
      }

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(batchRef);
        if (!snap.exists()) return;
        
        let calculatedDraftQty = enteredQty;
        
        if (mode === 'add') {
          const currentDraft = snap.data().draftQuantity;
          if (currentDraft !== undefined && currentDraft !== null) {
            calculatedDraftQty = Number((currentDraft + enteredQty).toFixed(3));
          }
        }

        transaction.update(batchRef, {
          draftQuantity: calculatedDraftQty,
          draftUpdatedAt: serverTimestamp(),
          draftUpdatedBy: currentUser
        });
        
        transaction.set(newCountRef, {
          batchId: batch.id,
          quantity: enteredQty,
          calculatorDetails: calcDetails,
          createdBy: currentUser,
          createdAt: serverTimestamp(),
          archived: false
        });
      });
      
      // Jeżeli to 'replace', puszczamy asynchronicznie update starych wpisów
      if (mode === 'replace') {
        const oldCounts = counts.filter(c => c.batchId === batch.id && c.id !== newCountRef.id && !c.archived);
        if (oldCounts.length > 0) {
           const batchOp = writeBatch(db);
           oldCounts.forEach(c => batchOp.update(doc(db, 'inventoryCounts', c.id as string), { archived: true }));
           await batchOp.commit();
        }
      }

      setActualQuantities(prev => {
        const next = { ...prev };
        delete next[batch.id as string];
        return next;
      });
      setCalcValues(prev => {
        const next = { ...prev };
        delete next[batch.id as string];
        return next;
      });

    } catch (err) {
      console.error(err);
      alert('Błąd podczas zapisywania zliczenia.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteCount = async (countId: string, batchId: string, quantityToDeduct: number) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
       await runTransaction(db, async (transaction) => {
         const batchRef = doc(db, 'inventoryBatches', batchId);
         const countRef = doc(db, 'inventoryCounts', countId);
         
         const batchSnap = await transaction.get(batchRef);
         if (batchSnap.exists()) {
           const currentDraft = batchSnap.data().draftQuantity;
           if (currentDraft !== undefined && currentDraft !== null) {
              const newDraft = Number((currentDraft - quantityToDeduct).toFixed(3));
              transaction.update(batchRef, { 
                draftQuantity: newDraft === 0 ? null : newDraft,
                draftUpdatedAt: newDraft === 0 ? null : serverTimestamp()
              });
           }
         }
         // Actually delete the document
         transaction.delete(countRef);
       });
    } catch(err) {
      console.error(err);
      alert("Błąd usunięcia wpisu");
    } finally {
      setIsProcessing(false);
    }
  };

  // KASOWANIE CAŁEGO ZLICZENIA
  const handleClearDraft = async (batch: InventoryBatch) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const batchRef = doc(db, 'inventoryBatches', batch.id as string);
      
      await runTransaction(db, async (transaction) => {
         transaction.update(batchRef, {
           draftQuantity: null,
           draftUpdatedAt: null,
           draftUpdatedBy: null
         });
      });
      
      const relatedCounts = counts.filter(c => c.batchId === batch.id && !c.archived);
      if (relatedCounts.length > 0) {
        const batchOp = writeBatch(db);
        relatedCounts.forEach(c => batchOp.update(doc(db, 'inventoryCounts', c.id as string), { archived: true }));
        await batchOp.commit();
      }
    } catch (err) {
      console.error(err);
      alert('Błąd podczas usuwania zliczenia.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-stone-400 font-bold">Ładowanie systemu inwentaryzacji...</div>;

  return (
    <div className="space-y-6 relative">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden flex flex-col lg:flex-row h-[calc(100vh-230px)] lg:h-[600px]">
        
        {/* LEWA KOLUMNA: WYSZUKIWARKA ARTYKUŁÓW */}
        <div className={cn(
          "w-full lg:w-1/3 bg-stone-50 border-r-0 lg:border-r border-stone-200 flex-col h-full",
          selectedArticle ? "hidden lg:flex" : "flex"
        )}>
          <div className="p-4 border-b border-stone-200 bg-white">
            <h2 className="text-sm font-black text-stone-900 mb-3 flex items-center gap-2">
              <ClipboardCheck className="text-indigo-600" size={18} /> Inwentaryzacja z Natury
            </h2>
            
            <div className="flex bg-stone-100 p-2 rounded-xl border border-stone-200 items-center mb-3">
              <Search size={16} className="text-stone-400 ml-1 mr-2" />
              <input 
                type="text" 
                placeholder="Szukaj indeksu lub zeskanuj wsad..."
                value={searchArticle}
                onChange={(e) => setSearchArticle(e.target.value)}
                className="bg-transparent w-full border-none focus:outline-none text-xs font-bold text-stone-700"
              />
              {searchArticle && (
                <button
                  type="button"
                  onClick={() => setSearchArticle('')}
                  className="p-1 hover:bg-stone-200 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
                  title="Wyczyść"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              {['ALL', 'RU', 'PR', 'BL', 'FA', 'SR'].map(f => (
                <button 
                  key={f} 
                  onClick={() => setMaterialFilter(f as MaterialFilter)} 
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all", 
                    materialFilter === f ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  )}
                >
                  {f === 'ALL' ? 'WSZYSTKO' : f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {filteredArticles.length === 0 ? (
              <p className="text-center text-xs text-stone-400 mt-4 font-bold">Brak asortymentu.</p>
            ) : (
              <div className="space-y-1">
                {filteredArticles.map(a => {
                  const aKey = String(a.articleNumber || a.articleName || '').trim().toUpperCase();
                  return (
                  <button
                    key={aKey}
                    onClick={() => {
                      setSelectedArticle(aKey);
                      setActualQuantities({}); 
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all border",
                      selectedArticle === aKey 
                        ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                        : "bg-white border-transparent hover:border-stone-200 hover:bg-white"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-2">
                        <div className="text-[10px] font-mono font-bold text-stone-500 flex justify-between">
                          {a.articleNumber || 'Brak Indeksu'}
                          {a.draftedCount > 0 && (
                            <span className="text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider">
                              Policzono {a.draftedCount}/{a.totalBatches}
                            </span>
                          )}
                        </div>
                        <div className={cn("text-xs font-black truncate mt-0.5", selectedArticle === aKey ? "text-indigo-900" : "text-stone-700")} title={a.articleName}>
                          {a.articleName}
                        </div>
                      </div>
                      <ChevronRight size={16} className={cn("shrink-0 mt-2 transition-transform", selectedArticle === aKey ? "text-indigo-600 translate-x-1" : "text-stone-300")} />
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* PRAWA KOLUMNA: WPISYWANIE DANYCH */}
        <div className={cn(
          "w-full lg:w-2/3 bg-white flex-col h-full relative overflow-hidden",
           !selectedArticle ? "hidden lg:flex" : "flex"
        )}>
          {!selectedArticle ? (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400 p-8">
              <ClipboardCheck size={48} strokeWidth={1} className="mb-4 opacity-20" />
              <p className="font-bold text-sm">Wybierz artykuł z lewej strony, aby rozpocząć zliczanie wsadów.</p>
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
                    <p className="text-[10px] font-black uppercase text-indigo-600 tracking-wider mb-1">Wybrany asortyment (Spis)</p>
                    <h3 className="text-lg sm:text-xl font-black text-stone-900 leading-tight">
                      {availableArticles.find(a => a.articleNumber === selectedArticle)?.articleName}
                    </h3>
                    <p className="text-xs font-mono font-bold text-stone-500 mt-1">{selectedArticle}</p>
                  </div>
                </div>
                
                <div className="text-right shrink-0 ml-4 hidden sm:block">
                  <p className="text-[10px] font-black uppercase text-stone-500 tracking-wider mb-1">Zlicza</p>
                  <div className="flex items-center justify-end gap-2 text-sm font-bold text-stone-700 bg-white px-3 py-1.5 rounded-lg border border-stone-200">
                    <User size={14} className="text-indigo-600" />
                    {currentUser}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-stone-50/50 custom-scrollbar">
                {activeBatches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                    <div className="w-16 h-16 bg-stone-200/50 flex items-center justify-center rounded-full mb-4">
                      <AlertTriangle size={24} className="text-stone-400" />
                    </div>
                    <h4 className="text-stone-800 font-bold mb-2">Brak wsadów dla tego artykułu</h4>
                    <p className="text-stone-500 text-sm max-w-sm mb-6">Ten artykuł został zaimportowany z katalogu zapasów (był w ERP, ale nie było go na placu).</p>

                    <button
                      onClick={async () => {
                         const article = availableArticles.find(a => String(a.articleNumber || a.articleName || '').trim().toUpperCase() === selectedArticle);
                         if (!article) return;
                         setIsProcessing(true);
                         try {
                           const newBatchRef = doc(collection(db, 'inventoryBatches'));
                           await writeBatch(db).set(newBatchRef, {
                             batchNumber: `INW-${Date.now()}`,
                             articleNumber: article.articleNumber,
                             articleName: article.articleName,
                             numericQuantity: 0,
                             initialQuantity: 0,
                             status: 'AVAILABLE',
                             createdAt: serverTimestamp(),
                             sourcePurchaseOrderId: 'INWENTARYZACJA'
                           }).commit();
                         } catch (e) {
                           console.error(e);
                         } finally {
                           setIsProcessing(false);
                         }
                      }}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-all"
                    >
                      <Plus size={16} className="inline mr-2 -mt-0.5" /> 
                      Dodaj wsad inwentaryzacyjny (BO)
                    </button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {activeBatches.map(b => {
                    const isMatchedBySearch = !!(searchArticle.trim() && (b.batchNumber || '').toLowerCase().includes(searchArticle.toLowerCase().trim()));
                    const inputVal = actualQuantities[b.id as string] || '';
                    const isDrafted = b.draftQuantity !== undefined && b.draftQuantity !== null;
                    const canUseCalc = ['RU', 'PR', 'BL'].includes(guessPrefix(b.articleName || ''));
                    const useCalc = canUseCalc;
                    const cv = calcValues[b.id] || { pieces: '', length: extractLengthFromDimensions(b.dimensions) };
                    const hasInput = inputVal.trim() !== '';

                    return (
                      <div key={b.id} className={cn(
                        "p-4 bg-white rounded-2xl border transition-all shadow-sm relative overflow-hidden flex flex-col",
                        isDrafted ? "border-indigo-300 shadow-indigo-100 bg-indigo-50/10" : "border-stone-200",
                        hasInput && "border-amber-300 shadow-amber-100 bg-amber-50/10",
                        isMatchedBySearch && "ring-2 ring-amber-400"
                      )}>
                        {isMatchedBySearch && (
                          <div className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-bl-lg">Wyszukany wsad</div>
                        )}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="font-black text-stone-900 text-sm block">{b.batchNumber}</span>
                            <p className="text-[10px] text-stone-400 font-semibold mt-0.5">Dost: {b.supplier} | {b.dimensions}</p>
                            <div className="flex gap-4">
                              <button 
                                onClick={() => openSplitModal(b)}
                                className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold mt-1.5 flex items-center gap-1 transition-all"
                              >
                                <Split size={12} /> Rozbij wsad
                              </button>
                              
                              {b.sourcePurchaseOrderId === 'INWENTARYZACJA' && (
                                <button 
                                  onClick={async () => {
                                      setIsProcessing(true);
                                      try {
                                        const batch = writeBatch(db);
                                        batch.delete(doc(db, 'inventoryBatches', b.id as string));
                                        await batch.commit();
                                      } catch (e) {
                                        console.error(e);
                                      } finally {
                                        setIsProcessing(false);
                                      }
                                  }}
                                  className="text-rose-500 hover:text-rose-700 text-[10px] font-bold mt-1.5 flex items-center gap-1 transition-all"
                                >
                                  <Trash2 size={12} /> Usuń
                                </button>
                              )}
                            </div>
                          </div>
                                                    <div className="text-right flex flex-col items-end">
                            <span className="block text-[10px] font-bold text-stone-400 uppercase">System mówi:</span>
                            <span className="text-xs font-black text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">{b.numericQuantity}</span>
                            {(() => {
                              const metrics = getBlachaCalculatedMetrics(b);
                              if (!metrics) return null;
                              const textParts = [];
                              if (metrics.sheets !== undefined) {
                                 textParts.push(`${Math.round(metrics.sheets)} ark.`);
                              }
                              textParts.push(`${parseFloat(metrics.m2.toFixed(3))} m²`);
                              return (
                                <span className="text-[9px] text-stone-400/80 font-semibold whitespace-nowrap mt-0.5" title="Wartości wyliczone na podstawie wagi i wymiarów">
                                  {textParts.join(' | ')}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        
                        <div className="mt-auto border-t border-stone-100 pt-3 flex flex-col gap-2">
                          {isDrafted && (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between bg-indigo-100/50 p-2 rounded-lg border border-indigo-200">
                                <span className="text-[10px] font-black uppercase text-indigo-700">W Pamięci (Suma):</span>
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-black text-indigo-900">{b.draftQuantity}</span>
                                  {(() => {
                                    if (b.draftQuantity === undefined || b.draftQuantity === null) return null;
                                    const metrics = getBlachaCalculatedMetrics({ ...b, numericQuantity: b.draftQuantity } as InventoryBatch);
                                    if (!metrics) return null;
                                    const textParts = [];
                                    if (metrics.sheets !== undefined) {
                                       textParts.push(`${Math.round(metrics.sheets)} ark.`);
                                    }
                                    textParts.push(`${parseFloat((metrics.m2 || 0).toFixed(3))} m²`);
                                    return (
                                      <span className="text-[9px] text-indigo-500/80 font-semibold whitespace-nowrap">
                                        {textParts.join(' | ')}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                              
                              {(() => {
                                const batchCounts = counts.filter(c => c.batchId === b.id && !c.archived).sort((c1, c2) => {
                                  const t1 = c1.createdAt?.toMillis?.() || Date.now();
                                  const t2 = c2.createdAt?.toMillis?.() || Date.now();
                                  return t2 - t1;
                                });
                                if (batchCounts.length === 0) return null;
                                return (
                                  <div className="flex flex-col gap-1 p-2 bg-stone-100/80 rounded-lg border border-stone-200/60">
                                    <div className="flex items-center text-[9px] uppercase font-bold text-stone-500 mb-0.5 gap-1">
                                      <Clock size={10} /> Historia zliczeń
                                    </div>
                                    {batchCounts.map(count => (
                                      <div key={count.id} className="flex items-center justify-between bg-white px-2 py-1.5 rounded shadow-sm border border-stone-100/80">
                                        <div className="flex flex-col">
                                          <span className="text-xs font-black text-stone-800">{count.quantity} {b.unit}</span>
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                             {count.calculatorDetails && <span className="text-[9px] text-stone-500 font-mono flex items-center bg-stone-50 px-1 py-0.5 rounded"><Calculator size={9} className="mr-0.5" />{count.calculatorDetails}</span>}
                                             {count.createdAt && <span className="text-[9px] text-stone-400">{(count.createdAt.toDate?.() || new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
                                          </div>
                                        </div>
                                        <button onClick={() => handleDeleteCount(count.id as string, b.id as string, count.quantity)} disabled={isProcessing} className="text-stone-400 hover:text-rose-500 transition-colors p-1.5 rounded-md hover:bg-rose-50 disabled:opacity-50 object-contain">
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            {/* ROZDZIELENIE PRZYCISKÓW: Zastąp po lewej stronie */}
                            {isDrafted && hasInput && (
                              <button 
                                onClick={() => handleSaveDraft(b, 'replace')}
                                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-[10px] shadow-sm flex flex-col items-center justify-center leading-none shrink-0 transition-all active:scale-95 h-[44px] w-[60px]"
                              >
                                <RefreshCcw size={14} className="mb-1"/> Zastąp
                              </button>
                            )}

                            
                            {useCalc ? (
                               <div className="flex flex-1 gap-1 h-[44px]">
                                 <input
                                   type="number"
                                   min="0"
                                   placeholder="Szt"
                                   value={cv.pieces}
                                   onChange={(e) => handleCalcChange(b.id as string, 'pieces', e.target.value, b)}
                                   className={cn(
                                     (guessPrefix(b.articleName || '') === 'BL') ? "w-full px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0" : "w-1/2 px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0",
                                     cv.pieces ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-stone-50 border-stone-200"
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
                                       value={cv.length}
                                       onChange={(e) => handleCalcChange(b.id as string, 'length', e.target.value, b)}
                                       className={cn(
                                         "w-1/2 px-2 py-1 border rounded-xl text-center font-black text-sm transition-all outline-none min-w-0",
                                         cv.length ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-stone-50 border-stone-200"
                                       )}
                                     />
                                   </>
                                 )}
                               </div>
                            ) : (
                              <input 
                                type="number" 
                                step="0.001"
                                min="0"
                                placeholder={isDrafted ? "Dopisz ilość..." : "Wpisz stan..."}
                                value={inputVal}
                                onChange={(e) => handleQtyChange(b.id as string, e.target.value)}
                                className={cn(
                                  "flex-1 px-3 py-2 border rounded-xl font-black text-sm transition-all outline-none h-[44px]",
                                  hasInput ? "bg-amber-50 border-amber-300 text-amber-700 placeholder:text-amber-300/50" : "bg-stone-50 border-stone-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 placeholder:text-stone-300",
                                  isDrafted && !hasInput && "bg-white border-indigo-300 text-indigo-700"
                                )}
                              />
                            )}

                            {/* PRAWA STRONA: Zapisz, Dodaj, albo ikona kosza do wyczyszczenia */}
                            {!isDrafted ? (
                               <button 
                                 onClick={() => handleSaveDraft(b, 'replace')}
                                 disabled={!hasInput || isProcessing}
                                 className={cn("px-3 py-2 rounded-xl flex items-center justify-center font-black transition-all shadow-sm text-xs uppercase h-[44px]", hasInput ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-stone-100 text-stone-400")}
                               >
                                 <Save size={14} className="mr-1"/> Zapisz
                               </button>
                            ) : (
                               hasInput ? (
                                 <button 
                                   onClick={() => handleSaveDraft(b, 'add')} 
                                   disabled={isProcessing}
                                   className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-[10px] shadow-sm flex flex-col items-center justify-center leading-none shrink-0 transition-all active:scale-95 h-[44px] w-[60px]"
                                 >
                                   <Plus size={14} className="mb-1"/> Dodaj
                                 </button>
                               ) : (
                                 <div className="flex gap-1 shrink-0 h-[44px]">
                                   {/* PRZYCISK USUŃ ZLICZENIE */}
                                   <button 
                                     onClick={() => handleClearDraft(b)}
                                     title="Usuń to zliczenie (Wyczyść)"
                                     className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center transition-all active:scale-95"
                                   >
                                     <Trash2 size={16} />
                                   </button>

                                   <div className="px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-[10px] uppercase tracking-wider">
                                     <CheckCircle2 size={14} className="mr-1"/> Gotowe
                                   </div>
                                 </div>
                               )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* PRZYCISK DODANIA NOWEGO WSADU (BO) NA KOŃCU LISTY WSADÓW */}
                  <div 
                    className="p-4 rounded-3xl border-2 border-dashed border-stone-300 bg-stone-50/50 flex flex-col items-center justify-center hover:bg-white hover:border-indigo-400 hover:text-indigo-600 transition-all cursor-pointer min-h-[160px] text-stone-400 group"
                    onClick={async () => {
                       const article = availableArticles.find(a => String(a.articleNumber || a.articleName || '').trim().toUpperCase() === selectedArticle);
                       if (!article) return;
                       setIsProcessing(true);
                       try {
                         const newBatchRef = doc(collection(db, 'inventoryBatches'));
                         await writeBatch(db).set(newBatchRef, {
                           batchNumber: `INW-${Date.now()}`,
                           articleNumber: article.articleNumber,
                           articleName: article.articleName,
                           numericQuantity: 0,
                           initialQuantity: 0,
                           status: 'AVAILABLE',
                           createdAt: serverTimestamp(),
                           sourcePurchaseOrderId: 'INWENTARYZACJA'
                         }).commit();
                       } catch (e) {
                         console.error(e);
                       } finally {
                         setIsProcessing(false);
                       }
                    }}
                  >
                    <div className="w-12 h-12 bg-white group-hover:bg-indigo-50 rounded-full flex items-center justify-center shadow-sm border border-stone-200 group-hover:border-indigo-200 mb-3 transition-colors">
                      <Plus size={24} />
                    </div>
                    <span className="font-bold text-sm">Dodaj nowy wsad (BO)</span>
                    <span className="text-xs text-center mt-1 px-4">Utwórz kolejną paletę / wiązkę dla tego artykułu</span>
                  </div>
                </div>
                )}
              </div>

              {/* Brak DOLNEGO PASKA MENEDŻERSKIEGO W TRYBIE SPISYWANIA */}
            </>
          )}
        </div>
      </div>

      {splittingBatch && (
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
                      <p className="text-[9px] text-stone-400 mt-1 leading-tight">Ilość szt. do wyodrębnienia. Kalkuluje: {splitTransferQty ? `${splitTransferQty} kg` : '...'}</p>
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
                      <p className="text-[9px] text-stone-400 mt-1 leading-tight">Wynik spisu w sztukach. Kalkuluje: {splitDraftQty ? `${splitDraftQty} kg` : '...'}</p>
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
}