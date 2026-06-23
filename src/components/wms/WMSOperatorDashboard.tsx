import React, { useState } from 'react';
import { PackageMinus, RotateCcw, ClipboardCheck, ArrowLeft, ArchiveX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Widoki WMS
import { MaterialWithdrawalView } from './MaterialWithdrawalView';
import { MaterialReturnsView } from './MaterialReturnsView';
import { InventoryYardView } from './InventoryYardView';

import { Employee, UserProfile } from '../../types';

interface WMSOperatorDashboardProps {
  user: any;
  profile: UserProfile | null;
  currentOperator: Employee;
  onLogout: () => void;
  onBackToOperator: () => void;
}

export function WMSOperatorDashboard({
  user,
  profile,
  currentOperator,
  onLogout,
  onBackToOperator
}: WMSOperatorDashboardProps) {
  const [view, setView] = useState<'wms-wip' | 'wms-returns' | 'wms-inventory' | null>(null);

  const currentUser = currentOperator?.displayName || profile?.displayName || user?.displayName || 'Nieznany Pracownik';

  return (
    <div className="min-h-screen bg-stone-50 flex items-stretch justify-center">
      <div className="w-full max-w-[1400px] flex flex-col p-4 md:p-6">
        
        {/* NAGŁÓWEK WMS OPERATOR */}
        <header className="bg-white rounded-[2rem] shadow-sm border border-stone-100 p-4 mb-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={view ? () => setView(null) : onBackToOperator}
              className="p-3 hover:bg-stone-100 rounded-xl transition-colors text-stone-600 flex items-center justify-center"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black text-stone-900 leading-tight">Panel Magazynu</h1>
              <p className="text-sm font-bold text-stone-500">{currentUser}</p>
            </div>
          </div>
        </header>

        {/* GŁÓWNA ZAWARTOŚĆ */}
        <main className="flex-1 bg-white rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {!view ? (
              <motion.div 
                key="menu"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full flex flex-col items-center justify-center p-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl w-full">
                  
                  {/* POBRANIA */}
                  <button 
                    onClick={() => setView('wms-wip')}
                    className="group bg-blue-50 border-2 border-blue-100 hover:border-blue-500 rounded-[2rem] p-8 text-left transition-all hover:shadow-xl flex flex-col"
                  >
                    <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-blue-200">
                      <PackageMinus size={32} />
                    </div>
                    <h2 className="text-2xl font-black text-blue-900 mb-2">Pobrania Materiałów</h2>
                    <p className="text-blue-700 font-medium leading-relaxed">
                      Wydawanie materiałów na produkcję, skanowanie kodów kreskowych, odliczanie stanu.
                    </p>
                  </button>

                  {/* ZWROTY */}
                  <button 
                    onClick={() => setView('wms-returns')}
                    className="group bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-500 rounded-[2rem] p-8 text-left transition-all hover:shadow-xl flex flex-col"
                  >
                    <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-indigo-200">
                      <RotateCcw size={32} />
                    </div>
                    <h2 className="text-2xl font-black text-indigo-900 mb-2">Zwroty Materiałów</h2>
                    <p className="text-indigo-700 font-medium leading-relaxed">
                      Zwracanie niewykorzystanych końcówek profili i resztek materiałowych.
                    </p>
                  </button>

                  {/* INWENTARYZACJA */}
                  <button 
                    onClick={() => setView('wms-inventory')}
                    className="group bg-emerald-50 border-2 border-emerald-100 hover:border-emerald-500 rounded-[2rem] p-8 text-left transition-all hover:shadow-xl flex flex-col"
                  >
                    <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-emerald-200">
                      <ClipboardCheck size={32} />
                    </div>
                    <h2 className="text-2xl font-black text-emerald-900 mb-2">Stan placu</h2>
                    <p className="text-emerald-700 font-medium leading-relaxed">
                      Fizyczne raportowanie rzeczywistych stanów magazynowych na placu.
                    </p>
                  </button>

                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="module"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: 20 }}
                className="h-full overflow-y-auto"
              >
                {view === 'wms-wip' && <MaterialWithdrawalView currentUser={currentUser} />}
                {view === 'wms-returns' && <MaterialReturnsView currentUser={currentUser} />}
                {view === 'wms-inventory' && <InventoryYardView />}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
