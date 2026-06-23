import React, { useState, useEffect, useCallback } from 'react';
import { 
  collection, updateDoc, setDoc, doc, getDoc, 
  deleteDoc, writeBatch, serverTimestamp, addDoc, getDocs 
} from 'firebase/firestore';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { auth, db } from './firebase';
import { motion } from 'motion/react';
import { Package } from 'lucide-react';

// --- Types & Utils ---
import { 
  ProductionOrder, Employee, UserProfile, ImportConflict 
} from './types';
import { handleFirestoreError, OperationType } from './utils/firestore-helpers';
import { parseOrdersExcel, parseEmployeesExcel } from './utils/excelParser';

// --- Hooks ---
import { useProductionData } from './hooks/useProductionData';
import { useWorkManager } from './hooks/useWorkManager';
import { useManualEntry } from './hooks/useManualEntry';

// --- Components ---
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { RFIDLogin } from './components/common/RFIDLogin';
import { OperatorPanel } from './components/production/OperatorPanel';
import { MainDashboard } from './components/common/MainDashboard';
import { WMSOperatorDashboard } from './components/wms/WMSOperatorDashboard';
import { VirtualKeyboard } from './components/common/VirtualKeyboard';

// --- Utils ---
import { cn } from './utils/firestore-helpers';

