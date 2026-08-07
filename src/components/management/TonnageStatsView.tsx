import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { ProductionOrder, WorkLog, OrderElement } from '../../types';
import { getWeek } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Calendar, Loader2, Package, X, Filter } from 'lucide-react';

interface TonnageStatsViewProps {
  orders: ProductionOrder[];
}

export function TonnageStatsView({ orders }: TonnageStatsViewProps) {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const startOfYear = new Date(selectedYear, 0, 1);
        const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);

        const q = query(
          collection(db, 'workLogs'),
          where('startTime', '>=', Timestamp.fromDate(startOfYear)),
          where('startTime', '<=', Timestamp.fromDate(endOfYear))
        );

        const querySnapshot = await getDocs(q);
        const fetchedLogs: WorkLog[] = [];
        querySnapshot.forEach((doc) => {
          const log = doc.data() as WorkLog;
          if ((log.quantityReported && log.quantityReported > 0) || (log.quantity && log.quantity > 0)) {
            fetchedLogs.push({ ...log, id: doc.id });
          }
        });
        setLogs(fetchedLogs);
      } catch (error) {
        console.error("Błąd podczas pobierania logów:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [selectedYear]);

  const chartData = useMemo(() => {
    const weeklyStats: { [week: number]: { week: number, weekStr: string, konstrukcje: number, bariery: number, zbrojenia: number, astorDrobne: number, total: number } } = {};

    for (let i = 1; i <= 52; i++) {
      weeklyStats[i] = {
        week: i,
        weekStr: i.toString(),
        konstrukcje: 0,
        bariery: 0,
        zbrojenia: 0,
        astorDrobne: 0,
        total: 0
      };
    }

    logs.forEach(log => {
      if (!log.startTime) return;
      const logDate = log.startTime.toDate ? log.startTime.toDate() : new Date(log.startTime);
      const week = getWeek(logDate, { weekStartsOn: 1 });
      const qty = log.quantityReported || log.quantity || 0;
      
      let weight = 0;
      let category = log.assortmentCategory || 'Inne';
      const order = orders.find(o => o.id === log.orderId);

      if (order) {
        category = order.assortmentCategory || category;
        if (log.elementId && order.elements) {
          const element = order.elements.find(e => e.id === log.elementId);
          if (element && element.weight && element.quantity) {
             weight = (element.weight / element.quantity) * qty;
          } else if (element && element.weight) {
             weight = element.weight * qty;
          }
        } 
        if (weight === 0) {
          if (order.totalWeight && order.totalWeight > 0) {
            // totalWeight to waga 1 sztuki artykułu
            weight = order.totalWeight * qty;
          } else if (order.elements && order.elements.length > 0) {
            const sumElemWeight = order.elements.reduce((sum, el) => sum + (el.weight || 0), 0);
            weight = sumElemWeight * qty;
          }
        }
      }

      const weightInTonnes = weight / 1000;

      if (weeklyStats[week]) {
        if (category === 'Konstrukcje') {
          weeklyStats[week].konstrukcje += weightInTonnes;
        } else if (category === 'Bariery') {
          weeklyStats[week].bariery += weightInTonnes;
        } else if (category === 'Zbrojenia') {
          weeklyStats[week].zbrojenia += weightInTonnes;
        } else {
          weeklyStats[week].astorDrobne += weightInTonnes;
        }
        weeklyStats[week].total += weightInTonnes;
      }
    });

    return Object.values(weeklyStats);
  }, [logs, orders]);

  // Tabela szczegółowa - elementy z danego roku/tygodnia (zagregowane)
  const tableData = useMemo(() => {
    const aggregated = new Map<string, any>();

    logs.forEach(log => {
      const logDate = log.startTime.toDate ? log.startTime.toDate() : new Date(log.startTime);
      const week = getWeek(logDate, { weekStartsOn: 1 });
      
      if (selectedWeek !== null && week !== selectedWeek) return;

      const qty = log.quantityReported || log.quantity || 0;
      if (qty <= 0) return;

      const order = orders.find(o => o.id === log.orderId);
      if (!order) return;

      let category = order.assortmentCategory || log.assortmentCategory || 'Inne';
      let weight = 0;
      let elementName = null;

      if (log.elementId && order.elements) {
        const elementObj = order.elements.find(e => e.id === log.elementId);
        if (elementObj) {
          elementName = elementObj.name;
          // Tutaj obecnie dzielimy wagę całkowitą elementu przez jego ilość docelową i mnożymy przez zaraportowaną ilość.
          // Sprawdzamy czy to ma sens dla klienta.
          if (elementObj.weight && elementObj.quantity) {
             weight = (elementObj.weight / elementObj.quantity) * qty;
          } else if (elementObj.weight) {
             weight = elementObj.weight * qty;
          }
        }
      } 
      
      // Wymóg: Jeżeli artykuł składa się z elementów, licz TYLKO wagę skończonych elementów.
      if (!log.elementId && order.elements && order.elements.length > 0) {
        return; // Pomijamy raportowanie na poziomie całego zlecenia, jeśli są zdefiniowane elementy.
      }
      
      if (weight === 0 && !log.elementId) {
        if (order.totalWeight && order.totalWeight > 0) {
          weight = order.totalWeight * qty;
        } else if (order.elements && order.elements.length > 0) {
          const sumElemWeight = order.elements.reduce((sum, el) => sum + (el.weight || 0), 0);
          weight = sumElemWeight * qty;
        }
      }

      if (weight > 0) {
        if (!aggregated.has(order.id)) {
          aggregated.set(order.id, {
            id: order.id,
            kontrakt: order.projectNumber || '-',
            zlecenieProd: order.orderNumber || '-',
            zlecenieKlienta: order.erpOrderNumber || '-',
            artykul: order.productName || '-',
            kategoria: category,
            wagaCalkowita: 0,
            iloscSztuk: 0,
            elementsMap: new Map<string, { waga: number; ilosc: number }>()
          });
        }

        const row = aggregated.get(order.id);
        row.wagaCalkowita += weight;
        row.iloscSztuk += qty;
        
        if (elementName) {
          const curr = row.elementsMap.get(elementName) || { waga: 0, ilosc: 0 };
          row.elementsMap.set(elementName, {
            waga: curr.waga + weight,
            ilosc: curr.ilosc + qty
          });
        }
      }
    });

    const items = Array.from(aggregated.values()).map(row => ({
      ...row,
      elements: Array.from(row.elementsMap.entries()).map(([name, data]: [string, any]) => ({
        name,
        waga: data.waga,
        ilosc: data.ilosc
      }))
    }));

    // Sortuj wg wagi (od największej)
    return items.sort((a, b) => b.wagaCalkowita - a.wagaCalkowita);
  }, [logs, orders, selectedWeek]);

  // Podział na kategorie
  const categoryData = useMemo(() => {
    const map: { [key: string]: { title: string; color: string; items: typeof tableData; totalKg: number } } = {
      'Konstrukcje': { title: 'Konstrukcje', color: 'bg-blue-600 border-blue-200 text-blue-700', items: [], totalKg: 0 },
      'Bariery': { title: 'Bariery / Roboty', color: 'bg-amber-600 border-amber-200 text-amber-700', items: [], totalKg: 0 },
      'Zbrojenia': { title: 'Zbrojenia', color: 'bg-yellow-500 border-yellow-200 text-yellow-700', items: [], totalKg: 0 },
      'AstorDrobne': { title: 'Astor / Drobne / Inne', color: 'bg-emerald-600 border-emerald-200 text-emerald-700', items: [], totalKg: 0 },
    };

    tableData.forEach(item => {
      const cat = item.kategoria;
      let key = 'AstorDrobne';
      if (cat === 'Konstrukcje') key = 'Konstrukcje';
      else if (cat === 'Bariery') key = 'Bariery';
      else if (cat === 'Zbrojenia') key = 'Zbrojenia';

      map[key].items.push(item);
      map[key].totalKg += item.wagaCalkowita;
    });

    return map;
  }, [tableData]);

  const grandTotalKg = useMemo(() => {
    return tableData.reduce((sum, item) => sum + item.wagaCalkowita, 0);
  }, [tableData]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <BarChart className="text-emerald-600" />
            Zestawienie tonażu
          </h2>
          <p className="text-sm text-stone-500 mt-1">Podliczenie wagi wyprodukowanych elementów w czasie</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-stone-50 p-1.5 rounded-xl border border-stone-200">
            <Calendar className="text-stone-400 ml-2" size={16} />
            <select 
              className="bg-transparent border-none text-sm font-bold text-stone-700 outline-none pr-4 py-1 cursor-pointer"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(parseInt(e.target.value));
                setSelectedWeek(null);
              }}
            >
              {[2023, 2024, 2025, 2026, 2027].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center bg-stone-50 p-1.5 rounded-xl border border-stone-200">
            <Filter className="text-stone-400 ml-2" size={16} />
            <select 
              className="bg-transparent border-none text-sm font-bold text-stone-700 outline-none pr-4 py-1 cursor-pointer"
              value={selectedWeek || ''}
              onChange={(e) => setSelectedWeek(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">Cały rok</option>
              {Array.from({ length: 52 }, (_, i) => i + 1).map(week => (
                <option key={week} value={week}>Tydzień {week}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-4" />
          <p className="text-stone-500 font-medium">Pobieranie i obliczanie danych produkcyjnych...</p>
        </div>
      ) : (
        <>
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
            <h3 className="text-lg font-bold text-stone-800 mb-6 text-center">
              Łączna waga [t] - {selectedYear}
              {selectedWeek && <span className="text-emerald-600 ml-2">(Tydzień {selectedWeek})</span>}
            </h3>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="weekStr" 
                    tick={{fontSize: 12, fill: '#6b7280'}} 
                    tickMargin={10}
                    axisLine={{stroke: '#d1d5db'}}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{fontSize: 12, fill: '#6b7280'}}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => value.toFixed(2)}
                  />
                  <Tooltip 
                    cursor={{fill: '#f3f4f6'}}
                    contentStyle={{borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    formatter={(value: number) => [`${value.toFixed(2)} t`, '']}
                  />
                  <Legend 
                    wrapperStyle={{paddingTop: '20px'}}
                    iconType="circle"
                  />
                  <Bar dataKey="konstrukcje" name="Waga konstrukcji" stackId="a" fill="#2563eb" />
                  <Bar dataKey="bariery" name="Waga barier/roboty" stackId="a" fill="#d97706" />
                  <Bar dataKey="zbrojenia" name="Waga zbrojeń" stackId="a" fill="#facc15" />
                  <Bar dataKey="astorDrobne" name="Waga Astor / drobne" stackId="a" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-stone-400 mt-2">Wybierz tydzień z menu na górze, aby filtrować tabelę.</p>
          </div>

          {/* SUMY DLA KAŻDEJ KATEGORII */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Razem [Suma]</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-black text-stone-900">{(grandTotalKg / 1000).toFixed(2)} t</span>
                <span className="text-xs font-semibold text-stone-500">{grandTotalKg.toFixed(1)} kg</span>
              </div>
            </div>
            
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Konstrukcje</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-black text-blue-900">{(categoryData['Konstrukcje'].totalKg / 1000).toFixed(2)} t</span>
                <span className="text-xs font-semibold text-blue-700">{categoryData['Konstrukcje'].totalKg.toFixed(1)} kg</span>
              </div>
            </div>

            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Bariery / Roboty</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-black text-amber-900">{(categoryData['Bariery'].totalKg / 1000).toFixed(2)} t</span>
                <span className="text-xs font-semibold text-amber-700">{categoryData['Bariery'].totalKg.toFixed(1)} kg</span>
              </div>
            </div>

            <div className="bg-yellow-50/50 p-4 rounded-xl border border-yellow-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-yellow-800 uppercase tracking-wider">Zbrojenia</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-black text-yellow-900">{(categoryData['Zbrojenia'].totalKg / 1000).toFixed(2)} t</span>
                <span className="text-xs font-semibold text-yellow-700">{categoryData['Zbrojenia'].totalKg.toFixed(1)} kg</span>
              </div>
            </div>

            <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Astor / Drobne</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-black text-emerald-900">{(categoryData['AstorDrobne'].totalKg / 1000).toFixed(2)} t</span>
                <span className="text-xs font-semibold text-emerald-700">{categoryData['AstorDrobne'].totalKg.toFixed(1)} kg</span>
              </div>
            </div>
          </div>

          {/* OSOBNE TABELE DLA KAŻDEJ KATEGORII */}
          <div className="space-y-6">
            {Object.entries(categoryData).map(([key, cat]) => (
              <div key={key} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white border border-stone-200 rounded-lg flex items-center justify-center text-stone-500 shadow-sm">
                      <Package size={16} />
                    </div>
                    <div>
                      <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                        {cat.title}
                        {selectedWeek && <span className="text-emerald-600 font-normal">(Tydzień {selectedWeek})</span>}
                      </h3>
                      <p className="text-xs text-stone-500 mt-0.5">Suma kategorii: <strong className="text-stone-800">{cat.totalKg.toFixed(2)} kg</strong> ({(cat.totalKg / 1000).toFixed(3)} t)</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-stone-200 text-stone-700">
                    Pozycji: {cat.items.length}
                  </span>
                </div>
                
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-white border-b border-stone-200">
                        <th className="px-4 py-3 font-semibold text-stone-500">Kontrakt</th>
                        <th className="px-4 py-3 font-semibold text-stone-500">Zlecenia (Klient / Prod.)</th>
                        <th className="px-4 py-3 font-semibold text-stone-500">Nazwa (Artykuł)</th>
                        <th className="px-4 py-3 font-semibold text-stone-500">Kategoria</th>
                        <th className="px-4 py-3 font-semibold text-stone-500 text-right">Waga [kg]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {cat.items.slice(0, 50).map((row) => (
                        <tr key={row.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-stone-700">
                            {row.kontrakt}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-stone-600">
                            <div className="font-bold text-stone-800">{row.zlecenieKlienta}</div>
                            <div className="text-stone-500">{row.zlecenieProd}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="text-stone-800 font-medium">{row.artykul}</div>
                            {row.elements && row.elements.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {row.elements.map((el: any, i: number) => (
                                  <div key={i} className="text-stone-500 text-xs flex justify-between gap-4 before:content-['└'] before:mr-1">
                                    <span>{el.name}</span>
                                    <span className="font-medium">
                                      {el.waga.toFixed(2)} kg {el.ilosc > 1 && <span className="text-stone-400 font-normal ml-1">({el.ilosc} szt.)</span>}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-600">
                              {row.kategoria}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="font-bold text-stone-800">{row.wagaCalkowita.toFixed(2)}</div>
                            {row.iloscSztuk > 1 && (
                              <div className="text-[11px] font-medium text-stone-500">
                                {row.iloscSztuk} szt.
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {cat.items.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-stone-400 bg-stone-50/50 italic text-xs">
                            Brak pozycji w kategoria "{cat.title}" dla wybranego okresu.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
