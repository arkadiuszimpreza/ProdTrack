import React, { useState } from 'react';
import { collection, getDocs, doc, runTransaction, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { InventoryBatch } from '../../types';
import { getSequenceCounter, buildTransactionData } from '../../utils/wmsTransactionService';
import { Layers, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  currentUser: string;
}

export function InventoryBOInitializationModal({ onClose, onSuccess, currentUser }: Props) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [completedCount, setCompletedCount] = useState(0);

  const handleRunBOInitialization = async () => {
    if (!window.confirm("CZY NA PEWNO CHCESZ WYGENEROWAĆ BILANS OTWARCIA (BO)?\n\nDotychczasowe stany wsadów zostaną zamrożone i przekształcone w oficjalne kwity BO (Przychód Otwarcia). Nowe operacje będą ściśle rozliczane w reżimie transakcyjnym.")) {
      return;
    }

    setIsInitializing(true);
    setProgressMessage('Pobieranie wsadów z bazy danych...');

    try {
      // Pobieramy wszystkie wsady z niezerowym stanem
      const batchesSnap = await getDocs(collection(db, 'inventoryBatches'));
      const activeBatches = batchesSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as InventoryBatch))
        .filter(b => (b.numericQuantity || 0) > 0);

      if (activeBatches.length === 0) {
        alert("Brak wsadów ze stanem większym niż 0. Bilans Otwarcia nie wymaga akcji.");
        setIsInitializing(false);
        onClose();
        return;
      }

      // Sprawdzamy czy nie zostały już wygenerowane kwity BO (zabezpieczenie przed podwójnym uruchomieniem)
      const existingBoQ = query(collection(db, 'inventoryTransactions'), where('type', '==', 'BO'));
      const existingBoSnap = await getDocs(existingBoQ);
      if (!existingBoSnap.empty) {
        const proceed = window.confirm(`UWAGA: Wykryto już ${existingBoSnap.size} istniejących kwitów BO w systemie. Czy mimo to wygenerować brakujące kwity BO dla nowszych wsadów?`);
        if (!proceed) {
          setIsInitializing(false);
          return;
        }
      }

      setProgressMessage(`Generowanie kwitów BO dla ${activeBatches.length} wsadów...`);

      const CHUNK_SIZE = 50; // Rozmiar dla bezpiecznych transakcji Firestore
      let processed = 0;

      for (let i = 0; i < activeBatches.length; i += CHUNK_SIZE) {
        const chunk = activeBatches.slice(i, i + CHUNK_SIZE);

        await runTransaction(db, async (transaction) => {
          // 1. FAZA ODCZYTU: Licznik sekwencji
          const seqCounter = await getSequenceCounter(db, transaction);

          // 2. FAZA ZAPISU: Generowanie kwitów BO
          for (let j = 0; j < chunk.length; j++) {
            const b = chunk[j];
            const qty = b.numericQuantity || 0;
            const unitLabel = b.quantityString?.split(' ')[1] || b.unit || 'szt';
            const txNumber = seqCounter.getNextNumber('BO');

            const txRef = doc(collection(db, 'inventoryTransactions'));
            const txData = buildTransactionData({
              type: 'BO',
              batchId: b.id as string,
              batchNumber: b.batchNumber,
              articleNumber: b.articleNumber || '',
              articleName: b.articleName || '',
              quantity: qty,
              unit: unitLabel,
              previousBatchQuantity: 0,
              workerName: currentUser,
              createdBy: currentUser,
              notes: 'Inicjalizacja Bilansem Otwarcia (Plan B)'
            }, txNumber);

            transaction.set(txRef, txData);

            const batchRef = doc(db, 'inventoryBatches', b.id as string);
            transaction.update(batchRef, {
              lastTransactionId: txRef.id,
              lastTransactionAt: serverTimestamp()
            });
          }

          seqCounter.commit(transaction);
        });

        processed += chunk.length;
        setCompletedCount(processed);
        setProgressMessage(`Przetworzono ${processed} z ${activeBatches.length} wsadów...`);
      }

      alert(`Pomyślnie wygenerowano ${processed} kwitów Bilanse Otwarcia (BO)!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`Błąd podczas inicjalizacji BO: ${err.message}`);
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-stone-200 animate-in fade-in zoom-in duration-200">
        <div className="bg-stone-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl">
              <Layers size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Bilans Otwarcia (BO)</h2>
              <p className="text-xs text-stone-400">Zamrożenie stanów i inicjalizacja transakcyjna</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 items-start">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">Plan B (Standard ERP):</span> Operacja spowoduje pobranie wszystkich wsadów z aktualnym stanem (`numericQuantity &gt; 0`) i utworzenie dla każdego z nich pierwszego kwitu **BO (Bilans Otwarcia)** w nowej kolekcji `inventoryTransactions`.
            </div>
          </div>

          <div className="text-xs text-stone-600 space-y-2 bg-stone-50 p-4 rounded-2xl border border-stone-100 font-medium">
            <p>• Wszystkie przyszłe zmiany stanów (PZ, RW, PW, RWI, PWI) będą wymagały wpisu transakcyjnego.</p>
            <p>• Równanie magazynowe uzyska punkt zerowy do wyliczania końcowego stanu.</p>
            <p>• Zapobiega błędom braku historii dla wsadów wprowadzonych przed wdrożeniem nowego reżimu.</p>
          </div>

          {isInitializing && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-center space-y-2">
              <RefreshCw size={24} className="text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs font-bold text-indigo-900">{progressMessage}</p>
            </div>
          )}
        </div>

        <div className="bg-stone-50 p-4 px-6 border-t border-stone-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isInitializing}
            className="px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Anuluj
          </button>
          <button
            onClick={handleRunBOInitialization}
            disabled={isInitializing}
            className="px-5 py-2.5 text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 size={16} />
            Wygeneruj Kwity BO
          </button>
        </div>
      </div>
    </div>
  );
}
