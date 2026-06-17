import * as XLSX from 'xlsx';
import { InventoryBatch } from '../types';

export const exportToBarTenderExcel = (batches: InventoryBatch[], filename = 'Eksport_BarTender.xlsx') => {
  // 1. Mapowanie danych 1 do 1 z oryginalnymi nazwami kolumn z pliku "RU PR BL inne"
  const data = batches.map(b => ({
    'Dostawca': b.supplier || '',
    'Data dostawy': b.deliveryDate || '',
    'Nr wsadu': b.batchNumber || '',
    'Indeks': b.articleNumber || '',
    'Nr zamówienia': b.orderNumber || '',
    'Nazwa asortymentu': b.articleName || '',
    'Gatunek/ LOT': b.grade || '',
    'Współczynnik': b.coefficient || '',
    'Wymiar/ Długość w mb / kg': b.dimensions || '',
    'Ilość': b.quantityString || '',
    'ilość etykiet': b.labelsCount || 1, // Zawsze przekazuje minimum 1 etykietę do druku
    'Karta kontroli': b.qcCard ? 'x' : '',
    'ATESTY': b.certificate ? 'x' : '',
    'UWAGI': b.notes || ''
  }));

  // 2. Tworzenie arkusza i skoroszytu z biblioteki XLSX
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Etykiety');

  // 3. Ustawienie inteligentnych szerokości kolumn (aby plik po otwarciu był piękny i czytelny)
  const columnWidths = [
    { wch: 15 }, // Dostawca
    { wch: 12 }, // Data dostawy
    { wch: 15 }, // Nr wsadu
    { wch: 15 }, // Indeks
    { wch: 15 }, // Nr zamówienia
    { wch: 45 }, // Nazwa asortymentu (Szeroka kolumna)
    { wch: 20 }, // Gatunek/ LOT
    { wch: 15 }, // Współczynnik
    { wch: 25 }, // Wymiar/ Długość w mb / kg
    { wch: 15 }, // Ilość
    { wch: 12 }, // ilość etykiet
    { wch: 12 }, // Karta kontroli
    { wch: 10 }, // ATESTY
    { wch: 30 }  // UWAGI
  ];
  worksheet['!cols'] = columnWidths;

  // 4. Bezpośredni zapis do natywnego pliku Excel (.xlsx)
  XLSX.writeFile(workbook, filename);
};