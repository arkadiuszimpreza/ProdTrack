import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Upload, ChevronRight, Info } from 'lucide-react';
import { ImportConflict } from '../../types'; 
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';

interface ImportResolutionModalProps {
  newCount: number;
  conflicts: ImportConflict[];
  onConfirm: (selected: Set<number>) => void;
  onCancel: () => void;
  isImporting: boolean;
}

export const ImportResolutionModal: React.FC<ImportResolutionModalProps> = ({ 
  newCount, 
  conflicts, 
  onConfirm, 
  onCancel, 
  isImporting 
}) => {
  const [selected, setSelected] = useState<Set<number>>(new Set(conflicts.map((_, i) => i)));

  const toggleConflict = (idx: number) => {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelected(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <Upload size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Podsumowanie Importu</h2>
              <p className="text-xs text-stone-500">Przejrzyj zmiany przed zapisaniem</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* New Orders Info */}
          {newCount > 0 && (
            <div className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold">
                {newCount}
              </div>
              <div>
                <p className="font-bold text-emerald-900">Nowe zlecenia</p>
                <p className="text-sm text-emerald-700">Zostaną dodane do systemu jako nowe pozycje.</p>
              </div>
            </div>
          )}

          {/* Conflicts List */}
          {conflicts.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-stone-900 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-500" />
                  Wykryte konflikty ({conflicts.length})
                </h3>
                <button 
                  onClick={() => setSelected(selected.size === conflicts.length ? new Set() : new Set(conflicts.map((_, i) => i)))}
                  className="text-xs font-bold text-emerald-600 hover:underline"
                >
                  {selected.size === conflicts.length ? 'Odznacz wszystko' : 'Zaznacz wszystko'}
                </button>
              </div>
              <p className="text-sm text-stone-500">Zlecenia o tych samych numerach ZP już istnieją, ale mają inne dane. Zaznacz te, które chcesz zaktualizować.</p>
              
              <div className="space-y-3">
                {conflicts.map((conflict, idx) => (
                  <div 
                    key={idx}
                    onClick={() => toggleConflict(idx)}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all cursor-pointer",
                      selected.has(idx) ? "border-emerald-500 bg-emerald-50/30" : "border-stone-100 hover:border-stone-200"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0",
                        selected.has(idx) ? "bg-emerald-500 border-emerald-500 text-white" : "border-stone-300"
                      )}>
                        {selected.has(idx) && <CheckCircle2 size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        
                        {/* ZMIANA: Ulepszony nagłówek konfliktu z nazwą produktu */}
                        <div className="flex justify-between items-start mb-3 gap-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                              ZP: {conflict.existingOrder.orderNumber}
                            </span>
                            <span className="text-sm font-bold text-stone-800 mt-0.5 line-clamp-2">
                              {conflict.existingOrder.productName}
                            </span>
                          </div>
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase shrink-0 mt-0.5">
                            Zmiana danych
                          </span>
                        </div>

                        <div className="space-y-2">
                          {conflict.diff.map((d, dIdx) => (
                            <div key={dIdx} className="text-xs grid grid-cols-[100px_1fr] gap-2 items-center">
                              <span className="text-stone-400 font-medium truncate" title={d.label}>{d.label}:</span>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="line-through text-stone-400 truncate max-w-[40%]">{d.oldValue}</span>
                                <ChevronRight size={12} className="text-stone-300 shrink-0" />
                                <span className="font-bold text-emerald-700 truncate max-w-[40%]">{d.newValue}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : newCount === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <Info size={48} className="mx-auto mb-4 opacity-20" />
              <p>Nie wykryto żadnych zmian ani nowych zleceń w pliku.</p>
            </div>
          ) : null}
        </div>

        <div className="p-6 border-t border-stone-100 flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-2xl font-bold text-stone-600 hover:bg-stone-100 transition-colors"
          >
            Anuluj
          </button>
          <button 
            disabled={isImporting || (newCount === 0 && selected.size === 0)}
            onClick={() => onConfirm(selected)}
            className="flex-[2] py-3 px-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {isImporting ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            ) : (
              <>
                Zatwierdź i importuj
                <span className="text-xs opacity-60 font-normal">({newCount + selected.size} pozycji)</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};