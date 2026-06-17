import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, writeBatch, doc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { Archive, Search, AlertCircle, Save, CheckCircle } from 'lucide-react';
import { InventoryBatch, InventoryCount } from '../../types';
import { cn } from '../../utils/firestore-helpers';

type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'FA' | 'SR' | 'INNE';

const guessPrefix = (name: string): string => {
  if (!name) return 'INNE';
  const n = name.toLowerCase();
  if (n.includes('rura')) return 'RU';
  if (n.includes('blacha') || n.includes('płyta')) return 'BL';
  if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik')) return 'PR';
  if (n.includes('farba') || n.includes('proszek')) return 'FA';
  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
  return 'INNE'; 
};

interface Props {
  currentUser: string;
}

export function InventoryZeroingView({ currentUser }: Props) {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedCategory, setSelectedCategory] = useState<MaterialFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [cutoffDate, setCutoffDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isProcessing, setIsProcessing] = useState(false);

  const [unselectedIds, setUnselectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const qBatches = query(collection(db, 'inventoryBatches'));
    const unsub = onSnapshot(qBatches, (snap) => {
      setBatches(snap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryBatch)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const candidatesToZero = useMemo(() => {
    if (!cutoffDate) return [];
    
    const cutoffTime = new Date(`${cutoffDate}T23:59:59.999Z`).getTime();
    
    return batches.filter(b => {
      // 1. Sprawdzanie kategorii
      if (selectedCategory !== 'ALL' && guessPrefix(b.articleName || '') !== selectedCategory) {
        return false;
      }
      
      // 2. Czy nie ma zliczeń (draft zeroed/empty)?
      // Jesśli ma draftQuantity to znaczy, że zliczono. Zwróć uwagę, 
      // że interesują nas tylko te które NIE zostały policzone. 
      // Czyli draftQuantity jest undefined lub null
      if (b.draftQuantity !== undefined && b.draftQuantity !== null) {
        return false;
      }

      // 3. Sprawdzanie daty przyjęcia (limitujemy do nowszych/starszych)
      // Chcemy wpisać 0 tylko wsadom, które PRZYSZŁY przed podaną datą włącznie
      let creationTime = 0;
      if (b.deliveryDate) {
         creationTime = new Date(`${b.deliveryDate}T00:00:00Z`).getTime();
      } else if (b.createdAt && b.createdAt.toMillis) {
         creationTime = b.createdAt.toMillis();
      } else {
         return false; // brak ustalonej daty pomijamy (albo można zakładać starą datę)
      }
      
      if (creationTime > cutoffTime) {
         return false; // ten wsad przyszedł PO rozpoęciu inwentaryzacji (cutoff)
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesBasic = (b.articleNumber || '').toLowerCase().includes(term) || (b.articleName || '').toLowerCase().includes(term);
        const matchesBatch = (b.batchNumber || '').toLowerCase().includes(term);
        if (!matchesBasic && !matchesBatch) return false;
      }

      return true;
    }).sort((a,b) => (a.articleName || '').localeCompare(b.articleName || ''));
  }, [batches, selectedCategory, cutoffDate, searchTerm]);

  const selectedCandidates = useMemo(() => {
    return candidatesToZero.filter(b => !unselectedIds.has(b.id as string));
  }, [candidatesToZero, unselectedIds]);

  const handleApplyZero = async () => {
    if (selectedCandidates.length === 0) return alert("Brak wybranych wsadów do wyzerowania.");
    if (!window.confirm(`Czy na pewno chcesz wpisać zero asortymentowi wybranych wsadów (Ilość: ${selectedCandidates.length})? \nZostaną wygenerowane wpisy inwentaryzacyjne na 0.`)) return;

    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      const BATCH_SIZE = 400; // Firestore limit is 500, lets stick to safe count
      let currentBatchOp = writeBatch(db);
      let operationCount = 0;

      for (const batch of selectedCandidates) {
         const batchRef = doc(db, 'inventoryBatches', batch.id as string);
         const countRef = doc(collection(db, 'inventoryCounts'));
         
         // Ustawianie 0 dla inventoryBatches
         currentBatchOp.update(batchRef, {
            draftQuantity: 0,
            draftUpdatedAt: serverTimestamp(),
            draftUpdatedBy: currentUser
         });
         operationCount++;

         // Dodawanie wpisu ilościowego 0 w inventoryCounts
         currentBatchOp.set(countRef, {
            batchId: batch.id,
            quantity: 0,
            calculatorDetails: 'Zerowanie automatyczne',
            createdBy: currentUser,
            createdAt: serverTimestamp(),
            archived: false
         });
         operationCount++;
         
         // Zabezpieczenie przed limitem 500 operacji w jednym writBatch
         if (operationCount >= BATCH_SIZE) {
            await currentBatchOp.commit();
            currentBatchOp = writeBatch(db);
            operationCount = 0;
         }
      }
      
      if (operationCount > 0) {
        await currentBatchOp.commit();
      }
      
      alert("Pomyślnie wprowadzono zera dla niezliczonych wsadów!");
    } catch(err) {
      console.error(err);
      alert("Wystąpił błąd podczas zapisywania operacji.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden flex flex-col h-[calc(100vh-120px)] lg:h-auto lg:min-h-[700px]">
       <div className="p-6 border-b border-stone-200 bg-stone-50/50">
         <h2 className="text-xl font-black text-stone-800 flex items-center gap-2">
           <Archive className="text-indigo-600" />
           Asystent Automatycznego Zerowania Wsadów
         </h2>
         <p className="text-sm text-stone-500 mt-1">
           Ta formatka pozwala wpisać wartość '0' jako zliczony wynik dla wsadu, 
           który nie został zinwentaryzowany, o ile jego data przyjęcia jest z danego dnia (lub wcześniejsza).
         </p>
       </div>
       
       <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-white border-b border-stone-100">
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-widest mb-2">
              Kategoria Asortymentu
            </label>
            <div className="flex flex-wrap gap-2">
                {(['ALL', 'RU', 'PR', 'BL', 'FA', 'SR', 'INNE'] as MaterialFilter[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-black transition-all border",
                      selectedCategory === cat 
                        ? "bg-indigo-600 text-white border-indigo-700 shadow-md scale-105" 
                        : "bg-white text-stone-500 border-stone-200 hover:border-indigo-300 hover:text-indigo-600"
                    )}
                  >
                    {cat === 'ALL' ? 'Wszystko' : cat}
                  </button>
                ))}
            </div>
          </div>
          <div>
             <label className="block text-xs font-bold text-stone-700 uppercase tracking-widest mb-2">
               Limit Daty Przyjęcia
             </label>
             <input 
               type="date"
               value={cutoffDate}
               onChange={(e) => setCutoffDate(e.target.value)}
               className="px-4 py-3 border border-stone-200 rounded-xl w-full font-bold bg-stone-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
             />
             <p className="text-xs text-stone-500 mt-2 flex items-center gap-1">
                <AlertCircle size={14} className="text-amber-500 shrink-0" />
                Ustaw dzień rozpoczęcia inwentaryzacji. Wsady przyjęte po tej dacie nie będą brane pod uwagę.
             </p>
          </div>
          <div>
             <label className="block text-xs font-bold text-stone-700 uppercase tracking-widest mb-2">
               Wyszukaj
             </label>
             <input 
               type="text"
               placeholder="Indeks, nazwa lub wsad..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="px-4 py-3 border border-stone-200 rounded-xl w-full text-sm font-bold placeholder:text-stone-300 bg-stone-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
             />
             <p className="text-xs text-stone-500 mt-2">
                Pozwala szybko odfiltrować wybraną listę materiałów.
             </p>
          </div>
       </div>

       <div className="flex-1 overflow-y-auto p-6 bg-stone-50/50">
          {loading ? (
             <div className="flex justify-center items-center py-12">
               <div className="w-8 h-8 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
             </div>
          ) : (
             <div className="max-w-4xl mx-auto space-y-3">
               <div className="flex items-center justify-between font-bold text-stone-700 uppercase text-xs tracking-widest px-2 mb-4">
                 <div className="flex items-center gap-3">
                   <span>Wyniki wyszukiwania ({candidatesToZero.length})</span>
                   {candidatesToZero.length > 0 && (
                     <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded-full text-stone-500">Wybrano: {selectedCandidates.length}</span>
                   )}
                 </div>
                 {candidatesToZero.length > 0 && (
                   <div className="flex items-center gap-3">
                     <button 
                       onClick={() => setUnselectedIds(unselectedIds.size === candidatesToZero.length ? new Set() : new Set(candidatesToZero.map(b => b.id as string)))}
                       className="text-stone-500 hover:text-indigo-600 transition-colors underline decoration-stone-300 hover:decoration-indigo-300"
                     >
                       {unselectedIds.size === candidatesToZero.length ? 'Zaznacz wszystkie' : 'Odznacz wszystkie'}
                     </button>
                     <button 
                       onClick={handleApplyZero}
                       disabled={isProcessing || selectedCandidates.length === 0}
                       className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
                     >
                       {isProcessing ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
                       Zatwierdź Zera ({selectedCandidates.length})
                     </button>
                   </div>
                 )}
               </div>

               {candidatesToZero.length === 0 ? (
                 <div className="bg-white p-12 text-center rounded-2xl border border-stone-200">
                    <Search className="mx-auto text-stone-300 mb-4" size={48} />
                    <h3 className="text-lg font-black text-stone-700">Wszystko policzone lub brak materiałów</h3>
                    <p className="text-stone-500 text-sm mt-2">Dla wybranych kryteriów i daty nie odnaleźliśmy wsadów bez przypisanego zliczenia (draft).</p>
                 </div>
               ) : (
                  candidatesToZero.map((batch, i) => {
                    const isSelected = !unselectedIds.has(batch.id as string);
                    return (
                    <div 
                      key={batch.id} 
                      onClick={() => {
                        setUnselectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(batch.id as string)) next.delete(batch.id as string);
                          else next.add(batch.id as string);
                          return next;
                        });
                      }}
                      className={cn(
                        "bg-white border flex items-center gap-4 p-4 rounded-xl shadow-sm transition-all cursor-pointer hover:border-indigo-300",
                        !isSelected ? "opacity-60 border-stone-100" : "border-stone-200"
                      )}
                    >
                       <div className="flex-shrink-0">
                         <div className={cn("w-6 h-6 rounded border-2 flex items-center justify-center transition-colors", isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-stone-300 bg-stone-50")}>
                           {isSelected && <CheckCircle size={16} />}
                         </div>
                       </div>
                       <div className="flex-1">
                         <div className="text-[10px] font-mono font-bold text-stone-400 mb-1">{batch.articleNumber}</div>
                         <div className="font-black text-stone-800 text-sm mb-1">{batch.articleName}</div>
                         <div className="flex items-center gap-3 text-xs">
                            <span className="bg-stone-100 text-stone-600 font-bold px-2 py-0.5 rounded">Wsad: {batch.batchNumber}</span>
                            <span className="text-stone-500"><span className="text-stone-400">Stan systemowy:</span> {batch.numericQuantity} {batch.unit}</span>
                            <span className="text-stone-500"><span className="text-stone-400">U nas od:</span> {batch.deliveryDate || (batch.createdAt?.toDate ? batch.createdAt.toDate().toLocaleDateString() : 'Brak danych')}</span>
                         </div>
                       </div>
                       <div className="flex flex-col items-end">
                         <span className={cn("text-[10px] uppercase font-bold px-2 py-1 rounded", isSelected ? "text-rose-500 bg-rose-50" : "text-stone-400 bg-stone-100")}>
                           {isSelected ? "Brak zliczenia" : "Pominięto"}
                         </span>
                       </div>
                    </div>
                    );
                  })
               )}
             </div>
          )}
       </div>
    </div>
  );
}
