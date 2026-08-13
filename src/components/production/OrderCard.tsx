import React, { useState } from 'react';
import { Play, Layers, Clock, List, Trash2, ChevronRight, AlertTriangle, CheckCircle, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { Timestamp, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

import { db } from '../../firebase'; 
import { ProductionOrder, ASSORTMENT_CATEGORIES } from '../../types';
import { cn, handleFirestoreError, OperationType } from '../../utils/firestore-helpers';
import { StatusBadge } from '../ui/StatusBadge';

interface OrderCardProps {
  order: ProductionOrder;
  onStart: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onEditElements: () => void;
  onShowLogs?: () => void;
  onShowClientLogs?: () => void;
  isWorking: boolean;
  disabled: boolean;
  isAdmin: boolean;
  activeWorkers: string[];
}

export const OrderCard: React.FC<OrderCardProps> = ({ 
  order, 
  onStart, 
  onDelete, 
  onEditElements, 
  onShowLogs,
  onShowClientLogs,
  isWorking, 
  disabled, 
  isAdmin, 
  activeWorkers 
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // NOWY STAN DO OBSŁUGI MENU
  const [showMenu, setShowMenu] = useState(false);
  
  // TWARDA WALIDACJA TYPÓW
  const appQty = Number(order.appReportedQuantity) || 0;
  const erpQty = order.erpReportedQuantity !== undefined ? Number(order.erpReportedQuantity) : (Number(order.reportedQuantity) || 0);
  const target = Number(order.targetQuantity) || 1;

  // Bezpieczne procenty
  const erpProgress = Math.max(0, Math.min(100, (erpQty / target) * 100)) || 0;
  const appProgress = Math.max(0, Math.min(100 - erpProgress, (appQty / target) * 100)) || 0;
  
  // Sprawdzamy, czy wszystkie elementy wewnętrzne są już w 100% zrobione
  const allElementsCompleted = order.elements && order.elements.length > 0 
    ? order.elements.every(e => (e.reportedQuantity || 0) >= (e.quantity || 1))
    : false;
  
  return (
    <motion.div 
      layout
      className={cn(
        "bg-white rounded-3xl p-6 shadow-sm border border-stone-200 flex flex-col justify-between transition-all relative",
        isWorking && "ring-2 ring-emerald-500 shadow-lg",
        order.status === 'completed' && "bg-stone-50",
        order.status === 'reported' && "bg-amber-50/30 border-amber-200"
      )}
    >
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-30 bg-white/95 rounded-3xl flex flex-col items-center justify-center p-6 text-center">
          <AlertTriangle size={32} className="text-red-500 mb-2" />
          <p className="font-bold text-stone-900 mb-4 text-sm">Czy na pewno chcesz usunąć to zlecenie?</p>
          <div className="flex gap-2 w-full">
            <button 
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2 rounded-xl bg-stone-100 text-stone-600 font-bold text-xs"
            >
              Anuluj
            </button>
            <button 
              onClick={onDelete}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white font-bold text-xs"
            >
              Usuń
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between items-start mb-4 relative">
          <div className="flex flex-col gap-1.5 pr-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200">
                ZP: {order.orderNumber}
              </span>
              {order.erpOrderNumber && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onShowClientLogs) onShowClientLogs();
                  }}
                  title="Kliknij, aby otworzyć podsumowanie dla Zlecenia Klienta"
                  className="text-[10px] font-black uppercase tracking-widest text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Layers size={10} />
                  ZL: {order.erpOrderNumber}
                </button>
              )}
            </div>
            {order.articleNumber && <span className="text-[10px] text-stone-400 font-mono">{order.articleNumber}</span>}
          </div>
          
          <div className="flex items-center gap-2 z-10">
            <StatusBadge status={order.status} />
            
            {isAdmin && (
              <div className="relative">
                <button 
                  onClick={() => setShowMenu(!showMenu)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors border",
                    showMenu ? "bg-stone-100 text-stone-700 border-stone-200" : "text-stone-400 border-transparent hover:bg-stone-50 hover:text-stone-600"
                  )}
                  title="Opcje zlecenia"
                >
                  <Settings size={18} />
                </button>

                {/* NIEWIDZIALNA WARSTWA DO ZAMYKANIA MENU KLIKNIĘCIEM POZA NIM */}
                {showMenu && (
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowMenu(false)}
                  />
                )}

                {/* ROZWIJANE MENU */}
                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1 w-52 bg-white border border-stone-200 shadow-xl rounded-xl overflow-hidden z-20"
                    >
                      <div className="flex flex-col py-1">
                        <button 
                          onClick={() => { setShowMenu(false); if(onShowLogs) onShowLogs(); }} 
                          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-50 hover:text-blue-600 text-left transition-colors"
                        >
                          <Clock size={14} /> Historia meldunków ZP
                        </button>
                        {order.erpOrderNumber && (
                          <button 
                            onClick={() => { setShowMenu(false); if(onShowClientLogs) onShowClientLogs(); }} 
                            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-50 hover:text-purple-600 text-left transition-colors"
                          >
                            <Layers size={14} /> Podsumowanie Zlec. Klienta
                          </button>
                        )}
                        <button 
                          onClick={() => { setShowMenu(false); onEditElements(); }} 
                          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-50 hover:text-emerald-600 text-left transition-colors"
                        >
                          <List size={14} /> Zarządzaj elementami
                        </button>
                        <div className="h-px bg-stone-100 my-1 mx-2" />
                        <button 
                          onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }} 
                          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 text-left transition-colors"
                        >
                          <Trash2 size={14} /> Usuń zlecenie
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
        
        <h3 className="text-lg font-bold mb-1 line-clamp-2">{order.productName}</h3>
        
        {order.status === 'reported' && (
          <div className="text-[11px] font-bold text-amber-600 bg-amber-100/50 px-2 py-1 rounded inline-block mb-2 border border-amber-200/50">
            ⏳ Oczekuje na zatwierdzenie w ERP
          </div>
        )}

        {activeWorkers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeWorkers.map((worker, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                {worker}
              </div>
            ))}
          </div>
        )}
        
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-2 flex items-center gap-1 hover:underline"
        >
          {showDetails ? 'Ukryj szczegóły' : 'Pokaż szczegóły'}
          <ChevronRight size={10} className={cn("transition-transform", showDetails && "rotate-90")} />
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 pt-3 border-t border-stone-100 space-y-2 overflow-hidden"
            >
              {order.clientName && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-400 uppercase">Klient</span>
                  <span className="font-medium text-right">{order.clientName}</span>
                </div>
              )}
              {order.projectNumber && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-400 uppercase">Projekt</span>
                  <span className="font-medium">{order.projectNumber}</span>
                </div>
              )}
              {order.priority && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-400 uppercase">Priorytet</span>
                  <span className="font-medium">{order.priority}</span>
                </div>
              )}
              {order.unit && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-400 uppercase">JM</span>
                  <span className="font-medium">{order.unit}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5 pt-2 border-t border-stone-50 mt-1">
                <span className="text-stone-400 uppercase text-[10px]">Kategoria asortymentowa</span>
                {isAdmin ? (
                  <select 
                    value={order.assortmentCategory || ''}
                    onChange={async (e) => {
                      try {
                        await updateDoc(doc(db, 'orders', order.id), {
                          assortmentCategory: e.target.value || null,
                          lastModifiedAt: serverTimestamp(),
                          lastModifiedBy: 'Admin'
                        });
                      } catch (err) {
                        handleFirestoreError(err, OperationType.UPDATE, 'orders');
                      }
                    }}
                    className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  >
                    <option value="">Nie przypisano</option>
                    {ASSORTMENT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                ) : (
                  <span className="font-medium text-xs">{order.assortmentCategory || 'Brak'}</span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-end text-xs">
            <span className="text-stone-500 pb-1 shrink-0">Wykonano</span>
            
            <div className="flex items-center gap-2 justify-end">
              <div className="flex items-end gap-1 font-bold">
                <div className="flex flex-col items-center">
                  <span className="text-[8px] uppercase font-black tracking-widest text-emerald-500/70 mb-0.5">APP</span>
                  <span className="text-emerald-500 text-sm leading-none" title="Zaraportowane na Hali">
                    {appQty % 1 === 0 ? appQty : appQty.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                
                <span className="text-stone-300 pb-[1px] leading-none px-0.5">/</span>
                
                <div className="flex flex-col items-center">
                  <span className="text-[8px] uppercase font-black tracking-widest text-emerald-700/60 mb-0.5">ERP</span>
                  <span className="text-emerald-700 text-sm leading-none" title="Potwierdzone w ERP">{erpQty}</span>
                </div>
                
                <span className="text-stone-300 pb-[1px] leading-none px-0.5">z</span>
                
                <div className="flex flex-col items-center">
                  <span className="text-[8px] uppercase font-black tracking-widest text-stone-400 mb-0.5">CEL</span>
                  <span className="text-stone-600 text-sm leading-none whitespace-nowrap">
                    {target} <span className="text-[10px] font-normal text-stone-400">{order.unit}</span>
                  </span>
                </div>
              </div>
              
              {erpQty >= target && (
                <div className="flex flex-col items-center justify-center bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 shrink-0">
                  <span className="text-[8px] text-emerald-600 font-black uppercase tracking-widest leading-[1.2]">ilość</span>
                  <span className="text-[8px] text-emerald-600 font-black uppercase tracking-widest leading-[1.2]">osiągnięta</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="h-2 bg-stone-100 rounded-full overflow-hidden flex w-full">
            <div 
              className={cn("h-full transition-all duration-500 ease-out", order.status === 'completed' ? "bg-stone-400" : "bg-emerald-600")}
              style={{ width: `${erpProgress}%` }}
              title={`Z ERP: ${erpQty}`}
            />
            <div 
              className="h-full bg-emerald-400 transition-all duration-500 ease-out opacity-80"
              style={{ width: `${appProgress}%` }}
              title={`Z Hali: ${appQty}`}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 z-0">
        <button 
          onClick={onStart}
          disabled={disabled || isWorking || allElementsCompleted}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold transition-all active:scale-95",
            isWorking 
              ? "bg-emerald-100 text-emerald-700 cursor-default" 
              : allElementsCompleted
                ? "bg-stone-100 text-stone-400 cursor-not-allowed border border-stone-200"
                : "bg-stone-900 text-white hover:bg-stone-800 shadow-md hover:shadow-lg disabled:opacity-30 disabled:cursor-not-allowed"
          )}
        >
          {isWorking ? (
            <>
              <Clock size={18} className="animate-pulse" />
              W trakcie pracy...
            </>
          ) : allElementsCompleted ? (
            <>
              <CheckCircle size={18} />
              Wszystkie elementy gotowe
            </>
          ) : (
            <>
              <Play size={18} fill="currentColor" />
              Zacznij pracę
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}