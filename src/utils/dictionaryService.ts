/**
 * Dostęp do słowników w Firestore (Faza 0, krok 1b).
 *
 * Każdy słownik to jeden dokument `dictionaries/{id}` z tablicą `items`.
 * Zapis idzie przez TRANSAKCJĘ (runTransaction): Firestore czyta aktualny dokument, my wyliczamy
 * nową listę z TEGO, co faktycznie w bazie jest, i zapisujemy. Gdyby w międzyczasie ktoś inny
 * zmienił dokument, Firestore sam powtórzy całą operację na świeżych danych — dzięki temu dwóch
 * administratorów nie nadpisze sobie nawzajem zmian (przy zwykłym „odczytaj, zmień, zapisz”
 * wygrałby ten, kto zapisał ostatni, i po cichu skasował pracę drugiego).
 * Uwaga: funkcja `mutate` może zostać wywołana więcej niż raz, więc musi być czysta (bez efektów ubocznych).
 */
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { DictionaryId } from '../types/dictionaries';
import type { DictionaryRow } from './dictionaryFields';
import { DictionaryValidationError } from './dictionaryEditing';
import { validateDictionaryItems, type DictionaryValidationContext } from './dictionaryUtils';

export interface DictionarySnapshot {
  items: DictionaryRow[];
  /** Czy dokument słownika w ogóle istnieje w bazie (przed pierwszym zapisem: nie). */
  exists: boolean;
}

function toRows(raw: unknown): DictionaryRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is DictionaryRow => typeof item === 'object' && item !== null && !Array.isArray(item));
}

/** Nasłuchuje zmian słownika (1 odczyt na start + po 1 przy każdej zmianie). Zwraca funkcję kończącą nasłuch. */
export function subscribeDictionary(
  id: DictionaryId,
  onData: (snapshot: DictionarySnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'dictionaries', id),
    (snap) => onData({ items: toRows(snap.data()?.items), exists: snap.exists() }),
    onError,
  );
}

/**
 * Zmienia zawartość słownika atomowo: `mutate` dostaje aktualną listę z bazy i zwraca nową.
 * Nowa lista jest walidowana PRZED zapisem; przy błędzie nic się nie zapisuje (DictionaryValidationError).
 */
export async function updateDictionary(
  id: DictionaryId,
  mutate: (current: DictionaryRow[]) => DictionaryRow[],
  context: DictionaryValidationContext = {},
): Promise<DictionaryRow[]> {
  const ref = doc(db, 'dictionaries', id);
  const email = auth.currentUser?.email ?? '';

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const next = mutate(toRows(snap.data()?.items));

    const errors = validateDictionaryItems(id, next, context);
    if (errors.length > 0) throw new DictionaryValidationError(errors);

    transaction.set(ref, { items: next, updatedAt: serverTimestamp(), updatedBy: email });
    return next;
  });
}
