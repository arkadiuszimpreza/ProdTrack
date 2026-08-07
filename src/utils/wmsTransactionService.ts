import { doc, collection, serverTimestamp, Transaction, WriteBatch, Firestore } from 'firebase/firestore';
import { InventoryTransaction, InventoryTransactionType } from '../types';

/**
 * Klasa zarządzająca sekwencjami numerów dokumentów wewnątrz pojedynczej transakcji Firestore.
 * Gwarantuje, że odczyt licznika odbywa się w fazie ODCZYTU (READ), a modyfikacje w fazie ZAPISU (WRITE).
 */
export class SequenceCounter {
  private data: Record<string, number>;
  private counterRef: any;
  private year: number;
  private month: string;
  private pendingUpdates: Record<string, number> = {};

  constructor(counterRef: any, initialData: Record<string, number> = {}) {
    this.counterRef = counterRef;
    this.data = { ...initialData };
    const now = new Date();
    this.year = now.getFullYear();
    this.month = String(now.getMonth() + 1).padStart(2, '0');
  }

  getNextNumber(type: InventoryTransactionType): string {
    const sequenceKey = `${type}_${this.year}_${this.month}`;
    const currentVal = this.pendingUpdates[sequenceKey] ?? this.data[sequenceKey] ?? 0;
    const nextVal = currentVal + 1;
    this.pendingUpdates[sequenceKey] = nextVal;

    const seqString = String(nextVal).padStart(4, '0');
    return `${type}/${this.year}/${this.month}/${seqString}`;
  }

  commit(transaction: Transaction) {
    if (Object.keys(this.pendingUpdates).length > 0) {
      transaction.set(this.counterRef, this.pendingUpdates, { merge: true });
    }
  }
}

/**
 * Pobiera licznik sekwencji w fazie ODCZYTU transakcji (przed wszelkimi zapisami).
 */
export const getSequenceCounter = async (
  db: Firestore,
  transaction: Transaction
): Promise<SequenceCounter> => {
  const counterRef = doc(db, 'system_configs', 'wms_transaction_sequences');
  const counterSnap = await transaction.get(counterRef);
  const data = counterSnap.exists() ? (counterSnap.data() as Record<string, number>) : {};
  return new SequenceCounter(counterRef, data);
};

/**
 * Zwraca znak (+1 lub -1) dla wybranego typu dokumentu ERP.
 */
export const getTransactionSign = (type: InventoryTransactionType): 1 | -1 => {
  switch (type) {
    case 'PZ':
    case 'PW':
    case 'PWI':
    case 'BO':
      return 1;
    case 'RW':
    case 'RWI':
      return -1;
    default:
      return 1;
  }
};

/**
 * Generuje unikalny numer transakcji magazynowej ERP, np. "PZ/2026/07/0001".
 * UWAGA: Jeśli używasz transakcji Firestore, użyj getSequenceCounter(db, transaction) w fazie ODCZYTU!
 */
export const generateTransactionNumber = async (
  db: Firestore,
  type: InventoryTransactionType,
  transaction?: Transaction
): Promise<string> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const sequenceKey = `${type}_${year}_${month}`;

  const counterRef = doc(db, 'system_configs', 'wms_transaction_sequences');

  let nextVal = 1;

  if (transaction) {
    const counterSnap = await transaction.get(counterRef);
    if (counterSnap.exists() && counterSnap.data()[sequenceKey] !== undefined) {
      nextVal = counterSnap.data()[sequenceKey] + 1;
    }
    transaction.set(counterRef, { [sequenceKey]: nextVal }, { merge: true });
  } else {
    // Generowanie bez zewnętrznej transakcji (awaryjnie z losowym sufiksem)
    const randomSuffix = Math.floor(Math.random() * 9000 + 1000);
    return `${type}/${year}/${month}/${randomSuffix}`;
  }

  const seqString = String(nextVal).padStart(4, '0');
  return `${type}/${year}/${month}/${seqString}`;
};

export interface CreateTransactionParams {
  type: InventoryTransactionType;
  batchId: string;
  batchNumber: string;
  articleNumber: string;
  articleName: string;
  quantity: number;
  unit?: string;
  previousBatchQuantity: number;
  workerName: string;
  createdBy: string;
  date?: string;
  unitPrice?: number;
  totalValue?: number;
  calculatorDetails?: string;
  sourcePurchaseOrderId?: string;
  relatedDocumentId?: string;
  notes?: string;
  adjustedTransactionId?: string;
  adjustedWithdrawalId?: string;
  withdrawalCorrectionAmount?: number;
}

/**
 * Przygotowuje obiekt dokumentu transakcji magazynowej z wyliczonymi ilościami ze znakiem.
 */
export const buildTransactionData = (
  params: CreateTransactionParams,
  transactionNumber: string
): InventoryTransaction => {
  const sign = getTransactionSign(params.type);
  const qty = Math.abs(params.quantity);
  const signedQty = Number((qty * sign).toFixed(3));
  const newQty = Number((params.previousBatchQuantity + signedQty).toFixed(3));
  const todayStr = params.date || new Date().toISOString().split('T')[0];
  const unitPrice = params.unitPrice !== undefined ? params.unitPrice : 0;
  const totalValue = params.totalValue !== undefined ? params.totalValue : Number((qty * unitPrice).toFixed(2));

  return {
    transactionNumber,
    type: params.type,
    sign,
    batchId: params.batchId,
    batchNumber: params.batchNumber,
    articleNumber: params.articleNumber || '',
    articleName: params.articleName || '',
    quantity: qty,
    signedQuantity: signedQty,
    unit: params.unit || 'szt',
    previousBatchQuantity: params.previousBatchQuantity,
    newBatchQuantity: newQty,
    unitPrice,
    totalValue,
    workerName: params.workerName,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    date: todayStr,
    ...(params.calculatorDetails ? { calculatorDetails: params.calculatorDetails } : {}),
    ...(params.sourcePurchaseOrderId ? { sourcePurchaseOrderId: params.sourcePurchaseOrderId } : {}),
    ...(params.relatedDocumentId ? { relatedDocumentId: params.relatedDocumentId } : {}),
    ...(params.notes ? { notes: params.notes } : {}),
    ...(params.adjustedTransactionId ? { adjustedTransactionId: params.adjustedTransactionId } : {}),
    ...(params.adjustedWithdrawalId ? { adjustedWithdrawalId: params.adjustedWithdrawalId } : {}),
    ...(params.withdrawalCorrectionAmount ? { withdrawalCorrectionAmount: params.withdrawalCorrectionAmount } : {})
  };
};

