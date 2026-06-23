import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, Upload, Trash2, ChevronRight, ChevronDown, 
  Settings2, Download, Search, AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { InventoryBatch, InventoryArticle } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface ReservationRow {
  targetIndex: string;
  originalMaterial: string;
  gatunek: string;
  quantities: Record<string, number>;
}

interface ContractFile {
  id: string;
  filename: string;
  contractName: string; // derived from filename
  isExpanded: boolean;
  constructions: { name: string; enabled: boolean; originalColIndexes?: number[] }[];
  rows: ReservationRow[];
  createdAt?: any;
}

function parseMaterialDimensions(name: string) {
  const normName = name.toLowerCase();
  
  const profileMatch = normName.match(/profil.*?(\d+)\s*(?:x|×)\s*(\d+)\s*(?:x|×)\s*([\d,.]+)/);
  if (profileMatch) {
    let w = parseInt(profileMatch[1], 10);
    let h = parseInt(profileMatch[2], 10);
    if (h > w) { const t = w; w = h; h = t; }
    
    return {
      parsedType: 'profil',
      dim1: w.toString().padStart(3, '0'),
      dim2: h.toString().padStart(3, '0'), 
      thickness: parseFloat(profileMatch[3].replace(',', '.')) || 0,
      rawDim1: w.toString(),
      rawDim2: h.toString(),
      rawThickness: profileMatch[3]
    };
  }

  const pipeMatch2 = normName.match(/rura.*?fi\s*([\d,.]+)\s*(?:mm)?\s*(?:x|×)\s*([\d,.]+)/);
  if (pipeMatch2) {
    return {
      parsedType: 'rura',
      dim1: pipeMatch2[1].padStart(5, '0'), // padding for sorting fi 020,0
      dim2: '',
      thickness: parseFloat(pipeMatch2[2].replace(',', '.')) || 0,
      rawDim1: 'fi ' + pipeMatch2[1],
      rawDim2: '',
      rawThickness: pipeMatch2[2]
    }
  }

  const pipeMatch1 = name.match(/rura.*?([\d,.]+(?:\s*")?)\s*(?:x|×)\s*([\d,.]+)/i);
  if (pipeMatch1) {
    return {
      parsedType: 'rura',
      dim1: pipeMatch1[1].trim().padStart(5, '0'),
      dim2: '',
      thickness: parseFloat(pipeMatch1[2].replace(',', '.')) || 0,
      rawDim1: pipeMatch1[1].trim(),
      rawDim2: '',
      rawThickness: pipeMatch1[2]
    }
  }

  return {
    parsedType: 'inne',
    dim1: 'zzz',
    dim2: 'zzz',
    thickness: 0,
    rawDim1: '-',
    rawDim2: '-',
    rawThickness: '-'
  };
}

export function MaterialReservationsView() {
  const [contracts, setContracts] = useState<ContractFile[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [articles, setArticles] = useState<InventoryArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch inventory
  useEffect(() => {
    const qBatches = query(collection(db, 'inventoryBatches'), orderBy('createdAt', 'desc'));
    const unsubscribeBatches = onSnapshot(qBatches, (snapshot) => {
      const b: InventoryBatch[] = [];
      snapshot.forEach((doc) => {
        b.push({ id: doc.id, ...doc.data() } as InventoryBatch);
      });
      setBatches(b);
      setLoading(false);
    });

    const qArticles = query(collection(db, 'inventoryArticles'));
    const unsubscribeArticles = onSnapshot(qArticles, (snapshot) => {
      const a: InventoryArticle[] = [];
      snapshot.forEach((doc) => {
        a.push({ id: doc.id, ...doc.data() } as InventoryArticle);
      });
      setArticles(a);
    });

    const qContracts = query(collection(db, 'materialReservations'), orderBy('createdAt', 'desc'));
    const unsubscribeContracts = onSnapshot(qContracts, (snapshot) => {
      const c: ContractFile[] = [];
      snapshot.forEach((doc) => {
        c.push({ id: doc.id, ...doc.data() } as ContractFile);
      });
      setContracts(c);
    });

    return () => {
      unsubscribeBatches();
      unsubscribeArticles();
      unsubscribeContracts();
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();

      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        if (!bstr) return;

        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // We use header: 1 to get array of arrays, much easier since we need to rely on column index after 5th
        // Column mapping based on user description:
        // 0: gatunek
        // 1: materiał
        // 2: indeks 1
        // 3: indeks 2
        // 4: suma
        // 5+: constructions
        const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
        if (data.length < 2) return; // Need at least header + 1 row

        const headerRow = data[0];
        const constructionsList: { name: string; enabled: boolean; originalColIndexes: number[] }[] = [];

        for (let colStr = 5; colStr < headerRow.length; colStr++) {
          let baseName = String(headerRow[colStr] || '').trim();
          if (baseName !== '') {
            const existing = constructionsList.find(c => c.name === baseName);
            if (existing) {
              existing.originalColIndexes.push(colStr);
            } else {
              constructionsList.push({ name: baseName, enabled: true, originalColIndexes: [colStr] });
            }
          }
        }

        const newRows: ReservationRow[] = [];

        for (let r = 1; r < data.length; r++) {
          const row = data[r];
          if (!row || row.length === 0) continue;
          
          const gatunek = String(row[0] || '').trim().toLowerCase();
          const material = String(row[1] || '').trim();
          const idx1 = String(row[2] || '').trim();
          const idx2 = String(row[3] || '').trim();

          // Validation to skip totally empty/invalid rows at the end
          if (!gatunek && !material && !idx1 && !idx2) continue;

          let targetIndex = '';
          if (gatunek.includes('s355')) {
            targetIndex = (!idx1 || idx1 === '0') ? idx2 : idx1;
          } else if (gatunek.includes('s235')) {
            targetIndex = (!idx2 || idx2 === '0') ? idx1 : idx2;
          } else {
            targetIndex = idx1 || idx2;
          }

          if (!targetIndex || targetIndex === '0') continue; // Skip if no meaningful index

          const rowQuantities: Record<string, number> = {};
          for (const cons of constructionsList) {
            let totalQty = 0;
            for (const colIdx of cons.originalColIndexes) {
              const qtyRaw = row[colIdx];
              const qty = parseFloat(String(qtyRaw).replace(',', '.')) || 0;
              totalQty += qty;
            }
            if (totalQty > 0) {
              rowQuantities[cons.name] = totalQty;
            }
          }

          newRows.push({
            targetIndex,
            originalMaterial: material,
            gatunek: String(row[0] || '').trim(),
            quantities: rowQuantities
          });
        }

        // Deduplicate rows with the same targetIndex from the same file?
        // Let's keep them and aggregate during pivot calculation.

        const newContract = {
          filename: file.name,
          contractName: file.name.replace(/\.[^/.]+$/, ""), // remove extension
          isExpanded: false,
          constructions: constructionsList,
          rows: newRows,
          createdAt: serverTimestamp()
        };

        addDoc(collection(db, 'materialReservations'), newContract).catch(err => {
          console.error("Błąd podczas zapisywania importu do bazy", err);
          alert("Wystąpił błąd podczas zapisywania pliku do bazy danych.");
        });
      };

      reader.readAsBinaryString(file);
    }
    // reset input
    e.target.value = '';
  };

  const removeContract = async (id: string) => {
    if (window.confirm('Czy na pewno chcesz usunąć ten import?')) {
      try {
        await deleteDoc(doc(db, 'materialReservations', id));
      } catch (err) {
        console.error("Error removing contract:", err);
      }
    }
  };

  const toggleConstruction = async (contractId: string, consName: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return;
    const updatedConstructions = contract.constructions.map(cons => cons.name === consName ? { ...cons, enabled: !cons.enabled } : cons);
    
    // Optymistyczna aktualizacja UI
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, constructions: updatedConstructions } : c));
    
    // Zapis do bazy
    try {
      await updateDoc(doc(db, 'materialReservations', contractId), { constructions: updatedConstructions });
    } catch (err) {
      console.error("Error toggling construction:", err);
    }
  };

  const toggleContractExpanded = async (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return;
    
    // Optymistyczna aktualizacja
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, isExpanded: !contract.isExpanded } : c));
    
    try {
      await updateDoc(doc(db, 'materialReservations', contractId), { isExpanded: !contract.isExpanded });
    } catch (err) {
      console.error("Error toggling expansion:", err);
    }
  };


  // PIVOT CALCULATION
  const pivotData = useMemo(() => {
    // 1. Calculate stocks per index
    const stockMap = new Map<string, number>();

    // Prepare articles lookup map
    const dbArticlesMap = new Map<string, string>();
    articles.forEach(a => {
      if (a.articleNumber && a.articleName) {
        dbArticlesMap.set(a.articleNumber.trim().toUpperCase(), a.articleName);
      }
    });

    batches.forEach(b => {
      if (b.numericQuantity && b.numericQuantity > 0 && b.articleNumber) {
        const idx = b.articleNumber.trim().toUpperCase();
        const current = stockMap.get(idx) || 0;
        stockMap.set(idx, current + b.numericQuantity);
      }
    });

    // 2. Aggregate requirements
    // map KEY: index -> ContractID -> ConstructionName -> Qty
    const reqMap = new Map<string, {
      materials: Set<string>,
      totalQty: number,
      byContract: Record<string, {
        total: number,
        byConstruction: Record<string, number>
      }>
    }>();

    contracts.forEach(contract => {
      const enabledConstructions = new Set(contract.constructions.filter(c => c.enabled).map(c => c.name));

      contract.rows.forEach(r => {
        const idx = r.targetIndex.toUpperCase();
        if (!reqMap.has(idx)) {
          reqMap.set(idx, { materials: new Set(), totalQty: 0, byContract: {} });
        }
        
        const rData = reqMap.get(idx)!;
        if (r.originalMaterial) rData.materials.add(r.originalMaterial);

        if (!rData.byContract[contract.id]) {
          rData.byContract[contract.id] = { total: 0, byConstruction: {} };
        }
        const contractData = rData.byContract[contract.id];

        for (const [consName, qty] of Object.entries(r.quantities)) {
          if (enabledConstructions.has(consName)) {
            rData.totalQty += qty;
            contractData.total += qty;
            contractData.byConstruction[consName] = (contractData.byConstruction[consName] || 0) + qty;
          }
        }
      });
    });

    // 3. Build final rows
    const allIndexes = Array.from(new Set([...Array.from(stockMap.keys()), ...Array.from(reqMap.keys())]));
    
    return allIndexes.map(idx => {
      const stock = stockMap.get(idx) || 0;
      const req = reqMap.get(idx);
      const totalReq = req?.totalQty || 0;
      
      const articleName = dbArticlesMap.get(idx);
      const excelNames = Array.from(req?.materials || []);
      const matNames = articleName ? articleName : excelNames.join(', ');
      
      const parsedDims = parseMaterialDimensions(matNames);

      return {
        index: idx,
        materials: matNames,
        parsedDims,
        stock,
        requiredTotal: totalReq,
        difference: stock - totalReq,
        byContract: req?.byContract || {}
      };
    }).filter(r => r.stock > 0 || r.requiredTotal > 0);

  }, [contracts, batches, articles]);

  // Sorting / Filtering for pivot table
  const filteredPivot = useMemo(() => {
    return pivotData.filter(row => {
      const t = searchTerm.toLowerCase();
      if (!t) return true;
      return row.index.toLowerCase().includes(t) || row.materials.toLowerCase().includes(t);
    }).sort((a, b) => {
      // Sort by Parsed Type -> Dim1 -> Dim2 -> Thickness -> then index
      if (a.parsedDims.parsedType !== b.parsedDims.parsedType) {
        return a.parsedDims.parsedType.localeCompare(b.parsedDims.parsedType);
      }
      
      if (a.parsedDims.dim1 !== b.parsedDims.dim1) {
        return a.parsedDims.dim1.localeCompare(b.parsedDims.dim1);
      }
      
      if (a.parsedDims.dim2 !== b.parsedDims.dim2) {
        return a.parsedDims.dim2.localeCompare(b.parsedDims.dim2);
      }
      
      if (a.parsedDims.thickness !== b.parsedDims.thickness) {
        return a.parsedDims.thickness - b.parsedDims.thickness;
      }
      
      return a.index.localeCompare(b.index);
    });
  }, [pivotData, searchTerm]);

  const handleExportExcel = () => {
    if (filteredPivot.length === 0) {
      alert("Brak danych do wyeksportowania");
      return;
    }

    const exportData = filteredPivot.map(row => {
      const rowData: any = {
        'Indeks': row.index,
        'Nazwa (ERP/XLS)': row.materials,
        'Aktualny Stan (Plac)': row.stock > 0 ? parseFloat(row.stock.toFixed(3)) : 0,
      };

      contracts.forEach(c => {
        const cTotal = row.byContract[c.id]?.total || 0;
        rowData[c.contractName] = cTotal > 0 ? parseFloat(cTotal.toFixed(3)) : 0;
      });

      rowData['Potrzeby (Suma)'] = row.requiredTotal > 0 ? parseFloat(row.requiredTotal.toFixed(3)) : 0;
      rowData['Różnica'] = parseFloat(row.difference.toFixed(3));

      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rezerwacje');
    XLSX.writeFile(workbook, `Rezerwacje_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="w-full h-full flex flex-col bg-stone-50 overflow-hidden">
      
      {/* HEADER SECTION */}
      <div className="flex-none bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div>
          <h1 className="text-2xl font-black text-indigo-900 flex items-center gap-3 tracking-tight">
            <Settings2 className="text-indigo-500" />
            Rezerwacje Materiałowe
          </h1>
          <p className="text-stone-500 font-medium text-sm mt-1">
            Analiza zapotrzebowania z plików programu do nestingu vs. stan bieżący na placu
          </p>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-stone-100 text-stone-700 rounded-xl font-bold hover:bg-stone-200 transition-all shadow-sm active:scale-95"
          >
            <Download size={20} />
            Eksportuj
          </button>
          <label className="relative flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold cursor-pointer hover:bg-indigo-700 transition-all shadow-md active:scale-95">
            <Upload size={20} />
            Importuj Pliki
            <input 
              type="file" 
              accept=".xls,.xlsx" 
              multiple 
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6 gap-4">
        
        {/* CONTRACTS / UPLOADED FILES HEADER */}
        {contracts.length > 0 && (
          <div className="flex-none flex flex-wrap gap-3">
            <AnimatePresence>
              {contracts.map(contract => (
                <motion.div 
                  key={contract.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden min-w-[300px]"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-stone-100/50 border-b border-stone-200">
                    <div className="flex flex-col">
                      <span className="font-bold text-stone-800 text-sm">{contract.contractName}</span>
                      <span className="text-xs text-stone-500 font-medium">{contract.constructions.length} konstrukcji</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => toggleContractExpanded(contract.id)}
                        className="p-1.5 text-stone-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        {contract.isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                      <button 
                        onClick={() => removeContract(contract.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {contract.isExpanded && (
                    <div className="p-3 bg-white grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar border-t border-stone-100">
                      {contract.constructions.map((cons, i) => (
                        <label key={i} className="flex items-center gap-2 p-1.5 hover:bg-stone-50 rounded cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={cons.enabled}
                            onChange={() => toggleConstruction(contract.id, cons.name)}
                            className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-stone-700 truncate" title={cons.name}>{cons.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* MAIN TABLE */}
        <div className="flex-1 bg-white border border-stone-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          
          <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input 
                type="text"
                placeholder="Szukaj po indeksie lub nazwie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-no-keyboard // Wylacza klawiature zaleznie od potrzeb
                className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
            {loading && <span className="text-xs font-bold text-indigo-500 animate-pulse">Pobieranie Stanów z Placu...</span>}
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
             {contracts.length === 0 && filteredPivot.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-stone-400 gap-4">
                  <FileSpreadsheet size={64} className="text-stone-300" />
                  <p className="font-semibold text-stone-500">Zaimportuj plik .xlsx aby rozpocząć analizę</p>
                </div>
             ) : (
                <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                  <thead className="sticky top-0 bg-stone-100 shadow-sm z-10">
                    <tr className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                      <th className="p-3 w-32 border-b border-stone-200">Indeks</th>
                      <th className="p-3 w-64 border-b border-stone-200">Nazwa (ERP/XLS)</th>
                      <th className="p-3 w-28 border-b border-stone-200 text-right text-indigo-700 bg-indigo-50/30">Aktualny<br/>Stan (Plac)</th>
                      
                      {/* Dynamic Columns for Contracts */}
                      {contracts.map(c => (
                        <th key={c.id} className="p-3 border-b border-stone-200 border-l text-center min-w-[120px]">
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-stone-700 max-w-[150px] truncate" title={c.contractName}>{c.contractName}</span>
                                {c.isExpanded && (
                                    <div className="flex gap-2 mt-2 w-full justify-center">
                                        {c.constructions.filter(co => co.enabled).map(co => (
                                           <span key={co.name} className="px-2 py-1 bg-stone-200 text-stone-600 rounded text-[9px] max-w-[80px] truncate" title={co.name}>{co.name}</span> 
                                        ))}
                                    </div>
                                )}
                            </div>
                        </th>
                      ))}

                      <th className="p-3 w-32 border-b border-stone-200 border-l text-right text-orange-700 bg-orange-50/30">Potrzeby<br/>(Suma)</th>
                      <th className="p-3 w-32 border-b border-stone-200 text-right bg-stone-200">Różnica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPivot.length > 0 ? filteredPivot.map(row => {
                      const isShortage = row.difference < 0;
                      return (
                        <tr key={row.index} className="hover:bg-indigo-50/20 transition-colors border-b border-stone-100 last:border-0 group">
                          <td className="p-3 font-bold text-stone-800">{row.index}</td>
                          <td className="p-3 font-medium text-stone-600">
                            <div className="max-w-md truncate" title={row.materials}>{row.materials || '-'}</div>
                          </td>
                          <td className="p-3 text-right font-black text-indigo-700 bg-indigo-50/50 border-l border-stone-200">
                            {row.stock > 0 ? parseFloat(row.stock.toFixed(3)) : '0'}
                          </td>
                          
                          {/* Contract breakdown */}
                          {contracts.map(c => {
                             const cData = row.byContract[c.id];
                             const cTotal = cData?.total || 0;

                             return (
                               <td key={c.id} className="p-3 border-l border-stone-100 text-center">
                                  {cTotal > 0 ? (
                                     <div className="flex flex-col items-center">
                                        <span className="font-bold text-stone-700">{parseFloat(cTotal.toFixed(3))}</span>
                                        {c.isExpanded && cData?.byConstruction && (
                                            <div className="flex gap-2 mt-1">
                                                {c.constructions.filter(co => co.enabled).map(co => {
                                                    const byC = cData.byConstruction[co.name] || 0;
                                                    return (
                                                       <span key={co.name} className="min-w-[40px] max-w-[80px] text-[10px] text-stone-500 font-semibold truncate bg-stone-50 px-1 py-0.5 rounded">
                                                          {byC > 0 ? parseFloat(byC.toFixed(3)) : '-'}
                                                       </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                     </div>
                                  ) : (
                                     <span className="text-stone-300">-</span>
                                  )}
                               </td>
                             )
                          })}
                          
                          <td className="p-3 text-right font-black text-orange-600 bg-orange-50/10 border-l border-stone-200">
                            {row.requiredTotal > 0 ? parseFloat(row.requiredTotal.toFixed(3)) : '-'}
                          </td>
                          <td className={cn(
                            "p-3 text-right font-black",
                            isShortage ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50/50"
                          )}>
                            {parseFloat(row.difference.toFixed(3))}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={100} className="p-8 text-center text-stone-500 font-medium">Brak danych pasujących do kryteriów</td>
                      </tr>
                    )}
                  </tbody>
                </table>
             )}
          </div>
        </div>

      </div>
    </div>
  );
}
