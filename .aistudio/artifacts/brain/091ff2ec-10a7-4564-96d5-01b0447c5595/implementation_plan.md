# Plan Paginacji i Pełnego Wyszukiwania Wsadu w Księdze Transakcji Magazynowych (WMS ERP)

Optymalizacja pobierania i wyszukiwania transakcji w komponencie `InventoryLedgerView.tsx` poprzez agregację `getCountFromServer`, paginację kursorem Firestore (`startAfter`), wskaźnik liczby pobranych rekordów względem bazy oraz bezpośrednie zapytanie o całą historię wskazanego wsadu.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Uzgodnione założenia architektoniczne i UX:**
> - **Agregacja `getCountFromServer`**: Liczba wszystkich kwitów w bazie pobierana jest jednorazowo przy starcie widoku bez pobierania dokumentów (bardzo niskie koszty odczytu Firestore).
> - **Inicjalne ładowanie**: Pobieramy najnowsze 1000 transakcji (`createdAt desc`) z zachowaniem wskaźnika kursora (ostatni pobrany `QueryDocumentSnapshot`).
> - **Paginacja (+500)**: Przycisk „Załaduj starsze transakcje (+500)” na dole tabeli dociąga kolejne 500 wpisów za pomocą `startAfter(lastVisibleDoc)` i dołącza je do listy.
> - **Wyszukiwanie wsadu w całej bazie**: Wpisanie numeru wsadu i naciśnięcie **Enter** lub kliknięcie ikony lupki przełącza tryb na zapytanie celowane w całą bazę (`where('batchNumber', '==', term)`), pobierając wszystkie ruchy tego wsadu od początku istnienia fabryki.
> - **Powrót do widoku ogólnego**: Wyczyszczenie wyszukiwarki lub kliknięcie przycisku „Wyczyść filtr” przywraca standardowy strumień najnowszych transakcji z paginacją.

---

## 1. Overview & Core Concept

- **Problem**: Obecnie `InventoryLedgerView.tsx` pobiera tylko pierwsze 1000 transakcji. Jeśli transakcje danego wsadu miały miejsce dawniej (np. kilka miesięcy temu), użytkownik nie widział ich w tabeli ani w wynikach filtrowania. Ponadto brakowało informacji, ile w ogóle kwitów znajduje się w bazie ERP.
- **Rozwiązanie**:
  1. Wyświetlanie licznika w kafelku: **Pobrano X z Y kwitów w bazie** (np. `1 000 / 14 820`).
  2. Paginacja przyciskiem `Załaduj starsze transakcje (+500)` doładowująca starsze wpisy bez resetowania bieżącego widoku.
  3. Tryb wyszukiwania wsadu: wykonanie bezpośredniego zapytania Firestore `where('batchNumber', '==', ...)` w celu pobrania 100% historii danego materiału (PZ, RW, PW, RWI, PWI, BO) bez ograniczenia 1000 wpisów ogólnych.

---

## 2. User Experience & Visual Design

### 2.1. Kafelki metryk i pasek informacyjny
- W kafelku **Liczba Kwitów** dodajemy przejrzysty wskaźnik:
  - Duża liczba: `Liczba przefiltrowanych / widocznych kwitów`
  - Podtytuł: `Pobrano: 1 000 | W całej bazie: 14 820 kwitów`
  - Gdy aktywny jest filtr wsadu: etykieta `Tryb wsadu: wszystkie ruchy z bazy dla [NR_WSADU]`.

### 2.2. Pasek wyszukiwania
- Pole wyszukiwania z obsługą zdarzenia `onKeyDown` (Enter) oraz klikalną ikoną lupy / przyciskiem „Szukaj wsadu w bazie”.
- Wyświetlanie przycisku „✕ Wyczyść” resetującego wyszukiwanie do domyślnych transakcji.

