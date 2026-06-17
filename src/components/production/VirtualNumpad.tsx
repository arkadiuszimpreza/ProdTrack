import React from 'react';
import { Delete, X } from 'lucide-react';

interface NumpadProps {
  value: string;
  onChange: (val: string) => void;
  onClose?: () => void;
  showClose?: boolean;
}

export function VirtualNumpad({ value, onChange, onClose, showClose = false }: NumpadProps) {
  const handlePress = (key: string) => {
    onChange(value + key);
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange('');
  };

  const keys = [
    '7', '8', '9',
    '4', '5', '6',
    '1', '2', '3',
    '0', '-', '/'
  ];

  return (
    <div className="bg-stone-50 border border-stone-200 p-4 rounded-3xl shadow-sm mt-4 max-w-sm mx-auto">
      {showClose && (
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-2 text-stone-400 hover:bg-stone-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            onClick={() => handlePress(key)}
            className="h-16 bg-white border border-stone-200 rounded-2xl text-2xl font-bold text-stone-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 active:scale-95 transition-all shadow-sm"
          >
            {key}
          </button>
        ))}
        <button
          onClick={handleClear}
          className="h-16 bg-stone-200 border border-stone-300 rounded-2xl text-sm font-bold text-stone-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 active:scale-95 transition-all shadow-sm col-span-1"
        >
          CZYŚĆ
        </button>
        <button
          onClick={handleBackspace}
          className="h-16 bg-stone-200 border border-stone-300 rounded-2xl flex items-center justify-center text-stone-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 active:scale-95 transition-all shadow-sm col-span-2"
        >
          <Delete size={24} />
        </button>
      </div>
    </div>
  );
}
