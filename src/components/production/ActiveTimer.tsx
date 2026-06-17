import React, { useState, useEffect } from 'react';
import { Users, Clock, Square, Search, Trash2, AlertTriangle, CheckCircle, Pause } from 'lucide-react';
import { differenceInSeconds } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

import { WorkLog, ProductionOrder, Employee, WorkSession } from '../../types';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';

export function ActiveTimer({ 
  log, 
  onStop,
  orders,
  operator,
  activeSessions
}: { 
  log: WorkLog, 
  onStop: (reports?: { orderId: string, elementId?: string, quantity: number }[]) => void,
  orders: ProductionOrder[],
  operator: Employee,
  activeSessions: WorkSession[]
}) {
  const [seconds, setSeconds] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [teamReports, setTeamReports] = useState<{ orderId: string, elementId?: string, quantity: number }[]>([]);
  const [reportSearch, setReportSearch] = useState('');

  const currentSession = activeSessions.find(s => s.id === log.sessionId);
  const isLeader = currentSession?.leaderId === operator?.id;

  useEffect(() => {
    const start = log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime);
    const interval = setInterval(() => {
      setSeconds(differenceInSeconds(new Date(), start));
    }, 1000);
    return () => clearInterval(interval);
  }, [log.startTime]);

  // --- BRAMKA BEZPIECZEŃSTWA ---
  if (!operator) {
    return (
      <div className="bg-red-900/50 border border-red-500 text-white p-6 rounded-3xl shadow-2xl text-center">
        <h3 className="text-xl font-bold text-red-400 mb-2">Błąd krytyczny procesu</h3>
        <p>System zgubił dane operatora. Zaloguj się ponownie, aby rozpocząć pracę.</p>
      </div>
    );
  }
  // -----------------------------

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const addReport = (order: ProductionOrder, elementId?: string) => {
    if (teamReports.find(r => r.orderId === order.id && r.elementId === elementId)) return;
    setTeamReports([...teamReports, { orderId: order.id, elementId, quantity: 0 }]);
    setReportSearch('');
  };

  const updateTeamReport = (orderId: string, elementId: string | undefined, q: number) => {
    setTeamReports(teamReports.map(r => 
      (r.orderId === orderId && r.elementId === elementId) ? { ...r, quantity: q } : r
    ));
  };

  const removeTeamReport = (orderId: string, elementId: string | undefined) => {
    setTeamReports(teamReports.filter(r => !(r.orderId === orderId && r.elementId === elementId)));
  };

  // --- RENDROWANIE ZATRZYMANIA PRACY ---
  if (showReport) {
    
    // 1. SCENARIUSZ: PRACA ZESPOŁOWA (Lider zamyka sesję)
    if (log.sessionId && isLeader) {
      return (
        <div className="bg-stone-900 text-white p-8 rounded-[3rem] shadow-2xl flex flex-col gap-6 max-w-2xl mx-auto">
          <div className="text-center">
            <h3 className="text-2xl font-black mb-2">Zakończ sesję i zaraportuj</h3>
            <p className="text-stone-400 text-sm">Wybierz zlecenia wykonane przez zespół i podaj ilości.</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" size={18} />
              <input 
                type="text"
                placeholder="Dodaj zlecenie do raportu..."
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-800 border border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              />
              {reportSearch && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-stone-800 border border-stone-700 rounded-xl shadow-2xl z-50 max-h-64 overflow-auto custom-scrollbar">
                  {orders
                    .filter(o => {
                      if (o.status === 'completed' || o.status === 'reported') return false;
                      const terms = parseSearchTerms(reportSearch);
                      if (terms.length === 0) return true;
                      const searchableText = `${o.orderNumber} ${o.erpOrderNumber || ''} ${o.productName} ${o.projectNumber || ''} ${o.articleNumber || ''} ${o.clientName || ''}`;
                      return matchesAllTerms(searchableText, terms);
                    })
                    .slice(0, 10)
                    .map(o => (
                      <React.Fragment key={o.id}>
                        <button onClick={() => addReport(o)} className="w-full p-3 text-left hover:bg-stone-700 transition-colors text-xs border-b border-stone-700 font-bold text-stone-300">
                          <span className="text-emerald-400">ZP: {o.orderNumber}</span> | {o.productName} (Całość)
                        </button>
                        {o.elements?.map(el => (
                          <button key={`${o.id}-${el.id}`} onClick={() => addReport(o, el.id)} className="w-full p-3 pl-8 text-left hover:bg-stone-700 transition-colors text-xs border-b border-stone-700 text-stone-400">
                            └─ <span className="text-emerald-400/70">Element:</span> {el.name}
                          </button>
                        ))}
                      </React.Fragment>
                    ))
                  }
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-60 overflow-auto pr-2 custom-scrollbar">
              {teamReports.map(report => {
                const order = orders.find(o => o.id === report.orderId);
                const element = order?.elements?.find(e => e.id === report.elementId);
                return (
                  <div key={`${report.orderId}-${report.elementId || 'root'}`} className="bg-stone-800 p-4 rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{element ? element.name : order?.productName}</p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest">
                        ZP: {order?.orderNumber} {element ? '| El: ' + element.name : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateTeamReport(report.orderId, report.elementId, Math.max(0, report.quantity - 1))} className="w-8 h-8 rounded-lg bg-stone-700 flex items-center justify-center hover:bg-stone-600">-</button>
                      <input 
                        type="number"
                        value={report.quantity}
                        onChange={(e) => updateTeamReport(report.orderId, report.elementId, Number(e.target.value))}
                        className="w-16 text-center bg-transparent border-b border-stone-600 font-bold focus:outline-none focus:border-emerald-500"
                      />
                      <button onClick={() => updateTeamReport(report.orderId, report.elementId, report.quantity + 1)} className="w-8 h-8 rounded-lg bg-stone-700 flex items-center justify-center hover:bg-stone-600">+</button>
                      <button onClick={() => removeTeamReport(report.orderId, report.elementId)} className="ml-2 p-2 text-stone-500 hover:text-red-400"><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              })}
              {teamReports.length === 0 && (
                <div className="py-8 text-center text-stone-500 italic text-sm">
                  Brak wybranych zleceń.
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={() => setShowReport(false)} className="flex-1 py-4 rounded-2xl bg-stone-800 font-bold hover:bg-stone-700 transition-all">Wróć</button>
            <button onClick={() => onStop(teamReports)} disabled={teamReports.length === 0} className="flex-[2] py-4 rounded-2xl bg-emerald-600 font-black uppercase tracking-widest hover:bg-emerald-500 transition-all disabled:opacity-50">
              Zakończ i Rozlicz Sesję
            </button>
          </div>
        </div>
      );
    }

    // --- LOGIKA DETEKCJI PRODUKCJI JEDNOSTKOWEJ (Praca Indywidualna) ---
    const currentOrder = orders.find(o => o.id === log.orderId);
    const currentElement = currentOrder?.elements?.find(e => e.id === log.elementId);

    // Jeśli to jest element i nie ma zdefiniowanej ilości, traktujemy go sztywno jako 1 sztukę.
    const targetQty = currentElement ? (currentElement.quantity || 1) : (currentOrder?.targetQuantity || 0);
    
    // Sprawdzamy ile sztuk zameldowano już w aplikacji
    const reportedQty = currentElement ? (currentElement.reportedQuantity || 0) : (currentOrder?.appReportedQuantity || 0);

    const isSingleUnit = log.orderId && targetQty === 1;
    const isAlreadyReported = isSingleUnit && reportedQty >= 1;

    return (
      <div className="bg-stone-900 text-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 max-w-md mx-auto">
        {log.sessionId ? (
          // 2. SCENARIUSZ: Członek opuszcza zespół (zawsze zgłasza 0, lider raportuje)
          <>
            <h3 className="text-xl font-bold">Czy na pewno chcesz opuścić zespół?</h3>
            <div className="flex gap-3 w-full mt-2">
              <button onClick={() => setShowReport(false)} className="flex-1 py-3 rounded-xl bg-stone-800 font-bold hover:bg-stone-700 transition-all">Wróć</button>
              <button onClick={() => onStop()} className="flex-[2] py-3 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-500 transition-all">Opuść Zespół</button>
            </div>
          </>
        ) : isSingleUnit ? (
          // 3. SCENARIUSZ: SMART UI (Produkcja Jednostkowa / 1 Sztuka)
          <>
            <div className="text-center w-full border-b border-stone-800 pb-4 mb-2">
              <h3 className="text-2xl font-black">Zakończenie pracy</h3>
              <p className="text-xs text-stone-400 uppercase tracking-widest font-bold mt-1">Produkcja Jednostkowa (1 szt.)</p>
            </div>
            
            {isAlreadyReported ? (
              <div className="bg-amber-950/40 border border-amber-500/30 p-4 rounded-2xl text-center space-y-2 w-full mb-2">
                <div className="flex items-center justify-center gap-2 text-amber-500 mb-1">
                  <AlertTriangle size={18} />
                  <span className="font-bold text-sm">Uwaga - Element zameldowany</span>
                </div>
                <p className="text-amber-200/70 text-xs">Ten detal został już zameldowany przez współpracownika. Możesz jedynie zakończyć swój czas pracy (0 sztuk).</p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 w-full mt-2">
              {!isAlreadyReported && (
                <button 
                  onClick={() => onStop([{ orderId: log.orderId!, elementId: log.elementId, quantity: 1 }])}
                  className="w-full py-5 rounded-2xl bg-emerald-600 text-white font-black uppercase tracking-wider hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/30 active:scale-95 flex items-center justify-center gap-3"
                >
                  <CheckCircle size={24} className="opacity-80" />
                  Zamelduj wykonanie (1 szt.)
                </button>
              )}
              
              <button 
                onClick={() => onStop([{ orderId: log.orderId!, elementId: log.elementId, quantity: 0 }])}
                className={`w-full py-5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 font-bold ${
                  isAlreadyReported 
                    ? "bg-stone-800 text-stone-300 hover:bg-stone-700" 
                    : "bg-amber-500 text-amber-950 hover:bg-amber-400 shadow-lg shadow-amber-900/20"
                }`}
              >
                <Pause size={20} className="opacity-80" fill="currentColor" />
                {isAlreadyReported ? 'Zakończ swój czas (0 szt.)' : 'Wstrzymaj pracę (0 szt.)'}
              </button>
              
              <button 
                onClick={() => setShowReport(false)}
                className="w-full py-3 mt-2 rounded-xl bg-transparent font-bold text-stone-500 hover:text-stone-300 transition-all flex items-center justify-center gap-2"
              >
                Wróć do pracy
              </button>
            </div>
          </>
        ) : (
          // 4. SCENARIUSZ: STANDARDOWY UI (Produkcja Seryjna > 1)
          <>
            <h3 className="text-xl font-bold">Ile sztuk wykonano?</h3>
            {currentOrder && (
              <div className="bg-stone-800/50 px-4 py-2 rounded-lg border border-stone-700/50 flex gap-4 text-xs">
                <span className="text-stone-400">Cel: <strong className="text-stone-200">{targetQty} szt.</strong></span>
                <span className="text-stone-400">Gotowe: <strong className="text-emerald-400">{reportedQty} szt.</strong></span>
              </div>
            )}
            <div className="flex items-center gap-4 my-4">
              <button onClick={() => setQuantity(Math.max(0, quantity - 1))} className="w-14 h-14 rounded-full bg-stone-800 flex items-center justify-center text-3xl hover:bg-stone-700 transition-all shadow-inner">-</button>
              <input 
                type="number" 
                value={quantity} 
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-24 text-center text-4xl font-black bg-transparent border-b-2 border-emerald-500 focus:outline-none focus:border-emerald-400 transition-colors"
              />
              <button onClick={() => setQuantity(quantity + 1)} className="w-14 h-14 rounded-full bg-stone-800 flex items-center justify-center text-3xl hover:bg-stone-700 transition-all shadow-inner">+</button>
            </div>
            <div className="flex gap-3 w-full max-w-xs mt-2">
              <button onClick={() => setShowReport(false)} className="flex-1 py-4 rounded-xl bg-stone-800 font-bold hover:bg-stone-700 transition-all">Wróć</button>
              <button onClick={() => onStop([{ orderId: log.orderId!, elementId: log.elementId, quantity }])} className="flex-[2] py-4 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 active:scale-95">Zatwierdź i Stop</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-stone-900 text-white p-6 rounded-3xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-emerald-500/20 text-emerald-500 rounded-2xl flex items-center justify-center animate-pulse">
          {log.sessionId ? <Users size={24} /> : <Clock size={24} />}
        </div>
        <div className="text-left">
          <p className="text-stone-400 text-xs uppercase tracking-widest font-bold">
            {log.sessionId ? `Sesja: ${log.stationName}` : (log.orderNumber ? `Zlecenie ${log.orderNumber}` : 'Praca ogólna')}
          </p>
          <p className="font-bold text-lg">
            {log.sessionId ? (isLeader ? 'Lider zespołu' : 'Członek zespołu') : (log.elementName ? `Element: ${log.elementName}` : 'Praca w toku...')}
          </p>
        </div>
      </div>

      <div className="text-4xl font-mono font-bold tabular-nums tracking-tighter">
        {formatTime(seconds)}
      </div>

      <button 
        onClick={() => setShowReport(true)}
        className="flex items-center gap-2 px-8 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95"
      >
        <Square size={20} fill="currentColor" />
        {log.sessionId ? (isLeader ? 'Zakończ Sesję' : 'Opuść Zespół') : 'Zatrzymaj pracę'}
      </button>
    </div>
  );
}