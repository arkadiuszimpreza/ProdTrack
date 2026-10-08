import React, { useState, useEffect, useCallback } from 'react';
import { 
  collection, updateDoc, setDoc, doc, getDoc, 
  deleteDoc, writeBatch, serverTimestamp, addDoc, onSnapshot 
} from 'firebase/firestore';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, 
  User as FirebaseUser, signInWithEmailAndPassword
} from 'firebase/auth';
import { auth, db } from './firebase';
import { motion } from 'motion/react';
import { Package } from 'lucide-react';

// --- Types & Utils ---
import { 
  ProductionOrder, Employee, UserProfile, ImportConflict, UserRole
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
import { KeyboardToggle } from './components/common/KeyboardToggle';
import { OperatorPanelTablice } from './components/production/OperatorPanelTablice';
import { PendingApprovalView } from './components/common/PendingApprovalView';
import { useDeviceEnvironment } from './contexts/DeviceEnvironmentContext';

// --- Utils ---
import { cn } from './utils/firestore-helpers';

import { TVMonitorView } from './components/production/TVMonitorView';

// ZMIANA (audyt finding #10): widoczny komunikat, gdy listener Firestore (onSnapshot)
// napotka błąd (utrata uprawnień, brak sieci) — wcześniej taki błąd ginął bez śladu
// w konsoli, a ekran w ciszy zostawał przy ostatnich znanych danych.
function ConnectionErrorBanner({ message }: { message: string }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center text-xs sm:text-sm font-bold py-2 px-4 shadow-lg">
      ⚠ {message}
    </div>
  );
}

