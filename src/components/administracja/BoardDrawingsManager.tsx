import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { BoardDrawing, ProductionOrder, BoardDrawingElement } from '../../types';
import { Upload, Trash2, Link as LinkIcon, FileText, Check, X } from 'lucide-react';

interface Props {
  orders: ProductionOrder[];
  userProfile: any;
}

export function BoardDrawingsManager({ orders, userProfile }: Props) {
  const [drawings, setDrawings] = useState<BoardDrawing[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientOrderNumber, setClientOrderNumber] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [selectedDrawing, setSelectedDrawing] = useState<BoardDrawing | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(true);

  useEffect(() => {
    fetchDrawings();
  }, []);

  const fetchDrawings = async () => {
    const snap = await getDocs(collection(db, 'boardDrawings'));
    const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as BoardDrawing));
    setDrawings(fetched);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !clientOrderNumber) return;
    setLoading(true);
    setDebugLogs([]);
    setShowDebug(true);

    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      setDebugLogs([...logs]);
    };

    addLog(`Rozpoczęto wgrywanie pliku: ${selectedFile.name}`);
    addLog(`Wpisany numer zlecenia klienta (ZL): "${clientOrderNumber}"`);

    try {
      const formData = new FormData();
      formData.append("pdf", selectedFile);

      addLog(`Wysyłam plik do serwera na analizę AI...`);
      const response = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorDetails = response.statusText;
        try {
          const errorJson = await response.json();
          errorDetails = errorJson.details || errorJson.error || response.statusText;
        } catch(e) {}
        throw new Error(`Błąd serwera: ${errorDetails}`);
      }

      const parsed = await response.json();
        
      addLog(`Zakończono analizę AI.`);
      addLog(`- Wykryte elementy (ilość: ${parsed.elements.length}): ${JSON.stringify(parsed.elements.map((el: any) => el.name))}`);
        
      const cleanNumber = (num: string) => num.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const cleanClientNo = cleanNumber(clientOrderNumber);
        
      addLog(`Oczyszczony numer zlecenia klienta do wyszukiwania: "${cleanClientNo}"`);
        
      // 1. Znajdź wszystkie zlecenia o pasującym erpOrderNumber
      addLog(`Wyszukuję zlecenia produkcyjne w bazie (dostępnych wszystkich zleceń: ${orders.length})...`);
      const candidateOrders = orders.filter(o => {
        if (!o.erpOrderNumber) return false;
        const cleanErpNo = cleanNumber(o.erpOrderNumber);
        return cleanErpNo === cleanClientNo || cleanErpNo.includes(cleanClientNo) || cleanClientNo.includes(cleanErpNo);
      });

      addLog(`Znaleziono kandydatów o pasującym numerze ZL (ilość: ${candidateOrders.length}):`);
      candidateOrders.forEach(o => {
        addLog(`  * Kandydat ID: ${o.id}, Numer ZP: ${o.orderNumber}, Numer ZL: ${o.erpOrderNumber}, Nazwa: "${o.productName}"`);
      });

      const getOrderDimensionsMm = (productName: string): { w: number; h: number } | null => {
        const productNameClean = productName.toLowerCase().replace(/,/g, '.');
        const numbers = productNameClean.match(/\d+(?:\.\d+)?/g);
        if (!numbers || numbers.length < 2) return null;
          
        const parseDim = (valStr: string): number => {
          const val = parseFloat(valStr);
          if (val < 15) return Math.round(val * 1000); 
          if (val < 150) return Math.round(val * 10);  
          return Math.round(val);                      
        };

        const candidates: number[] = [];
        for (const numStr of numbers) {
          if (productNameClean.includes(numStr + 'mm') || productNameClean.includes('gr.' + numStr) || productNameClean.includes('gen')) {
            continue;
          }
          const mm = parseDim(numStr);
          if (mm >= 100 && mm <= 20000) {
            candidates.push(mm);
          }
        }

        if (candidates.length >= 2) {
          return { w: candidates[0], h: candidates[1] };
        }
          
        return { w: parseDim(numbers[0]), h: parseDim(numbers[1]) };
      };

      const candidatesWithDimensions = candidateOrders.map(order => ({
        order,
        dims: getOrderDimensionsMm(order.productName)
      }));

      // Obliczamy całkowite wymiary tablicy zgrupowane po POZ (lub stronie i szerokości)
      const boardTotalDims: Record<string, { w: number, h: number }> = {};
      parsed.elements.forEach((el: any) => {
        const key = el.detectedPoz ? `poz_${el.detectedPoz.trim().toLowerCase()}` : `page_${el.page || 1}_w_${el.width || 0}`;
        if (!boardTotalDims[key]) {
          boardTotalDims[key] = { w: 0, h: 0 };
        }
        const w = el.width || 0;
        const h = el.height || 0;
        if (w > boardTotalDims[key].w) {
          boardTotalDims[key].w = w;
        }
        boardTotalDims[key].h += h; // Suma wysokości paneli w grupie
      });

      const mappedElements: BoardDrawingElement[] = [];

      addLog(`Mapowanie elementów wyodrębnionych przez AI do zleceń ERP...`);
      parsed.elements.forEach((el: any) => {
        let mappedOrderId: string | null = null;
        let mappedOrderNumber: string | null = null;

        // 1. Najpierw spróbujmy dopasować po POZ (niezależnie od wymiaru)
        if (el.detectedPoz) {
          const pozNum = el.detectedPoz.replace('POZ.', '').replace('POZ. ', '').trim();
          const matchedOrder = candidateOrders.find(o => {
              const name = o.productName.toLowerCase();
              return name.includes(`poz.${pozNum}`) || name.includes(`poz ${pozNum}`) || name.includes(`pozycja ${pozNum}`);
          });
          if (matchedOrder) {
              mappedOrderId = matchedOrder.id;
              mappedOrderNumber = matchedOrder.orderNumber;
              addLog(`  => [SUKCES] Dopasowano "${el.name}" do ZP ${mappedOrderNumber} na podstawie nazwy zawierającej POZ (${pozNum})`);
          }
        }

        // 2. Jeśli nie dopasowano po POZ wprost, spróbujmy dopasować po całkowitym wymiarze wyliczonej tablicy (grupy)
        if (!mappedOrderId) {
          const key = el.detectedPoz ? `poz_${el.detectedPoz.trim().toLowerCase()}` : `page_${el.page || 1}_w_${el.width || 0}`;
          const totalBoardDims = boardTotalDims[key];
          if (totalBoardDims && totalBoardDims.w > 0 && totalBoardDims.h > 0) {
            const directOrder = candidatesWithDimensions.find(c => {
              if (!c.dims) return false;
              // Sprawdzamy czy wymiary zlecenia odpowiadają całkowitemu wymiarowi tablicy (w dowolnej kolejności)
              const matchesDirect = (c.dims.w === totalBoardDims.w && c.dims.h === totalBoardDims.h);
              const matchesReverse = (c.dims.w === totalBoardDims.h && c.dims.h === totalBoardDims.w);
              return matchesDirect || matchesReverse;
            });

            if (directOrder) {
              mappedOrderId = directOrder.order.id;
              mappedOrderNumber = directOrder.order.orderNumber;
              addLog(`  => [SUKCES] Dopasowano "${el.name}" do ZP ${mappedOrderNumber} na podstawie całkowitych wymiarów zgrupowanej tablicy (${totalBoardDims.w}x${totalBoardDims.h} mm)`);
            }
          }
        }

        if (!mappedOrderId) {
          addLog(`  => Element ${el.name} -> BRAK DOPASOWANIA`);
        }

        mappedElements.push({
          id: el.id,
          name: el.name,
          x: el.x || 0,
          y: el.y || 0,
          page: el.page || 1, 
          detectedDimension: el.detectedDimension || null,
          detectedPoz: el.detectedPoz || null,
          mappedOrderId,
          mappedOrderNumber,
          width: el.width || null,
          height: el.height || null,
          areaSquareMeters: el.areaSquareMeters || null,
          profilesLength: el.profilesLength || null,
          locksLength: el.locksLength || null,
          frameLength: el.frameLength || null,
        });
      });

      // Zapisujemy rysunek 
      // Do podglądu, wczytujemy plik by mieć fileData:
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      const newDrawing: Omit<BoardDrawing, 'id'> = {
        clientOrderNumber,
        fileName: selectedFile.name,
        fileData: fileData,
        elements: mappedElements,
        createdAt: serverTimestamp() as any,
        createdBy: userProfile?.displayName || 'System'
      };

      addLog(`Zapisuję rysunek do bazy danych Firestore...`);
      await addDoc(collection(db, 'boardDrawings'), newDrawing);
      addLog(`Rysunek zapisany pomyślnie!`);
        
      setClientOrderNumber('');
      setSelectedFile(null);
      await fetchDrawings();
      setLoading(false);
    } catch (error) {
      console.error(error);
      addLog(`[BŁĄD] Wystąpił błąd: ${error instanceof Error ? error.message : String(error)}`);
      alert('Błąd podczas wgrywania pliku PDF.');
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'boardDrawings', id));
    await fetchDrawings();
  };

  const handleMapElement = async (drawingId: string, elementId: string, orderId: string) => {
    const drawing = drawings.find(d => d.id === drawingId);
    if (!drawing) return;

    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) {
      // Jeśli wybrano pustą opcję, wyczyść przypisanie
      const newElements = drawing.elements.map(el => 
        el.id === elementId 
          ? { ...el, mappedOrderId: null, mappedOrderNumber: null } 
          : el
      );
      await updateDoc(doc(db, 'boardDrawings', drawingId), { elements: newElements });
      setDrawings(prev => prev.map(d => d.id === drawingId ? { ...d, elements: newElements } : d));
      if (selectedDrawing?.id === drawingId) {
        setSelectedDrawing(prev => prev ? { ...prev, elements: newElements } : null);
      }
      return;
    }

    const newElements = drawing.elements.map(el => 
      el.id === elementId 
        ? { ...el, mappedOrderId: targetOrder.id, mappedOrderNumber: targetOrder.orderNumber } 
        : el
    );

    await updateDoc(doc(db, 'boardDrawings', drawingId), { elements: newElements });
    
    // Update local state
    setDrawings(prev => prev.map(d => d.id === drawingId ? { ...d, elements: newElements } : d));
    if (selectedDrawing?.id === drawingId) {
      setSelectedDrawing(prev => prev ? { ...prev, elements: newElements } : null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 border border-stone-100 mb-8">
      <h2 className="text-2xl font-bold text-stone-800 mb-6 flex items-center gap-2">
        <FileText className="text-emerald-500" /> Wgrywanie Rysunków Tablic (PDF)
      </h2>

      {/* Upload Form */}
      <div className="bg-stone-50 p-6 rounded-2xl border border-stone-200 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-stone-600 mb-2">Numer Zlecenia Klienta</label>
            <input 
              type="text" 
              value={clientOrderNumber}
              onChange={(e) => setClientOrderNumber(e.target.value)}
              className="w-full bg-white border border-stone-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="np. 2026/261426"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-600 mb-2">Rysunek PDF</label>
            <input 
              type="file" 
              accept=".pdf"
              onChange={handleFileChange}
              className="w-full bg-white border border-stone-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleUpload}
              disabled={loading || !selectedFile || !clientOrderNumber}
              className="w-full bg-stone-900 text-white rounded-xl py-3 font-bold hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload size={20} />}
              Wgraj PDF i Analizuj
            </button>
          </div>
        </div>

        {/* Konsola diagnostyczna */}
        {debugLogs.length > 0 && (
          <div className="mt-6 border-t border-stone-200 pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Konsola diagnostyczna analizy i dopasowywania</span>
              <button 
                onClick={() => setShowDebug(!showDebug)} 
                className="text-xs text-emerald-600 hover:underline font-semibold"
              >
                {showDebug ? 'Ukryj konsolę' : 'Pokaż konsolę'}
              </button>
            </div>
            {showDebug && (
              <div className="bg-stone-950 text-stone-200 p-4 rounded-xl font-mono text-xs overflow-y-auto max-h-60 space-y-1 shadow-inner border border-stone-800">
                {debugLogs.map((logStr, i) => (
                  <div key={i} className={logStr.includes('[SUKCES]') ? 'text-emerald-400 font-bold' : logStr.includes('[BŁĄD]') ? 'text-rose-400 font-bold' : logStr.includes('[OSTRZEŻENIE]') ? 'text-amber-400 font-semibold' : 'text-stone-300'}>
                    {logStr}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* List of Drawings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-bold text-stone-800 mb-4">Wgrane Rysunki</h3>
          {drawings.length === 0 ? (
            <p className="text-stone-500 italic">Brak wgranych rysunków.</p>
          ) : (
            <div className="space-y-3">
              {drawings.map(drawing => (
                <div 
                  key={drawing.id} 
                  className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${selectedDrawing?.id === drawing.id ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 bg-white hover:bg-stone-50'}`}
                  onClick={() => setSelectedDrawing(drawing)}
                >
                  <div>
                    <div className="font-bold text-stone-800">{drawing.clientOrderNumber}</div>
                    <div className="text-sm text-stone-500">{drawing.fileName}</div>
                    <div className="text-xs text-stone-400 mt-1">Zidentyfikowano elementów: {drawing.elements.length}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(drawing.id); }} className="p-2 text-red-500 hover:bg-red-100 rounded-lg">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Element Mapping Panel */}
        {selectedDrawing && (
          <div className="border border-stone-200 bg-white rounded-2xl p-6">
            <h3 className="text-lg font-bold text-stone-800 mb-2">Mapowanie elementów: {selectedDrawing.clientOrderNumber}</h3>
            <p className="text-sm text-stone-500 mb-4">Połącz zidentyfikowane z PDF elementy EPS ze zleceniami produkcyjnymi zaimportowanymi z ERP.</p>
            
            {/* Podsumowanie materiałowe całej tablicy */}
            {(() => {
              const totalArea = selectedDrawing.elements.reduce((sum, el) => sum + (el.areaSquareMeters || 0), 0);
              const totalProfiles = selectedDrawing.elements.reduce((sum, el) => sum + (el.profilesLength || 0), 0);
              const totalFrame = selectedDrawing.elements.reduce((sum, el) => sum + (el.frameLength || 0), 0);

              // Unikalne fizyczne zamki liczone po stronach (dzielone przez 2, bo są dzielone między sąsiednie panele)
              const pageGroups: Record<number, typeof selectedDrawing.elements> = {};
              selectedDrawing.elements.forEach(el => {
                const p = el.page || 1;
                if (!pageGroups[p]) pageGroups[p] = [];
                pageGroups[p].push(el);
              });

              let totalLocks = 0;
              Object.values(pageGroups).forEach(els => {
                const pageLocksSum = els.reduce((sum, el) => sum + (el.locksLength || 0), 0);
                totalLocks += pageLocksSum;
              });

              return (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white p-3 rounded-lg border border-emerald-100/50 shadow-sm">
                    <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">M2 Tablicy</span>
                    <span className="text-stone-800 font-extrabold text-base">{totalArea.toFixed(3)} m²</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-emerald-100/50 shadow-sm">
                    <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">Suma Profili</span>
                    <span className="text-stone-800 font-extrabold text-base">{totalProfiles.toFixed(3)} m</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-emerald-100/50 shadow-sm">
                    <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">Suma Zamków</span>
                    <span className="text-stone-800 font-extrabold text-base">{totalLocks.toFixed(3)} m</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-emerald-100/50 shadow-sm">
                    <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">Suma Ramki</span>
                    <span className="text-stone-800 font-extrabold text-base">{totalFrame.toFixed(3)} m</span>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {[...selectedDrawing.elements].sort((a, b) => {
                const getNum = (name: string) => {
                  const match = name.match(/\d+/);
                  return match ? parseInt(match[0], 10) : 0;
                };
                return getNum(a.name) - getNum(b.name);
              }).map(element => (
                <div key={element.id} className="p-4 rounded-xl border border-stone-100 bg-stone-50 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-stone-800 text-lg">{element.name}</span>
                    {element.mappedOrderNumber ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1 text-sm bg-emerald-100 px-2 py-1 rounded-md"><Check size={14}/> {element.mappedOrderNumber}</span>
                    ) : (
                      <span className="text-amber-500 text-sm font-semibold flex items-center gap-1"><X size={14} /> Nieprzypisane</span>
                    )}
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <select 
                      className="flex-1 bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-stone-800"
                      value={element.mappedOrderId || ''}
                      onChange={(e) => handleMapElement(selectedDrawing.id, element.id, e.target.value)}
                    >
                      <option value="">-- Wybierz Zlecenie Produkcyjne --</option>
                      {orders
                        // Filtrujemy zlecenia np. po numerze zlecenia klienta z rysunku 
                        // Można też po prostu pokazać wszystkie pending/in-progress i pozwolić wyszukać
                        .filter(o => o.status !== 'completed')
                        .map(o => (
                          <option key={o.id} value={o.id}>
                            {o.orderNumber} - {o.productName} ({o.targetQuantity} szt.)
                          </option>
                        ))
                      }
                    </select>
                  </div>

                  {/* Szczegóły wymiarów i wyliczonych materiałów dla tego EPS */}
                  <div className="mt-2 bg-white rounded-lg p-3 border border-stone-200/60 grid grid-cols-2 gap-2 text-xs text-stone-600">
                    <div>
                      <span className="font-semibold text-stone-400 block uppercase tracking-wider text-[9px]">Wymiary panelu</span>
                      <span className="text-stone-800 font-medium">
                        {element.width && element.height ? `${element.width} x ${element.height} mm` : element.detectedDimension || 'Brak danych'}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-stone-400 block uppercase tracking-wider text-[9px]">Powierzchnia</span>
                      <span className="text-stone-800 font-bold">
                        {element.areaSquareMeters != null ? `${element.areaSquareMeters} m²` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-stone-400 block uppercase tracking-wider text-[9px]">Profile</span>
                      <span className="text-stone-800 font-bold">
                        {element.profilesLength != null ? `${element.profilesLength} m` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-stone-400 block uppercase tracking-wider text-[9px]">Zamki łączeniowe</span>
                      <span className="text-stone-800 font-bold">
                        {element.locksLength != null ? `${element.locksLength} m` : '-'}
                      </span>
                    </div>
                    <div className="col-span-2 border-t border-stone-100 pt-2 mt-1">
                      <span className="font-semibold text-stone-400 block uppercase tracking-wider text-[9px]">Ramka do oprawienia</span>
                      <span className="text-stone-800 font-bold">
                        {element.frameLength != null ? `${element.frameLength} m` : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {selectedDrawing.elements.length === 0 && (
                <div className="text-center p-6 text-stone-500">
                  Nie zidentyfikowano żadnych elementów typu "eps.X" na tym rysunku.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
