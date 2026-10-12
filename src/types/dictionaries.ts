/**
 * Słowniki systemowe (Faza 0, krok 1a).
 *
 * Każdy słownik to JEDEN dokument w kolekcji `dictionaries` (id dokumentu = DictionaryId),
 * a w nim tablica `items`. Dlaczego jeden dokument, a nie jeden dokument na pozycję:
 * Firestore rozlicza każdy odczyt dokumentu, więc cały słownik (kilkadziesiąt pozycji)
 * kosztuje 1 odczyt zamiast kilkudziesięciu. Słowniki zmieniają się rzadko i tylko ręką admina.
 */

/** Identyfikatory dokumentów w kolekcji `dictionaries`. */
export const DICTIONARY_IDS = [
  'departments',
  'warehouses',
  'customerOrderStatuses',
  'pspStatuses',
  'mpk',
] as const;

export type DictionaryId = (typeof DICTIONARY_IDS)[number];

/** Znacznik czasu odczytany z Firestore (serverTimestamp zapisuje się jako Timestamp). */
export interface DictionaryTimestamp {
  toDate: () => Date;
}

/** Kształt dokumentu słownika w Firestore. */
export interface DictionaryDoc<T> {
  items: T[];
  updatedAt?: DictionaryTimestamp | null;
  /** Adres e-mail osoby, która ostatnio zapisała słownik. */
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Wydziały
// ---------------------------------------------------------------------------

/**
 * Wydział produkcyjny, do którego klasyfikator kieruje pozycje zamówień.
 * Pozycja może należeć do kilku wydziałów naraz (np. bariera malowana i cynkowana
 * trafia i do „Bariery ZN”, i do „Bariery CZN”), dlatego klasyfikator zwraca LISTĘ.
 */
export interface Department {
  /** Stabilny identyfikator (slug, np. `bariery-zn`). Nie zmieniać po uruchomieniu — odwołują się do niego inne dane. */
  id: string;
  /** Nazwa wyświetlana. */
  name: string;
  /** Co obejmuje wydział (opis własny właściciela). */
  description: string;
  /** Uwagi / wyjątki (np. „nie wszystko, co stalowe”). */
  note?: string;
  active: boolean;
  /** Kolejność wyświetlania. */
  sortOrder: number;
  /**
   * Powiązane miejsca powstawania kosztów (kody z słownika MPK).
   * Puste na starcie — docelowo wydziały mają się „zmapować” na MPK i zależności między nimi.
   */
  mpkCodes: string[];
}

// ---------------------------------------------------------------------------
// MPK — miejsca powstawania kosztów
// ---------------------------------------------------------------------------

/** Pion organizacyjny — prefiks w nazwie księgowej MPK. */
export type MpkUnit = 'WM' | 'WEP' | 'WLOG' | 'WTI' | 'Prac.zewn.';

export interface MpkCenter {
  /** Kod księgowy (np. `102`). Tekst, nie liczba — żeby nie tracić zer i nie sortować „liczbowo po cichu”. */
  code: string;
  /** Pełna nazwa księgowa (np. `WM-Lakiernia`); zaczyna się od `unit` + `-`. */
  name: string;
  unit: MpkUnit;
  active: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------
// Magazyny
// ---------------------------------------------------------------------------

/**
 * Grupa magazynów. Magazyn może należeć do kilku grup (np. WIP jest jednocześnie
 * magazynem produkcji w toku i magazynem surowcowym).
 */
export type WarehouseGroup =
  | 'surowce'
  | 'wyroby'
  | 'produkcja-w-toku'
  | 'depozyty'
  | 'narzedzia'
  | 'pozostale';

export interface Warehouse {
  /** Kod magazynu z ERP (bez spacji wyrównujących, wielkimi literami), np. `MRB`. */
  code: string;
  name: string;
  groups: WarehouseGroup[];
  /** Czy magazyn jest ewidencjonowany w module WMS ProdTrack (dziś tylko MRB i MSN). */
  inWms: boolean;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Statusy
// ---------------------------------------------------------------------------

/**
 * Etap „życia” zamówienia klienta, do którego grupujemy kody statusów ERP
 * (potrzebny na kokpitach, żeby nie pokazywać 14 kodów zarządowi).
 */
export type OrderStage =
  | 'przed-produkcja'
  | 'przekazane-do-produkcji'
  | 'przekazane-do-montazu'
  | 'wyprodukowane'
  | 'zamkniete'
  | 'poza-sciezka';

/** Status zlecenia KLIENTA w ERP (kolumna `Stan_zlec` w dystrybucja-info). */
export interface CustomerOrderStatus {
  /** Dwuliterowy kod z ERP, np. `PM`. */
  code: string;
  /** Pełna nazwa statusu. */
  name: string;
  stage: OrderStage;
  /**
   * Czy przypisanie do etapu potwierdził właściciel.
   * `false` = propozycja do zatwierdzenia — nie wolno na niej opierać liczb dla zarządu.
   */
  stageConfirmed: boolean;
  active: boolean;
  note?: string;
}

/** Status zlecenia PRODUKCYJNEGO w ERP (kolumna `Status` w PSP-info; w ProdTrack `erpStatus`). */
export interface PspStatus {
  /** Wartość dokładnie tak, jak występuje w eksporcie ERP, np. `Zamknięty`. */
  code: string;
  name: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Mapowanie id → typ pozycji (przydatne w funkcjach ogólnych)
// ---------------------------------------------------------------------------

export interface DictionaryItemMap {
  departments: Department;
  warehouses: Warehouse;
  customerOrderStatuses: CustomerOrderStatus;
  pspStatuses: PspStatus;
  mpk: MpkCenter;
}

export type DictionaryItem<K extends DictionaryId> = DictionaryItemMap[K];
