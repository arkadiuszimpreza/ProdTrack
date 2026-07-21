import React, { useState, useMemo } from 'react';
import {
  collection, query, where, getDocs, Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  BarChart2, Package, Users, Clock, ChevronDown, ChevronUp,
  Search, Loader2, TrendingUp, Scale, AlertCircle, Hash,
  Tablet, PenTool, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, endOfDay } from 'date-fns';

import { WorkLog, ProductionOrder, Employee } from '../../types';
import { cn } from '../../utils/firestore-helpers';

const HOURLY_RATE = 65.00;

interface ElementStatsViewProps {
  orders: ProductionOrder[];
  employees: Employee[];
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

interface OrderStat {
  orderId: string;
  orderNumber: string;
  erpOrderNumber?: string;
  projectNumber?: string;
  productName: string;
  elements: ElementStat[];
  totalSeconds: number;
  totalLaborCost: number;
}

const formatHours = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const formatHoursDecimal = (seconds: number) => (seconds / 3600).toFixed(2);

export function ElementStatsView({ orders, employees }: ElementStatsViewProps) {
  const [startDate, setStartDate] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const [logSource, setLogSource] = useState<'all' | 'hall' | 'manual'>('all');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<OrderStat[]>([]);
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState(false);

  const toggleElement = (key: string) => {
    setExpandedElements(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const generateStats = async () => {
    setLoading(true);
    setGenerated(false);
    setExpandedElements(new Set());
    try {
      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));

      const q = query(
        collection(db, 'workLogs'),
        where('startTime', '>=', Timestamp.fromDate(start)),
        where('startTime', '<=', Timestamp.fromDate(end))
      );
      const snapshot = await getDocs(q);
      const allLogs = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as WorkLog[];
      const completedLogs = allLogs.filter(l => {
        const isCompleted = l.endTime != null && (l.duration || 0) > 0;
        if (!isCompleted) return false;

        if (logSource === 'hall') return !l.manual;
        if (logSource === 'manual') return !!l.manual;
        return true;
      });

      // Dociąganie archiwalnych zleceń których nie ma w props
      const fetchedArchive = new Map<string, ProductionOrder>();
      const missingIds = Array.from(new Set(
        completedLogs.map(l => l.orderId).filter((id): id is string => !!id && !orders.find(o => o.id === id))
      ));
      if (missingIds.length > 0) {
        for (let i = 0; i < missingIds.length; i += 30) {
          const chunk = missingIds.slice(i, i + 30);
          const archQ = query(collection(db, 'orders'), where('__name__', 'in', chunk));
          const archSnap = await getDocs(archQ);
          archSnap.docs.forEach(d => fetchedArchive.set(d.id, { ...d.data(), id: d.id } as ProductionOrder));
        }
      }

      const findOrder = (id?: string | null): ProductionOrder | undefined => {
        if (!id) return undefined;
        return orders.find(o => o.id === id) || fetchedArchive.get(id);
      };

      // Grupowanie: orderId → elementId → workerMap
      type WorkerAcc = { userId: string; userName: string; totalSeconds: number; totalQuantity: number };
      type ElementAcc = { logs: WorkLog[]; workerMap: Map<string, WorkerAcc> };
      const orderMap = new Map<string, Map<string, ElementAcc>>();

      completedLogs.forEach(log => {
        const oId = log.orderId || 'unknown';
        if (!orderMap.has(oId)) orderMap.set(oId, new Map());
        const elemMap = orderMap.get(oId)!;

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

      // Budowanie struktury wynikowej
      const result: OrderStat[] = [];

      orderMap.forEach((elemMap, oId) => {
        const order = findOrder(oId);
        const elements: ElementStat[] = [];

        elemMap.forEach((elemAcc, eId) => {
          const element = order?.elements?.find(e => e.id === eId);
          const baseWeight = eId === 'whole_order'
            ? (order?.totalWeight || 0)
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
            ? (order?.productName || 'Praca ogólna na zleceniu')
            : (element?.name || log_elementName(elemAcc.logs) || 'Element');

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

        const totalSec = elements.reduce((s, e) => s + e.totalSeconds, 0);
        const totalCost = elements.reduce((s, e) => s + e.laborCost, 0);

        result.push({
          orderId: oId,
          orderNumber: order?.orderNumber || 'Nieznane ZP',
          erpOrderNumber: order?.erpOrderNumber,
          projectNumber: order?.projectNumber,
          productName: order?.productName || 'Brak nazwy produktu',
          elements,
          totalSeconds: totalSec,
          totalLaborCost: totalCost,
        });
      });

      result.sort((a, b) => b.totalLaborCost - a.totalLaborCost);
      setReportData(result);
      setGenerated(true);
    } catch (err) {
      console.error('Błąd generowania statystyk elementów:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper: wyciągnij nazwę elementu z logów jeśli nie ma jej w orders
  function log_elementName(logs: WorkLog[]): string | undefined {
    return logs.find(l => l.elementName)?.elementName;
  }

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return reportData;
    const term = searchTerm.toLowerCase();
    return reportData.filter(o =>
      o.orderNumber.toLowerCase().includes(term) ||
      (o.erpOrderNumber || '').toLowerCase().includes(term) ||
      (o.projectNumber || '').toLowerCase().includes(term) ||
      o.productName.toLowerCase().includes(term)
    );
  }, [reportData, searchTerm]);

  // Sumaryczne KPI
  const totals = useMemo(() => {
    const totalH = filteredData.reduce((s, o) => s + o.totalSeconds, 0) / 3600;
    const totalCost = filteredData.reduce((s, o) => s + o.totalLaborCost, 0);
    const totalOrders = filteredData.length;
    const totalElements = filteredData.reduce((s, o) => s + o.elements.length, 0);
    return { totalH, totalCost, totalOrders, totalElements };
  }, [filteredData]);

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

  return (
    <div className="space-y-6">

      {/* PANEL FILTRÓW */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
            <BarChart2 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black text-stone-900 tracking-tight">Statystyki Elementów ZP</h2>
            <p className="text-xs text-stone-400 font-medium mt-0.5">Godziny pracowników i wskaźnik zł/kg dla zakończonych elementów</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Data od</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-stone-800 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Data do</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-stone-800 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Źródło meldunków</label>
            <div className="flex bg-stone-100 p-1 rounded-xl h-[48px] items-center">
              <button
                type="button"
                onClick={() => setLogSource('all')}
                className={cn(
                  "flex-1 h-full flex items-center justify-center gap-1 px-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                  logSource === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <Layers size={13} className="shrink-0" />
                <span>Wszystkie</span>
              </button>
              <button
                type="button"
                onClick={() => setLogSource('hall')}
                className={cn(
                  "flex-1 h-full flex items-center justify-center gap-1 px-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                  logSource === 'hall' ? "bg-white text-indigo-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <Tablet size={13} className="shrink-0" />
                <span>Hala</span>
              </button>
              <button
                type="button"
                onClick={() => setLogSource('manual')}
                className={cn(
                  "flex-1 h-full flex items-center justify-center gap-1 px-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                  logSource === 'manual' ? "bg-white text-indigo-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <PenTool size={13} className="shrink-0" />
                <span>Ręczne</span>
              </button>
            </div>
          </div>
          <div>
            <button
              onClick={generateStats}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all active:scale-95 disabled:opacity-50 shadow-sm shadow-stone-900/10"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Generowanie...</>
              ) : (
                <><BarChart2 size={18} /> Generuj Statystyki</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* WYNIKI */}
      <AnimatePresence>
        {generated && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="space-y-6"
          >
            {/* KPI BAR */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Zleceń', value: totals.totalOrders.toString(), icon: <Package size={18} />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'Elementów', value: totals.totalElements.toString(), icon: <Hash size={18} />, color: 'text-violet-600', bg: 'bg-violet-50' },
                { label: 'Suma godzin', value: `${totals.totalH.toFixed(1)} h`, icon: <Clock size={18} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Koszt robocizny', value: `${totals.totalCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} zł`, icon: <TrendingUp size={18} />, color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm flex items-center gap-4">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', kpi.bg, kpi.color)}>
                    {kpi.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">{kpi.label}</p>
                    <p className={cn('text-xl font-black truncate', kpi.color)}>{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* WYSZUKIWARKA */}
            {reportData.length > 0 && (
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <input
                  type="text"
                  placeholder="Filtruj po numerze ZP, projekcie, nazwie produktu..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-medium shadow-sm"
                />
              </div>
            )}

            {/* KARTY ZLECEŃ */}
            {filteredData.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-16 text-center">
                <AlertCircle size={40} className="mx-auto mb-4 text-stone-300" />
                <p className="font-bold text-stone-500">Brak wyników dla wybranego okresu i filtrów.</p>
                <p className="text-stone-400 text-sm mt-1">Sprawdź zakres dat lub wybierz inny okres.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {filteredData.map((order, oIdx) => (
                  <motion.div
                    key={order.orderId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: oIdx * 0.04 }}
                    className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden"
                  >
                    {/* NAGŁÓWEK ZLECENIA */}
                    <div className="bg-stone-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/30">
                            ZP: {order.orderNumber}
                          </span>
                          {order.erpOrderNumber && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-300 bg-stone-700 px-2 py-1 rounded border border-stone-600">
                              ZL: {order.erpOrderNumber}
                            </span>
                          )}
                          {order.projectNumber && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-300 bg-blue-500/20 px-2 py-1 rounded border border-blue-500/30">
                              PROJ: {order.projectNumber}
                            </span>
                          )}
                        </div>
                        <h3 className="text-white font-bold text-lg leading-tight">{order.productName}</h3>
                      </div>

                      {/* SUMARYCZNE ZP */}
                      <div className="flex items-center gap-4 bg-stone-900/60 px-5 py-3 rounded-2xl border border-stone-700 shrink-0">
                        <div className="text-center">
                          <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Suma godzin</p>
                          <p className="font-mono text-emerald-400 font-black text-lg">{formatHoursDecimal(order.totalSeconds)}h</p>
                        </div>
                        <div className="w-px h-10 bg-stone-700" />
                        <div className="text-center">
                          <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Koszt robocizny</p>
                          <p className="font-mono text-white font-black text-lg">{order.totalLaborCost.toFixed(0)} zł</p>
                        </div>
                      </div>
                    </div>

                    {/* ELEMENTY */}
                    <div className="p-5 space-y-4">
                      {order.elements.map(elem => {
                        const elemKey = `${order.orderId}_${elem.elementId}`;
                        const isExpanded = expandedElements.has(elemKey);

                        return (
                          <div key={elem.elementId} className="border border-stone-200 rounded-2xl overflow-hidden">
                            {/* NAGŁÓWEK ELEMENTU */}
                            <div className="bg-stone-50 border-b border-stone-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-white border border-stone-200 rounded-xl flex items-center justify-center text-indigo-500 shadow-sm">
                                  <Package size={16} />
                                </div>
                                <div>
                                  <p className="font-bold text-stone-900">{elem.elementName}</p>
                                  {elem.weight > 0 && (
                                    <p className="text-xs text-stone-400 font-mono font-bold flex items-center gap-1 mt-0.5">
                                      <Scale size={11} />
                                      {elem.weight} kg
                                      {elem.isWholeOrder && ' (waga całk.)'}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* STATYSTYKI ELEMENTU */}
                              <div className="flex flex-wrap items-center gap-3">
                                {/* Godziny */}
                                <div className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-center shadow-sm min-w-[90px]">
                                  <p className="text-[9px] text-stone-400 uppercase tracking-widest font-black">Godziny</p>
                                  <p className="font-mono font-black text-stone-800 text-sm">{formatHoursDecimal(elem.totalSeconds)}h</p>
                                </div>

                                {/* Koszt */}
                                <div className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-center shadow-sm min-w-[90px]">
                                  <p className="text-[9px] text-stone-400 uppercase tracking-widest font-black">Koszt rob.</p>
                                  <p className="font-mono font-black text-stone-800 text-sm">{elem.laborCost.toFixed(0)} zł</p>
                                </div>

                                {/* Ilość (jeśli jest) */}
                                {elem.totalQuantity > 0 && (
                                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-center shadow-sm min-w-[90px]">
                                    <p className="text-[9px] text-indigo-500 uppercase tracking-widest font-black">Ilość</p>
                                    <p className="font-mono font-black text-indigo-700 text-sm">{elem.totalQuantity} szt.</p>
                                  </div>
                                )}

                                {/* zł/kg — wyróżniony */}
                                {elem.costPerKg !== null ? (
                                  <div className={cn(
                                    'border rounded-xl px-3 py-2 text-center shadow-sm min-w-[100px]',
                                    getCostPerKgBg(elem.costPerKg)
                                  )}>
                                    <p className={cn('text-[9px] uppercase tracking-widest font-black', getCostPerKgColor(elem.costPerKg))}>ZŁ / KG</p>
                                    <p className={cn('font-mono font-black text-base', getCostPerKgColor(elem.costPerKg))}>
                                      {elem.costPerKg.toFixed(2)}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="bg-stone-100 border border-stone-200 rounded-xl px-3 py-2 text-center min-w-[100px]">
                                    <p className="text-[9px] text-stone-400 uppercase tracking-widest font-black">ZŁ / KG</p>
                                    <p className="font-mono font-bold text-stone-400 text-sm">brak wagi</p>
                                  </div>
                                )}

                                {/* Pracownicy – expand/collapse */}
                                <button
                                  onClick={() => toggleElement(elemKey)}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-700 transition-all active:scale-95 shrink-0"
                                >
                                  <Users size={14} />
                                  {elem.workers.length} prac.
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              </div>
                            </div>

                            {/* ROZWIJANA LISTA PRACOWNIKÓW */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  {/* NAGŁÓWEK TABELI */}
                                  <div className="bg-stone-50 border-b border-stone-100 px-5 py-2 grid grid-cols-12 text-[10px] font-black uppercase tracking-widest text-stone-400">
                                    <div className="col-span-5">Pracownik</div>
                                    <div className="col-span-3 text-right">Godziny</div>
                                    <div className="col-span-2 text-right">Czas [h]</div>
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
                                          className="px-5 py-3 grid grid-cols-12 items-center hover:bg-stone-50/70 transition-colors"
                                        >
                                          {/* Pracownik */}
                                          <div className="col-span-5 flex items-center gap-3">
                                            <div className="w-7 h-7 bg-stone-100 rounded-full flex items-center justify-center text-stone-500 shrink-0">
                                              <Users size={13} />
                                            </div>
                                            <div className="min-w-0">
                                              <p className="font-bold text-stone-900 text-sm truncate">{displayName}</p>
                                              {/* Pasek udziału */}
                                              <div className="mt-1 h-1.5 bg-stone-100 rounded-full w-full max-w-[120px]">
                                                <div
                                                  className="h-full bg-indigo-400 rounded-full"
                                                  style={{ width: `${pct}%` }}
                                                />
                                              </div>
                                            </div>
                                          </div>

                                          {/* Godziny w formacie XhYYm */}
                                          <div className="col-span-3 text-right font-mono text-stone-600 font-bold text-sm">
                                            {formatHours(worker.totalSeconds)}
                                          </div>

                                          {/* Czas dziesiętny */}
                                          <div className="col-span-2 text-right font-mono text-stone-400 text-sm">
                                            {formatHoursDecimal(worker.totalSeconds)}h
                                          </div>

                                          {/* Ilość */}
                                          <div className="col-span-2 text-right">
                                            {worker.totalQuantity > 0 ? (
                                              <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-lg font-bold text-xs">
                                                {worker.totalQuantity} szt.
                                              </span>
                                            ) : (
                                              <span className="text-stone-300 text-xs">—</span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* STOPKA Z SUMĄ */}
                                  <div className="bg-stone-50 border-t border-stone-200 px-5 py-2.5 grid grid-cols-12 text-xs font-black text-stone-500">
                                    <div className="col-span-5 uppercase tracking-widest">Suma elementu</div>
                                    <div className="col-span-3 text-right font-mono text-stone-700">
                                      {formatHours(elem.totalSeconds)}
                                    </div>
                                    <div className="col-span-2 text-right font-mono text-stone-700">
                                      {formatHoursDecimal(elem.totalSeconds)}h
                                    </div>
                                    <div className="col-span-2 text-right">
                                      {elem.totalQuantity > 0 ? (
                                        <span className="text-indigo-700">{elem.totalQuantity} szt.</span>
                                      ) : '—'}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* STAN POCZĄTKOWY */}
      {!generated && !loading && (
        <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-16 text-center text-stone-400">
          <BarChart2 size={48} className="mx-auto mb-4 opacity-20" />
          <h3 className="text-xl font-bold text-stone-500 mb-2">Wybierz zakres dat i wygeneruj statystyki</h3>
          <p className="text-sm">Widok pokaże godziny pracowników i wskaźnik zł/kg dla zakończonych elementów zleceń produkcyjnych.</p>
        </div>
      )}
    </div>
  );
}
