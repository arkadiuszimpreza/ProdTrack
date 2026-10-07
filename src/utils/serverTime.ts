import { doc, updateDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';

/**
 * Pobiera autorytatywny czas serwera Firestore (nie zegar urządzenia).
 *
 * Audyt (finding #4): zakończenie pracy zapisywało `endTime` jako
 * `Timestamp.now()` — czas odczytany z zegara tabletu/telefonu operatora.
 * Jeśli zegar urządzenia jest źle ustawiony (nawet o kilka minut), czas
 * trwania pracy (`duration`) i godziny w raportach OEE/rozliczeniach są błędne,
 * a `startTime` (zapisywany przez `serverTimestamp()`) i `endTime` przestają
 * być ze sobą spójne.
 *
 * Firestore nie udostępnia samodzielnego zapytania "jaki jest teraz czas
 * serwera" — to standardowe obejście tego ograniczenia: zapisujemy sentinel
 * `serverTimestamp()` do pola, które użytkownik i tak ma prawo nadpisywać
 * (jego własny dokument `users/{uid}`), odczytujemy rozwiązaną wartość,
 * i używamy jej jako prawdziwego "teraz" do dalszych obliczeń (różnica
 * czasu, proporcjonalny podział ilości między członków zespołu itd.).
 *
 * Koszt: jeden dodatkowy zapis + odczyt (ok. 100–300ms na hali). W razie
 * błędu odczytu stosujemy awaryjnie zegar urządzenia, żeby operator mógł
 * dokończyć zgłoszenie — to rzadki przypadek brzegowy, nie powód do
 * blokowania pracy.
 */
export async function getServerTime(): Promise<Date> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) {
    return new Date();
  }

  try {
    const ref = doc(db, 'users', uid);
    await updateDoc(ref, { _serverTimeProbe: serverTimestamp() });
    const snap = await getDoc(ref);
    const ts = snap.data()?._serverTimeProbe as Timestamp | undefined;
    return ts ? ts.toDate() : new Date();
  } catch {
    // Awaryjnie: zegar urządzenia, żeby nie blokować zakończenia pracy.
    return new Date();
  }
}
