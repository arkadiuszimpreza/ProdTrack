import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Clock, User as UserIcon, Package, ArrowUp, ArrowDown, Pencil, Save, Trash2, Search, ChevronLeft,
  BarChart2, Users, ChevronDown, ChevronUp, Scale, AlertCircle, Hash, Tablet, PenTool, Layers, TrendingUp, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, Timestamp, doc, runTransaction, serverTimestamp, or, getDocFromServer } from 'firebase/firestore';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

import { db } from '../../firebase';
import { ProductionOrder, WorkLog, ASSORTMENT_CATEGORIES, Employee } from '../../types';
import { cn, handleFirestoreError, OperationType } from '../../utils/firestore-helpers';
import { calculateOrderStatus } from '../../utils/orderStatus';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';

const HOURLY_RATE = 65.00;

interface OrderLogsViewProps {
  order: ProductionOrder;
  orders: ProductionOrder[]; // Potrzebne do modala edycji
  employees: Employee[];
  onClose: () => void;
}

interface WorkerStat {
  userId: string;
  userName: string;
  totalSeconds: number;
  totalQuantity: number;
}

interface ElementStat {
  elementId: string;
  elementName: string;
  weight: number;
  isWholeOrder: boolean;
  totalSeconds: number;
  totalQuantity: number;
  laborCost: number;
  costPerKg: number | null;
  workers: WorkerStat[];
}

const formatHours = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const formatHoursDecimal = (seconds: number) => (seconds / 3600).toFixed(2);

const getCostPerKgColor = (cpk: number | null) => {
  if (cpk === null) return 'text-stone-400';
  if (cpk < 5) return 'text-emerald-600';
  if (cpk < 10) return 'text-amber-600';
  return 'text-red-600';
};

const getCostPerKgBg = (cpk: number | null) => {
  if (cpk === null) return 'bg-stone-100 border-stone-200';
  if (cpk < 5) return 'bg-emerald-50 border-emerald-200';
  if (cpk < 10) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
};

