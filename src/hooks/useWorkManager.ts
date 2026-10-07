import { collection, doc, updateDoc, setDoc, writeBatch, serverTimestamp, Timestamp, query, where, getDocs, arrayUnion, arrayRemove, runTransaction } from 'firebase/firestore';
import { differenceInSeconds } from 'date-fns';
import { db } from '../firebase';
import { ProductionOrder, WorkLog, WorkSession, WorkStation, Employee, OrderElement } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-helpers';
import { User as FirebaseUser } from 'firebase/auth';
import { calculateOrderStatus, applyLogImpactToOrder } from '../utils/orderStatus';
import { getServerTime } from '../utils/serverTime';

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
      // ZMIANA (audyt finding #4): czas serwera zamiast zegara urządzenia.
      const endTime = Timestamp.fromDate(await getServerTime());
      const startTime = activeLog.startTime instanceof Timestamp ? activeLog.startTime : Timestamp.fromDate(new Date(activeLog.startTime));
      const duration = differenceInSeconds(endTime.toDate(), startTime.toDate());
      
      let sessionLogs: WorkLog[] = [];
      let isLeader = false;

      if (activeLog.sessionId) {
        const session = activeSessions.find(s => s.id === activeLog.sessionId);
        isLeader = session?.leaderId === currentOperator?.id;
        
        if (isLeader && reports && reports.length > 0) {
          const q = query(collection(db, 'workLogs'), where('sessionId', '==', activeLog.sessionId));
          const snapshot = await getDocs(q);
          sessionLogs = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as WorkLog[];
        }
      }

      await runTransaction(db, async (transaction) => {
        if (activeLog.sessionId) {
          if (isLeader && reports && reports.length > 0) {
            const sessionRef = doc(db, 'workSessions', activeLog.sessionId);
            transaction.update(sessionRef, {
              status: 'completed',
              endTime: endTime
            });

            let totalTeamSeconds = 0;
            const memberDurations: { [logId: string]: number } = {};
            
            for (const log of sessionLogs) {
              const logStart = log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime);
              const logDuration = differenceInSeconds(endTime.toDate(), logStart);
              totalTeamSeconds += logDuration;
              memberDurations[log.id] = logDuration;
            }

            const uniqueOrderIds = Array.from(new Set(reports.map(r => r.orderId)));
            const orderSnaps = new Map();
            for (const oId of uniqueOrderIds) {
              const oRef = doc(db, 'orders', oId);
              const oSnap = await transaction.get(oRef);
              if (oSnap.exists()) orderSnaps.set(oId, oSnap);
            }

            for (const report of reports) {
              const oSnap = orderSnaps.get(report.orderId);
              const oData = oSnap ? oSnap.data() : null;
              
              if (oData) {
                const { newAppQty, newElements, newStatus } = applyLogImpactToOrder(oData, report.elementId, report.quantity);
                const orderRef = doc(db, 'orders', report.orderId);
                transaction.update(orderRef, {
                  appReportedQuantity: newAppQty,
                  status: newStatus,
                  elements: newElements
                });
                
                // Zapisujemy nowy stan by w tej samej pętli kolejne raporty na to samo zlecenie działały poprawnie
                oData.appReportedQuantity = newAppQty;
                oData.status = newStatus;
                oData.elements = newElements;
              }

              for (const log of sessionLogs) {
                const memberDuration = memberDurations[log.id] || 0;
                const individualQuantity = totalTeamSeconds > 0 
                  ? (report.quantity * (memberDuration / totalTeamSeconds))
                  : (report.quantity / sessionLogs.length);
                  
                const newLogRef = doc(collection(db, 'workLogs'));
                const elem = oData?.elements?.find((e:any) => e.id === report.elementId);

                transaction.set(newLogRef, {
                  userId: log.userId,
                  userName: log.userName,
                  orderId: report.orderId,
                  orderNumber: oData?.orderNumber || null,
                  elementId: report.elementId || null,
                  elementName: elem?.name || null,
                  startTime: log.startTime,
                  endTime: endTime,
                  duration: Math.floor(memberDuration), 
                  quantityReported: Number(individualQuantity.toFixed(3)),
                  sessionId: activeLog.sessionId,
                  stationId: activeLog.stationId,
                  stationName: activeLog.stationName,
                  assortmentCategory: oData?.assortmentCategory || null,
                  manual: false
                });
              }
            }

            for (const log of sessionLogs) {
              if (log.id) {
                const logRef = doc(db, 'workLogs', log.id);
                transaction.delete(logRef);
              }
            }

          } else {
            // CZŁONEK OPUSZCZA ZESPÓŁ
            const logRef = doc(db, 'workLogs', activeLog.id);
            transaction.update(logRef, { endTime, duration });
            if (activeLog.sessionId) {
              const sessionRef = doc(db, 'workSessions', activeLog.sessionId);
              transaction.update(sessionRef, {
                memberIds: arrayRemove(currentOperator?.id)
              });
            }
          }
        } else {
          // PRACA INDYWIDUALNA
          const report = reports?.[0];
          const quantity = report?.quantity || 0;
          
          let oData = null;
          let orderRef = null;
          
          if (activeLog.orderId) {
            orderRef = doc(db, 'orders', activeLog.orderId);
            const oSnap = await transaction.get(orderRef);
            if (oSnap.exists()) {
              oData = oSnap.data();
            }
          }
          
          const logRef = doc(db, 'workLogs', activeLog.id!);
          transaction.update(logRef, {
            endTime, duration, quantityReported: quantity
          });

          if (orderRef && oData) {
            const { newAppQty, newElements, newStatus } = applyLogImpactToOrder(oData, activeLog.elementId, quantity);
            transaction.update(orderRef, {
              appReportedQuantity: newAppQty,
              status: newStatus,
              elements: newElements
            });
          }
        }
      });

      setActiveLog(null);
    } catch (err) {
      console.error(err);
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