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
  isActive: boolean = false
): ProductionOrder['status'] {
  // Bezwzględny warunek ERP
  if (erpQty >= targetQty && targetQty > 0) {
    return 'completed';
  }
  
  // Warunek pracy w hali produkcyjnej (Zameldowane)
  if (appQty >= targetQty && targetQty > 0) {
    return 'reported';
  }
  
  // Warunek w toku
  if (appQty > 0 || isActive) {
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
     newStatus = calculateOrderStatus(orderData.erpReportedQuantity || 0, Number(newAppQty.toFixed(3)), orderData.targetQuantity);
  }

  return { newAppQty: Number(newAppQty.toFixed(3)), newElements: updatedElements, newStatus };
}