export function OrderLogsView({ order, orders, employees, onClose }: OrderLogsViewProps) {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);

  const [sortField, setSortField] = useState<keyof WorkLog>('endTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [logSource, setLogSource] = useState<'all' | 'hall' | 'manual'>('all');
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set());

  const toggleElement = (key: string) => {
    setExpandedElements(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (logSource === 'hall') return !l.manual;
      if (logSource === 'manual') return !!l.manual;
      return true;
    });
  }, [logs, logSource]);

  const sortedLogs = useMemo(() => {
    return [...filteredLogs].sort((a, b) => {
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
  }, [filteredLogs, sortField, sortDirection]);

  const getStatsForLogs = (targetLogs: WorkLog[]) => {
    const completedLogs = targetLogs.filter(l => l.endTime != null && (l.duration || 0) > 0);

    type WorkerAcc = { userId: string; userName: string; totalSeconds: number; totalQuantity: number };
    type ElementAcc = { logs: WorkLog[]; workerMap: Map<string, WorkerAcc> };
    const elemMap = new Map<string, ElementAcc>();

    completedLogs.forEach(log => {
      const eId = log.elementId || 'whole_order';
      if (!elemMap.has(eId)) elemMap.set(eId, { logs: [], workerMap: new Map() });
      const elemAcc = elemMap.get(eId)!;
      elemAcc.logs.push(log);

      const uid = log.userId;
      if (!elemAcc.workerMap.has(uid)) {
        elemAcc.workerMap.set(uid, { userId: uid, userName: log.userName, totalSeconds: 0, totalQuantity: 0 });
      }
      const wa = elemAcc.workerMap.get(uid)!;
      wa.totalSeconds += (log.duration || 0);
      wa.totalQuantity += (log.quantityReported || 0);
    });

    const elements: ElementStat[] = [];

    elemMap.forEach((elemAcc, eId) => {
      const element = order.elements?.find(e => e.id === eId);
      const baseWeight = eId === 'whole_order'
        ? (order.totalWeight || 0)
        : (element?.weight || 0);

      const totalSec = Array.from(elemAcc.workerMap.values()).reduce((s, w) => s + w.totalSeconds, 0);
      const totalQty = Array.from(elemAcc.workerMap.values()).reduce((s, w) => s + w.totalQuantity, 0);
      
      const isWholeOrder = eId === 'whole_order';
      const weight = isWholeOrder && totalQty > 0
        ? baseWeight * totalQty
        : baseWeight;

      const laborCost = (totalSec / 3600) * HOURLY_RATE;
      const costPerKg = weight > 0 ? laborCost / weight : null;

      const workers: WorkerStat[] = Array.from(elemAcc.workerMap.values())
        .sort((a, b) => b.totalSeconds - a.totalSeconds);

      const elementName = eId === 'whole_order'
        ? 'Praca ogólna na zleceniu'
        : (element?.name || elemAcc.logs.find(l => l.elementName)?.elementName || 'Element');

      elements.push({
        elementId: eId,
        elementName,
        weight,
        isWholeOrder: eId === 'whole_order',
        totalSeconds: totalSec,
        totalQuantity: totalQty,
        laborCost,
        costPerKg,
        workers,
      });
    });

    elements.sort((a, b) => b.totalSeconds - a.totalSeconds);

    const totalSeconds = elements.reduce((s, e) => s + e.totalSeconds, 0);
    const totalLaborCost = elements.reduce((s, e) => s + e.laborCost, 0);
    const totalQuantity = elements.reduce((s, e) => s + e.totalQuantity, 0);
    const totalWorkedWeight = elements.reduce((s, e) => s + e.weight, 0);

    return {
      elements,
      totalSeconds,
      totalLaborCost,
      totalQuantity,
      totalWorkedWeight
    };
  };

  const hallStats = useMemo(() => {
    const hallLogs = logs.filter(l => !l.manual);
    return getStatsForLogs(hallLogs);
  }, [logs, order]);

  const manualStats = useMemo(() => {
    const manualLogs = logs.filter(l => !!l.manual);
    return getStatsForLogs(manualLogs);
  }, [logs, order]);

  const totalOrderWeight = useMemo(() => {
    return order.totalWeight || order.elements?.reduce((sum, el) => sum + (el.weight || 0), 0) || 0;
  }, [order]);

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

  const renderSummarySection = (statsType: 'hall' | 'manual', title: string, stats: typeof hallStats, icon: React.ReactNode) => {
    const isHall = statsType === 'hall';
    const badgeColor = isHall ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';

    return (
      <div className="space-y-4 bg-white p-5 rounded-3xl border border-stone-200 shadow-sm flex flex-col">
        <div className="flex items-center gap-3 pb-3 border-b border-stone-150">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center border shrink-0", badgeColor)}>
            {icon}
          </div>
          <div>
            <h3 className="font-black text-stone-900 tracking-tight text-xs uppercase">{title}</h3>
            <p className="text-[10px] text-stone-400 font-medium">Łączne godziny i koszty dla zakończonych meldunków</p>
          </div>
        </div>

        {stats.elements.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-400 italic">
            Brak zakończonych meldunków tego typu.
          </div>
        ) : (
          <>
            {/* KPI BAR */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
              {[
                { label: 'Godziny', value: `${formatHoursDecimal(stats.totalSeconds)} h`, icon: <Clock size={12} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Koszt rob.', value: `${stats.totalLaborCost.toFixed(0)} zł`, icon: <TrendingUp size={12} />, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Ilość', value: `${stats.totalQuantity} szt.`, icon: <Hash size={12} />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'Śr. Zł / Kg', value: stats.totalWorkedWeight > 0 ? `${(stats.totalLaborCost / stats.totalWorkedWeight).toFixed(2)}` : 'brak wagi', icon: <Scale size={12} />, color: 'text-rose-600', bg: 'bg-rose-50' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-stone-50 rounded-xl border border-stone-200/60 p-2 flex items-center gap-2 min-w-0">
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs', kpi.bg, kpi.color)}>
                    {kpi.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold text-stone-400 uppercase tracking-wider truncate">{kpi.label}</p>
                    <p className={cn('text-[10px] font-black truncate', kpi.color)}>{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ELEMENTY BREAKDOWN */}
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1 flex-1">
              {stats.elements.map(elem => {
                const elemKey = `${statsType}_${elem.elementId}`;
                const isExpanded = expandedElements.has(elemKey);

                return (
                  <div key={elem.elementId} className="border border-stone-200/80 rounded-xl overflow-hidden bg-stone-50/30">
                    {/* NAGŁÓWEK ELEMENTU */}
                    <div className="bg-stone-50/70 border-b border-stone-200/80 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 bg-white border border-stone-200 rounded-lg flex items-center justify-center text-indigo-500 shrink-0 shadow-sm">
                          <Package size={13} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-stone-800 text-[11px] truncate max-w-[130px]" title={elem.elementName}>{elem.elementName}</p>
                          {elem.weight > 0 && (
                            <p className="text-[9px] text-stone-400 font-mono font-bold flex items-center gap-0.5 mt-0.5">
                              <Scale size={9} />
                              {elem.weight} kg
                              {elem.isWholeOrder && ' (waga)'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* STATYSTYKI */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {/* Godziny */}
                        <div className="bg-white border border-stone-200/60 rounded-lg px-2 py-1 text-center min-w-[50px]">
                          <p className="text-[8px] text-stone-400 uppercase font-black">Godz.</p>
                          <p className="font-mono font-black text-stone-800 text-[9px]">{formatHoursDecimal(elem.totalSeconds)}h</p>
                        </div>

                        {/* zł/kg */}
                        {elem.costPerKg !== null ? (
                          <div className={cn(
                            'border rounded-lg px-2 py-1 text-center min-w-[60px]',
                            getCostPerKgBg(elem.costPerKg)
                          )}>
                            <p className={cn('text-[8px] uppercase font-black', getCostPerKgColor(elem.costPerKg))}>ZŁ / KG</p>
                            <p className={cn('font-mono font-black text-[10px]', getCostPerKgColor(elem.costPerKg))}>
                              {elem.costPerKg.toFixed(2)}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-stone-100 border border-stone-200/60 rounded-lg px-2 py-1 text-center min-w-[60px]">
                            <p className="text-[8px] text-stone-400 uppercase font-black">ZŁ / KG</p>
                            <p className="font-mono font-bold text-stone-400 text-[9px]">brak</p>
                          </div>
                        )}

                        {/* Przycisk */}
                        <button
                          onClick={() => toggleElement(elemKey)}
                          className="flex items-center gap-0.5 px-2 py-1 bg-stone-900 text-white rounded-lg text-[9px] font-bold hover:bg-stone-700 transition-all shrink-0"
                        >
                          <Users size={10} />
                          <span>{elem.workers.length}</span>
                          {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </button>
                      </div>
                    </div>

                    {/* LISTA PRACOWNIKÓW */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden bg-white text-[10px]"
                        >
                          <div className="bg-stone-50 border-b border-stone-100 px-3 py-1 grid grid-cols-12 font-black uppercase text-[8px] tracking-wider text-stone-400">
                            <div className="col-span-6">Pracownik</div>
                            <div className="col-span-4 text-right">Czas</div>
                            <div className="col-span-2 text-right">Ilość</div>
                          </div>

                          <div className="divide-y divide-stone-100">
                            {elem.workers.map((worker, wIdx) => {
                              const pct = elem.totalSeconds > 0
                                ? (worker.totalSeconds / elem.totalSeconds) * 100
                                : 0;
                              const emp = employees.find(e => e.id === worker.userId);
                              const displayName = emp
                                ? `${emp.lastName} ${emp.firstName}`
                                : worker.userName;

                              return (
                                <div
                                  key={worker.userId + wIdx}
                                  className="px-3 py-2 grid grid-cols-12 items-center hover:bg-stone-50/50 transition-colors"
                                >
                                  <div className="col-span-6 flex flex-col min-w-0 pr-2">
                                    <span className="font-bold text-stone-800 truncate">{displayName}</span>
                                    <div className="mt-0.5 h-1 bg-stone-100 rounded-full w-full max-w-[80px]">
                                      <div
                                        className={cn("h-full rounded-full", isHall ? "bg-emerald-500" : "bg-amber-500")}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>

                                  <div className="col-span-4 text-right font-mono text-stone-600 font-bold">
                                    {formatHours(worker.totalSeconds)} ({formatHoursDecimal(worker.totalSeconds)}h)
                                  </div>

                                  <div className="col-span-2 text-right">
                                    {worker.totalQuantity > 0 ? (
                                      <span className="bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded font-bold text-[9px]">
                                        {worker.totalQuantity} szt.
                                      </span>
                                    ) : (
                                      <span className="text-stone-300">—</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    // Zamiast małego modala, tworzymy widok pełnoekranowy (fixed inset-0)
    <div className="fixed inset-0 z-[100] bg-stone-50 overflow-y-auto flex flex-col">
      {/* Header przypominający osobną podstronę */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-10 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
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
        ) : logs.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-20 text-center text-stone-400 mt-10">
            <Clock size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium text-lg">Brak zapisanych meldunków dla tego zlecenia.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* PRZEŁĄCZNIK ŹRÓDŁA MELDUNKÓW */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-stone-700">Filtruj typ meldunków w tabeli:</span>
              </div>
              <div className="flex bg-stone-100 p-1 rounded-xl h-[40px] items-center w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setLogSource('all')}
                  className={cn(
                    "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 h-full rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                    logSource === 'all' ? "bg-white text-emerald-600 shadow-sm border border-stone-200/50" : "text-stone-500 hover:text-stone-700"
                  )}
                >
                  <Layers size={13} className="shrink-0" />
                  <span>Wszystkie ({logs.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLogSource('hall')}
                  className={cn(
                    "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 h-full rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                    logSource === 'hall' ? "bg-white text-emerald-600 shadow-sm border border-stone-200/50" : "text-stone-500 hover:text-stone-700"
                  )}
                >
                  <Tablet size={13} className="shrink-0" />
                  <span>Hala ({logs.filter(l => !l.manual).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLogSource('manual')}
                  className={cn(
                    "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 h-full rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                    logSource === 'manual' ? "bg-white text-emerald-600 shadow-sm border border-stone-200/50" : "text-stone-500 hover:text-stone-700"
                  )}
                >
                  <PenTool size={13} className="shrink-0" />
                  <span>Ręczne ({logs.filter(l => l.manual).length})</span>
                </button>
              </div>
            </div>

            {/* SEKCJA DWÓCH PODSUMOWAŃ (HALA + RĘCZNE) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {renderSummarySection(
                'hall', 
                'Podsumowanie: Meldunki Hala', 
                hallStats, 
                <Tablet size={16} />
              )}
              {renderSummarySection(
                'manual', 
                'Podsumowanie: Meldunki Ręczne', 
                manualStats, 
                <PenTool size={16} />
              )}
            </div>

            {/* TABELA INDYWIDUALNYCH MELDUNKÓW */}
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-stone-700 ml-1">Szczegółowa lista meldunków:</h3>
              {sortedLogs.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-12 text-center text-stone-400">
                  <AlertCircle size={40} className="mx-auto mb-4 text-stone-300" />
                  <p className="font-bold text-stone-500">Brak meldunków dla wybranego filtru.</p>
                  <p className="text-stone-400 text-sm mt-1">Wybierz inne źródło meldunków.</p>
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

export function EditLogModal({ log, orders, onClose }: { log: WorkLog, orders: ProductionOrder[], onClose: () => void }) {
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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-4 flex flex-col border border-stone-200"
      >
        <div className="p-4 border-b border-stone-100 flex justify-between items-center shrink-0 bg-stone-50 rounded-t-3xl">
          <h3 className="text-lg font-bold flex items-center gap-2 text-stone-800">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Pencil size={16} />
            </div> 
            Edytuj Meldunek
          </h3>
          <button onClick={onClose} className="p-1.5 px-2 bg-white hover:bg-stone-200 border border-stone-200 rounded-full transition-colors shadow-sm"><X size={16} /></button>
        </div>
        
        <div className="p-4 space-y-2 overflow-y-auto">
          {/* Pracownik */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Pracownik</label>
            <div className="flex-1 min-w-0 p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 font-medium text-sm">
              {log.userName}
            </div>
          </div>

          {/* Czas pracy */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-emerald-600/70 text-left shrink-0 ">Czas pracy</label>
            <div className="flex-1 min-w-0 p-2 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Rozpoczęcie</label>
                  <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} className="w-full p-1.5 px-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Zakończenie</label>
                  <input type="datetime-local" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="w-full p-1.5 px-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" />
                </div>
              </div>
              <div className="text-right text-[10px] font-black text-emerald-700">Obecny czas trwania: {previewDurationHours()}h</div>
            </div>
          </div>

          {/* Zlecenie */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0 ">Zlecenie</label>
            <div className="flex-1 min-w-0 relative">
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
                    <input type="text" placeholder={isSearchingArchive ? "Szukanie w archiwum..." : "Szukaj zlecenia..."} value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setShowOrderList(true); handleOrderSearch(e.target.value); }} onFocus={() => setShowOrderList(true)} className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm" />
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
            <div className="flex items-center gap-3">
              <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Część / Element</label>
              <div className="flex-1 min-w-0">
                <select 
                  value={selectedElementId} 
                  onChange={(e) => setSelectedElementId(e.target.value)} 
                  className="w-full p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium text-stone-700 text-sm"
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
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Kategoria</label>
            <div className="flex-1 min-w-0">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm">
                <option value="">Wybierz kategorię...</option>
                {ASSORTMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Ilość */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Ilość (szt.)</label>
            <div className="flex-1 min-w-0">
              <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-sm" />
            </div>
          </div>

          {/* Typ Meldunku */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Typ meldunku</label>
            <div className="flex-1 min-w-0 flex gap-2">
              <button 
                onClick={() => setIsManual(false)} 
                className={`flex-1 p-2 rounded-lg font-bold text-xs transition-all border ${!isManual ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}
              >
                Hala
              </button>
              <button 
                onClick={() => setIsManual(true)} 
                className={`flex-1 p-2 rounded-lg font-bold text-xs transition-all border ${isManual ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}
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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-4 flex flex-col border border-stone-200"
      >
        <div className="p-4 border-b border-stone-100 flex justify-between items-center shrink-0 bg-stone-50 rounded-t-3xl">
          <h3 className="text-lg font-bold flex items-center gap-2 text-stone-800">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Plus size={16} />
            </div> 
            Dodaj Meldunek
          </h3>
          <button onClick={onClose} className="p-1.5 px-2 bg-white hover:bg-stone-200 border border-stone-200 rounded-full transition-colors shadow-sm"><X size={16} /></button>
        </div>
        
        <div className="p-4 space-y-2 overflow-y-auto">
          {/* Pracownik */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Pracownik</label>
            <div className="flex-1 min-w-0 p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 font-medium text-sm">
              {employeeName}
            </div>
          </div>

          {/* Czas pracy */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-emerald-600/70 text-left shrink-0 ">Czas pracy</label>
            <div className="flex-1 min-w-0 p-2 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Rozpoczęcie</label>
                  <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} className="w-full p-1.5 px-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Zakończenie</label>
                  <input type="datetime-local" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="w-full p-1.5 px-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" />
                </div>
              </div>
              <div className="text-right text-[10px] font-black text-emerald-700">Obecny czas trwania: {previewDurationHours()}h</div>
            </div>
          </div>

          {/* Zlecenie */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0 ">Zlecenie</label>
            <div className="flex-1 min-w-0 relative">
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
                    <input type="text" placeholder={isSearchingArchive ? "Szukanie w archiwum..." : "Szukaj zlecenia..."} value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setShowOrderList(true); handleOrderSearch(e.target.value); }} onFocus={() => setShowOrderList(true)} className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm" />
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
            <div className="flex items-center gap-3">
              <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Część / Element</label>
              <div className="flex-1 min-w-0">
                <select 
                  value={selectedElementId} 
                  onChange={(e) => setSelectedElementId(e.target.value)} 
                  className="w-full p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium text-stone-700 text-sm"
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
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Kategoria</label>
            <div className="flex-1 min-w-0">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm">
                <option value="">Wybierz kategorię...</option>
                {ASSORTMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Ilość */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Ilość (szt.)</label>
            <div className="flex-1 min-w-0">
              <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-sm" />
            </div>
          </div>

          {/* Typ Meldunku */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Typ meldunku</label>
            <div className="flex-1 min-w-0 flex gap-2">
              <button 
                onClick={() => setIsManual(false)} 
                className={`flex-1 p-2 rounded-lg font-bold text-xs transition-all border ${!isManual ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}
              >
                Hala
              </button>
              <button 
                onClick={() => setIsManual(true)} 
                className={`flex-1 p-2 rounded-lg font-bold text-xs transition-all border ${isManual ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}
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
