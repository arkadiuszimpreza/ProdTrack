/**
 * Dane startowe słowników (Faza 0, krok 1a).
 *
 * To są WARTOŚCI POCZĄTKOWE — źródłem prawdy po wgraniu do Firestore jest kolekcja `dictionaries`,
 * edytowana przez admina (ekran administracyjny: krok 1b). Ten plik służy tylko do jednorazowego
 * „wczytania wartości startowych” i do testów spójności.
 *
 * Pochodzenie danych (12.10.2026, od Arkadiusza):
 *  - działy: własna lista właściciela (opisy bez zmian),
 *  - MPK: lista księgowa właściciela (kod + nazwa; 101 oznaczone „nie używać”),
 *  - magazyny: plik „Lager zmieniony magazyny” z ERP (46 kodów; podwójne spacje w nazwach usunięte),
 *  - statusy zleceń klienta: tabela właściciela; potwierdzone etapy tylko dla PM i PC,
 *  - statusy zleceń produkcyjnych (PSP): wartości występujące w eksporcie PSP-info.
 *
 * Grupowanie magazynów i etapów statusów (poza PM/PC) to PROPOZYCJA oparta o nazwy —
 * do sprawdzenia przez właściciela na ekranie edycji słowników.
 */
import type {
  CustomerOrderStatus,
  Department,
  DictionaryId,
  DictionaryItem,
  MpkCenter,
  PspStatus,
  Warehouse,
} from '../types/dictionaries';

export const DEPARTMENT_SEEDS: Department[] = [
  { id: 'znaki-aktywne', name: 'Znaki aktywne', description: 'Wszystkie znaki podświetlane, pylony, słupy, lampy', active: true, sortOrder: 10, mpkCodes: [] },
  { id: 'cnc', name: 'CNC', description: 'Cięcie płyt warstwowych, elementy do znaków aktywnych', active: true, sortOrder: 20, mpkCodes: [] },
  { id: 'laser', name: 'Laser', description: 'Cięcie podkładów pod znaki, tablic i blach', active: true, sortOrder: 30, mpkCodes: [] },
  { id: 'lakiernia', name: 'Lakiernia', description: 'Nietypowe elementy do malowania, słupki, wskaźniki', active: true, sortOrder: 40, mpkCodes: [] },
  {
    id: 'bariery-zn',
    name: 'Bariery ZN',
    description: 'Bariery malowane w lakierni; formalnie dział mechaniczny, ale zlecenia klasyfikujemy tu, gdy bariera ma później iść do lakierowania',
    note: 'Nie wszystko, co stalowe — część jest malowana partiami w dużym piecu',
    active: true,
    sortOrder: 50,
    mpkCodes: [],
  },
  {
    id: 'bariery-czn',
    name: 'Bariery CZN',
    description: 'Wszystkie bariery wymagające cynkowania ogniowego',
    note: 'Bariera malowana i cynkowana jest i w ZN, i w CZN',
    active: true,
    sortOrder: 60,
    mpkCodes: [],
  },
  { id: 'futryny', name: 'Futryny', description: 'Wąski asortyment, głównie dla dwóch klientów, zwykle lakierowane', active: true, sortOrder: 70, mpkCodes: [] },
  { id: 'spawalnia-konstrukcje', name: 'Spawalnia konstrukcje', description: 'Bramownice, wsporniki i konstrukcje płaskie wymagające spawania i cynkowania', active: true, sortOrder: 80, mpkCodes: [] },
  { id: 'spawalnia-inne', name: 'Spawalnia inne', description: 'Pozostałe elementy spawane', active: true, sortOrder: 90, mpkCodes: [] },
  { id: 'slupki-giete', name: 'Słupki gięte', description: 'Dział mechaniczny', active: true, sortOrder: 100, mpkCodes: [] },
  { id: 'slupki-proste', name: 'Słupki proste', description: '', active: true, sortOrder: 110, mpkCodes: [] },
  { id: 'wydzial-poligrafii', name: 'Wydział poligrafii', description: 'Wszystkie znaki, tablice i inne elementy do oklejania', active: true, sortOrder: 120, mpkCodes: [] },
];

