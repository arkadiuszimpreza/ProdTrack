# Komponenty Interfejsu i Warstwa Prezentacji (UI)

Aplikacja ProdSSS Erplast posiada dwuwarstwową architekturę interfejsu, oddzielającą złożoną logikę biznesową widoków od reużywalnych elementów graficznych. System został zoptymalizowany pod kątem dwóch skrajnie różnych środowisk pracy: stabilnego biura (Admin/Worker) oraz dynamicznej, często zapylonej hali produkcyjnej (Operator).

## 1. Wstęp: Podział Architektury UI

Struktura komponentów w projekcie opiera się na dwóch folderach:
* **`src/components/`**: Zawiera złożone moduły funkcjonalne, widoki pełnoekranowe oraz modale zarządzające stanem aplikacji. Komponenty te bezpośrednio komunikują się z hookami i bazą danych.
* **`src/components/ui/`**: Zawiera atomowe, reużywalne elementy interfejsu (np. `StatusBadge`, `SearchableSelect`). Są to komponenty bezstanowe (stateless), dbające o spójność wizualną systemu.

---

## 2. Główne Widoki (Views & Panels)

### `MainDashboard` (Centrum Dowodzenia)
Główny panel dla kadry zarządzającej i pracowników biurowych.
* **Logika:** Agreguje wyszukiwarkę, filtry statusów oraz nawigację pomiędzy modułami (Zlecenia, Historia, Pracownicy).
* **Funkcje Krytyczne:** Obsługuje procesy masowe, takie jak import zlecenia z Excela (wyzwalanie `onExcelImport`) oraz globalne czyszczenie bazy danych z zabezpieczeniem modalnym.

### `OperatorPanel` (Terminal Produkcyjny)
Interfejs dotykowy przystosowany do pracy na hali.
* **Logika:** Uproszczony przepływ pracy podzielony na trzy tryby: Indywidualny, Rozpoczęcie Zespołu, Dołączenie do Zespołu.
* **Optymalizacja Hali:** Zaimplementowano duże touch-targety (min. 44px) oraz mechanizm **"Szybkiego Palca"** (`isProcessing`), który blokuje interfejs po kliknięciu przycisku start/stop, zapobiegając wielokrotnym zapisom do bazy przy opóźnieniach sieci.

### `HistoryView` & `ReportsView` (Analityka)
* **HistoryView:** Przeglądarka wszystkich archiwalnych logów pracy z zaawansowanym sortowaniem po dacie i czasie trwania. Umożliwia administratorom korektę wpisów (ilości, kategorii, czasu).
* **ReportsView:** Generator raportów KPI z możliwością eksportu do plików XLSX. Obsługuje agregację danych wg grup pracowniczych, tygodni oraz kategorii asortymentowych.

---

## 3. Formularze i Modale

### `ElementSelectionModal`
Wyskakujące okno wyboru konkretnego elementu składowego zlecenia (np. konkretna noga stołu zamiast całego stołu).
* **Zapobieganie błędom:** Jeśli zlecenie posiada zdefiniowane elementy wagowe, system wymusza otwarcie tego modala przed rozpoczęciem pracy, aby zapewnić poprawność wyliczeń KPI.

### `ImportResolutionModal`
Inteligentny system rozwiązywania konfliktów podczas importu z Excela.
* **Logika:** Porównuje dane istniejące w bazie z nowym plikiem. Wyświetla różnice (Diff) i pozwala użytkownikowi zdecydować, które zlecenia mają zostać nadpisane, a które pominięte.

### `ManualEntryForm` (Wersje 1 i 2)
Moduł wprowadzania danych historycznych.
* **Wersja 1:** Klasyczny formularz dla pojedynczego pracownika.
* **Wersja 2 (Bulk):** Optymalizacja dla administracji wpisującej dane zbiorczo z kart papierowych – pozwala na szybkie dodawanie wielu rekordów w jednej transakcji.

---

## 4. Komponenty Reużywalne i UI

### `ActiveTimer` (Serce Procesu)
Wyświetla trwającą sesję pracy.
* **Bezpieczeństwo:** Posiada wbudowaną "Bramkę Bezpieczeństwa", która blokuje timer, jeśli system wykryje utratę kontekstu operatora (np. błąd sesji session-auth).
* **Lider vs Członek:** Dynamicznie zmienia zestaw przycisków w zależności od tego, czy pracownik jest liderem sesji zespołowej (możliwość rozliczenia wielu zleceń na raz).

### `OrderCard` (Wizualizacja Postępu)
Karta zlecenia z unikalnym systemem podwójnego postępu.
* **APP Progress (Zielony):** Sztuki zaraportowane fizycznie w systemie ProdSSS.
* **ERP Progress (Ciemny):** Sztuki oficjalnie zatwierdzone w zewnętrznym systemie ERP.
* **Cel:** Natychmiastowa identyfikacja rozbieżności między produkcją a księgowością.

### `RFIDLogin` (Autoryzacja Fizyczna)
Komponent zarządzający logowaniem poprzez czytniki kart.
* **Technika:** Wykorzystuje ukryty autofokusowany input do przechwytywania strumienia danych z emulatora klawiatury.
* **Walidacja:** Oczyszcza kody (trimming) i automatycznie wyzwala proces logowania po osiągnięciu 10 znaków lub znaku Enter.

### `ErrorBoundary` (Bezpieczeństwo Wykonania)
Komponent najwyższego poziomu, który "łapie" błędy krytyczne JavaScript.
* **Zastosowanie:** Specjalizuje się w wykrywaniu błędów połączenia `Firestore Error`. Zamiast "białego ekranu", wyświetla operatorowi jasny komunikat o problemie z internetem lub uprawnieniami wraz z kodem błędu do przekazania serwisowi.
