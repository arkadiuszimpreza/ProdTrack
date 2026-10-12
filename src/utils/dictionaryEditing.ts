/**
 * Czyste operacje na zawartości słowników (Faza 0, krok 1b).
 *
 * Wszystkie funkcje zwracają NOWĄ tablicę i nie zmieniają wejścia — React porównuje stan
 * po referencji, więc mutowanie tablicy „w miejscu” mogłoby nie odświeżyć ekranu.
 * Sprawdzenie poprawności całości robi `validateDictionaryItems` przy zapisie.
 */
import { DICTIONARY_SEEDS } from '../data/dictionarySeeds';
import type { DictionaryId } from '../types/dictionaries';
import { DICTIONARY_FIELDS, keyFieldOf, type DictionaryRow } from './dictionaryFields';

/** Dane startowe słownika jako zwykłe pozycje (kopie — wywołujący może je dowolnie przekazywać dalej). */
export function getSeedRows(id: DictionaryId): DictionaryRow[] {
  return (DICTIONARY_SEEDS[id] as readonly object[]).map((item) => ({ ...item }) as DictionaryRow);
}

export function rowKey(id: DictionaryId, row: DictionaryRow): string {
  const value = row[keyFieldOf(id)];
  return typeof value === 'string' ? value : '';
}

/**
 * Porządkuje pozycję z formularza: przycina spacje w tekstach, kod magazynu zamienia na wielkie litery,
 * a puste pola opcjonalne usuwa (Firestore nie przyjmuje wartości `undefined`, a pusty tekst
 * w polu „uwagi” tylko zaśmiecałby dokument).
 */
export function normalizeRow(id: DictionaryId, row: DictionaryRow): DictionaryRow {
  const result: DictionaryRow = {};
  for (const field of DICTIONARY_FIELDS[id]) {
    const value = row[field.name];
    if (field.kind === 'text' || field.kind === 'longtext' || field.kind === 'select') {
      const text = typeof value === 'string' ? value.trim() : '';
      if (field.optional && text === '') continue;
      result[field.name] = text;
    } else if (field.kind === 'number') {
      result[field.name] = typeof value === 'number' ? value : Number(value);
    } else if (field.kind === 'boolean') {
      result[field.name] = value === true;
    } else {
      result[field.name] = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    }
  }
  if (id === 'warehouses' && typeof result.code === 'string') {
    result.code = result.code.toUpperCase();
  }
  return result;
}

/** Dodaje pozycję na końcu. Duplikaty kluczy wyłapie walidacja przy zapisie. */
export function appendRow(items: readonly DictionaryRow[], row: DictionaryRow): DictionaryRow[] {
  return [...items, row];
}

/** Podmienia pozycję o danym kluczu (miejsce w kolejności zostaje). Nieznany klucz = błąd, nie ciche dopisanie. */
export function replaceRow(
  id: DictionaryId,
  items: readonly DictionaryRow[],
  key: string,
  row: DictionaryRow,
): DictionaryRow[] {
  if (!items.some((item) => rowKey(id, item) === key)) {
    throw new Error(`Pozycja „${key}” nie istnieje w słowniku — odśwież ekran i spróbuj ponownie.`);
  }
  return items.map((item) => (rowKey(id, item) === key ? row : item));
}

/** Przełącza aktywność pozycji. Pozycji nie usuwamy — dezaktywacja zachowuje powiązania w innych danych. */
export function toggleActive(id: DictionaryId, items: readonly DictionaryRow[], key: string): DictionaryRow[] {
  if (!items.some((item) => rowKey(id, item) === key)) {
    throw new Error(`Pozycja „${key}” nie istnieje w słowniku — odśwież ekran i spróbuj ponownie.`);
  }
  return items.map((item) => (rowKey(id, item) === key ? { ...item, active: item.active !== true } : item));
}

/**
 * Dopisuje wartości startowe, których jeszcze nie ma (po kluczu). Istniejących pozycji NIE zmienia
 * i nie nadpisuje — dzięki temu przycisk jest bezpieczny także wtedy, gdy admin zdążył coś poprawić.
 * Wywołanie powtórzone nic już nie dopisze.
 */
export function mergeMissingSeeds(
  id: DictionaryId,
  current: readonly DictionaryRow[],
  seeds: readonly DictionaryRow[],
): { items: DictionaryRow[]; addedKeys: string[] } {
  const known = new Set(current.map((item) => rowKey(id, item)));
  const toAdd = seeds.filter((seed) => !known.has(rowKey(id, seed)));
  return {
    items: [...current, ...toAdd],
    addedKeys: toAdd.map((seed) => rowKey(id, seed)),
  };
}

/** Następna wartość „Kolejność” dla wydziału: największa dotychczasowa + 10 (zostaje miejsce na wstawki). */
export function nextSortOrder(items: readonly DictionaryRow[]): number {
  const max = items.reduce((acc, item) => {
    const value = item.sortOrder;
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(acc, value) : acc;
  }, 0);
  return max + 10;
}

// ---------------------------------------------------------------------------
// Błędy zapisu — komunikaty zrozumiałe dla człowieka (AGENTS.md, sekcja 7.3)
// ---------------------------------------------------------------------------

/** Zbiór błędów walidacji z `validateDictionaryItems`; zapis do bazy w ogóle nie nastąpił. */
export class DictionaryValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Nie zapisano słownika: ${errors.join(' ')}`);
    this.name = 'DictionaryValidationError';
    this.errors = errors;
  }
}

/** Zamienia błąd (walidacji, Firestore lub inny) na komunikat dla administratora. */
export function describeDictionaryError(error: unknown): string {
  if (error instanceof DictionaryValidationError) {
    return `Nie zapisano — popraw:\n${error.errors.map((e) => `• ${e}`).join('\n')}`;
  }
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code === 'permission-denied') {
    return 'Brak uprawnień do słowników (zapisywać może tylko administrator). Jeśli jesteś administratorem, a reguły bazy dla kolekcji „dictionaries” nie zostały jeszcze wdrożone, kolekcja jest zablokowana do czasu wdrożenia.';
  }
  if (code === 'unavailable') return 'Brak połączenia z bazą danych. Spróbuj ponownie za chwilę.';
  if (code === 'aborted') return 'Ktoś zapisał ten słownik w tej samej chwili. Spróbuj ponownie.';
  if (error instanceof Error && error.message) return error.message;
  return 'Nie udało się zapisać słownika. Spróbuj ponownie.';
}
