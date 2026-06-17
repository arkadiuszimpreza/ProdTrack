import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { InventoryBatch, PurchaseOrderItem } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface ArticleGroup {
  articleNumber: string;
  articleName: string;
  totalQuantity: number;
  averagePrice: number;
  totalValue: number;
  batches: InventoryBatch[];
}

 const formatCurrency = (val: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(val || 0);
  const formatQty = (val: number) => Number((val || 0).toFixed(3)).toString();

export function ArticleRegistryView() {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [deliveries, setDeliveries] = useState<PurchaseOrderItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  // 1. NASŁUCHIWANIE WSADÓW (Plac)
  useEffect(() => {
    const q = query(collection(db, 'inventoryBatches'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InventoryBatch));
      setBatches(fetched);
      setLoadingBatches(false);
    }, (err) => console.error(err));
    return () => unsubscribe();
  }, []);

  // 2. NASŁUCHIWANIE ZAMÓWIEŃ (ERP / Zakupy-info dla cen)
  useEffect(() => {
    const q = query(collection(db, 'expectedDeliveries'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PurchaseOrderItem));
      setDeliveries(fetched);
      setLoadingDeliveries(false);
    }, (err) => console.error(err));
    return () => unsubscribe();
  }, []);

  // 3. INTELIGENTNE ŁĄCZENIE I GRUPOWANIE W LOCIE (Relacja po sourcePurchaseOrderId)
  const groupedArticles = useMemo(() => {
    const groups: Record<string, ArticleGroup> = {};

    // Tworzymy szybką mapę (słownik) zamówień ERP, żeby błyskawicznie wyciągać ceny po ID
    const erpMap = new Map<string, PurchaseOrderItem>();
    deliveries.forEach(d => {
      if (d.id) erpMap.set(d.id, d);
    });

    batches.forEach(batch => {
      if (!batch.articleNumber) return; 
      
      const key = String(batch.articleNumber || '').trim().toUpperCase();
      
      if (!groups[key]) {
        groups[key] = {
          articleNumber: key,
          articleName: batch.articleName || 'Nieznany asortyment',
          totalQuantity: 0,
          averagePrice: 0,
          totalValue: 0,
          batches: []
        };
      }

      // --- POBIERANIE CENY Z RELACJI ERP ---
      let currentUnitPrice = batch.unitPrice || 0;
      if (batch.sourcePurchaseOrderId && batch.sourcePurchaseOrderId !== 'INWENTARYZACJA') {
        const erpItem = erpMap.get(batch.sourcePurchaseOrderId);
        if (erpItem && erpItem.unitPrice) {
          currentUnitPrice = erpItem.unitPrice;
        }
      }

      const qty = batch.numericQuantity || 0;
      const calculatedBatchValue = qty * currentUnitPrice;

      // Wstrzykujemy cenę w locie do obiektu wsadu na potrzeby wyświetlania w tabeli podrzędnej
      const enrichedBatch = {
        ...batch,
        unitPrice: currentUnitPrice,
        totalValue: calculatedBatchValue,
        quantityString: batch.quantityString || (formatQty(qty) + (batch.unit ? ` ${batch.unit}` : ''))
      };

      groups[key].batches.push(enrichedBatch);
      groups[key].totalQuantity += qty;
      groups[key].totalValue += calculatedBatchValue;
    });

    // Obliczanie średniej ceny ważonej na placu
    Object.values(groups).forEach(g => {
      if (g.totalQuantity > 0) {
        g.averagePrice = g.totalValue / g.totalQuantity;
      }
    });

    return Object.values(groups).sort((a, b) => a.articleName.localeCompare(b.articleName));
  }, [batches, deliveries]);

  // 4. WYSZUKIWARKA
  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groupedArticles;
    const term = searchTerm.toLowerCase();
    return groupedArticles.filter(g => 
      (g.articleNumber || '').toLowerCase().includes(term) ||
      (g.articleName || '').toLowerCase().includes(term)
    );
  }, [groupedArticles, searchTerm]);

 

  if (loadingBatches || loadingDeliveries) {
    return <div className="p-8 text-center text-stone-400 font-bold">Trwa synchronizacja relacji finansowych...</div>;
  }

  return (
    <div className="space-y-4">
      {/* PASEK WYSZUKIWANIA */}
      <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex items-center">
        <Search className="text-stone-400 ml-2 mr-3 shrink-0" size={18} />
        <input 
          type="text" 
          placeholder="Szukaj po numerze indeksu lub nazwie asortymentu..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent border-none focus:outline-none text-sm font-medium text-stone-700"
        />
        <div className="px-4 py-1 bg-stone-100 rounded-lg text-xs font-bold text-stone-500">
          Indeksów na placu: {filteredGroups.length}
        </div>
      </div>

      {/* LISTA ARTYKUŁÓW */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
        {filteredGroups.length === 0 ? (
          <div className="p-8 text-center text-stone-400">Brak artykułów na placu spełniających kryteria.</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredGroups.map(group => {
              const isExpanded = expandedArticle === group.articleNumber;

              return (
                <div key={group.articleNumber} className="flex flex-col transition-colors">
                  
                  {/* NAGŁÓWEK ARTYKUŁU */}
                  <div 
                    onClick={() => setExpandedArticle(isExpanded ? null : group.articleNumber)}
                    className={cn(
                      "flex items-center justify-between p-4 cursor-pointer hover:bg-stone-50 transition-colors",
                      isExpanded && "bg-indigo-50/30 hover:bg-indigo-50/50"
                    )}
                  >
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-600 font-mono text-xs font-bold rounded border border-stone-200">
                          {group.articleNumber}
                        </span>
                        <h3 className="font-black text-stone-800 text-sm">{group.articleName}</h3>
                      </div>
                      <div className="text-xs text-stone-500 font-medium flex gap-4 mt-1">
                        <span>Ilość wsadów: <strong className="text-stone-700">{group.batches.length}</strong></span>
                        <span>Fizyczny stan placu: <strong className="text-indigo-600">{formatQty(group.totalQuantity)}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Śr. Cena zakupu / Wartość zapasów WMS</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-stone-600">{formatCurrency(group.averagePrice)}</span>
                          <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                            {formatCurrency(group.totalValue)}
                          </span>
                        </div>
                      </div>
                      <div className="text-stone-400">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </div>

                  {/* ROZWIJANA LISTA WSADÓW (Z DANYCH ZŁĄCZONYCH RELACYJNIE) */}
                  {isExpanded && (
                    <div className="bg-stone-50/80 border-t border-stone-100 p-4 pl-12 shadow-inner">
                      <h4 className="text-xs font-black uppercase text-stone-500 mb-3 flex items-center gap-2">
                        <Layers size={14} /> Specyfikacja wsadów historycznych skojarzonych z cenami ERP
                      </h4>
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-stone-200 text-stone-400">
                            <th className="pb-2 font-bold w-24">Data dostawy</th>
                            <th className="pb-2 font-bold w-32">Nr Wsadu</th>
                            <th className="pb-2 font-bold w-32">Zamówienie (Proces)</th>
                            <th className="pb-2 font-bold">Dostawca / Wymiary specyfikacji</th>
                            <th className="pb-2 font-bold text-right w-24">Ilość</th>
                            <th className="pb-2 font-bold text-right w-24">Cena ERP</th>
                            <th className="pb-2 font-bold text-right w-28">Wartość wsadu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {group.batches.map(b => (
                            <tr key={b.id as string} className="hover:bg-white transition-colors">
                              <td className="py-2 text-stone-600 font-medium">{b.deliveryDate}</td>
                              <td className="py-2 font-black text-indigo-600">{b.batchNumber}</td>
                              <td className="py-2 font-bold text-stone-700">{b.orderNumber}</td>
                              <td className="py-2 text-stone-600">{b.supplier} <span className="text-stone-400 ml-2">{b.dimensions}</span></td>
                              <td className="py-2 text-right font-bold text-stone-800">{b.quantityString}</td>
                              <td className="py-2 text-right text-stone-600">{b.unitPrice && b.unitPrice > 0 ? formatCurrency(b.unitPrice) : '0,00 zł'}</td>
                              <td className="py-2 text-right font-black text-emerald-600">{b.totalValue && b.totalValue > 0 ? formatCurrency(b.totalValue) : '0,00 zł'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}