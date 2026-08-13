import { useMemo } from 'react';

// Example calculation to inject
const { totalPlannedWeight, totalActualWeight } = useMemo(() => {
  let planned = 0;
  let actual = 0;
  clientOrders.forEach(o => {
    const unitWeight = (o.elements && o.elements.length > 0) 
      ? o.elements.reduce((sum, el) => sum + (el.weight || 0), 0) 
      : (o.totalWeight || 0);
    
    planned += unitWeight * (o.targetQuantity || 1);
    const reportedQty = o.appReportedQuantity ?? o.reportedQuantity ?? 0;
    actual += unitWeight * reportedQty;
  });
  return { totalPlannedWeight: planned, totalActualWeight: actual };
}, [clientOrders]);
