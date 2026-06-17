/**
 * @file index.ts
 * @description Centralna definicja typów i interfejsów dla aplikacji ProdTrack.
 * Zawiera modele danych odzwierciedlające strukturę bazy Firestore oraz typy pomocnicze UI.
 */

/**
 * Kategorie asortymentowe dostępne w systemie.
 * Wykorzystywane do klasyfikacji zleceń i logów pracy.
 */
export const ASSORTMENT_CATEGORIES = ['Bariery', 'Astor', 'Konstrukcje', 'Inne', 'Nadzór', 'Zbrojenia'] as const;
export type AssortmentCategory = typeof ASSORTMENT_CATEGORIES[number];

/**
 * Reprezentuje pojedynczy element wchodzący w skład zlecenia produkcyjnego.
 * Umożliwia precyzyjne raportowanie pracy nad konkretnymi częściami produktu.
 */
export interface OrderElement {
  /** Unikalny identyfikator elementu (UUID) */
  id: string;
  /** Nazwa elementu (np. "Rura profilowa") */
  name: string;
  /** Waga elementu w kilogramach */
  weight: number;
  /** Ilość elementów do produkcji */
  quantity?: number;
  /** Zaraportowana ilość */
  reportedQuantity?: number;
}

/**
 * Główny model zlecenia produkcyjnego (ZP).
 * Przechowuje informacje o produkcie, ilościach docelowych i aktualnym postępie.
 */
export interface ProductionOrder {
  /** Identyfikator dokumentu w Firestore */
  id: string;
  /** Numer zlecenia produkcyjnego (np. ZP/2024/001) */
  orderNumber: string;
  /** Opcjonalny numer zlecenia z systemu ERP */
  erpOrderNumber?: string;
  /** Nazwa produkowanego wyrobu */
  productName: string;
  /** Planowana ilość do wykonania */
  targetQuantity: number;
  /**waga zleceń nie składających się z elementów */
  totalWeight?: number;
  
  /** Ilość już zaraportowana (Stare pole, zachowane dla kompatybilności wstecznej) */
  reportedQuantity?: number; 
  /** NOWE: Ilość potwierdzona z systemu ERP (Tylko z importu Excel) */
  erpReportedQuantity?: number;
  /** NOWE: Ilość wyprodukowana i zaraportowana fizycznie na hali (tablety/wpis ręczny) */
  appReportedQuantity?: number;
  
  /** Aktualny status zlecenia */
  status: 'pending' | 'in-progress' | 'reported' | 'completed';
  /** Numer artykułu/indeks produktu */
  articleNumber?: string;
  /** Nazwa klienta docelowego */
  clientName?: string;
  /** Numer projektu powiązanego ze zleceniem */
  projectNumber?: string;
  /** Priorytet zlecenia */
  priority?: string;
  /** Jednostka miary (np. szt., mb) */
  unit?: string;
  /** Powierzchnia jednostkowa (wykorzystywana do rozliczania czasu w zespołach) */
  unitArea?: number;
  /** Przypisana kategoria asortymentowa */
  assortmentCategory?: string;
  /** Lista składowych elementów zlecenia */
  elements?: OrderElement[];
  /** Data utworzenia zlecenia (Timestamp Firestore) */
  createdAt: any;
  /** Data importu z pliku Excel */
  importedAt?: any;
  /** Data ostatniej modyfikacji danych */
  lastModifiedAt?: any;
  /** Nazwa użytkownika, który dokonał ostatniej zmiany */
  lastModifiedBy?: string;
}

/**
 * Rekord wykonanej pracy przez pracownika.
 * Przechowuje czas trwania, zaraportowaną ilość i powiązanie ze zleceniem.
 */
