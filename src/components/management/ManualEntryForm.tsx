import React, { useState, useEffect } from 'react';
import { UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';

import { ProductionOrder, Employee, ASSORTMENT_CATEGORIES } from '../../types';
import { cn } from '../../utils/firestore-helpers';
import { SearchableSelect } from '../common/SearchableSelect';
import { collection, query, where, or, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

export function ManualEntryForm({ 
  orders, 
  employees, 
  onSubmit 
}: { 
  orders: ProductionOrder[], 
  employees: Employee[], 
  onSubmit: (data: { 
    orderId: string | null, 
    userId: string, 
    hours: number, 
    quantity: number, 
    startTime: Date, 
    endTime: Date, 
    assortmentCategory: string,
    order?: ProductionOrder | null
  }) => Promise<void> 
}) {
  const [orderId, setOrderId] = useState('');
  const [userId, setUserId] = useState('');
  const [entryMode, setEntryMode] = useState<'duration' | 'range'>('duration');
  const [hours, setHours] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('07:00');
  const [endTime, setEndTime] = useState<string>('15:00');
  const [quantity, setQuantity] = useState<string>('');
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [assortmentCategory, setAssortmentCategory] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // DODANO: Hybrydowe wyszukiwanie w archiwum
  const [archivedOrders, setArchivedOrders] = useState<ProductionOrder[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);

  // Połączone listy do wyboru
  const availableOrders = [...orders, ...archivedOrders];
  const selectedOrder = availableOrders.find(o => o.id === orderId);

  const handleOrderSearch = async (term: string) => {
    if (term.length === 6) {
      setIsSearchingArchive(true);
      try {
        const q = query(
          collection(db, 'orders'),
          or(
            where('orderNumber', '==', term),
            where('erpOrderNumber', '==', term)
          )
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const found = snap.docs.map(d => ({ ...d.data(), id: d.id })) as ProductionOrder[];
          // Unikaj duplikowania tych, które już są w props.orders
          const news = found.filter(f => !orders.find(o => o.id === f.id));
          setArchivedOrders(prev => {
            const combined = [...prev, ...news];
            // Unikalność po ID
            return Array.from(new Map(combined.map(item => [item.id, item])).values());
          });
        }
      } catch (e) {
        console.error("Error searching archive:", e);
      } finally {
        setIsSearchingArchive(false);
      }
    }
  };

  useEffect(() => {
    if (selectedOrder?.assortmentCategory) {
      setAssortmentCategory(selectedOrder.assortmentCategory);
    }
  }, [orderId, selectedOrder]);

  const calculateHoursFromRange = () => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // Handle overnight if needed, though usually not for manual entry
    
    return diffMinutes / 60;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalHours = 0;
    let finalStartTime: Date;
    let finalEndTime: Date;

    const [year, month, day] = date.split('-').map(Number);

    if (entryMode === 'duration') {
      finalHours = parseFloat(hours);
      if (isNaN(finalHours) || finalHours <= 0) return;
      
      // Tworzymy datę jawnie w czasie lokalnym (godzina 07:00 rano)
      // Miesiące w JS są od 0 do 11, dlatego month - 1
      finalStartTime = new Date(year, month - 1, day, 7, 0, 0);
      finalEndTime = new Date(finalStartTime.getTime() + finalHours * 3600 * 1000);
    } else {
      finalHours = calculateHoursFromRange();
      if (finalHours <= 0) return;

      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      
      // Tworzymy daty startu i końca w czasie lokalnym
      finalStartTime = new Date(year, month - 1, day, startH, startM, 0);
      finalEndTime = new Date(year, month - 1, day, endH, endM, 0);
      
      if (finalEndTime < finalStartTime) {
        finalEndTime.setDate(finalEndTime.getDate() + 1);
      }
    }

    if (!userId) return;
    
    setIsSubmitting(true);
    await onSubmit({
      orderId: orderId || null,
      order: selectedOrder || null,
      userId,
      hours: finalHours,
      quantity: quantity ? parseFloat(quantity) : 0,
      startTime: finalStartTime,
      endTime: finalEndTime,
      assortmentCategory
    });
    setIsSubmitting(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto w-full"
    >
      <div className="bg-white rounded-3xl shadow-xl p-8 border border-stone-100">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
            <UserPlus size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-stone-900">Ręczny wpis pracy</h2>
            <p className="text-stone-500 text-sm">Dodaj czas pracy pracownika do zlecenia (pojedynczy wpis).</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                Data pracy
              </label>
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                Kategoria asortymentowa
              </label>
              <select 
                value={assortmentCategory}
                onChange={(e) => setAssortmentCategory(e.target.value)}
                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                required
              >
                <option value="">Wybierz kategorię...</option>
                {ASSORTMENT_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <SearchableSelect 
            label="Pracownik"
            placeholder="Wybierz pracownika..."
            options={employees}
            value={userId}
            onChange={setUserId}
            getLabel={(e) => `${e.lastName} ${e.firstName} [${e.employeeNumber}] ${e.group ? `(${e.group})` : ''}`}
            getSearchValue={(e) => `${e.firstName} ${e.lastName} ${e.employeeNumber} ${e.group}`}
          />

          <SearchableSelect 
            label="Zlecenie produkcyjne"
            placeholder={isSearchingArchive ? "Szukanie w archiwum..." : "Wybierz zlecenie (wpisz 6 cyfr dla archiwum)..."}
            options={availableOrders}
            value={orderId}
            onChange={setOrderId}
            onInputChange={handleOrderSearch}
            optional
            getLabel={(o) => `${o.orderNumber} - ${o.productName}${o.status === 'completed' ? ' (ZAKOŃCZONE)' : ''}`}
            getSearchValue={(o) => `${o.orderNumber} ${o.productName} ${o.erpOrderNumber || ''} ${o.articleNumber || ''}`}
          />

          <div className="space-y-4 pt-2">
            <div className="flex p-1 bg-stone-100 rounded-xl">
              <button
                type="button"
                onClick={() => setEntryMode('duration')}
                className={cn(
                  "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                  entryMode === 'duration' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                Liczba godzin
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('range')}
                className={cn(
                  "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                  entryMode === 'range' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                Zakres godzin (od-do)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {entryMode === 'duration' ? (
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                    Liczba godzin
                  </label>
                  <input 
                    type="number" 
                    step="0.1"
                    min="0"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder="np. 4.5"
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    required={entryMode === 'duration'}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                      Od godziny
                    </label>
                    <input 
                      type="time" 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      required={entryMode === 'range'}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                      Do godziny
                    </label>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      required={entryMode === 'range'}
                    />
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                      Suma: {calculateHoursFromRange().toFixed(2)} h
                    </span>
                  </div>
                </>
              )}
              
              <div className={cn("space-y-2", entryMode === 'duration' ? "col-span-2 sm:col-span-1" : "col-span-2")}>
                <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                  Wykonana ilość ({selectedOrder?.unit || 'szt'}) <span className="lowercase font-normal opacity-60">(opcjonalnie)</span>
                </label>
                <input 
                  type="number" 
                  step="1"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="np. 100"
                  className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {isSubmitting ? 'Zapisywanie...' : 'Zapisz wpis pracy'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}