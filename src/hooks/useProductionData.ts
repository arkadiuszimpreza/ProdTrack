import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

import { db } from '../firebase'; 
import { ProductionOrder, Employee, WorkStation, WorkSession, WorkLog } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-helpers';

// ZMIANA 1: Dodajemy parametr currentOperator (żeby Dyspozytor wiedział, kto odbił kartę)
export function useProductionData(user: FirebaseUser | null, isAdmin: boolean, currentOperator: Employee | null) {
  const [systemMetadata, setSystemMetadata] = useState<any>(null);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workStations, setWorkStations] = useState<WorkStation[]>([]);
  const [activeSessions, setActiveSessions] = useState<WorkSession[]>([]);
  const [activeLog, setActiveLog] = useState<WorkLog | null>(null);
  const [allActiveLogs, setAllActiveLogs] = useState<WorkLog[]>([]);

  // 1. Nasłuchiwanie aktywnych czasów pracy
  useEffect(() => {
    // ZMIANA 2: Ustalamy, czyjego ID szukamy. Operator z karty RFID ma pierwszeństwo przed kontem tabletu.
    const effectiveUserId = currentOperator?.id || user?.uid;

    if (!effectiveUserId) {
      setActiveLog(null);
      setAllActiveLogs([]);
      return;
    }

    // Teraz szukamy logów dla WŁAŚCIWEGO człowieka
    const qUser = query(collection(db, 'workLogs'), where('userId', '==', effectiveUserId), where('endTime', '==', null));
    const unsubscribeUser = onSnapshot(qUser, (snapshot) => {
      if (!snapshot.empty) {
        const log = snapshot.docs[0].data() as WorkLog;
        setActiveLog({ ...log, id: snapshot.docs[0].id });
      } else {
        setActiveLog(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'workLogs'));

    const qAll = query(collection(db, 'workLogs'), where('endTime', '==', null));
    const unsubscribeAll = onSnapshot(qAll, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as WorkLog[];
      setAllActiveLogs(logs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'workLogs'));

    return () => { unsubscribeUser(); unsubscribeAll(); };
  }, [user, currentOperator]); // ZMIANA 3: Hook reaguje za każdym razem, gdy ktoś odbije/zabierze kartę RFID

  // 2. Nasłuchiwanie Zleceń (Orders)
  useEffect(() => {
    if (!user) return;
        
    // Optymalizacja: Pobieramy tylko AKTYWNE zlecenia (bez zakończonych).
    // Zlecenia archiwalne są wczytywane na żądanie (np. przez wpisanie 6 cyfr w formularzach).
    // Redukuje to drastycznie ilość odczytów (reads) z bazy w czasie działania aplikacji (szczególnie przez weekend).
    const q = query(
      collection(db, 'orders'), 
      where('status', 'in', ['pending', 'in-progress', 'reported'])
    );
        
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ProductionOrder[];
      
      // Sortowanie po stronie klienta, żeby nie wymuszać tworzenia złożonego indeksu (Composite Index) w Firestore
      ordersData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      
      setOrders(ordersData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
        
    return () => unsubscribe();
  }, [user]);

  // 3. Nasłuchiwanie Pracowników (Employees)
  // NAPRAWA BŁĘDU "NIEZNANA KARTA": Usunięto wymóg bycia administratorem do pobrania listy pracowników.
  useEffect(() => {
    if (!user) return; // Zezwalamy na pobranie każdemu zalogowanemu urządzeniu
    
    const q = query(collection(db, 'employees'), orderBy('lastName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const employeesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Employee[];
      setEmployees(employeesData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'employees'));
    
    return () => unsubscribe();
  }, [user]); // Usunięto isAdmin z tablicy zależności

  // 4. Nasłuchiwanie Maszyn/Stacji (WorkStations)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'workStations'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stationsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as WorkStation[];
      setWorkStations(stationsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'workStations'));
    return () => unsubscribe();
  }, [user]);

  // 5. Nasłuchiwanie Sesji Zespołowych (Team Sessions)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'workSessions'), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessionsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as WorkSession[];
      setActiveSessions(sessionsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'workSessions'));
    return () => unsubscribe();
  }, [user]);

  // 6. Nasłuchiwanie Metadanych Systemu
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "system", "metadata"), (docSnap) => {
      if (docSnap.exists()) {
        setSystemMetadata(docSnap.data());
      } else {
        setSystemMetadata(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, "system/metadata"));
    return () => unsubscribe();
  }, [user]);

  // Dyspozytor oddaje gotową teczkę z danymi do Dyrektora
  return {
    orders,
    employees,
    workStations,
    activeSessions,
    activeLog,
    setActiveLog, 
    allActiveLogs,
    systemMetadata
  };
}