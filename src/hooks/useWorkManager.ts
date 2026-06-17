import { collection, doc, updateDoc, setDoc, writeBatch, serverTimestamp, Timestamp, query, where, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore';
import { differenceInSeconds } from 'date-fns';
import { db } from '../firebase';
import { ProductionOrder, WorkLog, WorkSession, WorkStation, Employee, OrderElement } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-helpers';
import { User as FirebaseUser } from 'firebase/auth';
import { calculateOrderStatus } from '../utils/orderStatus';

interface UseWorkManagerProps {
  user: FirebaseUser | null;
  currentOperator: Employee | null;
  activeLog: WorkLog | null;
  setActiveLog: (log: WorkLog | null) => void;
  activeSessions: WorkSession[];
  orders: ProductionOrder[];
}

export function useWorkManager({ 
  user, 
  currentOperator, 
  activeLog, 
  setActiveLog, 
  activeSessions, 
  orders 
}: UseWorkManagerProps) {

  // --- TWARDA BLOKADA: Czy pracownik może zacząć nową pracę? ---
  const canStartNewWork = () => {
    if (activeLog) {
      alert("Niedozwolona operacja: Najpierw zakończ obecne zadanie!");
      return false;
    }
    return true;
  };

  const getIdentifier = () => currentOperator?.id || user?.uid;
  const getName = () => currentOperator?.displayName || user?.displayName || 'Pracownik';

  // 1. Praca Indywidualna
  const startWork = async (order: ProductionOrder, element?: OrderElement) => {
    if (!canStartNewWork()) return;

    try {
      const batch = writeBatch(db);
      const newLogRef = doc(collection(db, 'workLogs'));
      
      batch.set(newLogRef, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: getIdentifier(),
        userName: getName(),
        startTime: serverTimestamp(),
        endTime: null,
        duration: 0,
        quantityReported: 0,
        elementId: element?.id || null,
        elementName: element?.name || null,
        assortmentCategory: order.assortmentCategory || null
      });

      batch.update(doc(db, 'orders', order.id), { status: 'in-progress' });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'workLogs');
    }
  };

  // 2. Rozpoczęcie Pracy Zespołowej (Lider)
  const startTeamWork = async (station: WorkStation) => {
    if (!canStartNewWork()) return;
    if (!currentOperator) return;

    try {
      const batch = writeBatch(db);
      const sessionRef = doc(collection(db, 'workSessions'));
      const logRef = doc(collection(db, 'workLogs'));

      // Tworzymy Sesję
      batch.set(sessionRef, {
        id: sessionRef.id,
        stationId: station.id,
        stationName: station.name,
        leaderId: currentOperator.id,
        leaderName: currentOperator.displayName,
        startTime: serverTimestamp(),
        status: 'active',
        memberIds: [currentOperator.id]
      });

      // Tworzymy Log dla Lidera (Jedna transakcja z Sesją!)
      batch.set(logRef, {
        userId: currentOperator.id,
        userName: currentOperator.displayName,
        startTime: serverTimestamp(),
        endTime: null,
        duration: 0,
        quantityReported: 0,
        sessionId: sessionRef.id,
        stationId: station.id,
        stationName: station.name
      });

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'workSessions');
    }
  };

  // 3. Dołączenie do Zespołu
  const joinTeam = async (session: WorkSession) => {
    if (!canStartNewWork()) return;
    if (!currentOperator) return;

    // Sprawdzamy czy już w nim nie jest
    if (session.memberIds.includes(currentOperator.id)) {
      alert("Jesteś już w tym zespole!");
      return;
    }

    try {
      const batch = writeBatch(db);
      
      batch.update(doc(db, 'workSessions', session.id), {
        memberIds: arrayUnion(currentOperator.id)
      });

      const logRef = doc(collection(db, 'workLogs'));
      batch.set(logRef, {
        userId: currentOperator.id,
        userName: currentOperator.displayName,
        startTime: serverTimestamp(),
        endTime: null,
        duration: 0,
        quantityReported: 0,
        sessionId: session.id,
        stationId: session.stationId,
        stationName: session.stationName
      });

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'workSessions');
    }
  };

  // 4. Zakończenie Pracy (Pojedynczej lub Zespołowej)
  const stopWork = async (reports?: { orderId: string, elementId?: string, quantity: number }[]) => {
    if (!activeLog) return;

    try {
      const endTime = Timestamp.now();
      const startTime = activeLog.startTime instanceof Timestamp ? activeLog.startTime : Timestamp.fromDate(new Date(activeLog.startTime));
      const duration = differenceInSeconds(endTime.toDate(), startTime.toDate());

      const batch = writeBatch(db);

      if (activeLog.sessionId) {
        const session = activeSessions.find(s => s.id === activeLog.sessionId);
        const isLeader = session?.leaderId === currentOperator?.id;

        if (isLeader && reports && reports.length > 0) {
          // --- LIDER KOŃCZY SESJĘ ZESPOŁU ---
          batch.update(doc(db, 'workSessions', activeLog.sessionId), {
            status: 'completed',
            endTime: endTime
          });

          // Pobieramy logi wszystkich członków tego zespołu
          const q = query(collection(db, 'workLogs'), where('sessionId', '==', activeLog.sessionId));
          const snapshot = await getDocs(q);
          const sessionLogs = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as WorkLog[];

          // Obliczamy całkowity czas wszystkich członków zespołu w tej sesji
          let totalTeamSeconds = 0;
          const memberDurations: { [logId: string]: number } = {};
          
          for (const log of sessionLogs) {
            const logStart = log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime);
            const logDuration = differenceInSeconds(endTime.toDate(), logStart);
            totalTeamSeconds += logDuration;
            memberDurations[log.id] = logDuration;
          }

          // Dla każdego zaraportowanego zlecenia/elementu
          for (const report of reports) {
            const order = orders.find(o => o.id === report.orderId);
            const element = order?.elements?.find(e => e.id === report.elementId);
            
            // 1. DYSTRYBUCJA KPI DLA PRACOWNIKÓW
            for (const log of sessionLogs) {
              const memberDuration = memberDurations[log.id] || 0;
              const individualQuantity = totalTeamSeconds > 0 
                ? (report.quantity * (memberDuration / totalTeamSeconds))
                : (report.quantity / sessionLogs.length);

              const newLogRef = doc(collection(db, 'workLogs'));
              batch.set(newLogRef, {
                userId: log.userId,
                userName: log.userName,
                orderId: report.orderId,
                orderNumber: order?.orderNumber,
                elementId: report.elementId || null,
                elementName: element?.name || null,
                startTime: log.startTime,
                endTime: endTime,
                duration: Math.floor(memberDuration), 
                quantityReported: Number(individualQuantity.toFixed(3)),
                sessionId: activeLog.sessionId,
                stationId: activeLog.stationId,
                stationName: activeLog.stationName,
                assortmentCategory: order?.assortmentCategory || null,
                manual: false
              });
            }

            // 2. AKTUALIZACJA POSTĘPU ZLECENIA (fizyczne wykonanie)
            if (order) {
              let weightedIncrement = report.quantity;
              let updatedElements = order.elements ? [...order.elements] : undefined;

              // Jeśli zlecenie ma elementy z wagami, obliczamy udział procentowy i AKTUALIZUJEMY ELEMENT
              if (order.elements && order.elements.length > 0 && element) {
                const totalWeightPerUnit = order.elements.reduce((sum, el) => sum + (el.weight || 0), 0);
                if (totalWeightPerUnit > 0) {
                  weightedIncrement = report.quantity * (element.weight / totalWeightPerUnit);
                }
                
                // NOWE: Aktualizujemy licznik sztuk Wewnątrz konkretnego elementu
                updatedElements = order.elements.map(el => 
                  el.id === element.id 
                    ? { ...el, reportedQuantity: (el.reportedQuantity || 0) + report.quantity }
                    : el
                );
              }

              const currentAppQty = order.appReportedQuantity || 0;
              const currentErpQty = order.erpReportedQuantity || order.reportedQuantity || 0;
              const newAppTotal = currentAppQty + weightedIncrement;

              const newStatus = calculateOrderStatus(
                currentErpQty,
                Number(newAppTotal.toFixed(3)),
                order.targetQuantity
              );

              const updateData: any = {
                appReportedQuantity: Number(newAppTotal.toFixed(3)),
                status: newStatus
              };
              
              if (updatedElements) {
                updateData.elements = updatedElements;
              }

              batch.update(doc(db, 'orders', order.id), updateData);
            }
          }
          
          // Usuwamy logi "tymczasowe" (trwające)
          for (const log of sessionLogs) {
            batch.delete(doc(db, 'workLogs', log.id));
          }
        } else {
          // --- CZŁONEK OPUSZCZA ZESPÓŁ ---
          batch.update(doc(db, 'workLogs', activeLog.id), { endTime, duration });
          if (activeLog.sessionId) {
            batch.update(doc(db, 'workSessions', activeLog.sessionId), {
              memberIds: arrayRemove(currentOperator?.id)
            });
          }
        }
      } else {
        // --- PRACA INDYWIDUALNA ---
        const report = reports?.[0];
        const quantity = report?.quantity || 0;
        const order = activeLog.orderId ? orders.find(o => o.id === activeLog.orderId) : null;
        const element = order?.elements?.find(e => e.id === activeLog.elementId);

        batch.update(doc(db, 'workLogs', activeLog.id), {
          endTime, duration, quantityReported: quantity
        });

        if (order) {
          let weightedIncrement = quantity;
          let updatedElements = order.elements ? [...order.elements] : undefined;

          // NOWE: Aktualizacja licznika na konkretnym detalu
          if (order.elements && order.elements.length > 0 && activeLog.elementId && element) {
            const totalWeightPerUnit = order.elements.reduce((sum, el) => sum + (el.weight || 0), 0);
            if (totalWeightPerUnit > 0) {
              weightedIncrement = quantity * (element.weight / totalWeightPerUnit);
            }
            
            // Mapujemy starą tablicę na nową z poprawioną ilością w raporcie
            updatedElements = order.elements.map(el => 
              el.id === activeLog.elementId 
                ? { ...el, reportedQuantity: (el.reportedQuantity || 0) + quantity }
                : el
            );
          }

          const currentAppQty = order.appReportedQuantity || 0;
          const currentErpQty = order.erpReportedQuantity || order.reportedQuantity || 0;
          const newAppTotal = currentAppQty + weightedIncrement;

          const newStatus = calculateOrderStatus(
            currentErpQty,
            Number(newAppTotal.toFixed(3)),
            order.targetQuantity
          );

          const updateData: any = {
            appReportedQuantity: Number(newAppTotal.toFixed(3)),
            status: newStatus
          };

          // Jeśli zmieniliśmy element, dorzucamy tablicę do aktualizacji
          if (updatedElements) {
            updateData.elements = updatedElements;
          }

          batch.update(doc(db, 'orders', order.id), updateData);
        }
      }

      await batch.commit();
      setActiveLog(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'workLogs');
    }
  };

  return {
    startWork,
    startTeamWork,
    joinTeam,
    stopWork
  };
}