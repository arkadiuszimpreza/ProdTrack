/**
 * Opis pól słowników dla ekranu edycji (Faza 0, krok 1b).
 *
 * Ekran jest budowany z tego opisu, a nie pisany osobno dla każdego słownika —
 * dzięki temu dodanie pola to zmiana w jednym miejscu. Test w `dictionaryEditing.test.ts`
 * pilnuje, żeby opis pól zgadzał się z danymi startowymi (nie rozjechał się z typami).
 */
import type { DictionaryId } from '../types/dictionaries';
import { DICTIONARY_KEY_FIELD, MPK_UNITS, ORDER_STAGES, WAREHOUSE_GROUPS } from './dictionaryUtils';

export type FieldKind = 'text' | 'longtext' | 'number' | 'boolean' | 'select' | 'multiselect';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  /** Nazwa pola w dokumencie Firestore (zgodna z typami w `types/dictionaries.ts`). */
  name: string;
  label: string;
  kind: FieldKind;
  /** Stałe opcje dla `select` / `multiselect`. */
  options?: FieldOption[];
  /** Opcje pobierane z innego słownika (dziś tylko MPK: kod + nazwa). */
  optionsFrom?: 'mpk';
  /** Pole opcjonalne: puste = pole w ogóle nie jest zapisywane. */
  optional?: boolean;
  /** Pokazać jako kolumnę w tabeli. */
  inTable?: boolean;
  hint?: string;
}

export type DictionaryRow = Record<string, unknown>;

export const DICTIONARY_TITLES: { [K in DictionaryId]: string } = {
  departments: 'Wydziały',
  mpk: 'Miejsca powstawania kosztów (MPK)',
  warehouses: 'Magazyny',
  customerOrderStatuses: 'Statusy zleceń klienta',
  pspStatuses: 'Statusy zleceń produkcyjnych (PSP)',
};

/** Kolejność zakładek na ekranie. */
export const DICTIONARY_TAB_ORDER: readonly DictionaryId[] = [
  'departments',
  'mpk',
  'warehouses',
  'customerOrderStatuses',
  'pspStatuses',
];

export const STAGE_LABELS: { [stage: string]: string } = {
  'przed-produkcja': 'Przed produkcją',
  'przekazane-do-produkcji': 'Przekazane do produkcji',
  'przekazane-do-montazu': 'Przekazane do montażu',
  wyprodukowane: 'Wyprodukowane / gotowe do wysyłki',
  zamkniete: 'Zamknięte',
  'poza-sciezka': 'Poza głównym torem',
};

export const WAREHOUSE_GROUP_LABELS: { [group: string]: string } = {
  surowce: 'Surowce i materiały',
  wyroby: 'Wyroby gotowe',
  'produkcja-w-toku': 'Produkcja w toku',
  depozyty: 'Depozyty i reklamacje',
  narzedzia: 'Narzędzia',
  pozostale: 'Pozostałe',
};

const toOptions = (values: readonly string[], labels: { [v: string]: string } = {}): FieldOption[] =>
  values.map((value) => ({ value, label: labels[value] ?? value }));

export const DICTIONARY_FIELDS: { [K in DictionaryId]: FieldDef[] } = {
  departments: [
    { name: 'id', label: 'Identyfikator', kind: 'text', inTable: true, hint: 'Małe litery bez polskich znaków i myślniki, np. bariery-zn. Nie da się zmienić po zapisaniu.' },
    { name: 'name', label: 'Nazwa', kind: 'text', inTable: true },
    { name: 'description', label: 'Co obejmuje', kind: 'longtext', inTable: true },
    { name: 'note', label: 'Uwagi', kind: 'longtext', optional: true },
    { name: 'sortOrder', label: 'Kolejność', kind: 'number' },
    { name: 'mpkCodes', label: 'Powiązane MPK', kind: 'multiselect', optionsFrom: 'mpk', hint: 'Na razie puste — powiązanie wydziałów z MPK to późniejszy etap.' },
    { name: 'active', label: 'Aktywny', kind: 'boolean', inTable: true },
  ],
  mpk: [
    { name: 'code', label: 'Kod', kind: 'text', inTable: true, hint: 'Dokładnie 3 cyfry. Nie da się zmienić po zapisaniu.' },
    { name: 'name', label: 'Nazwa księgowa', kind: 'text', inTable: true, hint: 'Zaczyna się od pionu, np. WM-Lakiernia.' },
    { name: 'unit', label: 'Pion', kind: 'select', options: toOptions(MPK_UNITS), inTable: true },
    { name: 'note', label: 'Uwagi', kind: 'longtext', optional: true, inTable: true },
    { name: 'active', label: 'Aktywne', kind: 'boolean', inTable: true },
  ],
  warehouses: [
    { name: 'code', label: 'Kod', kind: 'text', inTable: true, hint: 'Kod z ERP, wielkie litery, bez spacji. Magazyny budów (MRD + 4 cyfry) powstają automatycznie i nie wchodzą do słownika.' },
    { name: 'name', label: 'Nazwa', kind: 'text', inTable: true },
    { name: 'groups', label: 'Grupy', kind: 'multiselect', options: toOptions(WAREHOUSE_GROUPS, WAREHOUSE_GROUP_LABELS), inTable: true },
    { name: 'inWms', label: 'Ewidencjonowany w WMS', kind: 'boolean', inTable: true },
    { name: 'active', label: 'Aktywny', kind: 'boolean', inTable: true },
  ],
  customerOrderStatuses: [
    { name: 'code', label: 'Kod', kind: 'text', inTable: true, hint: 'Dwie wielkie litery z ERP, np. PM.' },
    { name: 'name', label: 'Nazwa', kind: 'text', inTable: true },
    { name: 'stage', label: 'Etap', kind: 'select', options: toOptions(ORDER_STAGES, STAGE_LABELS), inTable: true },
    { name: 'stageConfirmed', label: 'Etap potwierdzony', kind: 'boolean', inTable: true, hint: 'Zaznacz dopiero, gdy właściciel zatwierdził przypisanie do etapu.' },
    { name: 'note', label: 'Uwagi', kind: 'longtext', optional: true },
    { name: 'active', label: 'Aktywny', kind: 'boolean', inTable: true },
  ],
  pspStatuses: [
    { name: 'code', label: 'Wartość z ERP', kind: 'text', inTable: true, hint: 'Dokładnie tak, jak występuje w eksporcie PSP-info.' },
    { name: 'name', label: 'Nazwa', kind: 'text', inTable: true },
    { name: 'active', label: 'Aktywny', kind: 'boolean', inTable: true },
  ],
};

/** Nazwa pola będącego kluczem pozycji (nie edytuje się go po zapisaniu). */
export function keyFieldOf(id: DictionaryId): string {
  return DICTIONARY_KEY_FIELD[id];
}

/** Pusta pozycja z sensownymi wartościami domyślnymi do formularza „Dodaj”. */
export function emptyRow(id: DictionaryId): DictionaryRow {
  const row: DictionaryRow = {};
  for (const field of DICTIONARY_FIELDS[id]) {
    switch (field.kind) {
      case 'boolean':
        // Nowa pozycja jest aktywna; pozostałe znaczniki tak/nie domyślnie wyłączone.
        row[field.name] = field.name === 'active';
        break;
      case 'number':
        row[field.name] = 0;
        break;
      case 'multiselect':
        row[field.name] = [];
        break;
      case 'select':
        row[field.name] = field.options?.[0]?.value ?? '';
        break;
      default:
        if (!field.optional) row[field.name] = '';
    }
  }
  return row;
}
