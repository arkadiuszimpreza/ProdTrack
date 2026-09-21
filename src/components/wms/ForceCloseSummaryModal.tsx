import React from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle, PackageCheck } from 'lucide-react';

interface Props {
  selectedCount: number;
  onClose: () => void;
  onConfirm: () => void;
  isSaving: boolean;
}

export function ForceCloseSummaryModal({ selectedCount, onClose, onConfirm, isSaving }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-8 py-6 border-b border-stone-100 bg-stone-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
              <PackageCheck size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-stone-900 tracking-tight">Ręczne Zamknięcie</h2>
              <p className="text-sm font-medium text-stone-500">Oznaczenie zamówień jako zrealizowane</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 text-center bg-white">
            <div className="w-20 h-20 bg-stone-50 rounded-full mx-auto flex items-center justify-center mb-6 border-4 border-stone-100">
                <span className="text-3xl font-black text-indigo-600">{selectedCount}</span>
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-2">Potwierdzenie operacji</h3>
            <p className="text-sm text-stone-500 leading-relaxed max-w-[280px] mx-auto">
                Czy na pewno chcesz oznaczyć wybrane pozycje ({selectedCount} szt.) jako "ZREALIZOWANE"? Zostaną one ukryte w panelu magazyniera.
            </p>
        </div>

        <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-4">
          <button type="button" onClick={onClose} className="flex-1 py-4 bg-white text-stone-600 font-bold rounded-2xl border border-stone-200 hover:bg-stone-100 transition-all shadow-sm">
            Anuluj
          </button>
          <button 
            type="button" 
            onClick={onConfirm} 
            disabled={isSaving || selectedCount === 0} 
            className="flex-1 py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? 'Zapisywanie...' : <><CheckCircle size={20} /> Potwierdź</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
