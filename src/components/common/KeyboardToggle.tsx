import React, { useState, useRef, useEffect } from 'react';
import { Keyboard as KeyboardIcon, KeyboardOff, Settings2, Check } from 'lucide-react';
import { useDeviceEnvironment, TerminalProfile } from '../../contexts/DeviceEnvironmentContext';
import { AnimatePresence, motion } from 'motion/react';

export function KeyboardToggle() {
  const { customKeyboardEnabled, overrideKeyboard, terminalProfile, setTerminalProfile } = useDeviceEnvironment();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    overrideKeyboard(!customKeyboardEnabled);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const profiles: { value: TerminalProfile, label: string }[] = [
    { value: 'auto', label: 'Auto (wg urządzenia)' },
    { value: 'always', label: 'Zawsze włączona' },
    { value: 'never', label: 'Zawsze wyłączona' }
  ];

  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex items-end gap-2" ref={menuRef}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-16 right-0 w-64 bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden"
          >
            <div className="p-3 border-b border-stone-100 bg-stone-50">
              <h3 className="text-sm font-bold text-stone-700 flex items-center gap-2">
                <Settings2 size={16} /> Profil stanowiska
              </h3>
              <p className="text-xs text-stone-500 mt-1">Ustawienia wirtualnej klawiatury</p>
            </div>
            <div className="p-2">
              {profiles.map(profile => (
                <button
                  key={profile.value}
                  onClick={() => { setTerminalProfile(profile.value); setIsOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    terminalProfile === profile.value 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : 'text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {profile.label}
                  {terminalProfile === profile.value && <Check size={16} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 flex items-center justify-center bg-white border border-stone-200 text-stone-500 rounded-full shadow-md hover:bg-stone-50 hover:text-stone-700 transition-colors"
        title="Ustawienia klawiatury"
      >
        <Settings2 size={18} />
      </button>

      <button
        onClick={handleToggle}
        className={`w-12 h-12 flex items-center justify-center rounded-full shadow-lg transition-all border-2 ${
          customKeyboardEnabled 
            ? 'bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600' 
            : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-100'
        }`}
        title={customKeyboardEnabled ? 'Wyłącz klawiaturę ekranową (na tę sesję)' : 'Włącz klawiaturę ekranową (na tę sesję)'}
      >
        {customKeyboardEnabled ? <KeyboardIcon size={24} /> : <KeyboardOff size={24} />}
      </button>
    </div>
  );
}
