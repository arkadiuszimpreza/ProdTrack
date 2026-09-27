import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Transaction } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

export type InventoryTransactionType = 'PZ' | 'RW' | 'PW' | 'RWI' | 'PWI' | 'BO';

export interface GetNextSequenceRequest {
  type: InventoryTransactionType;
  count?: number;
}

export interface GetNextSequenceResponse {
  numbers: string[];
  nextNumber: string;
  count: number;
  sequenceKey: string;
}

/**
 * Cloud Function generująca unikalne, atomowe numery sekwencji dla dokumentów magazynowych WMS (PZ, RW, PW, RWI, PWI, BO).
 * Działa po stronie serwera z uprawnieniami Firebase Admin SDK, co eliminuje konieczność dawania
 * uprawnień do zapisu konfiguracji systemowej (system_configs) dla poszczególnych ról na frontendzie.
 */
export const getNextWmsSequence = onCall<GetNextSequenceRequest, Promise<GetNextSequenceResponse>>(
  { region: "europe-west1" },
  async (request: CallableRequest<GetNextSequenceRequest>): Promise<GetNextSequenceResponse> => {
    // 1. Weryfikacja uwierzytelnienia użytkownika
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Operacja wymaga zalogowania do systemu Erplast MES/WMS."
      );
    }

    const { type, count = 1 } = request.data;

    // 2. Walidacja danych wejściowych
    const validTypes: InventoryTransactionType[] = ['PZ', 'RW', 'PW', 'RWI', 'PWI', 'BO'];
    if (!type || !validTypes.includes(type)) {
      throw new HttpsError(
        "invalid-argument",
        `Nieprawidłowy typ dokumentu. Dozwolone typy: ${validTypes.join(', ')}`
      );
    }

    const requestedCount = Math.max(1, Math.min(Math.floor(count), 500));

    // 3. Autorytatywny czas serwera
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const sequenceKey = `${type}_${year}_${month}`;

    const counterRef = db.collection('system_configs').doc('wms_transaction_sequences');

    try {
      // 4. Atomowa transakcja Firestore po stronie serwera
      const generatedNumbers = await db.runTransaction(async (transaction: Transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const data = counterSnap.exists ? (counterSnap.data() as Record<string, number>) : {};

        const currentVal = data[sequenceKey] || 0;
        const newNextVal = currentVal + requestedCount;

        // Aktualizacja licznika w dokumencie konfiguracji
        transaction.set(
          counterRef,
          {
            [sequenceKey]: newNextVal,
            lastUpdatedAt: FieldValue.serverTimestamp(),
            lastUpdatedBy: request.auth?.uid || 'system'
          },
          { merge: true }
        );

        // Wygenerowanie listy kolejnych numerów
        const numbers: string[] = [];
        for (let i = 1; i <= requestedCount; i++) {
          const seqNum = currentVal + i;
          const seqString = String(seqNum).padStart(4, '0');
          numbers.push(`${type}/${year}/${month}/${seqString}`);
        }

        return numbers;
      });

      return {
        numbers: generatedNumbers,
        nextNumber: generatedNumbers[0],
        count: generatedNumbers.length,
        sequenceKey
      };
    } catch (error: any) {
      console.error("Błąd podczas generowania sekwencji WMS w Cloud Function:", error);
      throw new HttpsError(
        "internal",
        "Wystąpił błąd serwera podczas generowania numeru dokumentu WMS.",
        error?.message
      );
    }
  }
);
