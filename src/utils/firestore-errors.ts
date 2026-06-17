import { OperationType, type FirestoreErrorInfo } from '../types';
import type { Auth } from 'firebase/auth';

/**
 * @file firestore-errors.ts
 * @description Narzędzie do ustandaryzowanego raportowania błędów Firestore.
 * Zgodne z wytycznymi dotyczącymi diagnostyki uprawnień (Security Rules).
 */

/**
 * Przetwarza błąd Firestore i rzuca nowy błąd z metadanymi w formacie JSON.
 * Umożliwia systemowi AIS Agent szybką diagnozę problemów z regułami bezpieczeństwa.
 * 
 * @param error - Oryginalny błąd przechwycony z Firestore.
 * @param operationType - Typ operacji (np. 'get', 'write', 'update').
 * @param path - Ścieżka do dokumentu lub kolekcji, której dotyczył błąd.
 * @param auth - Instancja Firebase Auth do pobrania kontekstu użytkownika.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  auth: Auth
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified || undefined,
      isAnonymous: auth.currentUser?.isAnonymous || undefined,
      tenantId: auth.currentUser?.tenantId || undefined,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || '',
        email: provider.email || '',
        photoUrl: provider.photoURL || ''
      })) || []
    }
  };

  const errorMessage = JSON.stringify(errInfo);
  console.error('Firestore Error Context:', errorMessage);
  
  // Rzucamy błąd z JSONem w wiadomości, aby AIS Agent mógł go sparsować
  throw new Error(errorMessage);
}
