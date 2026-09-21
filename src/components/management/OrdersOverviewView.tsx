import React, { useState, useMemo } from 'react';
import { ProductionOrder } from '../../types';
import { Search, ChevronDown, ChevronUp, ChevronsUpDown, Package, CheckCircle2, Circle } from 'lucide-react';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';
import { cn } from '../../utils/firestore-helpers';
import { StatusBadge } from '../ui/StatusBadge';

interface OrdersOverviewViewProps {
  orders: ProductionOrder[];
}

type SortConfig = {
  key: keyof ProductionOrder | 'erpStatus' | 'positionNumber' | '';
  direction: 'asc' | 'desc';
};

const SYSTEM_STATUSES = [
  { id: 'pending', label: 'Oczekujące', activeClass: 'bg-stone-900 text-white border-stone-900', inactiveClass: 'bg-white text-stone-500 border-stone-200 hover:border-stone-300' },
  { id: 'in-progress', label: 'W toku', activeClass: 'bg-blue-600 text-white border-blue-600', inactiveClass: 'bg-white text-stone-500 border-stone-200 hover:border-blue-300' },
  { id: 'reported', label: 'Zameldowane', activeClass: 'bg-orange-500 text-white border-orange-500', inactiveClass: 'bg-white text-stone-500 border-stone-200 hover:border-orange-300' },
  { id: 'completed', label: 'Zakończone', activeClass: 'bg-emerald-600 text-white border-emerald-600', inactiveClass: 'bg-white text-stone-500 border-stone-200 hover:border-emerald-300' },
];

