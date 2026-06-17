import React, { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { 
  Clock, 
  Users, 
  Search, 
  LogOut, 
  User, 
  UserPlus, 
  ArrowLeft, 
  Factory, 
  X, 
  CheckCircle2,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { ProductionOrder, Employee, WorkLog, WorkStation, WorkSession, OrderElement } from '../../types';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';

// OTO NASI WYDZIELENI ASYSTENCI
import { ActiveTimer } from './ActiveTimer';
import { OrderCard } from './OrderCard';
import { ElementSelectionModal } from '../common/ElementSelectionModal';
import { VirtualNumpad } from './VirtualNumpad';

interface OperatorPanelProps {
  operator: Employee;
  orders: ProductionOrder[];
  activeLog: WorkLog | null;
  allActiveLogs: WorkLog[];
  workStations: WorkStation[];
  activeSessions: WorkSession[];
  onLogout: () => void;
  // ZMIANA: Pozwalamy na opcjonalny element
  onStartWork: (order: ProductionOrder, element?: OrderElement) => Promise<void> | void;
  onStopWork: (reports?: { orderId: string; quantity: number }[]) => Promise<void> | void;
  onStartTeamWork: (station: WorkStation) => Promise<void> | void;
  onJoinTeam: (session: WorkSession) => Promise<void> | void;
}

export function OperatorPanel({
  operator,
  orders,
  activeLog,
  allActiveLogs,
  workStations,
  activeSessions,
  onLogout,
  onStartWork,
  onStopWork,
  onStartTeamWork,
  onJoinTeam
}: OperatorPanelProps) {
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerKey, setTimerKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNumpad, setShowNumpad] = useState(false);
  const [mode, setMode] = useState<'individual' | 'start-team' | 'join-team' | null>(null);
  const [selectingElementOrder, setSelectingElementOrder] = useState<ProductionOrder | null>(null);

  // DODANE: Blokada ekranu, żeby operator nie wyklikał 5 zleceń z rzędu w ułamek sekundy
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Automatyczne wylogowanie ---
  useEffect(() => {
    if (timeLeft <= 0) {
      onLogout();
    }
  }, [timeLeft, onLogout]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    const resetTimer = () => {
      setTimeLeft(30);
      setTimerKey(k => k + 1);
    };
    
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('touchstart', resetTimer);

    return () => {
      clearInterval(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, []);

  // --- BEZPIECZNE FUNKCJE (Z Blokadą "Szybkiego Palca") ---
  const handleStartWork = async (order: ProductionOrder, element?: OrderElement) => {
    if (isProcessing) return;

    // Jeśli zlecenie ma elementy, a my jeszcze żadnego nie wybraliśmy
    if (order.elements && order.elements.length > 0 && !element) {
      setSelectingElementOrder(order);
      return;
    }

    setIsProcessing(true);
    try {
      await onStartWork(order, element);
      if (selectingElementOrder) setSelectingElementOrder(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStopWork = async (reports?: any) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onStopWork(reports);
      setMode(null); // Wraca do głównego menu po zakończeniu zlecenia!
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartTeamWork = async (station: WorkStation) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onStartTeamWork(station);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleJoinTeam = async (session: WorkSession) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onJoinTeam(session);
      setMode(null); // Wraca do głównego menu po dołączeniu
    } finally {
      setIsProcessing(false);
    }
  };
  // ---------------------------------------------------------

  const filteredOrders = orders
    .filter(o => o.status !== 'completed' && o.status !== 'reported')
    .filter(order => {
      const terms = parseSearchTerms(searchTerm);
      if (terms.length === 0) return true;
      const searchableText = `${order.orderNumber} ${order.erpOrderNumber || ''} ${order.productName} ${order.projectNumber || ''} ${order.articleNumber || ''} ${order.clientName || ''}`;
      return matchesAllTerms(searchableText, terms);
    })
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <AnimatePresence>
        {selectingElementOrder && (
          <ElementSelectionModal 
            order={selectingElementOrder} 
            onSelect={(element) => handleStartWork(selectingElementOrder, element)}
            onCancel={() => setSelectingElementOrder(null)}
          />
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 md:p-12 rounded-[3rem] shadow-2xl max-w-5xl w-full text-center border border-stone-100 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-2 bg-stone-100">
          <motion.div 
            key={timerKey}
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 30, ease: "linear" }}
            className="h-full bg-emerald-500"
          />
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center gap-8 mb-8 text-left relative">
          <div className="flex items-center gap-6 flex-1">
            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center shrink-0">
              <CheckCircle2 size={48} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-stone-900 mb-1 tracking-tight">Witaj, {operator.firstName}!</h1>
              <p className="text-stone-500 font-medium">Zostałeś pomyślnie zidentyfikowany.</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 flex-shrink-0">
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 min-w-[200px]">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Pracownik</span>
                <span className="font-bold text-stone-900 text-sm">{operator.displayName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Stanowisko</span>
                <span className="font-bold text-stone-900 text-sm">{operator.position || 'Nie określono'}</span>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="text-xs font-bold text-stone-400 hover:text-stone-600 border border-stone-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-all outline-none"
            >
              <LogOut size={12} />
              opuść panel meldunkowy
            </button>
          </div>
        </div>

        {activeLog ? (
          <div className="mb-8">
            <ActiveTimer 
              log={activeLog} 
              onStop={handleStopWork} // Używamy bezpiecznej funkcji
              orders={orders}
              operator={operator}
              activeSessions={activeSessions}
            />
          </div>
        ) : !mode ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <button 
              onClick={() => setMode('individual')}
              disabled={isProcessing}
              className="group p-8 bg-white border-2 border-stone-100 rounded-[2.5rem] hover:border-emerald-500 hover:shadow-xl transition-all text-left flex flex-col gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <User size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black text-stone-900">Praca Indywidualna</h3>
                <p className="text-stone-500 text-sm mt-1">Klasyczny stoper dla jednego zlecenia.</p>
              </div>
            </button>

            <button 
              onClick={() => setMode('start-team')}
              disabled={isProcessing}
              className="group p-8 bg-white border-2 border-stone-100 rounded-[2.5rem] hover:border-blue-500 hover:shadow-xl transition-all text-left flex flex-col gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black text-stone-900">Rozpocznij Pracę Zespołową</h3>
                <p className="text-stone-500 text-sm mt-1">Zostań liderem sesji na wybranym stanowisku.</p>
              </div>
            </button>

            <button 
              onClick={() => setMode('join-team')}
              disabled={isProcessing}
              className="group p-8 bg-white border-2 border-stone-100 rounded-[2.5rem] hover:border-amber-500 hover:shadow-xl transition-all text-left flex flex-col gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <UserPlus size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black text-stone-900">Dołącz do Zespołu</h3>
                <p className="text-stone-500 text-sm mt-1">Dopisz się do aktywnego gniazda produkcyjnego.</p>
              </div>
            </button>
          </div>
        ) : mode === 'individual' ? (
          <div className="space-y-8 mb-8">
            <div className="flex items-center gap-4 mb-4">
              <button 
                onClick={() => { setMode(null); setShowNumpad(false); }}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-2xl font-black text-stone-900">Wybierz zlecenie</h2>
            </div>
            <div className="bg-stone-50 p-8 rounded-[2rem] border border-stone-100 text-left relative">
              <h3 className="text-lg font-bold text-stone-900 mb-6 flex items-center gap-2">
                <Search className="text-emerald-500" size={20} />
                Wyszukaj zlecenie produkcyjne
              </h3>
              
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                <input 
                  type="text"
                  placeholder="Szukaj zlecenia (wprowadź numer)..."
                  inputMode="none" // Zapobiega pokazywaniu się domyślnej klawiatury systemowej
                  value={searchTerm}
                  onFocus={() => setShowNumpad(true)}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-24 py-4 bg-white border border-stone-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold text-xl"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {showNumpad && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    className="overflow-hidden mt-2"
                  >
                     <VirtualNumpad 
                        value={searchTerm} 
                        onChange={setSearchTerm} 
                        onClose={() => setShowNumpad(false)}
                        showClose={true}
                     />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-left">
              {filteredOrders.length === 0 ? (
                <div className="col-span-full bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl p-12 text-center text-stone-400">
                  <div className="flex justify-center mb-4 opacity-20"><Search size={48} /></div>
                  <p>Nie znaleziono zleceń pasujących do zapytania.</p>
                </div>
              ) : (
                filteredOrders.map(order => (
                  <OrderCard 
                    key={order.id} 
                    order={order} 
                    onStart={() => handleStartWork(order)} // Bezpieczna funkcja
                    onDelete={() => {}} 
                    onEditElements={() => {}} 
                    isWorking={activeLog?.orderId === order.id}
                    disabled={isProcessing || (!!activeLog && activeLog.orderId !== order.id)} // Blokada
                    isAdmin={false}
                    activeWorkers={allActiveLogs.filter(log => log.orderId === order.id).map(log => log.userName)}
                  />
                ))
              )}
            </div>
          </div>
        ) : mode === 'start-team' ? (
          <div className="space-y-8 mb-8 text-left">
            <div className="flex items-center gap-4 mb-4">
              <button 
                onClick={() => setMode(null)}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-2xl font-black text-stone-900">Wybierz stanowisko</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workStations.map(station => (
                <button
                  key={station.id}
                  disabled={isProcessing}
                  onClick={() => handleStartTeamWork(station)} // Bezpieczna funkcja
                  className="p-6 bg-white border-2 border-stone-100 rounded-3xl hover:border-blue-500 hover:shadow-lg transition-all text-left disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                    <Factory size={24} />
                  </div>
                  <h4 className="font-black text-stone-900">{station.name}</h4>
                  <p className="text-xs text-stone-500 mt-1">{station.description || 'Brak opisu'}</p>
                </button>
              ))}
            </div>
          </div>
        ) : mode === 'join-team' ? (
          <div className="space-y-8 mb-8 text-left">
            <div className="flex items-center gap-4 mb-4">
              <button 
                onClick={() => setMode(null)}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-2xl font-black text-stone-900">Aktywne zespoły</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeSessions.length === 0 ? (
                <div className="col-span-full bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl p-12 text-center text-stone-400">
                  <Users className="mx-auto mb-4 opacity-20" size={48} />
                  <p>Obecnie nie ma żadnych aktywnych zespołów.</p>
                </div>
              ) : (
                activeSessions.map(session => (
                  <button
                    key={session.id}
                    disabled={isProcessing}
                    onClick={() => handleJoinTeam(session)} // Bezpieczna funkcja
                    className="p-6 bg-white border-2 border-stone-100 rounded-3xl hover:border-amber-500 hover:shadow-lg transition-all text-left disabled:opacity-50"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                        <Users size={24} />
                      </div>
                      <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-full uppercase tracking-widest">
                        {session.memberIds.length} osób
                      </span>
                    </div>
                    <h4 className="font-black text-stone-900">{session.stationName}</h4>
                    <p className="text-xs text-stone-500 mt-1">Lider: <span className="font-bold text-stone-700">{session.leaderName}</span></p>
                    <p className="text-[10px] text-stone-400 mt-2">Rozpoczęto: {format(session.startTime instanceof Timestamp ? session.startTime.toDate() : new Date(session.startTime), 'HH:mm')}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-start mt-8 pt-6 border-t border-stone-100">
          <div className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2 bg-stone-50 px-4 py-2 rounded-xl">
            <Clock size={14} />
            Automatyczne wylogowanie za {timeLeft}s
          </div>
        </div>
      </motion.div>
    </div>
  );
}