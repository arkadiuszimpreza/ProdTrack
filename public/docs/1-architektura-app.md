# Architektura Głównego Orkiestratora (App.tsx)

Plik `App.tsx` stanowi centralny punkt wejścia (Entry Point) aplikacji ProdSSS Erplast. Działa jako orkiestrator, który zarządza globalnym stanem, autoryzacją użytkowników oraz deleguje zadania do odpowiednich podrzędnych widoków. 

Oto struktura logiczna aplikacji:

## 1. Zarządzanie Stanem (Custom Hooks)
Logika biznesowa została odseparowana od warstwy widoku w celu zapewnienia czystości kodu i łatwiejszego testowania:
* **`useProductionData` (Dyspozytor Danych):** Hook odpowiadający za pobieranie i nasłuchiwanie w czasie rzeczywistym (Realtime DB) danych z Firestore (zlecenia, pracownicy, aktywne sesje).
* **`useWorkManager` (Kierownik Zmiany):** Hook hermetyzujący operacje na czasie pracy (rozpoczęcie pracy, praca zespołowa, zakończenie zlecenia).
* **`useManualEntry`:** Hook obsługujący wprowadzanie ręcznych (historycznych) wpisów do systemu.

## 2. Przepływ Autoryzacji (Auth Flow)
System wykorzystuje autoryzację Firebase (Google Auth) połączoną z kontrolą dostępu na poziomie bazy danych (RBAC - Role Based Access Control).
1. Użytkownik loguje się kontem Google.
2. System sprawdza kolekcję `users` w Firestore pod kątem `uid`.
3. **Nowy użytkownik:** Jeśli nie istnieje, tworzony jest profil. Domyślną rolą jest `worker`. Wyjątkiem jest adres *arkadiusz.biesiada@erplast.pl*, który twardo otrzymuje uprawnienia `admin`.
4. **Rozpoznane role:** `admin` (pełen dostęp), `worker` (dostęp do panelu), `operator` (wymaga fizycznego logowania na hali).

## 3. Zarządzanie Bazą i Importem
W `App.tsx` zdefiniowano krytyczne funkcje administracyjne:
* `handleExcelImport` / `confirmImport`: Mechanizm masowego importu zleceń z plików Excel, posiadający system wykrywania konfliktów i transakcyjny zapis za pomocą `writeBatch`.
* `clearDatabase`: Funkcja administracyjna umożliwiająca czyszczenie bazy (realizowana w paczkach po 500 dokumentów ze względu na limity Firestore).
* CRUD dla pracowników i stanowisk roboczych.

## 4. Routing i System Widoków
Nawigacja w aplikacji opiera się na warunkowym renderowaniu (bez zewnętrznego routera), uzależnionym od stanu autoryzacji:
* `<Loading />` - ekran ładowania podczas sprawdzania stanu sesji.
* `<LoginScreen />` - ekran powitalny, wymuszający logowanie Google.
* `<RFIDLogin />` - jeśli użytkownik to `operator`, ale system nie zarejestrował jeszcze logowania z czytnika kart.
* `<OperatorPanel />` - właściwy interfejs dotykowy dla zalogowanego operatora.
* `<MainDashboard />` - główny panel analityczno-zarządczy dla `admin` i `worker`.