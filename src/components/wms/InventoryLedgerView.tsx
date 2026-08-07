import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { InventoryTransaction, InventoryTransactionType } from '../../types';
import { Search, FileSpreadsheet, Layers, ArrowUpRight, ArrowDownLeft, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../../utils/firestore-helpers';

interface Props {
  currentUser?: string;
  onOpenBOModal?: () => void;
}

export function InventoryLedgerView({ currentUser = 'Zalogowany Pracownik', onOpenBOModal }: Props) {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'PL' | 'FA' | 'SR';
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<InventoryTransaction | null>(null);

  // Mapy do wyznaczania jednostkowej ceny i wartości w PLN dla transakcji
  const [batchesMap, setBatchesMap] = useState<Map<string, { unitPrice?: number; sourcePurchaseOrderId?: string; articleNumber?: string; batchNumber?: string; articleName?: string }>>(new Map());
  const [poPricesMap, setPoPricesMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const q = query(
      collection(db, 'inventoryTransactions'),
      orderBy('createdAt', 'desc'),
      limit(1000)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as InventoryTransaction));
      setTransactions(list);
      setLoading(false);
    }, (err) => {
      console.error("Błąd podczas pobierania transakcji magazynowych:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Pobieranie map cen z wsadów i oczekiwanych dostaw
  useEffect(() => {
    const unsubBatches = onSnapshot(collection(db, 'inventoryBatches'), (snap) => {
      const bMap = new Map();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const price = data.unitPrice ?? (data.totalValue && data.numericQuantity ? data.totalValue / data.numericQuantity : undefined);
        const info = {
          unitPrice: price,
          sourcePurchaseOrderId: data.sourcePurchaseOrderId,
          articleNumber: data.articleNumber,
          batchNumber: data.batchNumber,
          articleName: data.articleName
        };
        bMap.set(docSnap.id, info);
        if (data.batchNumber) {
          bMap.set(data.batchNumber, info);
        }
      });
      setBatchesMap(bMap);
    }, (err) => console.error("Błąd pobierania wsadów dla cen:", err));

    const unsubPo = onSnapshot(collection(db, 'expectedDeliveries'), (snap) => {
      const pMap = new Map();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.unitPrice !== undefined && data.unitPrice > 0) {
          pMap.set(docSnap.id, data.unitPrice);
          if (data.purchaseOrderNumber && data.articleNumber) {
            pMap.set(`${data.purchaseOrderNumber}_${data.articleNumber}`, data.unitPrice);
          }
        }
      });
      setPoPricesMap(pMap);
    }, (err) => console.error("Błąd pobierania dostaw dla cen:", err));

    return () => {
      unsubBatches();
      unsubPo();
    };
  }, []);

  // Funkcja wyznaczająca cenę jednostkową transakcji (z priorytetem najnowszych cen z ERP)
  const getTxUnitPrice = (t: InventoryTransaction): number => {
    const batchInfo = batchesMap.get(t.batchId) || batchesMap.get(t.batchNumber);
    const poId = t.sourcePurchaseOrderId || batchInfo?.sourcePurchaseOrderId;
    
    // 1. Priorytet 1: Najświeższa zaktualizowana cena z tabeli Oczekiwanych Dostaw ERP po ID pozycji zamówienia
    if (poId && poPricesMap.has(poId)) {
      const p = poPricesMap.get(poId);
      if (p !== undefined && p > 0) return p;
    }

    // 2. Priorytet 2: Najświeższa cena z ERP po kombinacji (numer zamówienia + indeks artykułu)
    const poNum = t.purchaseOrderNumber || t.orderNumber;
    const artNum = t.articleNumber || batchInfo?.articleNumber;
    if (poNum && artNum && poPricesMap.has(`${poNum}_${artNum}`)) {
      const p = poPricesMap.get(`${poNum}_${artNum}`);
      if (p !== undefined && p > 0) return p;
    }

    // 3. Priorytet 3: Cena zapisana w transakcji
    if (t.unitPrice !== undefined && t.unitPrice > 0) return t.unitPrice;

    // 4. Priorytet 4: Cena z wsadu magazynowego
    if (batchInfo?.unitPrice && batchInfo.unitPrice > 0) return batchInfo.unitPrice;

    return 0;
  };

  // Funkcja wyznaczająca bezwzględną wartość transakcji w PLN
  const getTxTotalValue = (t: InventoryTransaction): number => {
    const price = getTxUnitPrice(t);
    if (price > 0) {
      return Number((t.quantity * price).toFixed(2));
    }
    if (t.totalValue !== undefined && t.totalValue > 0) return t.totalValue;
    return 0;
  };

  // Formatowanie kwoty pieniężnej w PLN (np. +12 345,67 zł lub -1 200,00 zł)
  const formatPLN = (amount: number, withSign = false): string => {
    const absVal = Math.abs(amount);
    const formatted = absVal.toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    let prefix = '';
    if (withSign) {
      prefix = amount >= 0 ? '+' : '-';
    } else if (amount < 0) {
      prefix = '-';
    }
    return `${prefix}${formatted} zł`;
  };

  // Helpery do detekcji grupy materiałowej (RU, PR, BL, PL, FA, SR)
  const guessPrefix = (name: string): string => {
    const n = (name || '').toLowerCase();
    if (n.includes('rura')) return 'RU';
    if (n.includes('płyta') || n.includes('plyta')) return 'PL';
    if (n.includes('blacha')) return 'BL';
    if (n.includes('profil') || n.includes('pręt') || n.includes('ceownik')) return 'PR';
    if (n.includes('farba') || n.includes('proszek')) return 'FA';
    if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
    return 'INNE';
  };

  const getTxMaterialType = (t: InventoryTransaction, batchInfo?: { batchNumber?: string; articleName?: string; articleNumber?: string }) => {
    const artName = t.articleName || batchInfo?.articleName || '';
    const fromName = guessPrefix(artName);
    if (fromName === 'PL') return 'PL';

    const batchNum = (t.batchNumber || batchInfo?.batchNumber || '').trim();
    if (batchNum.length >= 4) {
      const pfx = batchNum.slice(2, 4).toUpperCase();
      if (['RU', 'PR', 'BL', 'PL', 'FA', 'SR'].includes(pfx)) return pfx;
    }

    if (fromName !== 'INNE') return fromName;

    const upperBatch = batchNum.toUpperCase();
    if (upperBatch.includes('-RU-') || upperBatch.includes('RU')) return 'RU';
    if (upperBatch.includes('-PR-') || upperBatch.includes('PR')) return 'PR';
    if (upperBatch.includes('-BL-') || upperBatch.includes('BL')) return 'BL';
    if (upperBatch.includes('-FA-') || upperBatch.includes('FA')) return 'FA';
    if (upperBatch.includes('-SR-') || upperBatch.includes('SR')) return 'SR';

    return 'INNE';
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;

      if (materialFilter !== 'ALL') {
        const bInfo = batchesMap.get(t.batchId) || batchesMap.get(t.batchNumber);
        const matType = getTxMaterialType(t, bInfo);
        if (matType !== materialFilter) return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesNumber = (t.transactionNumber || '').toLowerCase().includes(term);
        const matchesBatch = (t.batchNumber || '').toLowerCase().includes(term);
        const matchesArticleNum = (t.articleNumber || '').toLowerCase().includes(term);
        const matchesArticleName = (t.articleName || '').toLowerCase().includes(term);
        const matchesWorker = (t.workerName || '').toLowerCase().includes(term);
        if (!matchesNumber && !matchesBatch && !matchesArticleNum && !matchesArticleName && !matchesWorker) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, typeFilter, materialFilter, startDate, endDate, searchTerm, batchesMap]);

  // Podsumowanie Statystyk FinOps i Magazynu (wartościowo w pieniądzach PLN + ilościowo)
  const stats = useMemo(() => {
    let totalInQty = 0;
    let totalOutQty = 0;
    let totalInValue = 0;
    let totalOutValue = 0;
    let countPZ = 0;
    let countRW = 0;
    let countPW = 0;
    let countRWI = 0;
    let countPWI = 0;
    let countBO = 0;

    filteredTransactions.forEach(t => {
      const val = getTxTotalValue(t);

      if (t.sign > 0) {
        totalInQty += t.quantity;
        totalInValue += val;
      } else {
        totalOutQty += t.quantity;
        totalOutValue += val;
      }

      if (t.type === 'PZ') countPZ++;
      if (t.type === 'RW') countRW++;
      if (t.type === 'PW') countPW++;
      if (t.type === 'RWI') countRWI++;
      if (t.type === 'PWI') countPWI++;
      if (t.type === 'BO') countBO++;
    });

    const netValue = totalInValue - totalOutValue;
    const netQty = totalInQty - totalOutQty;

    return {
      totalInQty: Number(totalInQty.toFixed(3)),
      totalOutQty: Number(totalOutQty.toFixed(3)),
      totalInValue: Number(totalInValue.toFixed(2)),
      totalOutValue: Number(totalOutValue.toFixed(2)),
      netChangeQty: Number(netQty.toFixed(3)),
      netChangeValue: Number(netValue.toFixed(2)),
      countPZ, countRW, countPW, countRWI, countPWI, countBO,
      totalCount: filteredTransactions.length
    };
  }, [filteredTransactions, batchesMap, poPricesMap]);

  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) return alert('Brak transakcji do wyeksportowania.');

    const exportData = filteredTransactions.map(t => {
      const unitPrice = getTxUnitPrice(t);
      const totalVal = getTxTotalValue(t);
      return {
        'Nr Kwitu': t.transactionNumber,
        'Typ Dok.': t.type,
        'Znak': t.sign > 0 ? '+' : '-',
        'Data': t.date,
        'Nr Wsadu': t.batchNumber,
        'Nr Artykułu': t.articleNumber,
        'Nazwa Asortymentu': t.articleName,
        'Ilość Operacji': t.quantity,
        'Ilość ze Znakiem': t.signedQuantity,
        'Jednostka': t.unit,
        'Cena Jednostkowa (PLN)': unitPrice,
        'Wartość Transakcji (PLN)': t.sign > 0 ? totalVal : -totalVal,
        'Stan Przed': t.previousBatchQuantity,
        'Stan Po': t.newBatchQuantity,
        'Pracownik': t.workerName,
        'Wpisano Przez': t.createdBy,
        'Wymiary/Kalkulator': t.calculatorDetails || '',
        'Korygowany RW (dla PWI)': t.adjustedTransactionId || t.adjustedWithdrawalId || '',
        'Uwagi': t.notes || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Księga Transakcji WMS");
    XLSX.writeFile(wb, `Ksiega_Transakcji_WMS_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getBadgeStyle = (type: InventoryTransactionType) => {
    switch (type) {
      case 'PZ': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'PW': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'PWI': return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'BO': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'RW': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'RWI': return 'bg-rose-100 text-rose-800 border-rose-300';
      default: return 'bg-stone-100 text-stone-800 border-stone-300';
    }
  };

  const getTypeDescription = (type: InventoryTransactionType) => {
    switch (type) {
      case 'PZ': return 'Przychód Zewnętrzny (Dostawa)';
      case 'RW': return 'Rozchód Wewnętrzny (Produkcja)';
      case 'PW': return 'Przychód Wewnętrzny (Zwrot)';
      case 'RWI': return 'Rozchód Inwentaryzacyjny (Manko)';
      case 'PWI': return 'Przychód Inwentaryzacyjny (Nadwyżka z korektą RW)';
      case 'BO': return 'Bilans Otwarcia (Inicjalizacja)';
      default: return type;
    }
  };

  if (loading) return <div className="p-8 text-center text-stone-400 font-bold text-sm">Ładowanie księgi transakcji magazynowych...</div>;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto p-6 items-start w-full">
      {/* HEADER & TOP BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-stone-900 text-white rounded-2xl">
            <Layers size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-stone-900">Księga Transakcji Magazynowych (WMS ERP)</h1>
            <p className="text-xs text-stone-500 font-medium mt-0.5">Strumień wpisów transakcyjnych (PZ, RW, PW, RWI, PWI, BO) & podwójny zapis</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onOpenBOModal && (
            <button
              onClick={onOpenBOModal}
              className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-colors border border-stone-300 flex items-center gap-2"
            >
              <ShieldCheck size={16} className="text-purple-600" />
              Inicjalizuj BO (Plan B)
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-colors shadow-sm flex items-center gap-2"
          >
            <FileSpreadsheet size={16} />
            Eksportuj do Excela
          </button>
        </div>
      </div>

      {/* METRYKI I STATYSTYKI WARTOŚCIOWE */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Przychody (PZ/PW/PWI/BO)</span>
          <div className="text-xl font-black text-emerald-600 mt-1 flex items-center gap-1">
            <ArrowDownLeft size={20} />
            {formatPLN(stats.totalInValue, true)}
          </div>
          <span className="text-[10px] text-stone-500 font-semibold mt-1">
            Suma przychodów: +{stats.totalInQty} (ilościowo)
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Rozchody (RW/RWI)</span>
          <div className="text-xl font-black text-rose-600 mt-1 flex items-center gap-1">
            <ArrowUpRight size={20} />
            {formatPLN(-stats.totalOutValue, false)}
          </div>
          <span className="text-[10px] text-stone-500 font-semibold mt-1">
            Suma rozchodów: -{stats.totalOutQty} (ilościowo)
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Zmiana Netto Bilansu</span>
          <div className={cn("text-xl font-black mt-1", stats.netChangeValue >= 0 ? "text-indigo-600" : "text-amber-600")}>
            {formatPLN(stats.netChangeValue, true)}
          </div>
          <span className="text-[10px] text-stone-500 font-semibold mt-1">
            Przychody - Rozchody ({stats.netChangeQty >= 0 ? '+' : ''}{stats.netChangeQty} ilościowo)
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Liczba Kwitów</span>
          <div className="text-xl font-black text-stone-900 mt-1">
            {stats.totalCount}
          </div>
          <div className="text-[10px] text-stone-500 font-bold mt-1 flex gap-1.5 flex-wrap">
            <span className="text-emerald-700">PZ:{stats.countPZ}</span>
            <span className="text-amber-700">RW:{stats.countRW}</span>
            <span className="text-blue-700">PW:{stats.countPW}</span>
            <span className="text-rose-700">RWI:{stats.countRWI}</span>
            <span className="text-teal-700">PWI:{stats.countPWI}</span>
            <span className="text-purple-700">BO:{stats.countBO}</span>
          </div>
        </div>
      </div>

      {/* PASEK FILTRÓW */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm w-full flex flex-col xl:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto flex-1">
          {/* Wyszukiwarka */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Szukaj po nr kwitu, nr wsadu, artykule, pracowniku..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Filtry Grupy Materiałowej (ze zdjęcia: Wszystko, RU, PR, BL, PL, FA, SR) */}
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 shrink-0 select-none text-xs font-bold items-center">
            {(['ALL', 'RU', 'PR', 'BL', 'PL', 'FA', 'SR'] as const).map(f => (
              <button
                key={f}
                onClick={() => setMaterialFilter(f)}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all text-xs font-bold",
                  materialFilter === f 
                    ? "bg-white text-indigo-700 shadow-sm" 
                    : "text-stone-500 hover:text-stone-800"
                )}
              >
                {f === 'ALL' ? 'Wszystko' : f}
              </button>
            ))}
          </div>

          {/* Typy Kwitów Transakcyjnych */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {['ALL', 'PZ', 'RW', 'PW', 'RWI', 'PWI', 'BO'].map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shrink-0",
                  typeFilter === type
                    ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                )}
              >
                {type === 'ALL' ? 'Wszystkie Kwity' : type}
              </button>
            ))}
          </div>
        </div>

        {/* Filtr Daty */}
        <div className="flex items-center gap-2 w-full xl:w-auto justify-end shrink-0">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700"
          />
          <span className="text-xs text-stone-400 font-bold">-</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700"
          />
        </div>
      </div>

      {/* TABELA TRANSAKCJI */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 text-[11px] font-black uppercase text-stone-500 tracking-wider border-b border-stone-200">
                <th className="py-3 px-4">Nr Kwitu</th>
                <th className="py-3 px-3">Typ ERP</th>
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-4">Wsad / Artykuł</th>
                <th className="py-3 px-4 text-right">Ilość ze znakiem</th>
                <th className="py-3 px-4 text-right">Wartość (PLN)</th>
                <th className="py-3 px-4 text-right">Stan Przed → Po</th>
                <th className="py-3 px-4">Pracownik</th>
                <th className="py-3 px-3 text-center">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs font-medium text-stone-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-400 font-bold">
                    Brak zarejestrowanych transakcji spełniających kryteria.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(t => {
                  const txPrice = getTxUnitPrice(t);
                  const txVal = getTxTotalValue(t);
                  return (
                    <tr key={t.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900">
                        {t.transactionNumber}
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn("px-2.5 py-1 rounded-md border text-[10px] font-black tracking-wide", getBadgeStyle(t.type))}>
                          {t.type}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-stone-600">
                        {t.date}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900">{t.batchNumber}</div>
                        <div className="text-[11px] text-stone-500 font-normal truncate max-w-xs" title={t.articleName}>
                          {t.articleNumber ? `${t.articleNumber} - ` : ''}{t.articleName}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        <span className={cn(t.sign > 0 ? "text-emerald-600 font-black" : "text-rose-600 font-black")}>
                          {t.sign > 0 ? `+${t.quantity}` : `-${t.quantity}`} {t.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className={cn("font-black text-xs", t.sign > 0 ? "text-emerald-700" : "text-rose-700")}>
                          {t.sign > 0 ? '+' : '-'}{formatPLN(txVal)}
                        </div>
                        {txPrice > 0 && (
                          <div className="text-[10px] text-stone-400 font-medium">
                            {formatPLN(txPrice)} / {t.unit}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-stone-600">
                        <span>{t.previousBatchQuantity}</span>
                        <span className="text-stone-400 mx-1">→</span>
                        <span className="font-bold text-stone-900">{t.newBatchQuantity}</span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-stone-700">
                        {t.workerName || 'System'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setSelectedTransaction(t)}
                          className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
                        >
                          Szczegóły
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL SZCZEGÓŁÓW DOKUMENTU */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-stone-200 animate-in fade-in zoom-in duration-200">
            <div className="bg-stone-900 text-white p-6 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-black border", getBadgeStyle(selectedTransaction.type))}>
                    {selectedTransaction.type}
                  </span>
                  <h2 className="text-lg font-black tracking-tight">{selectedTransaction.transactionNumber}</h2>
                </div>
                <p className="text-xs text-stone-400 mt-1">{getTypeDescription(selectedTransaction.type)}</p>
              </div>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="text-stone-400 hover:text-white text-xl font-bold px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-medium text-stone-800">
              <div className="grid grid-cols-2 gap-3 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Wsad</span>
                  <p className="font-bold text-stone-900 text-sm">{selectedTransaction.batchNumber}</p>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Artykuł</span>
                  <p className="font-bold text-stone-900">{selectedTransaction.articleNumber || '-'}</p>
                  <p className="text-[11px] text-stone-600 truncate">{selectedTransaction.articleName}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Stan Przed</span>
                  <p className="font-bold text-stone-800 text-xs mt-1">{selectedTransaction.previousBatchQuantity} {selectedTransaction.unit}</p>
                </div>
                <div className={cn("p-2.5 rounded-xl border", selectedTransaction.sign > 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
                  <span className="text-[10px] font-bold uppercase text-stone-500">Ilość</span>
                  <p className={cn("font-black text-xs mt-1", selectedTransaction.sign > 0 ? "text-emerald-700" : "text-rose-700")}>
                    {selectedTransaction.sign > 0 ? `+${selectedTransaction.quantity}` : `-${selectedTransaction.quantity}`} {selectedTransaction.unit}
                  </p>
                </div>
                <div className={cn("p-2.5 rounded-xl border", selectedTransaction.sign > 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
                  <span className="text-[10px] font-bold uppercase text-stone-500">Wartość</span>
                  <p className={cn("font-black text-xs mt-1", selectedTransaction.sign > 0 ? "text-emerald-700" : "text-rose-700")}>
                    {selectedTransaction.sign > 0 ? '+' : '-'}{formatPLN(getTxTotalValue(selectedTransaction))}
                  </p>
                </div>
                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Stan Po</span>
                  <p className="font-bold text-stone-900 text-xs mt-1">{selectedTransaction.newBatchQuantity} {selectedTransaction.unit}</p>
                </div>
              </div>

              {selectedTransaction.type === 'PWI' && (selectedTransaction.adjustedTransactionId || selectedTransaction.adjustedWithdrawalId) && (
                <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 space-y-1 text-teal-900">
                  <span className="font-bold text-[11px] uppercase tracking-wider block text-teal-700">Powiązanie ze zmniejszeniem wydania RW:</span>
                  <p>Korygowana Transakcja RW: <span className="font-mono font-bold">{selectedTransaction.adjustedTransactionId || selectedTransaction.adjustedWithdrawalId}</span></p>
                  {selectedTransaction.withdrawalCorrectionAmount !== undefined && (
                    <p>Kwota pomniejszenia pobrania produkcyjnego: <span className="font-bold">{selectedTransaction.withdrawalCorrectionAmount} {selectedTransaction.unit}</span></p>
                  )}
                </div>
              )}

              {selectedTransaction.calculatorDetails && (
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase block mb-1">Kalkulator / Wymiary</span>
                  <p className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 font-mono text-stone-800">{selectedTransaction.calculatorDetails}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-stone-600">
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Zgłaszający</span>
                  <p className="font-semibold text-stone-900">{selectedTransaction.workerName}</p>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Wpisał w Systemie</span>
                  <p className="font-semibold text-stone-900">{selectedTransaction.createdBy}</p>
                </div>
              </div>

              {selectedTransaction.notes && (
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase block mb-1">Uwagi</span>
                  <p className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-stone-700">{selectedTransaction.notes}</p>
                </div>
              )}
            </div>

            <div className="bg-stone-50 p-4 px-6 border-t border-stone-200 flex justify-end">
              <button
                onClick={() => setSelectedTransaction(null)}
                className="px-4 py-2 bg-stone-900 text-white text-xs font-bold rounded-xl hover:bg-stone-800 transition-colors"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

