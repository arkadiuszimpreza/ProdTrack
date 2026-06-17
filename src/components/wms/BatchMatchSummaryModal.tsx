import React from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle, AlertTriangle, XCircle, Save, PackagePlus, ArrowRight } from 'lucide-react';
import { BatchMatchResult } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface Props {
  results: BatchMatchResult[];
  onClose: () => void;
  onConfirm: () => void;
  isSaving: boolean;
}

export function BatchMatchSummaryModal({ results, onClose, onConfirm, isSaving }: Props) {
  const matchedCount = results.filter(r => r.matchStatus === 'MATCHED').length;
  const unmatchedCount = results.filter(r => r.matchStatus === 'UNMATCHED').length;
  const duplicatesCount = results.filter(r => r.matchStatus === 'DUPLICATE').length;
  
  const toSaveCount = matchedCount + unmatchedCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Nagłówek */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-stone-100 bg-stone-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
              <PackagePlus size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-stone-900 tracking-tight">Weryfikacja Wsadów</h2>
              <p className="text-sm font-medium text-stone-500">System porównał "Tabelę Dostaw" z oczekiwaniami ERP.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Statystyki */}
        <div className="grid grid-cols-3 gap-4 p-6 bg-white border-b border-stone-100">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-4">
            <CheckCircle className="text-emerald-500" size={32} />
            <div>
              <div className="text-2xl font-black text-emerald-700">{matchedCount}</div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-600/70">Połączone z ERP</div>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-center gap-4">
            <AlertTriangle className="text-amber-500" size={32} />
            <div>
              <div className="text-2xl font-black text-amber-700">{unmatchedCount}</div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-600/70">Brak w Zakupy-info</div>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-4">
            <XCircle className="text-red-500" size={32} />
            <div>
              <div className="text-2xl font-black text-red-700">{duplicatesCount}</div>
              <div className="text-xs font-bold uppercase tracking-wider text-red-600/70">Odrzucone (Duplikaty)</div>
            </div>
          </div>
        </div>

        {/* Lista wyników */}
        <div className="flex-1 overflow-y-auto bg-stone-50 p-6 custom-scrollbar">
          <div className="space-y-2">
            {results.map((res, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "p-4 rounded-2xl border flex items-center gap-4 shadow-sm",
                  res.matchStatus === 'MATCHED' ? "bg-white border-emerald-200" :
                  res.matchStatus === 'UNMATCHED' ? "bg-white border-amber-200" :
                  "bg-red-50/50 border-red-200 opacity-60"
                )}
              >
                {/* Ikona Statusu */}
                <div className="shrink-0">
                  {res.matchStatus === 'MATCHED' && <CheckCircle className="text-emerald-500" size={24} />}
                  {res.matchStatus === 'UNMATCHED' && <AlertTriangle className="text-amber-500" size={24} />}
                  {res.matchStatus === 'DUPLICATE' && <XCircle className="text-red-500" size={24} />}
                </div>

                {/* Dane Wsadu (Plac) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-stone-900">{res.batch.batchNumber}</span>
                    <span className="text-xs font-bold text-stone-500 bg-stone-200 px-2 py-0.5 rounded-md">{res.batch.supplier}</span>
                  </div>
                  <div className="text-sm font-medium text-stone-700 truncate">
                    {res.batch.articleNumber && <span className="font-mono text-stone-400 mr-2">{res.batch.articleNumber}</span>}
                    {res.batch.articleName}
                  </div>
                  <div className="text-xs text-stone-500 mt-1">Zamówienie w Tabeli: <strong>{res.batch.orderNumber || 'Brak'}</strong></div>
                </div>

                {/* Strzałka i Dane ERP (jeśli dopasowano) */}
                <div className="shrink-0 px-4">
                  <ArrowRight className="text-stone-300" size={20} />
                </div>

                <div className="w-[300px] shrink-0 text-right">
                  <div className="text-lg font-black text-stone-900 mb-1">{res.batch.quantityString}</div>
                  
                  {res.matchStatus === 'MATCHED' && res.matchedPurchaseOrder && (
                    <div className="text-xs font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg inline-block text-left w-full border border-emerald-100">
                      Zapisze Wsad na Plac<br/>
                      <span className="text-[10px] text-emerald-600/70 font-medium">Proces: {res.matchedPurchaseOrder.purchaseOrderNumber} | Ilość bazowa: {res.batch.numericQuantity}</span>
                    </div>
                  )}
                  {res.matchStatus === 'UNMATCHED' && (
                    <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mt-2">
                      Zapisze Wsad, ale nie pomniejszy ERP
                    </div>
                  )}
                  {res.matchStatus === 'DUPLICATE' && (
                    <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider mt-2">
                      Ten numer wsadu już jest na placu!
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stopka z przyciskami */}
        <div className="p-6 bg-white border-t border-stone-100 flex gap-4">
          <button type="button" onClick={onClose} className="px-8 py-4 bg-stone-100 text-stone-600 font-bold rounded-2xl hover:bg-stone-200 transition-all">
            Anuluj
          </button>
          <button 
            type="button" 
            onClick={onConfirm} 
            disabled={isSaving || toSaveCount === 0} 
            className="flex-1 py-4 bg-amber-500 text-stone-900 font-black rounded-2xl hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? 'Zapisywanie na plac...' : <><Save size={20} /> Przyjmij na Plac ({toSaveCount} szt.)</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}