export interface WorkLog {
  /** Identyfikator dokumentu w Firestore */
  id: string;
  /** ID powiązanego zlecenia */
  orderId?: string;
  /** Numer powiązanego zlecenia (dla łatwiejszego wyświetlania) */
  orderNumber?: string;
  /** Nazwa produktu */
  productName?: string;
  /** Nazwa klienta */
  clientName?: string;
  /** ID pracownika wykonującego pracę */
  userId: string;
  /** Imię i nazwisko pracownika */
  userName: string;
  /** Czas rozpoczęcia pracy (Timestamp Firestore) */
  startTime: any;
  /** Czas zakończenia pracy (null jeśli praca trwa) */
  endTime: any;
  /** Czas trwania w sekundach */
  duration?: number;
  /** Czas trwania w godzinach */
  hours?: number;
  /** Ilość zaraportowana w tym konkretnym wpisie */
  quantityReported?: number;
  /** Ilość (alias dla quantityReported) */
  quantity?: number;
  /** Kategoria asortymentowa przypisana do tego wpisu */
  assortmentCategory?: string;
  /** ID konkretnego elementu zlecenia (jeśli wybrano) */
  elementId?: string;
  /** Nazwa konkretnego elementu zlecenia */
  elementName?: string;
  /** ID sesji zespołowej (jeśli dotyczy) */
  sessionId?: string;
  /** ID stanowiska pracy */
  stationId?: string;
  /** Nazwa stanowiska pracy */
  stationName?: string;
  /** ID stanowiska pracy (alias dla stationId) */
  workStationId?: string;
  /** Flaga oznaczająca wpis dodany ręcznie przez mistrza */
  manual?: boolean;
  /** Data utworzenia rekordu (dla wpisów ręcznych) */
  createdAt?: any;
}

/**
 * Definicja stanowiska pracy na hali produkcyjnej.
 * Pozwala na organizację pracy w grupach przypisanych do konkretnych miejsc.
 */
export interface WorkStation {
  /** Identyfikator dokumentu w Firestore */
  id: string;
  /** Nazwa stanowiska (np. "Spawalnia 1") */
  name: string;
  /** Kod stanowiska (np. "S1") */
  code?: string;
  /** Opcjonalny opis stanowiska */
  description?: string;
  /** Data utworzenia stanowiska */
  createdAt: any;
}

/**
 * Aktywna sesja pracy zespołowej na konkretnym stanowisku.
 * Grupuje pracowników pracujących wspólnie nad tymi samymi zleceniami.
 */
export interface WorkSession {
  /** Identyfikator dokumentu w Firestore */
  id: string;
  /** ID stanowiska, na którym odbywa się sesja */
  stationId: string;
  /** Nazwa stanowiska */
  stationName: string;
  /** ID lidera zespołu (osoba rozpoczynająca sesję) */
  leaderId: string;
  /** Imię i nazwisko lidera */
  leaderName: string;
  /** Czas rozpoczęcia sesji */
  startTime: any;
  /** Czas zakończenia sesji */
  endTime?: any;
  /** Status sesji */
  status: 'active' | 'completed';
  /** Lista identyfikatorów pracowników należących do zespołu */
  memberIds: string[];
}

/**
 * Model danych pracownika hali produkcyjnej.
 * Wykorzystywany do logowania kartą RFID i przypisywania pracy.
 */
export interface Employee {
  /** Identyfikator dokumentu w Firestore */
  id: string;
  /** Numer ewidencyjny pracownika */
  employeeNumber?: string;
  /** Imię pracownika */
  firstName: string;
  /** Nazwisko pracownika */
  lastName: string;
  /** Imię i nazwisko (alias) */
  name?: string;
  /** Grupa/brygada, do której należy pracownik */
  group?: string;
  /** Stanowisko/rola (np. "Spawacz") */
  position?: string;
  /** Pełna nazwa wyświetlana (Imię + Nazwisko) */
  displayName?: string;
  /** Unikalny kod karty RFID przypisanej do pracownika */
  rfidCard?: string;
  /** Unikalny kod karty RFID (alias) */
  rfidCardId?: string;
  /** Data dodania pracownika do systemu */
  createdAt?: any;
}

export type UserRole = 'admin' | 'worker' | 'operator' | 'magazynier';

/**
 * Profil użytkownika systemu (osoby logującej się przez Google).
 * Określa uprawnienia w aplikacji.
 */
