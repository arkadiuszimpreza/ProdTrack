/**
 * Powiązanie stanowisk pracy z miejscami powstawania kosztów (MPK).
 *
 * Wiele stanowisk może mieć to samo MPK (relacja „wiele do jednego”), dlatego MPK to pole
 * w stanowisku, a nie odwrotnie. Dziś numer MPK bywa wpisany na początku nazwy stanowiska
 * (np. „102 Lakiernia”) — ta funkcja pozwala zaproponować powiązanie na tej podstawie.
 * To tylko PROPOZYCJA do zatwierdzenia przez administratora; niczego nie zapisuje.
 */

export interface MpkRef {
  code: string;
  name: string;
  active: boolean;
}

export interface StationRef {
  id: string;
  name: string;
  mpkCode?: string;
}

export interface MpkProposal {
  stationId: string;
  stationName: string;
  mpkCode: string;
  mpkName: string;
  /** Czy proponowane MPK jest w słowniku wyłączone (np. 101 „nie używać”) — administrator powinien to zauważyć. */
  mpkActive: boolean;
}

const LEADING_CODE_RE = /^\s*(\d{3})(?!\d)/;

/** Trzy cyfry z początku nazwy stanowiska albo null (np. „110 Laser kimla” → „110”, „Spawalnia 1” → null). */
export function leadingMpkCode(stationName: string): string | null {
  const match = LEADING_CODE_RE.exec(stationName);
  return match ? match[1] : null;
}

/**
 * Dla stanowisk BEZ przypisanego MPK szuka w słowniku MPK kodu z początku nazwy.
 * Stanowiska, które już mają MPK, są pomijane (nic nie nadpisujemy).
 * `unmatched` to stanowiska bez przypisania, dla których nie znaleziono pasującego MPK.
 */
export function proposeMpkForStations(
  stations: readonly StationRef[],
  mpk: readonly MpkRef[],
): { proposals: MpkProposal[]; unmatched: StationRef[] } {
  const byCode = new Map(mpk.map((m) => [m.code, m]));
  const proposals: MpkProposal[] = [];
  const unmatched: StationRef[] = [];

  for (const station of stations) {
    if (station.mpkCode) continue;
    const code = leadingMpkCode(station.name);
    const found = code ? byCode.get(code) : undefined;
    if (found) {
      proposals.push({
        stationId: station.id,
        stationName: station.name,
        mpkCode: found.code,
        mpkName: found.name,
        mpkActive: found.active,
      });
    } else {
      unmatched.push(station);
    }
  }
  return { proposals, unmatched };
}
