import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  onSnapshot, 
  orderBy, 
  limit, 
  startAfter, 
  where, 
  getCountFromServer, 
  QueryDocumentSnapshot, 
  DocumentData 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { InventoryTransaction, InventoryTransactionType } from '../../types';
import { Search, FileSpreadsheet, Layers, ArrowUpRight, ArrowDownLeft, ShieldCheck, Database, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../../utils/firestore-helpers';
import { getLocalDateString } from '../../utils/dateUtils';

interface Props {
  currentUser?: string;
  onOpenBOModal?: () => void;
}

export function InventoryLedgerView({ currentUser = 'Zalogowany Pracownik', onOpenBOModal }: Props) {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [mainTransactions, setMainTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalInDbCount, setTotalInDbCount] = useState<number | null>(null);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isBatchSearchMode, setIsBatchSearchMode] = useState(false);
  const [searchedBatchTerm, setSearchedBatchTerm] = useState('');
  const [isSearchingDb, setIsSearchingDb] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'PL' | 'FA' | 'SR';
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<InventoryTransaction | null>(null);

  interface BatchInfo {
    unitPrice?: number;
    sourcePurchaseOrderId?: string;
    articleNumber?: string;
    batchNumber?: string;
    articleName?: string;
    coefficient?: string | number;
    dimensions?: string;
    unit?: string;
  }

  // Mapy do wyznaczania jednostkowej ceny, wartości w PLN oraz parametrów przeliczeniowych blach (arkusze, m2)
  const [batchesMap, setBatchesMap] = useState<Map<string, BatchInfo>>(new Map());
  const [poPricesMap, setPoPricesMap] = useState<Map<string, number>>(new Map());

  // Inicjalne pobieranie: całkowita liczba kwitów w bazie + pierwsze 1000 najnowszych transakcji
  useEffect(() => {
    let isMounted = true;

    const fetchTotalCount = async () => {
      try {
        const countSnap = await getCountFromServer(collection(db, 'inventoryTransactions'));
        if (isMounted) {
          setTotalInDbCount(countSnap.data().count);
        }
      } catch (err) {
        console.error("Błąd podczas pobierania łącznej liczby transakcji w bazie:", err);
      }
    };
    fetchTotalCount();

    const fetchInitialTransactions = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'inventoryTransactions'),
          orderBy('createdAt', 'desc'),
          limit(1000)
        );
        const snap = await getDocs(q);
        if (!isMounted) return;

        const list = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as InventoryTransaction));

        setTransactions(list);
        setMainTransactions(list);
        if (snap.docs.length > 0) {
          setLastVisibleDoc(snap.docs[snap.docs.length - 1]);
        }
        setHasMore(snap.docs.length === 1000);
      } catch (err) {
        console.error("Błąd podczas inicjalnego pobierania transakcji magazynowych:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInitialTransactions();

    return () => {
      isMounted = false;
    };
  }, []);

  // Paginacja: Załaduj starsze transakcje (+500) za pomocą kursora startAfter
  const handleLoadMore = async () => {
    if (!lastVisibleDoc || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextQ = query(
        collection(db, 'inventoryTransactions'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisibleDoc),
        limit(500)
      );
      const snap = await getDocs(nextQ);
      const nextList = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as InventoryTransaction));

      setTransactions(prev => [...prev, ...nextList]);
      setMainTransactions(prev => [...prev, ...nextList]);
      if (snap.docs.length > 0) {
        setLastVisibleDoc(snap.docs[snap.docs.length - 1]);
      }
      if (snap.docs.length < 500) {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Błąd podczas doczytywania starszych transakcji (+500):", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Wyszukiwanie konkretnego wsadu w całej bazie (od początku historii)
  const handleBatchSearch = async () => {
    const term = searchTerm.trim();
    if (!term) {
      if (isBatchSearchMode) {
        handleResetBatchSearch();
      }
      return;
    }

    setIsSearchingDb(true);
    try {
      const batchQ = query(
        collection(db, 'inventoryTransactions'),
        where('batchNumber', '==', term)
      );
      const snap = await getDocs(batchQ);
      let list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as InventoryTransaction));

      // Sprawdzenie wariantu wielkich liter (np. bl-2024 -> BL-2024)
      if (list.length === 0 && term !== term.toUpperCase()) {
        const upperQ = query(
          collection(db, 'inventoryTransactions'),
          where('batchNumber', '==', term.toUpperCase())
        );
        const upperSnap = await getDocs(upperQ);
        list = upperSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as InventoryTransaction));
      }

      // Sortowanie transakcji tego wsadu od najnowszych
      list.sort((a, b) => {
        const dateA = a.createdAt || a.date || '';
        const dateB = b.createdAt || b.date || '';
        return dateB.localeCompare(dateA);
      });

      setIsBatchSearchMode(true);
      setSearchedBatchTerm(term);
      setTransactions(list);
    } catch (err) {
      console.error("Błąd podczas wyszukiwania wsadu w bazie:", err);
    } finally {
      setIsSearchingDb(false);
    }
  };

  const handleResetBatchSearch = () => {
    setIsBatchSearchMode(false);
    setSearchedBatchTerm('');
    setTransactions(mainTransactions);
  };

  // Pobieranie map cen z wsadów i oczekiwanych dostaw
  useEffect(() => {
    const unsubBatches = onSnapshot(collection(db, 'inventoryBatches'), (snap) => {
      const bMap = new Map();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const price = data.unitPrice ?? (data.totalValue && data.numericQuantity ? data.totalValue / data.numericQuantity : undefined);
        const info: BatchInfo = {
          unitPrice: price,
          sourcePurchaseOrderId: data.sourcePurchaseOrderId,
          articleNumber: data.articleNumber,
          batchNumber: data.batchNumber,
          articleName: data.articleName,
          coefficient: data.coefficient,
          dimensions: data.dimensions,
          unit: data.unit
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

  // Przeliczanie metryk blachy/płyty (kg -> arkusze i m²) tak samo jak w Stanie Placu (InventoryYardView)
  const getBlachaMetricsForQty = (t: InventoryTransaction, qty: number) => {
    const bInfo = batchesMap.get(t.batchId) || batchesMap.get(t.batchNumber);
    const matType = getTxMaterialType(t, bInfo);
    if (matType !== 'BL' && matType !== 'PL') return null;

    const unit = (t.unit || bInfo?.unit || '').toLowerCase();
    if (unit !== 'kg') return null;

    const coeff = bInfo?.coefficient;
    if (!coeff) return null;
    const coeffStr = String(coeff).replace(/,/g, '.');
    const coeffNum = parseFloat(coeffStr);
    if (isNaN(coeffNum) || coeffNum <= 0) return null;

    const totalAreaM2 = Math.abs(qty) / coeffNum;
    const dimStr = bInfo?.dimensions || t.calculatorDetails || '';
    let sheets: number | undefined = undefined;

    if (dimStr) {
      const dimMatch = dimStr.match(/(\d+(?:[\.,]\d+)?)[\s]*[xX×][\s]*(\d+(?:[\.,]\d+)?)/);
      if (dimMatch && dimMatch[1] && dimMatch[2]) {
        const w = parseFloat(dimMatch[1].replace(/,/g, '.'));
        const h = parseFloat(dimMatch[2].replace(/,/g, '.'));
        if (w > 0 && h > 0) {
          const sheetAreaM2 = (w / 1000) * (h / 1000);
          if (sheetAreaM2 > 0) {
            sheets = totalAreaM2 / sheetAreaM2;
          }
        }
      }
    }

    return {
      m2: totalAreaM2,
      sheets
    };
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
      const blachaMetrics = getBlachaMetricsForQty(t, t.quantity);
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
        'Ilość Arkuszy': blachaMetrics?.sheets !== undefined ? Math.round(blachaMetrics.sheets * 10) / 10 : '',
        'Powierzchnia (m²)': blachaMetrics?.m2 !== undefined ? parseFloat(blachaMetrics.m2.toFixed(2)) : '',
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
    XLSX.writeFile(wb, `Ksiega_Transakcji_WMS_${getLocalDateString()}.xlsx`);
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
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Liczba Kwitów</span>
            {isBatchSearchMode && (
              <span className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                Wsad z bazy
              </span>
            )}
          </div>
          <div className="text-xl font-black text-stone-900 mt-1 flex items-baseline gap-1.5 flex-wrap">
            <span>{stats.totalCount}</span>
            <span className="text-xs font-semibold text-stone-400">
              (Pobrano: {transactions.length}{totalInDbCount !== null ? ` / Baza: ${totalInDbCount.toLocaleString('pl-PL')}` : ''})
            </span>
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
          {/* Wyszukiwarka z obsługą Enter i szukania wsadu w całej bazie */}
          <div className="relative flex-1 min-w-[260px] max-w-lg flex items-center">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Szukaj (wpisz wsad i [Enter], aby przeszukać bazę)..."
              value={searchTerm}
              onChange={e => {
                const val = e.target.value;
                setSearchTerm(val);
                if (!val && isBatchSearchMode) {
                  handleResetBatchSearch();
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleBatchSearch();
                }
              }}
              className="w-full pl-9 pr-24 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    handleResetBatchSearch();
                  }}
                  className="p-1 text-stone-400 hover:text-stone-600 rounded text-xs"
                  title="Wyczyść"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={handleBatchSearch}
                disabled={isSearchingDb || !searchTerm.trim()}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-200 disabled:text-stone-400 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                title="Wyszukaj wszystkie ruchy tego wsadu od początku bazy"
              >
                {isSearchingDb ? (
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Baza'
                )}
              </button>
            </div>
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

      {/* BANNER TRYBU WYSZUKIWANIA WSADU W CAŁEJ BAZIE */}
      {isBatchSearchMode && (
        <div className="w-full bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-indigo-950 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl">
              <Database size={16} />
            </div>
            <div>
              <div className="font-black text-indigo-900 flex items-center gap-2">
                <span>Historia wsadu z całej bazy</span>
                <span className="px-2 py-0.5 bg-indigo-200 text-indigo-800 rounded font-mono text-[11px]">
                  {searchedBatchTerm}
                </span>
              </div>
              <p className="text-[11px] text-indigo-700 mt-0.5">
                Pobrano wszystkie ruchy magazynowe (od początku istnienia bazy): <strong>{transactions.length}</strong> {transactions.length === 1 ? 'kwit' : 'kwitów'}
              </p>
            </div>
          </div>
          <button
            onClick={handleResetBatchSearch}
            className="px-3.5 py-2 bg-white hover:bg-indigo-100 border border-indigo-300 text-indigo-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
          >
            <RotateCcw size={14} />
            Wróć do wszystkich kwitów
          </button>
        </div>
      )}

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
                        <div className="flex flex-col items-end">
                          <span className={cn(t.sign > 0 ? "text-emerald-600 font-black" : "text-rose-600 font-black")}>
                            {t.sign > 0 ? `+${t.quantity}` : `-${t.quantity}`} {t.unit}
                          </span>
                          {(() => {
                            const metrics = getBlachaMetricsForQty(t, t.quantity);
                            if (!metrics) return null;
                            const textParts = [];
                            if (metrics.sheets !== undefined) {
                              const roundedSheets = Math.round(metrics.sheets * 10) / 10;
                              textParts.push(`${roundedSheets} ark.`);
                            }
                            textParts.push(`${parseFloat(metrics.m2.toFixed(2))} m²`);
                            return (
                              <span 
                                className={cn(
                                  "text-[10px] font-semibold whitespace-nowrap mt-0.5",
                                  t.sign > 0 ? "text-emerald-700/80" : "text-rose-700/80"
                                )}
                                title="Wartości przeliczone na podstawie wagi i wymiarów (jak w stanie placu)"
                              >
                                {textParts.join(' | ')}
                              </span>
                            );
                          })()}
                        </div>
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

        {/* PAGINACJA / ŁADOWANIE STARSZYCH TRANSAKCJI */}
        {!isBatchSearchMode && (
          <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-stone-500 font-medium">
              Pobrano do widoku <span className="font-bold text-stone-800">{transactions.length}</span> z{' '}
              <span className="font-bold text-stone-800">{totalInDbCount !== null ? totalInDbCount.toLocaleString('pl-PL') : '...'}</span> transakcji w bazie
            </div>

            {hasMore ? (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full sm:w-auto px-5 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-400 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingMore ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Ładowanie starszych transakcji...
                  </>
                ) : (
                  <>
                    Załaduj starsze transakcje (+500)
                  </>
                )}
              </button>
            ) : (
              <span className="text-xs text-stone-400 font-semibold italic">
                Załadowano wszystkie dostępne transakcje z bazy
              </span>
            )}
          </div>
        )}
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
                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-stone-400 font-bold uppercase">Stan Przed</span>
                    <p className="font-bold text-stone-800 text-xs mt-1">{selectedTransaction.previousBatchQuantity} {selectedTransaction.unit}</p>
                  </div>
                  {(() => {
                    const metrics = getBlachaMetricsForQty(selectedTransaction, selectedTransaction.previousBatchQuantity);
                    if (!metrics || metrics.sheets === undefined) return null;
                    return (
                      <p className="text-[10px] text-stone-500 font-semibold mt-1">
                        ≈ {Math.round(metrics.sheets * 10) / 10} ark.
                      </p>
                    );
                  })()}
                </div>
                <div className={cn("p-2.5 rounded-xl border flex flex-col justify-between", selectedTransaction.sign > 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-stone-500">Ilość</span>
                    <p className={cn("font-black text-xs mt-1", selectedTransaction.sign > 0 ? "text-emerald-700" : "text-rose-700")}>
                      {selectedTransaction.sign > 0 ? `+${selectedTransaction.quantity}` : `-${selectedTransaction.quantity}`} {selectedTransaction.unit}
                    </p>
                  </div>
                  {(() => {
                    const metrics = getBlachaMetricsForQty(selectedTransaction, selectedTransaction.quantity);
                    if (!metrics) return null;
                    const textParts = [];
                    if (metrics.sheets !== undefined) {
                      const roundedSheets = Math.round(metrics.sheets * 10) / 10;
                      textParts.push(`${roundedSheets} ark.`);
                    }
                    textParts.push(`${parseFloat(metrics.m2.toFixed(2))} m²`);
                    return (
                      <p className={cn("text-[10px] font-bold mt-1", selectedTransaction.sign > 0 ? "text-emerald-700/80" : "text-rose-700/80")}>
                        {textParts.join(' | ')}
                      </p>
                    );
                  })()}
                </div>
                <div className={cn("p-2.5 rounded-xl border flex flex-col justify-between", selectedTransaction.sign > 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-stone-500">Wartość</span>
                    <p className={cn("font-black text-xs mt-1", selectedTransaction.sign > 0 ? "text-emerald-700" : "text-rose-700")}>
                      {selectedTransaction.sign > 0 ? '+' : '-'}{formatPLN(getTxTotalValue(selectedTransaction))}
                    </p>
                  </div>
                </div>
                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-stone-400 font-bold uppercase">Stan Po</span>
                    <p className="font-bold text-stone-900 text-xs mt-1">{selectedTransaction.newBatchQuantity} {selectedTransaction.unit}</p>
                  </div>
                  {(() => {
                    const metrics = getBlachaMetricsForQty(selectedTransaction, selectedTransaction.newBatchQuantity);
                    if (!metrics || metrics.sheets === undefined) return null;
                    return (
                      <p className="text-[10px] text-stone-500 font-semibold mt-1">
                        ≈ {Math.round(metrics.sheets * 10) / 10} ark.
                      </p>
                    );
                  })()}
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

