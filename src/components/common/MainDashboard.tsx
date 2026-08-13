import React, { useState, useEffect } from 'react';
import { 
  Package, Clock, Search, X, Trash2, Upload, List, AlertTriangle, 
  CheckCircle2, LogOut, Info, Settings, Settings2, LayoutList, Boxes, History, 
  Activity, BarChart2, PenTool, Users, Briefcase, FileText, Menu, ChevronRight,
  Truck, BookOpen, PackageMinus, ClipboardCheck, PackagePlus, RotateCcw, Archive, FileSpreadsheet, Weight, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInSeconds } from 'date-fns';
import { Timestamp, doc, updateDoc, collection, query, where, or, getDocs, writeBatch, arrayRemove, serverTimestamp, increment, runTransaction } from 'firebase/firestore'; 
import { db } from '../../firebase';

// Types
import { 
  ProductionOrder, Employee, WorkLog, WorkStation, WorkSession, 
  UserProfile, OrderElement, ImportConflict 
} from '../../types';
import { cn } from '../../utils/firestore-helpers';
import { parseSearchTerms, matchesAllTerms } from '../../utils/search';
import { calculateOrderStatus } from '../../utils/orderStatus';
import { generateTransactionNumber, buildTransactionData, getSequenceCounter } from '../../utils/wmsTransactionService';

// Components
import { ActiveTimer } from '../production/ActiveTimer';
import { OrderCard } from '../production/OrderCard';
import { EmployeeManagementView } from '../administracja/EmployeeManagementView';
import { WorkStationManagementView } from '../administracja/WorkStationManagementView';
import { ReportsView } from '../management/ReportsView';
import { ElementStatsView } from '../management/ElementStatsView';
import { HistoryView } from '../production/HistoryView';
import { ManualEntryForm } from '../management/ManualEntryForm';
import { BulkManualEntryForm } from '../management/BulkManualEntryForm';
import { EmployeeTimelineView } from '../management/EmployeeTimelineView';
import { ImportResolutionModal } from '../wms/ImportResolutionModal';
import { AttendanceImportView } from '../administracja/AttendanceImportView';
import { AttendanceOEEView } from '../management/AttendanceOEEView';
import { OrderElementEditor } from '../production/OrderElementEditor';
import { ElementSelectionModal } from './ElementSelectionModal';
import { ErrorBoundary } from './ErrorBoundary';
import { DocsView } from '../administracja/DocsView';
import { LiveWorkView } from '../production/LiveWorkView';
import { OrderLogsView } from '../production/OrderLogsView';
import { ClientOrderSummaryView } from '../management/ClientOrderSummaryView';

// IMPORTY WMS
import { ExpectedDeliveriesView } from '../wms/ExpectedDeliveriesView';
import { InventoryYardView } from '../wms/InventoryYardView';
import { ReceiveDeliveryModal } from '../wms/ReceiveDeliveryModal';
import { ArticleRegistryView } from '../wms/ArticleRegistryView';
import { MaterialWithdrawalView } from '../wms/MaterialWithdrawalView';
import { MaterialReturnsView } from '../wms/MaterialReturnsView';
import { InventoryTakingView } from '../wms/InventoryTakingView';
import { InventoryApprovalView } from '../wms/InventoryApprovalView';
import { ManualReceiptsView } from '../wms/ManualReceiptsView';
import { WMSImportView } from '../wms/WMSImportView';
import { SequenceMigration } from '../wms/SequenceMigration';
import { DraftMigration } from '../wms/DraftMigration';
import { InventoryZeroingView } from '../wms/InventoryZeroingView';
import { MaterialReservationsView } from '../wms/MaterialReservationsView';
import { WeightCoefficientsView } from '../wms/WeightCoefficientsView';
import { InventoryLedgerView } from '../wms/InventoryLedgerView';
import { InventoryBOInitializationModal } from '../wms/InventoryBOInitializationModal';
import { TechOperationsView } from '../administracja/TechOperationsView';
import { TechProcessesView } from '../administracja/TechProcessesView';
import { MissingWeightsView } from '../production/MissingWeightsView';
import { BoardDrawingsManager } from '../administracja/BoardDrawingsManager';
import { TonnageStatsView } from '../management/TonnageStatsView';

interface MainDashboardProps {
  systemMetadata?: any;
  user: any;
  profile: UserProfile | null;
  isAdmin: boolean;
  orders: ProductionOrder[];
  employees: Employee[];
  workStations: WorkStation[];
  activeSessions: WorkSession[];
  activeLog: WorkLog | null;
  allActiveLogs: WorkLog[];
  currentOperator: Employee | null;
  // Actions
  onLogout: () => void;
  onStartWork: (order: ProductionOrder, element?: OrderElement) => Promise<void>;
  onStopWork: (reports?: { orderId: string, quantity: number }[]) => Promise<void>;
  onDeleteOrder: (id: string) => Promise<void>;
  onClearDatabase: () => Promise<void>;
  onExcelImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmImport: (selected: Set<number>) => Promise<void>;
  onAddEmployee: (data: any) => Promise<boolean>;
  onDeleteEmployee: (id: string) => Promise<boolean>;
  onUpdateEmployee: (id: string, data: any) => Promise<boolean>;
  onEmployeeImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearEmployees: () => Promise<boolean>;
  onAddStation: (data: any) => Promise<boolean>;
  onUpdateStation: (id: string, data: any) => Promise<boolean>;
  onDeleteStation: (id: string) => Promise<boolean>;
  onAddManualLog: (orderId: string | null, empId: string, h: number, q: number, start: Date, end: Date, cat?: string) => Promise<boolean>;
  onAddManualLogs: (entries: any[]) => Promise<boolean>;
  // State from App
  importConflicts: ImportConflict[];
  setImportConflicts: (val: ImportConflict[]) => void;
  pendingNewOrders: Omit<ProductionOrder, 'id' | 'createdAt'>[];
  setPendingNewOrders: (val: any[]) => void;
  showImportModal: boolean;
  setShowImportModal: (val: boolean) => void;
  isImporting: boolean;
  importSummary: { added: string[], skipped: string[] } | null;
  onClearSummary: () => void;
  // Role override
  overrideRole: UserProfile['role'] | null;
  setOverrideRole: (role: UserProfile['role'] | null) => void;
}

