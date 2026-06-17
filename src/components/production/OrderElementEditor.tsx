import React, { useState } from 'react';
import { X, Plus, Trash2, Save, Package, Scale } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { ProductionOrder, OrderElement, WorkLog } from '../../types';
import { motion } from 'motion/react';

interface OrderElementEditorProps {
  order: ProductionOrder;
  onClose: () => void;
  onUpdate: (orderId: string, elements: OrderElement[], totalWeight?: number, appReportedQty?: number) => Promise<void>;
}

export function OrderElementEditor({ order, onClose, onUpdate }: OrderElementEditorProps) {
  const [elements, setElements] = useState<OrderElement[]>(order.elements || []);
  const [newElementName, setNewElementName] = useState('');
  const [newElementWeight, setNewElementWeight] = useState('');
  
  const [totalOrderWeight, setTotalOrderWeight] = useState<string>(order.totalWeight?.toString() || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddElement = () => {
    if (!newElementName.trim()) return;
    const normalizedWeight = newElementWeight.replace(',', '.');
    const newElement: OrderElement = {
      id: crypto.randomUUID(),
      name: newElementName.trim(),
      weight: parseFloat(normalizedWeight) || 0
    };
    setElements([...elements, newElement]);
    setNewElementName('');
    setNewElementWeight('');
  };

  const handleRemoveElement = (id: string) => {
    setElements(elements.filter(el => el.id !== id));
  };

  const handleUpdateElementWeight = (id: string, newWeight: string) => {
    // Zamień przecinek na kropkę, aby obsłużyć polski format liczbowy
    const normalizedWeight = newWeight.replace(',', '.');
    setElements(elements.map(el => 
      el.id === id 
        ? { ...el, weight: normalizedWeight === '' ? 0 : parseFloat(normalizedWeight) } 
        : el
    ));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const normalizedTotal = totalOrderWeight.replace(',', '.');
      const parsedTotalWeight = parseFloat(normalizedTotal);
      const finalTotalWeight = isNaN(parsedTotalWeight) ? 0 : parsedTotalWeight;
      
      // ODPYTUJEMY BAZĘ O WSZYSTKIE LOGI TEGO ZLECENIA ABY PRZELICZYĆ APP-QTY
      const q = query(collection(db, 'workLogs'), where('orderId', '==', order.id));
      const logSnap = await getDocs(q);
      const logs = logSnap.docs.map(d => d.data() as WorkLog);
      
      let newAppQty = 0;
      const totalWeightPerUnit = elements.reduce((sum, el) => sum + (el.weight || 0), 0);
      
      // Przeliczamy nowe ilości zameldowane dla każdego elementu z logów
      const elementsMap = new Map<string, number>();
      
      for (const log of logs) {
        let rawQty = (log as any).quantityReported ?? (log as any).quantity ?? 0;
        if (typeof rawQty === 'string') rawQty = parseFloat(rawQty.replace(',', '.'));
        const qty = Number(rawQty) || 0;
        
        if (qty === 0) continue;
        
        let increment = qty;
        
        if (log.elementId || log.elementName) {
           let targetId = log.elementId;
           
           if (elements.length > 0) {
              let el = elements.find(e => e.id === log.elementId);
              if (!el && log.elementName) el = elements.find(e => e.name === log.elementName);
              
              if (el) {
                 targetId = el.id; // użyj aktualnego ID
                 if (totalWeightPerUnit > 0) {
                    increment = qty * (el.weight / totalWeightPerUnit);
                 }
              }
           }
           
           if (targetId) {
             const prev = elementsMap.get(targetId) || 0;
             elementsMap.set(targetId, prev + qty);
           }
        }
        
        newAppQty += increment;
      }
      
      // Nadpisujemy elementy nowymi wartościami sum ilości
      const updatedElements = elements.map(e => ({
         ...e,
         reportedQuantity: elementsMap.get(e.id) || 0
      }));

      await onUpdate(order.id, updatedElements, finalTotalWeight, newAppQty);
      onClose();
    } catch (error) {
      console.error('Error updating elements:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-stone-200"
      >
        <div className="p-8 border-b border-stone-100 flex justify-between items-center bg-stone-50">
          <div>
            <h2 className="text-2xl font-black text-stone-900 leading-tight">Zarządzaj wagami</h2>
            <p className="text-stone-500 font-bold text-sm uppercase tracking-widest mt-1">{order.productName}</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-stone-200 rounded-2xl transition-all text-stone-400">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          
          <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 hidden sm:flex">
              <Scale size={24} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-emerald-900">Waga całkowita zlecenia</p>
              <p className="text-[11px] font-bold text-emerald-700 mt-1 uppercase tracking-widest">Dla prac ogólnych (bez podziału na elementy)</p>
            </div>
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <input
                type="number"
                step="0.01"
                value={totalOrderWeight}
                onChange={(e) => setTotalOrderWeight(e.target.value)}
                placeholder="0.00"
                className="w-28 bg-white border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-right"
              />
              <span className="text-emerald-700 font-bold">kg</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-px bg-stone-200 flex-1"></div>
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">LUB PODZIEL NA DETALE</span>
            <div className="h-px bg-stone-200 flex-1"></div>
          </div>

          <div className="space-y-3">
            {elements.map((element) => (
              <div key={element.id} className="flex items-center gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100 group">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-stone-400 shrink-0">
                  <Package size={20} />
                </div>
                
                {/* ZMODYFIKOWANO: Sekcja edycji istniejącego elementu */}
                <div className="flex-1">
                  <p className="font-black text-stone-900">{element.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      step="0.01"
                      value={element.weight === 0 ? '' : element.weight}
                      onChange={(e) => handleUpdateElementWeight(element.id, e.target.value)}
                      placeholder="0"
                      className="w-24 bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs font-bold text-stone-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                    />
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">kg</span>
                  </div>
                </div>

                <button 
                  onClick={() => handleRemoveElement(element.id)}
                  className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {elements.length === 0 && (
              <div className="text-center py-6 bg-stone-50 rounded-[2rem] border-2 border-dashed border-stone-200">
                <p className="text-stone-400 font-bold italic text-sm">Brak zdefiniowanych elementów podrzędnych</p>
              </div>
            )}
          </div>

          <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-100 space-y-4">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">Dodaj nowy detal</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newElementName}
                onChange={(e) => setNewElementName(e.target.value)}
                placeholder="Nazwa elementu"
                className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-stone-900/5 outline-none transition-all"
              />
              <input
                type="number"
                step="0.01"
                value={newElementWeight}
                onChange={(e) => setNewElementWeight(e.target.value)}
                placeholder="Waga (kg)"
                className="w-full sm:w-28 bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-stone-900/5 outline-none transition-all"
              />
              <button 
                onClick={handleAddElement}
                className="p-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-all active:scale-95 flex justify-center items-center"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-8 bg-stone-50 border-t border-stone-100 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-white text-stone-600 rounded-2xl font-black uppercase tracking-widest text-xs border border-stone-200 hover:bg-stone-100 transition-all"
          >
            Anuluj
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-4 bg-stone-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-stone-800 transition-all shadow-lg shadow-stone-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? 'Zapisywanie...' : (
              <>
                <Save size={16} />
                Zapisz zmiany
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}