export const MPK_SEEDS: MpkCenter[] = [
  { code: '101', name: 'WM-Obróbka mechaniczna', unit: 'WM', active: false, note: 'Nie używać' },
  { code: '102', name: 'WM-Lakiernia', unit: 'WM', active: true },
  { code: '103', name: 'WM-Barberan płyty warstwowe', unit: 'WM', active: true },
  { code: '104', name: 'WM-CNC niebieska', unit: 'WM', active: true },
  { code: '105', name: 'WM-Water JET', unit: 'WM', active: true },
  { code: '106', name: 'WM-Giętarka Macri rury', unit: 'WM', active: true },
  { code: '107', name: 'WM-Roboty spawalnicze', unit: 'WM', active: true },
  { code: '108', name: 'WM-Plazma', unit: 'WM', active: true },
  { code: '109', name: 'WM-Spawanie (konstrukcje)', unit: 'WM', active: true },
  { code: '110', name: 'WM-Wycinarka laserowa Kimla', unit: 'WM', active: true },
  { code: '111', name: 'WM-Osłony energochłonne TMA', unit: 'WM', active: true },
  { code: '112', name: 'WM-Przyczepki sygnalizacyjne', unit: 'WM', active: true },
  { code: '113', name: 'WM-Śrutownia', unit: 'WM', active: true },
  { code: '114', name: 'WM-Odtłuszczalnia', unit: 'WM', active: true },
  { code: '115', name: 'WM-prasy krawędziowe', unit: 'WM', active: true },
  { code: '116', name: 'WM-Podkłady obejmy', unit: 'WM', active: true },
  { code: '117', name: 'WM-Słupki', unit: 'WM', active: true },
  { code: '118', name: 'WM-laser do profili i rur', unit: 'WM', active: true },
  { code: '119', name: 'WM-Wycinarka laserowa YAWEI', unit: 'WM', active: true },
  { code: '120', name: 'WM-tablice warstwowe', unit: 'WM', active: true },
  { code: '121', name: 'WM-krojczy piły taśmowe', unit: 'WM', active: true },
  { code: '199', name: 'WM-Nadzór', unit: 'WM', active: true },
  { code: '201', name: 'WEP-Sitodruk', unit: 'WEP', active: true },
  { code: '202', name: 'WEP-Oklejalnia', unit: 'WEP', active: true },
  { code: '203', name: 'WEP-Druk', unit: 'WEP', active: true },
  { code: '204', name: 'WEP-Elektronicy', unit: 'WEP', active: true },
  { code: '299', name: 'WEP-Nadzór', unit: 'WEP', active: true },
  { code: '301', name: 'WLOG-Obsługa produkcji i magazynowania', unit: 'WLOG', active: true },
  { code: '302', name: 'WLOG-Zaopatrzenie', unit: 'WLOG', active: true },
  { code: '303', name: 'WLOG-Kierowcy', unit: 'WLOG', active: true },
  { code: '304', name: 'WLOG-Wysyłka', unit: 'WLOG', active: true },
  { code: '305', name: 'WLOG-WD na rzecz produkcji', unit: 'WLOG', active: true },
  { code: '601', name: 'WTI-Utrzymanie ruchu', unit: 'WTI', active: true },
  { code: '602', name: 'WTI-Utrzymanie czystości', unit: 'WTI', active: true },
  { code: '603', name: 'WTI-Ochrona', unit: 'WTI', active: true },
  { code: '604', name: 'WTI-sprężarkownia', unit: 'WTI', active: true },
  { code: '605', name: 'WTI-Budowlanka', unit: 'WTI', active: true },
  { code: '699', name: 'WTI-nadzór', unit: 'WTI', active: true },
  { code: '801', name: 'Prac.zewn.-Osadzenie', unit: 'Prac.zewn.', active: true },
  { code: '802', name: 'Prac.zewn.-Ukraińcy', unit: 'Prac.zewn.', active: true },
];

