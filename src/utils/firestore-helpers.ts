/**
 * @file src/utils/firestore-helpers.ts
 * @description Funkcje pomocnicze dla Firestore oraz narzędzia UI.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from '../firebase';

/**
 * Łączy klasy Tailwind CSS w sposób inteligentny, rozwiązując konflikty.
 * Wspiera dynamiczne stylowanie komponentów UI.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Typy operacji wykonywanych na bazie danych.
 * Ułatwia identyfikację miejsca wystąpienia błędu.
 */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Standaryzowany mechanizm obsługi błędów Firestore.
 * Loguje szczegółowe informacje o błędzie, w tym kontekst autoryzacji, co ułatwia debugowanie.
 * 
 * @param error - Oryginalny błąd z Firebase.
 * @param operationType - Typ operacji, która zawiodła.
 * @param path - Ścieżka do kolekcji/dokumentu w Firestore.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