export default function App() {
  const [isTvMode, setIsTvMode] = useState(
    window.location.pathname === '/tv' || window.location.hash === '#tv'
  );

  // 1. Podstawowe stany autoryzacji
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentOperator, setCurrentOperator] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideRole, setOverrideRole] = useState<UserProfile['role'] | null>(null);
  // ZMIANA (audyt finding #10): komunikat o błędzie logowania/weryfikacji konta —
  // wyświetlany na ekranie logowania, gdy onAuthStateChanged napotka błąd (patrz niżej).
  const [authError, setAuthError] = useState<string | null>(null);
  
  const currentRole = (overrideRole || profile?.role)?.toLowerCase() as UserRole | undefined;
  const isAdmin = currentRole === 'admin';
  const isPending = currentRole === 'pending';
  const { customKeyboardEnabled: showKeyboard } = useDeviceEnvironment();
  const [wmsMode, setWmsMode] = useState(false);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);

  // 2. Dyspozytor Danych (Nasz wydzielony Hook do odczytu)
  // Jeśli konto oczekuje na zatwierdzenie (pending), nie uruchamiamy subskrypcji danych produkcyjnych
  const {
    orders, employees, workStations, activeSessions, activeLog, setActiveLog, allActiveLogs, systemMetadata,
    updateLocalOrder, connectionError
  } = useProductionData(isPending ? null : user, isAdmin, currentOperator);

  // 3. Kierownik Zmiany (Nasz wydzielony Hook do operacji na czasie pracy)
  const { 
    startWork, startTeamWork, joinTeam, stopWork 
  } = useWorkManager({
    user: isPending ? null : user, currentOperator, activeLog, setActiveLog, activeSessions, orders
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
    let unsubProfileSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      if (unsubProfileSnapshot) {
        unsubProfileSnapshot();
        unsubProfileSnapshot = null;
      }

      setUser(u);
      // ZMIANA (audyt finding #10): bez try/catch, błąd w getDoc/setDoc (np. brak sieci,
      // albo konto spoza domeny @erplast.pl odrzucone przez firestore.rules) przerywał tę
      // funkcję PRZED linią setLoading(false) — ekran zostawał na wiecznym spinnerze,
      // z którego nie było wyjścia bez twardego odświeżenia strony.
      try {
        if (u) {
          const userRef = doc(db, 'users', u.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            setProfile({ ...userDoc.data(), uid: u.uid } as UserProfile);
          } else {
            const newProfile = { uid: u.uid, displayName: u.displayName || 'Użytkownik', email: u.email || '', role: 'pending' };
            await setDoc(userRef, newProfile);
            setProfile(newProfile as UserProfile);
          }

          // Live snapshot profilu — natychmiastowe odblokowanie po zatwierdzeniu roli przez admina
          unsubProfileSnapshot = onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
              setProfile({ ...snap.data(), uid: u.uid } as UserProfile);
            }
          });
          setAuthError(null);
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.error('Błąd podczas logowania / weryfikacji konta:', e);
        // Wracamy do czystego ekranu logowania z jasnym komunikatem, zamiast zostawiać
        // aplikację w "dziurawym" stanie (user zalogowany w Firebase Auth, ale bez profilu).
        setProfile(null);
        setUser(null);
        setAuthError('Nie udało się zweryfikować konta. Sprawdź, czy logujesz się kontem w domenie @erplast.pl i czy masz połączenie z internetem, a następnie spróbuj ponownie.');
        try { await signOut(auth); } catch { /* najlepszy wysiłek — i tak wyzerowaliśmy lokalny stan */ }
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfileSnapshot) unsubProfileSnapshot();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    setIsRefreshingProfile(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        setProfile({ ...userDoc.data(), uid: auth.currentUser.uid } as UserProfile);
      }
    } catch (e) {
      console.error('Błąd podczas odświeżania profilu:', e);
    } finally {
      setIsRefreshingProfile(false);
    }
  }, []);

  const handleLogin = async () => { 
    try { 
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: 'erplast.pl' });
      await signInWithPopup(auth, provider); 
    } catch (e) { console.error(e); } 
  };
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

      // Zbieramy wszystkie operacje zapisu, aby podzielić je na bezpieczne paczki (max 400 operacji na batch)
      const operations: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

      operations.push(b => {
        b.set(doc(db, 'system', 'metadata'), { lastOrderImportAt: now, lastOrderImportBy: userIdentifier }, { merge: true });
      });

      pendingNewOrders.forEach(orderData => {
        const newDocRef = doc(collection(db, 'orders'));
        operations.push(b => {
          b.set(newDocRef, { ...orderData, createdAt: now, importedAt: now, lastModifiedAt: now, lastModifiedBy: userIdentifier });
        });
      });

      const conflictsToUpdate = importConflicts.filter((_, idx) => selectedConflicts.has(idx));
      conflictsToUpdate.forEach(conflict => {
        const updateData: Record<string, unknown> = { lastModifiedAt: now, lastModifiedBy: userIdentifier };
        conflict.diff.forEach(d => { updateData[d.field] = d.newValue; });
        operations.push(b => {
          b.update(doc(db, 'orders', conflict.existingOrder.id), updateData);
        });
      });

      const BATCH_SIZE = 400;
      for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const currentBatch = writeBatch(db);
        const chunk = operations.slice(i, i + BATCH_SIZE);
        chunk.forEach(op => op(currentBatch));
        await currentBatch.commit();
      }

      setShowImportModal(false);
      setPendingNewOrders([]);
      setImportConflicts([]);
    } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'orders'); }
    finally { setIsImporting(false); }
  };

  const deleteOrder = async (orderId: string) => {
    try { await deleteDoc(doc(db, 'orders', orderId)); } catch (err) { handleFirestoreError(err, OperationType.DELETE, 'orders'); }
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
      // ZMIANA (audyt finding #10): pojedynczy writeBatch ma twardy limit 500 operacji —
      // większy import pracowników nie zapisywał się wcale. Dzielimy na paczki po 400,
      // tak jak już robi to confirmImport() dla zleceń.
      const BATCH_SIZE = 400;
      for (let i = 0; i < employeesToAdd.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = employeesToAdd.slice(i, i + BATCH_SIZE);
        chunk.forEach(emp => batch.set(doc(collection(db, 'employees')), { ...emp, createdAt: serverTimestamp() }));
        await batch.commit();
      }
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

  if ((isTvMode || profile?.role === 'tv-monitor') && !loading && user) {
    return (
      <>
        {connectionError && <ConnectionErrorBanner message={connectionError} />}
        <TVMonitorView activeLogs={allActiveLogs} orders={orders} />
      </>
    );
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
      {isTvMode && (
        <div className="mb-8 text-center animate-pulse">
          <h2 className="text-2xl font-black text-emerald-700 uppercase tracking-widest">Wymagana Inicjalizacja Ekranu</h2>
          <p className="text-stone-500 font-medium mt-2">Zaloguj urządzenie jednorazowo. Sesja zostanie zachowana w pamięci TV.</p>
        </div>
      )}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center border border-stone-100">
        <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-emerald-200"><Package size={40} /></div>
        <h1 className="text-3xl font-black text-stone-900 mb-2 tracking-tight">ProdSSS Erplast</h1>
        <p className="text-stone-500 mb-8 font-medium">Zaloguj się kontem Google, aby autoryzować urządzenie.</p>
        <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-xl active:scale-95">Zaloguj przez Google</button>
        {authError && (
          <p className="mt-4 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{authError}</p>
        )}
      </motion.div>
    </div>
  );

  if (isPending) {
    return (
      <PendingApprovalView 
        user={user}
        profile={profile}
        onRefresh={refreshProfile}
        isRefreshing={isRefreshingProfile}
        onLogout={handleLogout}
      />
    );
  }

  if ((currentRole === 'operator' || currentRole === 'operator-wms' || currentRole === 'operator-tablice') && !currentOperator) {
    return (
      <>
        {connectionError && <ConnectionErrorBanner message={connectionError} />}
        <RFIDLogin employees={employees.filter(e => !e.isArchived)} onLogin={(emp) => setCurrentOperator(emp)} onLogoutDevice={handleLogout} />
        <KeyboardToggle />
        {showKeyboard && <VirtualKeyboard />}
      </>
    );
  }

  if (currentOperator && (currentRole === 'operator' || currentRole === 'operator-wms' || currentRole === 'operator-tablice')) {
    if (wmsMode && currentRole === 'operator-wms') {
       return (
         <>
           {connectionError && <ConnectionErrorBanner message={connectionError} />}
           <WMSOperatorDashboard
             user={user} profile={profile} currentOperator={currentOperator}
             onLogout={() => { setWmsMode(false); setCurrentOperator(null); }}
             onBackToOperator={() => setWmsMode(false)}
           />
           <KeyboardToggle />
           {showKeyboard && <VirtualKeyboard />}
         </>
       );
    }

    if (currentRole === 'operator-tablice') {
       return (
         <>
           {connectionError && <ConnectionErrorBanner message={connectionError} />}
           <OperatorPanelTablice
             operator={currentOperator} orders={orders} activeLog={activeLog} 
             activeSessions={activeSessions}
             onLogout={() => setCurrentOperator(null)}
             onStartWork={startWork} onStopWork={stopWork}
           />
           <KeyboardToggle />
           {showKeyboard && <VirtualKeyboard />}
         </>
       );
    }

    return (
      <>
        {connectionError && <ConnectionErrorBanner message={connectionError} />}
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
        <KeyboardToggle />
        {showKeyboard && <VirtualKeyboard />}
      </>
    );
  }

  return (
    <>
      {connectionError && <ConnectionErrorBanner message={connectionError} />}
      <MainDashboard
        user={user} profile={profile} isAdmin={isAdmin} orders={orders} employees={employees} systemMetadata={systemMetadata} 
        workStations={workStations} activeSessions={activeSessions} activeLog={activeLog} allActiveLogs={allActiveLogs}
        currentOperator={currentOperator || employees.find(e => e.id === user?.uid) || null}
        onLogout={handleLogout} onStartWork={startWork} onStopWork={stopWork} onDeleteOrder={deleteOrder} 
        onExcelImport={handleExcelImport} onConfirmImport={confirmImport}
        onAddEmployee={addEmployee} onDeleteEmployee={deleteEmployee} onUpdateEmployee={updateEmployee} 
        onEmployeeImport={handleEmployeeImport} onClearEmployees={async () => true} 
        onAddStation={addWorkStation} onUpdateStation={updateWorkStation} onDeleteStation={deleteWorkStation}
        onAddManualLog={async (o, e, h, q, s, en, c) => true} onAddManualLogs={addManualLogs}
        importConflicts={importConflicts} setImportConflicts={setImportConflicts} pendingNewOrders={pendingNewOrders} setPendingNewOrders={setPendingNewOrders}
        showImportModal={showImportModal} setShowImportModal={setShowImportModal} isImporting={isImporting} importSummary={importSummary} onClearSummary={() => setImportSummary(null)}
        overrideRole={overrideRole} setOverrideRole={setOverrideRole}
        onUpdateOrder={updateLocalOrder}
      />
      <KeyboardToggle />
      {showKeyboard && <VirtualKeyboard />}
    </>
  );
}