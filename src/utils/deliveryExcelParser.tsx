import * as XLSX from 'xlsx';
import { InventoryBatch, BatchMatchResult } from '../types';

const getVal = (row: any, searchKeys: string[]) => {
  const rowKeys = Object.keys(row);
  for (const sk of searchKeys) {
    const target = sk.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const found = rowKeys.find(k => k.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === target);
    if (found !== undefined) {
      const val = row[found];
      if (val !== null && val !== undefined && String(val).trim() !== '' && String(val).trim() !== '-') return val;
    }
  }
  return '';
};

const extractNumericQty = (val: any): number => {
  if (!val) return 0;
  const str = String(val).trim();
  const match = str.match(/^([\d\s,.]+)/);
  if (match) {
    let numStr = match[1].replace(/[\s\u00A0]/g, ''); 
    numStr = numStr.replace(',', '.'); 
    return parseFloat(numStr) || 0;
  }
  return 0;
};

const parseDate = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const parts = String(val).split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return String(val).trim();
};

const isChecked = (val: any): boolean => {
  const s = String(val).trim().toLowerCase();
  return s === 'x' || s === 'tak' || s === '1' || s === 'v';
};

export const parseDeliveryTable = async (file: File): Promise<InventoryBatch[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const parsedBatches: InventoryBatch[] = [];

        workbook.SheetNames.forEach(sheetName => {
          const nameLower = sheetName.toLowerCase();
          
          const worksheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
          
          const isPaintSheet = nameLower.includes('farb');
          const isScrewSheet = nameLower.includes('śrub') || nameLower.includes('srub');

          rawData.forEach((row: any) => {
            const batchNumber = String(getVal(row, ['Nr wsadu'])).trim();
            if (!batchNumber) return;

            let orderNumber = String(getVal(row, ['Nr zamówienia']));
            const rawQtyString = String(getVal(row, ['Ilość', 'ILOŚĆ']));
            
            let articleNumber = '';
            let articleName = '';
            let grade = '';
            let coefficient = '';
            let dimensions = '';
            let notes = String(getVal(row, ['UWAGI', 'Uwagi']));

            // LOGIKA DLA FARB
            if (isPaintSheet) {
              articleName = String(getVal(row, ['kolor RAL'])); 
              grade = String(getVal(row, ['nr. Partii', 'nr Partii']));
            } 
            // LOGIKA DLA ŚRUB (NOWOŚĆ)
            else if (isScrewSheet) {
              articleName = String(getVal(row, ['Asortyment']));
              grade = String(getVal(row, ['Gatunek/ LOT', 'Gatunek']));
              dimensions = String(getVal(row, ['Wymiar/ Długość', 'Wymiar']));
              
              // Magia wyciągania 5 cyfr numeru zamówienia z numeru wsadu
              const orderMatch = batchNumber.match(/(\d{5})\d{3}$/);
              if (orderMatch) {
                orderNumber = orderMatch[1]; // Nadpisujemy orderNumber wyciągniętą wartością (np. 30042)
              }

              // Opcjonalne dodanie numeru faktury do uwag
              const invoice = String(getVal(row, ['nr f-ry', 'nr faktury', 'faktura']));
              if (invoice) {
                notes = notes ? `${notes} | F-ra: ${invoice}` : `F-ra: ${invoice}`;
              }
            } 
            // LOGIKA DLA STALI (RU, PR, BL)
            else {
              articleNumber = String(getVal(row, ['Indeks']));
              articleName = String(getVal(row, ['Nazwa asortymentu']));
              grade = String(getVal(row, ['Gatunek/ LOT', 'Gatunek']));
              coefficient = String(getVal(row, ['Współczynnik']));
              dimensions = String(getVal(row, ['Wymiar/ Długość w mb / kg', 'Wymiar']));
            }

            const batch: InventoryBatch = {
              supplier: String(getVal(row, ['Dostawca'])),
              deliveryDate: parseDate(getVal(row, ['Data dostawy'])),
              batchNumber: batchNumber,
              orderNumber: orderNumber,
              articleNumber: articleNumber,
              articleName: articleName,
              grade: grade,
              coefficient: coefficient,
              dimensions: dimensions,
              quantityString: rawQtyString,
              numericQuantity: extractNumericQty(rawQtyString),
              initialQuantity: extractNumericQty(rawQtyString),
              withdrawnQuantity: 0,
              labelsCount: parseInt(String(getVal(row, ['liczba etykiet', 'ilość etykiet']))) || 1,
              qcCard: isChecked(getVal(row, ['Karta kontroli'])),
              certificate: isChecked(getVal(row, ['ATESTY', 'Atest'])),
              notes: notes,
              status: 'AVAILABLE'
            };

            parsedBatches.push(batch);
          });
        });
        resolve(parsedBatches);
      } catch (err: any) {
        reject(new Error('Błąd parsowania Tabeli Dostaw: ' + err.message));
      }
    };
    
    reader.onerror = () => reject(new Error('Błąd odczytu pliku (FileReader)'));
    reader.readAsArrayBuffer(file);
  });
};

