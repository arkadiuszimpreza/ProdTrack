import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, AlertCircle, CheckSquare, Square, CheckCircle, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { PurchaseOrderItem } from '../../types';
import { calculateDeliveryStatus } from '../../utils/deliveryStatus';
import { cn } from '../../utils/firestore-helpers';

import { ForceCloseSummaryModal } from './ForceCloseSummaryModal';

interface ExpectedDeliveriesAdminViewProps {
  currentUser?: string;
}

export function ExpectedDeliveriesAdminView({ currentUser }: ExpectedDeliveriesAdminViewProps) {
  const [deliveries, setDeliveries] = useState<PurchaseOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [activeMainStatuses, setActiveMainStatuses] = useState<string[]>([]);
  const [activeSubStatuses, setActiveSubStatuses] = useState<string[]>([]);
  const [activeErpStatuses, setActiveErpStatuses] = useState<string[]>([]);

  type SortKey = keyof PurchaseOrderItem | 'mainStatus' | 'subStatus';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSavingBatches, setIsSavingBatches] = useState(false);

  // Fetch data
  useEffect(() => {
    const q = query(collection(db, 'expectedDeliveries'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PurchaseOrderItem));
      setDeliveries(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Błąd pobierania dostaw:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute status for all items
  const itemsWithStatus = useMemo(() => {
    return deliveries.map(item => ({
      ...item,
      ...calculateDeliveryStatus(item)
    }));
  }, [deliveries]);

  // Extract all unique statuses for the filters
  const { allMainStatuses, allSubStatuses, allErpStatuses } = useMemo(() => {
    const main = new Set<string>();
    const sub = new Set<string>();
    const erp = new Set<string>();
    itemsWithStatus.forEach(item => {
      main.add(item.mainStatus);
      sub.add(item.subStatus);
      if (item.erpStatus && item.erpStatus.trim()) {
        erp.add(item.erpStatus.trim());
      } else {
        erp.add('Brak statusu');
      }
    });
    return {
      allMainStatuses: Array.from(main).sort(),
      allSubStatuses: Array.from(sub).sort(),
      allErpStatuses: Array.from(erp).sort()
    };
  }, [itemsWithStatus]);

  // Initialize active filters once they are available
  useEffect(() => {
    if (activeMainStatuses.length === 0 && allMainStatuses.length > 0) {
      setActiveMainStatuses(allMainStatuses);
    }
    if (activeSubStatuses.length === 0 && allSubStatuses.length > 0) {
      setActiveSubStatuses(allSubStatuses);
    }
    if (activeErpStatuses.length === 0 && allErpStatuses.length > 0) {
      setActiveErpStatuses(allErpStatuses);
    }
  }, [allMainStatuses, allSubStatuses, allErpStatuses]);

  // Filter items based on search and toggles
  const filteredItems = useMemo(() => {
    return itemsWithStatus.filter(item => {
      // 1. Search text (nie filtrujemy tekstu po statusie)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          (item.purchaseOrderNumber || '').toLowerCase().includes(term) ||
          (item.articleName || '').toLowerCase().includes(term) ||
          (item.articleNumber || '').toLowerCase().includes(term) ||
          (item.supplierName || '').toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }

      // 2. Main Status match
      if (activeMainStatuses.length > 0 && !activeMainStatuses.includes(item.mainStatus)) {
        return false;
      }

      // 3. Sub Status match
      if (activeSubStatuses.length > 0 && !activeSubStatuses.includes(item.subStatus)) {
        return false;
      }

      // 4. ERP Status match
      if (allErpStatuses.length > 0) {
        const itemErp = (item.erpStatus && item.erpStatus.trim()) ? item.erpStatus.trim() : 'Brak statusu';
        if (!activeErpStatuses.includes(itemErp)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortConfig) {
        const valA = (a as any)[sortConfig.key];
        const valB = (b as any)[sortConfig.key];

        if (valA === valB) return 0;
        
        if (valA === undefined || valA === null) return sortConfig.direction === 'asc' ? 1 : -1;
        if (valB === undefined || valB === null) return sortConfig.direction === 'asc' ? -1 : 1;

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortConfig.direction === 'asc' 
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
           return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }
      }

      // Domyślne sortowanie - po dacie oczekiwanej lub id
      const dateA = a.expectedDeliveryDate || '';
      const dateB = b.expectedDeliveryDate || '';
      if (dateA && dateB) return dateA.localeCompare(dateB);
      return (a.purchaseOrderNumber || '').localeCompare(b.purchaseOrderNumber || '');
    });
  }, [itemsWithStatus, searchTerm, activeMainStatuses, activeSubStatuses, sortConfig]);

  const formatQty = (value: number): string => {
    if (value === undefined || value === null || isNaN(value)) return '0';
    return Number(value.toFixed(3)).toString();
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      const newIds = new Set(filteredItems.map(i => i.id!));
      setSelectedIds(newIds);
    }
  };

  const toggleSelect = (id: string) => {
    const newIds = new Set(selectedIds);
    if (newIds.has(id)) {
      newIds.delete(id);
    } else {
      newIds.add(id);
    }
    setSelectedIds(newIds);
  };

  const toggleMainStatus = (status: string) => {
    setActiveMainStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleSubStatus = (status: string) => {
    setActiveSubStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleErpStatus = (status: string) => {
    setActiveErpStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig?.key === key) {
      return sortConfig.direction === 'asc' 
        ? <ChevronUp size={14} className="text-indigo-600 shrink-0" /> 
        : <ChevronDown size={14} className="text-indigo-600 shrink-0" />;
    }
    return <ArrowUpDown size={14} className="text-stone-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />;
  };

  const handleBulkChangeStatus = () => {
    if (selectedIds.size === 0) return;
    setShowConfirmModal(true);
  };

  const handleConfirmBulkUpdate = async () => {
    if (selectedIds.size === 0) return;
    setIsSavingBatches(true);

    try {
      const batch = writeBatch(db);
      
      selectedIds.forEach(id => {
        const docRef = doc(db, 'expectedDeliveries', id);
        batch.update(docRef, {
          isManuallyCompleted: true,
          lastModifiedAt: serverTimestamp(),
          lastModifiedBy: currentUser || 'Admin'
        });
      });

      await batch.commit();
      setSelectedIds(new Set());
      setShowConfirmModal(false);
    } catch (err) {
      console.error('Błąd bulk update:', err);
      alert('Wystąpił błąd podczas masowej zmiany statusu.');
    } finally {
      setIsSavingBatches(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-400 text-sm font-bold">Ładowanie danych z bazy...</div>;
  }

  return (
    <div className="space-y-4">
      {/* FILTRY */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-4">
        
        {/* Szukajka i Przyciski Akcji */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-stone-400" />
            </div>
            <input
              type="text"
              placeholder="Szukaj (zlecenie, nazwa, indeks, dostawca)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 p-2 w-full border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
          
          <button
            onClick={handleBulkChangeStatus}
            disabled={selectedIds.size === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-all",
              selectedIds.size > 0 
                ? "bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95" 
                : "bg-stone-100 text-stone-400 cursor-not-allowed"
            )}
          >
            <CheckCircle size={16} />
            <span>Oznacz zaznaczone ({selectedIds.size}) jako Dostarczone</span>
          </button>
        </div>

        <hr className="border-stone-100" />

        {/* Toggles Status Główny */}
        <div>
          <h3 className="text-xs font-black text-stone-400 uppercase tracking-wider mb-2">Status Główny</h3>
          <div className="flex flex-wrap gap-2">
            {allMainStatuses.map(status => (
              <button
                key={status}
                onClick={() => toggleMainStatus(status)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold transition-all border",
                  activeMainStatuses.includes(status)
                    ? "bg-stone-800 text-white border-stone-800"
                    : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles Status Pomocniczy */}
        <div>
          <h3 className="text-xs font-black text-stone-400 uppercase tracking-wider mb-2">Status Pomocniczy</h3>
          <div className="flex flex-wrap gap-2">
            {allSubStatuses.map(status => (
              <button
                key={status}
                onClick={() => toggleSubStatus(status)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold transition-all border",
                  activeSubStatuses.includes(status)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles Status ERP */}
        {allErpStatuses.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black text-stone-400 uppercase tracking-wider">Status ERP (z pliku)</h3>
              <div className="flex items-center gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => setActiveErpStatuses(allErpStatuses)}
                  className="text-stone-500 hover:text-stone-800 underline font-semibold cursor-pointer"
                >
                  Wszystkie
                </button>
                <span className="text-stone-300">|</span>
                <button
                  type="button"
                  onClick={() => setActiveErpStatuses([])}
                  className="text-stone-500 hover:text-stone-800 underline font-semibold cursor-pointer"
                >
                  Odznacz
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {allErpStatuses.map(status => {
                const isActive = activeErpStatuses.includes(status);
                const count = itemsWithStatus.filter(i => {
                  const s = (i.erpStatus && i.erpStatus.trim()) ? i.erpStatus.trim() : 'Brak statusu';
                  return s === status;
                }).length;

                return (
                  <button
                    key={status}
                    onClick={() => toggleErpStatus(status)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer shadow-xs",
                      isActive
                        ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                        : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                    )}
                  >
                    <span>{status}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-black",
                      isActive ? "bg-amber-700/60 text-amber-100" : "bg-stone-100 text-stone-600"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* TABELA */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px] md:text-xs">
            <thead>
              <tr className="bg-stone-100/80 text-stone-500 font-black border-b border-stone-200 uppercase tracking-wider">
                <th className="p-0 border-r border-stone-200 text-center w-10">
                  <div className="flex items-center justify-center p-2 cursor-pointer hover:text-indigo-600" onClick={toggleSelectAll}>
                    {selectedIds.size > 0 && selectedIds.size === filteredItems.length ? (
                      <CheckSquare size={16} />
                    ) : (
                      <Square size={16} />
                    )}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 cursor-pointer group hover:bg-stone-200/50 transition-colors" onClick={() => handleSort('purchaseOrderNumber')}>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span>Zlecenie Z.</span>
                    {renderSortIcon('purchaseOrderNumber')}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 cursor-pointer group hover:bg-stone-200/50 transition-colors" onClick={() => handleSort('articleNumber')}>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span>Kod elementu</span>
                    {renderSortIcon('articleNumber')}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 w-1/4 cursor-pointer group hover:bg-stone-200/50 transition-colors" onClick={() => handleSort('articleName')}>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span>Nazwa / Opis</span>
                    {renderSortIcon('articleName')}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 cursor-pointer group hover:bg-stone-200/50 transition-colors" onClick={() => handleSort('supplierName')}>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span>Dostawca</span>
                    {renderSortIcon('supplierName')}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 text-center cursor-pointer group hover:bg-stone-200/50 transition-colors" onClick={() => handleSort('unit')}>
                  <div className="flex items-center justify-between px-2 py-2">
                    <span className="mx-auto">J.m.</span>
                    {renderSortIcon('unit')}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 text-center cursor-pointer group hover:bg-stone-200/50 transition-colors" onClick={() => handleSort('erpStatus')}>
                  <div className="flex items-center justify-between px-2 py-2 w-24">
                    <span className="mx-auto">Status ERP</span>
                    {renderSortIcon('erpStatus')}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 text-center cursor-pointer group hover:bg-stone-200/50 transition-colors" onClick={() => handleSort('mainStatus')}>
                  <div className="flex items-center justify-between px-2 py-2 w-28">
                    <span className="mx-auto">Status WMS</span>
                    {renderSortIcon('mainStatus')}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 text-center bg-indigo-50/50 cursor-pointer group hover:bg-indigo-100/50 transition-colors" onClick={() => handleSort('quantityOrdered')}>
                  <div className="flex items-center justify-between px-2 py-2 w-16">
                    <span className="mx-auto">Zam.</span>
                    {renderSortIcon('quantityOrdered')}
                  </div>
                </th>
                <th className="p-0 border-r border-stone-200 text-center bg-emerald-50/50 cursor-pointer group hover:bg-emerald-100/50 transition-colors" onClick={() => handleSort('quantityDelivered')}>
                  <div className="flex items-center justify-between px-2 py-2 w-16 text-emerald-800">
                    <span className="mx-auto">ERP</span>
                    {renderSortIcon('quantityDelivered')}
                  </div>
                </th>
                <th className="p-0 text-center bg-sky-50/50 cursor-pointer group hover:bg-sky-100/50 transition-colors" onClick={() => handleSort('wmsDeliveredQuantity')}>
                  <div className="flex items-center justify-between px-2 py-2 w-16 text-sky-800">
                    <span className="mx-auto">WMS</span>
                    {renderSortIcon('wmsDeliveredQuantity')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-stone-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle size={32} className="text-stone-300" />
                      <div>
                        <div className="font-bold text-stone-500 text-sm">Brak wyników</div>
                        <div className="text-xs">Nie znaleziono pasujących zamówień do wybranych filtrów</div>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const isSelected = selectedIds.has(item.id!);
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={cn(
                        "border-b border-stone-100 hover:bg-stone-50 transition-colors",
                        isSelected && "bg-indigo-50/30 hover:bg-indigo-50/50"
                      )}
                    >
                      <td className="p-0 border-r border-stone-200 text-center cursor-pointer" onClick={() => toggleSelect(item.id!)}>
                        <div className="flex items-center justify-center py-2 text-stone-400 hover:text-indigo-600">
                          {isSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 border-r border-stone-200 font-bold text-stone-700">{item.purchaseOrderNumber}</td>
                      <td className="px-3 py-1.5 border-r border-stone-200 font-mono text-stone-600 text-[10px]">{item.articleNumber}</td>
                      <td className="px-3 py-1.5 border-r border-stone-200 font-medium text-stone-800 break-words line-clamp-2 max-w-sm" title={item.articleName}>{item.articleName}</td>
                      <td className="px-3 py-1.5 border-r border-stone-200 text-stone-600 max-w-[150px] truncate" title={item.supplierName}>{item.supplierName || '-'}</td>
                      <td className="px-2 py-1.5 border-r border-stone-200 text-center text-stone-500 font-semibold text-[10px]">{item.unit}</td>
                      
                      <td className="px-2 py-1.5 border-r border-stone-200 text-center">
                        {item.erpStatus ? (
                          <button
                            type="button"
                            onClick={() => toggleErpStatus(item.erpStatus!.trim())}
                            title="Kliknij, aby przełączyć filtr dla tego statusu ERP"
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-all cursor-pointer",
                              activeErpStatuses.includes(item.erpStatus.trim())
                                ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                                : "bg-stone-100 text-stone-400 border-stone-200 hover:bg-stone-200 opacity-60"
                            )}
                          >
                            {item.erpStatus}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleErpStatus('Brak statusu')}
                            title="Kliknij, aby przełączyć filtr dla pozycji bez statusu"
                            className="text-stone-300 hover:text-stone-500 text-[10px] cursor-pointer"
                          >
                            -
                          </button>
                        )}
                      </td>

                      <td className="px-2 py-1.5 border-r border-stone-200 text-center">
                        <div className="flex flex-col items-center gap-1 justify-center">
                          <button
                            type="button"
                            onClick={() => toggleMainStatus(item.mainStatus)}
                            title="Kliknij, aby przełączyć filtr dla tego statusu WMS"
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all hover:ring-1 hover:ring-stone-400",
                              item.mainStatus === 'oczekujące' && "bg-stone-200 text-stone-600",
                              item.mainStatus === 'dost. częściowa' && "bg-amber-100 text-amber-700",
                              item.mainStatus === 'dostarczone' && "bg-emerald-100 text-emerald-700"
                            )}
                          >
                            {item.mainStatus}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSubStatus(item.subStatus)}
                            title="Kliknij, aby przełączyć filtr dla tego statusu pomocniczego"
                            className="text-[9px] text-stone-400 hover:text-stone-700 font-medium tracking-tight truncate max-w-[110px] cursor-pointer"
                          >
                            {item.subStatus}
                          </button>
                        </div>
                      </td>
                      
                      <td className="px-2 py-1.5 border-r border-stone-200 text-center bg-indigo-50/10 text-indigo-900 font-bold">
                        {formatQty(item.quantityOrdered || 0)}
                      </td>
                      <td className="px-2 py-1.5 border-r border-stone-200 text-center bg-emerald-50/30 text-emerald-900 font-bold">
                        {formatQty(item.quantityDelivered || 0)}
                      </td>
                      <td className="px-2 py-1.5 text-center bg-sky-50/30 text-sky-900 font-bold">
                        {formatQty(item.wmsDeliveredQuantity || 0)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-stone-50 border-t border-stone-200 p-2 text-right text-xs font-medium text-stone-500">
          Wyświetlono pozycje: {filteredItems.length}
        </div>
      </div>

      {showConfirmModal && (
        <ForceCloseSummaryModal 
          selectedCount={selectedIds.size}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmBulkUpdate}
          isSaving={isSavingBatches}
        />
      )}
    </div>
  );
}
