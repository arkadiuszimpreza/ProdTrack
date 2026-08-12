import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy, documentId } from 'firebase/firestore';
import { db } from '../../firebase';
import { WorkLog, Employee, ProductionOrder } from '../../types';
import { Calendar, ChevronLeft, ChevronRight, Loader2, RefreshCw, History, Pencil, Plus } from 'lucide-react';
import { format, startOfDay, endOfDay, addDays, subDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import { EditLogModal, AddLogModal } from '../production/OrderLogsView';

export const EmployeeTimelineView: React.FC<{ 
  orders?: ProductionOrder[];
  onViewOrderLogs?: (order: ProductionOrder) => void;
}> = ({ orders = [], onViewOrderLogs }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [historicalOrders, setHistoricalOrders] = useState<ProductionOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [logSource, setLogSource] = useState<'all' | 'hall' | 'manual'>('hall');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);
  const [isAddingGlobalLog, setIsAddingGlobalLog] = useState(false);
  const [addingLogForEmployee, setAddingLogForEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchLogsForDate(selectedDate);
  }, [selectedDate]);

  const fetchEmployees = async () => {
    try {
      const q = query(collection(db, 'employees'), orderBy('lastName', 'asc'));
      const snapshot = await getDocs(q);
      const employeesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Employee[];
      setEmployees(employeesData);
    } catch (error) {
      console.error("Error fetching employees:", error);
    }
  };

  const fetchLogsForDate = async (date: Date) => {
    setIsLoading(true);
    try {
      const start = Timestamp.fromDate(startOfDay(date));
      const end = Timestamp.fromDate(endOfDay(date));

      const q = query(
        collection(db, 'workLogs'),
        where('startTime', '>=', start),
        where('startTime', '<=', end)
      );

      const snapshot = await getDocs(q);
      const logsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as WorkLog[];
      setLogs(logsData);
      
      // Fetch missing orders
      const orderIds = Array.from(new Set(logsData.map(l => l.orderId).filter(Boolean)));
      const existingOrderIds = new Set(orders.map(o => o.id));
      const missingOrderIds = orderIds.filter(id => !existingOrderIds.has(id));
      
      if (missingOrderIds.length > 0) {
        try {
          const ordersToFetch = [];
          for (let i = 0; i < missingOrderIds.length; i += 10) {
            const chunk = missingOrderIds.slice(i, i + 10);
            const chunkQ = query(collection(db, 'orders'), where(documentId(), 'in', chunk));
            const chunkSnapshot = await getDocs(chunkQ);
            ordersToFetch.push(...chunkSnapshot.docs.map(d => ({ ...d.data(), id: d.id } as ProductionOrder)));
          }
          setHistoricalOrders(prev => {
            const newOrders = ordersToFetch.filter(o => !prev.some(p => p.id === o.id));
            return [...prev, ...newOrders];
          });
        } catch (e) {
          console.error("Error fetching historical orders:", e);
        }
      }

    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevDay = () => setSelectedDate(prev => subDays(prev, 1));
  const handleNextDay = () => setSelectedDate(prev => addDays(prev, 1));
  
  const filteredLogs = logs.filter(l => {
    if (logSource === 'hall') return !l.manual;
    if (logSource === 'manual') return !!l.manual;
    return true;
  });

  const getMinMaxTime = () => {
    if (filteredLogs.length === 0) return { min: 6, max: 18 };
    
    let minHour = 24;
    let maxHour = 0;
    
    filteredLogs.forEach(log => {
      if (log.startTime) {
        const startHour = (log.startTime as any).toDate().getHours();
        if (startHour < minHour) minHour = startHour;
        
        const endDate = log.endTime ? (log.endTime as any).toDate() : new Date();
        const endHour = endDate.getHours() + (endDate.getMinutes() > 0 ? 1 : 0);
        if (endHour > maxHour) maxHour = endHour;
      }
    });
    
    minHour = Math.max(0, Math.min(minHour - 1, 6));
    maxHour = Math.min(24, Math.max(maxHour + 1, 18));
    
    return { min: minHour, max: maxHour };
  };

  const timeRange = getMinMaxTime();
  const totalHours = timeRange.max - timeRange.min;

  const displayEmployees = employees.filter(emp => filteredLogs.some(log => log.userId === emp.id));

  const getLogStyle = (log: WorkLog) => {
    const startDate = (log.startTime as any).toDate();
    const startHour = startDate.getHours() + startDate.getMinutes() / 60;
    
    const endDate = log.endTime ? (log.endTime as any).toDate() : new Date();
    let endHour = endDate.getHours() + endDate.getMinutes() / 60;
    
    if (endDate.getDate() !== startDate.getDate()) {
        endHour = 24;
    }

    if (endHour < startHour) endHour = 24;

    const leftPercent = Math.max(0, ((startHour - timeRange.min) / totalHours) * 100);
    const widthPercent = Math.min(100 - leftPercent, ((endHour - startHour) / totalHours) * 100);

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/80 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Calendar size={20} className="text-indigo-600" />
          Oś czasu pracowników
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200/50">
            <button
              onClick={() => setLogSource('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${logSource === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              WSZYSTKIE
            </button>
            <button
              onClick={() => setLogSource('hall')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${logSource === 'hall' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              HALA
            </button>
            <button
              onClick={() => setLogSource('manual')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${logSource === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              RĘCZNE
            </button>
          </div>
          <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <button onClick={handlePrevDay} className="p-2 hover:bg-slate-50 text-slate-600 border-r border-slate-200 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <div className="px-4 py-2 font-medium text-slate-700 min-w-[160px] text-center text-sm">
              {format(selectedDate, 'd MMMM yyyy', { locale: pl })}
            </div>
            <button onClick={handleNextDay} className="p-2 hover:bg-slate-50 text-slate-600 border-l border-slate-200 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
          <button 
            onClick={() => setIsAddingGlobalLog(true)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white font-semibold text-xs rounded-lg shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Plus size={16} />
            Dodaj meldunek
          </button>
          <button 
            onClick={() => fetchLogsForDate(selectedDate)}
            className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            title="Odśwież"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin text-indigo-600" : ""} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 pb-32 bg-slate-50/50">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Loader2 size={32} className="animate-spin mb-3 text-indigo-500" />
            <span className="text-sm font-medium">Wczytywanie osi czasu...</span>
          </div>
        ) : (
          <div className="min-w-[1000px] bg-white border border-slate-200 rounded-xl shadow-sm">
            {/* Oś czasu (nagłówek) */}
            <div className="flex border-b border-slate-200 bg-slate-50/80 rounded-t-xl">
              <div className="w-56 flex-shrink-0 p-4 border-r border-slate-200 font-semibold text-slate-700 text-sm flex items-center">
                Pracownik
              </div>
              <div className="flex-1 relative">
                {Array.from({ length: totalHours + 1 }).map((_, i) => (
                  <div 
                    key={i} 
                    className="absolute top-0 bottom-0 border-l border-slate-200/50"
                    style={{ left: `${(i / totalHours) * 100}%` }}
                  >
                    <span className="absolute top-3 -translate-x-1/2 bg-slate-50/80 px-1 text-xs font-medium text-slate-500">
                      {timeRange.min + i}:00
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Wiersze pracowników */}
            <div className="flex flex-col divide-y divide-slate-100">
              {displayEmployees.map(emp => {
                const empLogs = filteredLogs.filter(log => log.userId === emp.id).sort((a, b) => (a.startTime as any).toDate().getTime() - (b.startTime as any).toDate().getTime());
                
                const lanes: WorkLog[][] = [];
                empLogs.forEach(log => {
                  let placed = false;
                  for (const lane of lanes) {
                    const lastLog = lane[lane.length - 1];
                    const lastEnd = lastLog.endTime ? (lastLog.endTime as any).toDate() : new Date();
                    if (lastEnd <= (log.startTime as any).toDate()) {
                      lane.push(log);
                      placed = true;
                      break;
                    }
                  }
                  if (!placed) {
                    lanes.push([log]);
                  }
                });

                const rowHeight = Math.max(1, lanes.length) * 56 + 16; // 56px per lane + 16px padding

                return (
                  <div key={emp.id} className="flex hover:bg-slate-50/80 transition-colors group/row">
                    <div className="w-56 flex-shrink-0 p-4 border-r border-slate-200 flex items-center justify-between group/emp">
                      <div className="flex items-center truncate">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs mr-3 flex-shrink-0">
                          {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-slate-700 truncate group-hover/row:text-indigo-700 transition-colors">
                          {emp.firstName} {emp.lastName}
                        </span>
                      </div>
                      <button 
                        onClick={() => setAddingLogForEmployee(emp)}
                        className="opacity-0 group-hover/emp:opacity-100 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex-shrink-0"
                        title="Dodaj meldunek"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="flex-1 relative py-2" style={{ height: `${rowHeight}px` }}>
                      {/* Siatka tła */}
                      <div className="absolute inset-0 pointer-events-none">
                         {Array.from({ length: totalHours + 1 }).map((_, i) => (
                           <div 
                             key={i} 
                             className="absolute top-0 bottom-0 border-l border-slate-100" 
                             style={{ left: `${(i / totalHours) * 100}%` }}
                           ></div>
                         ))}
                      </div>
                      
                      {/* Bloki logów */}
                      {lanes.map((lane, laneIndex) => 
                        lane.map(log => {
                          const style = getLogStyle(log);
                          const isFinished = !!log.endTime;
                          const isExpanded = expandedLogId === log.id;
                          const order = orders?.find(o => o.id === log.orderId) || historicalOrders.find(o => o.id === log.orderId);
                          const productName = log.productName || order?.productName;
                          const clientName = log.clientName || order?.clientName;
                          const projectNumber = order?.projectNumber;
                          
                          return (
                            <div 
                              key={log.id}
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className={`absolute border rounded-md px-3 shadow-sm hover:shadow-md transition-all cursor-pointer group/log flex items-center ${isFinished ? 'bg-white border-slate-300' : 'bg-emerald-50 border-emerald-400 shadow-emerald-100 border-dashed'} ${isExpanded ? 'z-50 ring-2 ring-indigo-500 h-auto py-2' : (isFinished ? 'overflow-hidden' : 'overflow-visible z-20')}`}
                              style={{ 
                                ...style, 
                                top: `${laneIndex * 56 + 8}px`, 
                                height: isExpanded ? 'auto' : '48px',
                                minHeight: '48px',
                                width: isExpanded ? 'fit-content' : style.width,
                                minWidth: isExpanded ? style.width : '0',
                                maxWidth: isExpanded ? `max(400px, ${style.width})` : 'none',
                                zIndex: isExpanded ? 50 : (!isFinished ? 20 : 10),
                              }}
                              title={`Zlecenie: ${log.orderNumber || 'Brak'} \nElement: ${log.elementName || '-'} \nCzas: ${format((log.startTime as any).toDate(), 'HH:mm')} - ${log.endTime ? format((log.endTime as any).toDate(), 'HH:mm') : 'teraz'}`}
                            >
                              <div className={`text-xs font-medium leading-tight w-full flex flex-col ${isFinished ? 'text-slate-700 overflow-hidden' : 'text-emerald-800'}`}>
                                <div className="flex items-baseline gap-1 w-full min-w-0">
                                  <span className="font-bold shrink-0 whitespace-nowrap">{log.orderNumber || 'Zlecenie'}</span>
                                  {productName && <span className={`text-[10px] text-slate-500 font-normal ${isExpanded ? '' : (isFinished ? 'truncate' : 'whitespace-nowrap')}`}>{productName}</span>}
                                </div>
                                {log.elementName ? <div className={`mt-0.5 ${isExpanded ? '' : (isFinished ? 'truncate' : 'whitespace-nowrap')}`}>{log.elementName}</div> : ''}
                                {isExpanded && (
                                  <div className="mt-2 pt-2 border-t border-slate-200/50 flex flex-col gap-1 text-[11px] text-slate-500">
                                    {clientName && (
                                      <div className="flex justify-between">
                                        <span>Kontrahent:</span>
                                        <span className="font-semibold text-right">{clientName}</span>
                                      </div>
                                    )}
                                    {projectNumber && (
                                      <div className="flex justify-between">
                                        <span>Kontrakt:</span>
                                        <span className="font-semibold text-right">{projectNumber}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span>Zlecenie:</span>
                                      <span className="font-semibold text-right">{log.orderNumber || 'Brak'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Rozpoczęcie:</span>
                                      <span className="font-semibold text-right">{format((log.startTime as any).toDate(), 'HH:mm')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Zakończenie:</span>
                                      <span className="font-semibold text-right">{log.endTime ? format((log.endTime as any).toDate(), 'HH:mm') : 'W trakcie'}</span>
                                    </div>
                                                                        <div className="flex gap-2 mt-2">
                                      {order && onViewOrderLogs && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedLogId(null);
                                            onViewOrderLogs(order);
                                          }}
                                          className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                                        >
                                          <History size={12} />
                                          Historia zlecenia
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedLogId(null);
                                          setEditingLog(log);
                                        }}
                                        className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                                      >
                                        <Pencil size={12} />
                                        Edytuj meldunek
                                      </button>
                                    </div>
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
              })}
              {displayEmployees.length === 0 && (
                <div className="p-12 flex flex-col items-center justify-center text-slate-500">
                  <Calendar size={48} className="text-slate-300 mb-4" />
                  <p className="text-lg font-medium text-slate-600">Brak logów pracy</p>
                  <p className="text-sm">Nie znaleziono żadnych wpisów dla wybranego dnia.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {editingLog && (
        <EditLogModal 
          log={editingLog} 
          orders={Array.from(new Map([...orders, ...historicalOrders].map(o => [o.id, o])).values())} 
          onClose={() => {
            setEditingLog(null);
            fetchLogsForDate(selectedDate); // Refresh logs after editing
          }} 
        />
      )}

      {addingLogForEmployee && (
        <AddLogModal 
          employeeId={addingLogForEmployee.id}
          employeeName={`${addingLogForEmployee.firstName} ${addingLogForEmployee.lastName}`}
          orders={Array.from(new Map([...orders, ...historicalOrders].map(o => [o.id, o])).values())}
          initialDate={selectedDate}
          onClose={() => {
            setAddingLogForEmployee(null);
            fetchLogsForDate(selectedDate);
          }}
        />
      )}
      
      {isAddingGlobalLog && (
        <AddLogModal 
          employees={employees}
          orders={Array.from(new Map([...orders, ...historicalOrders].map(o => [o.id, o])).values())}
          initialDate={selectedDate}
          onClose={() => {
            setIsAddingGlobalLog(false);
            fetchLogsForDate(selectedDate);
          }}
        />
      )}
    </div>
  );
};
