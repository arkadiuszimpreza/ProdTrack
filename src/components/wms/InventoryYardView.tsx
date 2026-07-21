import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, getDocs, where, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, FileSpreadsheet, ArrowUpDown, Trash2, Eye, EyeOff } from 'lucide-react';
import { InventoryBatch, PurchaseOrderItem } from '../../types';
import { cn } from '../../utils/firestore-helpers';
import { exportToBarTenderExcel } from '../../utils/barTenderExporter';

type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'PL' | 'FA' | 'SR';
type SortKey = keyof InventoryBatch;

interface InventoryYardViewProps {
  readOnly?: boolean;
}

export function InventoryYardView({ readOnly = false }: InventoryYardViewProps) {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  const [hideEmpty, setHideEmpty] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'deliveryDate', direction: 'desc' });
  
  // Nowy stan do obsługi wizualnej przycisku usuwania
  const [isDeleting, setIsDeleting] = useState(false);

  const [deliveries, setDeliveries] = useState<PurchaseOrderItem[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'expectedDeliveries'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDeliveries(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PurchaseOrderItem)));
    }, (err) => console.error("Error fetching expectedDeliveries:", err));
    return () => unsubscribe();
  }, []);

  const erpUnitMap = useMemo(() => {
    const unitById = new Map<string, string>();
    const unitByArticleNumber = new Map<string, string>();
    const unitByArticleName = new Map<string, string>();

    deliveries.forEach(d => {
      const u = (d.unit || '').trim();
      if (!u) return;
      if (d.id) unitById.set(d.id, u);
      if (d.articleNumber) unitByArticleNumber.set(String(d.articleNumber).trim().toUpperCase(), u);
      if (d.articleName) unitByArticleName.set(String(d.articleName).trim().toLowerCase(), u);
    });

    return { unitById, unitByArticleNumber, unitByArticleName };
  }, [deliveries]);

  const getFallbackUnit = (b: InventoryBatch): string => {
    if (b.unit) return b.unit;
    if (b.sourcePurchaseOrderId && b.sourcePurchaseOrderId !== 'INWENTARYZACJA') {
      const u = erpUnitMap.unitById.get(b.sourcePurchaseOrderId);
      if (u) return u;
    }
    if (b.articleNumber) {
      const u = erpUnitMap.unitByArticleNumber.get(String(b.articleNumber).trim().toUpperCase());
      if (u) return u;
    }
    if (b.articleName) {
      const u = erpUnitMap.unitByArticleName.get(String(b.articleName).trim().toLowerCase());
      if (u) return u;
    }
    return '';
  };

  useEffect(() => {
    if (batches.length === 0 || deliveries.length === 0) return;
    
    const batchesToUpdate = batches.filter(b => {
      if (b.unit) return false;
      const fallback = getFallbackUnit(b);
      return !!fallback;
    });

    if (batchesToUpdate.length === 0) return;

    const performAutoHeal = async () => {
      const batchWrite = writeBatch(db);
      let updatedCount = 0;

      batchesToUpdate.forEach(b => {
        const resolvedUnit = getFallbackUnit(b);
        if (resolvedUnit && b.id) {
          const batchRef = doc(db, 'inventoryBatches', b.id);
          batchWrite.update(batchRef, { unit: resolvedUnit });
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        try {
          await batchWrite.commit();
          console.log(`Pomyślnie uzupełniono i zapisano jednostki dla ${updatedCount} wsadów.`);
        } catch (err) {
          console.error("Błąd podczas zapisywania jednostek do bazy:", err);
        }
      }
    };

    const timer = setTimeout(() => {
      performAutoHeal();
    }, 1500);

    return () => clearTimeout(timer);
  }, [batches, deliveries, erpUnitMap]);

  useEffect(() => {
    const q = query(collection(db, 'inventoryBatches'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBatches(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InventoryBatch)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const guessPrefix = (name: string): string => {
    const n = (name || '').toLowerCase();
    if (n.includes('rura')) return 'RU';
    if (n.includes('płyta') || n.includes('plyta')) return 'PL';
  if (n.includes('blacha')) return 'BL';
    if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik')) return 'PR';
    if (n.includes('farba') || n.includes('proszek')) return 'FA';
    if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
    return 'INNE'; 
  };

  const getBatchType = (batchNumber: string, articleName: string) => {
    const fromName = guessPrefix(articleName);
    if (fromName === 'PL') return 'PL';
    const clean = batchNumber.trim();
    // Standard ERP format e.g. 24RU0001
    if (clean.length >= 4) {
      const pfx = clean.slice(2, 4).toUpperCase();
      if (['RU', 'PR', 'BL', 'PL', 'FA', 'SR'].includes(pfx)) return pfx;
    }
    // Fallback: search in batchNumber or articleName
    
    if (fromName !== 'INNE') return fromName;
    
    const upperBatch = clean.toUpperCase();
    if (upperBatch.includes('-RU-') || upperBatch.includes('RU')) return 'RU';
    if (upperBatch.includes('-PR-') || upperBatch.includes('PR')) return 'PR';
    if (upperBatch.includes('-BL-') || upperBatch.includes('BL')) return 'BL';
    if (upperBatch.includes('-FA-') || upperBatch.includes('FA')) return 'FA';
    if (upperBatch.includes('-SR-') || upperBatch.includes('SR')) return 'SR';

    return 'INNE';
  };

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const processedBatches = useMemo(() => {
    let result = [...batches];
    if (hideEmpty) {
      result = result.filter(b => b.numericQuantity !== 0);
    }
    if (materialFilter !== 'ALL') result = result.filter(b => getBatchType(b.batchNumber, b.articleName || '') === materialFilter);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(b => 
        (b.batchNumber || '').toLowerCase().includes(term) || 
        (b.articleName || '').toLowerCase().includes(term) || 
        (b.orderNumber || '').toLowerCase().includes(term) || 
        (b.supplier || '').toLowerCase().includes(term) || 
        (b.articleNumber || '').toLowerCase().includes(term)
      );
    }
    result.sort((a, b) => {
      let aVal = a[sortConfig.key] || '';
      let bVal = b[sortConfig.key] || '';
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [batches, searchTerm, materialFilter, sortConfig, hideEmpty]);

  const toggleSelection = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(selectedIds.length === processedBatches.length && processedBatches.length > 0 ? [] : processedBatches.map(b => b.id as string));

  const handleToggleAttribute = async (batchId: string, attribute: 'qcCard' | 'certificate', currentValue: boolean) => {
    try {
      const batchRef = doc(db, 'inventoryBatches', batchId);
      await updateDoc(batchRef, {
        [attribute]: !currentValue
      });
    } catch (error) {
      console.error(`Błąd przy aktualizacji ${attribute}:`, error);
    }
  };

  const handleExportToBarTender = () => {
    if (selectedIds.length === 0) return alert('Zaznacz przynajmniej jeden wsad do wydruku!');
    const batchesToExport = batches.filter(b => selectedIds.includes(b.id as string)).map(b => ({ ...b, unit: b.unit || getFallbackUnit(b) }));
    exportToBarTenderExcel(batchesToExport, `Wydruk_Etykiet_${new Date().getTime()}.xlsx`);
    setSelectedIds([]);
  };

  // ------------------------------------------------------------------
  // Funkcja czyszcząca Bilans Otwarcia
  // ------------------------------------------------------------------
  const handleClearOpeningBalance = async () => {
    const confirmed = window.confirm("UWAGA! Czy na pewno chcesz trwale usunąć wszystkie wsady z Bilansu Otwarcia (INWENTARYZACJA BO)? Tej operacji nie można cofnąć.");
    
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const q = query(
        collection(db, 'inventoryBatches'), 
        where('supplier', '==', 'INWENTARYZACJA BO')
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert("Brak wsadów z Bilansu Otwarcia do usunięcia. Baza jest już czysta.");
        setIsDeleting(false);
        return;
      }

      // Usuwamy równolegle wszystkie znalezione dokumenty
      const deletePromises = snapshot.docs.map(document => 
        deleteDoc(doc(db, 'inventoryBatches', document.id))
      );
      
      await Promise.all(deletePromises);
      alert(`Sukces. Pomyślnie usunięto ${snapshot.size} wsadów z Bilansu Otwarcia.`);
    } catch (error) {
      console.error("Błąd podczas usuwania Bilansu Otwarcia: ", error);
      alert("Wystąpił błąd podczas usuwania. Skontaktuj się z administratorem.");
    } finally {
      setIsDeleting(false);
    }
  };

  const getBlachaCalculatedMetrics = (b) => {
    const type = getBatchType(b.batchNumber, b.articleName || '');
    if ((type !== 'BL' && type !== 'PL')) return null;
    const unit = getFallbackUnit(b);
    if ((unit || '').toLowerCase() !== 'kg') return null;
    if (!b.coefficient) return null;
    const coeffStr = String(b.coefficient).replace(/,/g, '.');
    const coeffNum = parseFloat(coeffStr);
    if (isNaN(coeffNum) || coeffNum <= 0) return null;
    const totalAreaM2 = b.numericQuantity / coeffNum;
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

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm font-bold">Ładowanie ewidencji placu...</div>;

  return (
    <div className="space-y-3">
      {/* GŁÓWNY PANEL STEROWANIA */}
      <div className="bg-white p-2 rounded-xl border border-stone-200 shadow-sm flex flex-col md:flex-row gap-2 items-center justify-between">
        
        {/* Wyszukiwarka */}
        <div className="flex items-center flex-1 w-full">
          <Search className="text-stone-400 ml-2 mr-3 shrink-0" size={16} />
          <input type="text" placeholder="Szukaj wsadu na placu..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-transparent border-none focus:outline-none text-xs font-medium text-stone-700" />
        </div>
        
        {/* Filtry */}
        <div className="flex bg-stone-100 p-1 rounded-lg border border-stone-200 shrink-0 select-none text-[11px] font-bold">
          {['ALL', 'RU', 'PR', 'BL', 'PL', 'FA', 'SR'].map(f => (
            <button key={f} onClick={() => setMaterialFilter(f as MaterialFilter)} className={cn("px-2.5 py-1 rounded transition-all", materialFilter === f ? "bg-white text-indigo-700 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
              {f === 'ALL' ? 'Wszystko' : f}
            </button>
          ))}
        </div>
        
        {/* Kontener na przyciski akcji */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* PRZYCISK UKRYWANIA ZEROWYCH STANÓW */}
          <button 
            onClick={() => setHideEmpty(!hideEmpty)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 font-black text-[11px] rounded-lg shadow-sm transition-colors uppercase w-full md:w-auto justify-center border",
              hideEmpty 
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" 
                : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
            )}
            title={hideEmpty ? "Pokaż wsady ze stanem zerowym" : "Ukryj wsady ze stanem zerowym"}
          >
            {hideEmpty ? <EyeOff size={14} /> : <Eye size={14} />}
            {hideEmpty ? 'Ukryto puste' : 'Pokaż puste'}
          </button>

          {/* PRZYCISK USUWANIA BILANSU */}
          {!readOnly && (
            <button 
              onClick={handleClearOpeningBalance} 
              disabled={isDeleting}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-white font-black text-[11px] rounded-lg shadow-sm transition-colors uppercase w-full md:w-auto justify-center",
                isDeleting ? "bg-stone-400 cursor-not-allowed" : "bg-rose-600 hover:bg-rose-700"
              )}
            >
              <Trash2 size={14} /> {isDeleting ? 'Usuwanie...' : 'Usuń B.O.'}
            </button>
          )}

          <button onClick={handleExportToBarTender} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] rounded-lg shadow-sm transition-colors uppercase w-full md:w-auto justify-center">
            <FileSpreadsheet size={14} /> Eksport ({selectedIds.length})
          </button>
        </div>

      </div>

      {/* TABELA DANYCH */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap table-fixed">
          <thead>
            <tr className="bg-stone-100 border-b border-stone-200 text-[10px] font-black uppercase tracking-wider text-stone-500 select-none">
              <th className="p-2 w-10 text-center">
                <input type="checkbox" className="w-4 h-4 rounded border-stone-300 text-indigo-600 cursor-pointer" checked={selectedIds.length === processedBatches.length && processedBatches.length > 0} onChange={toggleAll} />
              </th>
              <th className="p-2 w-28 cursor-pointer hover:bg-stone-200" onClick={() => handleSort('batchNumber')}><div className="flex items-center gap-1">Nr Wsadu <ArrowUpDown size={10}/></div></th>
              <th className="p-2 w-24 cursor-pointer hover:bg-stone-200" onClick={() => handleSort('orderNumber')}><div className="flex items-center gap-1">Zamówienie <ArrowUpDown size={10}/></div></th>
              <th className="p-2 w-48 cursor-pointer hover:bg-stone-200" onClick={() => handleSort('articleName')}><div className="flex items-center gap-1">Nazwa / Kolor RAL <ArrowUpDown size={10}/></div></th>
              <th className="p-2 w-24 cursor-pointer hover:bg-stone-200" onClick={() => handleSort('dimensions')}><div className="flex items-center gap-1">Wymiar <ArrowUpDown size={10}/></div></th>
              
              <th className="p-2 w-16 text-center cursor-pointer hover:bg-stone-200" onClick={() => handleSort('labelsCount')}><div className="flex items-center justify-center gap-1">Naklejki <ArrowUpDown size={10}/></div></th>
              <th className="p-2 w-16 text-center cursor-pointer hover:bg-stone-200" onClick={() => handleSort('qcCard')}><div className="flex items-center justify-center gap-1">Karta <ArrowUpDown size={10}/></div></th>
              <th className="p-2 w-16 text-center cursor-pointer hover:bg-stone-200" onClick={() => handleSort('certificate')}><div className="flex items-center justify-center gap-1">Atest <ArrowUpDown size={10}/></div></th>

              <th className="p-2 w-20 text-right cursor-pointer hover:bg-stone-200" onClick={() => handleSort('initialQuantity')}><div className="flex items-center justify-end gap-1">Przyjęto <ArrowUpDown size={10}/></div></th>
              <th className="p-2 w-20 text-right cursor-pointer hover:bg-stone-200" onClick={() => handleSort('withdrawnQuantity')}><div className="flex items-center justify-end gap-1">Pobrano <ArrowUpDown size={10}/></div></th>
              <th className="p-2 w-20 text-right cursor-pointer hover:bg-stone-200" onClick={() => handleSort('numericQuantity')}><div className="flex items-center justify-end gap-1 text-indigo-600">Stan (Plac) <ArrowUpDown size={10}/></div></th>
              <th className="p-2 w-20 text-center text-stone-500">J.M.</th>
              <th className="p-2 w-24 text-center cursor-pointer hover:bg-stone-200" onClick={() => handleSort('deliveryDate')}><div className="flex items-center justify-center gap-1">Data Dost. <ArrowUpDown size={10}/></div></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 text-[11px] font-medium text-stone-800">
            {processedBatches.length === 0 ? (
              <tr><td colSpan={13} className="p-6 text-center text-stone-400 font-normal">Brak zarejestrowanych wsadów.</td></tr>
            ) : (
              processedBatches.map(b => {
                const initialQty = b.initialQuantity ?? b.numericQuantity;
                const withdrawnQty = b.withdrawnQuantity ?? 0;
                
                return (
                  <tr key={b.id} className={cn("hover:bg-indigo-50/20 transition-colors odd:bg-white even:bg-stone-50/30", selectedIds.includes(b.id as string) && "bg-indigo-50/50 odd:bg-indigo-50/50")} onClick={() => toggleSelection(b.id as string)}>
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="w-4 h-4 rounded border-stone-300 text-indigo-600 cursor-pointer" checked={selectedIds.includes(b.id as string)} onChange={() => toggleSelection(b.id as string)} />
                    </td>
                    <td className="p-2 font-black text-indigo-700 cursor-pointer">{b.batchNumber}</td>
                    <td className="p-2 font-bold text-stone-900 cursor-pointer">{b.orderNumber || '-'}</td>
                    <td className="p-2 font-normal text-stone-900 cursor-pointer max-w-[280px]" title={b.articleName}>
                      <div className="line-clamp-2 text-xs leading-tight whitespace-normal break-words font-medium">
                        {b.articleName}
                      </div>
                    </td>
                    <td className="p-2 text-stone-600 font-semibold cursor-pointer">{b.dimensions || '-'}</td>
                    
                    <td className="p-2 text-center text-stone-500 font-semibold cursor-pointer">{b.labelsCount || 0}</td>
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="w-4 h-4 rounded border-stone-300 text-indigo-600 cursor-pointer" checked={!!b.qcCard} disabled={readOnly} onChange={() => handleToggleAttribute(b.id as string, 'qcCard', !!b.qcCard)} />
                    </td>
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="w-4 h-4 rounded border-stone-300 text-indigo-600 cursor-pointer" checked={!!b.certificate} disabled={readOnly} onChange={() => handleToggleAttribute(b.id as string, 'certificate', !!b.certificate)} />
                    </td>

                    <td className="p-2 text-right font-bold text-stone-500 cursor-pointer">{initialQty}</td>
                    <td className="p-2 text-right font-bold text-rose-500 cursor-pointer">{withdrawnQty > 0 ? `-${withdrawnQty}` : '0'}</td>
                    <td className="p-2 text-right font-black text-emerald-600 bg-emerald-50/30 cursor-pointer">
                      <div className="flex flex-col items-end">
                         <span>{b.numericQuantity}</span>
                         {(() => {
                            const metrics = getBlachaCalculatedMetrics(b);
                            if (!metrics) return null;
                            const textParts = [];
                            if (metrics.sheets !== undefined) {
                               textParts.push(`${Math.round(metrics.sheets)} ark.`);
                            }
                            textParts.push(`${parseFloat(metrics.m2.toFixed(2))} m²`);
                            return (
                              <span className="text-[10px] text-emerald-700/70 font-semibold whitespace-nowrap mt-0.5" title="Wartości wyliczone na podstawie wagi i wymiarów">
                                {textParts.join(' | ')}
                              </span>
                            );
                         })()}
                      </div>
                    </td>
                    <td className="p-2 text-center bg-stone-50/50">
                      <div className="flex flex-col items-center justify-center">
                        {b.coefficient && (
                          <span className="text-[10px] text-emerald-600 font-bold leading-none mb-1">
                            {b.coefficient}
                          </span>
                        )}
                        <span className="text-stone-700 font-bold leading-none">{b.unit || getFallbackUnit(b) || '-'}</span>
                      </div>
                    </td>
                    <td className="p-2 text-center text-stone-500 font-semibold cursor-pointer">{b.deliveryDate}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}