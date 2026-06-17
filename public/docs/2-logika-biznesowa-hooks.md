# Warstwa Logiki Biznesowej (Custom Hooks)

Aplikacja ProdSSS Erplast opiera się na wydzielonej warstwie logiki biznesowej, zrealizowanej za pomocą tzw. Custom Hooks w React. Zapewnia to separację operacji na danych od warstwy wizualnej (UI).

## 1. Dyspozytor Danych (`useProductionData.ts`)
Moduł odpowiedzialny za nasłuchiwanie w czasie rzeczywistym (Realtime Sync) na kolekcje Firestore (`orders`, `employees`, `workStations`, `workSessions`, `workLogs`). 

**Kluczowe mechanizmy:**
* **Rozwiązywanie Kontekstu Użytkownika:** Hook inteligentnie decyduje, czyje dane śledzić. Priorytet posiada `currentOperator` (pracownik odbijający fizycznie kartę RFID na stanowisku). Jeśli nikt nie jest odbity, system powraca do śledzenia globalnego użytkownika sesji (zalogowanego przez Google).
* **Bezpieczeństwo listowania:** Lista pracowników (`employees`) jest pobierana dla każdego zalogowanego urządzenia, eliminując błędy z nierozpoznanymi kartami RFID na terminalach bez pełnych uprawnień administracyjnych.

## 2. Kierownik Zmiany (`useWorkManager.ts`)
Główny silnik operacyjny aplikacji, zarządzający cyklem życia wpisów pracy (Start, Dołączenie, Stop).

**Zasady działania i transakcyjność:**
* **Twarda Blokada (`canStartNewWork`):** Zapobiega rozpoczęciu nowego zadania, jeśli w stanie aplikacji istnieje już "otwarty" log pracy.
* **Zarządzanie Zespołem (Team Work):** * Inicjacja tworzy obiekt `WorkSession` oraz sprzężony z nim `WorkLog` dla lidera.
  * Dołączanie aktualizuje tablicę `memberIds` w sesji oraz tworzy pusty log dla nowego pracownika.
* **Rozliczanie Zespołowe i Dystrybucja KPI:** Najbardziej złożona operacja w systemie. Gdy lider kończy pracę zespołu, system nie przypisuje całości wykonanej pracy jednemu pracownikowi. Zamiast tego dzieli zaraportowaną ilość proporcjonalnie do czasu, jaki dany pracownik spędził w zespole podczas tej sesji.
  
  Do wyliczenia indywidualnego przydziału sztuk stosowana jest funkcja proporcji:
  $$Q_{individual} = Q_{reported} \cdot \left( \frac{t_{member}}{t_{team\_total}} \right)$$

* **Wagi Elementów:** Jeśli raportowane zlecenie ma przypisane elementy składowe, system dodatkowo przelicza udziały wagowe przed dodaniem ich do całościowego progresu zlecenia (`appReportedQuantity`):
  $$Q_{weighted} = Q_{reported} \cdot \left( \frac{w_{element}}{w_{total}} \right)$$

## 3. Moduł Wpisów Ręcznych (`useManualEntry.tsx`)
Obsługuje wprowadzanie historycznych logów pracy (np. przez administrację wpisującą dane z kart papierowych).

**Optymalizacja Batch Write (Etapowa):**
Zamiast wysyłać zapytanie do bazy przy każdym dodawanym logu, hook optymalizuje zapytania w dwóch etapach:
1. **Agregacja wpisów:** Iteruje po dodawanych wpisach pracowniczych, budując w pamięci lokalnej słownik aktualizacji dla poszczególnych zleceń (`orderUpdates`). Wychwytuje też nadpisania kategorii asortymentowych.
2. **Masowa Aktualizacja:** Następnie zbiorczo aktualizuje parametry `appReportedQuantity` oraz `status` (wyliczany funkcją `calculateOrderStatus`) w kolekcji `orders`.
Oszczędza to drastycznie ilość zapytań (odczytów/zapisów) wysyłanych do Firebase, zmniejszając koszty utrzymania infrastruktury i ryzyko kolizji danych.