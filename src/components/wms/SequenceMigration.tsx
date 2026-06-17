import React, { useState } from 'react';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Settings, Play, CheckCircle } from 'lucide-react';

export function SequenceMigration() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runMigration = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const snap = await getDocs(collection(db, 'inventoryBatches'));
      const maxValues: Record<string, number> = {};

      snap.forEach(d => {
        const bn = String(d.data().batchNumber || '').trim().toUpperCase();
        
        // Szukamy prefiksów rocznych np. 26BL, 26RU, 26IN, 25FA. 
        // Omija stringi nierozycynające się od NN[XX] (np. BLINW, INWINW itp.).
        const matchPrefix = bn.match(/^(\d{2}[A-Z]{2,3})/);
        if (matchPrefix) {
          const prefix = matchPrefix[1];
          // Szukamy samej liczbowej koncówki na końcu ciągu (maksymalnie 3 cyfry)
          const matchNum = bn.match(/(\d{1,3})$/);
          if (matchNum) {
            const num = parseInt(matchNum[1], 10);
            if (!maxValues[prefix] || num > maxValues[prefix]) {
              maxValues[prefix] = num;
            }
          }
        }
      });

      // Zapisujemy wyliczone rekordy do bazy
      const counterRef = doc(db, 'system_configs', 'wms_sequences');
      // Dla bezpieczeństwa merge: true, by nie nadpisać innych rzeczy w dokumencie
      await setDoc(counterRef, maxValues, { merge: true });

      console.log('Zmigrowano wartości:', maxValues);
      setResult(`Pomyślnie zmigrowano: \n${JSON.stringify(maxValues, null, 2)}`);
    } catch (error: any) {
      console.error(error);
      setResult(`Błąd: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-sm border border-stone-100 mt-4 space-y-4">
      <div className="flex items-center space-x-2 text-stone-800">
        <Settings className="text-indigo-600" size={20} />
        <h3 className="font-black">Narzędzie Migracji Liczników WMS</h3>
      </div>
      <p className="text-sm text-stone-500">
        Ten skrypt jednorazowo skanuje całą kolekcję <code>inventoryBatches</code>, wyszukuje najwyższe numery dla każdego z prefiksów (np. <i>26BL, 26RU, 26PL</i> itp.), ignorując wsady inwentaryzacyjne (z prefiksem BLINW, INWINW itp.), a następnie inicjalizuje scentralizowane liczniki w <code>system_configs/wms_sequences</code>.
      </p>
      <button 
        onClick={runMigration}
        disabled={isRunning}
        className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all text-sm shadow-md"
      >
        {isRunning ? <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" /> : <Play size={16} />}
        <span>{isRunning ? 'Przetwarzanie...' : 'Uruchom Skanowanie i Zapisz Liczniki'}</span>
      </button>

      {result && (
        <div className="mt-4 p-4 bg-stone-50 rounded-lg border border-stone-200">
          <div className="flex items-center space-x-2 text-emerald-600 mb-2 font-bold">
            <CheckCircle size={16} />
            <span>Wynik operacji</span>
          </div>
          <pre className="text-xs text-stone-600 font-mono whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </div>
  );
}
