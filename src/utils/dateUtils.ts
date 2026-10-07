/**
 * Zwraca datę w formacie YYYY-MM-DD liczoną w czasie LOKALNYM urządzenia,
 * a nie w UTC.
 *
 * Audyt (finding #8): `new Date().toISOString().split('T')[0]` liczy dzień
 * w UTC. W Polsce (UTC+1 zimą / UTC+2 latem) w godzinach ok. 00:00–01:59/02:59
 * czasu lokalnego taki zapis zwracał WCZORAJSZĄ datę UTC zamiast dzisiejszej
 * daty lokalnej — co psuło numerację dokumentów, nazwy plików eksportu oraz
 * dopasowywanie wpisów po dniu (np. korekt do partii magazynowych).
 *
 * Ten helper zastępuje ten wzorzec we wszystkich miejscach, które go używały,
 * żeby porównania dat między sobą pozostały spójne.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