export interface UserProfile {
  /** Unikalny identyfikator użytkownika (Firebase UID) */
  uid: string;
  /** Nazwa wyświetlana pobrana z konta Google */
  displayName: string;
  /** Adres e-mail użytkownika */
  email: string;
  /** Rola w systemie (admin - pełny dostęp, worker - podgląd, operator - terminal) */
  role: UserRole;
  /** Opcjonalne imię */
  firstName?: string;
  /** Opcjonalne nazwisko */
  lastName?: string;
  /** Opcjonalna grupa */
  group?: string;
  /** Opcjonalne stanowisko */
  position?: string;
  /** Data utworzenia profilu */
  createdAt?: any;
}

/**
 * Reprezentuje konflikt wykryty podczas importu danych z Excela.
 * Występuje, gdy zlecenie o danym numerze już istnieje, ale różni się danymi.
 */
export interface ImportConflict {
  /** Istniejące zlecenie w bazie danych */
  existingOrder: ProductionOrder;
  /** Nowe dane z pliku Excel */
  newOrderData: Omit<ProductionOrder, 'id' | 'createdAt'>;
  /** Lista różnic pomiędzy wersjami */
  diff: {
    /** Klucz pola, które się różni */
    field: string;
    /** Czytelna etykieta pola (np. "Ilość") */
    label: string;
    /** Wartość aktualnie zapisana w bazie */
    oldValue: any;
    /** Nowa wartość z pliku Excel */
    newValue: any;
  }[];
}

/**
 * Reprezentuje pojedynczy wpis w zbiorczym dodawaniu pracy.
 */
export interface BulkEntry {
  id: string;
  employeeId: string;
  orderId: string;
  date: string;
  startTime: string;
  endTime: string;
  quantity: number;
  category: string;
}

/**
 * Typy operacji wykonywanych na bazie Firestore.
 * Wykorzystywane do szczegółowego raportowania błędów.
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
 * Struktura błędu Firestore przesyłana do systemu diagnostycznego.
 * Zawiera kontekst operacji i informacje o uprawnieniach użytkownika.
 */
export interface FirestoreErrorInfo {
  /** Treść błędu */
  error: string;
  /** Typ operacji, która zawiodła */
  operationType: OperationType;
  /** Ścieżka do dokumentu/kolekcji */
  path: string | null;
  /** Informacje o stanie autoryzacji w momencie błędu */
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string;
    providerInfo: {
      providerId: string;
      displayName: string;
      email: string;
      photoUrl: string;
    }[];
  };
}

export type PurchaseOrderStatus = 'OPEN' | 'PARTIAL' | 'COMPLETED' | 'OVERDELIVERED';

export interface PurchaseOrderItem {
  id: string; // Wygenerowany klucz np. "PO-27821-110"
  
  // Identyfikacja
  purchaseOrderNumber: string; // "Proces-nr"
  positionNumber: string; // "Poz.-nr"
  supplierName: string; // "Nazwa" (Dostawca)
  warehouse: string; // "Magazyn" (np. MRB)
  
  // Asortyment
  articleNumber: string; // "Artykuł-nr"
  articleName: string; // "Nazwa" (Artykułu)
  projectNumber: string; // "Projekt-nr" lub "ZP-nr"
  
  // Ilości
  quantityOrdered: number; // "Ilość"
  quantityDelivered: number; // "Dostarczone"
  quantityRemaining: number; // Obliczone: Ilość - Dostarczone
  unit: string; // "JM"
  
  // Finanse (Dla wyceny WIP i Magazynu)
  unitPrice?: number;
  wmsTotalValue?: number; // Wartość fizycznie przyjętego towaru
  currency?: string; // "Waluta" (np. PLN)
  
  // Daty
  orderDate: string; // "Założono"
  expectedDeliveryDate: string; // "Data dostawy"
  
  status: PurchaseOrderStatus;
  importedAt: any; // Timestamp
  rozliczone?: number;
}

// --- MAGAZYN WMS ---
export interface InventoryArticle {
  id?: string;
  articleNumber: string;
  articleName: string;
  unit?: string;
  category?: string;
}

