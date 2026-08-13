import re

with open('src/components/production/OrderLogsView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

recalc_fn = """
  const handleRecalculate = async () => {
    if (!window.confirm('Czy na pewno chcesz przeliczyć wkład i status zlecenia na podstawie historii meldunków? Użyj tego, jeśli suma meldunków nie zgadza się ze statusem ZP.')) return;
    
    try {
      let totalAppQty = 0;
      let elementsState = order.elements ? [...order.elements].map(e => ({...e, reportedQuantity: 0})) : [];

      logs.filter(l => l.quantityReported && l.quantityReported > 0).forEach(log => {
        let weightedDelta = log.quantityReported || 0;
        
        if (log.elementId && elementsState.length > 0) {
          const targetElement = elementsState.find((el: any) => el.id === log.elementId);
          if (targetElement) {
            const totalWeight = elementsState.reduce((sum: number, el: any) => sum + (el.weight || 0), 0);
            if (totalWeight > 0) {
              weightedDelta = (log.quantityReported || 0) * ((targetElement.weight || 0) / totalWeight);
            }
            targetElement.reportedQuantity = (targetElement.reportedQuantity || 0) + (log.quantityReported || 0);
          }
        }
        totalAppQty += weightedDelta;
      });

      const newAppTotal = Number(totalAppQty.toFixed(3));
      const newStatus = calculateOrderStatus(
        order.erpReportedQuantity || order.reportedQuantity || 0,
        newAppTotal,
        order.targetQuantity || 1,
        false,
        elementsState.length > 0 ? elementsState : undefined
      );

      const updateData: any = {
        appReportedQuantity: newAppTotal,
        status: newStatus
      };
      if (elementsState.length > 0) {
        updateData.elements = elementsState;
      }

      await updateDoc(doc(db, 'orders', order.id), updateData);
      alert('Przeliczono pomyślnie. Nowa wartość "z Hali" to: ' + newAppTotal + ' szt.');
      onClose();
    } catch (err) {
      console.error(err);
      alert('Błąd podczas przeliczania.');
    }
  };

  return (
"""

content = content.replace('  return (', recalc_fn, 1)
with open('src/components/production/OrderLogsView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
