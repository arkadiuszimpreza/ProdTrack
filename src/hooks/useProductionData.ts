import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

import { db } from '../firebase'; 
import { ProductionOrder, Employee, WorkStation, WorkSession, WorkLog } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-helpers';

// ZMIANA 1: Dodajemy parametr currentOperator (żeby Dyspozytor wiedział, kto odbił kartę)
export function useProductionData(user: FirebaseUser | null, isAdmin: boolean, currentOperator: Employee | null) {
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

  // 2. Nasłuchiwanie Zleceń (Orders) - ZOPTYMALIZOWANE (Active Working Set)
  useEffect(() => {
    if (!user) return;
    
    // TWARDA BLOKADA: Pobieramy tylko zlecenia aktywne. 
    // Zlecenia zakończone (completed) nie obciążają już pamięci i odczytów.
    const q = query(
      collection(db, 'orders'), 
      where('status', 'in', ['pending', 'in-progress', 'reported']),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ProductionOrder[];
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

  // Dyspozytor oddaje gotową teczkę z danymi do Dyrektora
  return {
    orders,
    employees,
    workStations,
    activeSessions,
    activeLog,
    setActiveLog, 
    allActiveLogs
  };
}