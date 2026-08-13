import React, { useState, useEffect } from 'react';
import { collection, updateDoc, getDocs, getDoc, doc, setDoc, serverTimestamp, writeBatch, Timestamp, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { FileText, ArrowLeft, Play, Square, User, Clock, CheckCircle2, Users, Search, List } from "lucide-react";
import { Employee, ProductionOrder, WorkLog, BoardDrawing, BoardDrawingElement, WorkSession } from '../../types';
import { BoardDrawingViewer } from './BoardDrawingViewer';

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


export const TABLICA_OPERATIONS = [
  { id: 'wycinanie', name: 'Wycinanie tab WS', getValue: (e: BoardDrawingElement) => e.areaSquareMeters || 0, unit: 'm2' },
  { id: 'zamki', name: 'Wklejanie zamków', getValue: (e: BoardDrawingElement) => e.locksLength || 0, unit: 'mb' },
  { id: 'profil', name: 'Wklejanie profila tablicy WS', getValue: (e: BoardDrawingElement) => e.profilesLength || 0, unit: 'mb' },
  { id: 'oklejanie', name: 'Oklejanie tab WS', getValue: (e: BoardDrawingElement) => e.areaSquareMeters || 0, unit: 'm2' },
  { id: 'oprawa', name: 'Oprawanie tablic', getValue: (e: BoardDrawingElement) => e.frameLength || 0, unit: 'mb' },
  { id: 'pakowanie', name: 'Pakowanie (nowa operacja)', getValue: (e: BoardDrawingElement) => 1, unit: 'szt' }
];

export function OperatorPanelTablice({ operator, orders, activeSessions, onLogout, onBackToOperator }: Props) {
  const [drawings, setDrawings] = useState<BoardDrawing[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<BoardDrawing | null>(null);
  const [selectedCoworkers, setSelectedCoworkers] = useState<string[]>([]);
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; message: string } | null>(null);
  const [showElementsList, setShowElementsList] = useState(false);
  const [completedOperations, setCompletedOperations] = useState<Record<string, string[]>>({});
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedOperations, setSelectedOperations] = useState<string[]>([]);


  // Znajdź aktywną sesję, w której ten operator jest liderem
  const currentSession = activeSessions.find(s => s.status === 'active' && s.leaderId === operator.id);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedDrawing) {
      setCompletedOperations({});
      return;
    }
    
    // Pobierz wszystkie logi dla zleceń z tego rysunku, by zidentyfikować zakończone operacje.
    const fetchOperations = async () => {
      const orderIds = Array.from(new Set(selectedDrawing.elements.map(e => e.mappedOrderId).filter(Boolean) as string[]));
      if (orderIds.length === 0) return;
      
      const chunks = [];
      for (let i = 0; i < orderIds.length; i += 30) {
        chunks.push(orderIds.slice(i, i + 30));
      }
      
      let allLogs: any[] = [];
      for (const chunk of chunks) {
        const q = query(collection(db, 'workLogs'), where('orderId', 'in', chunk));
        const snap = await getDocs(q);
        allLogs = [...allLogs, ...snap.docs.map(d => d.data())];
      }
      
      const elementOps: Record<string, string[]> = {};
      allLogs.forEach(log => {
        if (log.elementId && log.operationName) {
          if (!elementOps[log.elementId]) elementOps[log.elementId] = [];
          if (!elementOps[log.elementId].includes(log.operationName)) {
            elementOps[log.elementId].push(log.operationName);
          }
        }
      });
      setCompletedOperations(elementOps);
    };
    
    fetchOperations();
  }, [selectedDrawing]);


  const fetchData = async () => {
    const dSnap = await getDocs(collection(db, 'boardDrawings'));
    setDrawings(dSnap.docs.map(d => ({ id: d.id, ...d.data() } as BoardDrawing)));
    
    const eSnap = await getDocs(collection(db, 'employees'));
    const emps = eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => e.id !== operator.id);
    emps.sort((a, b) => { const numA = parseInt(a.employeeNumber || '0', 10) || 0; const numB = parseInt(b.employeeNumber || '0', 10) || 0; return numA - numB; });
    setEmployees(emps);
    
    setLoading(false);
  };

  const handleStartSession = async () => {
    try {
      const sessionRef = doc(collection(db, 'workSessions'));
      await setDoc(sessionRef, {
        leaderId: operator.id,
        leaderName: operator.displayName,
        stationId: 'TABLICE',
        stationName: 'Dział Tablic',
        memberIds: [operator.id, ...selectedCoworkers],
        department: 'Tablice',
        startTime: Timestamp.now(),
        lastReportTime: Timestamp.now(),
        status: 'active'
      });
      setSelectedCoworkers([]);
    } catch (e) {
      console.error(e);
      setAlertDialog({ isOpen: true, message: "Błąd podczas rozpoczynania zmiany." });
    }
  };

  const confirmStop = async () => {
    if (!currentSession) return;
    try {
      await updateDoc(doc(db, 'workSessions', currentSession.id), {
        status: 'completed',
        endTime: Timestamp.now()
      });
      setConfirmDialog(null);
    } catch (e) {
      console.error(e);
      setAlertDialog({ isOpen: true, message: "Błąd podczas kończenia zmiany." });
    }
  };

  const handleStopSession = () => {
    if (currentSession) {
      setConfirmDialog({
        isOpen: true,
        message: "Czy na pewno chcesz zakończyć obecną zmianę? Upewnij się, że zameldowałeś wszystkie wykonane panele.",
        onConfirm: confirmStop
      });
    }
  };

  const handleElementClick = (element: BoardDrawingElement) => {
    if (!element.mappedOrderId) {
      setAlertDialog({ isOpen: true, message: "Ten element nie ma przypisanego zlecenia." });
      return;
    }
    setSelectedPanelIds(prev => 
      prev.includes(element.id) ? prev.filter(id => id !== element.id) : [...prev, element.id]
    );
  };

  const handleReportPanels = () => {
    if (selectedPanelIds.length === 0) return;
    setSelectedOperations([]);
    setReportModalOpen(true);
  };

  const confirmReportPanels = async () => {
    if (!currentSession || selectedPanelIds.length === 0 || !selectedDrawing || selectedOperations.length === 0) return;
    setReporting(true);

    try {
      const endTime = Timestamp.now();
      const startTime = currentSession.lastReportTime 
        ? (currentSession.lastReportTime instanceof Timestamp ? currentSession.lastReportTime : Timestamp.fromDate(new Date(currentSession.lastReportTime)))
        : (currentSession.startTime instanceof Timestamp ? currentSession.startTime : Timestamp.fromDate(new Date(currentSession.startTime)));
      
      const durationSeconds = Math.max(0, endTime.seconds - startTime.seconds);
      const numMembers = currentSession.memberIds.length || 1;
      const totalManSeconds = durationSeconds * numMembers;

      const elementsToReport = selectedDrawing.elements.filter(e => selectedPanelIds.includes(e.id));

      // Oblicz sumę wartości dla każdej wybranej operacji, aby móc rozdzielić czas proporcjonalnie
      const opTotals: Record<string, number> = {};
      selectedOperations.forEach(opId => {
        const opDef = TABLICA_OPERATIONS.find(op => op.id === opId);
        if (!opDef) return;
        
        let totalVal = 0;
        elementsToReport.forEach(el => {
          if (opId === 'zamki' && (!el.locksLength || el.locksLength === 0)) return;
          totalVal += (opDef.getValue(el) || 0);
        });
        if (totalVal > 0) {
          opTotals[opId] = totalVal;
        }
      });
      
      const validOps = Object.keys(opTotals);
      
      if (validOps.length === 0) {
        setAlertDialog({ isOpen: true, message: "Wybrane operacje mają zerową wartość dla zaznaczonych paneli (lub nie wybrano odpowiednich paneli)." });
        setReporting(false);
        setReportModalOpen(false);
        return;
      }

      // Całkowity czas dzielimy równo na wybrane operacje (jeśli jest ich więcej niż 1)
      const timePerOp = totalManSeconds / validOps.length;

      // Zlecenie mogło zostać zaimportowane jako 'completed' i nie znajdować się w `orders`, więc musimy je pobrać z bazy
      const missingOrderIds = [...new Set(elementsToReport.map(e => e.mappedOrderId).filter(id => id && !orders.find(o => o.id === id)))];
      const fetchedOrders: Record<string, ProductionOrder> = {};
      for (const id of missingOrderIds) {
        if (!id) continue;
        const snap = await getDoc(doc(db, 'orders', id));
        if (snap.exists()) {
          fetchedOrders[id] = { ...snap.data(), id: snap.id } as ProductionOrder;
        }
      }

      const batch = writeBatch(db);

      for (const el of elementsToReport) {
        const order = orders.find(o => o.id === el.mappedOrderId) || (el.mappedOrderId ? fetchedOrders[el.mappedOrderId] : undefined);
        if (!order) continue;

        for (const opId of validOps) {
          if (opId === 'zamki' && (!el.locksLength || el.locksLength === 0)) continue;
          
          const opDef = TABLICA_OPERATIONS.find(op => op.id === opId);
          if (!opDef) continue;
          
          const opValue = opDef.getValue(el) || 0;
          if (opValue === 0) continue; // Pomiń jeśli ten panel nie ma danej wartości
          
          // Proporcja czasu dla tego panelu w ramach tej operacji
          const weight = opValue / opTotals[opId];
          const allocatedTime = timePerOp * weight;
          const perMemberTime = allocatedTime / numMembers;

          for (const memberId of currentSession.memberIds) {
            const emp = (memberId === operator.id) ? operator : employees.find(e => e.id === memberId);
            if (!emp) continue;

            const logRef = doc(collection(db, 'workLogs'));
            batch.set(logRef, {
              orderId: order.id,
              orderNumber: order.orderNumber,
              elementId: el.id,
              elementName: el.name,
              operationName: opDef.name,
              reportedQuantity: opValue,
              userId: emp.id,
              userName: emp.displayName || '',
              startTime: startTime,
              endTime: endTime,
              duration: Math.round(perMemberTime),
              hours: Number((perMemberTime / 3600).toFixed(2)),
              quantity: 1, // 1 operation instance
              assortmentCategory: order.assortmentCategory || 'Inne',
              sessionId: currentSession.id,
              stationId: 'TABLICE',
              stationName: 'Dział Tablic'
            });
          }
        }
        
        batch.update(doc(db, 'orders', order.id), {
          status: 'in-progress'
        });
      }

      batch.update(doc(db, 'workSessions', currentSession.id), {
        lastReportTime: endTime
      });

      await batch.commit();
      
      // Update local state for immediate feedback
      setCompletedOperations(prev => {
        const next = { ...prev };
        elementsToReport.forEach(el => {
          if (!next[el.id]) next[el.id] = [];
          selectedOperations.forEach(opId => {
             const opDef = TABLICA_OPERATIONS.find(o => o.id === opId);
             if (opDef && !next[el.id].includes(opDef.name)) {
               if (opId === 'zamki' && (!el.locksLength || el.locksLength === 0)) return;
               next[el.id].push(opDef.name);
             }
          });
        });
        return next;
      });

      setSelectedPanelIds([]);
      setReportModalOpen(false);
      setAlertDialog({ isOpen: true, message: "Zameldowano pomyślnie." });
    } catch (e) {
      console.error(e);
      setAlertDialog({ isOpen: true, message: "Błąd podczas meldowania." });
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-500 font-bold">Wczytywanie...</div>;
  }

  if (!currentSession) {
    return (
      <div className="min-h-screen bg-stone-50 p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white rounded-3xl p-8 border border-stone-200 shadow-xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
              <Users size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-stone-900 tracking-tight">Rozpocznij pracę</h1>
              <p className="text-stone-500 font-semibold">{operator.displayName} • Dział Tablic</p>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <h3 className="font-bold text-stone-800">Wybierz współpracowników (opcjonalnie):</h3>
              <div className="relative w-full md:w-64 flex-shrink-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Szukaj pracownika..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {employees.filter(emp => (emp.displayName || "").toLowerCase().includes(searchQuery.toLowerCase()) || (emp.employeeNumber || "").includes(searchQuery)).map(emp => (
                <button
                  key={emp.id}
                  onClick={() => setSelectedCoworkers(prev => prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id])}
                  className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-colors ${selectedCoworkers.includes(emp.id) ? 'bg-emerald-50 border-emerald-500 shadow-sm text-emerald-900' : 'bg-white border-stone-200 hover:border-emerald-300 text-stone-700'}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${selectedCoworkers.includes(emp.id) ? 'bg-emerald-500 border-emerald-600 text-white' : 'border-stone-300'}`}>
                    {selectedCoworkers.includes(emp.id) && <CheckCircle2 size={14} />}
                  </div>
                  <span className="font-bold text-sm truncate">{emp.employeeNumber ? `${emp.employeeNumber} - ` : ''}{emp.displayName}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
             {onBackToOperator && (
               <button onClick={onBackToOperator} className="flex-1 py-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-colors">
                 Anuluj
               </button>
             )}
             <button 
               onClick={handleStartSession}
               className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors shadow-lg active:scale-95 flex items-center justify-center gap-2"
             >
               <Play size={20} /> Rozpocznij naliczanie czasu
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col p-4 md:p-8">
      <div className="bg-white rounded-3xl p-6 border border-stone-200 flex flex-wrap justify-between items-center mb-6 shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
            <User size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-stone-900 tracking-tight">{operator.displayName}</h1>
            <p className="text-stone-500 text-sm font-semibold uppercase tracking-wider">
              Aktywna praca • Zespół: {currentSession.memberIds.map(id => id === operator.id ? operator.displayName : employees.find(e => e.id === id)?.displayName || "Nieznany").join(", ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleStopSession} className="px-5 py-3 text-white font-bold bg-red-600 hover:bg-red-500 rounded-xl transition-colors shadow-lg flex items-center gap-2">
            <Square size={18} /> Zakończ zmianę
          </button>
        </div>
      </div>

      
      <div className="flex-1 flex flex-col h-full">
        {!selectedDrawing ? (
          <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col h-full">
            <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2 mb-6">
              <FileText className="text-emerald-500" /> Dostępne Rysunki
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 custom-scrollbar">
              {drawings.length === 0 ? (
                <p className="text-stone-500 italic text-center p-4 col-span-full">Brak wgranych rysunków.</p>
              ) : (
                drawings.map(d => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setSelectedDrawing(d);
                      setSelectedPanelIds([]);
                      setShowElementsList(false);
                    }}
                    className={`w-full text-left p-6 rounded-2xl border transition-all ${selectedDrawing?.id === d.id ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-stone-200 hover:border-emerald-300 hover:shadow-md bg-white'}`}
                  >
                    <div className="font-bold text-stone-800 text-xl mb-2">{d.clientOrderNumber}</div>
                    <div className="text-sm text-stone-500 mb-4">{d.fileName}</div>
                    <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{d.elements.length} Elementów EPS</div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-50 lg:static lg:z-auto flex flex-col h-full bg-stone-100 lg:bg-white lg:rounded-3xl p-0 lg:p-6 lg:border border-stone-200 shadow-sm">
            <div className="flex items-center gap-4 mb-0 lg:mb-6 bg-white p-4 lg:p-0 border-b border-stone-200 lg:border-none shadow-sm lg:shadow-none z-10">
              <button 
                onClick={() => { setSelectedDrawing(null); setShowElementsList(false); }}
                className="p-3 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <h2 className="text-xl font-bold text-stone-800">{selectedDrawing.clientOrderNumber}</h2>
                <p className="text-sm text-stone-500">{selectedDrawing.fileName}</p>
              </div>
            </div>

            <div className="flex flex-col h-full gap-0 lg:gap-4 relative">
              <div className="hidden lg:flex justify-between items-center bg-stone-100 p-4 rounded-2xl border border-stone-200">
                <div>
                  <h3 className="font-bold text-stone-800">Zaznaczono paneli: <span className="text-emerald-600 text-xl">{selectedPanelIds.length}</span></h3>
                  <p className="text-xs text-stone-500">Kliknij elementy na rysunku, aby je zaznaczyć, a następnie zamelduj czas.</p>
                </div>
                <button 
                  onClick={handleReportPanels}
                  disabled={selectedPanelIds.length === 0 || reporting}
                  className="px-6 py-3 bg-emerald-600 disabled:bg-stone-300 text-white font-bold rounded-xl shadow-md transition-colors flex items-center gap-2"
                >
                  {reporting ? 'Zapisywanie...' : 'Zamelduj wybrane panele'}
                </button>
              </div>

              {!showElementsList ? (
                <div className="flex-1 flex flex-col min-h-0 relative">
                  <div className="mb-0 lg:mb-4 hidden lg:block">
                    <button 
                      onClick={() => setShowElementsList(true)}
                      className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors border border-stone-200"
                    >
                      <List size={16} /> Pokaż listę elementów ({selectedDrawing.elements.length})
                    </button>
                  </div>
                  <BoardDrawingViewer 
                    drawing={selectedDrawing} 
                    onElementClick={handleElementClick}
                    selectedElementIds={selectedPanelIds}
                    completedOperations={completedOperations}
                  />
                  
                  {/* Floating Action Button (Mobile) */}
                  <div className="lg:hidden absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 px-4 z-20 pointer-events-none">
                    {selectedPanelIds.length > 0 && (
                      <div className="bg-stone-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg pointer-events-auto">
                        Zaznaczono: {selectedPanelIds.length}
                      </div>
                    )}
                    <div className="flex w-full gap-2 pointer-events-auto">
                      <button 
                        onClick={() => setShowElementsList(true)}
                        className="flex-1 py-4 bg-white text-stone-700 font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 border border-stone-200"
                      >
                        <List size={20} /> Lista
                      </button>
                      <button 
                        onClick={handleReportPanels}
                        disabled={selectedPanelIds.length === 0 || reporting}
                        className="flex-[2] py-4 bg-emerald-600 disabled:bg-stone-400 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2"
                      >
                        {reporting ? 'Zapisywanie...' : 'Zamelduj panele'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 z-30 lg:relative lg:inset-auto lg:z-auto flex-1 flex flex-col bg-white lg:rounded-2xl lg:border border-stone-200 overflow-hidden">
                  <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
                    <h3 className="font-bold text-stone-800 flex items-center gap-2">
                      <List className="text-emerald-500" /> Lista elementów rysunku
                    </h3>
                    <button 
                      onClick={() => setShowElementsList(false)}
                      className="px-4 py-2 bg-white hover:bg-stone-100 text-stone-700 rounded-lg text-sm font-bold border border-stone-200 transition-colors"
                    >
                      Powrót do rysunku
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-stone-100 text-stone-600 sticky top-0">
                        <tr>
                          <th className="p-3 font-semibold border-b">Element (EPS)</th>
                          <th className="p-3 font-semibold border-b">Zlecenie</th>
                          <th className="p-3 font-semibold border-b text-right">Ilość szt.</th>
                          <th className="p-3 font-semibold border-b text-right">Powierzchnia (m²)</th>
                          <th className="p-3 font-semibold border-b text-right">Zamki (m)</th>
                          <th className="p-3 font-semibold border-b text-right">Ramki (m)</th>
                          <th className="p-3 font-semibold border-b text-right">Profile (m)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {[...selectedDrawing.elements].sort((a, b) => {
                          const getNum = (name) => {
                            const match = name.match(/\d+/);
                            return match ? parseInt(match[0], 10) : 0;
                          };
                          return getNum(a.name) - getNum(b.name);
                        }).map(el => (
                          <tr key={el.id} className="hover:bg-stone-50">
                            <td className="p-3 font-bold text-stone-800">{el.name}</td>
                            <td className="p-3 text-stone-600">{el.mappedOrderNumber || '-'}</td>
                            <td className="p-3 text-right font-medium">1</td>
                            <td className="p-3 text-right text-stone-600">{el.areaSquareMeters?.toFixed(2) || '-'}</td>
                            <td className="p-3 text-right text-stone-600">{el.locksLength?.toFixed(2) || '-'}</td>
                            <td className="p-3 text-right text-stone-600">{el.frameLength?.toFixed(2) || '-'}</td>
                            <td className="p-3 text-right text-stone-600">{el.profilesLength?.toFixed(2) || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-stone-50 border-t-2 border-stone-200 font-bold text-stone-800 sticky bottom-0">
                        <tr>
                          <td className="p-3" colSpan={2}>PODSUMOWANIE</td>
                          <td className="p-3 text-right">{selectedDrawing.elements.length}</td>
                          <td className="p-3 text-right">
                            {selectedDrawing.elements.reduce((acc, el) => acc + (el.areaSquareMeters || 0), 0).toFixed(2)}
                          </td>
                          <td className="p-3 text-right">
                            {selectedDrawing.elements.reduce((acc, el) => acc + (el.locksLength || 0), 0).toFixed(2)}
                          </td>
                          <td className="p-3 text-right">
                            {selectedDrawing.elements.reduce((acc, el) => acc + (el.frameLength || 0), 0).toFixed(2)}
                          </td>
                          <td className="p-3 text-right">
                            {selectedDrawing.elements.reduce((acc, el) => acc + (el.profilesLength || 0), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table></div>
                  </div>
                </div>
              )}
              

            </div>
          </div>
        )}
      </div>


      
      {reportModalOpen && selectedDrawing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-lg w-full">
            <h3 className="text-2xl font-black text-stone-800 mb-2">Zamelduj operacje</h3>
            <p className="text-stone-500 mb-6">Wybierz operacje, które wykonałeś na zaznaczonych panelach ({selectedPanelIds.length} szt.).</p>
            
            <div className="grid grid-cols-1 gap-3 mb-6">
              {TABLICA_OPERATIONS.map(op => {
                const isSelected = selectedOperations.includes(op.id);
                // Check if any selected panel is multi-panel (has locks)
                const hasLocks = selectedDrawing.elements
                  .filter(e => selectedPanelIds.includes(e.id))
                  .some(e => (e.locksLength || 0) > 0);
                
                if (op.id === 'zamki' && !hasLocks) return null; // Hide if no panel has locks
                
                return (
                  <button
                    key={op.id}
                    onClick={() => {
                      setSelectedOperations(prev => 
                        prev.includes(op.id) ? prev.filter(id => id !== op.id) : [...prev, op.id]
                      );
                    }}
                    className={`p-4 rounded-xl border-2 text-left font-bold transition-all ${
                      isSelected 
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                        : 'border-stone-200 hover:border-emerald-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span>{op.name}</span>
                        {(() => {
                          const elementsToReport = selectedDrawing.elements.filter(e => selectedPanelIds.includes(e.id));
                          const totalValue = elementsToReport.reduce((acc, el) => acc + (op.getValue(el) || 0), 0);
                          if (totalValue > 0) {
                            return (
                              <span className="ml-3 text-sm font-semibold opacity-70 bg-stone-200/50 px-2 py-0.5 rounded-md">
                                {Number(totalValue.toFixed(2))} {op.unit}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      {isSelected && <CheckCircle2 size={20} className="text-emerald-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setReportModalOpen(false)}
                className="px-5 py-3 font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
              >
                Anuluj
              </button>
              <button 
                onClick={confirmReportPanels}
                disabled={selectedOperations.length === 0 || reporting}
                className="px-5 py-3 font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-300 rounded-xl transition-colors shadow-lg"
              >
                {reporting ? 'Zapisywanie...' : 'Zatwierdź zameldowanie'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {confirmDialog?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-bold text-stone-800 mb-4">Potwierdzenie</h3>
            <p className="text-stone-600 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
              >
                Anuluj
              </button>
              <button 
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
              >
                Potwierdź
              </button>
            </div>
          </div>
        </div>
      )}

      {alertDialog?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full border-t-4 border-emerald-500">
            <h3 className="text-xl font-bold text-stone-800 mb-4">Informacja</h3>
            <p className="text-stone-600 mb-6">{alertDialog.message}</p>
            <div className="flex justify-end">
              <button 
                onClick={() => setAlertDialog(null)}
                className="px-6 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

