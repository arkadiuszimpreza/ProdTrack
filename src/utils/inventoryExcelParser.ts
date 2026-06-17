import * as XLSX from 'xlsx';
import { PurchaseOrderItem, PurchaseOrderStatus, InventoryArticle } from '../types';

// 1. AGRESYWNY RADAR KOLUMN: Usuwa spacje, entery, myślniki i znaki specjalne przed porównaniem!
const getVal = (row: any, searchKeys: string[]) => {
  const rowKeys = Object.keys(row);
  
  for (const sk of searchKeys) {
    // Zamienia "Projekt-nr" na "projektnr"
    const target = sk.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    const found = rowKeys.find(k => {
      // Zamienia to co jest w Excelu np. " Projekt-nr \n " na "projektnr"
      const current = k.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return current === target;
    });
    
    if (found !== undefined) {
      const val = row[found];
      const strVal = String(val).trim();
      // Bierzemy komórkę, jeśli ma jakąkolwiek zawartość (ignorujemy puste i same myślniki)
      if (val !== null && val !== undefined && strVal !== '' && strVal !== '-') {
        return val;
      }
    }
  }
  return undefined;
};

// 2. PANCERNY PARSER LICZB: Obsługuje czyste liczby i zabrudzone stringi
const safeParseNumber = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  
  let s = String(val).replace(/[\s\u00A0]/g, ''); // Usuwa spacje (np. 2 690,10)
  if (s.includes(',')) {
    s = s.replace(/\./g, ''); // Usuwa kropki tysięczne
    s = s.replace(',', '.'); // Zamienia polski przecinek na kropkę
  }
  return parseFloat(s) || 0;
};

// 3. TŁUMACZ DAT EXCELA: Zamienia numery seryjne (np. 46022) na daty YYYY-MM-DD
const parseExcelDate = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel liczy dni od roku 1900. Odejmujemy 25569 dni, by zrównać z kalendarzem systemowym
    const date = new Date((val - 25569) * 86400 * 1000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).trim();
};

// --- MASZYNA 1: Parsowanie Pliku "Zakupy-info" (Oczekiwane Dostawy) ---
export const parseZakupyInfo = async (file: File): Promise<PurchaseOrderItem[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        const parsedItems: PurchaseOrderItem[] = [];

        rawData.forEach((row: any) => {
          const warehouse = String(getVal(row, ['Magazyn']) || '').trim();
          
          if (warehouse !== 'MRB' && warehouse !== 'MSN') return;

          const orderQty = safeParseNumber(getVal(row, ['Ilość', 'Ilość (plan.)']));
          const deliveredQty = safeParseNumber(getVal(row, ['Dostarczone']));
          const billedQty = safeParseNumber(getVal(row, ['Rozliczone']));
          
          let remainingQty = Number((orderQty - deliveredQty).toFixed(3));
          let status: PurchaseOrderStatus = 'OPEN';

          if (deliveredQty === 0) {
            status = 'OPEN';
          } else if (deliveredQty > 0 && deliveredQty < orderQty) {
            status = 'PARTIAL';
          } else if (deliveredQty === orderQty) {
            status = 'COMPLETED';
            remainingQty = 0;
          } else if (deliveredQty > orderQty) {
            status = 'OVERDELIVERED';
            remainingQty = 0;
          }

          // ROZSZERZONE ŁAPANIE CENY (Złapie "Cena (wal.podst.)", "Cena jedn.", itp.)
          const unitPrice = safeParseNumber(getVal(row, ['Cena (wal.podst.)', 'Cena', 'Cena jedn.', 'Cena netto', 'Wartość']));
          
          const procesNr = String(getVal(row, ['Proces-nr']) || '').trim();
          const pozNr = String(getVal(row, ['Poz.-nr', 'Poz-nr', 'Poz']) || '').trim();

          const supplierName = String(getVal(row, ['Nazwa', 'Dostawca']) || '').trim();
          const articleName = String(getVal(row, ['Nazwa_1', 'Artykuł']) || '').trim();
          
          const projectNumber = String(getVal(row, ['Projekt-nr', 'Projekt', 'ZP-nr', 'ZP']) || '').trim();

          const item: PurchaseOrderItem = {
            id: `PO-${procesNr}-${pozNr}`,
            purchaseOrderNumber: procesNr,
            positionNumber: pozNr,
            supplierName: supplierName, 
            warehouse: warehouse,
            
            articleNumber: String(getVal(row, ['Artykuł-nr', 'Indeks']) || '').trim(),
            articleName: articleName,
            projectNumber: projectNumber,
            
            quantityOrdered: orderQty,
            quantityDelivered: deliveredQty,
            quantityRemaining: remainingQty,
            unit: String(getVal(row, ['JM']) || '').trim(),
            
            unitPrice: unitPrice, // ZAPIS CENY
            currency: String(getVal(row, ['Waluta']) || '').trim() || 'PLN',
            
            orderDate: parseExcelDate(getVal(row, ['Założono', 'Data założenia'])),
            expectedDeliveryDate: parseExcelDate(getVal(row, ['Data dostawy'])),
            
            status: status,
            rozliczone: billedQty,
            importedAt: new Date(),
          };

          parsedItems.push(item);
        });

        resolve(parsedItems);
      } catch (err: any) {
        reject(new Error('Błąd podczas parsowania pliku Zakupy-info: ' + err.message));
      }
    };
    
    reader.onerror = () => reject(new Error('Błąd odczytu pliku pliku (FileReader)'));
    reader.readAsArrayBuffer(file);
  });
};

