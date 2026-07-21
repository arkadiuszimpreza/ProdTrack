import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Truck, Upload, ShieldCheck, AlertCircle, PackagePlus, ClipboardCheck } from 'lucide-react';
import { writeBatch, doc, collection, serverTimestamp, getDocs, increment } from 'firebase/firestore';
import { db } from '../../firebase'; 

import { parseZakupyInfo, parseInventoryBalances, parseArticleRegistry } from '../../utils/inventoryExcelParser';
import { parseDeliveryTable, matchBatchesWithERP } from '../../utils/deliveryExcelParser';
import { BatchMatchResult } from '../../types';
import { BatchMatchSummaryModal } from './BatchMatchSummaryModal';

interface WMSImportViewProps {
  userRole: string;
}

export function WMSImportView({ userRole }: WMSImportViewProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [matchResults, setMatchResults] = useState<BatchMatchResult[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [isSavingBatches, setIsSavingBatches] = useState(false);
  const [existingYardBatches, setExistingYardBatches] = useState<any[]>([]);

  const handleZakupyImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportMessage(null);
    try {
      const parsedDeliveries = await parseZakupyInfo(file);
      
      const inventorySnap = await getDocs(collection(db, 'inventoryBatches'));
      const batchesSums: Record<string, number> = {};
      
      inventorySnap.docs.forEach(doc => {
        const batch = doc.data();
        if (batch.sourcePurchaseOrderId) {
          const qty = batch.initialQuantity ?? batch.numericQuantity ?? 0;
          batchesSums[batch.sourcePurchaseOrderId] = (batchesSums[batch.sourcePurchaseOrderId] || 0) + qty;
        }
      });

      const CHUNK_SIZE = 450; 
      for (let i = 0; i < parsedDeliveries.length; i += CHUNK_SIZE) {
        const batchWrite = writeBatch(db);
        const chunk = parsedDeliveries.slice(i, i + CHUNK_SIZE);
        
        chunk.forEach(item => {
          const docRef = doc(collection(db, 'expectedDeliveries'), item.id);
          
          const wmsSum = batchesSums[item.id] || 0;
          const newWmsDeliveredQuantity = wmsSum;
          const newWmsTotalValue = newWmsDeliveredQuantity * (item.unitPrice || 0);
          
          const itemToSave = { 
            ...item, 
            wmsDeliveredQuantity: newWmsDeliveredQuantity,
            wmsTotalValue: newWmsTotalValue,
            importedAt: serverTimestamp(), 
            lastModifiedAt: serverTimestamp() 
          };
          
          batchWrite.set(docRef, itemToSave, { merge: true });
        });
        
        await batchWrite.commit();
      }
      setImportMessage({ type: 'success', text: `Zaktualizowano listę oczekujących z ERP. Przeliczono "Przyjęto WMS".` });
    } catch (error: any) {
      setImportMessage({ type: 'error', text: error.message });
    } finally {
      setIsImporting(false);
      e.target.value = ''; 
    }
  };

  const handleDeliveryImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportMessage(null);
    try {
      const parsedPhysicalBatches = await parseDeliveryTable(file);
      const expectedSnap = await getDocs(collection(db, 'expectedDeliveries'));
      const erpDeliveries = expectedSnap.docs.map(d => ({ ...d.data(), id: d.id }));
      const inventorySnap = await getDocs(collection(db, 'inventoryBatches'));
      const existingBatches = inventorySnap.docs.map(d => d.data());
      setExistingYardBatches(existingBatches);
      
      const existingBatchNumbers = new Set(existingBatches.map((b: any) => b.batchNumber));
      const results = matchBatchesWithERP(parsedPhysicalBatches, erpDeliveries);
      results.forEach(res => { if (existingBatchNumbers.has(res.batch.batchNumber)) res.matchStatus = 'DUPLICATE'; });
      
      setMatchResults(results);
      setShowMatchModal(true); 
    } catch (error: any) {
      setImportMessage({ type: 'error', text: error.message });
    } finally {
      setIsImporting(false);
      e.target.value = ''; 
    }
  };

  const handleArticleRegistryImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportMessage(null);
    try {
      const parsedArticles = await parseArticleRegistry(file);
      const CHUNK_SIZE = 450; 
      for (let i = 0; i < parsedArticles.length; i += CHUNK_SIZE) {
        const batchWrite = writeBatch(db);
        const chunk = parsedArticles.slice(i, i + CHUNK_SIZE);
        
        chunk.forEach(item => {
           // Zapisujemy po wygenerowanym ID (kod+nazwa lub indeks) aby nadpisywać te same
           const docRef = doc(db, 'inventoryArticles', item.id as string);
           batchWrite.set(docRef, { ...item, updatedAt: serverTimestamp() }, { merge: true });
        });
        await batchWrite.commit();
      }
      setImportMessage({ type: 'success', text: `Zaktualizowano katalog indeksów o ${parsedArticles.length} pozycji.` });
    } catch (error: any) {
      setImportMessage({ type: 'error', text: error.message });
    } finally {
      setIsImporting(false);
      e.target.value = ''; 
    }
  };

  const handleConfirmMatch = async () => {
    setIsSavingBatches(true);
    try {
      const batchWrite = writeBatch(db);
      const validResults = matchResults.filter(r => r.matchStatus !== 'DUPLICATE');
      
      const poUpdates: Record<string, { qtyToAdd: number, unitPrice: number }> = {};

      validResults.forEach(res => {
        const newBatchRef = doc(collection(db, 'inventoryBatches'));
        const batchData: any = { ...res.batch, createdAt: serverTimestamp(), createdBy: 'Import' };
        
        if (res.matchedPurchaseOrder) {
          batchData.sourcePurchaseOrderId = res.matchedPurchaseOrder.id;
          const poId = res.matchedPurchaseOrder.id;
          if (!poUpdates[poId]) {
            poUpdates[poId] = { qtyToAdd: 0, unitPrice: res.matchedPurchaseOrder.unitPrice || 0 };
          }
          poUpdates[poId].qtyToAdd += res.batch.numericQuantity;
        }
        
        batchWrite.set(newBatchRef, batchData);
      });

      for (const [poId, data] of Object.entries(poUpdates)) {
         const poRef = doc(db, 'expectedDeliveries', poId);
         batchWrite.update(poRef, { 
           wmsDeliveredQuantity: increment(data.qtyToAdd), 
           wmsTotalValue: increment(data.qtyToAdd * data.unitPrice),
           lastModifiedAt: serverTimestamp() 
         });
      }

      await batchWrite.commit();
      setImportMessage({ type: 'success', text: `Gotowe! Zapisano ${validResults.length} wsadów na Plac i zaktualizowano wyceny.` });
      setShowMatchModal(false);
    } catch (err: any) {
      setImportMessage({ type: 'error', text: err.message });
    } finally {
      setIsSavingBatches(false);
    }
  };

  const handleInventoryBOImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportMessage(null);
    try {
      const parsedBalances = await parseInventoryBalances(file);
      
      const CHUNK_SIZE = 450; 
      for (let i = 0; i < parsedBalances.length; i += CHUNK_SIZE) {
        const batchWrite = writeBatch(db);
        const chunk = parsedBalances.slice(i, i + CHUNK_SIZE);
        
        chunk.forEach(item => {
          const newBatchRef = doc(collection(db, 'inventoryBatches'));
          const itemToSave = { 
            ...item, 
            createdAt: serverTimestamp(), 
            createdBy: 'Import Inwentaryzacji BO',
            sourcePurchaseOrderId: 'INWENTARYZACJA' 
          };
          
          batchWrite.set(newBatchRef, itemToSave);
        });
        
        await batchWrite.commit();
      }
      setImportMessage({ type: 'success', text: `Gotowe! Improtowano poprawnie ${parsedBalances.length} wsadów z bilansu otwarcia inwentaryzacji.` });
    } catch (error: any) {
      setImportMessage({ type: 'error', text: error.message });
    } finally {
      setIsImporting(false);
      e.target.value = ''; 
    }
  };


  return (
    <div className="bg-white rounded-3xl p-8 border border-stone-200 shadow-xl">
      <AnimatePresence>
        {showMatchModal && <BatchMatchSummaryModal results={matchResults} onClose={() => setShowMatchModal(false)} onConfirm={handleConfirmMatch} isSaving={isSavingBatches} />}
      </AnimatePresence>

      <h2 className="text-2xl font-black text-stone-900 mb-6">Wymiana Danych (ERP / Plac)</h2>
      {importMessage && (
        <div className={`mb-6 p-4 rounded-2xl flex items-start gap-3 ${importMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
          {importMessage.type === 'success' ? <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />}
          <p className="font-medium text-sm">{importMessage.text}</p>
        </div>
      )}
      <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200 relative overflow-hidden group">
          <Truck size={24} className="text-indigo-600 mb-4" />
          <h3 className="font-bold text-stone-900 mb-2">1. Wgraj "Zakupy-info"</h3>
          <p className="text-xs text-stone-500 mb-4 leading-relaxed">Pobiera indeksy, ceny i zamówienia oczekujące z ERP. Trzon całego systemu. Wymaga pliku z kolumnami: "Zlecenie...", "indeks...", "cena j.".</p>
          <label className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 text-white rounded-xl font-bold cursor-pointer hover:bg-indigo-700 transition-all mt-auto">
            <Upload size={18} /> {isImporting ? 'Przetwarzanie...' : 'Aktualizuj z ERP'}
            <input type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleZakupyImport} disabled={isImporting} />
          </label>
        </div>
        
        {userRole !== 'MAGAZYNIER' && (
          <div className="p-6 bg-amber-50/50 rounded-2xl border border-amber-200 relative overflow-hidden group shadow-sm">
            <PackagePlus size={24} className="text-amber-600 mb-4" />
            <h3 className="font-bold text-stone-900 mb-2">2. Wgraj "Tabelę Dostaw"</h3>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">Wgrywa przeszłe dostawy. Algorytm odnajdzie parę w Zamówieniach (Zakupy-info) na podstawie zgodności dostawcy, numeru lub indeksu.</p>
            <label className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 text-stone-900 rounded-xl font-black cursor-pointer hover:bg-amber-400 transition-all mt-auto">
              <Upload size={18} /> {isImporting ? 'Przetwarzanie...' : 'Zrób Matchowanie'}
              <input type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleDeliveryImport} disabled={isImporting} />
            </label>
          </div>
        )}
        {userRole !== 'MAGAZYNIER' && (
          <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-200 relative overflow-hidden group shadow-sm">
            <ClipboardCheck size={24} className="text-emerald-600 mb-4" />
            <h3 className="font-bold text-stone-900 mb-2">3. Wgraj "Inwentaryzację (B.O.)"</h3>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">Wczytuje surowy zrzut ze spisu jako wirtualne wsady z etykietą INWENTARYZACJA. Stworzy stany na placu, bez wiązania z ceną i zamówieniem.</p>
            <label className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-600 text-white rounded-xl font-black cursor-pointer hover:bg-emerald-500 transition-all mt-auto">
              <Upload size={18} /> {isImporting ? 'Przetwarzanie...' : 'Załaduj BO'}
              <input type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleInventoryBOImport} disabled={isImporting} />
            </label>
          </div>
        )}
        <div className="p-6 bg-sky-50/50 rounded-2xl border border-sky-200 relative overflow-hidden group shadow-sm">
          <ClipboardCheck size={24} className="text-sky-600 mb-4" />
          <h3 className="font-bold text-stone-900 mb-2">4. Wgraj "Katalog Indeksów"</h3>
          <p className="text-xs text-stone-500 mb-4 leading-relaxed">Wgrywa same nagłówki asortymentowe (indeks + nazwa). Pozwala na dodawanie wsadów do pozycji, które zeszły w ERP na 0 i nie istnieją w na placu.</p>
          <label className="flex items-center justify-center gap-2 w-full py-3 bg-sky-500 text-white rounded-xl font-black cursor-pointer hover:bg-sky-400 transition-all mt-auto">
            <Upload size={18} /> {isImporting ? 'Przetwarzanie...' : 'Załaduj Indeksy'}
            <input type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleArticleRegistryImport} disabled={isImporting} />
          </label>
        </div>
      </div>

    </div>
  );
}
