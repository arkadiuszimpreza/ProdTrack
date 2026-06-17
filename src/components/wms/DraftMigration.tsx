import React, { useState } from 'react';
import { collection, getDocs, doc, writeBatch, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { Database, Play, CheckCircle, RotateCcw, Bug } from 'lucide-react';

export function DraftMigration() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runMigration = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const snap = await getDocs(collection(db, 'inventoryBatches'));
      const firestoreBatch = writeBatch(db);
      let migratedCount = 0;

      snap.forEach(d => {
        const data = d.data();
        if (data.draftQuantity !== undefined && data.draftQuantity !== null) {
          const newCountRef = doc(collection(db, 'inventoryCounts'));
          firestoreBatch.set(newCountRef, {
            batchId: d.id,
            quantity: data.draftQuantity,
            calculatorDetails: 'Zmigrowano (łączne zliczenie)',
            createdBy: data.draftUpdatedBy || 'System',
            createdAt: data.draftUpdatedAt || serverTimestamp(),
            archived: false
          });
          migratedCount++;
        }
      });

      if (migratedCount > 0) {
        await firestoreBatch.commit();
        setResult(`Pomyślnie utworzono ${migratedCount} wpisów historycznych w kolekcji inventoryCounts.`);
      } else {
        setResult('Brak zliczeń do migracji (wszystkie draftQuantity są puste).');
      }
    } catch (error: any) {
      console.error(error);
      setResult(`Błąd: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runRestore = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const q = query(collection(db, 'inventoryCounts'), where('archived', '==', true));
      const snap = await getDocs(q);
      
      let restoredCount = 0;
      
      // Firestore batches have a 500 limit. We'll use chunks of 450.
      const batches = [];
      let currentBatch = writeBatch(db);
      let opCount = 0;

      snap.forEach(d => {
        if (opCount === 450) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          opCount = 0;
        }
        const ref = doc(db, 'inventoryCounts', d.id);
        currentBatch.update(ref, { archived: false });
        restoredCount++;
        opCount++;
      });
      
      if (opCount > 0) {
        batches.push(currentBatch);
      }

      if (restoredCount > 0) {
        for (const batch of batches) {
          await batch.commit();
        }
        setResult(`Przywrócono ${restoredCount} historycznych zliczeń (ustawiono archived: false wszystkie).`);
      } else {
        setResult('Brak zliczeń do przywrócenia.');
      }

    } catch (error: any) {
      console.error(error);
      setResult(`Błąd: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-sm border border-stone-100 space-y-4">
      <div className="flex items-center space-x-2 text-stone-800">
        <Database className="text-indigo-600" size={20} />
        <h3 className="font-black">Narzędzia Administracyjne</h3>
      </div>
      <div className="flex gap-4">
        <button 
          onClick={runMigration}
          disabled={isRunning}
          className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all text-sm shadow-md"
        >
          {isRunning ? <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" /> : <Play size={16} />}
          <span>{isRunning ? 'Przetwarzanie...' : 'Migruj Historyczne Zliczenia'}</span>
        </button>
        <button 
          onClick={runRestore}
          disabled={isRunning}
          className="flex items-center space-x-2 px-4 py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 disabled:opacity-50 transition-all text-sm shadow-md"
        >
          {isRunning ? <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" /> : <RotateCcw size={16} />}
          <span>{isRunning ? 'Przetwarzanie...' : 'Odzyskaj odcinki z inwentaryzacji'}</span>
        </button>
      </div>

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
