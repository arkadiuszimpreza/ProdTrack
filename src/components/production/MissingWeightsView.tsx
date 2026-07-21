import React, { useState, useMemo, useEffect } from 'react';
import { ProductionOrder, OrderElement } from '../../types';
import { Weight, Search, CheckCircle2, AlertTriangle, List, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebase';

interface MissingWeightsViewProps {
  orders: ProductionOrder[];
  onEditElements: (order: ProductionOrder) => void;
}

export function MissingWeightsView({ orders, onEditElements }: MissingWeightsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterReportedOnly, setFilterReportedOnly] = useState(false);
  
  // Przechowujemy zlecenia, które faktycznie mają chociaż jeden meldunek w workLogs
  const [ordersWithLogs, setOrdersWithLogs] = useState<Set<string>>(new Set());

  // Najpierw filtrujemy zlecenia, które mają braki w wagach i nie są z kategorii Inne
  const baseFilteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Pomiń "Inne"
      if (order.assortmentCategory?.toLowerCase() === 'inne') return false;

      // 2. Szukaj braków wagi:
      // a) Brak całkowitej wagi zlecenia (dla zleceń bez elementów lub z pustą tablicą)
      const hasNoElements = !order.elements || order.elements.length === 0;
      const isMissingTotalWeight = hasNoElements && (!order.totalWeight || order.totalWeight === 0);

      // b) Elementy z wagą == 1 kg (lub puste)
      const hasMissingElementWeights = order.elements && order.elements.length > 0 && order.elements.some(el => !el.weight || el.weight === 1);

      return isMissingTotalWeight || hasMissingElementWeights;
    });
  }, [orders]);

  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Efekt sprawdzający w tle, które z bazowych zleceń mają meldunki
  useEffect(() => {
    let isMounted = true;

    const checkLogs = async () => {
      if (isMounted) setIsLoadingLogs(true);
      const withLogs = new Set<string>();
      
      // Sprawdzamy tylko dla tych, które mają braki (optymalizacja zapytań)
      // Żeby nie przekroczyć limitów wykonujemy to w małych paczkach lub pojedynczo (dla niewielu zleceń)
      for (const order of baseFilteredOrders) {
        if (!isMounted) break;
        
        // Optymalizacja: jeśli appReportedQuantity > 0, wiemy na 100%, że są meldunki z hali
        if ((order.appReportedQuantity || 0) > 0) {
          withLogs.add(order.id);
          continue;
        }

        try {
          // Szukamy jakiegokolwiek logu (meldunku) dla tego zlecenia
          const q = query(
            collection(db, 'workLogs'), 
            where('orderId', '==', order.id),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            withLogs.add(order.id);
          }
        } catch (e) {
          console.error(`Błąd podczas pobierania logów dla ${order.id}:`, e);
        }
      }

      if (isMounted) {
        setOrdersWithLogs(withLogs);
        setIsLoadingLogs(false);
      }
    };

    if (baseFilteredOrders.length > 0) {
      checkLogs();
    }

    return () => {
      isMounted = false;
    };
  }, [baseFilteredOrders]);

  // Końcowe filtrowanie (wyszukiwarka + filtr "Tylko zameldowane")
  const finalOrders = useMemo(() => {
    return baseFilteredOrders.filter(order => {
      // 3. Dodatkowy filtr: tylko z meldunkami z hali (czyli istnieje chociaż jeden workLog)
      if (filterReportedOnly && !ordersWithLogs.has(order.id)) {
        return false;
      }

      // 4. Wyszukiwarka tekstowa
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = (
          order.orderNumber.toLowerCase().includes(term) ||
          (order.erpOrderNumber?.toLowerCase().includes(term)) ||
          order.productName.toLowerCase().includes(term)
        );
        if (!matches) return false;
      }

      return true;
    });
  }, [baseFilteredOrders, filterReportedOnly, ordersWithLogs, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <h1 className="text-xl font-black text-stone-800 tracking-tight flex items-center gap-2">
          <Weight className="text-emerald-600" />
          Uzupełnianie Wag
          <span className="text-sm font-medium text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
            {finalOrders.length}
          </span>
        </h1>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <input 
              type="text" 
              placeholder="Szukaj zlecenia..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium" 
            />
          </div>

          <button
            onClick={() => setFilterReportedOnly(!filterReportedOnly)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all",
              filterReportedOnly 
                ? "bg-stone-900 text-white border-stone-900 shadow-sm" 
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
            )}
          >
            {isLoadingLogs ? (
              <Loader2 size={16} className="animate-spin text-emerald-500" />
            ) : filterReportedOnly ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            {isLoadingLogs ? "Przetwarzanie..." : "Tylko zameldowane"}
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {finalOrders.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-16 text-center text-stone-400">
            <Weight size={48} className="mx-auto mb-4 opacity-20 text-stone-900" />
            <p className="font-medium text-stone-500">Brak zleceń wymagających uzupełnienia wagi.</p>
          </div>
        ) : (
          finalOrders.map(order => {
            const hasNoElements = !order.elements || order.elements.length === 0;
            const elementsNeedingWeight = (order.elements || []).filter(el => !el.weight || el.weight === 1);

            return (
              <div key={order.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col md:flex-row">
                <div className="p-4 md:w-1/3 border-b md:border-b-0 md:border-r border-stone-100 bg-stone-50/50">
                  <div className="flex gap-2 items-center mb-1">
                    <span className="font-bold text-lg">{order.orderNumber}</span>
                    {order.erpOrderNumber && (
                      <span className="text-xs bg-stone-200 text-stone-600 px-2 py-0.5 rounded-md font-bold">
                        {order.erpOrderNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-stone-700">{order.productName}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg">
                      Cel: {order.targetQuantity} {order.unit || 'szt.'}
                    </span>
                    {((order.appReportedQuantity || 0) > 0 || (order.reportedQuantity || 0) > 0) && (
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-lg">
                        Mel.: {order.appReportedQuantity || order.reportedQuantity}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 flex-1">
                  {hasNoElements ? (
                    <div className="flex items-center justify-between bg-rose-50/50 p-3 rounded-xl border border-rose-100">
                      <div>
                        <p className="text-sm font-bold text-rose-800">Brak całkowitej wagi zlecenia</p>
                        <p className="text-xs text-rose-600">Zlecenie bez elementów, wymaga podania wagi całkowitej.</p>
                      </div>
                      
                      <button 
                        onClick={() => onEditElements(order)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 rounded-xl text-sm font-bold transition-colors"
                      >
                        <List size={14} /> Zarządzaj elementami
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">Elementy do poprawy:</h4>
                      {elementsNeedingWeight.map(el => (
                        <div key={el.id} className="flex items-center justify-between bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                          <div>
                            <p className="text-sm font-bold text-stone-800">{el.name}</p>
                            <p className="text-xs text-amber-700">Obecna waga: {el.weight || 0} kg</p>
                          </div>
                          
                          <button 
                            onClick={() => onEditElements(order)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 rounded-xl text-sm font-bold transition-colors"
                          >
                            <List size={14} /> Zarządzaj elementami
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
