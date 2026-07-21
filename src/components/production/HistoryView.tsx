import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, serverTimestamp, Timestamp, runTransaction, or, getDocs, getDocFromServer 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { History, ArrowUp, ArrowDown, User as UserIcon, Pencil, X, Search, Save, Trash2, Clock, Filter, Users, Calendar } from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

import { WorkLog, ProductionOrder, ASSORTMENT_CATEGORIES, Employee } from '../../types';
import { handleFirestoreError, OperationType } from '../../utils/firestore-helpers';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';
import { calculateOrderStatus } from '../../utils/orderStatus';
import { cn } from '../../utils/firestore-helpers';

type FilterPeriod = 'this_week' | 'last_week' | 'two_weeks_ago' | 'three_weeks_ago';

// NOWE: Rozszerzamy propsy o employees
export function HistoryView({ isAdmin, orders, employees }: { isAdmin: boolean, orders: ProductionOrder[], employees: Employee[] }) {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);
  
  const [sortField, setSortField] = useState<keyof WorkLog>('endTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // --- STANY FILTRÓW (Strażnik Odczytów) ---
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('this_week');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]); // pusta tablica = wszyscy
  
  // Zmienna przechowująca "zatwierdzone" filtry. Dopóki jest null, nie pobieramy nic z bazy.
  const [appliedFilters, setAppliedFilters] = useState<{ period: FilterPeriod, employeeIds: string[] } | null>(null);

  // Funkcja wyliczająca daty (Od poniedziałku 00:00 do niedzieli 23:59)
  const getPeriodDates = (period: FilterPeriod) => {
    const now = new Date();
    let targetDate = now;
    
    if (period === 'last_week') targetDate = subWeeks(now, 1);
    else if (period === 'two_weeks_ago') targetDate = subWeeks(now, 2);
    else if (period === 'three_weeks_ago') targetDate = subWeeks(now, 3);

    // weekStartsOn: 1 oznacza, że tydzień zaczyna się od Poniedziałku
    const start = startOfWeek(targetDate, { weekStartsOn: 1 });
    const end = endOfWeek(targetDate, { weekStartsOn: 1 });
    return { start, end };
  };

  useEffect(() => {
    // TWARDA BLOKADA: Jeśli filtry nie zostały zatwierdzone, nie robimy odczytów!
    if (!appliedFilters) return;

    setLoading(true);
    const { start, end } = getPeriodDates(appliedFilters.period);

    // Zapytanie do Firebase ograniczone twardo datami (Firewall odczytów)
    const q = query(
      collection(db, 'workLogs'), 
      where('endTime', '>=', Timestamp.fromDate(start)),
      where('endTime', '<=', Timestamp.fromDate(end)),
      orderBy('endTime', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let logsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as WorkLog[];

      // Filtrowanie Hybrydowe (Lokalne): Wycinamy tylko interesujących nas pracowników
      if (appliedFilters.employeeIds.length > 0) {
        logsData = logsData.filter(log => appliedFilters.employeeIds.includes(log.userId));
      }

      setLogs(logsData);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'workLogs');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [appliedFilters]);

  // Obsługa przycisku "Zaznacz/Odznacz wszystkich"
  const toggleAllEmployees = () => {
    if (selectedEmployees.length === employees.length || selectedEmployees.length === 0) {
      setSelectedEmployees(employees.map(e => e.id));
    } else {
      setSelectedEmployees([]); 
    }
  };

  const handleApplyFilters = () => {
    // Jeśli nie wybrano nikogo jawnie, pytamy o potwierdzenie
    if (selectedEmployees.length === 0) {
      if(!window.confirm("Nie wybrałeś żadnego pracownika. Czy chcesz pobrać historię dla WSZYSTKICH pracowników? Może to zużyć więcej odczytów.")) {
        return;
      }
    }
    setAppliedFilters({
      period: filterPeriod,
      employeeIds: selectedEmployees
    });
  };

  const handleSort = (field: keyof WorkLog) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedLogs = [...logs].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (valA instanceof Timestamp) valA = valA.toMillis();
    if (valB instanceof Timestamp) valB = valB.toMillis();
    if (typeof valA === 'string' && typeof valB === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIndicator = ({ field }: { field: keyof WorkLog }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <History size={20} className="text-emerald-600" />
        Historia Meldunków
      </h2>

      {/* --- PANEL FILTRÓW (Strażnik) --- */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
        <div className="flex items-center gap-2 text-stone-800 font-bold border-b border-stone-100 pb-2">
          <Filter size={18} className="text-stone-400" />
          Kryteria wyszukiwania
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Wybór Okresu */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-2">
              <Calendar size={14} /> Okres
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setFilterPeriod('this_week')}
                className={cn("py-3 px-2 rounded-xl text-sm font-bold transition-all border text-center", filterPeriod === 'this_week' ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100")}
              >
                Ten Tydzień
              </button>
              <button 
                onClick={() => setFilterPeriod('last_week')}
                className={cn("py-3 px-2 rounded-xl text-sm font-bold transition-all border text-center", filterPeriod === 'last_week' ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100")}
              >
                Poprzedni Tydzień
              </button>
              <button 
                onClick={() => setFilterPeriod('two_weeks_ago')}
                className={cn("py-3 px-2 rounded-xl text-sm font-bold transition-all border text-center", filterPeriod === 'two_weeks_ago' ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100")}
              >
                2 tyg wstecz
              </button>
              <button 
                onClick={() => setFilterPeriod('three_weeks_ago')}
                className={cn("py-3 px-2 rounded-xl text-sm font-bold transition-all border text-center", filterPeriod === 'three_weeks_ago' ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100")}
              >
                3 tyg wstecz
              </button>
            </div>
            <div className="text-xs text-stone-400 font-medium">
              Zostaną pobrane logi od Poniedziałku do Niedzieli z wybranego okresu.
            </div>
          </div>

          {/* Wybór Pracowników */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-2">
                <Users size={14} /> Pracownicy ({selectedEmployees.length === 0 ? 'Wszyscy' : selectedEmployees.length})
              </label>
              <button onClick={toggleAllEmployees} className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 transition-colors">
                {selectedEmployees.length > 0 ? 'Wyczyść wybór (Wszyscy)' : 'Zaznacz wszystkich'}
              </button>
            </div>
            
            <div className="h-32 overflow-y-auto bg-stone-50 border border-stone-200 rounded-xl p-2 space-y-1">
              {employees.sort((a,b) => a.lastName.localeCompare(b.lastName)).map(emp => {
                const isSelected = selectedEmployees.includes(emp.id);
                return (
                  <label key={emp.id} className={cn("flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors", isSelected ? "bg-emerald-100/50" : "hover:bg-stone-100")}>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => {
                        setSelectedEmployees(prev => 
                          isSelected ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                        )
                      }}
                      className="w-4 h-4 text-emerald-600 rounded border-stone-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-stone-700">{emp.lastName} {emp.firstName}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-stone-100 flex justify-end">
          <button 
            onClick={handleApplyFilters}
            className="px-8 py-3 bg-stone-900 text-white font-bold rounded-xl hover:bg-stone-800 transition-all shadow-lg active:scale-95 flex items-center gap-2"
          >
            <Search size={18} />
            Pobierz Historię
          </button>
        </div>
      </div>
      {/* --- KONIEC PANELU FILTRÓW --- */}

      {/* --- TABELA HISTORII --- */}
      {!appliedFilters ? (
        <div className="bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl p-12 text-center text-stone-400">
          <Filter size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium text-lg text-stone-500">Oczekuję na parametry wyszukiwania.</p>
          <p className="text-sm mt-2">Wybierz okres i pracowników, a następnie kliknij "Pobierz Historię".</p>
        </div>
      ) : loading ? (
        <div className="p-12 text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <span className="text-stone-500 font-medium">Pobieranie bezpiecznej paczki danych...</span>
        </div>
      ) : sortedLogs.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-3xl p-12 text-center text-stone-400">
          <p>Brak meldunków dla wybranych kryteriów.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors" onClick={() => handleSort('userName')}>
                    Pracownik <SortIndicator field="userName" />
                  </th>
                  <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors" onClick={() => handleSort('orderNumber')}>
                    Zlecenie <SortIndicator field="orderNumber" />
                  </th>
                  <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors" onClick={() => handleSort('assortmentCategory')}>
                    Kategoria <SortIndicator field="assortmentCategory" />
                  </th>
                  {/* NOWA KOLUMNA: Typ Meldunku */}
                  <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors" onClick={() => handleSort('manual')}>
                    Typ <SortIndicator field="manual" />
                  </th>
                  <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors" onClick={() => handleSort('startTime')}>
                    Data <SortIndicator field="startTime" />
                  </th>
                  <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors" onClick={() => handleSort('duration')}>
                    Czas <SortIndicator field="duration" />
                  </th>
                  <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors" onClick={() => handleSort('quantityReported')}>
                    Ilość <SortIndicator field="quantityReported" />
                  </th>
                  {isAdmin && <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 text-right">Akcje</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sortedLogs.map(log => (
                  <tr key={log.id} className="hover:bg-stone-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-500"><UserIcon size={14} /></div>
                        <span className="font-medium">{log.userName}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        {log.orderNumber ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-black text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">ZP: {log.orderNumber}</span>
                            {log.elementName && <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">EL: {log.elementName}</span>}
                          </div>
                        ) : <span className="text-xs text-stone-400 italic">Brak</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      {log.assortmentCategory ? <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">{log.assortmentCategory}</span> : <span className="text-xs text-stone-400 italic">Brak</span>}
                    </td>
                    {/* NOWA KOMÓRKA: Flaga Ręczny / Hala */}
                    <td className="p-4">
                      {log.manual ? (
                        <span className="px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">Ręczny</span>
                      ) : (
                        <span className="px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-wider bg-stone-100 text-stone-600 border border-stone-200">Hala</span>
                      )}
                    </td>
                    <td className="p-4 text-stone-500 text-sm">
                      {log.startTime && format(log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime), 'dd.MM.yyyy HH:mm')}
                    </td>
                    <td className="p-4 font-mono text-sm">
                      {Math.floor(log.duration / 60)} min {log.duration % 60}s
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-sm whitespace-nowrap">
                        +{typeof log.quantityReported === 'number' ? log.quantityReported.toLocaleString('pl-PL', { maximumFractionDigits: 3 }) : log.quantityReported} szt.
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="p-4 text-right">
                        <button onClick={() => setEditingLog(log)} className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Edytuj"><Pencil size={16} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {editingLog && <EditLogModal log={editingLog} orders={orders} onClose={() => setEditingLog(null)} />}
      </AnimatePresence>
    </div>
  );
}

// --- MODAL EDYCJI (Bez zmian w stosunku do naszej wcześniejszej optymalizacji transakcyjnej) ---
const formatDateForInput = (dateVal: any) => {
  if (!dateVal) return '';
  const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

function EditLogModal({ log, orders, onClose }: { log: WorkLog, orders: ProductionOrder[], onClose: () => void }) {
  const [quantity, setQuantity] = useState(log.quantityReported);
  const [category, setCategory] = useState(log.assortmentCategory || '');
  const [selectedOrderId, setSelectedOrderId] = useState(log.orderId || '');
  const [selectedElementId, setSelectedElementId] = useState(log.elementId || '');
  const [isManual, setIsManual] = useState(log.manual ?? false);
  
  const [startTimeStr, setStartTimeStr] = useState(formatDateForInput(log.startTime));
  const [endTimeStr, setEndTimeStr] = useState(formatDateForInput(log.endTime));

  const [orderSearch, setOrderSearch] = useState('');
  const [showOrderList, setShowOrderList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // DODANO: Hybrydowe wyszukiwanie w archiwum (dla edycji)
  const [archivedOrders, setArchivedOrders] = useState<ProductionOrder[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);

  const availableOrders = [...orders, ...archivedOrders];
  const selectedOrder = availableOrders.find(o => o.id === selectedOrderId);
  const selectedOrderElements = selectedOrder?.elements || [];

  // Efekt do dociągnięcia bieżącego zlecenia jeśli jest complete
  useEffect(() => {
    const fetchCurrentOrderIfMissing = async () => {
      if (log.orderId && !orders.find(o => o.id === log.orderId)) {
        setIsSearchingArchive(true);
        try {
          const docRef = doc(db, 'orders', log.orderId);
          const snap = await getDocFromServer(docRef);
          if (snap.exists()) {
            setArchivedOrders([{ ...snap.data(), id: snap.id } as ProductionOrder]);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setIsSearchingArchive(false);
        }
      }
    };
    fetchCurrentOrderIfMissing();
  }, [log.orderId, orders]);

  const handleOrderSearch = async (term: string) => {
    if (term.length === 6) {
      setIsSearchingArchive(true);
      try {
        const q = query(
          collection(db, 'orders'),
          or(
            where('orderNumber', '==', term),
            where('erpOrderNumber', '==', term)
          )
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const found = snap.docs.map(d => ({ ...d.data(), id: d.id })) as ProductionOrder[];
          const news = found.filter(f => !orders.find(o => o.id === f.id));
          setArchivedOrders(prev => {
            const combined = [...prev, ...news];
            return Array.from(new Map(combined.map(item => [item.id, item])).values());
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingArchive(false);
      }
    }
  };

  const filteredOrders = availableOrders.filter(o => {
    const terms = parseSearchTerms(orderSearch);
    if (terms.length === 0) return true;
    const searchableText = `${o.orderNumber} ${o.erpOrderNumber || ''} ${o.productName} ${o.projectNumber || ''} ${o.articleNumber || ''} ${o.clientName || ''}`;
    return matchesAllTerms(searchableText, terms);
  }).slice(0, 5);

  const previewDurationHours = () => {
    if (!startTimeStr || !endTimeStr) return 0;
    const s = new Date(startTimeStr).getTime();
    const e = new Date(endTimeStr).getTime();
    if (e < s) return 0;
    return ((e - s) / 3600000).toFixed(1);
  };

  const handleSave = async () => {
    const start = new Date(startTimeStr);
    const end = endTimeStr ? new Date(endTimeStr) : null;
    const safeQuantity = isNaN(Number(quantity)) ? 0 : Number(quantity);

    if (isNaN(start.getTime())) {
      alert("Proszę wprowadzić poprawny czas rozpoczęcia.");
      return;
    }
    if (end && isNaN(end.getTime())) {
      alert("Wprowadzony czas zakończenia jest niepoprawny.");
      return;
    }
    if (end && end < start) {
      alert("Błąd: Czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia!");
      return;
    }

    const durationSecs = end ? Math.floor((end.getTime() - start.getTime()) / 1000) : (log.duration || 0);
    setIsSaving(true);

    try {
      await runTransaction(db, async (transaction) => {
        const logRef = doc(db, 'workLogs', log.id);
        const logSnap = await transaction.get(logRef);
        if (!logSnap.exists()) throw new Error("Ten meldunek został już usunięty.");

        const oldOrderId = logSnap.data().orderId;
        const oldElementId = logSnap.data().elementId;
        const oldQty = logSnap.data().quantityReported || 0;
        
        const newOrderId = selectedOrderId;
        const newElementId = selectedElementId;
        let orderNameForLog = selectedOrder?.orderNumber || null;
        let elementNameForLog = null;
        
        if (newOrderId && newElementId && selectedOrder) {
          const el = selectedOrder.elements?.find(e => e.id === newElementId);
          if (el) elementNameForLog = el.name;
        }

        // PHASE 1: READS
        let oldOrderSnap: any = null;
        let newOrderSnap: any = null;
        let sameOrderSnap: any = null;

        if (oldOrderId !== newOrderId || oldElementId !== newElementId) {
          if (oldOrderId) {
            oldOrderSnap = await transaction.get(doc(db, 'orders', oldOrderId));
          }
          if (newOrderId) {
            newOrderSnap = await transaction.get(doc(db, 'orders', newOrderId));
          }
        } else if (oldOrderId && oldOrderId === newOrderId && oldElementId === newElementId) {
          sameOrderSnap = await transaction.get(doc(db, 'orders', oldOrderId));
        }

        // PHASE 2: WRITES
        const updateOrderAndElementQty = (orderId: string, elementId: string | undefined, deltaQty: number, snapToUse: any) => {
          if (!orderId || !snapToUse || !snapToUse.exists()) return null;
          const orderRef = doc(db, 'orders', orderId);
          const data = snapToUse.data();
          const newAppQty = Math.max(0, (data.appReportedQuantity || 0) + deltaQty);
          let newStatus = data.status; // fallback
          if (data.targetQuantity !== undefined) {
             newStatus = calculateOrderStatus(data.erpReportedQuantity || 0, newAppQty, data.targetQuantity);
          }
          
          let updatedElements = data.elements || [];
          if (elementId && updatedElements.length > 0) {
            updatedElements = updatedElements.map((el: any) => {
              if (el.id === elementId) {
                return { ...el, reportedQuantity: Math.max(0, (el.reportedQuantity || 0) + deltaQty) };
              }
              return el;
            });
          }
          
          transaction.update(orderRef, { 
            appReportedQuantity: newAppQty, 
            status: newStatus,
            elements: updatedElements
          });
          return data;
        };

        if (oldOrderId !== newOrderId || oldElementId !== newElementId) {
          if (oldOrderId) updateOrderAndElementQty(oldOrderId, oldElementId, -oldQty, oldOrderSnap);
          if (newOrderId) {
            const newOrderData = updateOrderAndElementQty(newOrderId, newElementId, safeQuantity, newOrderSnap);
            if (newOrderData) orderNameForLog = newOrderData.orderNumber;
          }
        } else if (oldOrderId && oldOrderId === newOrderId && oldElementId === newElementId) {
          const delta = safeQuantity - oldQty;
          const orderData = updateOrderAndElementQty(oldOrderId, oldElementId, delta, sameOrderSnap);
          if (orderData) orderNameForLog = orderData.orderNumber;
        }

        transaction.update(logRef, {
          quantityReported: safeQuantity,
          assortmentCategory: category || null,
          orderId: newOrderId || null,
          orderNumber: orderNameForLog,
          elementId: newElementId || null,
          elementName: elementNameForLog,
          startTime: Timestamp.fromDate(start),
          endTime: end ? Timestamp.fromDate(end) : null,
          duration: durationSecs,
          manual: isManual,
          lastModifiedAt: serverTimestamp()
        });
      });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'workLogs_transaction');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const logRef = doc(db, 'workLogs', log.id);
        const logSnap = await transaction.get(logRef);
        if (!logSnap.exists()) return; 
        
        const logData = logSnap.data();
        
        // READ PHASE
        let orderSnap: any = null;
        if (logData.orderId) {
          orderSnap = await transaction.get(doc(db, 'orders', logData.orderId));
        }

        // WRITE PHASE
        if (logData.orderId && orderSnap && orderSnap.exists()) {
          const orderRef = doc(db, 'orders', logData.orderId);
          const orderData = orderSnap.data();
          const qtyToSubtract = logData.quantityReported || 0;
          const newAppQty = Math.max(0, (orderData.appReportedQuantity || 0) - qtyToSubtract);
          const newStatus = calculateOrderStatus(orderData.erpReportedQuantity || 0, newAppQty, orderData.targetQuantity);
          
          let updatedElements = orderData.elements || [];
          if (logData.elementId && updatedElements.length > 0) {
            updatedElements = updatedElements.map((el: any) => {
              if (el.id === logData.elementId) {
                return { ...el, reportedQuantity: Math.max(0, (el.reportedQuantity || 0) - qtyToSubtract) };
              }
              return el;
            });
          }

          transaction.update(orderRef, { 
            appReportedQuantity: newAppQty, 
            status: newStatus,
            elements: updatedElements
          });
        }
        transaction.delete(logRef);
      });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'workLogs_transaction');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm my-8 flex flex-col"
      >
        <div className="p-4 border-b border-stone-100 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-stone-800">Edytuj Meldunek</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 text-stone-500 rounded-full transition-colors"><X size={18} /></button>
        </div>
        
        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Pracownik */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Pracownik</label>
            <div className="p-2 px-3 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 font-medium text-sm">{log.userName}</div>
          </div>

          {/* Edycja czasu */}
          <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-3">
            <div className="flex items-center gap-1.5 mb-1 text-emerald-800">
              <Clock size={14} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Czas pracy</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Rozpoczęcie</label>
                <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} className="w-full p-1.5 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Zakończenie</label>
                <input type="datetime-local" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="w-full p-1.5 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" />
              </div>
            </div>
            <div className="text-right text-[10px] font-black text-emerald-700 pt-1 border-t border-emerald-200/50">Obecny czas trwania: <span className="text-emerald-900">{previewDurationHours()}h</span></div>
          </div>

          {/* Zlecenie */}
          <div className="p-3 bg-indigo-50/30 border border-indigo-100/50 rounded-xl space-y-3">
            <div className="space-y-1 relative">
              <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Zlecenie</label>
              {selectedOrderId ? (
                <div className="flex items-center justify-between p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <div className="flex flex-col overflow-hidden max-w-[85%]">
                    <span className="text-xs font-bold text-indigo-800">{selectedOrder?.orderNumber}</span>
                    <span className="text-[9px] text-indigo-600 truncate">{selectedOrder?.productName}</span>
                  </div>
                  <button onClick={() => { setSelectedOrderId(''); setSelectedElementId(''); setOrderSearch(''); }} className="p-1 hover:bg-indigo-200 rounded-md text-indigo-700 shrink-0"><X size={12} /></button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input type="text" placeholder={isSearchingArchive ? "Szukanie w archiwum..." : "Szukaj zlecenia (6 cyfr)..."} value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setShowOrderList(true); handleOrderSearch(e.target.value); }} onFocus={() => setShowOrderList(true)} className="w-full pl-8 pr-3 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs" />
                  </div>
                  {showOrderList && orderSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      {filteredOrders.length > 0 ? filteredOrders.map(o => (
                        <button key={o.id} onClick={() => { setSelectedOrderId(o.id); setSelectedElementId(''); setShowOrderList(false); }} className="w-full p-2 text-left hover:bg-stone-50 flex flex-col border-b border-stone-50 last:border-0">
                          <span className="text-xs font-bold text-stone-900">{o.orderNumber} {o.status === 'completed' && '(ZAKOŃCZONE)'}</span>
                          <span className="text-[9px] text-stone-500 truncate">{o.productName}</span>
                        </button>
                      )) : <div className="p-2 text-[10px] text-stone-400 italic">Nie znaleziono zleceń. Wpisz dokładnie 6 cyfr nr ZP by szukać w archiwalnych.</div>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Element (Tylko jeśli wybrane zlecenie) */}
            {selectedOrderId && selectedOrderElements.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Część / Element</label>
                <select 
                  value={selectedElementId} 
                  onChange={(e) => setSelectedElementId(e.target.value)} 
                  className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs font-medium text-stone-700"
                >
                  <option value="">-- Całe zlecenie (Praca ogólna) --</option>
                  {selectedOrderElements.map((el: any) => (
                    <option key={el.id} value={el.id}>{el.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Kategoria */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Kategoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-500/20 text-xs font-bold">
                <option value="">Brak</option>
                {ASSORTMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            {/* Ilość */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Ilość (szt.)</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-500/20 font-bold text-xs" />
            </div>
          </div>

          {/* Typ Meldunku */}
          <div className="space-y-1 pt-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Rejestracja</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsManual(false)} 
                className={`flex-1 p-2 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all border ${!isManual ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-white'}`}
              >
                Hala
              </button>
              <button 
                onClick={() => setIsManual(true)} 
                className={`flex-1 p-2 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all border ${isManual ? 'bg-amber-50 border-amber-200 text-amber-800 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-white'}`}
              >
                Ręczny
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-stone-50 flex gap-2 shrink-0 border-t border-stone-100 rounded-b-2xl">
          {showDeleteConfirm ? (
            <div className="flex-1 flex gap-2 bg-red-50 p-2 rounded-xl border border-red-100">
              <button onClick={handleDelete} disabled={isSaving} className="flex-[2] py-2 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 transition-all">Usuń trwale</button>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isSaving} className="flex-1 py-2 bg-white text-stone-500 border border-stone-200 rounded-lg font-bold text-xs hover:bg-stone-50 transition-all">Anuluj</button>
            </div>
          ) : (
            <>
              <button onClick={() => setShowDeleteConfirm(true)} disabled={isSaving} className="flex-1 py-2 bg-white text-red-600 border border-red-200 rounded-lg font-bold text-xs hover:bg-red-50 transition-all flex items-center justify-center gap-1.5">
                <Trash2 size={14} /> Usuń
              </button>
              <button onClick={handleSave} disabled={isSaving} className="flex-[2.5] py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-500 transition-all shadow-md shadow-emerald-900/10 flex items-center justify-center gap-1.5">
                {isSaving ? 'Zapisywanie...' : <><Save size={14} /> Zapisz zmiany</>}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}