export type BatchStatus = 'AVAILABLE' | 'IN_PRODUCTION' | 'CONSUMED';

export interface InventoryBatch {
  id?: string; // Będzie nadane przez Firebase
  
  // Dane z Tabeli Dostaw (dla BarTendera)
  supplier: string; // Dostawca
  deliveryDate: string; // Data dostawy (YYYY-MM-DD)
  batchNumber: string; // Nr wsadu (np. 26RU001)
  articleNumber: string; // Indeks ERP (Dla farb może być pusty)
  orderNumber: string; // Nr zamówienia (ERP)
  articleName: string; // Nazwa asortymentu (Dla farb = Kolor RAL)
  grade: string; // Gatunek/ LOT / Nr partii
  coefficient: string; // Współczynnik
  dimensions: string; // Wymiar/ Długość
  quantityString: string; // Pełny tekst np. "1080 mb"
  
  // Zdekodowana ilość do obliczeń
  numericQuantity: number; 
  unit?: string; // e.g. "kg", "mb"
  
  // Kontrola Jakości
  labelsCount: number; // liczba etykiet
  qcCard: boolean; // Karta kontroli (x)
  certificate: boolean; // ATESTY (x)
  notes: string; // UWAGI
  
  // Relacje
  sourcePurchaseOrderId?: string; // Po połączeniu z Zakupy-info!
  status: BatchStatus;
  
  // Metadane
  createdAt?: any;
  createdBy?: string;

  // Finanse
  unitPrice?: number;
  totalValue?: number; // Wartość tego konkretnego wsadu

  initialQuantity?: number;   // Ile oryginalnie przyszło z dostawy
  withdrawnQuantity?: number; // Ile łącznie pobrano na halę

  draftQuantity?: number | null; // Zliczona wartość czekająca na zatwierdzenie (Deprecated)
  draftUpdatedAt?: any;
  draftUpdatedBy?: string;

  // Inwentaryzacja
  lastInventoriedAt?: any;
  lastInventoriedBy?: string;
}

export interface InventoryCount {
  id?: string;
  batchId: string;
  quantity: number;
  calculatorDetails: string; // np "9x37" lub "1x400"
  createdAt?: any;
  createdBy: string;
  archived?: boolean; // True po zatwierdzeniu
}

// Typ pomocniczy dla naszego Modułu Kojarzenia
export interface BatchMatchResult {
  batch: InventoryBatch;
  matchedPurchaseOrder?: any; // Tutaj trafi znalezione zamówienie z Zakupy-info
  matchStatus: 'MATCHED' | 'UNMATCHED' | 'DUPLICATE';
}

export interface MaterialWithdrawal {
  id?: string;
  withdrawalDate: string; // YYYY-MM-DD
  workerName: string; // Osoba/konto raportujące pobranie z magazynu
  articleNumber: string; // np. SZR00035
  articleName: string; // Tuleja dystansowa...
  batchNumber: string; // np. 26RU042
  quantityWithdrawn: number; // Ilość (w jednostce wsadu np. mb, kg)
  returnedQuantity?: number;
  type: 'WITHDRAWAL' | 'RETURN'; // Zwykłe pobranie (MM-) lub zwrot na plac (MM+)
  originalWithdrawalId?: string; // Powiązanie ze zwrotem
  sourcePurchaseOrderId?: string; // Do rozbicia kosztów w ERP 
  createdAt?: any;
  createdBy?: string;
}

export interface InventoryAdjustment {
  id?: string;
  date: string;           
  batchId: string;        
  batchNumber: string;    
  articleNumber: string;  
  articleName: string;    
  oldQuantity: number;    
  newQuantity: number;    
  difference: number;     
  approvedBy: string;     // Kierownik / Menedżer
  countedBy?: string;     // <--- DODAJ TO: Pracownik, który fizycznie zliczył
  createdAt: any;
  draftQuantity?: number | null;
  draftUpdatedAt?: any;
  draftUpdatedBy?: string;
}


