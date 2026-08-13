import re

with open('src/hooks/useWorkManager.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix imports
content = content.replace(
    "import { calculateOrderStatus } from '../utils/orderStatus';",
    "import { calculateOrderStatus, applyLogImpactToOrder } from '../utils/orderStatus';"
)

content = content.replace(
    "arrayUnion, arrayRemove } from 'firebase/firestore';",
    "arrayUnion, arrayRemove, runTransaction } from 'firebase/firestore';"
)

new_stop_work = """  const stopWork = async (reports?: { orderId: string, elementId?: string, quantity: number }[]) => {
    if (!activeLog) return;
    try {
      const endTime = Timestamp.now();
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
  };"""

content = re.sub(
    r'  const stopWork = async \(reports\?: \{ orderId: string, elementId\?: string, quantity: number \}\[\]\) => \{.*?    \} catch \(err\) \{\s*handleFirestoreError\(err, OperationType.UPDATE, \'workLogs\'\);\s*\}\s*\};',
    new_stop_work,
    content,
    flags=re.DOTALL
)

with open('src/hooks/useWorkManager.ts', 'w', encoding='utf-8') as f:
    f.write(content)