export function OrdersOverviewView({ orders }: OrdersOverviewViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSystemStatuses, setActiveSystemStatuses] = useState<string[]>(['pending', 'in-progress', 'reported']);
  const [activeErpStatuses, setActiveErpStatuses] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });

  // Pobieranie unikalnych wartości dla statusów z ERP
  const uniqueErpStatuses = useMemo(() => {
    const statuses = new Set<string>();
    orders.forEach(o => {
      if (o.erpStatus) statuses.add(o.erpStatus);
    });
    return Array.from(statuses).sort();
  }, [orders]);

  // Ustawienie domyślnych statusów ERP na starcie (wybierz wszystkie)
  React.useEffect(() => {
    if (uniqueErpStatuses.length > 0 && activeErpStatuses.length === 0) {
      setActiveErpStatuses([...uniqueErpStatuses, 'EMPTY']);
    }
  }, [uniqueErpStatuses]);

  const filteredAndSortedOrders = useMemo(() => {
    const terms = parseSearchTerms(searchTerm);
    
    let result = orders.filter(order => {
      // Filtr po Statusie Systemowym
      if (activeSystemStatuses.length > 0 && !activeSystemStatuses.includes(order.status)) {
        return false;
      }
      
      // Filtr po Statusie ERP
      if (activeErpStatuses.length > 0) {
        const orderErpStatus = order.erpStatus || 'EMPTY';
        if (!activeErpStatuses.includes(orderErpStatus)) {
          return false;
        }
      }

      // Wyszukiwanie tekstu
      if (terms.length > 0) {
        const searchableText = [
          order.orderNumber,
          order.erpOrderNumber,
          order.productName,
          order.projectNumber,
          order.articleNumber,
          order.clientName,
          order.erpStatus,
          order.positionNumber
        ].filter(Boolean).join(' ').toLowerCase();

        if (!matchesAllTerms(searchableText, terms)) return false;
      }

      return true;
    });

    // Sortowanie
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key as keyof ProductionOrder];
        let bValue = b[sortConfig.key as keyof ProductionOrder];

        if (aValue === undefined || aValue === null) aValue = '';
        if (bValue === undefined || bValue === null) bValue = '';

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [orders, searchTerm, activeSystemStatuses, activeErpStatuses, sortConfig]);

  const handleSort = (key: keyof ProductionOrder | 'erpStatus' | 'positionNumber') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ChevronsUpDown size={14} className="text-stone-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-emerald-500 ml-1" /> : <ChevronDown size={14} className="text-emerald-500 ml-1" />;
  };

  const toggleSystemStatus = (statusId: string) => {
    setActiveSystemStatuses(prev => 
      prev.includes(statusId) ? prev.filter(id => id !== statusId) : [...prev, statusId]
    );
  };

  const toggleErpStatus = (status: string) => {
    setActiveErpStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-xl font-black text-stone-800 tracking-tight flex items-center gap-2">
            <Package className="text-emerald-600" />
            Przegląd Zleceń Produkcyjnych
            <span className="text-sm font-medium text-stone-400 ml-2">({filteredAndSortedOrders.length})</span>
          </h1>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <input 
              type="text" 
              placeholder="Szukaj (np. znak*c05)..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium" 
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-3 border-t border-stone-100">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest shrink-0">Status Sys:</span>
            <div className="flex flex-wrap gap-2">
              {SYSTEM_STATUSES.map(status => {
                const isActive = activeSystemStatuses.includes(status.id);
                return (
                  <button
                    key={status.id}
                    onClick={() => toggleSystemStatus(status.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all active:scale-95",
                      isActive ? status.activeClass : status.inactiveClass
                    )}
                  >
                    {isActive ? <CheckCircle2 size={16} /> : <Circle size={16} className="opacity-40" />}
                    {status.label}
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest shrink-0">Status ERP:</span>
            <div className="flex flex-wrap gap-2">
              {['EMPTY', ...uniqueErpStatuses].map(status => {
                const isActive = activeErpStatuses.includes(status);
                const label = status === 'EMPTY' ? 'Brak statusu' : status;
                return (
                  <button
                    key={status}
                    onClick={() => toggleErpStatus(status)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all active:scale-95",
                      isActive 
                        ? "bg-stone-700 text-white border-stone-700" 
                        : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                    )}
                  >
                    {isActive ? <CheckCircle2 size={16} /> : <Circle size={16} className="opacity-40" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-stone-50/80 text-stone-500 text-xs uppercase tracking-wider font-bold border-b border-stone-200">
              <tr>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('orderNumber')}>
                  <div className="flex items-center">ZP-nr {renderSortIcon('orderNumber')}</div>
                </th>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('erpOrderNumber')}>
                  <div className="flex items-center">Zlecenie ERP {renderSortIcon('erpOrderNumber')}</div>
                </th>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('articleNumber')}>
                  <div className="flex items-center">Artykuł-nr {renderSortIcon('articleNumber')}</div>
                </th>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('productName')}>
                  <div className="flex items-center">Nazwa {renderSortIcon('productName')}</div>
                </th>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('positionNumber')}>
                  <div className="flex items-center">Poz.-nr {renderSortIcon('positionNumber')}</div>
                </th>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('targetQuantity')}>
                  <div className="flex items-center justify-end">Ilość Plan. {renderSortIcon('targetQuantity')}</div>
                </th>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('erpReportedQuantity')}>
                  <div className="flex items-center justify-end">Ilość Wykon. {renderSortIcon('erpReportedQuantity')}</div>
                </th>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('erpStatus')}>
                  <div className="flex items-center">Status ERP {renderSortIcon('erpStatus')}</div>
                </th>
                <th className="p-3 sticky top-0 bg-stone-50/80 cursor-pointer group hover:bg-stone-100 transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center">Status Sys. {renderSortIcon('status')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredAndSortedOrders.length > 0 ? (
                filteredAndSortedOrders.map(order => (
                  <tr key={order.id} className="hover:bg-stone-50/50 transition-colors group">
                    <td className="p-3 text-sm font-bold text-stone-800 whitespace-nowrap">
                      {order.orderNumber}
                    </td>
                    <td className="p-3 text-sm text-stone-600 whitespace-nowrap">
                      {order.erpOrderNumber || '-'}
                    </td>
                    <td className="p-3 text-sm text-stone-600 whitespace-nowrap">
                      {order.articleNumber || '-'}
                    </td>
                    <td className="p-3 text-sm font-medium text-stone-900 max-w-[300px] truncate" title={order.productName}>
                      {order.productName}
                    </td>
                    <td className="p-3 text-sm text-stone-600 whitespace-nowrap font-mono">
                      {order.positionNumber || '-'}
                    </td>
                    <td className="p-3 text-sm text-right font-medium text-stone-900">
                      {order.targetQuantity} {order.unit || 'szt'}
                    </td>
                    <td className="p-3 text-sm text-right font-medium text-emerald-700">
                      {(order.erpReportedQuantity !== undefined ? order.erpReportedQuantity : order.reportedQuantity) || 0}
                    </td>
                    <td className="p-3 text-sm text-stone-700">
                      {order.erpStatus ? (
                        <span className="px-2 py-1 bg-stone-100 text-stone-700 rounded-md border border-stone-200 text-xs font-semibold whitespace-nowrap">
                          {order.erpStatus}
                        </span>
                      ) : (
                        <span className="text-stone-300">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-stone-500 font-medium">
                    Brak zleceń spełniających kryteria wyszukiwania.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
