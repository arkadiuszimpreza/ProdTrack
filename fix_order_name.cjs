const fs = require('fs');
let content = fs.readFileSync('src/components/production/OrderLogsView.tsx', 'utf8');

const target = `        if (selectedOrderId && newOrderSnap && newOrderSnap.exists()) {
          const newOrderRef = doc(db, 'orders', selectedOrderId);
          const newData = newOrderSnap.data();
          const { newAppQty, newElements, newStatus } = applyLogImpactToOrder(newData, selectedElementId, safeQuantity);
          transaction.update(newOrderRef, { appReportedQuantity: newAppQty, status: newStatus, elements: newElements });
        }`;

const replacement = `        if (selectedOrderId && newOrderSnap && newOrderSnap.exists()) {
          const newOrderRef = doc(db, 'orders', selectedOrderId);
          const newData = newOrderSnap.data();
          orderNameForLog = newData.orderNumber;
          const { newAppQty, newElements, newStatus } = applyLogImpactToOrder(newData, selectedElementId, safeQuantity);
          transaction.update(newOrderRef, { appReportedQuantity: newAppQty, status: newStatus, elements: newElements });
        }`;

content = content.replace(target, replacement);

fs.writeFileSync('src/components/production/OrderLogsView.tsx', content);
