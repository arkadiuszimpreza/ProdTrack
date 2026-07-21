const fs = require('fs');

let content = fs.readFileSync('src/components/production/OrderLogsView.tsx', 'utf8');

// Find the start of EditLogModal
const editStart = content.indexOf('export function EditLogModal');
// Find the start of AddLogModal
const addStart = content.indexOf('export function AddLogModal');

// They should be at the end of the file.
// Let's replace everything from editStart to the end.

const newModals = `export function EditLogModal({ log, orders, onClose }: { log: WorkLog, orders: ProductionOrder[], onClose: () => void }) {
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

  const [archivedOrders, setArchivedOrders] = useState<ProductionOrder[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);

  const availableOrders = [...orders, ...archivedOrders];
  const selectedOrder = availableOrders.find(o => o.id === selectedOrderId);
  const selectedOrderElements = selectedOrder?.elements || [];

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
    const searchableText = \`\${o.orderNumber} \${o.erpOrderNumber || ''} \${o.productName} \${o.projectNumber || ''}\`;
    return matchesAllTerms(searchableText, terms);
  }).slice(0, 5);

  const previewDurationHours = () => {
    if (!startTimeStr || !endTimeStr) return 0;
    const s = new Date(startTimeStr).getTime();
    const e = new Date(endTimeStr).getTime();
    if (e < s) return 0;
    return ((e - s) / 3600000).toFixed(1);
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const logRef = doc(db, 'workLogs', log.id!);
        if (log.orderId) {
          const orderRef = doc(db, 'orders', log.orderId);
          const orderSnap = await transaction.get(orderRef);
          if (orderSnap.exists()) {
            const currentQty = orderSnap.data().appReportedQuantity || 0;
            const newAppQty = Math.max(0, currentQty - (log.quantityReported || 0));
            const newStatus = calculateOrderStatus(orderSnap.data().erpReportedQuantity || 0, newAppQty, orderSnap.data().targetQuantity);
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

    const durationSecs = end ? Math.floor((end.getTime() - start.getTime()) / 1000) : 0;
    setIsSaving(true);

    try {
      await runTransaction(db, async (transaction) => {
        let orderNameForLog = null;
        let elementNameForLog = null;

        if (selectedOrderId && selectedElementId) {
          const el = selectedOrder?.elements?.find(e => e.id === selectedElementId);
          if (el) elementNameForLog = el.name;
        }

        let oldOrderSnap: any = null;
        let newOrderSnap: any = null;

        if (log.orderId) {
          oldOrderSnap = await transaction.get(doc(db, 'orders', log.orderId));
        }
        if (selectedOrderId && selectedOrderId !== log.orderId) {
          newOrderSnap = await transaction.get(doc(db, 'orders', selectedOrderId));
        } else if (selectedOrderId === log.orderId) {
          newOrderSnap = oldOrderSnap;
        }

        if (log.orderId && log.orderId !== selectedOrderId && oldOrderSnap && oldOrderSnap.exists()) {
          const oldOrderRef = doc(db, 'orders', log.orderId);
          const oldData = oldOrderSnap.data();
          const oldAppQty = Math.max(0, (oldData.appReportedQuantity || 0) - (log.quantityReported || 0));
          const oldStatus = calculateOrderStatus(oldData.erpReportedQuantity || 0, oldAppQty, oldData.targetQuantity);
          transaction.update(oldOrderRef, { appReportedQuantity: oldAppQty, status: oldStatus });
        }

        if (selectedOrderId && newOrderSnap && newOrderSnap.exists()) {
          const newOrderRef = doc(db, 'orders', selectedOrderId);
          const newData = newOrderSnap.data();
          orderNameForLog = newData.orderNumber;
          
          let newAppQty = newData.appReportedQuantity || 0;
          if (selectedOrderId === log.orderId) {
            newAppQty = newAppQty - (log.quantityReported || 0) + safeQuantity;
          } else {
            newAppQty = newAppQty + safeQuantity;
          }
          newAppQty = Math.max(0, newAppQty);
          const newStatus = calculateOrderStatus(newData.erpReportedQuantity || 0, newAppQty, newData.targetQuantity);
          transaction.update(newOrderRef, { appReportedQuantity: newAppQty, status: newStatus });
        }

        const logRef = doc(db, 'workLogs', log.id!);
        transaction.update(logRef, {
          quantityReported: safeQuantity,
          assortmentCategory: category || null,
          orderId: selectedOrderId || null,
          orderNumber: orderNameForLog,
          elementId: selectedElementId || null,
          elementName: elementNameForLog,
          startTime: Timestamp.fromDate(start),
          endTime: end ? Timestamp.fromDate(end) : null,
          duration: durationSecs,
          manual: isManual
        });
      });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'workLogs_transaction');
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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8 flex flex-col border border-stone-200"
      >
        <div className="p-4 border-b border-stone-100 flex justify-between items-center shrink-0 bg-stone-50 rounded-t-3xl">
          <h3 className="text-lg font-bold flex items-center gap-2 text-stone-800">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Pencil size={16} />
            </div> 
            Edytuj Meldunek
          </h3>
          <button onClick={onClose} className="p-2 bg-white hover:bg-stone-200 border border-stone-200 rounded-full transition-colors shadow-sm"><X size={16} /></button>
        </div>
        
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Pracownik */}
          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Pracownik</label>
            <div className="w-2/3 p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 font-medium text-sm">
              {log.userName}
            </div>
          </div>

          {/* Czas pracy */}
          <div className="flex items-start gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-emerald-600/70 text-right pt-3">Czas pracy</label>
            <div className="w-2/3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Rozpoczęcie</label>
                  <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} className="w-full p-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Zakończenie</label>
                  <input type="datetime-local" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="w-full p-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" />
                </div>
              </div>
              <div className="text-right text-[10px] font-black text-emerald-700">Obecny czas trwania: {previewDurationHours()}h</div>
            </div>
          </div>

          {/* Zlecenie */}
          <div className="flex items-start gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right pt-3">Zlecenie</label>
            <div className="w-2/3 relative">
              {selectedOrderId ? (
                <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-emerald-700">{selectedOrder?.orderNumber || log.orderNumber}</span>
                    <span className="text-[10px] text-emerald-600 truncate max-w-[180px]">{selectedOrder?.productName}</span>
                  </div>
                  <button onClick={() => { setSelectedOrderId(''); setSelectedElementId(''); setOrderSearch(''); }} className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-600"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input type="text" placeholder={isSearchingArchive ? "Szukanie w archiwum..." : "Szukaj zlecenia..."} value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setShowOrderList(true); handleOrderSearch(e.target.value); }} onFocus={() => setShowOrderList(true)} className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm" />
                  </div>
                  {showOrderList && orderSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
                      {filteredOrders.length > 0 ? filteredOrders.map(o => (
                        <button key={o.id} onClick={() => { setSelectedOrderId(o.id); setSelectedElementId(''); setShowOrderList(false); }} className="w-full p-2 text-left hover:bg-stone-50 flex flex-col border-b border-stone-50 last:border-0">
                          <span className="text-xs font-bold text-stone-900">{o.orderNumber} {o.status === 'completed' && '(ZAKOŃCZONE)'}</span>
                          <span className="text-[10px] text-stone-500 truncate">{o.productName}</span>
                        </button>
                      )) : <div className="p-2 text-[10px] text-stone-400 italic">Nie znaleziono</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Element */}
          {selectedOrderId && (
            <div className="flex items-center gap-4">
              <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Część / Element</label>
              <div className="w-2/3">
                <select 
                  value={selectedElementId} 
                  onChange={(e) => setSelectedElementId(e.target.value)} 
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium text-stone-700 text-sm"
                >
                  <option value="">-- Całe zlecenie (Praca ogólna) --</option>
                  {selectedOrderElements.map((el: any) => (
                    <option key={el.id} value={el.id}>{el.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Kategoria */}
          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Kategoria</label>
            <div className="w-2/3">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm">
                <option value="">Wybierz kategorię...</option>
                {ASSORTMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Ilość */}
          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Ilość (szt.)</label>
            <div className="w-2/3">
              <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-sm" />
            </div>
          </div>

          {/* Typ Meldunku */}
          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Typ meldunku</label>
            <div className="w-2/3 flex gap-2">
              <button 
                onClick={() => setIsManual(false)} 
                className={\`flex-1 p-2 rounded-lg font-bold text-xs transition-all border \${!isManual ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}\`}
              >
                Hala
              </button>
              <button 
                onClick={() => setIsManual(true)} 
                className={\`flex-1 p-2 rounded-lg font-bold text-xs transition-all border \${isManual ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}\`}
              >
                Ręczny
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-stone-50 flex gap-3 shrink-0 border-t border-stone-100 rounded-b-3xl">
          {showDeleteConfirm ? (
            <div className="flex-1 flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isSaving} className="flex-1 py-2 bg-stone-200 text-stone-700 rounded-lg font-bold text-sm hover:bg-stone-300 transition-all">
                Anuluj
              </button>
              <button onClick={handleDelete} disabled={isSaving} className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 transition-all">
                {isSaving ? 'Usuwanie...' : 'Potwierdź'}
              </button>
            </div>
          ) : (
            <button onClick={() => setShowDeleteConfirm(true)} disabled={isSaving} className="px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg font-bold text-sm hover:bg-red-50 transition-all flex items-center gap-2">
              <Trash2 size={16} /> Usuń
            </button>
          )}
          
          {!showDeleteConfirm && (
            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
              {isSaving ? 'Zapisywanie...' : <><Save size={16} /> Zapisz zmiany</>}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function AddLogModal({ employeeId, employeeName, orders, onClose }: { employeeId: string, employeeName: string, orders: ProductionOrder[], onClose: () => void }) {
  const [quantity, setQuantity] = useState(0);
  const [category, setCategory] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedElementId, setSelectedElementId] = useState('');
  const [isManual, setIsManual] = useState(true);
  
  const now = new Date();
  const [startTimeStr, setStartTimeStr] = useState(formatDateForInput(now));
  const [endTimeStr, setEndTimeStr] = useState(formatDateForInput(now));

  const [orderSearch, setOrderSearch] = useState('');
  const [showOrderList, setShowOrderList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [archivedOrders, setArchivedOrders] = useState<ProductionOrder[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);

  const availableOrders = [...orders, ...archivedOrders];
  const selectedOrder = availableOrders.find(o => o.id === selectedOrderId);
  const selectedOrderElements = selectedOrder?.elements || [];

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
    const searchableText = \`\${o.orderNumber} \${o.erpOrderNumber || ''} \${o.productName} \${o.projectNumber || ''}\`;
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

    const durationSecs = end ? Math.floor((end.getTime() - start.getTime()) / 1000) : 0;
    setIsSaving(true);

    try {
      await runTransaction(db, async (transaction) => {
        let orderNameForLog = null;
        let elementNameForLog = null;

        if (selectedOrderId && selectedElementId) {
          const el = selectedOrder?.elements?.find(e => e.id === selectedElementId);
          if (el) elementNameForLog = el.name;
        }

        let newOrderSnap: any = null;
        if (selectedOrderId) {
          newOrderSnap = await transaction.get(doc(db, 'orders', selectedOrderId));
        }

        if (selectedOrderId && newOrderSnap && newOrderSnap.exists()) {
          const newOrderRef = doc(db, 'orders', selectedOrderId);
          const newData = newOrderSnap.data();
          orderNameForLog = newData.orderNumber;
          const newAppQty = Math.max(0, (newData.appReportedQuantity || 0) + safeQuantity);
          const newStatus = calculateOrderStatus(newData.erpReportedQuantity || 0, newAppQty, newData.targetQuantity);
          transaction.update(newOrderRef, { appReportedQuantity: newAppQty, status: newStatus });
        }

        const logRef = doc(collection(db, 'workLogs'));
        transaction.set(logRef, {
          userId: employeeId,
          userName: employeeName,
          quantityReported: safeQuantity,
          assortmentCategory: category || null,
          orderId: selectedOrderId || null,
          orderNumber: orderNameForLog,
          elementId: selectedElementId || null,
          elementName: elementNameForLog,
          startTime: Timestamp.fromDate(start),
          endTime: end ? Timestamp.fromDate(end) : null,
          duration: durationSecs,
          manual: isManual,
          createdAt: serverTimestamp()
        });
      });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'workLogs_transaction');
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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8 flex flex-col border border-stone-200"
      >
        <div className="p-4 border-b border-stone-100 flex justify-between items-center shrink-0 bg-stone-50 rounded-t-3xl">
          <h3 className="text-lg font-bold flex items-center gap-2 text-stone-800">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Plus size={16} />
            </div> 
            Dodaj Meldunek
          </h3>
          <button onClick={onClose} className="p-2 bg-white hover:bg-stone-200 border border-stone-200 rounded-full transition-colors shadow-sm"><X size={16} /></button>
        </div>
        
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Pracownik */}
          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Pracownik</label>
            <div className="w-2/3 p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 font-medium text-sm">
              {employeeName}
            </div>
          </div>

          {/* Czas pracy */}
          <div className="flex items-start gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-emerald-600/70 text-right pt-3">Czas pracy</label>
            <div className="w-2/3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Rozpoczęcie</label>
                  <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} className="w-full p-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Zakończenie</label>
                  <input type="datetime-local" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="w-full p-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" />
                </div>
              </div>
              <div className="text-right text-[10px] font-black text-emerald-700">Obecny czas trwania: {previewDurationHours()}h</div>
            </div>
          </div>

          {/* Zlecenie */}
          <div className="flex items-start gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right pt-3">Zlecenie</label>
            <div className="w-2/3 relative">
              {selectedOrderId ? (
                <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-emerald-700">{selectedOrder?.orderNumber}</span>
                    <span className="text-[10px] text-emerald-600 truncate max-w-[180px]">{selectedOrder?.productName}</span>
                  </div>
                  <button onClick={() => { setSelectedOrderId(''); setSelectedElementId(''); setOrderSearch(''); }} className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-600"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input type="text" placeholder={isSearchingArchive ? "Szukanie w archiwum..." : "Szukaj zlecenia..."} value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setShowOrderList(true); handleOrderSearch(e.target.value); }} onFocus={() => setShowOrderList(true)} className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm" />
                  </div>
                  {showOrderList && orderSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
                      {filteredOrders.length > 0 ? filteredOrders.map(o => (
                        <button key={o.id} onClick={() => { setSelectedOrderId(o.id); setSelectedElementId(''); setShowOrderList(false); }} className="w-full p-2 text-left hover:bg-stone-50 flex flex-col border-b border-stone-50 last:border-0">
                          <span className="text-xs font-bold text-stone-900">{o.orderNumber} {o.status === 'completed' && '(ZAKOŃCZONE)'}</span>
                          <span className="text-[10px] text-stone-500 truncate">{o.productName}</span>
                        </button>
                      )) : <div className="p-2 text-[10px] text-stone-400 italic">Nie znaleziono</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Element */}
          {selectedOrderId && (
            <div className="flex items-center gap-4">
              <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Część / Element</label>
              <div className="w-2/3">
                <select 
                  value={selectedElementId} 
                  onChange={(e) => setSelectedElementId(e.target.value)} 
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium text-stone-700 text-sm"
                >
                  <option value="">-- Całe zlecenie (Praca ogólna) --</option>
                  {selectedOrderElements.map((el: any) => (
                    <option key={el.id} value={el.id}>{el.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Kategoria */}
          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Kategoria</label>
            <div className="w-2/3">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm">
                <option value="">Wybierz kategorię...</option>
                {ASSORTMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Ilość */}
          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Ilość (szt.)</label>
            <div className="w-2/3">
              <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-sm" />
            </div>
          </div>

          {/* Typ Meldunku */}
          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-black uppercase tracking-wider text-stone-400 text-right">Typ meldunku</label>
            <div className="w-2/3 flex gap-2">
              <button 
                onClick={() => setIsManual(false)} 
                className={\`flex-1 p-2 rounded-lg font-bold text-xs transition-all border \${!isManual ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}\`}
              >
                Hala
              </button>
              <button 
                onClick={() => setIsManual(true)} 
                className={\`flex-1 p-2 rounded-lg font-bold text-xs transition-all border \${isManual ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}\`}
              >
                Ręczny
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-stone-50 flex gap-3 shrink-0 border-t border-stone-100 rounded-b-3xl">
          <button onClick={onClose} disabled={isSaving} className="flex-1 py-2 bg-white text-stone-600 border border-stone-200 rounded-lg font-bold text-sm hover:bg-stone-100 transition-all">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={isSaving} className="flex-[2] py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
            {isSaving ? 'Zapisywanie...' : <><Plus size={16} /> Dodaj meldunek</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
`;

const updatedContent = content.substring(0, editStart) + newModals;
fs.writeFileSync('src/components/production/OrderLogsView.tsx', updatedContent);

