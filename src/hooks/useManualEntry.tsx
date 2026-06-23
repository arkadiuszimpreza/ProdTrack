import { collection, doc, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Employee, ProductionOrder } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-helpers';
import { calculateOrderStatus } from '../utils/orderStatus';

export interface ManualEntryPayload {
  id: string;
  userId: string;
  orderId: string | null;
  order?: ProductionOrder | null;
  startTime: Date;
  endTime: Date;
  quantity: number;
  assortmentCategory?: string;
  elementId?: string;
  elementName?: string;
}

export function useManualEntry(employees: Employee[], orders: ProductionOrder[]) {
  
  const addManualLogs = async (entries: ManualEntryPayload[]): Promise<boolean> => {
    if (!entries || entries.length === 0) return true;

    try {
      const batch = writeBatch(db);
      
      // Słownik będzie agregował więcej danych dla zlecenia
      const orderUpdates: Record<string, { addedQuantity: number, newCategory: string | null, orderRef: ProductionOrder }> = {};

      // --- ETAP 1: Przetwarzanie wpisów pracowniczych ---
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
        
        if (end < start) {
            end.setDate(end.getDate() + 1);
        }
        
        const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

        // Wyznaczamy kategorię ostateczną (priorytet ma ta wybrana ręcznie w formularzu)
        const finalCategory = entry.assortmentCategory || order?.assortmentCategory || null;

        const logRef = doc(collection(db, 'workLogs'));
        batch.set(logRef, {
          userId: employee.id,
          userName: employee.displayName || `${employee.firstName} ${employee.lastName}`,
          orderId: entry.orderId || order?.id || null,
          orderNumber: order?.orderNumber || (entry.orderId ? 'Archiwalne Zlecenie' : 'Praca ogólna'),
          startTime: Timestamp.fromDate(start),
          endTime: Timestamp.fromDate(end),
          duration: duration,
          quantityReported: entry.quantity || 0,
          assortmentCategory: finalCategory, // To sprawi, że kategoria wyświetli się w "Historii"
          elementId: entry.elementId || null,
          elementName: entry.elementName || null,
          manual: true,
          createdAt: Timestamp.now()
        });

        // Agregacja dla Zlecenia
        if (order) {
          if (!orderUpdates[order.id]) {
            orderUpdates[order.id] = { addedQuantity: 0, newCategory: null, orderRef: order };
          }
          // Dodajemy wyprodukowane sztuki
          orderUpdates[order.id].addedQuantity += (entry.quantity || 0);
          
          // Jeśli użytkownik wybrał kategorię, zapamiętujemy ją, by za chwilę zaktualizować Zlecenie
          if (finalCategory) {
            orderUpdates[order.id].newCategory = finalCategory;
          }
        }
      }

      // --- ETAP 2: Aktualizacja zleceń produkcyjnych ---
      for (const [orderId, updateData] of Object.entries(orderUpdates)) {
        const order = updateData.orderRef;
        if (order) {
          // BEZPIECZNY FALLBACK: Pobieramy aktualne stany lub 0, jeśli zlecenie jest stare
          const currentAppQty = order.appReportedQuantity || 0;
          const currentErpQty = order.erpReportedQuantity || order.reportedQuantity || 0;
          
          // Dodajemy sztuki TYLKO do puli z aplikacji (hali)
          const newAppTotal = currentAppQty + updateData.addedQuantity;
          
          // STATUS (Scenariusz B): Używamy centralnej reguły statusów
          const newStatus = calculateOrderStatus(
            currentErpQty,
            newAppTotal,
            order.targetQuantity
          );
          
          // Budujemy obiekt z danymi do aktualizacji zlecenia
          const updatePayload: any = {
            appReportedQuantity: newAppTotal,
            status: newStatus
          };

          // Jeśli przechwyciliśmy nową kategorię, dopisujemy ją na stałe do Zlecenia
          if (updateData.newCategory) {
            updatePayload.assortmentCategory = updateData.newCategory;
          }

          const orderRef = doc(db, 'orders', orderId);
          batch.update(orderRef, updatePayload);
        }
      }

      await batch.commit();
      return true;

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'workLogs (manual)');
      return false;
    }
  };

  return { addManualLogs };
}