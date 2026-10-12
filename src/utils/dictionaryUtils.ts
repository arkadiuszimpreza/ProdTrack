/**
 * Funkcje pomocnicze słowników (Faza 0, krok 1a).
 *
 * To czyste funkcje (bez Firebase i Reacta) — dlatego można je testować samodzielnie
 * i używać zarówno na ekranie edycji słowników, jak i w imporcie z ERP.
 */
import {
  DICTIONARY_IDS,
  type CustomerOrderStatus,
  type DictionaryId,
  type DictionaryItem,
  type OrderStage,
  type WarehouseGroup,
} from '../types/dictionaries';

/**
 * Maksymalna liczba pozycji w jednym słowniku. Ten sam limit trafi do `firestore.rules`
 * (ochrona przed zapisem „śmieciowego”, ogromnego dokumentu — Firestore ma limit 1 MB na dokument).
 */
export const MAX_DICTIONARY_ITEMS = 500;

export const MPK_UNITS = ['WM', 'WEP', 'WLOG', 'WTI', 'Prac.zewn.'] as const;

export const WAREHOUSE_GROUPS: readonly WarehouseGroup[] = [
  'surowce',
  'wyroby',
  'produkcja-w-toku',
  'depozyty',
  'narzedzia',
  'pozostale',
];

export const ORDER_STAGES: readonly OrderStage[] = [
  'przed-produkcja',
  'przekazane-do-produkcji',
  'przekazane-do-montazu',
  'wyprodukowane',
  'zamkniete',
  'poza-sciezka',
];

/** Nazwa pola, które jest unikalnym kluczem pozycji w danym słowniku. */
export const DICTIONARY_KEY_FIELD: { [K in DictionaryId]: keyof DictionaryItem<K> & string } = {
  departments: 'id',
  warehouses: 'code',
  customerOrderStatuses: 'code',
  pspStatuses: 'code',
  mpk: 'code',
};

// ---------------------------------------------------------------------------
// Magazyny
// ---------------------------------------------------------------------------

/** Kod magazynu z ERP: bez spacji wyrównujących (ERP dopełnia je do stałej długości), wielkimi literami. */
export function normalizeWarehouseCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

const CONSTRUCTION_SITE_RE = /^MRD(\d{4})$/;

/**
 * Magazyn „budowy” (wirtualny): ERP tworzy go sam przy przesunięciu asortymentu na budowę —
 * `MRD` + 4 ostatnie cyfry numeru kontraktu. Takich magazynów nie wpisujemy do słownika
 * (powstają ciągle), tylko rozpoznajemy po wzorcu.
 */
export function parseConstructionSiteWarehouse(rawCode: unknown): { contractSuffix: string } | null {
  const match = CONSTRUCTION_SITE_RE.exec(normalizeWarehouseCode(rawCode));
  return match ? { contractSuffix: match[1] } : null;
}

// ---------------------------------------------------------------------------
// Indeksowanie i wyszukiwanie
// ---------------------------------------------------------------------------

function keyOf<K extends DictionaryId>(id: K, item: DictionaryItem<K>): string {
  const value: unknown = item[DICTIONARY_KEY_FIELD[id]];
  return typeof value === 'string' ? value : '';
}

/** Mapa klucz → pozycja (do szybkiego wyszukiwania podczas importu i na kokpitach). */
export function indexDictionary<K extends DictionaryId>(
  id: K,
  items: readonly DictionaryItem<K>[],
): Map<string, DictionaryItem<K>> {
  const map = new Map<string, DictionaryItem<K>>();
  for (const item of items) {
    map.set(keyOf(id, item), item);
  }
  return map;
}

/**
 * Zwraca kody, których NIE ma w słowniku (posortowane, bez duplikatów).
 * Nieznany kod ma być widoczny w raporcie, a nie po cichu wpadać do „innych”.
 * Dla magazynów kody `MRD####` (budowy) są pomijane — są poprawne z definicji.
 */
export function findUnknownCodes<K extends 'warehouses' | 'customerOrderStatuses' | 'pspStatuses'>(
  id: K,
  codes: Iterable<string>,
  items: readonly DictionaryItem<K>[],
): string[] {
  const known = indexDictionary(id, items);
  const unknown = new Set<string>();
  for (const raw of codes) {
    const code = id === 'warehouses' ? normalizeWarehouseCode(raw) : (raw ?? '').trim();
    if (!code) continue;
    if (id === 'warehouses' && parseConstructionSiteWarehouse(code)) continue;
    if (!known.has(code)) unknown.add(code);
  }
  return [...unknown].sort();
}

/**
 * Etap zamówienia klienta dla kodu statusu ERP.
 * Zwraca `null` dla kodu spoza słownika — wywołujący musi to pokazać, a nie zgadywać.
 */
export function resolveOrderStage(
  statusCode: string,
  statuses: readonly CustomerOrderStatus[],
): { stage: OrderStage; confirmed: boolean } | null {
  const found = statuses.find((s) => s.code === statusCode.trim().toUpperCase());
  return found ? { stage: found.stage, confirmed: found.stageConfirmed } : null;
}

// ---------------------------------------------------------------------------
// Walidacja przed zapisem
// ---------------------------------------------------------------------------

