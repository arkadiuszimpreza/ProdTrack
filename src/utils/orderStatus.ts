import { ProductionOrder } from '../types';

/**
 * Centrally calculates the correct status of an order based on ERP quantity, App quantity, and Target.
 * 
 * PRIORITY 1: 'completed' (ERP reported >= target)
 * PRIORITY 2: 'reported' (App reported >= target)
 * PRIORITY 3: 'in-progress' (App reported > 0 or has active workers)
 * PRIORITY 4: 'pending' (Default)
 */
export function calculateOrderStatus(
  erpQty: number,
  appQty: number,
  targetQty: number,
  isActive: boolean = false,
  elements?: any[]
): ProductionOrder['status'] {
  const hasElements = Array.isArray(elements) && elements.length > 0;
  const hasIncompleteElements = hasElements
    ? elements.some((el: any) => (el.reportedQuantity || 0) < (el.quantity || 1))
    : false;

  // Sprawdzamy kompletność meldunków
  const isAppComplete = targetQty > 0 && appQty >= targetQty && !hasIncompleteElements;
  const isErpComplete = targetQty > 0 && erpQty >= targetQty && !hasIncompleteElements && (appQty >= targetQty || appQty === 0);

  if (isErpComplete) {
    return 'completed';
  }
  
  if (isAppComplete) {
    return 'reported';
  }
  
  if (appQty > 0 || isActive || (hasElements && elements.some((el: any) => (el.reportedQuantity || 0) > 0))) {
    return 'in-progress';
  }
  
  return 'pending';
}

/**
 * Calculates the new appReportedQuantity, elements array, and status for an order
 * when a log with a certain delta quantity is applied.
 * Correctly accounts for element weight ratios if elementId is provided.
 */
export function applyLogImpactToOrder(
  orderData: Partial<ProductionOrder>,
  elementId: string | null | undefined,
  deltaQty: number
): { newAppQty: number; newElements: any[]; newStatus: ProductionOrder['status'] } {
  let weightedDelta = deltaQty;
  let updatedElements = orderData.elements ? [...orderData.elements] : [];
  
  if (elementId && updatedElements.length > 0) {
    const targetElement = updatedElements.find((el: any) => el.id === elementId);
    if (targetElement) {
        const totalWeight = updatedElements.reduce((sum: number, el: any) => sum + (el.weight || 0), 0);
        if (totalWeight > 0) {
            weightedDelta = deltaQty * ((targetElement.weight || 0) / totalWeight);
        }
    }
    
    updatedElements = updatedElements.map((el: any) => {
      if (el.id === elementId) {
        return { ...el, reportedQuantity: Math.max(0, (el.reportedQuantity || 0) + deltaQty) };
      }
      return el;
    });
  }
  
  const newAppQty = Math.max(0, (orderData.appReportedQuantity || 0) + weightedDelta);
  let newStatus = orderData.status || 'pending';
  if (orderData.targetQuantity !== undefined) { 
     newStatus = calculateOrderStatus(
       orderData.erpReportedQuantity || 0, 
       Number(newAppQty.toFixed(3)), 
       orderData.targetQuantity,
       false,
       updatedElements
     );
  }

  return { newAppQty: Number(newAppQty.toFixed(3)), newElements: updatedElements, newStatus };
}
