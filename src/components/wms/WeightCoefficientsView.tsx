import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, Save, Settings2 } from 'lucide-react';
import { InventoryBatch } from '../../types';
import { cn } from '../../utils/firestore-helpers';

import { parseMaterialDimensions } from "../../utils/materialUtils";

interface ArticleData {
  id: string;
  articleNumber: string;
  articleName: string;
  coefficients: Set<string>;
  batchesCount: number;
  parsedDims: ReturnType<typeof parseMaterialDimensions>;
}

function guessPrefix(name: string, articleNumber?: string) {
  const nm = name.toLowerCase();
  if (nm.includes('płyta') || nm.includes('plyta')) return 'PL';
  if (nm.includes("blacha") || nm.startsWith("bl ") || nm.startsWith("bl.")) return "BL";
  if (nm.includes("profil")) return "PR";
  return "INNE";
}

export function WeightCoefficientsView() {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editedCoeffs, setEditedCoeffs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'inventoryBatches'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InventoryBatch));
      setBatches(fetched);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const articles = useMemo(() => {
    const map = new Map<string, ArticleData>();
    batches.forEach(b => {
      const prefix = guessPrefix(b.articleName || '', b.articleNumber);
      if ((prefix === 'BL' || prefix === 'PL') || prefix === 'PR') {
        const num = b.articleNumber?.trim() || b.articleName?.trim() || 'NIEZNANY';
        const coeff = b.coefficient?.trim() || '';
        const id = num;
        
        if (!map.has(id)) {
          map.set(id, {
            id,
            articleNumber: b.articleNumber || '',
            articleName: b.articleName || '',
            coefficients: new Set(coeff ? [coeff] : []),
            batchesCount: 1,
            parsedDims: parseMaterialDimensions(b.articleName || '')
          });
        } else {
          const existing = map.get(id)!;
          if (coeff) {
            existing.coefficients.add(coeff);
          }
          existing.batchesCount += 1;
        }
      }
    });
    
    let arr = Array.from(map.values());
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      arr = arr.filter(a => 
        (a.articleNumber || '').toLowerCase().includes(term) ||
        (a.articleName || '').toLowerCase().includes(term)
      );
    }
    
    return arr.sort((a, b) => {
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
      return a.articleName.localeCompare(b.articleName);
    });
  }, [batches, searchTerm]);

  const handleCoeffChange = (id: string, val: string) => {
    setEditedCoeffs(prev => ({ ...prev, [id]: val }));
  };

  const handleSave = async (article: ArticleData) => {
    const newVal = editedCoeffs[article.id];
    if (newVal === undefined) return;
    
    setSaving(true);
    try {
      const batchesToUpdate = batches.filter(b => {
        const id = b.articleNumber?.trim() || b.articleName?.trim() || 'NIEZNANY';
        return id === article.id && b.coefficient !== newVal;
      });
      
      const batchOp = writeBatch(db);
      batchesToUpdate.forEach(b => {
        if (b.id) {
          const ref = doc(db, 'inventoryBatches', b.id);
          batchOp.update(ref, { coefficient: newVal });
        }
      });
      
      await batchOp.commit();
      
      setEditedCoeffs(prev => {
        const next = { ...prev };
        delete next[article.id];
        return next;
      });
    } catch (e) {
      console.error(e);
      alert('Błąd podczas zapisu: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-500 font-bold">Ładowanie danych...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
          <Settings2 size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-stone-900 leading-tight">Przeliczniki wagowe</h1>
          <p className="text-sm font-bold text-stone-500">Zarządzaj współczynnikami do kalkulatorów inwentaryzacyjnych</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden flex flex-col h-[calc(100vh-180px)]">
        <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input 
              type="text"
              placeholder="Szukaj po indeksie lub nazwie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-black text-stone-400 uppercase tracking-wider border-b-2 border-stone-100">
                <th className="pb-3 px-2">Indeks</th>
                <th className="pb-3 px-2">Nazwa Artykułu</th>
                <th className="pb-3 px-2">Przypisane wagi</th>
                <th className="pb-3 px-2">Nowy Przelicznik Główny</th>
                <th className="pb-3 px-2">Wsadów</th>
                <th className="pb-3 px-2 w-32">Akcja</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {articles.map(a => {
                const isEdited = editedCoeffs[a.id] !== undefined;
                const currentVal = isEdited ? editedCoeffs[a.id] : (a.coefficients.size === 1 ? Array.from(a.coefficients)[0] : '');
                
                return (
                  <tr key={a.id} className="border-b border-stone-50 hover:bg-stone-50/50 group">
                    <td className="py-3 px-2 font-mono text-xs text-stone-500 font-bold">{a.articleNumber || '-'}</td>
                    <td className="py-3 px-2 font-bold text-stone-800">{a.articleName}</td>
                    <td className="py-3 px-2 text-stone-600 font-medium">
                      {a.coefficients.size > 0 ? Array.from(a.coefficients).join(', ') : '-'}
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="text"
                        value={currentVal}
                        onChange={e => handleCoeffChange(a.id, e.target.value)}
                        placeholder="np. 7.85"
                        className={cn(
                          "w-28 px-2 py-1 text-center font-bold border rounded-lg outline-none focus:ring-2",
                          isEdited ? "bg-amber-50 border-amber-300 text-amber-800 focus:ring-amber-200" : "bg-white border-stone-200 text-stone-700 focus:border-indigo-400 focus:ring-indigo-100"
                        )}
                      />
                    </td>
                    <td className="py-3 px-2 font-bold text-stone-400">{a.batchesCount}</td>
                    <td className="py-3 px-2">
                      {isEdited && (
                        <button
                          onClick={() => handleSave(a)}
                          disabled={saving}
                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
                        >
                          <Save size={14} />
                          Zapisz
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {articles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-400 font-bold">Brak artykułów spełniających kryteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
