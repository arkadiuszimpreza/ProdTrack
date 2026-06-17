import React from 'react';
import { X, Package, ChevronRight, CheckCircle } from 'lucide-react';
import { ProductionOrder, OrderElement } from '../../types';
import { motion } from 'motion/react';
import { cn } from '../../utils/firestore-helpers'; // Upewnij się, że masz ten import

interface ElementSelectionModalProps {
  order: ProductionOrder;
  onSelect: (element: OrderElement) => void;
  onCancel: () => void;
}

export function ElementSelectionModal({ order, onSelect, onCancel }: ElementSelectionModalProps) {
  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-stone-200"
      >
        <div className="p-8 border-b border-stone-100 flex justify-between items-center bg-stone-50">
          <div>
            <h2 className="text-2xl font-black text-stone-900 leading-tight">Wybierz element</h2>
            <p className="text-stone-500 font-bold text-sm uppercase tracking-widest mt-1">Dla: {order.productName}</p>
          </div>
          <button onClick={onCancel} className="p-3 hover:bg-stone-200 rounded-2xl transition-all text-stone-400">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {order.elements && order.elements.length > 0 ? (
            order.elements.map((element) => {
              // DETEKCJA: Czy element jest gotowy?
              const targetQty = element.quantity || 1;
              const reportedQty = element.reportedQuantity || 0;
              const isCompleted = reportedQty >= targetQty;

              return (
                <button
                  key={element.id}
                  onClick={() => !isCompleted && onSelect(element)}
                  disabled={isCompleted}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all group text-left",
                    isCompleted 
                      ? "bg-stone-50 border-stone-200 opacity-60 cursor-not-allowed grayscale-[0.5]" 
                      : "bg-white border-stone-200 hover:border-stone-900 hover:bg-stone-50 shadow-sm hover:shadow-md"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors",
                    isCompleted ? "bg-emerald-100 text-emerald-600" : "bg-stone-100 text-stone-500 group-hover:text-stone-900"
                  )}>
                    {isCompleted ? <CheckCircle size={20} /> : <Package size={20} />}
                  </div>
                  <div className="flex-1">
                    <p className={cn("font-black", isCompleted ? "text-stone-500 line-through" : "text-stone-900")}>
                      {element.name}
                    </p>
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mt-0.5">
                      {element.weight} kg
                    </p>
                  </div>
                  {isCompleted ? (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg uppercase tracking-widest">
                      Gotowe
                    </span>
                  ) : (
                    <ChevronRight size={18} className="text-stone-300 group-hover:text-stone-900 transition-colors" />
                  )}
                </button>
              )
            })
          ) : (
            <div className="text-center py-12 bg-stone-50 rounded-[2rem] border-2 border-dashed border-stone-200">
              <Package size={48} className="mx-auto text-stone-200 mb-4" />
              <p className="text-stone-400 font-bold italic">Brak zdefiniowanych elementów</p>
            </div>
          )}
        </div>

        <div className="p-8 bg-stone-50 border-t border-stone-100">
          <button 
            onClick={onCancel}
            className="w-full py-4 bg-white text-stone-600 rounded-2xl font-black uppercase tracking-widest text-xs border border-stone-200 hover:bg-stone-100 transition-all"
          >
            Anuluj
          </button>
        </div>
      </motion.div>
    </div>
  );
}