import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { ArchiveRestore, Calendar, User, FileText, Hash, Ruler, Search } from 'lucide-react';
import { format } from 'date-fns';

export function ArchivedCountsView() {
  const [archivedCounts, setArchivedCounts] = useState<any[]>([]);
  const [batchesMap, setBatchesMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch archived counts
        const qCounts = query(
          collection(db, 'inventoryCounts')
        );
        const countSnap = await getDocs(qCounts);
        const counts = countSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort counts client-side by createdAt (descending) 
        // since we can't easily compound query without creating an index
        counts.sort((a: any, b: any) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });

        // Fetch all batches to map batchId to article data
        const qBatches = query(collection(db, 'inventoryBatches'));
        const batchSnap = await getDocs(qBatches);
        const bMap: Record<string, any> = {};
        batchSnap.docs.forEach(doc => {
          bMap[doc.id] = doc.data();
        });

        setArchivedCounts(counts);
        setBatchesMap(bMap);
      } catch (err) {
        console.error('Error fetching archived counts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-stone-500 font-bold">Ładowanie archiwalnych zliczeń...</div>;
  }

  const filteredCounts = archivedCounts.filter(count => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const batch = batchesMap[count.batchId] || {};
    return (
      (batch.articleName && batch.articleName.toLowerCase().includes(term)) ||
      (batch.articleNumber && batch.articleNumber.toLowerCase().includes(term)) ||
      (batch.batchNumber && batch.batchNumber.toLowerCase().includes(term)) ||
      (count.batchId && count.batchId.toLowerCase().includes(term)) ||
      (count.calculatorDetails && count.calculatorDetails.toLowerCase().includes(term)) ||
      (count.createdBy && count.createdBy.toLowerCase().includes(term))
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-800 flex items-center space-x-2">
            <ArchiveRestore className="text-amber-500" />
            <span>Pełna Historia Zliczeń</span>
          </h2>
          <p className="text-stone-500 text-sm mt-1">Historia wszystkich wpisów, w tym starszych i nadpisanych odcinków w trakcie spisu.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          <input
            type="text"
            placeholder="Szukaj po indeksie, nr wsadu..."
            className="pl-10 pr-4 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white shadow-sm w-64"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold">
              <tr>
                <th className="p-4">Data i Czas</th>
                <th className="p-4">Zliczył / Zmienił</th>
                <th className="p-4">Indeks / Nr Wsadu</th>
                <th className="p-4">Szczegóły kalkulatora</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Zliczona ilość</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredCounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-400">Brak zliczeń we fragmencie.</td>
                </tr>
              ) : (
                filteredCounts.map(count => {
                  const batch = batchesMap[count.batchId] || {};
                  
                  let dateStr = '-';
                  if (count.createdAt?.seconds) {
                    dateStr = format(new Date(count.createdAt.seconds * 1000), 'yyyy-MM-dd HH:mm:ss');
                  }

                  return (
                    <tr key={count.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-stone-600">
                          <Calendar size={14} className="text-stone-400" />
                          <span className="font-mono text-xs">{dateStr}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-stone-700 font-medium">
                          <User size={14} className="text-indigo-400" />
                          {count.createdBy || 'System'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-stone-800 font-bold">
                            <Hash size={14} className="text-emerald-500" />
                            {batch.articleNumber ? `${batch.articleNumber} - ` : ''}{batch.articleName || 'Nieznany indeks'}
                          </div>
                          <div className="flex items-center gap-1.5 text-stone-500 text-xs">
                            <span className="bg-stone-100 px-1.5 py-0.5 rounded font-mono text-[10px] border border-stone-200">
                              Nr Wsadu: {batch.batchNumber || count.batchId}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-stone-400" />
                          <span className="text-stone-600 italic">
                            {count.calculatorDetails || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        {count.archived === true ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-widest">
                            Archived: True
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-widest">
                            Archived: False
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-lg">
                          <Ruler size={14} />
                          <span className="font-black text-lg">{count.quantity}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
