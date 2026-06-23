import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, Timestamp, or, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

import { List, Calendar, History, Copy, Trash2, AlertTriangle, X, Search, Plus } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

import { ProductionOrder, Employee, WorkLog, ASSORTMENT_CATEGORIES } from '../../types';
import { SearchableSelect } from '../common/SearchableSelect';
import { MultiOrderSelectModal } from '../common/MultiOrderSelectModal';

export function BulkManualEntryForm({ 
  orders, 
  employees, 
  onSubmit 
}: { 
  orders: ProductionOrder[], 
  employees: Employee[], 
  onSubmit: (entries: { 
    id: string,
    orderId: string | null, 
    userId: string, 
    hours: number, 
    quantity: number, 
    startTime: Date, 
    endTime: Date, 
    assortmentCategory: string,
    order?: ProductionOrder | null
  }[]) => Promise<void> 
}) {
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState<string>(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(endOfDay(new Date()), 'yyyy-MM-dd'));
  const [existingLogs, setExistingLogs] = useState<WorkLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // Hybrydowe wyszukiwanie w archiwum
  const [archivedOrders, setArchivedOrders] = useState<ProductionOrder[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);
  
  const availableOrders = [...orders, ...archivedOrders];

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
        console.error("Error searching archive:", e);
      } finally {
        setIsSearchingArchive(false);
      }
    }
  };

  const [rows, setRows] = useState<{
    id: string;
    date: string;
    orderId: string;
    assortmentCategory: string;
    hours: string;
    quantity: string;
  }[]>([
    { id: Math.random().toString(36).substr(2, 9), date: format(new Date(), 'yyyy-MM-dd'), orderId: '', assortmentCategory: '', hours: '', quantity: '' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMultiSelect, setShowMultiSelect] = useState(false);
  const [lastCopiedUserId, setLastCopiedUserId] = useState<string | null>(null);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setLastCopiedUserId(null);
    if (!userId) {
      setExistingLogs([]);
      return;
    }

    setLoadingLogs(true);
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));

    const q = query(
      collection(db, 'workLogs'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allUserLogs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as WorkLog[];
      
      const filteredLogs = allUserLogs
        .filter(log => {
          const logTime = log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime);
          // ZMIANA: Dodano warunek log.manual === true
          return logTime >= start && logTime <= end && log.manual === true;
        })
        .sort((a, b) => {
          const timeA = a.startTime instanceof Timestamp ? a.startTime.toMillis() : new Date(a.startTime).getTime();
          const timeB = b.startTime instanceof Timestamp ? b.startTime.toMillis() : new Date(b.startTime).getTime();
          return timeB - timeA;
        });

      setExistingLogs(filteredLogs);
      setLoadingLogs(false);
    }, (err) => {
      console.error(err);
      setLoadingLogs(false);
    });

    return () => unsubscribe();
  }, [userId, startDate, endDate]);

  const addRow = () => {
    setRows([...rows, { 
      id: Math.random().toString(36).substr(2, 9), 
      date: rows.length > 0 ? rows[rows.length - 1].date : format(new Date(), 'yyyy-MM-dd'),
      orderId: '', 
      assortmentCategory: '', 
      hours: '', 
      quantity: '' 
    }]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const addMultipleOrders = (selectedOrders: ProductionOrder[]) => {
    const newRows = selectedOrders.map(order => ({
      id: Math.random().toString(36).substr(2, 9),
      date: rows.length > 0 ? rows[rows.length - 1].date : format(new Date(), 'yyyy-MM-dd'),
      orderId: order.id,
      assortmentCategory: order.assortmentCategory || '',
      hours: '',
      quantity: ''
    }));

    if (rows.length === 1 && !rows[0].orderId && !rows[0].hours && !rows[0].quantity) {
      setRows(newRows);
    } else {
      setRows([...rows, ...newRows]);
    }
  };

  const updateRow = (id: string, field: string, value: string) => {
    setRows(rows.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
        if (field === 'orderId') {
          const order = availableOrders.find(o => o.id === value);
          if (order?.assortmentCategory) {
            updated.assortmentCategory = order.assortmentCategory;
          }
        }
        return updated;
      }
      return r;
    }));
  };

  const performCopy = () => {
    if (existingLogs.length === 0) return;
    
    const newRowsFromLogs = existingLogs.map(log => ({
      id: Math.random().toString(36).substr(2, 9),
      date: format(log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime), 'yyyy-MM-dd'),
      orderId: log.orderId || '',
      assortmentCategory: log.assortmentCategory || '',
      hours: (log.duration && log.duration > 0) ? (log.duration / 3600).toFixed(1) : (log.hours ? log.hours.toString() : '0'),
      quantity: log.quantityReported ? log.quantityReported.toString() : (log.quantity ? log.quantity.toString() : '0')
    }));

    if (rows.length === 1 && !rows[0].orderId && !rows[0].hours && !rows[0].quantity) {
      setRows(newRowsFromLogs);
    } else {
      setRows([...rows, ...newRowsFromLogs]);
    }
    setLastCopiedUserId(userId);
    setShowCopyConfirm(false);
  };

  const copyExistingToRows = () => {
    if (existingLogs.length === 0) return;
    
    if (userId === lastCopiedUserId) {
      setShowCopyConfirm(true);
      return;
    }

    performCopy();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || rows.length === 0) return;

    try {
      const entries = rows.map((row, index) => {
        const h = parseFloat(row.hours);
        if (isNaN(h) || h <= 0) throw new Error(`Nieprawidłowa liczba godzin w wierszu ${index + 1}`);
        
        const [year, month, day] = row.date.split('-').map(Number);
        const startTime = new Date(year, month - 1, day, 7, 0, 0);
        const endTime = new Date(startTime.getTime() + h * 3600 * 1000);
        
        const order = row.orderId ? availableOrders.find(o => o.id === row.orderId) || null : null;

        return {
          id: row.id,
          orderId: row.orderId || null,
          order: order,
          userId,
          hours: h,
          quantity: row.quantity ? parseFloat(row.quantity) : 0,
          startTime,
          endTime,
          assortmentCategory: row.assortmentCategory
        };
      });

      setIsSubmitting(true);
      await onSubmit(entries);
      
      setRows([{ id: Math.random().toString(36).substr(2, 9), date: format(new Date(), 'yyyy-MM-dd'), orderId: '', assortmentCategory: '', hours: '', quantity: '' }]);
      setUserId('');
      
      setSuccessMessage(`Pomyślnie dodano ${entries.length} wpisów!`);
      setTimeout(() => setSuccessMessage(null), 4000);

    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto w-full"
    >
      <div className="bg-white rounded-3xl shadow-xl p-8 border border-stone-100">
        
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
            <List size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-stone-900">Zbiorczy wpis pracy</h2>
            <p className="text-stone-500 text-sm">Dodaj wiele zleceń dla jednego pracownika w wybranym dniu.</p>
          </div>
        </div>

        <AnimatePresence>
          {successMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-4 rounded-2xl flex items-center gap-3 shadow-sm overflow-hidden"
            >
              <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div>
                <p className="font-bold text-sm">Operacja zakończona sukcesem</p>
                <p className="text-xs text-emerald-600 opacity-80">{successMessage}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-stone-50 rounded-2xl border border-stone-100">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                Zakres od
              </label>
              <div className="relative">
                <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                Zakres do
              </label>
              <div className="relative">
                <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <SearchableSelect 
                label="Pracownik"
                options={employees}
                value={userId}
                onChange={setUserId}
                getLabel={(e) => `${e.firstName} ${e.lastName} (${e.employeeNumber})`}
                getSearchValue={(e) => `${e.firstName} ${e.lastName} ${e.employeeNumber}`}
                placeholder="Wybierz pracownika..."
              />
            </div>
          </div>

          {userId && (
            <div className="space-y-4 p-6 bg-emerald-50/30 rounded-2xl border border-emerald-100">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black uppercase tracking-widest text-emerald-800 flex items-center gap-2">
                  <History size={16} />
                  Ręczne meldunki do skopiowania
                </h3>
                {existingLogs.length > 0 && (
                  <button 
                    type="button"
                    onClick={copyExistingToRows}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
                  >
                    <Copy size={12} />
                    Kopiuj do pozycji
                  </button>
                )}
              </div>
              {loadingLogs ? (
                <div className="text-xs text-stone-400 italic">Ładowanie meldunków...</div>
              ) : existingLogs.length === 0 ? (
                <div className="text-xs text-stone-400 italic">Brak ręcznych meldunków w tym zakresie.</div>
              ) : (
                <div className="grid gap-2">
                  {existingLogs.map(log => (
                    <div key={log.id} className="bg-white p-3 rounded-xl border border-emerald-100 flex justify-between items-center text-xs gap-4">
                      
                      {/* LEWA STRONA: Elastyczny kontener z obcinaniem nazw */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="font-black text-emerald-700 w-20 shrink-0">
                          {format(log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime), 'yyyy-MM-dd')}
                        </span>
                        
                        <span className="text-stone-600 font-medium shrink-0">
                          {log.orderNumber ? `ZP: ${log.orderNumber}` : 'Praca ogólna'}
                        </span>
                        
                        {log.assortmentCategory && (
                          <span className="text-stone-400 italic shrink-0">
                            ({log.assortmentCategory})
                          </span>
                        )}

                        {log.orderId && (
                          <span 
                            className="text-stone-400 text-[10px] uppercase tracking-wider truncate ml-1 opacity-80" 
                            title={availableOrders.find(o => o.id === log.orderId)?.productName}
                          >
                            — {availableOrders.find(o => o.id === log.orderId)?.productName || 'Szukanie nazwy...'}
                          </span>
                        )}
                      </div>
                      
                      {/* PRAWA STRONA: Stała szerokość dla statystyk */}
                      <div className="flex items-center gap-4 shrink-0">
                        {/* Zabezpieczenie na wypadek gdy duration = undefined (opierając się na typach) */}
                        <span className="font-bold text-stone-900">
                          {log.duration ? (log.duration / 3600).toFixed(1) : (log.hours || 0)}h
                        </span>
                        <span className="text-stone-500 w-12 text-right">
                          {log.quantityReported || log.quantity || 0} szt.
                        </span>
                      </div>
                      
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h3 className="text-sm font-black uppercase tracking-widest text-stone-400">Pozycje zleceń</h3>
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setShowMultiSelect(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-stone-100 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-200 transition-all"
                >
                  <Search size={14} />
                  Wybierz wiele
                </button>
                <button 
                  type="button"
                  onClick={addRow}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all"
                >
                  <Plus size={14} />
                  Dodaj pozycję
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-stone-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400 w-32">Data</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400 w-[300px]">Zlecenie</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400 w-40">Kategoria</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400 w-24">Godziny</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400 w-24">Sztuki</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((row, index) => (
                    <tr key={row.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="p-3">
                        <input 
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                          className="w-full p-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          required
                        />
                      </td>
                      <td className="p-3">
                        <div className="w-[300px]">
                          <SearchableSelect 
                            label=""
                            compact
                            options={availableOrders}
                            value={row.orderId}
                            onChange={(val) => updateRow(row.id, 'orderId', val)}
                            onInputChange={handleOrderSearch}
                            getLabel={(o) => {
                              const parts = [`ZP: ${o.orderNumber}`, o.productName];
                              if (o.erpOrderNumber) parts.push(`Zl: ${o.erpOrderNumber}`);
                              if (o.projectNumber) parts.push(`Proj: ${o.projectNumber}`);
                              if (o.status === 'completed') parts.push('(ZAKOŃCZONE)');
                              return parts.join(' | ');
                            }}
                            getSearchValue={(o) => `${o.orderNumber} ${o.productName} ${o.erpOrderNumber || ''} ${o.projectNumber || ''}`}
                            placeholder={isSearchingArchive ? "Szukanie..." : "Szukaj (6 cyfr = archiwum)..."}
                            optional
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        <select 
                          value={row.assortmentCategory}
                          onChange={(e) => updateRow(row.id, 'assortmentCategory', e.target.value)}
                          className="w-full p-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          <option value="">Kategoria...</option>
                          {ASSORTMENT_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <input 
                          type="number"
                          step="0.1"
                          value={row.hours}
                          onChange={(e) => updateRow(row.id, 'hours', e.target.value)}
                          placeholder="h"
                          className="w-full p-2 bg-white border border-stone-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          required
                        />
                      </td>
                      <td className="p-3">
                        <input 
                          type="number"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                          placeholder="szt"
                          className="w-full p-2 bg-white border border-stone-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <button 
                          type="button"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-0"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit"
              disabled={isSubmitting || !userId}
              className="px-12 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:shadow-none"
            >
              {isSubmitting ? 'Zapisywanie...' : 'Zapisz wszystkie meldunki'}
            </button>
          </div>
        </form>

        <AnimatePresence>
          {showMultiSelect && (
            <MultiOrderSelectModal 
              orders={availableOrders}
              onAdd={addMultipleOrders}
              onClose={() => setShowMultiSelect(false)}
            />
          )}
          {showCopyConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-stone-900">
                    <AlertTriangle className="text-amber-500" size={24} />
                    Potwierdzenie
                  </h3>
                  <button onClick={() => setShowCopyConfirm(false)} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6">
                  <p className="text-stone-600">Dane dla tego pracownika zostały już skopiowane. Czy na pewno chcesz skopiować je ponownie?</p>
                </div>
                <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-3">
                  <button 
                    onClick={() => setShowCopyConfirm(false)}
                    className="flex-1 px-4 py-2 border border-stone-200 text-stone-600 rounded-xl font-bold hover:bg-stone-100 transition-all"
                  >
                    Anuluj
                  </button>
                  <button 
                    onClick={performCopy}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                  >
                    Tak, skopiuj
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}