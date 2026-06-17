import React, { useState } from 'react';
import { Plus, X, Search, Package, CheckSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { ProductionOrder } from '../../types';
import { cn } from '../../utils/firestore-helpers';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';

export function MultiOrderSelectModal({ 
  orders, 
  onAdd, 
  onClose 
}: { 
  orders: ProductionOrder[], 
  onAdd: (selected: ProductionOrder[]) => void, 
  onClose: () => void 
}) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = orders.filter(o => {
    const terms = parseSearchTerms(search);
    if (terms.length === 0) return true;
    const searchableText = `${o.orderNumber} ${o.erpOrderNumber || ''} ${o.productName} ${o.projectNumber || ''} ${o.articleNumber || ''} ${o.clientName || ''}`;
    return matchesAllTerms(searchableText, terms);
  });

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleAdd = () => {
    const selected = orders.filter(o => selectedIds.has(o.id));
    onAdd(selected);
    onClose();
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
              <Plus size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Wybierz wiele zleceń</h2>
              <p className="text-xs text-stone-500">Wyszukaj i zaznacz zlecenia do dodania</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 border-b border-stone-100">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
            <input 
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj po ZP, zleceniu klienta, projekcie lub nazwie..."
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <Package size={48} className="mx-auto mb-4 opacity-20" />
              <p>Nie znaleziono zleceń.</p>
            </div>
          ) : (
            filtered.slice(0, 50).map(order => (
              <div 
                key={order.id}
                onClick={() => toggleSelection(order.id)}
                className={cn(
                  "p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4",
                  selectedIds.has(order.id) ? "border-emerald-500 bg-emerald-50/30" : "border-stone-100 hover:border-stone-200"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors",
                  selectedIds.has(order.id) ? "bg-emerald-500 border-emerald-500 text-white" : "border-stone-300"
                )}>
                  {selectedIds.has(order.id) && <CheckSquare size={16} />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest">ZP: {order.orderNumber}</span>
                    {order.erpOrderNumber && <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-bold uppercase">Zl: {order.erpOrderNumber}</span>}
                  </div>
                  <h4 className="font-bold text-stone-900 text-sm line-clamp-1">{order.productName}</h4>
                  {order.projectNumber && <p className="text-[10px] text-stone-400 mt-1">Projekt: {order.projectNumber}</p>}
                </div>
              </div>
            ))
          )}
          {filtered.length > 50 && (
            <p className="text-center text-[10px] text-stone-400 py-2 italic">Wyświetlono tylko pierwsze 50 wyników. Zawęź wyszukiwanie, aby znaleźć więcej.</p>
          )}
        </div>

        <div className="p-6 border-t border-stone-100 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-2xl font-bold text-stone-600 hover:bg-stone-100 transition-colors"
          >
            Anuluj
          </button>
          <button 
            disabled={selectedIds.size === 0}
            onClick={handleAdd}
            className="flex-[2] py-3 px-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            Dodaj wybrane ({selectedIds.size})
          </button>
        </div>
      </motion.div>
    </div>
  );
}