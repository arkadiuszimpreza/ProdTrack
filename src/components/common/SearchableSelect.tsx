import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/firestore-helpers';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';

export function SearchableSelect<T>({ 
  options, 
  value, 
  onChange, 
  placeholder, 
  label,
  getLabel,
  getSearchValue,
  optional = false,
  compact = false,
  onInputChange // 1. DODANO: Pobieramy nową funkcję z propsów
}: { 
  options: T[], 
  value: string, 
  onChange: (val: string) => void, 
  placeholder: string,
  label: string,
  getLabel: (opt: T) => string,
  getSearchValue: (opt: T) => string,
  optional?: boolean,
  compact?: boolean,
  onInputChange?: (value: string) => void // 2. DODANO: Definicja typu (opcjonalna)
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter(opt => {
    const terms = parseSearchTerms(search);
    if (terms.length === 0) return true;
    return matchesAllTerms(getSearchValue(opt), terms);
  });

  const selectedOption = options.find(opt => (opt as any).id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideContainer = containerRef.current?.contains(target);
      const isInsidePortal = portalRef.current?.contains(target);
      
      if (!isInsideContainer && !isInsidePortal) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOpen = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {label && (
        <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
          {label} {optional && <span className="lowercase font-normal opacity-60">(opcjonalnie)</span>}
        </label>
      )}
      <div 
        onClick={toggleOpen}
        className={cn(
          "w-full bg-stone-50 border border-stone-200 rounded-2xl cursor-pointer flex items-center justify-between transition-all",
          compact ? "p-2 text-xs" : "p-4",
          isOpen && "ring-2 ring-emerald-500/20 border-emerald-500 bg-white"
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-stone-400")}>
          {selectedOption ? getLabel(selectedOption) : placeholder}
        </span>
        <ChevronDown size={18} className={cn("text-stone-400 transition-transform", isOpen && "rotate-180")} />
      </div>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div 
              ref={portalRef}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{ 
                position: 'absolute', 
                top: coords.top + 8, 
                left: coords.left, 
                width: coords.width,
                zIndex: 9999
              }}
              className="bg-white border border-stone-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-64"
            >
              <div className="p-3 border-b border-stone-100 bg-stone-50">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input 
                    autoFocus
                    type="text"
                    value={search}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearch(val); // Aktualizacja lokalnego filtrowania
                      if (onInputChange) {
                        onInputChange(val); // 3. DODANO: Wysłanie informacji do rodzica
                      }
                    }}
                    placeholder="Szukaj..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="overflow-y-auto">
                {optional && (
                  <div 
                    onClick={() => {
                      onChange('');
                      setIsOpen(false);
                      setSearch('');
                      if (onInputChange) onInputChange(''); // Opcjonalnie resetujemy też w rodzicu
                    }}
                    className="p-3 text-sm text-stone-400 hover:bg-stone-50 cursor-pointer italic"
                  >
                    Brak / Puste
                  </div>
                )}
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-sm text-stone-400">Nie znaleziono</div>
                ) : (
                  filtered.map((opt: any) => (
                    <div 
                      key={opt.id}
                      onClick={() => {
                        onChange(opt.id);
                        setIsOpen(false);
                        setSearch('');
                        if (onInputChange) onInputChange(''); // Czyścimy po wybraniu
                      }}
                      className={cn(
                        "p-3 text-sm hover:bg-emerald-50 cursor-pointer transition-colors",
                        value === opt.id && "bg-emerald-50 text-emerald-700 font-bold"
                      )}
                    >
                      {getLabel(opt)}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}