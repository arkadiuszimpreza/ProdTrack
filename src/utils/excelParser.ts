import * as XLSX from 'xlsx';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ProductionOrder, Employee, ImportConflict } from '../types';
import { calculateOrderStatus } from './orderStatus';

// --- INTELIGENTNY KLASYFIKATOR ASORTYMENTU ---
const determineAssortmentCategory = (productName: string, articleNumber: string): string => {
  const name = productName.toLowerCase();
  const index = articleNumber.toLowerCase();

  // 1. ZBROJENIA
  if (name.includes('zbrojenie') || name.includes('zbrojenia') || index.includes('zbr')) {
    return 'Zbrojenia';
  }
  // 2. BARIERY
  if (
    name.includes('bariera') || 
    name.includes('bariery') || 
    name.includes('poręcz') || 
    name.includes('podpórka') || 
    name.includes('szyna') || 
    name.includes('gniazdo')) {
    return 'Bariery';
  }
  // 3. ASTOR
  if (name.includes('astor') || name.includes('rama') || name.includes('słupek ozdobny')) {
    return 'Astor';
  }
  // 4. KONSTRUKCJE
  if (
    name.includes('słup ') || 
    name.includes('bramownica') || 
    name.includes('konstrukcja') || 
    name.includes('wysięgnik') ||
    name.includes('maszt') || 
    name.includes('spaw') || 
    name.includes('żuraw')
  ) {
    return 'Konstrukcje';
  }

  // DOMYŚLNIE
  return 'Inne';
};

