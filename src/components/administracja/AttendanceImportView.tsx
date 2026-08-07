import React, { useState } from 'react';
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { read, utils } from 'xlsx';
import { db } from '../../firebase';
import { collection, writeBatch, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { Employee, AttendanceRecord } from '../../types';

interface Props {
  employees: Employee[];
}

export function AttendanceImportView({ employees }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<{ processed: number, updated: number, skipped: number, errors: string[] } | null>(null);

  // Zmapowane nazwy miesięcy w polskim formacie używanym w arkuszach
  const MONTHS_MAP: { [key: string]: number } = {
    'Styczeń': 1, 'Luty': 2, 'Marzec': 3, 'Kwiecień': 4,
    'Maj': 5, 'Czerwiec': 6, 'Lipiec': 7, 'Sierpień': 8,
    'Wrzesień': 9, 'Październik': 10, 'Listopad': 11, 'Grudzień': 12
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setSummary(null);
    }
  };

  const processImport = async () => {
    if (!file) return;
    setIsImporting(true);
    setSummary(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      let newRecords: AttendanceRecord[] = [];
      let errors: string[] = [];
      let processedCount = 0;
      let skippedCount = 0;

      // Iterujemy po arkuszach.
      // Użytkownik wskazał: "Nie bierzemy pod uwagę pierwszego półrocza" (od Lipca w górę).
      for (const sheetName of workbook.SheetNames) {
        const monthNum = MONTHS_MAP[sheetName.trim()];
        if (!monthNum) continue; // Pomiń nieznane zakładki
        if (monthNum < 7) {
          console.log(`Pomijam zakładkę: ${sheetName} (miesiąc < 7)`);
          continue;
        }

        const sheet = workbook.Sheets[sheetName];
        // Oczekiwany format: nagłówki w wierszu 1 (Imię i nazwisko, Nr RCP, ..., 1..31)
        const jsonData = utils.sheet_to_json<any>(sheet, { header: 1 });
        if (jsonData.length < 2) continue;

        const headers = jsonData[0] as string[];
        const nrRcpIndex = headers.findIndex(h => typeof h === 'string' && h.trim().toLowerCase() === 'nr rcp');
        const daysStartIndex = headers.findIndex(h => typeof h === 'number' && h === 1 || (typeof h === 'string' && h.trim() === '1'));
        
        if (nrRcpIndex === -1 || daysStartIndex === -1) {
          errors.push(`Zakładka ${sheetName}: Nie znaleziono kolumny 'Nr RCP' lub dni miesiąca (1-31).`);
          continue;
        }

        const currentYear = new Date().getFullYear();

        // Wiersze od 1 w dół to dane
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          const rcpRaw = row[nrRcpIndex];
          if (rcpRaw === undefined || rcpRaw === null) continue;
          
          let rcpString = String(rcpRaw).trim();
          
          if (!rcpString) continue;
          // Zmiana , na . jeśli ktoś wpisał np "8,5" w RCP chociaż to dziwne.
          rcpString = rcpString.replace(',', '.');

          // Find employee
          const employee = employees.find(e => {
            const eRcp = (e.employeeNumber || '').trim().replace(',', '.');
            return eRcp === rcpString;
          });

          if (!employee) {
            skippedCount++;
            continue;
          }

          const daysData: { [day: number]: string | number } = {};
          let totalHours = 0;

          // Przeszukujemy kolumny dni (np 31 dni)
          for (let day = 1; day <= 31; day++) {
             // W tablicy nagłówków:
             const colIdx = headers.findIndex(h => (typeof h === 'number' && h === day) || (typeof h === 'string' && h.trim() === String(day)));
             if (colIdx !== -1) {
                let cellVal = row[colIdx];
                if (cellVal !== undefined && cellVal !== null && cellVal !== '') {
                  // Sprawdzamy czy to liczba
                  if (typeof cellVal === 'number') {
                    daysData[day] = cellVal;
                    totalHours += cellVal;
                  } else if (typeof cellVal === 'string') {
                    const trimmed = cellVal.trim();
                    // Może to być liczba z przecinkiem "8,5"
                    if (/^\d+,\d+$/.test(trimmed)) {
                      const num = parseFloat(trimmed.replace(',', '.'));
                      if (!isNaN(num)) {
                        daysData[day] = num;
                        totalHours += num;
                      } else {
                        daysData[day] = trimmed;
                      }
                    } else if (!isNaN(Number(trimmed))) {
                        const num = Number(trimmed);
                        daysData[day] = num;
                        totalHours += num;
                    } else {
                       daysData[day] = trimmed;
                    }
                  }
                }
             }
          }

          const recordId = `${employee.id}_${currentYear}_${monthNum}`;
          
          newRecords.push({
            id: recordId,
            userId: employee.id,
            employeeNumber: employee.employeeNumber || rcpString,
            year: currentYear,
            month: monthNum,
            days: daysData,
            totalHours,
            createdAt: serverTimestamp()
          });
          processedCount++;
        }
      }

      // Zapisujemy do Firebase batchami
      let updatedCount = 0;
      for (let i = 0; i < newRecords.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = newRecords.slice(i, i + 500);
        
        chunk.forEach(record => {
           const docRef = doc(db, 'attendance', record.id);
           batch.set(docRef, record, { merge: true }); // Używamy merge, żeby nadpisać/zaktualizować!
           updatedCount++;
        });
        await batch.commit();
      }

      setSummary({ processed: processedCount, updated: updatedCount, skipped: skippedCount, errors });
    } catch (e: any) {
      console.error(e);
      setSummary({ processed: 0, updated: 0, skipped: 0, errors: [e.message] });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100">
      <div className="flex items-center gap-4 mb-8 pb-8 border-b border-stone-100">
        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
          <Upload size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-stone-800 tracking-tight">Import Obecności z Excel</h2>
          <p className="text-stone-500 font-medium mt-1">
            Wgraj plik `.xlsx` zawierający zakładki o nazwach miesięcy (np. "Lipiec", "Sierpień"). Aplikacja pominie pierwsze półrocze.
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="text-stone-700 font-semibold mb-2 block">Wybierz plik .xlsx</span>
            <input 
              type="file" 
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="block w-full text-sm text-stone-500
                file:mr-4 file:py-3 file:px-6
                file:rounded-xl file:border-0
                file:text-sm file:font-bold
                file:bg-emerald-50 file:text-emerald-700
                hover:file:bg-emerald-100
                cursor-pointer transition-colors"
            />
          </label>

          <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
            <h4 className="font-bold text-stone-800 mb-2">Instrukcja importu:</h4>
            <ul className="list-disc pl-5 space-y-1 text-sm text-stone-600">
              <li>Plik musi zawierać zakładki z nazwami polskimi (np. Lipiec).</li>
              <li>Pierwszy wiersz w każdej zakładce to nagłówki.</li>
              <li>Musi istnieć kolumna nazwana dokładnie <strong>Nr RCP</strong>. Aplikacja łączy ten numer z polem "Nr Ewidencyjny" pracownika w bazie.</li>
              <li>Kolumny dni miesiąca to po prostu liczby <strong>1, 2, 3 ... 31</strong> w pierwszym wierszu.</li>
              <li>Wartości w komórkach mogą być liczbami (godziny) lub literami (U, CH, KR, w).</li>
              <li>Aplikacja automatycznie nadpisze i zaktualizuje poprzednie importy dla danego miesiąca, więc można importować ten sam miesiąc wielokrotnie w miarę aktualizowania pliku.</li>
            </ul>
          </div>

          <button
            onClick={processImport}
            disabled={!file || isImporting}
            className="px-8 py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4"
          >
            {isImporting ? 'Przetwarzanie...' : 'Importuj dane'}
            {!isImporting && <Upload size={20} />}
          </button>
        </div>

        {summary && (
          <div className={`mt-8 p-6 rounded-2xl border ${summary.errors.length > 0 && summary.updated === 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              {summary.errors.length > 0 && summary.updated === 0 ? (
                <><AlertTriangle className="text-red-600" /> Wystąpiły błędy</>
              ) : (
                <><CheckCircle2 className="text-emerald-600" /> Podsumowanie importu</>
              )}
            </h3>
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white p-4 rounded-xl border border-stone-100 text-center">
                <div className="text-2xl font-black text-stone-800">{summary.processed}</div>
                <div className="text-xs font-bold text-stone-500 uppercase tracking-wider">Znalezione rekordy</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-emerald-100 text-center">
                <div className="text-2xl font-black text-emerald-600">{summary.updated}</div>
                <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Zaktualizowane / Zapisane</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-stone-100 text-center">
                <div className="text-2xl font-black text-stone-400">{summary.skipped}</div>
                <div className="text-xs font-bold text-stone-500 uppercase tracking-wider">Pominięte (brak w bazie)</div>
              </div>
            </div>

            {summary.errors.length > 0 && (
              <div className="bg-white p-4 rounded-xl border border-red-100">
                <h4 className="font-bold text-red-800 mb-2 text-sm">Ostrzeżenia i błędy:</h4>
                <ul className="list-disc pl-5 space-y-1 text-sm text-red-600">
                  {summary.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