// --- MASZYNA 2: Parsowanie Pliku "GM-info" (Stany Teoretyczne ERP) ---
export const parseGMInfo = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        const inventoryItems: any[] = [];

        rawData.forEach((row: any) => {
          const warehouse = String(getVal(row, ['Magazyn']) || '').trim();
          if (warehouse !== 'MRB' && warehouse !== 'MSN') return;

          inventoryItems.push({
            articleNumber: String(getVal(row, ['Artykuł-nr']) || '').trim(),
            articleName: String(getVal(row, ['Nazwa']) || '').trim(),
            currentStock: safeParseNumber(getVal(row, ['Stan'])),
            plannedStock: safeParseNumber(getVal(row, ['Planowany stan'])),
          });
        });

        resolve(inventoryItems);
      } catch (err: any) {
        reject(new Error('Błąd podczas parsowania pliku GM-info: ' + err.message));
      }
    };
    
    reader.onerror = () => reject(new Error('Błąd odczytu pliku (FileReader)'));
    reader.readAsArrayBuffer(file);
  });
};

export const parseInventoryBalances = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        const balances: any[] = [];
        let rowIdx = 1;

        const guessPrefix = (name: string): string => {
          const n = name.toLowerCase();
          if (n.includes('rura')) return 'RU';
          if (n.includes('profil') || n.includes('kątownik') || n.includes('ceownik')) return 'PR';
          if (n.includes('blacha')) return 'BL';
          if (n.includes('farba')) return 'FA';
          if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';
          return 'INNE'; 
        };

        rawData.forEach((row: any) => {
          const rawQty = safeParseNumber(getVal(row, ['mengeinv', 'bestand', 'ilość zliczona', 'stan']));
          if (rawQty <= 0) return;

          const articleName = String(getVal(row, ['benennung', 'nazwa', 'nazwa asortymentu']) || '').trim();
          const pfx = guessPrefix(articleName) === 'INNE' ? 'INW' : guessPrefix(articleName);
          
          // --- NOWA LOGIKA JEDNOSTEK ---
          // Pobieramy jednostkę bazową oraz jednostkę alternatywną
          const baseUnit = String(getVal(row, ['JI', 'jednostka', 'jm']) || '').trim();
          const altUnit = String(getVal(row, ['me2']) || '').trim();
          
          // Jeśli altUnit istnieje, ma priorytet. W przeciwnym razie bierzemy baseUnit
          const finalUnit = altUnit !== '' ? altUnit : baseUnit;
          
          balances.push({
            articleNumber: String(getVal(row, ['artnr', 'artykuł-nr', 'indeks']) || '').trim(),
            articleName: articleName,
            numericQuantity: rawQty,
            initialQuantity: rawQty,
            unit: finalUnit, // Przypisujemy inteligentnie wybraną jednostkę
            quantityString: `${rawQty} ${finalUnit}`.trim(),
            unitPrice: safeParseNumber(getVal(row, ['preis', 'cena'])),
            batchNumber: `${pfx}INW2026-${String(rowIdx++).padStart(4, '0')}`, 
            deliveryDate: '2026-01-01',
            supplier: 'INWENTARYZACJA BO'
          });
        });

        resolve(balances);
      } catch (err: any) {
        reject(new Error('Błąd podczas parsowania pliku Inwentaryzacji (BO): ' + err.message));
      }
    };
    
    reader.onerror = () => reject(new Error('Błąd odczytu pliku (FileReader)'));
    reader.readAsArrayBuffer(file);
  });
};
export const parseArticleRegistry = async (file: File): Promise<InventoryArticle[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (rows.length === 0) throw new Error('Plik Excel jest pusty.');

        const articles: InventoryArticle[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const indexErp = getVal(row, ['indeks', 'index', 'indykator', 'articlenumber', 'numerartykul', 'numerartykulu', 'kod', 'kodartykulu', 'artykulnr', 'artykunr']) || getVal(row, ['indeks']);
          const nameErp = getVal(row, ['nazwa', 'name', 'opis', 'articlename', 'nazwaartykulu', 'nazwaartykul']);
          const unit = getVal(row, ['jm', 'jednostka', 'unit']);
          
          if (!indexErp && !nameErp) continue;

          articles.push({
            id: String(indexErp || nameErp).trim().replace(/[\\/]/g, '_'), 
            articleNumber: String(indexErp || '').trim(),
            articleName: String(nameErp || 'Brak nazwy').trim(),
            unit: String(unit || '').trim()
          });
        }
        resolve(articles);
      } catch (err: any) {
        reject(new Error('Błąd podczas parsowania pliku Katalogu: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Błąd odczytu pliku (FileReader)'));
    reader.readAsArrayBuffer(file);
  });
};
