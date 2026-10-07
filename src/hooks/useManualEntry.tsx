import { collection, doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Employee, ProductionOrder } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-helpers';
import { applyLogImpactToOrder } from '../utils/orderStatus';
import { getServerTime } from '../utils/serverTime';

export interface ManualEntryPayload {
  id: string;
  userId: string;
  orderId: string | null;
  order?: ProductionOrder | null;
  startTime: Date;
  endTime: Date | null;
  quantity: number;
  assortmentCategory?: string;
  elementId?: string;
  elementName?: string;
}

export function useManualEntry(employees: Employee[], orders: ProductionOrder[]) {
  
  const addManualLogs = async (entries: ManualEntryPayload[]): Promise<boolean> => {
    if (!entries || entries.length === 0) return true;

    try {
      // ZMIANA (audyt finding #5): wpisy ręczne liczyły nową ilość na zleceniu
      // z lokalnej, możliwe że już nieaktualnej kopii `orders` (stan z listenera),
      // a nie z transakcji. Jeśli w tym samym momencie ktoś inny kończył pracę na
      // tym samym zleceniu (stopWork, też licząc appReportedQuantity), jedna z
      // dwóch ilości przepadała — nadpisanie, nie suma. Transakcja z odczytem
      // świeżego stanu zlecenia naprawia to tak samo, jak już działa w stopWork().
      //
      // Przygotowujemy dane wpisów (walidacja, duration) PRZED transakcją —
      // to nie zależy od stanu bazy, tylko od tego, co wpisał użytkownik.
      type PreparedEntry = {
        userId: string;
        userName: string;
        orderId: string | null;
        orderNumber: string;
        startTime: Timestamp;
        endTime: Timestamp | null;
        duration: number;
        quantity: number;
        finalCategory: string | null;
        elementId: string | null;
        elementName: string | null;
      };

      const prepared: PreparedEntry[] = [];
      const orderIdsInvolved = new Set<string>();

      for (const entry of entries) {
        const employee = employees.find(e => e.id === entry.userId);
        let order = entry.order || null;
        if (!order && entry.orderId) {
          order = orders.find(o => o.id === entry.orderId) || null;
        }

        if (!employee) {
          console.warn(`Pominięto wpis: brak pracownika w bazie dla ID: ${entry.userId}`);
          continue;
        }

        const start = entry.startTime;
        const end = entry.endTime;

        if (end && end < start) {
          end.setDate(end.getDate() + 1);
        }

        const duration = end ? Math.floor((end.getTime() - start.getTime()) / 1000) : 0;
        const finalCategory = entry.assortmentCategory || order?.assortmentCategory || null;
        const orderId = entry.orderId || order?.id || null;

        prepared.push({
          userId: employee.id,
          userName: employee.displayName || `${employee.firstName} ${employee.lastName}`,
          orderId,
          orderNumber: order?.orderNumber || (entry.orderId ? 'Archiwalne Zlecenie' : 'Praca ogólna'),
          startTime: Timestamp.fromDate(start),
          endTime: end ? Timestamp.fromDate(end) : null,
          duration,
          quantity: entry.quantity || 0,
          finalCategory,
          elementId: entry.elementId || null,
          elementName: entry.elementName || null,
        });

        if (orderId) orderIdsInvolved.add(orderId);
      }

      const createdAt = Timestamp.fromDate(await getServerTime());

      await runTransaction(db, async (transaction) => {
        // --- ETAP 1 (odczyty): świeży stan każdego zlecenia, PRZED jakimkolwiek zapisem ---
        const orderRefs = new Map(Array.from(orderIdsInvolved).map(id => [id, doc(db, 'orders', id)]));
        const freshOrders = new Map<string, any>();
        for (const [orderId, orderRef] of orderRefs) {
          const snap = await transaction.get(orderRef);
          if (snap.exists()) {
            freshOrders.set(orderId, snap.data());
          }
        }

        // --- ETAP 2 (zapisy): logi + sekwencyjne naliczanie wpływu na zlecenia ---
        // Tą samą funkcją applyLogImpactToOrder() co w stopWork(), żeby elements[]
        // i status liczyły się identycznie dla wpisu ręcznego i zwykłego zgłoszenia.
        for (const entry of prepared) {
          const logRef = doc(collection(db, 'workLogs'));
          transaction.set(logRef, {
            userId: entry.userId,
            userName: entry.userName,
            orderId: entry.orderId,
            orderNumber: entry.orderNumber,
            startTime: entry.startTime,
            endTime: entry.endTime,
            duration: entry.duration,
            quantityReported: entry.quantity,
            assortmentCategory: entry.finalCategory,
            elementId: entry.elementId,
            elementName: entry.elementName,
            manual: true,
            createdAt
          });

          if (entry.orderId && freshOrders.has(entry.orderId)) {
            const currentData = freshOrders.get(entry.orderId);
            const { newAppQty, newElements, newStatus } = applyLogImpactToOrder(
              currentData,
              entry.elementId,
              entry.quantity
            );

            currentData.appReportedQuantity = newAppQty;
            currentData.elements = newElements;
            currentData.status = newStatus;
            if (entry.finalCategory) {
              currentData.assortmentCategory = entry.finalCategory;
            }
          }
        }

        // --- ETAP 3: finalny zapis zleceń (jeden update na zlecenie, z naliczonym stanem) ---
        for (const [orderId, orderRef] of orderRefs) {
          const finalData = freshOrders.get(orderId);
          if (!finalData) continue; // zlecenie nie istnieje (np. skasowane) — pomijamy update, log już zapisany
          transaction.update(orderRef, {
            appReportedQuantity: finalData.appReportedQuantity,
            status: finalData.status,
            elements: finalData.elements,
            ...(finalData.assortmentCategory ? { assortmentCategory: finalData.assortmentCategory } : {})
          });
        }
      });

      return true;

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'workLogs (manual)');
      return false;
    }
  };

  return { addManualLogs };
}