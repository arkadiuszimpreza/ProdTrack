import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, PackagePlus, Save, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { collection, doc, runTransaction, getDoc, query, where, limit, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

// Inteligentny półautomat do zgadywania prefiksu
const guessPrefix = (name: string): string => {
  if (!name) return 'INNE';
  const n = name.toLowerCase();
  if (n.includes('rura')) return 'RU';
  if (n.includes('płyta') || n.includes('plyta')) return 'PL';
  if (n.includes('blacha')) return 'BL';
  if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik')) return 'PR';
  if (n.includes('farba') || n.includes('proszek')) return 'FA';
  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
  return 'IN'; 
};

// Konwerter wymiarów rur na centymetry (np. "L.5,3" -> "530")
const parsePipeLengthToCm = (dim: string): string | null => {
  const clean = dim.replace(/\s/g, '').toUpperCase();
  
  // Szuka formatu z przecinkiem, np. L.5,3 lub 5.3
  const matchDec = clean.match(/(?:L\.?)?(\d+)[.,](\d+)/);
  if (matchDec) {
    const m = parseInt(matchDec[1], 10);
    const cm = parseInt(matchDec[2].padEnd(2, '0').slice(0, 2), 10);
    return String(m * 100 + cm);
  }
  
  // Szuka pełnych metrów, np. L.5 lub 500
  const matchInt = clean.match(/(?:L\.?)?(\d+)/);
  if (matchInt) {
    const val = parseInt(matchInt[1], 10);
    if (val < 50) return String(val * 100); // Jeśli ktoś wpisał 5, to znaczy 500 cm
    return String(val); // Jeśli ktoś wpisał od razu 500, zwracamy 500
  }
  return null;
};

interface Props {
  item: any; 
  onClose: () => void;
  onSave: (batchData: any) => Promise<void>;
}

export function ReceiveDeliveryModal({ item, onClose, onSave }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [nextSequence, setNextSequence] = useState<string>('001');
  const [isFetchingSeq, setIsFetchingSeq] = useState(true);
  
  // NOWOŚĆ: Przełącznik dla rur (Barierki)
  const [isBarrierPipe, setIsBarrierPipe] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const yearShort = new Date().getFullYear().toString().slice(2);
  const materialType = guessPrefix(item.articleName || '');
  const basePrefix = `${yearShort}${materialType}`;

  const remaining = Number(((item.quantityOrdered || 0) - (item.wmsDeliveredQuantity || 0)).toFixed(3));

  const [formData, setFormData] = useState({
    deliveryDate: today,
    batchNumber: '',
    grade: '',
    dimensions: '',
    coefficient: '',
    quantityString: remaining > 0 ? `${remaining} ${item.unit}` : `0 ${item.unit}`,
    numericQuantity: remaining > 0 ? remaining : 0,
    labelsCount: 1,
    qcCard: false,
    certificate: false,
    notes: ''
  });

  // 1. ZAMIENNIE Z GETDOCS - Odczytujemy bezpiecznie bez pobierania całej bazy
  useEffect(() => {
    const fetchNextSeq = async () => {
      setIsFetchingSeq(true);
      try {
        const docRef = doc(db, 'system_configs', 'wms_sequences');
        const snap = await getDoc(docRef);
        let currentVal = 0;
        if (snap.exists() && snap.data()[basePrefix] !== undefined) {
          currentVal = snap.data()[basePrefix];
        }
        const nextVal = String(currentVal + 1).padStart(3, '0');
        setNextSequence(nextVal);
        
        if ((materialType !== 'BL' && materialType !== 'PL')) {
          setFormData(prev => ({ ...prev, batchNumber: `${basePrefix}${nextVal}` }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsFetchingSeq(false);
      }
    };
    fetchNextSeq();
  }, [basePrefix, materialType]);

  useEffect(() => {
    const fetchCoefficient = async () => {
      if (!item.articleNumber) return;
      try {
        const q = query(
          collection(db, 'inventoryBatches'),
          where('articleNumber', '==', item.articleNumber),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (data.coefficient && data.coefficient.trim() !== '') {
            setFormData(prev => ({ ...prev, coefficient: data.coefficient }));
            break;
          }
        }
      } catch (e) {
        console.error('Error fetching coefficient:', e);
      }
    };
    fetchCoefficient();
  }, [item.articleNumber]);

  // 2. MAGICZNA RÓŻDŻKA (Inteligentny Generator Wsadu)
  const handleAutoGenerateBatch = () => {
    if ((materialType === 'BL' || materialType === 'PL')) {
      // LOGIKA BLACH
      const dimMatch = formData.dimensions.match(/(\d+)\s*[xX*]\s*(\d+)/);
      if (dimMatch) {
        let dim1 = Math.round(parseInt(dimMatch[1]) / 10);
        let dim2 = Math.round(parseInt(dimMatch[2]) / 10);
        if (dim1 > dim2) {
          const temp = dim1; dim1 = dim2; dim2 = temp;
        }
        const dimString = String(dim1).padStart(3, '0') + String(dim2).padStart(3, '0');
        setFormData(prev => ({ ...prev, batchNumber: `${basePrefix}${dimString}${nextSequence}` }));
      } else {
        alert('Wpisz wymiar blachy (np. 500x1250), aby wygenerować wsad.');
        setFormData(prev => ({ ...prev, batchNumber: `${basePrefix}[WYMIAR]${nextSequence}` }));
      }
    } else if (materialType === 'RU' && isBarrierPipe) {
      // LOGIKA RUR DLA BARIEREK
      const lengthCm = parsePipeLengthToCm(formData.dimensions);
      if (lengthCm) {
        setFormData(prev => ({ ...prev, batchNumber: `${basePrefix}${lengthCm}${nextSequence}` }));
      } else {
        alert('Wpisz poprawną długość w pole Wymiar (np. L.5, L.5,3 lub 530).');
        setFormData(prev => ({ ...prev, batchNumber: `${basePrefix}[DŁUGOŚĆ]${nextSequence}` }));
      }
    } else {
      // LOGIKA STANDARDOWA (np. Profile, Farby, zwykłe Rury)
      setFormData(prev => ({ ...prev, batchNumber: `${basePrefix}${nextSequence}` }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    
    if (name === 'numericQuantity') {
      // Don't format the value immediately in state to allow typing "1." or "8,"
      setFormData(prev => ({ 
        ...prev, 
        numericQuantity: value as any,
        quantityString: `${value} ${item.unit}`
      }));
    } else if (name === 'labelsCount') {
      setFormData(prev => ({
        ...prev,
        labelsCount: Math.max(1, parseInt(value) || 1)
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Zapobieganie Race Conditions u klienta
    setIsSubmitting(true);
    
    try {
      let finalBatchNumber = formData.batchNumber;

      // Zawsze generujemy świeży numer transakcją dla bezpieczeństwa, 
      // a ui po prostu podmienia starą końcówkę jeśli występuje lub dodaje z tyłu na bazie prefixu
      const generatedSeq = await runTransaction(db, async (t) => {
        const counterRef = doc(db, 'system_configs', 'wms_sequences');
        const counterSnap = await t.get(counterRef);
        
        let currentVal = 0;
        if (counterSnap.exists() && counterSnap.data()[basePrefix] !== undefined) {
           currentVal = counterSnap.data()[basePrefix];
        }
        
        const nextVal = currentVal + 1;
        t.set(counterRef, { [basePrefix]: nextVal }, { merge: true });
        
        return String(nextVal).padStart(3, '0');
      });

      if (!finalBatchNumber) {
        finalBatchNumber = `${basePrefix}${generatedSeq}`;
      } else if (finalBatchNumber.endsWith(nextSequence)) {
        // Jeśli aktualny numer z UI kończy się naszym (potencjalnie przestarzałym) nextSequence, podmień go
        finalBatchNumber = finalBatchNumber.slice(0, -nextSequence.length) + generatedSeq;
      }

      const parsedQty = parseFloat(String(formData.numericQuantity).replace(',', '.'));
      if (isNaN(parsedQty) || parsedQty <= 0) {
        setIsSubmitting(false);
        return alert("Wprowadzono nieprawidłową ilość dostarczoną!");
      }

      const batchData = {
        supplier: item.supplierName || 'Brak',
        deliveryDate: formData.deliveryDate,
        batchNumber: finalBatchNumber,
        articleNumber: item.articleNumber || '',
        orderNumber: item.purchaseOrderNumber || '',
        articleName: item.articleName || '',
        grade: formData.grade,
        coefficient: formData.coefficient,
        dimensions: formData.dimensions,
        quantityString: formData.quantityString,
        numericQuantity: parsedQty,
        initialQuantity: parsedQty,
        withdrawnQuantity: 0,
        labelsCount: Number(formData.labelsCount) || 1,
        qcCard: formData.qcCard,
        certificate: formData.certificate,
        notes: formData.notes,
        status: 'AVAILABLE',
        unitPrice: item.unitPrice || 0,
        priceUnit: item.priceUnit || '1',
        priceUnitMultiplier: item.priceUnitMultiplier || 1,
        totalValue: Number((parsedQty * (item.unitPrice || 0)).toFixed(2))
      };

      await onSave(batchData);
    } catch (err: any) {
      console.error(err);
      alert(`Wystąpił błąd podczas zapisu: ${err.message}`);
    } finally {
      setIsSubmitting(false); // Przywróć stan przycisku po zakończeniu
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-8 py-6 border-b border-stone-100 bg-stone-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
              <PackagePlus size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-stone-900">Nowy Wsad z palca</h2>
              <p className="text-sm font-medium text-stone-500">Zamówienie: {item.purchaseOrderNumber} • {item.articleName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-stone-400 hover:bg-stone-200 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Numer wsadu</label>
              <div className="relative">
                <input 
                  type="text" 
                  name="batchNumber" 
                  required 
                  value={formData.batchNumber} 
                  onChange={handleChange} 
                  className="w-full pl-4 pr-12 py-3 bg-indigo-50/50 border border-indigo-100 rounded-xl font-black text-indigo-900 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder={isFetchingSeq ? "Ładowanie..." : "Wpisz lub wygeneruj..."}
                />
                <button
                  type="button"
                  onClick={handleAutoGenerateBatch}
                  disabled={isFetchingSeq}
                  title="Automatycznie wygeneruj numer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Wand2 size={16} />
                </button>
              </div>
              <p className="text-[9px] text-stone-400 font-medium ml-1">Kolejny przewidywany wolny numer w bazie to: <strong className="text-indigo-600">{isFetchingSeq ? '...' : nextSequence}</strong></p>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Data dostawy</label>
              <input type="date" name="deliveryDate" required value={formData.deliveryDate} onChange={handleChange} className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            {/* POLE WYMIARÓW Z NOWYM CHECKBOXEM DLA RUR */}
            <div className="space-y-1 relative">
              <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Wymiar / Długość</label>
              <input type="text" name="dimensions" value={formData.dimensions} onChange={handleChange} className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="np. L.5,3 lub 500x1250" />
              
              {/* Checkbox pojawia się TYLKO dla rur */}
              {materialType === 'RU' && (
                <label className="flex items-center gap-1.5 mt-2 cursor-pointer bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                  <input 
                    type="checkbox" 
                    checked={isBarrierPipe} 
                    onChange={(e) => setIsBarrierPipe(e.target.checked)} 
                    className="w-3.5 h-3.5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer" 
                  />
                  <span className="text-[10px] font-bold uppercase text-indigo-700 select-none">
                    Koduj długość we wsadzie (Barierki)
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Gatunek / Partia</label>
              <input type="text" name="grade" value={formData.grade} onChange={handleChange} className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="np. S235JRH" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Fizycznie dostarczono (w liczbie)</label>
              <input type="text" inputMode="decimal" step="0.001" name="numericQuantity" required value={formData.numericQuantity} onChange={handleChange} className="w-full px-4 py-3 bg-white border-2 border-indigo-200 rounded-xl font-black text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Ilość na etykietę (tekst)</label>
              <input type="text" name="quantityString" required value={formData.quantityString} onChange={handleChange} className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Współczynnik (opcjonalnie)</label>
              <input type="text" name="coefficient" value={formData.coefficient} onChange={handleChange} className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="np. 2,2 kg/mb" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Ilość etykiet do wydruku</label>
              <input type="text" inputMode="numeric" min="1" name="labelsCount" required value={formData.labelsCount} onChange={handleChange} className="w-full px-4 py-3 bg-indigo-50/40 border-2 border-indigo-100 rounded-xl font-black text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="col-span-2 flex gap-6 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" name="qcCard" checked={formData.qcCard} onChange={handleChange} className="w-5 h-5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer" />
                <span className="font-bold text-stone-700 select-none">Karta Kontroli (Zrobiona)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" name="certificate" checked={formData.certificate} onChange={handleChange} className="w-5 h-5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer" />
                <span className="font-bold text-stone-700 select-none">Atest (Otrzymano)</span>
              </label>
            </div>

            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Uwagi</label>
              <textarea name="notes" rows={2} value={formData.notes} onChange={handleChange} className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Dodatkowe informacje dla hali..."></textarea>
            </div>
          </div>

          <div className="mt-8 flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 bg-stone-100 text-stone-600 font-bold rounded-2xl hover:bg-stone-200 transition-all active:scale-95">Anuluj</button>
            <button type="submit" disabled={isSubmitting || isFetchingSeq} className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 disabled:opacity-50">
              {isSubmitting ? 'Zapisywanie...' : <><Save size={20} /> Zapisz Wsad</>}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}