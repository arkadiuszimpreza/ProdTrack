import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import * as XLSX from 'xlsx';
import { Download, Search, AlertCircle, Calendar, Users, Percent } from 'lucide-react';
import { motion } from 'motion/react';
import { format, startOfMonth, endOfMonth, getISOWeeksInYear, startOfISOWeek, endOfISOWeek, getISOWeek, getDate, getMonth, getYear } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Employee, WorkLog, AttendanceRecord } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface Props {
  employees: Employee[];
}

export function AttendanceOEEView({ employees }: Props) {
  const [reportMode, setReportMode] = useState<'month' | 'week'>('month');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(getISOWeek(new Date()));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchOEEData = async () => {
    setLoading(true);
    try {
      let start: Date;
      let end: Date;
      let attendanceRecords: AttendanceRecord[] = [];

      if (reportMode === 'month') {
        const attQ = query(collection(db, 'attendance'), where('year', '==', selectedYear), where('month', '==', selectedMonth));
        const attSnap = await getDocs(attQ);
        attendanceRecords = attSnap.docs.map(d => d.data() as AttendanceRecord);
        start = new Date(selectedYear, selectedMonth - 1, 1);
        end = endOfMonth(start);
      } else {
        const refDate = new Date(selectedYear, 0, 4);
        start = startOfISOWeek(new Date(refDate.getTime() + (selectedWeek - 1) * 7 * 24 * 60 * 60 * 1000));
        end = endOfISOWeek(start);
        
        // Fetch attendance for years involved in the week
        const years = Array.from(new Set([start.getFullYear(), end.getFullYear()]));
        for (const y of years) {
           const attQ = query(collection(db, 'attendance'), where('year', '==', y));
           const attSnap = await getDocs(attQ);
           attendanceRecords.push(...attSnap.docs.map(d => d.data() as AttendanceRecord));
        }
      }
      const logsQ = query(
        collection(db, 'workLogs'),
        where('startTime', '>=', Timestamp.fromDate(start)),
        where('startTime', '<=', Timestamp.fromDate(end))
      );
      const logsSnap = await getDocs(logsQ);
      const logs = logsSnap.docs.map(d => d.data() as WorkLog);
      
      const tabletTimes = new Map<string, number>();
      const manualTimes = new Map<string, number>();
      logs.filter(l => l.endTime != null).forEach(log => {
         const dur = log.duration || 0;
         if (log.manual) {
             const current = manualTimes.get(log.userId) || 0;
             manualTimes.set(log.userId, current + dur);
         } else {
             const current = tabletTimes.get(log.userId) || 0;
             tabletTimes.set(log.userId, current + dur);
         }
      });

      const oeeData: any[] = [];
      employees.forEach(emp => {
         let attHours = 0;
         let urlop = 0;
         let chorobowe = 0;
         let hasImport = false;

         if (reportMode === 'month') {
             const att = attendanceRecords.find(a => a.userId === emp.id && a.month === selectedMonth && a.year === selectedYear);
             attHours = att ? (att.totalHours || 0) : 0;
             if (att) hasImport = true;
             
             if (att && att.days) {
                Object.values(att.days).forEach(val => {
                   if (typeof val === 'string') {
                      const upper = val.toUpperCase();
                      if (upper === 'U') urlop++;
                      if (upper === 'CH') chorobowe++;
                   }
                });
             }
         } else {
             // iteruj po dniach od start do end
             for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
                 const m = dt.getMonth() + 1;
                 const y = dt.getFullYear();
                 const dayNum = dt.getDate();
                 
                 const att = attendanceRecords.find(a => a.userId === emp.id && a.year === y && a.month === m);
                 if (att) hasImport = true;
                 if (att && att.days && att.days[dayNum]) {
                     const val = att.days[dayNum];
                     if (typeof val === 'number') attHours += val;
                     else if (typeof val === 'string') {
                         const num = parseFloat(val);
                         if (!isNaN(num)) attHours += num;
                         else {
                             const upper = val.toUpperCase();
                             if (upper === 'U') urlop++;
                             if (upper === 'CH') chorobowe++;
                         }
                     }
                 }
             }
         }

         const tabletSecs = tabletTimes.get(emp.id) || 0;
         const manualSecs = manualTimes.get(emp.id) || 0;
         const tabletHours = tabletSecs / 3600;
         const manualHours = manualSecs / 3600;
         const workedHours = tabletHours + manualHours; 
         const oeePercent = attHours > 0 ? (tabletHours / attHours) * 100 : 0; 


         if (attHours > 0 || workedHours > 0 || hasImport) {
            oeeData.push({
               employeeName: `${emp.lastName} ${emp.firstName}`,
               employeeNumber: emp.employeeNumber || '-',
               group: emp.group || '-',
               attendanceHours: attHours,
               tabletHours,
               manualHours,
               workedHours: workedHours,
               oeePercent: oeePercent,
               urlop,
               chorobowe,
               hasImport
            });
         }
      });

      oeeData.sort((a, b) => b.oeePercent - a.oeePercent);
      setData(oeeData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOEEData();
  }, [selectedMonth, selectedYear, selectedWeek, reportMode, employees]);

  const exportExcel = () => {
    const exportData = data.map(row => ({
      'Nr Ewidencyjny': row.employeeNumber,
      'Pracownik': row.employeeName,
      'Grupa': row.group,
      'Czas w firmie (Excel) [h]': (row.attendanceHours || 0).toFixed(2).replace('.', ','),
      'Czas z Hali [h]': (row.tabletHours || 0).toFixed(2).replace('.', ','),
      'Wskaźnik (Hala / Excel) [%]': (row.oeePercent || 0).toFixed(1).replace('.', ','),
      'Urlop (dni)': row.urlop,
      'Chorobowe (dni)': row.chorobowe
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "OEE");
    const suffix = reportMode === 'month' ? selectedMonth : `T${selectedWeek}`;
    XLSX.writeFile(wb, `Bilans_${selectedYear}_${suffix}.xlsx`);
  };

  const filteredData = data.filter(d => 
    d.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.group.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.employeeNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
            <Percent size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-800 tracking-tight">Analiza Obecności</h2>
            <p className="text-stone-500 font-medium">Porównanie czasu zalogowania na zlecenia z listą obecności.</p>
          </div>
        </div>

        <div className="flex gap-4">
          <select
            value={reportMode}
            onChange={(e) => setReportMode(e.target.value as 'month' | 'week')}
            className="p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
          >
            <option value="month">Miesięczny</option>
            <option value="week">Tygodniowy</option>
          </select>

          {reportMode === 'month' ? (
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
            >
              {Array.from({length: 12}).map((_, i) => (
                <option key={i+1} value={i+1}>{format(new Date(2024, i, 1), 'LLLL', { locale: pl })}</option>
              ))}
            </select>
          ) : (
            <select 
              value={selectedWeek} 
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
            >
              {Array.from({length: getISOWeeksInYear(new Date(selectedYear, 0, 1))}).map((_, i) => (
                <option key={i+1} value={i+1}>Tydzień {i+1}</option>
              ))}
            </select>
          )}
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold outline-none"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800">
            <Download size={18} />
            Eksportuj
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
        <div className="mb-6 flex gap-4">
           <div className="relative flex-1 max-w-md">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
             <input
               type="text"
               placeholder="Szukaj pracownika..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
             />
           </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-stone-400 font-medium animate-pulse">Ładowanie danych...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="p-4 text-xs font-bold uppercase text-stone-400">Pracownik</th>
                  <th className="p-4 text-xs font-bold uppercase text-stone-400">Nr RCP</th>
                  <th className="p-4 text-xs font-bold uppercase text-stone-400">Grupa</th>
                  <th className="p-4 text-xs font-bold uppercase text-stone-400 text-right">Pobyt w Pracy</th>
                  <th className="p-4 text-xs font-bold uppercase text-stone-400 text-right">Czas Hala</th>
                  <th className="p-4 text-xs font-bold uppercase text-stone-400 text-right">Wskaźnik % (Hala)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-stone-50">
                    <td className="p-4 font-bold text-stone-800">
                       <div className="flex items-center gap-2">
                          {!row.hasImport && <span title="Brak zaimportowanej obecności"><AlertCircle size={14} className="text-red-500" /></span>}
                          {row.employeeName}
                       </div>
                    </td>
                    <td className="p-4 text-sm text-stone-500">{row.employeeNumber}</td>
                    <td className="p-4 text-sm text-stone-500">{row.group}</td>
                    <td className="p-4 text-right font-mono font-medium text-stone-600">
                       {(row.attendanceHours || 0).toFixed(2).replace('.', ',')} h
                       {row.urlop > 0 && <span className="ml-2 text-xs text-blue-500" title="Dni urlopu">({row.urlop}U)</span>}
                       {row.chorobowe > 0 && <span className="ml-2 text-xs text-red-500" title="Dni chorobowego">({row.chorobowe}CH)</span>}
                    </td>
                    <td className="p-4 text-right font-mono font-medium text-emerald-600">{(row.tabletHours || 0).toFixed(2).replace('.', ',')} h</td>
                    <td className="p-4 text-right font-mono font-black">
                       <span className={cn("px-3 py-1 rounded-full", 
                          row.oeePercent >= 85 ? "bg-emerald-100 text-emerald-700" : 
                          row.oeePercent >= 70 ? "bg-amber-100 text-amber-700" : 
                          "bg-red-100 text-red-700")}>
                          {(row.oeePercent || 0).toFixed(1).replace('.', ',')}% 
                       </span>
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-stone-500 font-medium">Brak danych dla wybranego okresu</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
