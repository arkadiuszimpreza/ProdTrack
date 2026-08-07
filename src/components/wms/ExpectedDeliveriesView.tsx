import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, getDocs, writeBatch, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  Search, ArrowUpDown, Truck, ListFilter, CheckCircle, 
  Upload, Calendar, User, FileSpreadsheet, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { PurchaseOrderItem } from '../../types';
import { cn } from '../../utils/firestore-helpers';
import { parseZakupyInfo } from '../../utils/inventoryExcelParser';

type SortKey = keyof PurchaseOrderItem;
type FilterMode = 'pending_only' | 'all';

interface ExpectedDeliveriesProps {
  onReceiveClick?: (item: any) => void;
  currentUser?: string;
}

export function ExpectedDeliveriesView({ onReceiveClick, currentUser }: ExpectedDeliveriesProps) {
  const [deliveries, setDeliveries] = useState<PurchaseOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Stan filtru: domyślnie wyświetlamy tylko oczekujące dostawy
  const [filterMode, setFilterMode] = useState<FilterMode>('pending_only');
  
  // Stan sortowania (domyślnie po dostawcy)
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ 
    key: 'supplierName', 
    direction: 'asc' 
  });

  // Stany dla importu pliku ERP
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importMeta, setImportMeta] = useState<{ importedAt?: any; importedBy?: string; itemCount?: number; fileName?: string } | null>(null);

  // 1. POBIERANIE DANYCH (Real-time)
  useEffect(() => {
    const q = query(collection(db, 'expectedDeliveries'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PurchaseOrderItem));
      setDeliveries(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Błąd pobierania dostaw:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. POBIERANIE METADANYCH O OSTATNIM IMPORTOWANIU
  useEffect(() => {
    const metaRef = doc(db, 'systemSettings', 'expectedDeliveriesImport');
    const unsubscribe = onSnapshot(metaRef, (snapshot) => {
      if (snapshot.exists()) {
        setImportMeta(snapshot.data());
      }
    }, (error) => {
      console.error("Błąd pobierania metadanych importu:", error);
    });

    return () => unsubscribe();
  }, []);

  // OBSŁUGA IMPORTU ZAKUPÓW ERP (Zakupy-info)
  const handleZakupyImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportMessage(null);

    try {
      const parsedDeliveries = await parseZakupyInfo(file);
      if (!parsedDeliveries || parsedDeliveries.length === 0) {
        throw new Error('Plik nie zawiera pozycji zakupów oczekujących dla magazynów MRB/MSN.');
      }

      // Pobranie zsumowanych dostaw WMS z inventoryBatches
      const inventorySnap = await getDocs(collection(db, 'inventoryBatches'));
      const batchesSums: Record<string, number> = {};

      inventorySnap.docs.forEach(docSnap => {
        const batch = docSnap.data();
        if (batch.sourcePurchaseOrderId) {
          const qty = batch.initialQuantity ?? batch.numericQuantity ?? 0;
          batchesSums[batch.sourcePurchaseOrderId] = (batchesSums[batch.sourcePurchaseOrderId] || 0) + qty;
        }
      });

      const CHUNK_SIZE = 450;
      for (let i = 0; i < parsedDeliveries.length; i += CHUNK_SIZE) {
        const batchWrite = writeBatch(db);
        const chunk = parsedDeliveries.slice(i, i + CHUNK_SIZE);

        chunk.forEach(item => {
          const docRef = doc(collection(db, 'expectedDeliveries'), item.id);
          const wmsSum = batchesSums[item.id] || 0;
          const newWmsDeliveredQuantity = wmsSum;
          const newWmsTotalValue = newWmsDeliveredQuantity * (item.unitPrice || 0);

          const itemToSave = {
            ...item,
            wmsDeliveredQuantity: newWmsDeliveredQuantity,
            wmsTotalValue: newWmsTotalValue,
            importedAt: serverTimestamp(),
            lastModifiedAt: serverTimestamp()
          };

          batchWrite.set(docRef, itemToSave, { merge: true });
        });

        await batchWrite.commit();
      }

      // Kaskadowa aktualizacja cen wsadów na magazynie dla zmienionych pozycji ERP
      const priceMapById = new Map<string, number>();
      const priceMapByPoArt = new Map<string, number>();
      parsedDeliveries.forEach(item => {
        if (item.unitPrice !== undefined && item.unitPrice > 0) {
          priceMapById.set(item.id, item.unitPrice);
          if (item.purchaseOrderNumber && item.articleNumber) {
            priceMapByPoArt.set(`${item.purchaseOrderNumber}_${item.articleNumber}`, item.unitPrice);
          }
        }
      });

      for (const batchDoc of inventorySnap.docs) {
        const bData = batchDoc.data();
        let newPrice: number | undefined;
        if (bData.sourcePurchaseOrderId && priceMapById.has(bData.sourcePurchaseOrderId)) {
          newPrice = priceMapById.get(bData.sourcePurchaseOrderId);
        } else if (bData.orderNumber && bData.articleNumber && priceMapByPoArt.has(`${bData.orderNumber}_${bData.articleNumber}`)) {
          newPrice = priceMapByPoArt.get(`${bData.orderNumber}_${bData.articleNumber}`);
        }

        if (newPrice !== undefined && newPrice > 0 && newPrice !== bData.unitPrice) {
          const qty = bData.numericQuantity ?? bData.initialQuantity ?? 0;
          await updateDoc(doc(db, 'inventoryBatches', batchDoc.id), {
            unitPrice: newPrice,
            totalValue: Number((qty * newPrice).toFixed(2))
          });
        }
      }

      // Zapis metadanych o imporcie (kto i kiedy)
      const importerName = currentUser || 'Użytkownik WMS';
      await setDoc(doc(db, 'systemSettings', 'expectedDeliveriesImport'), {
        importedAt: serverTimestamp(),
        importedBy: importerName,
        itemCount: parsedDeliveries.length,
        fileName: file.name
      });

      setImportMessage({
        type: 'success',
        text: `Pomyślnie zaimportowano ${parsedDeliveries.length} pozycji z pliku ERP.`
      });
    } catch (error: any) {
      console.error('Błąd importu zakupy ERP:', error);
      setImportMessage({
        type: 'error',
        text: error.message || 'Błąd przetwarzania pliku ERP'
      });
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const formatImportDate = (dateVal: any) => {
    if (!dateVal) return 'Brak danych';
    let d: Date;
    if (dateVal?.toDate) {
      d = dateVal.toDate();
    } else if (dateVal?.seconds) {
      d = new Date(dateVal.seconds * 1000);
    } else if (typeof dateVal === 'string' || typeof dateVal === 'number') {
      d = new Date(dateVal);
    } else {
      return 'Brak danych';
    }
    if (isNaN(d.getTime())) return 'Brak danych';
    return d.toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 3. OBSŁUGA SORTOWANIA
  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // 4. FILTROWANIE I SORTOWANIE
  const processedDeliveries = useMemo(() => {
    let result = [...deliveries];

    // A. Filtr trybu: Tylko niepełne lub Wszystkie zamówienia
    if (filterMode === 'pending_only') {
      result = result.filter(item => {
        const wmsDelivered = item.wmsDeliveredQuantity || 0;
        return wmsDelivered < item.quantityOrdered;
      });
    }

    // B. Wyszukiwarka tekstowa
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(item => 
        (item.purchaseOrderNumber || '').toLowerCase().includes(term) ||
        (item.articleName || '').toLowerCase().includes(term) ||
        (item.articleNumber || '').toLowerCase().includes(term) ||
        (item.supplierName || '').toLowerCase().includes(term) ||
        (item.projectNumber || '').toLowerCase().includes(term)
      );
    }

    // C. Sortowanie
    result.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (aVal === undefined || aVal === null) aVal = '';
      if (bVal === undefined || bVal === null) bVal = '';

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [deliveries, searchTerm, filterMode, sortConfig]);

  // Formatowanie liczb do max 3 miejsc po przecinku
  const formatQty = (value: number): string => {
    if (value === undefined || value === null || isNaN(value)) return '0';
    return Number(value.toFixed(3)).toString();
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-400 text-sm font-bold">Ładowanie danych z bazy...</div>;
  }

  return (
    <div className="space-y-3">
      {/* SEKCJA IMPORTU ERP Z SYSTEMU ORAZ DANE O OSTATNIM IMPORCIE */}
      <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className={cn(
            "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer select-none shrink-0",
            isImporting && "opacity-75 cursor-not-allowed pointer-events-none"
          )}>
            <Upload size={15} />
            <span>{isImporting ? 'Importowanie ERP...' : 'Importuj zakupy info (ERP)'}</span>
            <input 
              type="file" 
              accept=".csv, .xlsx, .xls" 
              onChange={handleZakupyImport} 
              disabled={isImporting} 
              className="hidden" 
            />
          </label>

          {importMessage && (
            <div className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5",
              importMessage.type === 'success' ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
            )}>
              {importMessage.type === 'success' ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-red-600" />}
              <span>{importMessage.text}</span>
            </div>
          )}
        </div>

        {/* INFORMACJE O OSTATNIM IMPORTOWANIU PLIKU */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 bg-stone-50 px-3.5 py-2 rounded-lg border border-stone-200 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-stone-400" />
            <span className="text-stone-500 font-medium">Data importu:</span>
            <span className="font-bold text-stone-900">
              {importMeta?.importedAt ? formatImportDate(importMeta.importedAt) : 'Brak danych'}
            </span>
          </div>

          <span className="text-stone-300 hidden sm:inline">|</span>

          <div className="flex items-center gap-1.5">
            <User size={14} className="text-stone-400" />
            <span className="text-stone-500 font-medium">Zaimportował:</span>
            <span className="font-bold text-stone-900">
              {importMeta?.importedBy || 'Brak danych'}
            </span>
          </div>

          {importMeta?.itemCount !== undefined && (
            <>
              <span className="text-stone-300 hidden sm:inline">|</span>
              <div className="flex items-center gap-1.5">
                <FileSpreadsheet size={14} className="text-stone-400" />
                <span className="text-stone-500 font-medium">Pozycji:</span>
                <span className="font-bold text-stone-900">{importMeta.itemCount}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* PASEK NARZĘDZIOWY */}
      <div className="bg-white p-2 rounded-xl border border-stone-200 shadow-sm flex flex-col sm:flex-row gap-2 items-center justify-between">
        <div className="flex items-center flex-1 w-full">
          <Search className="text-stone-400 ml-2 mr-3 shrink-0" size={16} />
          <input 
            type="text" 
            placeholder="Szukaj dostaw (Indeks, Nazwa, Dostawca, Projekt, Proces)..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none focus:outline-none text-xs font-medium text-stone-700"
          />
        </div>

        <div className="flex bg-stone-100 p-1 rounded-lg border border-stone-200 shrink-0 w-full sm:w-auto justify-center">
          <button
            onClick={() => setFilterMode('pending_only')}
            className={cn(
              "px-3 py-1.5 rounded text-[11px] font-bold transition-all flex items-center gap-1.5",
              filterMode === 'pending_only' ? "bg-white text-indigo-700 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <ListFilter size={12} />
            Oczekujące dostawy
          </button>
          <button
            onClick={() => setFilterMode('all')}
            className={cn(
              "px-3 py-1.5 rounded text-[11px] font-bold transition-all flex items-center gap-1.5",
              filterMode === 'all' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <CheckCircle size={12} />
            Wszystkie zamówienia
          </button>
        </div>
      </div>

      {/* COMPACT TABLE - ERP STYLE WITH PROJECT-NR */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px] h-[calc(100vh-250px)]">
        <div className="overflow-auto flex-1 relative">
          <table className="text-left border-collapse whitespace-nowrap table-auto w-full">
            <thead className="sticky top-0 z-10 shadow-sm outline outline-1 outline-stone-200">
              <tr className="bg-stone-100 text-[10px] font-black uppercase tracking-wider text-stone-500 select-none">
                <th className="p-0 border-r border-stone-200 cursor-pointer hover:bg-stone-200 transition-colors" onClick={() => handleSort('supplierName')}>
                  <div className="flex items-center gap-1 overflow-hidden resize-x w-32 min-w-[50px] px-2 py-1">Dostawca <ArrowUpDown size={10} className="shrink-0"/></div>
                </th>
                <th className="p-0 border-r border-stone-200 cursor-pointer hover:bg-stone-200 transition-colors" onClick={() => handleSort('purchaseOrderNumber')}>
                  <div className="flex items-center gap-1 overflow-hidden resize-x w-28 min-w-[50px] px-2 py-1">Proces / Poz <ArrowUpDown size={10} className="shrink-0"/></div>
                </th>
                <th className="p-0 border-r border-stone-200 cursor-pointer hover:bg-stone-200 transition-colors" onClick={() => handleSort('warehouse')}>
                  <div className="flex items-center gap-1 overflow-hidden resize-x w-20 min-w-[50px] px-2 py-1">Magazyn <ArrowUpDown size={10} className="shrink-0"/></div>
                </th>
                <th className="p-0 border-r border-stone-200 cursor-pointer hover:bg-stone-200 transition-colors" onClick={() => handleSort('projectNumber')}>
                  <div className="flex items-center gap-1 overflow-hidden resize-x w-28 min-w-[50px] px-2 py-1">Projekt-Nr <ArrowUpDown size={10} className="shrink-0"/></div>
                </th>
                <th className="p-0 border-r border-stone-200 cursor-pointer hover:bg-stone-200 transition-colors" onClick={() => handleSort('articleNumber')}>
                  <div className="flex items-center gap-1 overflow-hidden resize-x w-28 min-w-[50px] px-2 py-1">Artykuł-Nr <ArrowUpDown size={10} className="shrink-0"/></div>
                </th>
                <th className="p-0 border-r border-stone-200 w-full min-w-[200px]">
                  <div className="flex items-center overflow-hidden px-2 py-1">Nazwa</div>
                </th>
                <th className="p-0 border-r border-stone-200 text-right">
                  <div className="flex items-center justify-end overflow-hidden resize-x w-20 min-w-[50px] px-2 py-1">Ilość</div>
                </th>
                <th className="p-0 border-r border-stone-200 text-right">
                  <div className="flex items-center justify-end overflow-hidden resize-x w-24 min-w-[50px] px-2 py-1">Dost. (ERP)</div>
                </th>
                <th className="p-0 border-r border-stone-200 text-right">
                  <div className="flex items-center justify-end overflow-hidden resize-x w-24 min-w-[50px] px-2 py-1">Brak (ERP)</div>
                </th>
                <th className="p-0 border-r border-stone-200 text-right bg-indigo-50/50 text-indigo-700">
                  <div className="flex items-center justify-end overflow-hidden resize-x w-28 min-w-[50px] px-2 py-1">Przyjęto WMS</div>
                </th>
                <th className="p-0 border-r border-stone-200 text-center">
                  <div className="flex items-center justify-center overflow-hidden resize-x w-16 min-w-[40px] px-2 py-1">Jm</div>
                </th>
                <th className="p-0 border-r border-stone-200 text-center">
                  <div className="flex items-center justify-center overflow-hidden resize-x w-28 min-w-[50px] px-2 py-1">Data dostawy</div>
                </th>
                <th className="p-0 text-center">
                  <div className="flex items-center justify-center overflow-hidden w-20 min-w-[50px] px-2 py-1">Akcja</div>
                </th>
              </tr>
            </thead>
          <tbody className="divide-y divide-stone-100 text-[11px] font-medium text-stone-800">
            {processedDeliveries.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-6 text-center text-stone-400 font-normal">
                  <Truck size={24} className="mx-auto mb-1 opacity-20" />
                  Brak pozycji
                </td>
              </tr>
            ) : (
              processedDeliveries.map(item => {
                const wmsDelivered = item.wmsDeliveredQuantity || 0;
                const isItemCompleted = wmsDelivered >= item.quantityOrdered;
                
                return (
                  <tr 
                    key={item.id} 
                    className={cn(
                      "hover:bg-stone-100 transition-colors odd:bg-white even:bg-stone-50/30",
                      isItemCompleted && "opacity-60 bg-stone-100/40"
                    )}
                  >
                    <td className="px-2 py-1 border-r border-stone-200 truncate font-bold text-stone-700 max-w-0">{item.supplierName || '-'}</td>
                    <td className="px-2 py-1 border-r border-stone-200 truncate max-w-0">
                      <span className="font-bold text-stone-900">{item.purchaseOrderNumber}</span>
                      <span className="text-stone-400 ml-0.5">/{item.positionNumber}</span>
                    </td>
                    <td className="px-2 py-1 border-r border-stone-200 uppercase font-black text-indigo-700 max-w-0">{item.warehouse || '-'}</td>
                    <td className="px-2 py-1 border-r border-stone-200 font-bold text-stone-600 truncate uppercase tracking-tight max-w-0">{item.projectNumber || '-'}</td>
                    <td className="px-2 py-1 border-r border-stone-200 font-mono text-stone-500 tracking-tight max-w-0 truncate">{item.articleNumber}</td>
                    <td className="px-2 py-1 border-r border-stone-200 truncate font-normal text-stone-900 max-w-0" title={item.articleName}>{item.articleName}</td>
                    
                    <td className="px-2 py-1 border-r border-stone-200 text-right text-stone-600 max-w-0 truncate">{formatQty(item.quantityOrdered)}</td>
                    <td className="px-2 py-1 border-r border-stone-200 text-right text-emerald-600 max-w-0 truncate">{formatQty(item.quantityDelivered)}</td>
                    <td className="px-2 py-1 border-r border-stone-200 text-right text-red-600 max-w-0 truncate">{formatQty(item.quantityRemaining)}</td>
                    
                    {/* FAKTYCZNA ILOŚĆ Z WSADÓW (WMS) */}
                    <td className="px-2 py-1 border-r border-stone-200 text-right bg-indigo-50/30 font-black text-indigo-700 max-w-0 truncate">
                      {formatQty((item as any).wmsDeliveredQuantity || 0)}
                    </td>
                    
                    <td className="px-2 py-1 border-r border-stone-200 text-center text-stone-500 font-semibold text-[11px] max-w-0 truncate">{item.unit}</td>
                    <td className="px-2 py-1 border-r border-stone-200 text-center text-stone-600 font-semibold max-w-0 truncate">{item.expectedDeliveryDate || '-'}</td>
                    
                    <td className="px-2 py-1 text-center max-w-0 truncate">
                      {onReceiveClick && !isItemCompleted && (
                        <button 
                          onClick={() => onReceiveClick(item)}
                          className="px-3 py-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-[10px] font-black uppercase transition-colors"
                        >
                          Przyjmij
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}