import React, { useState, useEffect } from 'react';
import { X, Clock, User as UserIcon, Package, ArrowUp, ArrowDown, Pencil, Save, Trash2, Search, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, Timestamp, doc, runTransaction, serverTimestamp, or, getDocFromServer } from 'firebase/firestore';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

import { db } from '../../firebase';
import { ProductionOrder, WorkLog, ASSORTMENT_CATEGORIES } from '../../types';
import { cn, handleFirestoreError, OperationType } from '../../utils/firestore-helpers';
import { calculateOrderStatus } from '../../utils/orderStatus';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';

interface OrderLogsViewProps {
  order: ProductionOrder;
  orders: ProductionOrder[]; // Potrzebne do modala edycji
  onClose: () => void;
}

export function OrderLogsView({ order, orders, onClose }: OrderLogsViewProps) {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);

  const [sortField, setSortField] = useState<keyof WorkLog>('endTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const q = query(collection(db, 'workLogs'), where('orderId', '==', order.id));
        const snapshot = await getDocs(q);
        
        const fetchedLogs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as WorkLog[];

        setLogs(fetchedLogs);
      } catch (error) {
        console.error("Błąd podczas pobierania meldunków:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [order.id, editingLog]); // Odśwież po zamknięciu edycji

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

  // --- MATEMATYKA: Wkład procentowy w zlecenie/element ---
  const calculateContribution = (log: WorkLog) => {
    const qty = log.quantityReported || 0;
    if (qty === 0) return { pct: 0, targetLabel: 'Zlecenia', weightedIncrement: 0 };

    let target = order.targetQuantity || 1;
    let targetLabel = 'Zlecenia';
    let weightedIncrement = qty;

    if (log.elementId && order.elements && order.elements.length > 0) {
      const element = order.elements.find(e => e.id === log.elementId);
      if (element) {
        const totalWeightPerUnit = order.elements.reduce((sum, el) => sum + (el.weight || 0), 0);
        if (totalWeightPerUnit > 0) {
          weightedIncrement = qty * (element.weight / totalWeightPerUnit);
        }
        targetLabel = 'Całego Zlecenia (Wagowo)';
      }
    }

    const pct = (weightedIncrement / target) * 100;
    return { pct, targetLabel, weightedIncrement };
  };

  const getLogDate = (val: any) => {
    if (!val) return new Date();
    return val instanceof Timestamp ? val.toDate() : new Date(val);
  };

  return (
    // Zamiast małego modala, tworzymy widok pełnoekranowy (fixed inset-0)
    <div className="fixed inset-0 z-50 bg-stone-50 overflow-y-auto flex flex-col">
      {/* Header przypominający osobną podstronę */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-10 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 bg-stone-100 text-stone-600 hover:bg-stone-200 rounded-xl transition-all flex items-center gap-2 font-bold text-sm">
            <ChevronLeft size={18} /> Wróć do Zleceń
          </button>
          <div className="w-px h-8 bg-stone-200 mx-2" />
          <div>
            <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
              <Clock className="text-emerald-600" size={24} />
              Analiza Meldunków: {order.orderNumber}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5 font-medium">{order.productName}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full p-6 flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-stone-500 font-medium">Pobieranie historii meldunków z bazy...</p>
          </div>
        ) : sortedLogs.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-20 text-center text-stone-400 mt-10">
            <Clock size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium text-lg">Brak zapisanych meldunków dla tego zlecenia.</p>
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
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors" onClick={() => handleSort('elementName')}>
                      Część <SortIndicator field="elementName" />
                    </th>
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
                      Wkład <SortIndicator field="quantityReported" />
                    </th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sortedLogs.map(log => {
                    const contribution = calculateContribution(log);
                    const isOngoing = !log.endTime;

                    return (
                      <tr key={log.id} className={cn("hover:bg-stone-50 transition-colors", isOngoing && "bg-emerald-50/30")}>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-500"><UserIcon size={14} /></div>
                            <span className="font-medium text-stone-900">{log.userName}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            {log.elementName ? (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 inline-block w-max max-w-[200px] truncate">EL: {log.elementName}</span>
                            ) : (
                              <span className="text-[10px] font-black text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200 inline-block w-max">CAŁE ZLECENIE</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          {log.manual ? (
                            <span className="px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">Ręczny</span>
                          ) : (
                            <span className="px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">Hala</span>
                          )}
                        </td>
                        <td className="p-4 text-stone-500 text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium text-stone-700">{format(getLogDate(log.startTime), 'dd.MM.yyyy')}</span>
                            <span className="text-xs">
                              {format(getLogDate(log.startTime), 'HH:mm')} - {isOngoing ? 'W toku' : format(getLogDate(log.endTime), 'HH:mm')}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-sm font-medium">
                          {isOngoing ? (
                            <span className="text-emerald-600 animate-pulse">Trwa...</span>
                          ) : (
                            `${Math.floor(log.duration / 60)} min ${log.duration % 60}s`
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-black text-emerald-700 text-sm">
                              +{typeof log.quantityReported === 'number' ? log.quantityReported.toLocaleString('pl-PL', { maximumFractionDigits: 3 }) : 0} szt. {log.elementId && '(Detalu)'}
                            </span>
                            {!isOngoing && (
                              <span className="text-[10px] text-stone-400 font-medium whitespace-nowrap">
                                Wkład: <span className="text-emerald-600 font-bold">+{contribution.weightedIncrement.toLocaleString('pl-PL', { maximumFractionDigits: 3 })}</span> (eq)
                                <br/>
                                = {contribution.pct.toFixed(2)}% <span className="lowercase">{contribution.targetLabel}</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button onClick={() => setEditingLog(log)} className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Edytuj">
                            <Pencil size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingLog && <EditLogModal log={editingLog} orders={orders} onClose={() => setEditingLog(null)} />}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// KOMPONENT WEWNĘTRZNY: MODAL EDYCJI MELDUNKU
// ============================================================================

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
  const [isManual, setIsManual] = useState(log.manual ?? false);
  
  const [startTimeStr, setStartTimeStr] = useState(formatDateForInput(log.startTime));
  const [endTimeStr, setEndTimeStr] = useState(formatDateForInput(log.endTime));

  const [orderSearch, setOrderSearch] = useState('');
  const [showOrderList, setShowOrderList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [archivedOrders, setArchivedOrders] = useState<ProductionOrder[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);

  const availableOrders = [...orders, ...archivedOrders];
  const selectedOrder = availableOrders.find(o => o.id === selectedOrderId);

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
          or(where('orderNumber', '==', term), where('erpOrderNumber', '==', term))
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
    const searchableText = `${o.orderNumber} ${o.erpOrderNumber || ''} ${o.productName} ${o.projectNumber || ''}`;
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
    const end = new Date(endTimeStr);
    const safeQuantity = isNaN(Number(quantity)) ? 0 : Number(quantity);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      alert("Proszę wprowadzić poprawny czas rozpoczęcia i zakończenia.");
      return;
    }
    if (end < start) {
      alert("Błąd: Czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia!");
      return;
    }

    const durationSecs = Math.floor((end.getTime() - start.getTime()) / 1000);
    setIsSaving(true);

    try {
      await runTransaction(db, async (transaction) => {
        const logRef = doc(db, 'workLogs', log.id);
        const logSnap = await transaction.get(logRef);
        if (!logSnap.exists()) throw new Error("Meldunek usunięty.");

        const oldOrderId = logSnap.data().orderId;
        const oldQty = logSnap.data().quantityReported || 0;
        const newOrderId = selectedOrderId;
        let orderNameForLog = selectedOrder?.orderNumber || null;

        if (oldOrderId !== newOrderId) {
          if (oldOrderId) {
            const oldOrderRef = doc(db, 'orders', oldOrderId);
            const oldOrderSnap = await transaction.get(oldOrderRef);
            if (oldOrderSnap.exists()) {
              const oldData = oldOrderSnap.data();
              const newAppQty = Math.max(0, (oldData.appReportedQuantity || 0) - oldQty);
              const newStatus = calculateOrderStatus(oldData.erpReportedQuantity || 0, newAppQty, oldData.targetQuantity);
              transaction.update(oldOrderRef, { appReportedQuantity: newAppQty, status: newStatus });
            }
          }
          if (newOrderId) {
            const newOrderRef = doc(db, 'orders', newOrderId);
            const newOrderSnap = await transaction.get(newOrderRef);
            if (newOrderSnap.exists()) {
              const newData = newOrderSnap.data();
              orderNameForLog = newData.orderNumber;
              const newAppQty = Math.max(0, (newData.appReportedQuantity || 0) + safeQuantity);
              const newStatus = calculateOrderStatus(newData.erpReportedQuantity || 0, newAppQty, newData.targetQuantity);
              transaction.update(newOrderRef, { appReportedQuantity: newAppQty, status: newStatus });
            }
          }
        } else if (oldOrderId && oldOrderId === newOrderId) {
          const orderRef = doc(db, 'orders', oldOrderId);
          const orderSnap = await transaction.get(orderRef);
          if (orderSnap.exists()) {
            const data = orderSnap.data();
            orderNameForLog = data.orderNumber;
            const delta = safeQuantity - oldQty;
            const newAppQty = Math.max(0, (data.appReportedQuantity || 0) + delta);
            const newStatus = calculateOrderStatus(data.erpReportedQuantity || 0, newAppQty, data.targetQuantity);
            transaction.update(orderRef, { appReportedQuantity: newAppQty, status: newStatus });
          }
        }

        transaction.update(logRef, {
          quantityReported: safeQuantity,
          assortmentCategory: category || null,
          orderId: newOrderId || null,
          orderNumber: orderNameForLog,
          startTime: Timestamp.fromDate(start),
          endTime: Timestamp.fromDate(end),
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
        if (logData.orderId) {
          const orderRef = doc(db, 'orders', logData.orderId);
          const orderSnap = await transaction.get(orderRef);
          if (orderSnap.exists()) {
            const orderData = orderSnap.data();
            const qtyToSubtract = logData.quantityReported || 0;
            const newAppQty = Math.max(0, (orderData.appReportedQuantity || 0) - qtyToSubtract);
            const newStatus = calculateOrderStatus(orderData.erpReportedQuantity || 0, newAppQty, orderData.targetQuantity);
            transaction.update(orderRef, { appReportedQuantity: newAppQty, status: newStatus });
          }
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-8 flex flex-col border border-stone-200"
      >
        <div className="p-6 border-b border-stone-100 flex justify-between items-center shrink-0 bg-stone-50 rounded-t-3xl">
          <h3 className="text-xl font-bold flex items-center gap-2"><Pencil size={20} className="text-emerald-600"/> Edytuj Meldunek</h3>
          <button onClick={onClose} className="p-2 bg-white hover:bg-stone-200 border border-stone-200 rounded-full transition-colors shadow-sm"><X size={16} /></button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Pracownik */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Pracownik</label>
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-600 font-medium">{log.userName}</div>
          </div>

          {/* Edycja czasu */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 mb-2 text-emerald-800">
              <Clock size={16} />
              <span className="text-sm font-bold uppercase tracking-widest">Czas pracy</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Rozpoczęcie</label>
                <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Zakończenie</label>
                <input type="datetime-local" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
              </div>
            </div>
            <div className="text-right text-xs font-black text-emerald-700">Obecny czas trwania: {previewDurationHours()}h</div>
          </div>

          {/* Zlecenie */}
          <div className="space-y-2 relative">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Zlecenie</label>
            {selectedOrderId ? (
              <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-emerald-700">{selectedOrder?.orderNumber}</span>
                  <span className="text-[10px] text-emerald-600 truncate max-w-[200px]">{selectedOrder?.productName}</span>
                </div>
                <button onClick={() => { setSelectedOrderId(''); setOrderSearch(''); }} className="p-1 hover:bg-emerald-100 rounded-full text-emerald-600"><X size={14} /></button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type="text" placeholder={isSearchingArchive ? "Szukanie w archiwum..." : "Szukaj zlecenia (6 cyfr = archiwum)..."} value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setShowOrderList(true); handleOrderSearch(e.target.value); }} onFocus={() => setShowOrderList(true)} className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                {showOrderList && orderSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden">
                    {filteredOrders.length > 0 ? filteredOrders.map(o => (
                      <button key={o.id} onClick={() => { setSelectedOrderId(o.id); setShowOrderList(false); }} className="w-full p-3 text-left hover:bg-stone-50 flex flex-col border-b border-stone-50 last:border-0">
                        <span className="text-xs font-bold text-stone-900">{o.orderNumber} {o.status === 'completed' && '(ZAKOŃCZONE)'}</span>
                        <span className="text-[10px] text-stone-500 truncate">{o.productName}</span>
                      </button>
                    )) : <div className="p-3 text-xs text-stone-400 italic">Nie znaleziono zleceń</div>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Kategoria */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Kategoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
              <option value="">Wybierz kategorię...</option>
              {ASSORTMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {/* Ilość */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Ilość (szt.)</label>
            <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold" />
          </div>

          {/* Typ Meldunku */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Typ meldunku</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsManual(false)} 
                className={`flex-1 p-3 rounded-xl font-bold text-sm transition-all border ${!isManual ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}
              >
                Hala
              </button>
              <button 
                onClick={() => setIsManual(true)} 
                className={`flex-1 p-3 rounded-xl font-bold text-sm transition-all border ${isManual ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}
              >
                Ręczny
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 bg-stone-50 flex gap-3 shrink-0 border-t border-stone-100 rounded-b-3xl">
          {showDeleteConfirm ? (
            <div className="flex-1 flex gap-2 bg-red-50 p-2 rounded-xl border border-red-100">
              <button onClick={handleDelete} disabled={isSaving} className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 transition-all">Tak, usuń</button>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isSaving} className="flex-1 py-2 bg-white text-stone-500 border border-stone-200 rounded-lg font-bold text-xs hover:bg-stone-50 transition-all">Anuluj</button>
            </div>
          ) : (
            <button onClick={() => setShowDeleteConfirm(true)} disabled={isSaving} className="flex-1 py-3 bg-white text-red-600 border border-red-100 rounded-xl font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2">
              <Trash2 size={18} /> Usuń
            </button>
          )}
          <button onClick={handleSave} disabled={isSaving} className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
            {isSaving ? 'Zapisywanie...' : <><Save size={18} /> Zapisz zmiany</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}