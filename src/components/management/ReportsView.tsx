import React, { useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import * as XLSX from 'xlsx';
import { BarChart3, FileDown, ArrowUp, ArrowDown, Users, Package, History, Printer, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek } from 'date-fns';
import { motion } from 'motion/react';

// Importy typów
import { WorkLog, Employee, ProductionOrder } from '../../types';
import { handleFirestoreError, OperationType } from '../../utils/firestore-helpers';

const HOURLY_RATE = 65.00;

export function ReportsView({ employees, orders }: { employees: Employee[], orders: ProductionOrder[] }) {
  const [startDate, setStartDate] = useState(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfDay(new Date()), 'yyyy-MM-dd'));
  
  // ZMIANA: Dodano 'audit' do typów
  const [reportType, setReportType] = useState<'groups' | 'daily_master' | 'work_cards' | 'audit' | 'oee'>('audit');
  
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState<string>('employeeName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const uniqueGroups = Array.from(new Set(employees.map(e => e.group).filter(Boolean))) as string[];

  React.useEffect(() => {
    if (!selectedGroup && uniqueGroups.length > 0) {
      setSelectedGroup(uniqueGroups[0]);
    }
  }, [uniqueGroups, selectedGroup]);

  const generateReport = async () => {
    setLoading(true);
    try {
      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));

      const q = query(
        collection(db, 'workLogs'),
        where('startTime', '>=', Timestamp.fromDate(start)),
        where('startTime', '<=', Timestamp.fromDate(end))
      );

      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as WorkLog[];
      const completedLogs = logs.filter(log => log.endTime != null);

      // Dociąganie archiwalnych zleceń
      const fetchedArchivedOrders = new Map<string, ProductionOrder>();
      const missingOrderIds = Array.from(new Set(
        completedLogs.map(l => l.orderId).filter((id): id is string => !!id && !orders.find(o => o.id === id))
      ));

      if (missingOrderIds.length > 0) {
        for (let i = 0; i < missingOrderIds.length; i += 30) {
          const chunk = missingOrderIds.slice(i, i + 30);
          const ordersQ = query(collection(db, 'orders'), where('__name__', 'in', chunk));
          const ordersSnap = await getDocs(ordersQ);
          ordersSnap.docs.forEach(doc => {
            fetchedArchivedOrders.set(doc.id, { ...doc.data(), id: doc.id } as ProductionOrder);
          });
        }
      }

      const findOrder = (id?: string | null) => {
        if (!id) return null;
        return orders.find(o => o.id === id) || fetchedArchivedOrders.get(id);
      };

      if (reportType === 'audit') {
        // --- NOWY RAPORT: AUDYT WDROŻENIA (Pracownik -> Data -> Porównanie ZP) ---
        const empMap = new Map<string, any>();

        completedLogs.forEach(log => {
          const empId = log.userId;
          const dateStr = format(log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime), 'yyyy-MM-dd');
          
          // Usuwamy "ratowanie" przez orderFallback zgodnie z zaleceniem - Praca ogólna to Praca ogólna.
          // Używamy String().trim() by zapobiec dublowaniu kiedy jeden to int 151528 a drugi to string "151528".
          let rawOrderNum = log.orderNumber || 'Praca ogólna';
          if (rawOrderNum === 'Praca Ogólna') rawOrderNum = 'Praca ogólna'; // Ujednolicenie wielkości liter
          const orderNum = String(rawOrderNum).trim();

          if (!empMap.has(empId)) {
            const emp = employees.find(e => e.id === empId);
            empMap.set(empId, { 
              employeeName: emp ? `${emp.lastName} ${emp.firstName}` : log.userName, 
              group: emp?.group || '-',
              datesMap: new Map() 
            });
          }
          const empData = empMap.get(empId);

          if (!empData.datesMap.has(dateStr)) {
            empData.datesMap.set(dateStr, new Map());
          }
          const dateData = empData.datesMap.get(dateStr);

          if (!dateData.has(orderNum)) {
            dateData.set(orderNum, { 
              orderNumber: orderNum, 
              tabletH: 0, 
              tabletQty: 0, 
              manualH: 0, 
              manualQty: 0, 
              hasTablet: false, 
              hasManual: false,
              tabletCategories: new Set<string>(),
              manualCategories: new Set<string>()
            });
          }
          const orderData = dateData.get(orderNum);

          const hours = (log.duration || 0) / 3600;
          const qty = log.quantityReported || 0;

          if (log.manual) {
            orderData.manualH += hours;
            orderData.manualQty += qty;
            orderData.hasManual = true;
            if (log.assortmentCategory) orderData.manualCategories.add(log.assortmentCategory);
          } else {
            orderData.tabletH += hours;
            orderData.tabletQty += qty;
            orderData.hasTablet = true;
            if (log.assortmentCategory) orderData.tabletCategories.add(log.assortmentCategory);
          }
        });

        // Konwersja na tablicę do wyrenderowania
        const result = Array.from(empMap.values()).map(emp => ({
          employeeName: emp.employeeName,
          group: emp.group,
          dates: Array.from(emp.datesMap.entries()).map(([d, oMap]) => ({
            date: d,
            orders: Array.from((oMap as Map<string, any>).values()).sort((a, b) => a.orderNumber.localeCompare(b.orderNumber))
          })).sort((a, b) => a.date.localeCompare(b.date)) // Sortowanie dat rosnąco
        }));

        setReportData(result);
        setSortField('employeeName'); // domyślne sortowanie

      } else if (reportType === 'work_cards') {
        // --- RAPORT: KARTY PRACY PRACOWNIKÓW ---
        const groupedByWorker = new Map<string, any>();

        completedLogs.forEach(log => {
          if (!groupedByWorker.has(log.userId)) {
            const employee = employees.find(e => e.id === log.userId);
            groupedByWorker.set(log.userId, {
              employeeName: employee ? `${employee.lastName} ${employee.firstName}` : log.userName,
              group: employee?.group || '-',
              logs: []
            });
          }

          const order = findOrder(log.orderId);
          const startTs = log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime);
          const endTs = log.endTime instanceof Timestamp ? log.endTime.toDate() : new Date(log.endTime!);
          
          let rawNum = log.orderNumber || 'Praca ogólna';
          if (rawNum === 'Praca Ogólna') rawNum = 'Praca ogólna';
          const safeOrderNum = String(rawNum).trim();
          
          const orderTotalReported = (order?.erpReportedQuantity || order?.reportedQuantity || 0) + (order?.appReportedQuantity || 0);

          groupedByWorker.get(log.userId).logs.push({
            id: log.id,
            startTime: startTs,
            endTime: endTs,
            orderNumber: safeOrderNum,
            productName: order?.productName || log.productName || 'Praca Ogólna',
            duration: log.duration || 0,
            category: log.assortmentCategory || 'Inne',
            targetQuantity: order?.targetQuantity || 0,
            totalReportedOnOrder: orderTotalReported,
            logQuantity: log.quantityReported || 0,
            isManual: !!log.manual
          });
        });

        const result = Array.from(groupedByWorker.values()).map(worker => ({
          ...worker,
          logs: worker.logs.sort((a: any, b: any) => a.startTime.getTime() - b.startTime.getTime())
        }));

        setReportData(result);
        setSortField('employeeName');
      } else if (reportType === 'daily_master') {
        const tasksMap = new Map<string, any>();
        const uniqueActiveOrderIds = Array.from(new Set(completedLogs.map(l => l.orderId).filter(Boolean))) as string[];
        const historicalLogs: WorkLog[] = [];
        
        if (uniqueActiveOrderIds.length > 0) {
          for (let i = 0; i < uniqueActiveOrderIds.length; i += 30) {
            const chunk = uniqueActiveOrderIds.slice(i, i + 30);
            const histQ = query(
              collection(db, 'workLogs'), 
              where('orderId', 'in', chunk), 
              where('startTime', '<', Timestamp.fromDate(start))
            );
            const histSnap = await getDocs(histQ);
            histSnap.docs.forEach(doc => { 
              const data = doc.data() as WorkLog; 
              if (data.endTime) historicalLogs.push(data); 
            });
          }
        }
        
        const historyMap = new Map<string, { duration: number, quantity: number, dates: Set<string> }>();
        historicalLogs.forEach(log => {
          let rawNum = log.orderNumber || 'Praca ogólna';
          if (rawNum === 'Praca Ogólna') rawNum = 'Praca ogólna';
          const safeOrderNum = String(rawNum).trim();
          const key = `${safeOrderNum}_${log.elementId || 'whole'}`;
          if (!historyMap.has(key)) historyMap.set(key, { duration: 0, quantity: 0, dates: new Set() });
          const entry = historyMap.get(key)!;
          entry.duration += log.duration || 0; 
          entry.quantity += log.quantityReported || 0;
          entry.dates.add(format(log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime), 'dd.MM.yyyy'));
        });
        
        completedLogs.forEach(log => {
          const order = findOrder(log.orderId);
          let rawNum = log.orderNumber || 'Praca ogólna';
          if (rawNum === 'Praca Ogólna') rawNum = 'Praca ogólna';
          const safeOrderNum = String(rawNum).trim();
          const taskKey = `${safeOrderNum}_${log.elementId || 'whole'}`;
          if (!tasksMap.has(taskKey)) {
            const element = order?.elements?.find(e => e.id === log.elementId);
            const unitWeight = log.elementId ? (element?.weight || 0) : (order?.totalWeight || 0);
            const hist = historyMap.get(taskKey) || { duration: 0, quantity: 0, dates: new Set<string>() };
            tasksMap.set(taskKey, { 
              orderNumber: safeOrderNum, 
              projectName: order?.projectNumber || '-', 
              elementName: log.elementName || order?.productName || 'Praca Ogólna', 
              targetQuantity: order?.targetQuantity || 0, 
              unitWeight, 
              totalReportedQuantity: 0, 
              totalDurationAllWorkers: 0, 
              historicalDuration: hist.duration, 
              historicalQuantity: hist.quantity, 
              historicalDates: Array.from(hist.dates).sort(), 
              workerLogs: [] 
            });
          }
          const task = tasksMap.get(taskKey)!;
          task.totalReportedQuantity += (log.quantityReported || 0); 
          task.totalDurationAllWorkers += (log.duration || 0);
          task.workerLogs.push({ 
            employeeName: log.userName, 
            duration: log.duration || 0, 
            originalQuantity: log.quantityReported || 0,
            isManual: !!log.manual
          });
        });
        
        const result: any[] = [];
        tasksMap.forEach(task => {
          const cumulativeDuration = task.totalDurationAllWorkers + task.historicalDuration;
          const cumulativeQuantity = task.totalReportedQuantity + task.historicalQuantity;
          let taskPlnPerKg = 0;
          if (cumulativeQuantity > 0 && task.unitWeight > 0) {
            taskPlnPerKg = ((cumulativeDuration / 3600) * HOURLY_RATE) / (cumulativeQuantity * task.unitWeight);
          }
          const processedWorkers = task.workerLogs.map((wl: any) => ({ 
            ...wl, 
            proportionalQuantity: Number((task.totalDurationAllWorkers > 0 ? (wl.duration / task.totalDurationAllWorkers) * task.totalReportedQuantity : 0).toFixed(2)) 
          }));
          result.push({ ...task, plnPerKg: taskPlnPerKg, workerLogs: processedWorkers });
        });
        
        setReportData(result);
        setSortField('orderNumber');
      } else if (reportType === 'groups') {
        const aggregated = new Map<string, any>();
        completedLogs.forEach(log => {
          const dateStr = format(log.startTime instanceof Timestamp ? log.startTime.toDate() : new Date(log.startTime), 'yyyy-MM-dd');
          const employee = employees.find(e => e.id === log.userId);
          
          const isManual = !!log.manual; 
          const key = `${dateStr}_${log.userId}_${log.assortmentCategory || 'Inne'}_${isManual}`;
          
          if (!aggregated.has(key)) {
            aggregated.set(key, { 
              date: dateStr, 
              employeeName: employee ? `${employee.lastName} ${employee.firstName}` : log.userName, 
              group: employee?.group || '-', 
              position: employee?.position || '-', 
              category: log.assortmentCategory || 'Inne', 
              isManual: isManual, 
              totalDuration: 0 
            });
          }
          aggregated.get(key).totalDuration += log.duration;
        });
        setReportData(Array.from(aggregated.values()));
        setSortField('date');
} else if (reportType === 'oee') {
        // Zliczanie czasu na zleceniach z workLogs (tylko ukończone)
        const workTimes = new Map<string, number>();
        completedLogs.forEach(log => {
          const current = workTimes.get(log.userId) || 0;
          workTimes.set(log.userId, current + (log.duration || 0));
        });
        
        // Pobierz obecności z wybranego miesiąca (na podst. startDate)
        const startMonth = new Date(start).getMonth() + 1;
        const startYear = new Date(start).getFullYear();
        
        const attQ = query(collection(db, 'attendance'), where('year', '==', startYear), where('month', '==', startMonth));
        const attSnap = await getDocs(attQ);
        const attendanceRecords = attSnap.docs.map(d => d.data());
        
        const oeeData: any[] = [];
        
        employees.forEach(emp => {
           const att = attendanceRecords.find(a => a.userId === emp.id);
           const attHours = att ? att.totalHours : 0;
           const workedSecs = workTimes.get(emp.id) || 0;
           const workedHours = workedSecs / 3600;
           const oeePercent = attHours > 0 ? (workedHours / attHours) * 100 : 0;
           
           if (attHours > 0 || workedHours > 0) {
              oeeData.push({
                 employeeName: `${emp.lastName} ${emp.firstName}`,
                 group: emp.group || '-',
                 position: emp.position || '-',
                 attendanceHours: attHours,
                 workedHours: workedHours,
                 oeePercent: oeePercent,
                 details: att ? JSON.stringify(att.days) : ''
              });
           }
        });
        setReportData(oeeData);
        setSortField('oeePercent');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'workLogs');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const sortedData = [...reportData].sort((a, b) => {
    let valA = a[sortField]; let valB = b[sortField];
    if (typeof valA === 'string' && typeof valB === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIndicator = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />;
  };

  const exportToExcel = () => {
    let data: any[] = [];
    let fileName = '';

    if (reportType === 'audit') {
      sortedData.forEach(emp => {
        emp.dates.forEach((dateObj: any) => {
          dateObj.orders.forEach((row: any) => {
            data.push({
              'Pracownik': emp.employeeName,
              'Data': dateObj.date,
              'Zlecenie': row.orderNumber,
              'Czas TABLET (h)': row.tabletH.toFixed(2).replace('.', ','),
              'Czas MISTRZ (h)': row.manualH.toFixed(2).replace('.', ','),
              'Różnica Czasu (h)': (row.tabletH - row.manualH).toFixed(2).replace('.', ','),
              'Sztuki TABLET': row.tabletQty,
              'Sztuki MISTRZ': row.manualQty,
              'Różnica Sztuk': row.tabletQty - row.manualQty,
              'Status': row.hasTablet && row.hasManual ? 'Bieg Równoległy' : (row.hasTablet ? 'Tylko Tablet' : 'Tylko Mistrz')
            });
          });
        });
      });
      fileName = `Audyt_Wdrozenia_${startDate}_${endDate}.xlsx`;
    } else if (reportType === 'work_cards') {
      sortedData.forEach(worker => {
        worker.logs.forEach((l: any) => {
          data.push({
            'Pracownik': worker.employeeName,
            'Grupa': worker.group,
            'Data': format(l.startTime, 'dd.MM.yyyy'),
            'Godzina od': format(l.startTime, 'HH:mm'),
            'Godzina do': format(l.endTime, 'HH:mm'),
            'Zlecenie (ZP)': l.orderNumber,
            'Nazwa artykułu': l.productName,
            'Czas (h)': (l.duration / 3600).toFixed(2).replace('.', ','),
            'Ilość planowana (ZP)': l.targetQuantity,
            'Suma wykonana (ZP)': l.totalReportedOnOrder,
            'Zaraportowano (Meldunek)': l.logQuantity,
            'Źródło': l.isManual ? 'Ręczne' : 'Tablet',
            'Kategoria': l.category
          });
        });
      });
      fileName = `Karty_Pracy_${startDate}_${endDate}.xlsx`;
    } else if (reportType === 'daily_master') {
      sortedData.forEach(task => {
        task.workerLogs.forEach((worker: any) => {
          data.push({
            'Zlecenie (ZP)': task.orderNumber, 
            'Projekt': task.projectName, 
            'Ilość planowana': task.targetQuantity, 
            'Waga (kg/szt.)': task.unitWeight, 
            'Zadanie/Element': task.elementName, 
            'Pracownik': worker.employeeName, 
            'Czas dzisiaj (h)': (worker.duration / 3600).toFixed(2).replace('.', ','), 
            'Źródło': worker.isManual ? 'Ręczne' : 'Tablet',
            'Czas historyczny sumaryczny (h)': task.historicalDuration > 0 ? (task.historicalDuration / 3600).toFixed(2).replace('.', ',') : '0', 
            'Daty historyczne': task.historicalDates.join(', '), 
            'Ilość wpisana przez prac.': worker.originalQuantity, 
            'Ilość obliczona (System)': worker.proportionalQuantity.toString().replace('.', ','), 
            'ZŁ/KG (Całkowite zlecenia z historią)': task.plnPerKg > 0 ? task.plnPerKg.toFixed(2).replace('.', ',') : '-'
          });
        });
      });
      fileName = `Karta_Dniowki_Mistrza_${startDate}_${endDate}.xlsx`;
    } else if (reportType === 'oee') {
      data = sortedData.map(row => ({
         'Pracownik': row.employeeName,
         'Grupa': row.group,
         'Pobyt z listy obecności (h)': (row.attendanceHours || 0).toFixed(2).replace('.', ','),
         'Czas z logów zleceń (h)': (row.workedHours || 0).toFixed(2).replace('.', ','),
         'Wskaźnik OEE (%)': (row.oeePercent || 0).toFixed(1).replace('.', ',')
       }));
      fileName = `Eksport_OEE_${startDate}_${endDate}.xlsx`;
    } else if (reportType === 'groups') {
      data = sortedData.map(row => ({
         'Data': row.date.replace(/-/g, '.'),
         'Imię i Nazwisko': row.employeeName,
         'Grupa': row.group,
         'Stanowisko': row.position,
         'Kategoria': row.category,
         'Typ meldunku': row.isManual ? 'Ręczny (Mistrz)' : 'Hala (Tablet)',
        'Liczba godzin': (row.totalDuration / 3600).toFixed(2).replace('.', ',')
       }));
      fileName = `Eksport_godzin_na_grupy_${startDate}_${endDate}.xlsx`;
    } else if (reportType === 'groups') {
      data = sortedData.map(row => ({ 
        'Data': row.date.replace(/-/g, '.'), 
        'Imię i Nazwisko': row.employeeName, 
        'Grupa': row.group, 
        'Stanowisko': row.position, 
        'Kategoria': row.category, 
        'Typ meldunku': row.isManual ? 'Ręczny (Mistrz)' : 'Hala (Tablet)',
        'Liczba godzin': (row.totalDuration / 3600).toFixed(2).replace('.', ',') 
      }));
      fileName = `Eksport_godzin_na_grupy_${startDate}_${endDate}.xlsx`;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Raport");
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="space-y-6 print:space-y-4 print:bg-white">
      {/* Panel filtrów ukrywany przy wydruku */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200 print:hidden">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
            <BarChart3 size={20} />
          </div>
          <h2 className="text-xl font-bold">Generator Raportów</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="space-y-2 lg:col-span-2">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Rodzaj raportu</label>
            <select 
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as any);
                setReportData([]); 
              }}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold"
            >
              <option value="audit">📈 Audyt Wdrożenia i Różnic (Do analizy z pracownikiem)</option>
              <option value="work_cards">📇 Karty Pracy Pracowników (Godziny i Ilości)</option>
              <option value="daily_master">📄 Karta Dniówki dla Mistrza (Z weryfikacją PLN/kg)</option>
              <option value="groups">📊 Eksport godzin na grupy do wskaźników</option>
              <option value="oee">🎯 OEE - Wykorzystanie czasu na zleceniach (z list obecności)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Data od</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Data do</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <div className="lg:col-span-4">
            <button onClick={generateReport} disabled={loading} className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all active:scale-95 disabled:opacity-50">
              {loading ? 'Generowanie...' : 'Generuj Raport'}
            </button>
          </div>
        </div>
      </div>

      {reportData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex justify-between items-center print:hidden">
            <h3 className="font-bold text-stone-900">Wyniki raportu ({reportData.length})</h3>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-stone-100 text-stone-700 rounded-xl font-bold text-sm hover:bg-stone-200 transition-all active:scale-95">
                <Printer size={18} /> Drukuj (A4)
              </button>
              <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all active:scale-95">
                <FileDown size={18} /> Eksportuj do Excel
              </button>
            </div>
          </div>

          {/* RENDEROWANIE AUDYTU */}
          {reportType === 'audit' && (
            <div className="space-y-8 print:space-y-4">
              {/* Tytuł widoczny tylko podczas druku */}
              <div className="hidden print:block text-center mb-2">
                <h1 className="text-xl font-black text-stone-900">Audyt Wdrożenia i Różnic</h1>
                <p className="text-stone-500 font-bold text-xs">Okres: {startDate} - {endDate}</p>
              </div>

              {sortedData.map((emp, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden print:shadow-none print:border-stone-300 print:break-inside-avoid print:rounded-none">
                  {/* Nagłówek pracownika */}
                  <div className="bg-stone-800 print:bg-stone-200 p-4 print:p-2 print:border-b print:border-stone-300 flex items-center gap-3">
                    <Users size={16} className="text-emerald-400 print:text-stone-700" />
                    <h4 className="text-white print:text-stone-900 font-black text-base print:text-sm">{emp.employeeName}</h4>
                    <span className="text-stone-400 print:text-stone-600 text-xs print:text-[10px] font-bold uppercase tracking-widest ml-2">Grupa: {emp.group}</span>
                  </div>
                  
                  {/* JEDNA ZBIORCZA TABELA DLA PRACOWNIKA */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm print:text-[9px]">
                      <thead>
                        <tr className="bg-stone-50 print:bg-white text-[10px] print:text-[8px] font-black uppercase text-stone-500 border-b-2 border-stone-300 print:border-stone-400">
                          <th className="py-2 px-3 print:py-1 print:px-1 border-r border-stone-100 print:border-stone-300 w-24">Data</th>
                          <th className="py-2 px-3 print:py-1 print:px-1 border-r border-stone-100 print:border-stone-300">Zlecenie</th>
                          <th className="py-2 px-3 print:py-1 print:px-1 text-center bg-stone-100/50 print:bg-transparent">Czas (Tablet)</th>
                          <th className="py-2 px-3 print:py-1 print:px-1 text-center bg-stone-100/50 print:bg-transparent border-r border-stone-100 print:border-stone-300">Czas (Mistrz)</th>
                          <th className="py-2 px-3 print:py-1 print:px-1 text-center">Sztuki (Tablet)</th>
                          <th className="py-2 px-3 print:py-1 print:px-1 text-center border-r border-stone-100 print:border-stone-300">Sztuki (Mistrz)</th>
                          <th className="py-2 px-3 print:py-1 print:px-1 text-center">Status / Różnica</th>
                        </tr>
                      </thead>
                      {/* Usunięto divide-y, sterujemy borderami ręcznie na poziomie wiersza (tr) */}
                      <tbody>
                        {emp.dates.map((dateObj: any, dIdx: number) => (
                          dateObj.orders.map((row: any, oIdx: number) => {
                            const diffH = Math.abs(row.tabletH - row.manualH);
                            const diffQty = Math.abs(row.tabletQty - row.manualQty);
                            const isError = (row.hasTablet && row.hasManual) && (diffH > 0.1 || diffQty > 0);
                            
                            // LOGIKA: Czy to jest pierwsza pozycja w nowym dniu? (Pomijamy sam początek tabeli)
                            const isNewDateGroup = dIdx > 0 && oIdx === 0;

                            return (
                              <tr 
                                key={`${dateObj.date}-${oIdx}`} 
                                className={`
                                  border-b border-stone-100 print:border-stone-200 
                                  ${isNewDateGroup ? 'border-t-2 border-t-stone-300 print:border-t-stone-500' : ''}
                                  ${isError ? 'bg-red-50/50 print:bg-red-50/30' : 'hover:bg-stone-50 print:hover:bg-transparent'}
                                `}
                              >
                                <td className="py-1 px-3 print:py-0.5 print:px-1 font-bold text-stone-600 border-r border-stone-100 print:border-stone-300 whitespace-nowrap">
                                  {/* Pokaż datę tylko w pierwszym wierszu dla danej grupy dat */}
                                  {oIdx === 0 ? dateObj.date : ''}
                                </td>
                                <td className="py-1 px-3 print:py-0.5 print:px-1 font-bold text-stone-800 border-r border-stone-100 print:border-stone-300">
                                  {String(row.orderNumber).toLowerCase().includes('praca') ? row.orderNumber : `ZP: ${row.orderNumber}`}
                                  {row.tabletCategories?.size > 0 && (
                                    <span className="text-[10px] text-stone-400 font-normal ml-1 print:text-[8px]">
                                      ({Array.from(row.tabletCategories).join(', ')})
                                    </span>
                                  )}
                                </td>
                                
                                <td className="py-1 px-3 print:py-0.5 print:px-1 text-center font-mono text-emerald-600 print:text-stone-800 bg-stone-50/30 print:bg-transparent font-bold">
                                  {row.tabletH > 0 ? row.tabletH.toFixed(2) + 'h' : '-'}
                                </td>
                                <td className="py-1 px-3 print:py-0.5 print:px-1 text-center font-mono text-amber-600 print:text-stone-800 bg-stone-50/30 print:bg-transparent font-bold border-r border-stone-100 print:border-stone-300">
                                  {row.manualH > 0 ? (
                                    <span>
                                      {row.manualH.toFixed(2)}h
                                      {row.manualCategories?.size > 0 && (
                                        <span className="text-[10px] font-sans text-stone-400 font-normal ml-1 print:text-[8px]">
                                          ({Array.from(row.manualCategories).join(', ')})
                                        </span>
                                      )}
                                    </span>
                                  ) : '-'}
                                </td>
                                
                                <td className="py-1 px-3 print:py-0.5 print:px-1 text-center font-mono text-emerald-600 print:text-stone-800 font-bold">
                                  {row.tabletQty > 0 ? row.tabletQty : '-'}
                                </td>
                                <td className="py-1 px-3 print:py-0.5 print:px-1 text-center font-mono text-amber-600 print:text-stone-800 font-bold border-r border-stone-100 print:border-stone-300">
                                  {row.manualQty > 0 ? row.manualQty : '-'}
                                </td>
                                
                                <td className="py-1 px-3 print:py-0.5 print:px-1 text-center font-bold">
                                  {isError ? (
                                    <div className="flex items-center justify-center gap-1 text-red-600 print:text-red-700 text-xs print:text-[8px]">
                                      <AlertCircle size={12} className="print:hidden" /> 
                                      {diffH > 0.1 ? `${diffH.toFixed(1)}h` : ''} {diffH > 0.1 && diffQty > 0 ? ' / ' : ''} {diffQty > 0 ? `${diffQty}szt.` : ''}
                                    </div>
                                  ) : row.hasTablet && row.hasManual ? (
                                    <div className="flex items-center justify-center text-emerald-600 print:text-stone-800 text-xs print:text-[8px]">
                                      <CheckCircle2 size={12} className="print:hidden" />
                                      <span className="hidden print:inline">ZGODNE</span>
                                    </div>
                                  ) : (
                                    <span className="text-stone-400 print:text-stone-500 text-[10px] print:text-[8px] uppercase font-black">Brak porów.</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* RENDEROWANIE KART PRACY */}
          {reportType === 'work_cards' && (
            <div className="space-y-8">
              {sortedData.map((worker, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className="bg-stone-800 p-4 flex justify-between items-center">
                    <h4 className="text-white font-black flex items-center gap-2">
                      <Users size={20} className="text-emerald-400" />
                      {worker.employeeName}
                      <span className="text-stone-400 text-xs font-normal uppercase tracking-widest ml-2">Grupa: {worker.group}</span>
                    </h4>
                    <div className="bg-stone-700 px-3 py-1 rounded-lg text-emerald-400 font-mono font-bold text-sm">
                      Suma: {(worker.logs.reduce((sum: number, l: any) => sum + l.duration, 0) / 3600).toFixed(2)}h
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200 text-[10px] font-black uppercase tracking-widest text-stone-400">
                          <th className="p-4">Data</th>
                          <th className="p-4 text-center">Od - Do</th>
                          <th className="p-4">Zlecenie (ZP)</th>
                          <th className="p-4">Artykuł / Produkt</th>
                          <th className="p-4 text-center">Plan</th>
                          <th className="p-4 text-center">Suma ZP</th>
                          <th className="p-4 text-right">Zameldował</th>
                          <th className="p-4 text-right">Czas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {worker.logs.map((l: any, i: number) => (
                          <tr key={i} className="text-sm hover:bg-stone-50 transition-colors">
                            <td className="p-4 font-medium text-stone-500">{format(l.startTime, 'dd.MM.yyyy')}</td>
                            <td className="p-4 text-center">
                              <span className="bg-stone-100 px-2 py-1 rounded font-bold text-stone-700">
                                {format(l.startTime, 'HH:mm')} - {format(l.endTime, 'HH:mm')}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold text-xs mr-2">
                                {String(l.orderNumber).toLowerCase().includes('praca') ? l.orderNumber : `ZP: ${l.orderNumber}`}
                              </span>
                              {l.isManual && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold text-[10px] uppercase">Ręczny</span>}
                            </td>
                            <td className="p-4 font-bold text-stone-800">{l.productName}</td>
                            
                            <td className="p-4 text-center font-bold text-stone-400">{l.targetQuantity}</td>
                            <td className="p-4 text-center font-bold text-stone-600">{l.totalReportedOnOrder}</td>
                            <td className="p-4 text-right font-black text-emerald-600">
                              {l.logQuantity > 0 ? (
                                <span className="bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                  +{l.logQuantity} szt.
                                </span>
                              ) : (
                                <span className="text-stone-300">-</span>
                              )}
                            </td>

                            <td className="p-4 text-right font-mono font-bold text-emerald-600">{(l.duration / 3600).toFixed(2)}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* RENDEROWANIE DNIÓWKI MISTRZA */}
          {reportType === 'daily_master' && (
            <div className="space-y-6">
              {sortedData.map((task, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className="bg-stone-100 p-4 border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap gap-2 items-center mb-2">
                        <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded shadow-sm">
                          {String(task.orderNumber).toLowerCase().includes('praca') ? task.orderNumber : `ZP: ${task.orderNumber}`}
                        </span>
                        {task.projectName !== '-' && <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded shadow-sm">PROJ: {task.projectName}</span>}
                        {task.targetQuantity > 0 && <span className="bg-stone-200 text-stone-700 text-xs font-bold px-2 py-0.5 rounded border border-stone-300">PLAN: {task.targetQuantity} szt.</span>}
                        {task.unitWeight > 0 && <span className="bg-stone-200 text-stone-700 text-xs font-bold px-2 py-0.5 rounded border border-stone-300">WAGA: {task.unitWeight} kg/szt.</span>}
                        {task.historicalDuration > 0 && (
                          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1 shadow-sm">
                            <History size={12} /> Historia: {(task.historicalDuration / 3600).toFixed(2)}h ({task.historicalDates.join(', ')})
                          </span>
                        )}
                      </div>
                      <h4 className="font-black text-stone-800 flex items-center gap-2"><Package size={16} className="text-stone-400" />{task.elementName}</h4>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-xl border border-stone-200 shadow-sm text-center">
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Suma Zameldowana</p>
                      <p className="font-black text-xl text-stone-800">{task.totalReportedQuantity} szt.</p>
                    </div>
                  </div>
                  <div className="divide-y divide-stone-100">
                    <div className="bg-stone-50 flex text-xs font-black text-stone-400 uppercase tracking-widest p-3">
                      <div className="flex-1">Pracownik</div>
                      <div className="w-20 text-right">Czas</div>
                      <div className="w-24 text-right hidden sm:block">Wpisał</div>
                      <div className="w-24 text-right text-emerald-600">Należy się</div>
                      <div className="w-28 text-right text-amber-600">ZŁ / KG</div>
                    </div>
                    {task.workerLogs.map((worker: any, wIdx: number) => (
                      <div key={wIdx} className="flex items-center p-3 text-sm font-medium hover:bg-stone-50 transition-colors">
                        <div className="flex-1 flex items-center gap-2">
                          <Users size={16} className="text-stone-300" />
                          {worker.employeeName}
                          {worker.isManual && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold text-[10px] uppercase ml-2">Ręczny</span>}
                        </div>
                        <div className="w-20 text-right font-mono text-stone-500">{(worker.duration / 3600).toFixed(2)}h</div>
                        <div className="w-24 text-right text-stone-400 hidden sm:block">{worker.originalQuantity} szt.</div>
                        <div className="w-24 text-right font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded ml-4 border border-emerald-100">{worker.proportionalQuantity} szt.</div>
                        <div className="w-28 text-right font-black text-amber-600">{task.plnPerKg > 0 ? `${task.plnPerKg.toFixed(2)} zł` : '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* RENDEROWANIE GRUP */}
          {reportType === 'oee' && (
            <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600" onClick={() => handleSort('employeeName')}>Pracownik <SortIndicator field="employeeName" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600" onClick={() => handleSort('group')}>Grupa <SortIndicator field="group" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 text-right cursor-pointer hover:text-stone-600" onClick={() => handleSort('attendanceHours')}>Pobyt (Excel) <SortIndicator field="attendanceHours" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 text-right cursor-pointer hover:text-stone-600" onClick={() => handleSort('workedHours')}>Czas Odbity <SortIndicator field="workedHours" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 text-right cursor-pointer hover:text-stone-600" onClick={() => handleSort('oeePercent')}>Wskaźnik % <SortIndicator field="oeePercent" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {sortedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-stone-50 transition-colors">
                        <td className="p-4 text-sm font-bold text-stone-800">{row.employeeName}</td>
                        <td className="p-4 text-sm text-stone-500">{row.group}</td>
                        <td className="p-4 text-right font-mono font-medium text-stone-600">{(row.attendanceHours || 0).toFixed(2).replace('.', ',')} h</td>
                        <td className="p-4 text-right font-mono font-medium text-emerald-600">{(row.workedHours || 0).toFixed(2).replace('.', ',')} h</td>
                        <td className="p-4 text-right font-mono font-black">
                           <span className={`px-3 py-1 rounded-full ${
                              row.oeePercent >= 85 ? 'bg-emerald-100 text-emerald-700' : 
                              row.oeePercent >= 70 ? 'bg-amber-100 text-amber-700' : 
                              'bg-red-100 text-red-700'}`}>
                              {(row.oeePercent || 0).toFixed(1).replace('.', ',')}% 
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {reportType === 'groups' && (
            <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600" onClick={() => handleSort('date')}>Data <SortIndicator field="date" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600" onClick={() => handleSort('employeeName')}>Pracownik <SortIndicator field="employeeName" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600" onClick={() => handleSort('group')}>Grupa <SortIndicator field="group" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600" onClick={() => handleSort('position')}>Stanowisko <SortIndicator field="position" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600" onClick={() => handleSort('category')}>Kategoria <SortIndicator field="category" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600" onClick={() => handleSort('isManual')}>Typ Meldunku <SortIndicator field="isManual" /></th>
                      <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 text-right cursor-pointer hover:text-stone-600" onClick={() => handleSort('totalDuration')}>Godziny <SortIndicator field="totalDuration" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {sortedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-stone-50 transition-colors">
                        <td className="p-4 text-sm font-medium">{row.date}</td>
                        <td className="p-4 text-sm font-bold">{row.employeeName}</td>
                        <td className="p-4 text-sm text-stone-500">{row.group}</td>
                        <td className="p-4 text-sm text-stone-500">{row.position}</td>
                        <td className="p-4"><span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">{row.category}</span></td>
                        <td className="p-4">
                          {row.isManual ? (
                            <span className="px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">Ręczny</span>
                          ) : (
                            <span className="px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-wider bg-stone-100 text-stone-600 border border-stone-200">Hala</span>
                          )}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-emerald-600">{(row.totalDuration / 3600).toFixed(2).replace('.', ',')} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </motion.div>
      )}
    </div>
  );
}