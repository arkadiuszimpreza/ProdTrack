import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Clock, User, Users, Package, MapPin, LayoutGrid, List, ArrowRight, StopCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Timestamp } from 'firebase/firestore';
import { differenceInSeconds, format } from 'date-fns';
import { WorkLog, ProductionOrder } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface LiveWorkViewProps {
  activeLogs: WorkLog[];
  orders: ProductionOrder[];
  onForceStop: (log: WorkLog, endTime: Date, quantity: number) => Promise<void>;
}

const HOURLY_RATE = 65.00; 

// Helper do formatowania daty dla inputa typu datetime-local
const toDateTimeLocal = (date: Date) => {
  return format(date, "yyyy-MM-dd'T'HH:mm");
};

export function LiveWorkView({ activeLogs, orders, onForceStop }: LiveWorkViewProps) {
  const [now, setNow] = useState(new Date());
  const [groupBy, setGroupBy] = useState<'order' | 'employee'>('employee'); 

  // Stany dla modala Admin Override
  const [stoppingLog, setStoppingLog] = useState<WorkLog | null>(null);
  const [stopDate, setStopDate] = useState<string>('');
  const [stopQty, setStopQty] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const getLiveSeconds = (start: any) => {
    if (!start) return 0;
    const startDate = start instanceof Timestamp ? start.toDate() : new Date(start);
    return Math.max(0, differenceInSeconds(now, startDate));
  };

  const formatTimeStr = (s: number) => {
    if (isNaN(s)) return '00:00:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleOpenStopModal = (log: WorkLog) => {
    setStoppingLog(log);
    setStopDate(toDateTimeLocal(new Date())); 
    setStopQty(0); 
  };

  const handleConfirmStop = async () => {
    if (!stoppingLog || !stopDate) return;
    setIsSubmitting(true);
    try {
      const customEndTime = new Date(stopDate);
      await onForceStop(stoppingLog, customEndTime, stopQty);
      setStoppingLog(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupedOrders = useMemo(() => {
    const groups: Record<string, { order: ProductionOrder | undefined, logs: WorkLog[], elements: Record<string, { element: any, logs: WorkLog[] }> }> = {};
    activeLogs.forEach(log => {
      const oId = log.orderId || 'unknown';
      if (!groups[oId]) groups[oId] = { order: orders.find(o => o.id === oId), logs: [], elements: {} };
      groups[oId].logs.push(log);

      const eId = log.elementId || 'whole_order';
      if (!groups[oId].elements[eId]) {
         const elementData = groups[oId].order?.elements?.find(e => e.id === eId);
         groups[oId].elements[eId] = { element: elementData, logs: [] };
      }
      groups[oId].elements[eId].logs.push(log);
    });
    return Object.values(groups);
  }, [activeLogs, orders]);

  if (activeLogs.length === 0) {
    return (
      <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-16 text-center text-stone-400">
        <Activity size={48} className="mx-auto mb-4 opacity-20" />
        <h3 className="text-xl font-bold text-stone-500 mb-2">Brak aktywności na hali</h3>
        <p>W tym momencie żaden pracownik nie jest zalogowany do zlecenia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* MODAL: ADMIN OVERRIDE */}
      <AnimatePresence>
        {stoppingLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full border border-stone-200"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-red-600 flex items-center gap-2">
                    <StopCircle size={24} /> Wymuś zatrzymanie
                  </h3>
                  <p className="text-stone-500 text-sm mt-1 font-medium">Pracownik: <span className="text-stone-900 font-bold">{stoppingLog.userName}</span></p>
                </div>
                <button onClick={() => setStoppingLog(null)} className="p-2 text-stone-400 hover:bg-stone-100 rounded-xl transition-colors"><X size={20} /></button>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">Czas zakończenia (Wsteczny)</label>
                  <input 
                    type="datetime-local" 
                    value={stopDate}
                    onChange={(e) => setStopDate(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 p-3 rounded-xl font-medium focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-stone-400 mt-1">Czas startu: {format(stoppingLog.startTime instanceof Timestamp ? stoppingLog.startTime.toDate() : new Date(stoppingLog.startTime), 'dd.MM.yyyy HH:mm')}</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">Zaraportowana ilość</label>
                  <input 
                    type="number" 
                    value={stopQty}
                    onChange={(e) => setStopQty(Number(e.target.value))}
                    min="0"
                    className="w-full bg-stone-50 border border-stone-200 p-3 rounded-xl font-medium focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-stone-400 mt-1">Wpisz 0, jeśli pracownik zapomniał się wylogować i nic nie skończył.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStoppingLog(null)} className="flex-1 py-3 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-colors">Anuluj</button>
                <button 
                  onClick={handleConfirmStop}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Zapisywanie...' : 'Wymuś Stop'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HEADER Z PRZEŁĄCZNIKIEM WIDOKU */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white border border-stone-200 p-2 pl-6 rounded-2xl shadow-sm gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex h-4 w-4 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
          </div>
          <h2 className="text-stone-800 font-black uppercase tracking-widest text-sm flex-1">Monitor Produkcji</h2>
          <div className="text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-xl text-sm border border-emerald-100 shrink-0">
            Osoby: {activeLogs.length}
          </div>
        </div>

        <div className="flex bg-stone-100 p-1 rounded-xl w-full sm:w-auto">
          <button 
            onClick={() => setGroupBy('order')}
            className={cn("flex items-center justify-center gap-2 flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all", groupBy === 'order' ? "bg-white text-emerald-700 shadow-sm" : "text-stone-500 hover:text-stone-700")}
          >
            <LayoutGrid size={16} /> Grupuj Zleceniami
          </button>
          <button 
            onClick={() => setGroupBy('employee')}
            className={cn("flex items-center justify-center gap-2 flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all", groupBy === 'employee' ? "bg-white text-emerald-700 shadow-sm" : "text-stone-500 hover:text-stone-700")}
          >
            <List size={16} /> Lista Pracowników
          </button>
        </div>
      </div>

      {/* RENDEROWANIE WIDOKÓW */}
      {groupBy === 'order' ? (
        <div className="grid gap-6">
          {groupedOrders.map((group, idx) => (
            <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
              <div className="bg-stone-50 p-6 border-b border-stone-200">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-2 py-1 rounded border border-emerald-200">ZP: {group.order?.orderNumber || 'Nieznane'}</span>
                  {group.order?.erpOrderNumber && <span className="text-[10px] font-black uppercase tracking-widest text-stone-600 bg-stone-100 px-2 py-1 rounded border border-stone-200">ZL: {group.order.erpOrderNumber}</span>}
                  {group.order?.projectNumber && <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">PROJEKT: {group.order.projectNumber}</span>}
                </div>
                <h3 className="text-xl font-bold text-stone-900 leading-tight">{group.order?.productName || 'Brak nazwy produktu'}</h3>
              </div>

              <div className="p-6 space-y-6">
                {Object.entries(group.elements).map(([elId, elGroup]) => {
                  const totalSeconds = elGroup.logs.reduce((sum, log) => sum + getLiveSeconds(log.startTime), 0);
                  const liveCost = (totalSeconds / 3600) * HOURLY_RATE;
                  
                  // ZMODYFIKOWANO: Pobieranie wagi całkowitej lub wagi elementu
                  const weight = elId === 'whole_order' 
                    ? (group.order?.totalWeight || 0) 
                    : (elGroup.element?.weight || 0);
                    
                  const costPerKg = weight > 0 ? liveCost / weight : null;

                  return (
                    <div key={elId} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                      <div className="bg-stone-800 text-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Package size={20} className="text-emerald-500" />
                          <div>
                            <p className="font-bold">{elGroup.element?.name || 'Praca ogólna na zleceniu'}</p>
                            {weight > 0 && <p className="text-xs text-stone-400 font-mono tracking-wider">{weight} kg {elId === 'whole_order' && '(Waga Całk.)'}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 bg-stone-900 px-4 py-2 rounded-xl">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Czas Sumaryczny</span>
                            <span className="font-mono text-emerald-400 font-bold">{formatTimeStr(totalSeconds)}</span>
                          </div>
                          <div className="w-px h-8 bg-stone-700" />
                          <div className="flex flex-col">
                            <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Robocizna Na Żywo</span>
                            <span className="font-mono text-white font-bold">{liveCost.toFixed(2)} PLN</span>
                          </div>
                          {costPerKg !== null && (
                            <>
                              <ArrowRight size={14} className="text-stone-500" />
                              <div className="flex flex-col">
                                <span className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">Koszt / KG</span>
                                <span className="font-mono text-emerald-400 font-black">{costPerKg.toFixed(2)} PLN/kg</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="divide-y divide-stone-100">
                        {elGroup.logs.map(log => (
                          <div key={log.id} className="p-4 flex items-center justify-between bg-stone-50/50 hover:bg-stone-50 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-white border border-stone-200 rounded-full flex items-center justify-center text-stone-500 shadow-sm">
                                {log.sessionId ? <Users size={14} /> : <User size={14} />}
                              </div>
                              <div>
                                <p className="font-bold text-stone-900 text-sm">{log.userName}</p>
                                {log.stationName && <p className="text-[10px] text-stone-500 font-bold">{log.stationName}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-stone-600 font-mono font-bold text-sm bg-white px-3 py-1 rounded-lg border border-stone-200 shadow-sm">
                                {formatTimeStr(getLiveSeconds(log.startTime))}
                              </div>
                              {/* ADMIN OVERRIDE BUTTON */}
                              <button onClick={() => handleOpenStopModal(log)} className="text-stone-400 hover:text-red-600 bg-white border border-stone-200 hover:border-red-200 hover:bg-red-50 p-1.5 rounded-lg transition-all" title="Wymuś zatrzymanie">
                                <StopCircle size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        /* WIDOK PRACOWNIKÓW (Lista Kafelkowa) */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeLogs.map((log) => {
            const order = orders.find(o => o.id === log.orderId);
            return (
              <motion.div key={log.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-5 rounded-3xl shadow-sm border border-stone-200 flex flex-col gap-4 relative overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                
                {/* ADMIN OVERRIDE BUTTON (Absolute top right) */}
                <button onClick={() => handleOpenStopModal(log)} className="absolute top-4 right-4 text-stone-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100" title="Wymuś zatrzymanie">
                  <StopCircle size={20} />
                </button>

                <div className="flex justify-between items-start mt-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-500">
                      {log.sessionId ? <Users size={20} /> : <User size={20} />}
                    </div>
                    <div>
                      <p className="font-black text-stone-900 leading-tight pr-6">{log.userName}</p>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                        {log.sessionId ? 'Praca zespołowa' : 'Praca indywidualna'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-3xl font-mono font-black text-emerald-600 tabular-nums tracking-tighter flex items-center justify-center gap-2 py-2">
                  {formatTimeStr(getLiveSeconds(log.startTime))}
                </div>

                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2 mb-1">
                    {order?.orderNumber && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">ZP: {order.orderNumber}</span>}
                    {order?.projectNumber && <span className="text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">PROJ: {order.projectNumber}</span>}
                  </div>
                  
                  <div>
                    <p className="text-xs font-bold text-stone-900 line-clamp-1" title={order?.productName}>
                      {order?.productName || 'Brak przypisanego zlecenia'}
                    </p>
                    {log.elementName && (
                      <p className="text-[11px] font-bold text-stone-500 flex items-center gap-1 mt-1">
                        <Package size={12} /> {log.elementName}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  );
}