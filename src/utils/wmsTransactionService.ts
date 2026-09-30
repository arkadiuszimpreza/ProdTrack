import { doc, collection, serverTimestamp, Transaction, WriteBatch, Firestore, DocumentReference } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { InventoryTransaction, InventoryTransactionType } from '../types';

/**
 * Pobiera pulę unikalnych numerów transakcji WMS z Cloud Function działającej w chmurze GCP.
 * Używa Firebase Admin SDK po stronie backendu, gwarantując atomowość i brak konieczności
 * dawania uprawnień zapisu do system_configs na frontendzie.
 */
export const fetchSequenceNumbersFromCloud = async (
  type: InventoryTransactionType,
  count: number = 1
): Promise<string[]> => {
  try {
    const getNextWmsSequenceCallable = httpsCallable<
      { type: InventoryTransactionType; count: number },
      { numbers: string[]; nextNumber: string; count: number; sequenceKey: string }
    >(functions, 'getNextWmsSequence');

    const result = await getNextWmsSequenceCallable({ type, count });
    if (result.data && Array.isArray(result.data.numbers) && result.data.numbers.length > 0) {
      return result.data.numbers;
    }
    throw new Error('Pusta odpowiedź z Cloud Function getNextWmsSequence');
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.warn(
      `[WMS Sequence] Cloud Function niedostępna (${err?.code || err?.message}). Używam transakcyjnego mechanizmu zapasowego Firestore.`,
      error
    );
    throw error;
  }
};

/**
 * Pobiera pulę numerów z Cloud Function dla zadanego typu (lub mapy typów z liczbą potrzebnych numerów)
 * z bezpiecznym fallbackiem (w razie błędu sieci zwraca pusty obiekt, co pozwala transakcji użyć fallbacku Firestore).
 */
export const reserveTransactionNumbers = async (
  requests: Partial<Record<InventoryTransactionType, number>>
): Promise<Record<string, string[]>> => {
  const result: Record<string, string[]> = {};
  await Promise.all(
    Object.entries(requests).map(async ([typeStr, count]) => {
      const type = typeStr as InventoryTransactionType;
      if (!count || count <= 0) return;
      try {
        const numbers = await fetchSequenceNumbersFromCloud(type, count);
        if (numbers && numbers.length > 0) {
          result[type] = numbers;
        }
      } catch (err) {
        console.warn(
          `[WMS] Nie udało się zarezerwować puli numerów dla ${type} z Cloud Function. Używam transakcyjnego fallbacku Firestore.`,
          err
        );
      }
    })
  );
  return result;
};

/**
 * Klasa zarządzająca sekwencjami numerów dokumentów wewnątrz pojedynczej transakcji Firestore.
 * Obsługuje zarówno numery zautoryzowane z Cloud Function, jak i lokalny fallback transakcyjny.
 */
export class SequenceCounter {
  private data: Record<string, number>;
  private counterRef: DocumentReference | null;
  private year: number;
  private month: string;
  private pendingUpdates: Record<string, number> = {};
  private preReservedNumbers: Record<string, string[]> = {};
  private isCloudReserved: boolean = false;

  constructor(
    counterRef: DocumentReference | null,
    initialData: Record<string, number> = {},
    preReservedNumbers?: Record<string, string[]>
  ) {
    this.counterRef = counterRef;
    this.data = { ...initialData };
    const now = new Date();
    this.year = now.getFullYear();
    this.month = String(now.getMonth() + 1).padStart(2, '0');
    if (preReservedNumbers && Object.keys(preReservedNumbers).length > 0) {
      this.preReservedNumbers = { ...preReservedNumbers };
      this.isCloudReserved = true;
    }
  }

  getNextNumber(type: InventoryTransactionType): string {
    // 1. Jeśli posiadamy numery zarezerwowane z Cloud Function, pobieramy je z bufora
    if (this.preReservedNumbers[type] && this.preReservedNumbers[type].length > 0) {
      return this.preReservedNumbers[type].shift()!;
    }

    // 2. Mechanizm zapasowy (fallback): transakcyjna sekwencja lokalna Firestore
    const sequenceKey = `${type}_${this.year}_${this.month}`;
    const currentVal = this.pendingUpdates[sequenceKey] ?? this.data[sequenceKey] ?? 0;
    const nextVal = currentVal + 1;
    this.pendingUpdates[sequenceKey] = nextVal;

    const seqString = String(nextVal).padStart(4, '0');
    return `${type}/${this.year}/${this.month}/${seqString}`;
  }

  commit(transaction: Transaction) {
    // Jeśli numeracja została zaalokowana przez Cloud Function,
    // licznik w chmurze został już zaktualizowany na serwerze.
    // Nie wykonujemy zbędnego (i potencjalnie zablokowanego regułami) zapisu do system_configs!
    if (this.isCloudReserved && Object.keys(this.pendingUpdates).length === 0) {
      return;
    }

    if (Object.keys(this.pendingUpdates).length > 0 && this.counterRef) {
      transaction.set(this.counterRef, this.pendingUpdates, { merge: true });
    }
  }
}

/**
 * Pobiera licznik sekwencji w fazie ODCZYTU transakcji (przed wszelkimi zapisami).
 * Jeśli przekazano preReservedNumbers z Cloud Function, pomija fizyczny odczyt system_configs.
 */
export const getSequenceCounter = async (
  db: Firestore,
  transaction: Transaction,
  preReserved?: Record<string, string[]>
): Promise<SequenceCounter> => {
  if (preReserved && Object.keys(preReserved).length > 0) {
    return new SequenceCounter(null, {}, preReserved);
  }

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

  // Próba pobrania numeru RW z Cloud Function przed rozpoczęciem transakcji
  let preReserved: Record<string, string[]> | undefined = undefined;
  try {
    const cloudNumbers = await fetchSequenceNumbersFromCloud('RW', 1);
    if (cloudNumbers && cloudNumbers.length > 0) {
      preReserved = { RW: cloudNumbers };
    }
  } catch {
    // Fallback: pobranie i inkrementacja wewnątrz transakcji Firestore
  }

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

    // Odczyt licznika sekwencji przed jakimikolwiek zapisami (uwzględnia numery z Cloud Function)
    const seqCounter = await getSequenceCounter(db, transaction, preReserved);

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

