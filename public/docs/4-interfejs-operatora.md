# Interfejs Użytkownika i Panel Operatora (UI/UX)

Warstwa wizualna aplikacji ProdSSS Erplast została podzielona na dwa odrębne środowiska: panel administracyjno-biurowy (`MainDashboard`) oraz interfejs przemysłowy przystosowany do ekranów dotykowych na hali (`OperatorPanel`).

## 1. Panel Operatora (Środowisko Hali)

Komponent `<OperatorPanel />` to główny punkt styku pracownika fizycznego z systemem. Został zaprojektowany z myślą o maksymalnej prostocie i redukcji błędów poznawczych.

**Kluczowe mechanizmy bezpieczeństwa:**
* **Blokada "Szybkiego Palca" (`isProcessing`):** Podczas komunikacji z bazą Firebase (np. zamykanie zlecenia), główne przyciski akcji są natychmiastowo blokowane (disabled). Zapobiega to nakładaniu się transakcji przy powolnym połączeniu internetowym.
* **Automatyczne Wylogowanie (Auto-logout):** Ze względów bezpieczeństwa terminale produkcyjne nie utrzymują permanentnych sesji pracowników. Zaimplementowano licznik (`timeLeft` ustawiony na 30 sekund bezczynności), który resetuje się przy każdym dotknięciu ekranu. Po upływie czasu system automatycznie wylogowuje operatora, chroniąc przed przypisaniem pracy niewłaściwej osobie.

## 2. Autoryzacja Fizyczna (Czytniki RFID)

Aby usprawnić proces logowania bez konieczności wpisywania haseł umazanymi rękami, system wykorzystuje fizyczne identyfikatory.

* **Działanie `<RFIDLogin />`:** Ekran logowania wykorzystuje czytniki kart RFID działające w trybie emulatora klawiatury (Keyboard Wedge). 
* **Mechanika kodu:** Komponent utrzymuje ukryte pole tekstowe `<input>` z wymuszonym atrybutem `autoFocus`. Zbliżenie karty do czytnika powoduje wstrzyknięcie ciągu znaków i automatyczne zatwierdzenie (Enter), co system natychmiast weryfikuje z bazą `employees` w Firestore.

## 3. Komponenty Pomocnicze i Wizualne

Aplikacja wykorzystuje bibliotekę `motion/react` (Framer Motion) do płynnych przejść, co minimalizuje zjawisko "skaczącego interfejsu" podczas przeładowywania danych.

* **`<ActiveTimer />`:** Agreguje stan trwającego zlecenia. Wyświetla lokalnie odmierzany czas pracy, odciążając bazę danych z ciągłych zapytań o aktualny czas. Logika odliczania opiera się na interwale czasowym synchronizowanym z `startTime` z Firebase.
* **Karta Zlecenia (`OrderCard`):** Najważniejszy widżet informacyjny. Prezentuje podwójny, progresywny pasek postępu pokazujący dysonans pomiędzy sztukami faktycznie zaraportowanymi w aplikacji (`appReportedQuantity`), a sztukami rozliczonymi oficjalnie w systemie ERP.
* **Tolerancja na Błędy (`ErrorBoundary`):** W przypadku awarii renderowania (np. uszkodzony strukturalnie dokument w bazie), komponent ten "łapie" błąd JavaScript, parsuje standardowy format `FirestoreErrorInfo` i wyświetla operatorowi przyjazny komunikat wraz z przyciskiem do awaryjnego odświeżenia aplikacji.