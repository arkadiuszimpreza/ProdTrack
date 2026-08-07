import React, { useState, useEffect, useMemo } from 'react';
import { Package, User } from 'lucide-react';
import { motion } from 'motion/react';
import { Timestamp } from 'firebase/firestore';
import { differenceInSeconds } from 'date-fns';
import { WorkLog, ProductionOrder } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface TVMonitorViewProps {
  activeLogs: WorkLog[];
  orders: ProductionOrder[];
}

interface GroupedLog {
  key: string;
  orderId: string;
  elementName?: string;
  logs: WorkLog[];
}

export function TVMonitorView({ activeLogs, orders }: TVMonitorViewProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Remove manual reload, onSnapshot handles realtime updates seamlessly

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

  const groupedLogs = useMemo(() => {
    const map = new Map<string, GroupedLog>();
    activeLogs.forEach(log => {
      const key = `${log.orderId}_${log.elementName || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          orderId: log.orderId,
          elementName: log.elementName,
          logs: []
        });
      }
      map.get(key)!.logs.push(log);
    });
    return Array.from(map.values());
  }, [activeLogs]);

  if (activeLogs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50 w-full p-8">
        <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-16 text-center text-stone-400 w-full max-w-2xl">
          <Package size={64} className="mx-auto mb-6 opacity-20" />
          <h1 className="text-3xl font-black text-stone-600 mb-2">Brak aktywności na hali</h1>
          <p className="text-xl">Obecnie nie są realizowane żadne zlecenia.</p>
        </div>
      </div>
    );
  }

  const getGridColsClass = (count: number) => {
    if (count <= 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-2 lg:grid-cols-3';
    if (count <= 8) return 'grid-cols-3 lg:grid-cols-4';
    if (count <= 12) return 'grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';
    if (count <= 16) return 'grid-cols-4 lg:grid-cols-5 xl:grid-cols-8';
    return 'grid-cols-5 lg:grid-cols-6 xl:grid-cols-8';
  };

  const isMany = groupedLogs.length > 8;

  return (
    <div className="h-screen bg-stone-50 p-4 w-full flex flex-col font-sans overflow-hidden">
      <header className="mb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex h-4 w-4 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
          </div>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-widest text-stone-800">Hala Spawalnicza - Live</h1>
        </div>
        <div className="text-emerald-700 font-bold bg-emerald-100 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-base md:text-lg border border-emerald-200">
          Aktywne Zlecenia: {groupedLogs.length}
        </div>
      </header>

      <div className={cn("grid gap-3 flex-1 content-start overflow-hidden", getGridColsClass(groupedLogs.length))}>
        {groupedLogs.map((group) => {
          const order = orders.find((o) => o.id === group.orderId);
          return (
            <motion.div
              key={group.key}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-sm border border-stone-200 flex flex-col relative overflow-hidden h-full min-h-0"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />

              <div className="p-3 md:p-4 border-b border-stone-100 bg-stone-50/50 flex flex-col gap-1.5">
                <p className={cn("font-bold text-stone-900 leading-tight", isMany ? "text-xs md:text-sm" : "text-sm md:text-base")}>
                  {order?.productName || 'Brak przypisanego zlecenia'}
                </p>
                {group.elementName && (
                  <p className={cn("font-bold text-stone-600 flex items-center gap-1.5", isMany ? "text-[10px] md:text-xs" : "text-xs md:text-sm")}>
                    <Package size={isMany ? 12 : 14} className="shrink-0" /> <span>{group.elementName}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {order?.orderNumber && (
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 truncate">
                      ZP: {order.orderNumber}
                    </span>
                  )}
                  {order?.projectNumber && (
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 truncate">
                      PROJ: {order.projectNumber}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 md:p-4 flex-1 overflow-hidden flex flex-col justify-center bg-white">
                {group.logs.length === 1 ? (
                  <div className={cn("font-mono font-black text-emerald-600 tabular-nums tracking-tighter flex items-center justify-center", isMany ? "text-3xl" : "text-4xl md:text-5xl")}>
                    {formatTimeStr(getLiveSeconds(group.logs[0].startTime))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                    {group.logs.map((log, idx) => (
                      <div key={log.id} className="flex justify-between items-center bg-stone-50 px-3 py-2 rounded-xl border border-stone-100">
                        <span className="font-bold text-stone-400 text-sm">P{(idx + 1).toString().padStart(2, '0')}</span>
                        <span className={cn("font-mono font-black text-emerald-600 tabular-nums", isMany ? "text-xl" : "text-2xl md:text-3xl")}>
                          {formatTimeStr(getLiveSeconds(log.startTime))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
