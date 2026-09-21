import { PurchaseOrderItem } from '../types';

export type MainDeliveryStatus = 'oczekujące' | 'dost. częściowa' | 'dostarczone';

export interface DeliveryStatusResult {
  mainStatus: MainDeliveryStatus;
  subStatus: string;
}

export function calculateDeliveryStatus(item: PurchaseOrderItem): DeliveryStatusResult {
  if (item.isManuallyCompleted) {
    return {
      mainStatus: 'dostarczone',
      subStatus: 'zamknięte ręcznie'
    };
  }

  const ordered = item.quantityOrdered || 0;
  const erp = item.quantityDelivered || 0;
  const wms = item.wmsDeliveredQuantity || 0;

  // Jeżeli nie ma ilości zamówionej (np. 0), a mimo to coś dostarczono
  if (ordered === 0) {
     if (wms > 0) return { mainStatus: 'dostarczone', subStatus: 'dostarczona WMS (ponad stan)' };
     return { mainStatus: 'oczekujące', subStatus: 'oczekujące' };
  }

  if (wms >= ordered) {
    if (erp >= ordered) {
      return { mainStatus: 'dostarczone', subStatus: 'dostarczone' };
    } else {
      return { mainStatus: 'dostarczone', subStatus: 'dostarczona WMS' };
    }
  }

  if (wms > 0 && wms < ordered) {
    if (erp === wms) {
       return { mainStatus: 'dost. częściowa', subStatus: 'dost. Częściowa' };
    }
    return { mainStatus: 'dost. częściowa', subStatus: 'dost. Częściowa WMS' };
  }

  if (wms === 0) {
    if (erp >= ordered) {
      return { mainStatus: 'oczekujące', subStatus: 'dostarczone ERP' };
    } else if (erp > 0 && erp < ordered) {
      return { mainStatus: 'oczekujące', subStatus: 'dost. Częściowa ERP' };
    } else {
      return { mainStatus: 'oczekujące', subStatus: 'oczekujące' };
    }
  }

  // Fallback
  return { mainStatus: 'oczekujące', subStatus: 'oczekujące' };
}