/** Dane z innych słowników potrzebne do sprawdzania powiązań (np. wydział → MPK). */
export interface DictionaryValidationContext {
  /** Kody MPK istniejące w słowniku `mpk`. Jeśli podane, `mpkCodes` wydziałów muszą się do nich odnosić. */
  mpkCodes?: ReadonlySet<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MPK_CODE_RE = /^\d{3}$/;
const WAREHOUSE_CODE_RE = /^[A-Z0-9]{2,6}$/;
const CUSTOMER_STATUS_CODE_RE = /^[A-Z]{2}$/;

/**
 * Sprawdza zawartość słownika przed zapisem. Zwraca listę komunikatów po polsku
 * (pusta = wszystko w porządku), każdy wskazuje numer pozycji i problem.
 *
 * Uwaga (warstwy ochrony): ta funkcja chroni przed przypadkową pomyłką w formularzu.
 * Prawdziwą zaporą przed nieuprawnionym zapisem są reguły bazy (`firestore.rules`) — tam
 * zapis słowników ma tylko admin.
 */
export function validateDictionaryItems(
  id: DictionaryId,
  items: unknown,
  context: DictionaryValidationContext = {},
): string[] {
  if (!DICTIONARY_IDS.includes(id)) return [`Nieznany słownik: ${String(id)}`];
  if (!Array.isArray(items)) return ['Zawartość słownika musi być listą pozycji.'];

  const errors: string[] = [];
  if (items.length > MAX_DICTIONARY_ITEMS) {
    errors.push(`Za dużo pozycji: ${items.length} (maksimum ${MAX_DICTIONARY_ITEMS}).`);
  }

  const keyField = DICTIONARY_KEY_FIELD[id];
  const seen = new Set<string>();

  items.forEach((raw: unknown, index: number) => {
    const where = `Pozycja ${index + 1}`;
    if (!isRecord(raw)) {
      errors.push(`${where}: nieprawidłowy format.`);
      return;
    }

    const key = raw[keyField];
    if (!isNonEmptyString(key)) {
      errors.push(`${where}: brak wartości w polu „${keyField}”.`);
    } else {
      if (key !== key.trim()) errors.push(`${where}: „${keyField}” ma spacje na początku lub końcu.`);
      if (seen.has(key)) errors.push(`${where}: powtórzony klucz „${key}”.`);
      seen.add(key);
    }
    const label = isNonEmptyString(key) ? `${where} („${key}”)` : where;

    if (!isNonEmptyString(raw.name)) errors.push(`${label}: brak nazwy.`);
    if (typeof raw.active !== 'boolean') errors.push(`${label}: pole „active” musi być tak/nie.`);

    switch (id) {
      case 'departments': {
        if (isNonEmptyString(key) && !SLUG_RE.test(key)) {
          errors.push(`${label}: identyfikator może zawierać tylko małe litery bez polskich znaków, cyfry i myślniki.`);
        }
        if (typeof raw.description !== 'string') errors.push(`${label}: opis musi być tekstem (może być pusty).`);
        if (typeof raw.sortOrder !== 'number' || !Number.isFinite(raw.sortOrder)) {
          errors.push(`${label}: kolejność musi być liczbą.`);
        }
        if (!Array.isArray(raw.mpkCodes) || raw.mpkCodes.some((c: unknown) => typeof c !== 'string')) {
          errors.push(`${label}: powiązane MPK muszą być listą kodów.`);
        } else if (context.mpkCodes) {
          for (const code of raw.mpkCodes as string[]) {
            if (!context.mpkCodes.has(code)) errors.push(`${label}: MPK „${code}” nie istnieje w słowniku MPK.`);
          }
        }
        break;
      }
      case 'mpk': {
        if (isNonEmptyString(key) && !MPK_CODE_RE.test(key)) errors.push(`${label}: kod MPK to dokładnie 3 cyfry.`);
        const unit = raw.unit;
        if (typeof unit !== 'string' || !(MPK_UNITS as readonly string[]).includes(unit)) {
          errors.push(`${label}: nieznany pion „${String(unit)}”.`);
        } else if (isNonEmptyString(raw.name) && !raw.name.startsWith(`${unit}-`)) {
          errors.push(`${label}: nazwa powinna zaczynać się od „${unit}-”.`);
        }
        break;
      }
      case 'warehouses': {
        if (isNonEmptyString(key)) {
          // Kolejność ma znaczenie: kod budowy (MRD + 4 cyfry, 7 znaków) nie mieści się w limicie 2–6 znaków,
          // więc najpierw sprawdzamy ten szczególny przypadek, żeby użytkownik dostał właściwy komunikat.
          if (parseConstructionSiteWarehouse(key)) {
            errors.push(`${label}: magazyny budów (MRD + 4 cyfry) powstają automatycznie i nie trafiają do słownika.`);
          } else if (!WAREHOUSE_CODE_RE.test(key)) {
            errors.push(`${label}: kod magazynu to 2–6 wielkich liter lub cyfr, bez spacji.`);
          }
        }
        const groups = raw.groups;
        if (
          !Array.isArray(groups) ||
          groups.length === 0 ||
          groups.some((g: unknown) => typeof g !== 'string' || !(WAREHOUSE_GROUPS as readonly string[]).includes(g))
        ) {
          errors.push(`${label}: magazyn musi należeć do co najmniej jednej znanej grupy.`);
        }
        if (typeof raw.inWms !== 'boolean') errors.push(`${label}: pole „inWms” musi być tak/nie.`);
        break;
      }
      case 'customerOrderStatuses': {
        if (isNonEmptyString(key) && !CUSTOMER_STATUS_CODE_RE.test(key)) {
          errors.push(`${label}: kod statusu to dwie wielkie litery.`);
        }
        if (typeof raw.stage !== 'string' || !(ORDER_STAGES as readonly string[]).includes(raw.stage)) {
          errors.push(`${label}: nieznany etap „${String(raw.stage)}”.`);
        }
        if (typeof raw.stageConfirmed !== 'boolean') errors.push(`${label}: pole „stageConfirmed” musi być tak/nie.`);
        break;
      }
      case 'pspStatuses':
        break;
    }
  });

  return errors;
}
