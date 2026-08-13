import re

with open('src/hooks/useManualEntry.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "import { calculateOrderStatus } from '../utils/orderStatus';",
    "import { calculateOrderStatus, applyLogImpactToOrder } from '../utils/orderStatus';"
)

content = content.replace(
    "writeBatch } from 'firebase/firestore';",
    "writeBatch, runTransaction } from 'firebase/firestore';"
)

new_add_manual_logs = """  const addManualLogs = async (entries: ManualEntryPayload[]): Promise<boolean> => {
    if (!entries || entries.length === 0) return true;

    try {
      await runTransaction(db, async (transaction) => {
        const orderUpdates: Record<string, { addedQuantity: number, newCategory: string | null, orderRef: ProductionOrder, entriesForOrder: ManualEntryPayload[] }> = {};
        
        // --- ETAP 1: Agregacja wkładu ---
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

          if (order) {
            if (!orderUpdates[order.id]) {
              orderUpdates[order.id] = { addedQuantity: 0, newCategory: null, orderRef: order, entriesForOrder: [] };
            }
            orderUpdates[order.id].entriesForOrder.push(entry);
            
            const finalCategory = entry.assortmentCategory || order.assortmentCategory || null;
            if (finalCategory) {
              orderUpdates[order.id].newCategory = finalCategory;
            }
          }
        }

        // --- ETAP 2: Pobieranie i aktualizacja najświeższych danych dla zleceń ---
        const uniqueOrderIds = Object.keys(orderUpdates);
        const orderSnaps = new Map();
        for (const oId of uniqueOrderIds) {
          const oRef = doc(db, 'orders', oId);
          const oSnap = await transaction.get(oRef);
          if (oSnap.exists()) orderSnaps.set(oId, oSnap);
        }

        for (const [orderId, updateData] of Object.entries(orderUpdates)) {
          const oSnap = orderSnaps.get(orderId);
          let oData = oSnap ? oSnap.data() : null;
          
          if (oData) {
            // Aplikujemy sekwencyjnie każdy zgłoszony log na to zlecenie, aby dobrze przeliczyć elementy z wagami
            for (const entry of updateData.entriesForOrder) {
               const qty = entry.quantity || 0;
               const elemId = entry.elementId;
               const { newAppQty, newElements, newStatus } = applyLogImpactToOrder(oData, elemId, qty);
               
               oData.appReportedQuantity = newAppQty;
               oData.elements = newElements;
               oData.status = newStatus;
            }
            
            const updatePayload: any = {
              appReportedQuantity: oData.appReportedQuantity,
              status: oData.status,
              elements: oData.elements
            };

            if (updateData.newCategory) {
              updatePayload.assortmentCategory = updateData.newCategory;
            }
            
            const orderRef = doc(db, 'orders', orderId);
            transaction.update(orderRef, updatePayload);
          }
        }

        // --- ETAP 3: Dodanie logów do historii (po aktualizacji rzutującej) ---
        for (const entry of entries) {
          const employee = employees.find(e => e.id === entry.userId);
          let order = entry.order || null;
          if (!order && entry.orderId) {
              order = orders.find(o => o.id === entry.orderId) || null;
          }
          if (!employee) continue;

          const start = entry.startTime;
          const end = entry.endTime;
          if (end < start) {
              end.setDate(end.getDate() + 1);
          }
          const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
          const finalCategory = entry.assortmentCategory || order?.assortmentCategory || null;

          const logRef = doc(collection(db, 'workLogs'));
          transaction.set(logRef, {
            userId: employee.id,
            userName: employee.displayName || `${employee.firstName} ${employee.lastName}`,
            orderId: entry.orderId || order?.id || null,
            orderNumber: order?.orderNumber || (entry.orderId ? 'Archiwalne Zlecenie' : 'Praca ogólna'),
            startTime: Timestamp.fromDate(start),
            endTime: end ? Timestamp.fromDate(end) : null,
            duration: duration,
            quantityReported: entry.quantity || 0,
            assortmentCategory: finalCategory,
            elementId: entry.elementId || null,
            elementName: entry.elementName || null,
            manual: true,
            createdAt: Timestamp.now()
          });
        }
      });
      return true;
    } catch (err) {
      console.error('Manual logs save error:', err);
      handleFirestoreError(err, OperationType.CREATE, 'workLogs');
      return false;
    }
  };"""

content = re.sub(
    r'  const addManualLogs = async \(entries: ManualEntryPayload\[\]\): Promise<boolean> => \{.*?    \} catch \(err\) \{\s*console.error.*?      return false;\s*\}\s*\};',
    new_add_manual_logs,
    content,
    flags=re.DOTALL
)

with open('src/hooks/useManualEntry.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
