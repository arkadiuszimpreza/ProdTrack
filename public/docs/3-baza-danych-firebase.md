# Struktura Bazy Danych i Bezpieczeństwo (Firestore)

Aplikacja ProdSSS Erplast wykorzystuje Google Cloud Firestore jako główną, nierelacyjną bazę danych w czasie rzeczywistym. Architektura danych została zoptymalizowana pod kątem szybkich odczytów na terminalach produkcyjnych oraz transakcyjnych zapisów (Batch Writes) gwarantujących spójność.

## 1. Model Danych (Kolekcje)

System opiera się na 6 głównych kolekcjach (Root Collections):

### `users` (Konta Systemowe)
Przechowuje profile użytkowników uwierzytelnionych przez Google Auth.
* **Identyfikator:** `uid` (zgodny z Google Auth)
* **Kluczowe pola:** `email`, `displayName`, `role` (`admin` | `worker` | `operator`)
* **Zastosowanie:** Definiuje poziom uprawnień w systemie i determinuje routing po zalogowaniu.

### `employees` (Pracownicy Fizyczni)
Baza kard wyciągnięta z systemu nadrzędnego (ERP/Excel).
* **Identyfikator:** Auto-generowany przez Firestore.
* **Kluczowe pola:** `firstName`, `lastName`, `rfidCard` (hash lub ciąg znaków przypisany do fizycznej karty).
* **Zastosowanie:** Służy do autoryzacji operatorów na stanowiskach oraz przypisywania ich do logów pracy.

### `orders` (Zlecenia Produkcyjne)
Główny rejestr zadań do wykonania na hali.
* **Kluczowe pola:** `orderNumber`, `targetQuantity`, `erpReportedQuantity`, `appReportedQuantity`, `status`, `assortmentCategory`.
* **Podstruktura:** Tablica obiektów `elements` (poszczególne części zlecenia wraz z parametrem `weight` do wyliczania udziału).
* **Mechanika:** Dokument ten jest stale nadpisywany podczas synchronizacji (import z Excela) oraz w momencie zamykania zadań przez pracowników na hali.

### `workStations` (Gniazda Produkcyjne)
Słownik stanowisk pracy (np. "Spawalnia 1", "Szlifiernia").
* **Kluczowe pola:** `name`, `description`.

### `workSessions` (Aktywne Sesje Zespołowe)
Tymczasowe dokumenty śledzące trwającą pracę grupową.
* **Kluczowe pola:** `leaderId`, `stationId`, `memberIds` (tablica ID pracowników).
* **Mechanika:** Dokument żyje głównie w statusie `active`. Aktualizacja tablicy `memberIds` następuje przy dołączaniu/odłączaniu się członków. Zamknięcie przez lidera zmienia status na `completed`.

### `workLogs` (Rejestr Pracy)
Najważniejsza kolekcja historyczna w systemie. Każdy dokument reprezentuje jeden meldunek z czasem.
* **Kluczowe pola:** `userId`, `orderId`, `startTime`, `endTime`, `duration` (w sekundach), `quantityReported`.
* **Mechanika:** Brak `endTime` oznacza, że log jest aktualnie "w toku" i wyświetla się na ekranie operatora w komponencie `<ActiveTimer />`. Oznaczenie `manual: true` wskazuje na wpisy historyczne dopisywane przez administrację.

---

## 2. Reguły Bezpieczeństwa (Firebase Security Rules)

Bezpieczeństwo danych opiera się na weryfikacji roli użytkownika (Role-Based Access Control) na poziomie samej bazy, co zapobiega modyfikacjom z zewnątrz (np. poprzez iniekcje API).

* **Reguła Nadrzędna:** Każde żądanie musi pochodzić od uwierzytelnionego użytkownika (`request.auth != null`).
* **Administratorzy (`admin`):** Użytkownicy z tą rolą w dokumencie `users` posiadają pełne prawa zapisu, odczytu i usuwania (`CRUD`) we wszystkich kolekcjach. Obejmuje to czyszczenie bazy i importy z Excela.
* **Pracownicy i Operatorzy (`worker` / `operator`):** Posiadają ograniczone uprawnienia:
  * Odczyt: `orders`, `workStations`, `employees` (wymagane do operowania aplikacją).
  * Zapis: Możliwość tworzenia i aktualizacji własnych `workLogs` oraz `workSessions`, bez możliwości ich twardego usuwania czy modyfikacji przypisania Zleceń (poza aktualizacją wskaźnika sztuk `appReportedQuantity` w ramach transakcji atomowej).

## 3. Integralność i Transakcyjność
Ze względu na specyfikę środowiska przemysłowego (potencjalne przerwy w łączności WiFi na hali), aplikacja **wymusza** korzystanie z metody `writeBatch` z pakietu `firebase/firestore` dla wszystkich operacji obejmujących więcej niż jeden dokument. Gwarantuje to spójność pomiędzy zapisanymi logami czasu pracy, a statusem zlecenia produkcyjnego.