export default function App() {
  // 1. Podstawowe stany autoryzacji
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentOperator, setCurrentOperator] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideRole, setOverrideRole] = useState<UserProfile['role'] | null>(null);
  
  const currentRole = (overrideRole || profile?.role)?.toLowerCase() as UserRole | undefined;
  const isAdmin = currentRole === 'admin';
  const showKeyboard = !isAdmin && currentRole !== 'magazynier';
  const [wmsMode, setWmsMode] = useState(false);

  // 2. Dyspozytor Danych (Nasz wydzielony Hook do odczytu)
  const { 
    orders, employees, workStations, activeSessions, activeLog, setActiveLog, allActiveLogs 
  } = useProductionData(user, isAdmin, currentOperator);

  // 3. Kierownik Zmiany (Nasz wydzielony Hook do operacji na czasie pracy)
  const { 
    startWork, startTeamWork, joinTeam, stopWork 
  } = useWorkManager({
    user, currentOperator, activeLog, setActiveLog, activeSessions, orders
  });

  // NOWE: 3.5. Dyspozytor Wpisów Ręcznych
  const { addManualLogs } = useManualEntry(employees, orders);

  // 4. Stany pomocnicze dla UI (Import, Modale)
  const [importConflicts, setImportConflicts] = useState<ImportConflict[]>([]);
  const [pendingNewOrders, setPendingNewOrders] = useState<Omit<ProductionOrder, 'id' | 'createdAt'>[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ added: string[], skipped: string[] } | null>(null);

  // --- LOGIKA AUTORYZACJI ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          setProfile({ ...userDoc.data(), uid: u.uid } as UserProfile);
        } else {
          const isDefaultAdmin = u.email === 'arkadiusz.biesiada@erplast.pl';
          const newProfile = { uid: u.uid, displayName: u.displayName || 'Użytkownik', email: u.email || '', role: isDefaultAdmin ? 'admin' : 'worker' };
          await setDoc(doc(db, 'users', u.uid), newProfile);
          setProfile(newProfile as UserProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { console.error(e); } };
  const handleLogout = useCallback(() => { signOut(auth); setCurrentOperator(null); setOverrideRole(null); }, []);

  // --- FUNKCJE OPERACYJNE (IMPORT I ADMIN) ---

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { newOrders, conflicts } = await parseOrdersExcel(file, orders);
      setPendingNewOrders(newOrders);
      setImportConflicts(conflicts);
      setShowImportModal(true);
    } catch (error) { console.error(error); alert("Błąd Excela."); }
    finally { e.target.value = ''; }
  };

  const confirmImport = async (selectedConflicts: Set<number>) => {
    setIsImporting(true);
    try {
      const now = serverTimestamp();
      const userIdentifier = user?.displayName || user?.email || 'System';
      const batch = writeBatch(db);

      pendingNewOrders.forEach(orderData => {
        const newDocRef = doc(collection(db, 'orders'));
        batch.set(newDocRef, { ...orderData, createdAt: now, importedAt: now, lastModifiedAt: now, lastModifiedBy: userIdentifier });
      });

      const conflictsToUpdate = importConflicts.filter((_, idx) => selectedConflicts.has(idx));
      conflictsToUpdate.forEach(conflict => {
        const updateData: any = { lastModifiedAt: now, lastModifiedBy: userIdentifier };
        conflict.diff.forEach(d => { updateData[d.field] = d.newValue; });
        batch.update(doc(db, 'orders', conflict.existingOrder.id), updateData);
      });

      await batch.commit();
      setShowImportModal(false);
      setPendingNewOrders([]);
      setImportConflicts([]);
    } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'orders'); }
    finally { setIsImporting(false); }
  };

  const deleteOrder = async (orderId: string) => {
    try { await deleteDoc(doc(db, 'orders', orderId)); } catch (err) { handleFirestoreError(err, OperationType.DELETE, 'orders'); }
  };

  const clearDatabase = async () => {
    setIsImporting(true);
    try {
      const ordersSnap = await getDocs(collection(db, 'orders'));
      const logsSnap = await getDocs(collection(db, 'workLogs'));
      const allDocs = [...ordersSnap.docs, ...logsSnap.docs];
      for (let i = 0; i < allDocs.length; i += 500) {
        const batch = writeBatch(db);
        allDocs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) { handleFirestoreError(err, OperationType.DELETE, 'db_clear'); }
    finally { setIsImporting(false); }
  };

  // --- FUNKCJE ADMINISTROWANIA BAZĄ ---
  const addEmployee = async (data: any) => {
    try { await addDoc(collection(db, 'employees'), { ...data, displayName: `${data.firstName} ${data.lastName}`, createdAt: serverTimestamp() }); return true; } 
    catch (e) { return false; }
  };
  const deleteEmployee = async (id: string) => { try { await deleteDoc(doc(db, 'employees', id)); return true; } catch (e) { return false; } };
  const updateEmployee = async (id: string, data: any) => { try { await updateDoc(doc(db, 'employees', id), data); return true; } catch (e) { return false; } };
  
  const handleEmployeeImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setIsImporting(true);
    try {
      const { employeesToAdd, addedNames, skippedNames } = await parseEmployeesExcel(file, employees);
      const batch = writeBatch(db);
      employeesToAdd.forEach(emp => batch.set(doc(collection(db, 'employees')), { ...emp, createdAt: serverTimestamp() }));
      await batch.commit();
      setImportSummary({ added: addedNames, skipped: skippedNames });
    } catch (e) { console.error(e); }
    finally { setIsImporting(false); e.target.value = ''; }
  };

  const addWorkStation = async (data: any) => { try { await addDoc(collection(db, 'workStations'), { ...data, createdAt: serverTimestamp() }); return true; } catch (e) { return false; } };
  const updateWorkStation = async (id: string, data: any) => { try { await updateDoc(doc(db, 'workStations', id), data); return true; } catch (e) { return false; } };
  const deleteWorkStation = async (id: string) => { try { await deleteDoc(doc(db, 'workStations', id)); return true; } catch (e) { return false; } };

  // --- RENDEROWANIE ---

  // Wyciągnięcie nazwy zalogowanego użytkownika (dla panelu WMS)
  const loggedInName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Nieznany Pracownik';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center border border-stone-100">
        <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-emerald-200"><Package size={40} /></div>
        <h1 className="text-3xl font-black text-stone-900 mb-2 tracking-tight">ProdSSS Erplast</h1>
        <p className="text-stone-500 mb-8 font-medium">Zaloguj się kontem Google, aby autoryzować urządzenie.</p>
        <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-xl active:scale-95">Zaloguj przez Google</button>
      </motion.div>
    </div>
  );

  if ((currentRole === 'operator' || currentRole === 'operator-wms') && !currentOperator) {
    return (
      <>
        <RFIDLogin employees={employees} onLogin={(emp) => setCurrentOperator(emp)} onLogoutDevice={handleLogout} />
        {showKeyboard && <VirtualKeyboard />}
      </>
    );
  }

  if (currentOperator && (currentRole === 'operator' || currentRole === 'operator-wms')) {
    if (wmsMode && currentRole === 'operator-wms') {
       return (
         <>
           <WMSOperatorDashboard 
             user={user} profile={profile} currentOperator={currentOperator}
             onLogout={() => { setWmsMode(false); setCurrentOperator(null); }}
             onBackToOperator={() => setWmsMode(false)}
           />
           {showKeyboard && <VirtualKeyboard />}
         </>
       );
    }

    return (
      <>
        <OperatorPanel 
          operator={currentOperator} orders={orders} activeLog={activeLog} allActiveLogs={allActiveLogs} 
          workStations={workStations} activeSessions={activeSessions} 
          onLogout={() => setCurrentOperator(null)} 
          onStartWork={startWork} 
          onStopWork={stopWork} 
          onStartTeamWork={startTeamWork} 
          onJoinTeam={joinTeam} 
          deviceRole={currentRole}
          onWmsClick={() => setWmsMode(true)}
        />
        {showKeyboard && <VirtualKeyboard />}
      </>
    );
  }

  return (
    <>
      <MainDashboard 
        user={user} profile={profile} isAdmin={isAdmin} orders={orders} employees={employees} 
        workStations={workStations} activeSessions={activeSessions} activeLog={activeLog} allActiveLogs={allActiveLogs}
        currentOperator={currentOperator || employees.find(e => e.id === user?.uid) || null}
        onLogout={handleLogout} onStartWork={startWork} onStopWork={stopWork} onDeleteOrder={deleteOrder} 
        onClearDatabase={clearDatabase} onExcelImport={handleExcelImport} onConfirmImport={confirmImport}
        onAddEmployee={addEmployee} onDeleteEmployee={deleteEmployee} onUpdateEmployee={updateEmployee} 
        onEmployeeImport={handleEmployeeImport} onClearEmployees={async () => true} 
        onAddStation={addWorkStation} onUpdateStation={updateWorkStation} onDeleteStation={deleteWorkStation}
        onAddManualLog={async (o, e, h, q, s, en, c) => true} onAddManualLogs={addManualLogs}
        importConflicts={importConflicts} setImportConflicts={setImportConflicts} pendingNewOrders={pendingNewOrders} setPendingNewOrders={setPendingNewOrders}
        showImportModal={showImportModal} setShowImportModal={setShowImportModal} isImporting={isImporting} importSummary={importSummary} onClearSummary={() => setImportSummary(null)}
        overrideRole={overrideRole} setOverrideRole={setOverrideRole}
      />
      {showKeyboard && <VirtualKeyboard />}
    </>
  );
}