### 2.3. Stopka tabeli i paginacja
- Pod tabelą transakcji:
  - Przycisk: **„Załaduj starsze transakcje (+500)”** z indykatorem ładowania (spinner / tekst „Ładowanie starszych wpisów...”).
  - Licznik postępu: `Wyświetlono X z Y dostępnych wpisów`.
  - Gdy pobrano już wszystkie transakcje z bazy: komunikat `Załadowano wszystkie dostępne transakcje z bazy`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decyzja 1: `getCountFromServer` vs zliczanie w pamięci**
  - *Podejście*: Używamy natywnej funkcji `getCountFromServer(collection(db, 'inventoryTransactions'))`.
  - *Dlaczego*: Firestore pobiera metadane bez transferu dokumentów. Koszt: 1 odczyt na 1000 dokumentów (np. 15 odczytów dla 15 000 kwitów zamiast 15 000).
- **Decyzja 2: Zapytanie celowane dla wsadu zamiast ładowania wszystkiego do RAM**
  - *Podejście*: Zapytanie `where('batchNumber', '==', cleanTerm)` po zatwierdzeniu klawiszem Enter.
  - *Dlaczego*: Baza może mieć dziesiątki tysięcy kwitów. Pobieranie wszystkiego do pamięci przeglądarki zawiesiłoby tablet operatora. Zapytanie indeksowane po `batchNumber` pobiera tylko 3–15 kwitów powiązanych z tym wsadkiem w ułamku sekundy.
- **Decyzja 3: `startAfter` z kursorami obiektów Snapshot**
  - *Podejście*: Przechowujemy `lastDocSnapshot` w stanie komponentu.
  - *Dlaczego*: Paginacja oparta na kursorze (`startAfter`) jest odporna na przesunięcia czasowe i nie generuje kosztownych przesunięć typu `offset`.

---

## 4. Technical Architecture & Data Strategy

### 4.1. Schemat przepływu danych i zapytań Firestore

```
┌────────────────────────────────────────────────────────────────────────┐
│                        InventoryLedgerView                             │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Start:                                                              │
│    - getCountFromServer(inventoryTransactions) -> totalInDbCount      │
│    - getDocs / onSnapshot(limit(1000), orderBy('createdAt', 'desc'))   │
│      -> transactions, lastDocSnapshot                                  │
│                                                                        │
│ 2. Użytkownik klika "+500 starszych transakcji":                       │
│    - getDocs(orderBy('createdAt','desc'), startAfter(lastDoc),         │
│              limit(500))                                               │
│    - transactions = [...prev, ...newDocs]                              │
│    - update lastDocSnapshot                                            │
│                                                                        │
│ 3. Wyszukanie wsadu (Enter na inpucie lub ikona Szukaj):              │
│    - qBatch = query(inventoryTransactions,                             │
│                     where('batchNumber', '==', searchBatch))           │
│    - getDocs(qBatch) -> wyświetlenie 100% historii tego wsadu          │
│                                                                        │
│ 4. Wyczyszczenie wsadu:                                                │
│    - Przywrócenie pierwotnego bufora 1000 wpisów                       │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2. Zmiany w stanie komponentu (`InventoryLedgerView.tsx`)
1. `totalInDbCount: number | null` — całkowita liczba dokumentów w kolekcji `inventoryTransactions`.
2. `lastDoc: QueryDocumentSnapshot | null` — wskaźnik kursora do paginacji.
3. `hasMore: boolean` — flaga określająca, czy w bazie są jeszcze starsze transakcje.
4. `loadingMore: boolean` — indykator doładowywania kolejnych 500 wpisów.
5. `isBatchSearchMode: boolean` — flaga sygnalizująca, że tabela prezentuje wyniki zapytania celowanego po wsadzie.
6. `cachedMainTransactions: InventoryTransaction[]` — bufor transakcji ogólnych, aby po wyczyszczeniu wyszukiwania wsadu nie trzeba było ponownie pobierać 1000 kwitów.

### 4.3. Zgodność z Bezpieczeństwem i Standardami Fabrycznymi
- Wszystkie operacje to odczyty z kolekcji `inventoryTransactions`, dozwolone dla ról WMS i odczytu zgodnie z `firestore.rules`.
- Przyjazne dla tabletów i monitorów halowych: przycisk paginacji o wysokości min. 44px z wyraźnym stanem ładowania.
- Bezpieczna obsługa błędów Firestore z mapowaniem na komunikaty w języku polskim.