export const WAREHOUSE_SEEDS: Warehouse[] = [
  { code: 'BGM', name: 'Magazyn artykułów bez gospodarki materiałowej', groups: ['pozostale'], inWms: false, active: true },
  { code: 'BHP', name: 'BHP', groups: ['pozostale'], inWms: false, active: true },
  { code: 'KJW', name: 'KJ zakupowa', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MAA', name: 'Magazyn akcesoriów oznakowania aktywnego', groups: ['surowce'], inWms: false, active: true },
  { code: 'MCZ', name: 'Magazyn części zamiennych', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MDF', name: 'Magazyn depozytowy wyrobów Feniks', groups: ['depozyty'], inWms: false, active: true },
  { code: 'MDR', name: 'Magazyn depozytowy zwrotów i reklamacji', groups: ['depozyty'], inWms: false, active: true },
  { code: 'MDS', name: 'Magazyn depozytowy wyrobów Smart Plac', groups: ['depozyty'], inWms: false, active: true },
  { code: 'MDT', name: 'Magazyn depozytowy wyrobów TM-VIA', groups: ['depozyty'], inWms: false, active: true },
  { code: 'MDU', name: 'Magazyn depozytowy wyrobów Unistop', groups: ['depozyty'], inWms: false, active: true },
  { code: 'MDW', name: 'Magazyn depozytowy wyrobów Wimet', groups: ['depozyty'], inWms: false, active: true },
  { code: 'MMW', name: 'Magazyn materiałowy WTI', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MNA', name: 'Magazyn Najmu', groups: ['wyroby'], inWms: false, active: true },
  { code: 'MO1', name: 'Magazyn odpadow', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MOP', name: 'Magazyn opakowań', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MOZ', name: 'Magazyn opakowań zwrotnych', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MPR', name: 'Magazyn - przyczepki', groups: ['wyroby'], inWms: false, active: true },
  { code: 'MRB', name: 'Magazyn rur i blach zastaw na PKO Faktoring SA', groups: ['surowce'], inWms: true, active: true },
  { code: 'MSK', name: 'Magazyn składu konsygnacyjnego', groups: ['depozyty'], inWms: false, active: true },
  { code: 'MSN', name: 'Magazyn surowcowo-materiał narzędziowni', groups: ['surowce'], inWms: true, active: true },
  { code: 'MSP', name: 'Magazyn surowcowo-materiałowy poligrafii', groups: ['surowce'], inWms: false, active: true },
  { code: 'MST', name: 'Magazyn Srodków Trwałych powyzej 10 tys.', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MTG', name: 'Magazyn techniczno gospodarczy', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MTH', name: 'Magazyn towarów handlowych', groups: ['wyroby'], inWms: false, active: true },
  { code: 'MTMA', name: 'Magazyn - poduszki zderzeniowe TMA', groups: ['wyroby'], inWms: false, active: true },
  { code: 'MVMS', name: 'Magazyn znaków zmiennej treści VMS', groups: ['wyroby'], inWms: false, active: true },
  { code: 'MWD', name: 'Magazyn Wydziału Drogowego', groups: ['wyroby'], inWms: false, active: true },
  { code: 'MWN', name: 'Magazyn wypożyczalni narzędzi', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'MWP', name: 'Magazyn wyrobów gotowych i półproduktów', groups: ['wyroby'], inWms: false, active: true },
  { code: 'MZP', name: 'Magazyn zasobów przeszacowanych', groups: ['pozostale'], inWms: false, active: true },
  { code: 'MZW', name: 'Magazyn znaków wynajętych', groups: ['wyroby'], inWms: false, active: true },
  { code: 'NBH', name: 'Narzędzia BHP', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NBU', name: 'Narzędzia WTI budowlanka', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NCN', name: 'Narzędzia sekcji CNC', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NKJ', name: 'Narzędzia KJ', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NLA', name: 'Narzędzia sekcji lakiernia', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NMN', name: 'Narzędzia MN', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NNA', name: 'Narzędzia WTI narzędziownia', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NRA', name: 'Narzędzia sekcji ramkowania', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NWD', name: 'Narzędzia WD', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NWE', name: 'Narzędzia WE', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NWL', name: 'Narzędzia WLOG', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NWM', name: 'Narzędzia WM', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NWP', name: 'Narzędzia WP', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'NWS', name: 'Narzędzia warsztatu samochodowego', groups: ['narzedzia'], inWms: false, active: true },
  { code: 'WIP', name: 'Produkcja w toku (Work In Progress)', groups: ['produkcja-w-toku', 'surowce'], inWms: false, active: true },
];

/**
 * Statusy zleceń KLIENTA (kolumna `Stan_zlec` w dystrybucja-info).
 * Potwierdzone przez właściciela: PM i PC (przekazane do montażu / częściowo).
 * Pozostałe etapy to propozycja (`stageConfirmed: false`).
 */
export const CUSTOMER_ORDER_STATUS_SEEDS: CustomerOrderStatus[] = [
  { code: 'NW', name: 'Nowe', stage: 'przed-produkcja', stageConfirmed: false, active: true },
  { code: 'OH', name: 'Opracowane handlowo', stage: 'przed-produkcja', stageConfirmed: false, active: true },
  { code: 'OP', name: 'Opracowane', stage: 'przed-produkcja', stageConfirmed: false, active: true },
  { code: 'PT', name: 'Przygotowane technicznie przez WTW', stage: 'przed-produkcja', stageConfirmed: false, active: true, note: 'Nie występuje w eksporcie dystrybucja-info' },
  { code: 'PR', name: 'Przekazane do produkcji', stage: 'przekazane-do-produkcji', stageConfirmed: false, active: true },
  { code: 'PC', name: 'Przekazane częściowo do montażu', stage: 'przekazane-do-montazu', stageConfirmed: true, active: true },
  { code: 'PM', name: 'Przekazane do montażu', stage: 'przekazane-do-montazu', stageConfirmed: true, active: true },
  { code: 'GO', name: 'Wyprodukowane, sprawdzić pakowanie', stage: 'wyprodukowane', stageConfirmed: false, active: true },
  { code: 'GW', name: 'Gotowe do wysyłki', stage: 'wyprodukowane', stageConfirmed: false, active: true },
  { code: 'ZR', name: 'Zrealizowane', stage: 'zamkniete', stageConfirmed: false, active: true },
  { code: 'AN', name: 'Anulowane', stage: 'zamkniete', stageConfirmed: false, active: true },
  { code: 'WS', name: 'Wstrzymane tymczasowo', stage: 'poza-sciezka', stageConfirmed: false, active: true },
  { code: 'WW', name: 'Wynajem - wynajęte', stage: 'poza-sciezka', stageConfirmed: false, active: true },
  { code: 'WZ', name: 'Wynajem - zwrócone', stage: 'poza-sciezka', stageConfirmed: false, active: true },
];

/** Statusy zleceń PRODUKCYJNYCH w ERP (kolumna `Status` w PSP-info) — wartości z eksportu. */
export const PSP_STATUS_SEEDS: PspStatus[] = [
  { code: 'W opracowaniu', name: 'W opracowaniu', active: true },
  { code: 'Wprowadzony', name: 'Wprowadzony', active: true },
  { code: 'Wydrukowane', name: 'Wydrukowane', active: true },
  { code: 'Zamknięty', name: 'Zamknięty', active: true },
  { code: 'brak fak.ZO', name: 'brak fak.ZO', active: true },
];

/** Wszystkie dane startowe pod identyfikatorem dokumentu w kolekcji `dictionaries`. */
export const DICTIONARY_SEEDS: { [K in DictionaryId]: DictionaryItem<K>[] } = {
  departments: DEPARTMENT_SEEDS,
  warehouses: WAREHOUSE_SEEDS,
  customerOrderStatuses: CUSTOMER_ORDER_STATUS_SEEDS,
  pspStatuses: PSP_STATUS_SEEDS,
  mpk: MPK_SEEDS,
};