export function MainDashboard(props: MainDashboardProps) {
  const [view, setView] = useState<'orders' | 'history' | 'manual-entry' | 'employees' | 'reports' | 'attendance-import' | 'attendance-oee' | 'timeline' | 'stations' | 'docs' | 'live' | 'element-stats' | 'tonnage-stats' | 'wms-inventory' | 'wms-deliveries' | 'wms-registry' | 'wms-coeffs' | 'wms-wip' | 'wms-returns' | 'wms-taking' | 'wms-zeroing' | 'wms-approval' | 'wms-import' | 'wms-receipts' | 'wms-admin' | 'wms-reservations' | 'wms-ledger' | 'tech-operations' | 'tech-processes' | 'missing-weights' | 'tech-board-drawings'>('live');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatuses, setActiveStatuses] = useState<ProductionOrder['status'][]>(['pending', 'in-progress', 'reported', 'completed']);
  const [manualEntryVersion, setManualEntryVersion] = useState<1 | 2>(1);
  const [editingOrderElements, setEditingOrderElements] = useState<ProductionOrder | null>(null);
  const [selectingElementOrder, setSelectingElementOrder] = useState<ProductionOrder | null>(null);
  
  // NOWY STAN DLA PODGLĄDU LOGÓW ZLECENIA
  const [viewingOrderLogs, setViewingOrderLogs] = useState<ProductionOrder | null>(null);
  const [viewingClientOrderSummary, setViewingClientOrderSummary] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [itemToReceive, setItemToReceive] = useState<any | null>(null);

  const [archivedOrders, setArchivedOrders] = useState<ProductionOrder[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);
  const [showBOModal, setShowBOModal] = useState(false);
  
  // Stan dla widoków analitycznych (pełna lista zleceń)
  const [analyticalOrders, setAnalyticalOrders] = useState<ProductionOrder[] | null>(null);
  const [isFetchingAnalytical, setIsFetchingAnalytical] = useState(false);

  useEffect(() => {
    const role = (props.overrideRole || props.profile?.role)?.toUpperCase();
    if (role === 'MAGAZYNIER') {
      if (!view.startsWith('wms-')) {
        setView('wms-deliveries');
      }
    } else if (role === 'PODGLAD') {
      if (!['live', 'wms-inventory', 'wms-reservations', 'timeline'].includes(view)) {
        setView('live');
      }
    } else if (role !== 'ADMIN' && role !== 'PODGLAD' && view !== 'orders' && view !== 'history') {
      // Pracownicy see only orders or history
      setView('orders');
    }
  }, [props.overrideRole, props.profile?.role]);

  // Pobieranie wszystkich zleceń z bazy, gdy wejdziemy w widok analityczny
  useEffect(() => {
    const isAnalyticalView = ['tonnage-stats', 'element-stats', 'reports', 'timeline'].includes(view);
    
    if (isAnalyticalView && !analyticalOrders && !isFetchingAnalytical) {
      setIsFetchingAnalytical(true);
      const fetchAllOrders = async () => {
        try {
          const q = query(collection(db, 'orders'));
          const snap = await getDocs(q);
          const all = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ProductionOrder[];
          setAnalyticalOrders(all);
        } catch (error) {
          console.error("Błąd pobierania wszystkich zleceń dla analityki:", error);
        } finally {
          setIsFetchingAnalytical(false);
        }
      };
      fetchAllOrders();
    }
  }, [view, analyticalOrders, isFetchingAnalytical]);

  const ordersForAnalyticalViews = analyticalOrders || props.orders;

  // 1. Wyszukiwanie LOKALNE
  const filteredOrders = props.orders.filter(order => {
    if (!activeStatuses.includes(order.status)) {
      return false;
    }
    const terms = parseSearchTerms(searchTerm);
    if (terms.length === 0) return true;
    
    const searchableText = `${order.orderNumber} ${order.erpOrderNumber || ''} ${order.productName} ${order.projectNumber || ''} ${order.articleNumber || ''} ${order.clientName || ''}`;
    return matchesAllTerms(searchableText, terms);
  });

  // 2. Wyszukiwanie w CHMURZE - ZOPTYMALIZOWANA LOGIKA (Brak Race Condition)
  useEffect(() => {
    const term = searchTerm.trim();
    
    if (term.length === 6) {
      searchArchiveInFirebase(term);
    } else {
      setArchivedOrders([]); 
    }
  }, [searchTerm]); 

  const searchArchiveInFirebase = async (term: string) => {
    setIsSearchingArchive(true);
    try {
      const q = query(
        collection(db, 'orders'),
        or(
          where('orderNumber', '==', term),
          where('erpOrderNumber', '==', term),
          where('projectNumber', '==', term)
        )
      );
      
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const found = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ProductionOrder[];
        const uniqueArchived = found.filter(f => !props.orders.find(o => o.id === f.id));
        setArchivedOrders(uniqueArchived);
      } else {
        setArchivedOrders([]);
      }
    } catch (error) {
      console.error("Błąd wyszukiwania w archiwum Firebase:", error);
    } finally {
      setIsSearchingArchive(false);
    }
  };

  // --- ADMIN OVERRIDE: Wymuszone zatrzymanie meldunku ---
  const handleAdminForceStop = async (logToStop: WorkLog, customEndTime: Date, customQty: number) => {
    try {
      const batch = writeBatch(db);
      
      const startTime = logToStop.startTime instanceof Timestamp ? logToStop.startTime.toDate() : new Date(logToStop.startTime);
      const duration = Math.max(0, differenceInSeconds(customEndTime, startTime));

      // 1. Aktualizacja logu
      batch.update(doc(db, 'workLogs', logToStop.id), {
        endTime: Timestamp.fromDate(customEndTime),
        duration: duration,
        quantityReported: customQty,
        manual: false,
      });

      // 2. Wyrzucenie z zespołu
      if (logToStop.sessionId) {
        batch.update(doc(db, 'workSessions', logToStop.sessionId), {
          memberIds: arrayRemove(logToStop.userId)
        });
      }

      // 3. Dodanie sztuk do zlecenia
      if (customQty > 0 && logToStop.orderId) {
        const order = props.orders.find(o => o.id === logToStop.orderId);
        if (order) {
          let weightedIncrement = customQty;
          let updatedElements = order.elements ? [...order.elements] : undefined;

          if (order.elements && order.elements.length > 0 && logToStop.elementId) {
            const element = order.elements.find(e => e.id === logToStop.elementId);
            if (element) {
              const totalWeight = order.elements.reduce((sum, el) => sum + (el.weight || 0), 0);
              if (totalWeight > 0) {
                weightedIncrement = customQty * (element.weight / totalWeight);
              }
              updatedElements = order.elements.map(el => 
                el.id === logToStop.elementId 
                  ? { ...el, reportedQuantity: (el.reportedQuantity || 0) + customQty }
                  : el
              );
            }
          }

          const currentAppQty = order.appReportedQuantity || 0;
          const currentErpQty = order.erpReportedQuantity || order.reportedQuantity || 0;
          const newAppTotal = currentAppQty + weightedIncrement;
          const newStatus = calculateOrderStatus(currentErpQty, Number(newAppTotal.toFixed(3)), order.targetQuantity);

          const updateData: any = { appReportedQuantity: Number(newAppTotal.toFixed(3)), status: newStatus };
          if (updatedElements) updateData.elements = updatedElements;

          batch.update(doc(db, 'orders', order.id), updateData);
        }
      }

      await batch.commit();
    } catch (error) {
      console.error("Błąd podczas wymuszania zatrzymania:", error);
      alert("Wystąpił błąd podczas zatrzymywania meldunku.");
    }
  };

  const handleSaveManualBatch = async (batchData: any) => {
    if (!itemToReceive) return;
    try {
      const batchRef = doc(collection(db, 'inventoryBatches'));
      
      const finalBatchData = {
        ...batchData,
        sourcePurchaseOrderId: itemToReceive.id,
        unitPrice: itemToReceive.unitPrice || 0,
        priceUnit: itemToReceive.priceUnit || '1',
        priceUnitMultiplier: itemToReceive.priceUnitMultiplier || 1,
        totalValue: batchData.numericQuantity * (itemToReceive.unitPrice || 0),
        createdAt: serverTimestamp(),
        createdBy: 'Magazynier (Ręcznie)'
      };

      await runTransaction(db, async (transaction) => {
        // Pobranie licznika sekwencji dla kwitów WMS ERP
        const seqCounter = await getSequenceCounter(db, transaction);
        const txNumber = seqCounter.getNextNumber('PZ');
        seqCounter.commit(transaction);

        // Tworzenie nowej partii w inventoryBatches
        transaction.set(batchRef, finalBatchData);

        // Utworzenie oficjalnego kwitu ERP PZ (Przychód Zewnętrzny)
        const txRef = doc(collection(db, 'inventoryTransactions'));
        const unitLabel = batchData.quantityString?.split(' ')[1] || batchData.unit || 'szt';
        const txData = buildTransactionData({
          type: 'PZ',
          batchId: batchRef.id,
          batchNumber: batchData.batchNumber,
          articleNumber: batchData.articleNumber || itemToReceive.articleNumber || '',
          articleName: batchData.articleName || itemToReceive.articleName || '',
          quantity: batchData.numericQuantity,
          unit: unitLabel,
          unitPrice: finalBatchData.unitPrice,
          totalValue: finalBatchData.totalValue,
          previousBatchQuantity: 0,
          workerName: currentUser,
          createdBy: currentUser,
          sourcePurchaseOrderId: itemToReceive.id,
          notes: batchData.notes || 'Przyjęcie dostawy (PZ)'
        }, txNumber);

        transaction.set(txRef, txData);

        const backupRef = doc(collection(db, 'wmsReceiptsBackup'));
        transaction.set(backupRef, {
          batchId: batchRef.id,
          importType: 'MANUAL_APP_RECEIPT',
          data: finalBatchData,
          recordedAt: serverTimestamp()
        });

        const poRef = doc(db, 'expectedDeliveries', itemToReceive.id);
        transaction.update(poRef, {
          wmsDeliveredQuantity: increment(finalBatchData.numericQuantity),
          wmsTotalValue: increment(finalBatchData.numericQuantity * (itemToReceive.unitPrice || 0)),
          lastModifiedAt: serverTimestamp()
        });
      });

      setItemToReceive(null);
      alert('Pomyślnie dodano wsad na plac, wygenerowano kwit PZ i przeliczono wartość!');
      
    } catch (err) {
      console.error(err);
      alert("Błąd podczas zapisywania wsadu!");
    }
  };

  const combinedOrdersMap = new Map<string, ProductionOrder>();
  filteredOrders.forEach(o => combinedOrdersMap.set(o.id, o));
  archivedOrders.forEach(o => combinedOrdersMap.set(o.id, o));
  const combinedOrdersToDisplay = Array.from(combinedOrdersMap.values());

  const SidebarItem = ({ active, onClick, icon, text, right }: any) => (
    <button 
      onClick={onClick} 
      className={cn(
        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
        active 
          ? "bg-stone-900 text-white shadow-sm" 
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("transition-colors", active ? "text-stone-300" : "text-stone-400 group-hover:text-stone-600")}>
          {icon}
        </div>
        {text}
      </div>
      {right}
    </button>
  );

  const currentUser = props.profile?.displayName || props.user?.displayName || props.user?.email?.split('@')[0] || 'Zalogowany Pracownik';
  const role = (props.overrideRole || props.profile?.role)?.toUpperCase() as string;
  const isWMSUser = props.isAdmin || role === 'MAGAZYNIER';
  const isPodglad = role === 'PODGLAD';

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-full overflow-hidden bg-stone-50 font-sans print:h-auto print:bg-white text-stone-900">
        
        {/* MOBILE OVERLAY */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-stone-900/20 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* SIDEBAR */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 md:w-72 bg-white border-r border-stone-200 flex flex-col transform transition-transform duration-300 md:relative md:translate-x-0 print:hidden",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-4 border-b border-stone-100 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-inner"><Package size={18} /></div>
                <span className="font-bold text-lg tracking-tight">ProdTrack</span>
              </div>
              <button className="md:hidden p-2 -mr-2 text-stone-400 hover:bg-stone-100 rounded-lg" onClick={() => setIsSidebarOpen(false)}><X size={20} /></button>
            </div>
            
            <div className="bg-stone-50 rounded-xl p-3 border border-stone-100/80 flex justify-between items-center shadow-sm">
              <div className="flex flex-col overflow-hidden pr-2">
                <span className="text-sm font-bold text-stone-900 truncate">{props.profile?.displayName || 'Użytkownik'}</span>
                <span className="text-[10px] text-stone-500 uppercase tracking-widest truncate">{props.overrideRole || props.profile?.role || 'Brak Roli'}</span>
              </div>
              <button onClick={props.onLogout} className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all shrink-0" title="Wyloguj"><LogOut size={16} /></button>
            </div>

            {props.user?.email === 'arkadiusz.biesiada@erplast.pl' && (
              <div className="mt-2 text-stone-600">
                <select
                  value={props.overrideRole || props.profile?.role || ''}
                  onChange={(e) => props.setOverrideRole(e.target.value as any)}
                  className="w-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-bold uppercase tracking-wider rounded-lg p-2 outline-none cursor-pointer hover:bg-stone-200 transition-colors"
                >
                  <option value="admin">ADMIN</option>
                  <option value="worker">WORKER</option>
                  <option value="operator">OPERATOR</option>
                  <option value="operator-wms">OPERATOR WMS</option>
                  <option value="operator-tablice">OPERATOR TABLICE</option>
                  <option value="magazynier">MAGAZYNIER</option>
                  <option value="tv-monitor">TV MONITOR</option>
                  <option value="podglad">PODGLĄD</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
            {role !== 'MAGAZYNIER' && !isPodglad && (
              <div>
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mx-3 mb-2">Produkcja</h4>
                <div className="space-y-1">
                  <SidebarItem active={view === 'live'} onClick={() => { setView('live'); setIsSidebarOpen(false); }} icon={<Activity size={18} />} text="Live Hala" right={<span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>} />
                  <SidebarItem active={view === 'orders'} onClick={() => { setView('orders'); setIsSidebarOpen(false); }} icon={<LayoutList size={18} />} text="Bieżące Zlecenia" />
                  <SidebarItem active={view === 'missing-weights'} onClick={() => { setView('missing-weights'); setIsSidebarOpen(false); }} icon={<Weight size={18} />} text="Uzupełnianie Wag" />
                  <SidebarItem active={view === 'history'} onClick={() => { setView('history'); setIsSidebarOpen(false); }} icon={<History size={18} />} text="Historia Zleceń" />
                </div>
              </div>
            )}

            {isPodglad && (
              <div>
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mx-3 mb-2">Podgląd</h4>
                <div className="space-y-1">
                  <SidebarItem active={view === 'live'} onClick={() => { setView('live'); setIsSidebarOpen(false); }} icon={<Activity size={18} />} text="Live Hala" right={<span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>} />
                  <SidebarItem active={view === 'wms-inventory'} onClick={() => { setView('wms-inventory'); setIsSidebarOpen(false); }} icon={<Package size={18} />} text="Stan Placu" />
                  <SidebarItem active={view === 'wms-reservations'} onClick={() => { setView('wms-reservations'); setIsSidebarOpen(false); }} icon={<FileSpreadsheet size={18} />} text="Rezerwacje Materiałowe" />
                  <SidebarItem active={view === 'timeline'} onClick={() => { setView('timeline'); setIsSidebarOpen(false); }} icon={<Clock size={18} />} text="Oś czasu pracowników" />
                </div>
              </div>
            )}

            {isWMSUser && (
              <div>
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mx-3 mt-6 mb-2">Magazyn WMS</h4>
                <div className="space-y-1">
                  <SidebarItem active={view === 'wms-inventory'} onClick={() => { setView('wms-inventory'); setIsSidebarOpen(false); }} icon={<Package size={18} />} text="Stan Placu" />
                  <SidebarItem active={view === 'wms-reservations'} onClick={() => { setView('wms-reservations'); setIsSidebarOpen(false); }} icon={<FileSpreadsheet size={18} />} text="Rezerwacje Materiałowe" />
                  <SidebarItem active={view === 'wms-deliveries'} onClick={() => { setView('wms-deliveries'); setIsSidebarOpen(false); }} icon={<Truck size={18} />} text="Zakupy (Oczekujące)" />
                  <SidebarItem active={view === 'wms-registry'} onClick={() => { setView('wms-registry'); setIsSidebarOpen(false); }} icon={<BookOpen size={18} />} text="Katalog Artykułów" />
                  <SidebarItem active={view === 'wms-coeffs'} onClick={() => { setView('wms-coeffs'); setIsSidebarOpen(false); }} icon={<Settings2 size={18} />} text="Przeliczniki Stali" />
                  <SidebarItem active={view === 'wms-wip'} onClick={() => { setView('wms-wip'); setIsSidebarOpen(false); }} icon={<PackageMinus size={18} />} text="Pobranie na Produkcję" />
                  <SidebarItem active={view === 'wms-returns'} onClick={() => { setView('wms-returns'); setIsSidebarOpen(false); }} icon={<RotateCcw size={18} />} text="Zwrot na Magazyn" />
                  <SidebarItem active={view === 'wms-taking'} onClick={() => { setView('wms-taking'); setIsSidebarOpen(false); }} icon={<ClipboardCheck size={18} />} text="Spis z Natury" />
                  <SidebarItem active={view === 'wms-zeroing'} onClick={() => { setView('wms-zeroing'); setIsSidebarOpen(false); }} icon={<Archive size={18} />} text="Zeruj Inwentaryzację" />
                  <SidebarItem active={view === 'wms-approval'} onClick={() => { setView('wms-approval'); setIsSidebarOpen(false); }} icon={<CheckCircle2 size={18} />} text="Różnice / Zatwierdź" />
                  <SidebarItem active={view === 'wms-ledger'} onClick={() => { setView('wms-ledger'); setIsSidebarOpen(false); }} icon={<Layers size={18} />} text="Księga Transakcji (ERP)" />
                  <SidebarItem active={view === 'wms-import'} onClick={() => { setView('wms-import'); setIsSidebarOpen(false); }} icon={<Upload size={18} />} text="Wymiana Danych (ERP)" />
                  <SidebarItem active={view === 'wms-receipts'} onClick={() => { setView('wms-receipts'); setIsSidebarOpen(false); }} icon={<History size={18} />} text="Ręczne Przyjęcia" />
                </div>
              </div>
            )}

            {props.isAdmin && (
              <>
                <div className="mt-6">
                  <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mx-3 mb-2">Zarządzanie</h4>
                  <div className="space-y-1">
                    <SidebarItem active={view === 'reports'} onClick={() => { setView('reports'); setIsSidebarOpen(false); }} icon={<BarChart2 size={18} />} text="Raporty i Audyt" />
                    <SidebarItem active={view === 'timeline'} onClick={() => { setView('timeline'); setIsSidebarOpen(false); }} icon={<Clock size={18} />} text="Oś czasu pracowników" />
                    <SidebarItem active={view === 'element-stats'} onClick={() => { setView('element-stats'); setIsSidebarOpen(false); }} icon={<Package size={18} />} text="Statystyki Elementów" />
                    <SidebarItem active={view === 'tonnage-stats'} onClick={() => { setView('tonnage-stats'); setIsSidebarOpen(false); }} icon={<BarChart2 size={18} />} text="Zestawienie Tonażu" />
                    <SidebarItem active={false} onClick={() => window.open('#tv', '_blank')} icon={<Activity size={18} />} text="Otwórz TV Monitor" />
                    <SidebarItem active={view === 'manual-entry'} onClick={() => { setView('manual-entry'); setIsSidebarOpen(false); }} icon={<PenTool size={18} />} text="Wpis ręczny" />
                    <SidebarItem active={view === 'attendance-import'} onClick={() => { setView('attendance-import'); setIsSidebarOpen(false); }} icon={<FileSpreadsheet size={18} />} text="Import Obecności" />
                    <SidebarItem active={view === 'attendance-oee'} onClick={() => { setView('attendance-oee'); setIsSidebarOpen(false); }} icon={<BarChart2 size={18} />} text="Bilans czasu pracy" />
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mx-3 mb-2">Administracja</h4>
                  <div className="space-y-1">
                    <SidebarItem active={view === 'employees'} onClick={() => { setView('employees'); setIsSidebarOpen(false); }} icon={<Users size={18} />} text="Pracownicy" />
                    <SidebarItem active={view === 'stations'} onClick={() => { setView('stations'); setIsSidebarOpen(false); }} icon={<Briefcase size={18} />} text="Stanowiska" />
                    <SidebarItem active={view === 'tech-operations'} onClick={() => { setView('tech-operations'); setIsSidebarOpen(false); }} icon={<Settings size={18} />} text="Słownik Operacji Tech." />
                    <SidebarItem active={view === 'tech-processes'} onClick={() => { setView('tech-processes'); setIsSidebarOpen(false); }} icon={<LayoutList size={18} />} text="Słownik Procesów Tech." />
                    <SidebarItem active={view === 'tech-board-drawings'} onClick={() => { setView('tech-board-drawings'); setIsSidebarOpen(false); }} icon={<FileText size={18} />} text="Rysunki Tablic (PDF)" />
                    <SidebarItem active={view === 'docs'} onClick={() => { setView('docs'); setIsSidebarOpen(false); }} icon={<FileText size={18} />} text="Dokumentacja" />
                    <SidebarItem active={view === 'wms-admin'} onClick={() => { setView('wms-admin'); setIsSidebarOpen(false); }} icon={<Settings size={18} />} text="Skrypty WMS" />
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* MOBILE HEADER */}
          <header className="md:hidden bg-white border-b border-stone-200 px-4 h-14 flex items-center justify-between shrink-0 print:hidden shadow-sm z-30">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center text-white"><Package size={14} /></div>
              <span className="font-bold text-base tracking-tight">ProdTrack</span>
            </div>
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-stone-500 hover:bg-stone-50 rounded-lg transition-colors"><Menu size={20} /></button>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 print:p-0 print:overflow-visible custom-scrollbar scroll-smooth">
            <div className={cn("mx-auto space-y-6 pb-24", view.startsWith('wms-') ? "w-full max-w-[1920px]" : "max-w-5xl")}>
              
              {/* MODALS */}
              <AnimatePresence>
                {props.showImportModal && (
                  <ImportResolutionModal 
                    newCount={props.pendingNewOrders.length}
                    conflicts={props.importConflicts}
                    onConfirm={props.onConfirmImport}
                    onCancel={() => { props.setShowImportModal(false); props.setPendingNewOrders([]); props.setImportConflicts([]); }}
                    isImporting={props.isImporting}
                  />
                )}
                {props.activeLog && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden print:hidden">
                    <ActiveTimer 
                      log={props.activeLog} 
                      onStop={props.onStopWork} 
                      orders={props.orders}
                      operator={props.currentOperator || props.employees.find(e => e.id === props.user?.uid)}
                      activeSessions={props.activeSessions}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* DEDICATED VIEW HEADER FOR ORDERS */}
              {view === 'orders' && (
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm print:hidden">
                  <div className="flex items-center gap-4">
                    <h1 className="text-xl font-black text-stone-800 tracking-tight flex items-center gap-2">
                      <LayoutList className="text-emerald-600" />
                      Bieżące Zlecenia
                      {searchTerm && <span className="text-sm font-medium text-stone-400">/ Wyniki ({combinedOrdersToDisplay.length})</span>}
                    </h1>
                    {props.systemMetadata?.lastOrderImportAt && (
                      <div className="hidden md:flex flex-col text-xs text-stone-500 font-medium ml-2 border-l border-stone-200 pl-4">
                        <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold mb-0.5">Ostatni import</span>
                        <div className="flex items-center gap-2">
                          <span className="text-stone-700">{new Date(props.systemMetadata.lastOrderImportAt.seconds * 1000).toLocaleString('pl-PL')}</span>
                          <span className="text-stone-300">•</span>
                          <span className="text-stone-600 truncate max-w-[150px]" title={props.systemMetadata.lastOrderImportBy}>{props.systemMetadata.lastOrderImportBy}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64 lg:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                      <input 
                        type="text" 
                        placeholder="Szukaj zlecenia, projektu..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="w-full pl-9 pr-8 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium" 
                      />
                      {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 bg-white rounded-full"><X size={14} /></button>}
                    </div>

                    {props.isAdmin && (
                      <label className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-bold cursor-pointer hover:bg-stone-800 transition-all shadow-sm shrink-0 active:scale-95">
                        <Upload size={16} /> Importuj
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={props.onExcelImport} disabled={props.isImporting} />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* FILTERS FOR ORDERS */}
              {view === 'orders' && (
                <div className="flex flex-wrap gap-2 print:hidden bg-white p-2 rounded-xl border border-stone-100 shadow-sm">
                  {[
                    { id: 'pending', label: 'Oczekujące', color: 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100', activeColor: 'bg-stone-900 text-white border-stone-900 shadow-sm' },
                    { id: 'in-progress', label: 'W toku', color: 'bg-blue-50/50 text-blue-700 border-blue-200 hover:bg-blue-50', activeColor: 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20' },
                    { id: 'reported', label: 'Zameldowane', color: 'bg-amber-50/50 text-amber-700 border-amber-200 hover:bg-amber-50', activeColor: 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/20' },
                    { id: 'completed', label: 'Zakończone', color: 'bg-emerald-50/50 text-emerald-700 border-emerald-200 hover:bg-emerald-50', activeColor: 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20' }
                  ].map(status => {
                    const isActive = activeStatuses.includes(status.id as ProductionOrder['status']);
                    return (
                      <button
                        key={status.id}
                        onClick={() => setActiveStatuses(prev => isActive ? prev.filter(s => s !== status.id) : [...prev, status.id as ProductionOrder['status']])}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 select-none",
                          isActive ? status.activeColor : status.color,
                          !isActive && "opacity-80 hover:opacity-100 border-dashed"
                        )}
                      >
                        {isActive && <CheckCircle2 size={14} />}
                        {status.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* OTHER MODALS */}
              <AnimatePresence>
                {editingOrderElements && (
                  <OrderElementEditor 
                    order={editingOrderElements as any} 
                    onClose={() => setEditingOrderElements(null)} 
                    onUpdate={async (id, elements, totalWeight, appReportedQty) => {
                      try {
                        const updateData: any = { elements, totalWeight };
                        if (appReportedQty !== undefined) {
                          updateData.appReportedQuantity = Number(appReportedQty.toFixed(3));
                          const targetOrder = props.orders.find(o => o.id === id) || (editingOrderElements as any);
                          if (targetOrder) {
                            const currentErpQty = targetOrder.erpReportedQuantity || targetOrder.reportedQuantity || 0;
                            updateData.status = calculateOrderStatus(
                              currentErpQty, 
                              updateData.appReportedQuantity, 
                              targetOrder.targetQuantity || 1,
                              false,
                              elements
                            );
                          }
                        }
                        await updateDoc(doc(db, 'orders', id), updateData);
                      } catch (e) {
                        console.error('Błąd podczas zapisywania elementów:', e);
                      }
                    }}
                  />
                )}
                {viewingOrderLogs && (
                  <OrderLogsView 
                    order={viewingOrderLogs} 
                    orders={props.orders} 
                    employees={props.employees}
                    onClose={() => setViewingOrderLogs(null)} 
                    onShowClientLogs={(erpOrderNumber) => setViewingClientOrderSummary(erpOrderNumber)}
                  />
                )}
                {viewingClientOrderSummary && (
                  <ClientOrderSummaryView
                    erpOrderNumber={viewingClientOrderSummary}
                    orders={[...props.orders, ...archivedOrders]}
                    employees={props.employees}
                    onClose={() => setViewingClientOrderSummary(null)}
                  />
                )}

                {selectingElementOrder && <ElementSelectionModal order={selectingElementOrder} onSelect={async (el) => { await props.onStartWork(selectingElementOrder, el); setSelectingElementOrder(null); }} onCancel={() => setSelectingElementOrder(null)} />}
                {itemToReceive && <ReceiveDeliveryModal item={itemToReceive} onClose={() => setItemToReceive(null)} onSave={handleSaveManualBatch} />}
              </AnimatePresence>

              {/* CONTENT AREA SWITCHER */}
              {view === 'live' && (props.isAdmin || isPodglad) ? (
                <LiveWorkView 
                  activeLogs={props.allActiveLogs} 
                  orders={combinedOrdersToDisplay} 
                  onForceStop={handleAdminForceStop}
                  readOnly={isPodglad}
                />
              ) : view === 'employees' && props.isAdmin ? (
                <EmployeeManagementView 
                  employees={props.employees} onAdd={props.onAddEmployee} onDelete={props.onDeleteEmployee} onUpdate={props.onUpdateEmployee} 
                  onClearAll={props.onClearEmployees} onImport={props.onEmployeeImport} isImporting={props.isImporting} 
                  importSummary={props.importSummary} onClearSummary={props.onClearSummary} workStations={props.workStations}
                />
              ) : view === 'attendance-oee' && props.isAdmin ? (
                <AttendanceOEEView employees={props.employees} />
              ) : view === 'attendance-import' && props.isAdmin ? (
                <AttendanceImportView employees={props.employees} />
              ) : view === 'stations' && props.isAdmin ? (
                <WorkStationManagementView stations={props.workStations} onAdd={props.onAddStation} onDelete={props.onDeleteStation} onUpdate={props.onUpdateStation} />
              ) : view === 'tech-operations' && props.isAdmin ? (
                <TechOperationsView workStations={props.workStations} onBack={() => setView('live')} />
              ) : view === 'tech-processes' && props.isAdmin ? (
                <TechProcessesView workStations={props.workStations} onBack={() => setView('live')} />
              ) : view === 'tech-board-drawings' && props.isAdmin ? (
                <BoardDrawingsManager orders={props.orders} userProfile={props.profile} />
              ) : view === 'missing-weights' ? (
                <MissingWeightsView orders={props.orders} onEditElements={setEditingOrderElements} />
              ) : view === 'manual-entry' && props.isAdmin ? (
                <div className="space-y-6">
                  <div className="flex justify-center">
                    <div className="bg-stone-100 p-1 rounded-2xl flex gap-1 border border-stone-200">
                      <button onClick={() => setManualEntryVersion(1)} className={cn("px-6 py-2 rounded-xl text-sm font-bold transition-all", manualEntryVersion === 1 ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")}>Wersja 1 (Pojedyncza)</button>
                      <button onClick={() => setManualEntryVersion(2)} className={cn("px-6 py-2 rounded-xl text-sm font-bold transition-all", manualEntryVersion === 2 ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")}>Wersja 2 (Zbiorcza)</button>
                    </div>
                  </div>
                  {manualEntryVersion === 1 ? (
                    <ManualEntryForm orders={props.orders} employees={props.employees.filter(e => !e.isArchived)} onSubmit={async (data) => { 
                      if (await props.onAddManualLogs([{ id: Math.random().toString(36).substr(2, 9), ...data }])) setView('orders'); 
                    }} />
                  ) : (
                    <BulkManualEntryForm orders={props.orders} employees={props.employees.filter(e => !e.isArchived)} onSubmit={async (entries) => { await props.onAddManualLogs(entries); }} />
                  )}
                </div>
              ) : view === 'orders' ? (
                <div className="grid gap-4 mt-2">
                  {isSearchingArchive && (
                    <div className="col-span-full flex flex-col items-center justify-center p-8 bg-emerald-50/50 rounded-3xl border border-emerald-100 mt-4">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mb-3" />
                      <span className="text-emerald-700 font-medium">Przeszukuję archiwum serwera...</span>
                    </div>
                  )}

                  {combinedOrdersToDisplay.length === 0 && !isSearchingArchive ? (
                    <div className="bg-white border-2 border-dashed border-stone-200 rounded-3xl p-16 text-center text-stone-400 mt-4 flex flex-col items-center justify-center">
                      <Package size={48} className="mb-4 opacity-20 text-stone-900" />
                      <p className="font-medium text-stone-500">{searchTerm ? 'Nie znaleziono w bieżących ani w archiwum.' : 'Brak zleceń do wyświetlenia.'}</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {combinedOrdersToDisplay.map(order => (
                        <OrderCard 
                          key={order.id} 
                          order={order} 
                          onStart={() => { if (order.elements && order.elements.length > 0) setSelectingElementOrder(order); else props.onStartWork(order); }} 
                          onDelete={() => props.onDeleteOrder(order.id)} 
                          onEditElements={() => setEditingOrderElements(order)}
                          onShowLogs={() => setViewingOrderLogs(order)}
                          onShowClientLogs={() => setViewingClientOrderSummary(order.erpOrderNumber!)} 
                          isWorking={props.activeLog?.orderId === order.id} 
                          disabled={!!props.activeLog && props.activeLog.orderId !== order.id}
                          isAdmin={props.isAdmin} 
                          activeWorkers={props.allActiveLogs.filter(log => log.orderId === order.id).map(log => log.userName)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : view === 'element-stats' && props.isAdmin ? (
                <ElementStatsView orders={ordersForAnalyticalViews} employees={props.employees} />
              ) : view === 'tonnage-stats' && props.isAdmin ? (
                <TonnageStatsView orders={ordersForAnalyticalViews} />
              ) : view === 'reports' && props.isAdmin ? (
                <ReportsView employees={props.employees} orders={ordersForAnalyticalViews} />
              ) : view === 'timeline' && (props.isAdmin || isPodglad) ? (
                <EmployeeTimelineView orders={ordersForAnalyticalViews} onViewOrderLogs={setViewingOrderLogs} />
              ) : view === 'wms-inventory' && (isWMSUser || isPodglad) ? (
                <InventoryYardView readOnly={isPodglad} />
              ) : view === 'wms-reservations' && (isWMSUser || isPodglad) ? (
                <MaterialReservationsView readOnly={isPodglad} />
              ) : view === 'wms-deliveries' && isWMSUser ? (
                <ExpectedDeliveriesView onReceiveClick={setItemToReceive} currentUser={currentUser} />
              ) : view === 'wms-registry' && isWMSUser ? (
                <ArticleRegistryView />
              ) : view === 'wms-coeffs' && isWMSUser ? (
                <WeightCoefficientsView />
              ) : view === 'wms-wip' && isWMSUser ? (
                <MaterialWithdrawalView currentUser={currentUser} />
              ) : view === 'wms-returns' && isWMSUser ? (
                <MaterialReturnsView currentUser={currentUser} />
              ) : view === 'wms-taking' && isWMSUser ? (
                <InventoryTakingView currentUser={currentUser} />
              ) : view === 'wms-zeroing' && isWMSUser ? (
                <InventoryZeroingView currentUser={currentUser} />
              ) : view === 'wms-approval' && isWMSUser ? (
                <InventoryApprovalView currentUser={currentUser} />
              ) : view === 'wms-ledger' && isWMSUser ? (
                <InventoryLedgerView currentUser={currentUser} onOpenBOModal={() => setShowBOModal(true)} />
              ) : view === 'wms-receipts' && isWMSUser ? (
                <ManualReceiptsView />
              ) : view === 'wms-import' && isWMSUser ? (
                <WMSImportView userRole={role} />
              ) : view === 'wms-admin' && props.isAdmin ? (
                <div className="p-6 space-y-6 max-w-4xl mx-auto">
                  <h2 className="text-2xl font-black text-stone-800">Skrypty Administracyjne i Migracje WMS</h2>
                  <SequenceMigration />
                  <DraftMigration />
                </div>
              ) : view === 'docs' && props.isAdmin ? (
                <DocsView />
              ) : (
                <HistoryView isAdmin={props.isAdmin} orders={props.orders} employees={props.employees} />
              )}
            </div>
          </main>
        </div>
      </div>
      {showBOModal && (
        <InventoryBOInitializationModal
          onClose={() => setShowBOModal(false)}
          onSuccess={() => alert('Zakończono inicjalizację Bilansem Otwarcia!')}
          currentUser={currentUser}
        />
      )}
    </ErrorBoundary>
  );
}