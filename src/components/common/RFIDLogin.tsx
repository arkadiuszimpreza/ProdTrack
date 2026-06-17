import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserIcon, AlertCircle, LogOut, ArrowLeft, Building2, Globe } from 'lucide-react';
import { Employee } from '../../types';

interface RFIDLoginProps {
  employees: Employee[];
  onLogin: (emp: Employee) => void;
  onLogoutDevice: () => void;
}

export function RFIDLogin({ employees, onLogin, onLogoutDevice }: RFIDLoginProps) {
  const [selectedCompany, setSelectedCompany] = useState<'ERPLAST' | 'USPI' | null>(null);
  const [rfidInput, setRfidInput] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedCompany) {
      const focusInput = () => inputRef.current?.focus();
      focusInput();
      const interval = setInterval(focusInput, 1000);
      return () => clearInterval(interval);
    }
  }, [selectedCompany]);

  const processRFID = (code: string) => {
    // 1. Oczyszczamy skan z czytnika
    const cleanScannedCode = code.trim();

    // 2. Szukamy pracownika, zabezpieczając się przed różnicami typów i niewidocznymi znakami
    const found = employees.find(emp => {
      const cleanDbCode = String(emp.rfidCard).trim();
      return cleanDbCode === cleanScannedCode;
    });

    if (found) {
      // Przekazujemy pracownika dalej
      onLogin(found);
      setRfidInput('');
      setError(false);
      // Resetujemy firmę, aby po wylogowaniu pracownika, kolejny musiał wybrać firmę
      setSelectedCompany(null);
    } else {
      setError(true);
      setRfidInput('');
      setTimeout(() => setError(false), 2000);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRfidInput(value);
    
    // Optymalizacja procesu: automatyczne wywołanie po osiągnięciu 10 znaków
    if (value.length >= 10) {
      processRFID(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Zabezpieczenie (fallback), gdyby w przyszłości pojawiła się karta krótsza niż 10 znaków
    if (e.key === 'Enter' && rfidInput.length > 0 && rfidInput.length < 10) {
      processRFID(rfidInput);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
      <AnimatePresence mode="wait">
        {!selectedCompany ? (
          <motion.div 
            key="company-selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-5xl"
          >
            <div className="text-center mb-12 space-y-3">
              <h1 className="text-4xl font-black tracking-tight text-white">Wybierz firmę</h1>
              <p className="text-stone-400 font-medium text-lg">Wskaż firmę, dla której będziesz realizować zlecenia</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* ERPLAST */}
              <button
                onClick={() => setSelectedCompany('ERPLAST')}
                className="group relative bg-white rounded-3xl p-8 flex flex-col items-center justify-center transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-red-500/20 active:scale-95 overflow-hidden border-4 border-transparent hover:border-red-500/30 h-[300px] md:h-[350px]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10 w-full h-full flex items-center justify-center">
                  <img 
                    src="/images/erplast.png" 
                    alt="ERPLAST" 
                    className="w-full h-full object-contain mix-blend-multiply"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="hidden flex-col items-center gap-4 text-red-600">
                    <Building2 size={64} />
                    <span className="text-4xl font-black tracking-widest">ERPLAST</span>
                  </div>
                </div>
              </button>

              {/* USPI WORK */}
              <button
                onClick={() => setSelectedCompany('USPI')}
                className="group relative bg-white rounded-3xl p-8 flex flex-col items-center justify-center transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 active:scale-95 overflow-hidden border-4 border-transparent hover:border-blue-500/30 h-[300px] md:h-[350px]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10 w-full h-full flex items-center justify-center">
                  <img 
                    src="/images/uspi.png" 
                    alt="USPI WORK" 
                    className="w-full h-full object-contain mix-blend-multiply"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="hidden flex-col items-center gap-4 text-blue-600">
                    <Globe size={64} />
                    <span className="text-4xl font-black tracking-widest">USPI WORK</span>
                  </div>
                </div>
              </button>
            </div>

            <div className="pt-16 text-center">
              <button 
                onClick={onLogoutDevice}
                className="px-6 py-3 text-stone-500 hover:text-stone-300 transition-colors text-sm font-bold flex items-center gap-2 mx-auto bg-stone-800/50 rounded-full hover:bg-stone-800"
              >
                <LogOut size={16} />
                Wyloguj urządzenie
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="rfid-scan"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md flex flex-col items-center"
          >
            <button
              onClick={() => setSelectedCompany(null)}
              className="absolute top-8 left-8 text-stone-400 hover:text-white flex items-center gap-2 font-bold transition-colors bg-stone-800/50 px-4 py-2 rounded-full hover:bg-stone-800"
            >
              <ArrowLeft size={20} />
              Wróć do wyboru firmy
            </button>

            <input 
              ref={inputRef}
              type="password"
              value={rfidInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="absolute opacity-0 pointer-events-none"
              autoFocus
            />

            <div className="text-center space-y-8 w-full">
              <div className="relative">
                <motion.div 
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto border-4 ${
                    selectedCompany === 'ERPLAST' 
                      ? 'bg-red-500/20 border-red-500/30' 
                      : 'bg-blue-500/20 border-blue-500/30'
                  }`}
                >
                  <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg ${
                    selectedCompany === 'ERPLAST'
                      ? 'bg-red-600 shadow-red-500/40'
                      : 'bg-blue-600 shadow-blue-500/40'
                  }`}>
                    <UserIcon size={40} className="text-white" />
                  </div>
                </motion.div>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-12 left-0 right-0 text-red-400 font-bold flex items-center justify-center gap-2"
                  >
                    <AlertCircle size={18} />
                    Nieznana karta
                  </motion.div>
                )}
              </div>

              <div className="space-y-3">
                <div className="inline-block px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase mb-2 border border-stone-700 text-stone-300">
                  Wybrano: {selectedCompany}
                </div>
                <h1 className="text-4xl font-black tracking-tight">Przyłóż kartę</h1>
                <p className="text-stone-400 font-medium">System oczekuje na identyfikację pracownika</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedCompany && rfidInput.length > 0 && (
        <div className="absolute bottom-10 left-0 right-0 text-center text-[10px] text-stone-700 font-mono">
          Przetwarzanie...
        </div>
      )}
    </div>
  );
}