import { useEffect, useState } from 'react';
import type { DictionaryId } from '../types/dictionaries';
import type { DictionaryRow } from '../utils/dictionaryFields';
import { describeDictionaryError } from '../utils/dictionaryEditing';
import { subscribeDictionary } from '../utils/dictionaryService';

export interface UseDictionaryResult {
  items: DictionaryRow[];
  /** Czy dokument słownika istnieje w bazie. */
  exists: boolean;
  loading: boolean;
  /** Komunikat po polsku albo null. */
  error: string | null;
}

/**
 * Podgląd słownika na żywo. Zależnością efektu jest tylko `id` (zwykły tekst), więc nasłuch
 * zakłada się raz na słownik i nie jest odtwarzany przy każdym renderze.
 */
export function useDictionary(id: DictionaryId): UseDictionaryResult {
  const [state, setState] = useState<UseDictionaryResult>({ items: [], exists: false, loading: true, error: null });

  useEffect(() => {
    setState({ items: [], exists: false, loading: true, error: null });
    return subscribeDictionary(
      id,
      (snapshot) => setState({ items: snapshot.items, exists: snapshot.exists, loading: false, error: null }),
      (error) => setState({ items: [], exists: false, loading: false, error: describeDictionaryError(error) }),
    );
  }, [id]);

  return state;
}
