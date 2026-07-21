import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, serverTimestamp, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { FileText, ArrowLeft, Play, Square, User, Clock, CheckCircle2 } from "lucide-react";
import { Employee, ProductionOrder, WorkLog, BoardDrawing, BoardDrawingElement } from '../../types';
import { BoardDrawingViewer } from './BoardDrawingViewer';
import { ActiveTimer } from './ActiveTimer';
import { WorkSession } from '../../types';

interface Props {
  operator: Employee;
  orders: ProductionOrder[];
  activeLog: WorkLog | null;
  activeSessions: WorkSession[];
  onLogout: () => void;
  onStartWork: (order: ProductionOrder, element?: any) => Promise<void>;
  onStopWork: (reports?: any) => Promise<void>;
  onBackToOperator?: () => void;
}

export function OperatorPanelTablice({ operator, orders, activeLog, activeSessions, onLogout, onStartWork, onStopWork, onBackToOperator }: Props) {
  const [drawings, setDrawings] = useState<BoardDrawing[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<BoardDrawing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrawings();
  }, []);

  const fetchDrawings = async () => {
    const snap = await getDocs(collection(db, 'boardDrawings'));
    setDrawings(snap.docs.map(d => ({ id: d.id, ...d.data() } as BoardDrawing)));
    setLoading(false);
  };

  const handleElementClick = async (element: BoardDrawingElement) => {
    if (!element.mappedOrderId) {
      alert(`Element ${element.name} nie jest jeszcze przypisany do żadnego zlecenia produkcyjnego. Poproś kierownika o uzupełnienie w panelu administracyjnym.`);
      return;
    }

    const order = orders.find(o => o.id === element.mappedOrderId);
    if (!order) {
      alert(`Zlecenie przypisane do elementu ${element.name} (ID: ${element.mappedOrderId}) nie zostało znalezione w aktywnych zleceniach.`);
      return;
    }

    if (activeLog && activeLog.orderId === order.id && activeLog.elementName === element.name) {
      // Jesteśmy w trakcie pracy nad tym elementem, pokaż monit o zakończenie
      if (window.confirm(`Czy chcesz zakończyć pracę nad elementem ${element.name}?`)) {
        await onStopWork();
      }
    } else if (activeLog) {
      alert("Masz już aktywny meldunek. Zakończ go, zanim rozpoczniesz nową pracę.");
    } else {
      if (window.confirm(`Rozpocząć pracę nad elementem ${element.name} (Zlecenie: ${order.orderNumber})?`)) {
        // Tworzymy dummy OrderElement żeby funkcja onStartWork go przyjęła
        const dummyElement = {
          id: element.id,
          name: element.name,
          weight: 0 // Tablice nie mają wagi na poszczególnych "eps", liczy się czas/ilość na całą tablicę
        };
        await onStartWork(order, dummyElement);
      }
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-500 font-bold">Wczytywanie rysunków...</div>;
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col p-4 md:p-8">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 flex justify-between items-center mb-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
            <User size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-stone-900 tracking-tight">{operator.displayName}</h1>
            <p className="text-stone-500 text-sm font-semibold uppercase tracking-wider">{operator.position || 'Operator'} • Dział Tablic Warstwowych</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onBackToOperator && (
            <button onClick={onBackToOperator} className="px-5 py-3 text-stone-600 font-bold bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors flex items-center gap-2">
              <ArrowLeft size={18} /> Powrót
            </button>
          )}
          <button onClick={onLogout} className="px-5 py-3 text-white font-bold bg-stone-900 hover:bg-stone-800 rounded-xl transition-colors shadow-lg active:scale-95">
            Wyloguj
          </button>
        </div>
      </div>

      {activeLog && (
        <div className="mb-6">
          <ActiveTimer 
            log={activeLog} 
            onStop={onStopWork} 
            orders={orders}
            operator={operator}
            activeSessions={activeSessions}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Lewa kolumna - Wybór rysunku */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col h-full">
          <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2 mb-4">
            <FileText className="text-emerald-500" /> Dostępne Rysunki
          </h2>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {drawings.length === 0 ? (
              <p className="text-stone-500 italic text-center p-4">Brak wgranych rysunków.</p>
            ) : (
              drawings.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDrawing(d)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedDrawing?.id === d.id ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-stone-200 hover:bg-stone-50'}`}
                >
                  <div className="font-bold text-stone-800 text-lg mb-1">{d.clientOrderNumber}</div>
                  <div className="text-sm text-stone-500">{d.fileName}</div>
                  <div className="text-xs font-semibold text-stone-400 mt-2 uppercase tracking-wider">{d.elements.length} Elementów EPS</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Środek/Prawa - Podgląd i mapa */}
        <div className="lg:col-span-2 flex flex-col h-full bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
          {selectedDrawing ? (
            <div className="flex flex-col h-full gap-4">
              <BoardDrawingViewer drawing={selectedDrawing} onElementClick={handleElementClick} />
              
              {/* Podsumowanie materiałowe całej tablicy dla operatorów */}
              {(() => {
                const totalArea = selectedDrawing.elements.reduce((sum, el) => sum + (el.areaSquareMeters || 0), 0);
                const totalProfiles = selectedDrawing.elements.reduce((sum, el) => sum + (el.profilesLength || 0), 0);
                const totalFrame = selectedDrawing.elements.reduce((sum, el) => sum + (el.frameLength || 0), 0);

                // Unikalne fizyczne zamki liczone po stronach (dzielone przez 2, bo są dzielone między sąsiednie panele)
                const pageGroups: Record<number, typeof selectedDrawing.elements> = {};
                selectedDrawing.elements.forEach(el => {
                  const p = el.page || 1;
                  if (!pageGroups[p]) pageGroups[p] = [];
                  pageGroups[p].push(el);
                });

                let totalLocks = 0;
                Object.values(pageGroups).forEach(els => {
                  const pageLocksSum = els.reduce((sum, el) => sum + (el.locksLength || 0), 0);
                  totalLocks += pageLocksSum;
                });

                return (
                  <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100/40 shadow-sm">
                      <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-0.5">Suma M2 Tablicy</span>
                      <span className="text-stone-800 font-extrabold text-sm">{totalArea.toFixed(3)} m²</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100/40 shadow-sm">
                      <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-0.5">Suma Profili</span>
                      <span className="text-stone-800 font-extrabold text-sm">{totalProfiles.toFixed(3)} m</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100/40 shadow-sm">
                      <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-0.5">Suma Zamków</span>
                      <span className="text-stone-800 font-extrabold text-sm">{totalLocks.toFixed(3)} m</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100/40 shadow-sm">
                      <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-0.5">Suma Ramki</span>
                      <span className="text-stone-800 font-extrabold text-sm">{totalFrame.toFixed(3)} m</span>
                    </div>
                  </div>
                );
              })()}

              {/* Lista elementów rysunku jako alternatywa dla klikania w canvas */}
              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200">
                <h3 className="font-bold text-stone-800 mb-3 text-sm uppercase tracking-wider">Lista Elementów</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {[...selectedDrawing.elements].sort((a, b) => {
                    const getNum = (name: string) => {
                      const match = name.match(/\d+/);
                      return match ? parseInt(match[0], 10) : 0;
                    };
                    return getNum(a.name) - getNum(b.name);
                  }).map(el => {
                    const order = orders.find(o => o.id === el.mappedOrderId);
                    const isWorking = activeLog?.orderId === el.mappedOrderId && activeLog?.elementName === el.name;
                    
                    return (
                      <button
                        key={el.id}
                        onClick={() => handleElementClick(el)}
                        className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                          isWorking 
                            ? 'bg-emerald-500 border-emerald-600 text-white shadow-md' 
                            : el.mappedOrderId 
                              ? 'bg-white border-stone-200 hover:border-emerald-300 hover:shadow-sm' 
                              : 'bg-stone-100 border-stone-200 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex justify-between items-start w-full gap-1">
                          <span className={`font-bold truncate ${isWorking ? 'text-white' : 'text-stone-800'}`}>{el.name}</span>
                          <span className={`text-[9px] px-1 bg-stone-100 rounded text-stone-500 font-mono flex-shrink-0 ${isWorking ? 'bg-emerald-600 text-emerald-100' : ''}`}>
                            {el.width && el.height ? `${el.width}x${el.height}` : (el.detectedDimension ? el.detectedDimension.replace(/mm/gi, '') : '')}
                          </span>
                        </div>
                        <span className={`text-xs truncate ${isWorking ? 'text-emerald-100' : 'text-stone-500'}`}>
                          {el.mappedOrderNumber || 'Nieprzypisane'}
                        </span>
                        
                        {el.mappedOrderId && (
                          <div className={`mt-1 pt-1 border-t flex justify-between text-[9px] ${isWorking ? 'border-emerald-400 text-emerald-100' : 'border-stone-150 text-stone-400'}`}>
                            <span>{el.areaSquareMeters != null ? `${el.areaSquareMeters}m²` : '-'}</span>
                            <span>Prof: {el.profilesLength != null ? `${el.profilesLength}m` : '-'}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
              <FileText size={64} className="mb-4 opacity-20" />
              <p className="font-medium text-lg">Wybierz rysunek z listy, aby rozpocząć meldowanie.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