export interface OrderMaterialWithdrawalParams {
  batchId: string;
  quantityToWithdraw: number;
  workerName: string;
  createdBy: string;
  orderId?: string;
  orderNumber?: string;
  elementId?: string;
  elementName?: string;
  calculatorDetails?: string;
  notes?: string;
}

/**
 * Wykonuje spójny rozchód materiału (RW) powiązany z meldunkiem elementu zlecenia produkcyjnego.
 * Ściśle przestrzega reżimu Firestore: WSZYSTKIE ODCZYTY (READ) PRZED ZAPISAMI (WRITE).
 */
export const executeOrderMaterialWithdrawalTx = async (
  db: Firestore,
  params: OrderMaterialWithdrawalParams
): Promise<{ withdrawalId: string; transactionNumber: string }> => {
  const { runTransaction } = await import('firebase/firestore');

  return await runTransaction(db, async (transaction) => {
    // 1. FAZA ODCZYTU (READ PHASE) - WSZYSTKIE ODCZYTY PIERWSZE
    const batchRef = doc(db, 'inventoryBatches', params.batchId);
    const batchSnap = await transaction.get(batchRef);

    if (!batchSnap.exists()) {
      throw new Error(`Wsad ${params.batchId} nie istnieje w bazie.`);
    }

    const batchData = batchSnap.data();
    const currentAvailable = batchData.numericQuantity || 0;

    if (currentAvailable < params.quantityToWithdraw) {
      throw new Error(
        `Niewystarczająca ilość na wsadzie ${batchData.batchNumber}. Dostępne: ${currentAvailable}, Wymagane: ${params.quantityToWithdraw}`
      );
    }

    // Odczyt licznika sekwencji przed jakimikolwiek zapisami
    const seqCounter = await getSequenceCounter(db, transaction);

    // 2. FAZA ZAPISU (WRITE PHASE) - ZAPISY PO ODCZYTACH
    const txNumber = seqCounter.getNextNumber('RW');
    seqCounter.commit(transaction);

    const todayStr = new Date().toISOString().split('T')[0];
    const unitLabel = batchData.quantityString?.split(' ')[1] || batchData.unit || 'szt';
    const newBatchQty = Number((currentAvailable - params.quantityToWithdraw).toFixed(3));
    const newWithdrawnQty = Number(((batchData.withdrawnQuantity || 0) + params.quantityToWithdraw).toFixed(3));

    // A. Utworzenie wpisu w materialWithdrawals
    const withdrawalRef = doc(collection(db, 'materialWithdrawals'));
    const withdrawalData = {
      withdrawalDate: todayStr,
      workerName: params.workerName,
      articleNumber: batchData.articleNumber || '',
      articleName: batchData.articleName || '',
      batchNumber: batchData.batchNumber,
      sourcePurchaseOrderId: batchData.sourcePurchaseOrderId || '',
      quantityWithdrawn: params.quantityToWithdraw,
      type: 'WITHDRAWAL',
      calculatorDetails: params.calculatorDetails || '',
      createdAt: serverTimestamp(),
      createdBy: params.createdBy,
      ...(params.orderId ? { orderId: params.orderId } : {}),
      ...(params.orderNumber ? { orderNumber: params.orderNumber } : {}),
      ...(params.elementId ? { elementId: params.elementId } : {}),
      ...(params.elementName ? { elementName: params.elementName } : {}),
      ...(params.notes ? { notes: params.notes } : {})
    };
    transaction.set(withdrawalRef, withdrawalData);

    // B. Utworzenie oficjalnego kwitu ERP RW
    const txRef = doc(collection(db, 'inventoryTransactions'));
    const txData = buildTransactionData(
      {
        type: 'RW',
        batchId: params.batchId,
        batchNumber: batchData.batchNumber,
        articleNumber: batchData.articleNumber || '',
        articleName: batchData.articleName || '',
        quantity: params.quantityToWithdraw,
        unit: unitLabel,
        previousBatchQuantity: currentAvailable,
        unitPrice: batchData.unitPrice || 0,
        workerName: params.workerName,
        createdBy: params.createdBy,
        date: todayStr,
        calculatorDetails: params.calculatorDetails,
        sourcePurchaseOrderId: batchData.sourcePurchaseOrderId || '',
        relatedDocumentId: withdrawalRef.id,
        notes: params.notes || `Rozchód z panelu operatora (${params.orderNumber || 'Zlecenie'})`
      },
      txNumber
    );
    transaction.set(txRef, txData);

    // C. Aktualizacja stanu wsadu na placu
    transaction.update(batchRef, {
      numericQuantity: newBatchQty,
      withdrawnQuantity: newWithdrawnQty,
      quantityString: `${newBatchQty} ${unitLabel}`,
      lastTransactionId: txRef.id,
      lastTransactionAt: serverTimestamp()
    });

    return { withdrawalId: withdrawalRef.id, transactionNumber: txNumber };
  });
};

