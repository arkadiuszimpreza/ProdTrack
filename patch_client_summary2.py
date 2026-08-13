import re

with open('src/components/management/ClientOrderSummaryView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix executeDeleteSelected
delete_selected_replacement = '''
    try {
      await runTransaction(db, async (transaction) => {
        const orderUpdates = new Map<string, any>();
        
        for (const logId of Array.from(selectedLogIds)) {
          const log = logs.find(l => l.id === logId);
          if (log && log.quantityReported && log.orderId) {
             let orderData = orderUpdates.get(log.orderId);
             if (!orderData) {
                 const orderRef = doc(db, "orders", log.orderId);
                 const orderSnap = await transaction.get(orderRef);
                 if (orderSnap.exists()) {
                     orderData = orderSnap.data();
                     orderUpdates.set(log.orderId, orderData);
                 }
             }
             if (orderData) {
                 const { newAppQty, newElements, newStatus } = applyLogImpactToOrder(orderData, log.elementId, -log.quantityReported);
                 orderData.appReportedQuantity = newAppQty;
                 orderData.elements = newElements;
                 orderData.status = newStatus;
             }
          }
        }
        
        // Write order updates
        orderUpdates.forEach((data, oId) => {
            transaction.update(doc(db, "orders", oId), {
               appReportedQuantity: data.appReportedQuantity,
               status: data.status,
               elements: data.elements
            });
        });

        for (const logId of Array.from(selectedLogIds)) {
          const logRef = doc(db, 'workLogs', logId);
          transaction.delete(logRef);
        }
      });
'''
content = re.sub(
    r'try \{\s*await runTransaction\(db, async \(transaction\) => \{.*?for \(const logId of Array\.from\(selectedLogIds\)\) \{\s*const logRef = doc\(db, \'workLogs\', logId\);\s*transaction\.delete\(logRef\);\s*\}\s*\}\);\s*// Update local state without re-fetching',
    delete_selected_replacement + '      // Update local state without re-fetching',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'Analiza Meldunków: \{order\.orderNumber\}',
    r'Analiza Meldunków (Zlecenie Klienta): {erpOrderNumber}',
    content
)
content = re.sub(
    r'<p className="text-xs text-stone-500 mt-0\.5 font-medium">\{order\.productName\}</p>',
    r'<p className="text-xs text-stone-500 mt-0.5 font-medium">Ilość zleceń prod: {clientOrders.length}</p>',
    content
)


with open('src/components/management/ClientOrderSummaryView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
