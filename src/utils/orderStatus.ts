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