// --- LOGIKA KOJARZENIA Z ERP (5-STOPNIOWY SILNIK RECONCILIATION) ---
export const matchBatchesWithERP = (
  physicalBatches: InventoryBatch[],
  erpDeliveries: any[] 
): BatchMatchResult[] => {
  
  const normalize = (str: any) => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().replace(/^0+/, '');
  const allocatedQuantities: Record<string, number> = {};

  const isWithinTolerance = (val1: number, val2: number) => {
    if (val1 === 0 && val2 === 0) return true;
    const diff = Math.abs(val1 - val2);
    const max = Math.max(val1, val2);
    return diff / max <= 0.10; 
  };

  const findBestErpMatch = (potentialMatches: any[], batchQty: number) => {
    potentialMatches.sort((a, b) => String(a.positionNumber).localeCompare(String(b.positionNumber), undefined, {numeric: true}));

    const states = potentialMatches.map(erp => {
      const target = erp.quantityOrdered || 0;
      const filled = (erp.wmsDeliveredQuantity || 0) + (allocatedQuantities[erp.id] || 0);
      const remaining = target - filled;
      return { erp, target, filled, remaining };
    });

    for (const s of states) {
      if (s.filled === 0 && s.target > 0 && isWithinTolerance(s.target, batchQty)) return s.erp;
    }
    for (const s of states) {
      if (s.remaining > 0 && isWithinTolerance(s.remaining, batchQty)) return s.erp;
    }
    const capableStates = states.filter(s => s.remaining >= batchQty);
    if (capableStates.length > 0) return capableStates[0].erp;
    
    const availableStates = states.filter(s => s.remaining > 0).sort((a, b) => b.remaining - a.remaining);
    if (availableStates.length > 0) return availableStates[0].erp;

    return potentialMatches[potentialMatches.length - 1];
  };

  return physicalBatches.map(batch => {
    let matchedPurchaseOrder = undefined;
    let diagnosticHint = '';
    let potentialMatches: any[] = [];

    const bOrder = normalize(batch.orderNumber);
    const bArticle = normalize(batch.articleNumber);

    // KROK 1: IDEALNE DOPASOWANIE (Nr Zamówienia + Indeks)
    if (bOrder && bArticle) {
      potentialMatches = erpDeliveries.filter(erp => 
        normalize(erp.purchaseOrderNumber) === bOrder && 
        normalize(erp.articleNumber) === bArticle
      );
    }

    // KROK 2: FARBY (Brak indeksu, Nr Zamówienia + Kolor RAL z nazwy)
    if (potentialMatches.length === 0 && bOrder && !bArticle) {
      const ralMatch = batch.articleName.match(/\d{4}/);
      if (ralMatch) {
        const ralCode = ralMatch[0];
        potentialMatches = erpDeliveries.filter(erp => {
          return normalize(erp.purchaseOrderNumber) === bOrder && normalize(erp.articleName).includes(ralCode);
        });
        if (potentialMatches.length > 0) diagnosticHint = `Dopasowano farbę po RAL: ${ralCode}.`;
      }
    }

    // KROK 3: AWARYJNIE TYLKO PO NUMERZE ZAMÓWIENIA (Odpala się głównie dla śrub!)
    if (potentialMatches.length === 0 && bOrder) {
      potentialMatches = erpDeliveries.filter(erp => normalize(erp.purchaseOrderNumber) === bOrder);
      if (potentialMatches.length > 0) diagnosticHint = `Awaryjne dopasowanie: Brakujący/zły indeks. Dopasowano tylko po numerze zamówienia.`;
    }

    // KROK 4: AWARYJNIE TYLKO PO INDEKSIE (Brak zamówienia na placu)
    if (potentialMatches.length === 0 && !bOrder && bArticle) {
      potentialMatches = erpDeliveries.filter(erp => normalize(erp.articleNumber) === bArticle);
      if (potentialMatches.length > 0) diagnosticHint = `Awaryjne dopasowanie: Brak numeru zamówienia na placu. Dopasowano po samym indeksie.`;
    }

    // PRZYPISANIE NAJLEPSZEGO WYNIKU Z UWZGLĘDNIENIEM TOLERANCJI (KROK 5)
    if (potentialMatches.length > 0) {
      matchedPurchaseOrder = findBestErpMatch(potentialMatches, batch.numericQuantity);
      allocatedQuantities[matchedPurchaseOrder.id] = (allocatedQuantities[matchedPurchaseOrder.id] || 0) + batch.numericQuantity;
    } else {
      diagnosticHint = `Błąd krytyczny: Wsad nie posiada danych umożliwiających powiązanie z ERP.`;
    }

    // =========================================================
    // KROK KRYTYCZNY: Wzbogacenie wsadu o dane indeksu, NAZWY i CENY z ERP!
    // =========================================================
    if (matchedPurchaseOrder) {
      if (!batch.articleNumber) {
        batch.articleNumber = matchedPurchaseOrder.articleNumber;
      }
      
      // TWARDY NADPIS NAZWY Z ERP (Gwarancja poprawnego nazewnictwa dla wszystkich magazynów)
      batch.articleName = matchedPurchaseOrder.articleName;

      // DZIEDZICZENIE CEN I WYCENA
      if (matchedPurchaseOrder.unitPrice) {
        batch.unitPrice = matchedPurchaseOrder.unitPrice;
        batch.priceUnit = matchedPurchaseOrder.priceUnit;
        batch.priceUnitMultiplier = matchedPurchaseOrder.priceUnitMultiplier;
        batch.totalValue = batch.numericQuantity * matchedPurchaseOrder.unitPrice;
      }
    }

    return {
      batch,
      matchedPurchaseOrder,
      matchStatus: matchedPurchaseOrder ? 'MATCHED' : 'UNMATCHED',
      diagnosticHint
    };
  });
};