// --- MASZYNA 1: Parsowanie Zleceń Produkcyjnych ---
export const parseOrdersExcel = (
  file: File, 
  existingOrders: ProductionOrder[]
): Promise<{ newOrders: Omit<ProductionOrder, 'id' | 'createdAt'>[], conflicts: ImportConflict[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        // --- SMART CHUNK QUERYING ---
        
        // 1. Zbieramy numery zleceń z wgrywanego pliku Excel i OD RAZU JE CZYŚCIMY
        const excelOrderNumbers = [...new Set(json.map(row => {
          return String(row['ZP-nr'] || row['Zlecenie'] || row['Nr ZP'] || row['ZP'] || '').trim();
        }).filter(Boolean))];

        // 2. Filtrujemy te, których NIE MA lokalnie (aktywnych)
        const localOrderNumbers = new Set(existingOrders.map(o => o.orderNumber));
        const missingOrderNumbers = excelOrderNumbers.filter(num => !localOrderNumbers.has(num));

        // 3. Pobieranie z bazy (Równolegle, w paczkach po 30)
        const fetchedArchivedOrders: ProductionOrder[] = [];
        const chunkSize = 30;
        const promises = [];
        
        for (let i = 0; i < missingOrderNumbers.length; i += chunkSize) {
          const chunk = missingOrderNumbers.slice(i, i + chunkSize);
          const q = query(collection(db, 'orders'), where('orderNumber', 'in', chunk));
          promises.push(getDocs(q));
        }

        const snapshots = await Promise.all(promises);
        snapshots.forEach(snap => {
          snap.docs.forEach(docSnap => {
            fetchedArchivedOrders.push({ ...docSnap.data(), id: docSnap.id } as ProductionOrder);
          });
        });

        // 4. Połączona baza wiedzy: Aktywne Zlecenia + Zlecenia Archiwalne
        const allKnownOrders = [...existingOrders, ...fetchedArchivedOrders];

        // -------------------------------------------------------------------------

        const newOrders: Omit<ProductionOrder, 'id' | 'createdAt'>[] = [];
        const conflicts: ImportConflict[] = [];

        // ORYGINALNY KOD PARSERA (Z DODANĄ SANITYZACJĄ .trim())
        for (const row of json) {
          // Czyszczenie kluczowych numerów identyfikacyjnych
          const orderNumber = String(row['ZP-nr'] || row['Zlecenie'] || row['Nr ZP'] || row['ZP'] || '').trim();
          if (!orderNumber) continue;

          const erpOrderNumber = String(row['Zlecenie-nr'] || row['Nr zlecenia'] || row['Zlecenie nr'] || row['Nr Zlecenia'] || '').trim();
          const projectNumber = String(row['Projekt-nr'] || '').trim();
          
          // Profilaktyczne czyszczenie tekstów (pomaga uniknąć problemów z UI i filtrami)
          const productName = String(row['Nazwa'] || row['Produkt'] || '').trim();
          const articleNumber = String(row['Artykuł-nr'] || '').trim();
          const clientName = String(row['Nazwa_1'] || row['Klient-nr'] || '').trim();
          const priority = String(row['Prio.'] || '').trim();
          const unit = String(row['JM'] || '').trim();

          const targetQuantity = Number(row['Ilość (plan.)'] || row['Ilość'] || 0);
          const erpQtyFromExcel = Number(row['Ilość (rzecz.)'] || 0);

          const initialStatus = calculateOrderStatus(erpQtyFromExcel, 0, targetQuantity);
          
          // Uruchamiamy klasyfikator na podstawie wyczyszczonych danych z wiersza
          const autoCategory = determineAssortmentCategory(productName, articleNumber);

          const newOrderData: Omit<ProductionOrder, 'id' | 'createdAt'> = {
            orderNumber,
            erpOrderNumber,
            productName,
            targetQuantity,
            erpReportedQuantity: erpQtyFromExcel,
            appReportedQuantity: 0,
            reportedQuantity: erpQtyFromExcel,
            status: initialStatus,
            articleNumber,
            projectNumber,
            priority,
            unit,
            clientName,
            assortmentCategory: autoCategory, 
          };

          // Szukamy w powiększonej bazie danych (obie strony są teraz czyste)
          const existing = allKnownOrders.find(o => o.orderNumber === orderNumber);

          if (existing) {
            const diff: ImportConflict['diff'] = [];
            
            if (existing.productName !== productName) {
              diff.push({ field: 'productName', label: 'Nazwa', oldValue: existing.productName, newValue: productName });
            }
            if (existing.articleNumber !== articleNumber) {
              diff.push({ field: 'articleNumber', label: 'Indeks', oldValue: existing.articleNumber, newValue: articleNumber });
            }
            if (existing.targetQuantity !== targetQuantity) {
              diff.push({ field: 'targetQuantity', label: 'Ilość Planowana', oldValue: existing.targetQuantity, newValue: targetQuantity });
            }

            // Sprawdzanie różnicy w kategorii
            const currentCategory = existing.assortmentCategory || 'Inne';
            if (currentCategory !== autoCategory && autoCategory !== 'Inne') {
              diff.push({ 
                field: 'assortmentCategory', 
                label: 'Kategoria asortymentowa', 
                oldValue: currentCategory, 
                newValue: autoCategory 
              });
            }

            // 1. Sprawdzanie różnicy ilości potwierdzonej
            const currentErpQty = existing.erpReportedQuantity !== undefined ? existing.erpReportedQuantity : (existing.reportedQuantity || 0);
            
            if (currentErpQty !== erpQtyFromExcel) {
              diff.push({ 
                field: 'erpReportedQuantity', 
                label: 'Ilość z ERP', 
                oldValue: currentErpQty, 
                newValue: erpQtyFromExcel 
              });
            }

            // 2. NIEZALEŻNE sprawdzanie statusu
            const currentAppQty = existing.appReportedQuantity || 0;
            const expectedStatus = calculateOrderStatus(erpQtyFromExcel, currentAppQty, targetQuantity);
            
            if (existing.status !== expectedStatus) {
              diff.push({
                field: 'status',
                label: 'Status Zlecenia',
                oldValue: existing.status,
                newValue: expectedStatus
              });
            }

            if (diff.length > 0) {
              conflicts.push({ existingOrder: existing, newOrderData, diff });
            }
          } else {
            newOrders.push(newOrderData);
          }
        }
        resolve({ newOrders, conflicts });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

// --- MASZYNA 2: Parsowanie Pracowników ---
export const parseEmployeesExcel = (
  file: File, 
  existingEmployees: Employee[]
): Promise<{ employeesToAdd: Omit<Employee, 'id' | 'createdAt'>[], addedNames: string[], skippedNames: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        const employeesToAdd: Omit<Employee, 'id' | 'createdAt'>[] = [];
        const addedNames: string[] = [];
        const skippedNames: string[] = [];

        for (const row of json) {
          const employeeNumber = String(row['Nr ewidencyjny'] || row['Numer ewidencyjny'] || '').trim();
          const firstName = String(row['Imię'] || row['Imie'] || '').trim();
          const lastName = String(row['Nazwisko'] || '').trim();
          const group = String(row['Grupa'] || '').trim();
          const position = String(row['Stanowisko'] || '').trim();
          const rfidCard = String(row['Karta RFID'] || row['RFID'] || '').trim();

          if (!firstName || !lastName) continue;

          // Check for duplicates
          const isDuplicate = existingEmployees.some(e => 
            e.firstName.toLowerCase() === firstName.toLowerCase() && 
            e.lastName.toLowerCase() === lastName.toLowerCase()
          );

          if (isDuplicate) {
            skippedNames.push(`${firstName} ${lastName}`);
            continue;
          }

          const displayName = `${firstName} ${lastName}`;
          employeesToAdd.push({
            employeeNumber,
            firstName,
            lastName,
            group,
            position,
            rfidCard,
            displayName
          });
          addedNames.push(displayName);
        }
        resolve({ employeesToAdd, addedNames, skippedNames });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};