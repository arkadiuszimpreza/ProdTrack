import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, doc, getDoc, writeBatch, getDocs, where, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { Edit2, Trash2, X, Save, Search, History } from 'lucide-react';
import { InventoryBatch } from '../../types';
import { cn } from '../../utils/firestore-helpers';

export function ManualReceiptsView() {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingBatch, setEditingBatch] = useState<InventoryBatch | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'inventoryBatches'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const all: InventoryBatch[] = [];
      snap.forEach(d => {
        const docData = d.data() as InventoryBatch;
        docData.id = d.id;
        // Tylko ręczne przyjęcia
        if (docData.createdBy === 'Magazynier (Ręcznie)') {
          all.push(docData);
        }
      });
      setBatches(all);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleDelete = async (batch: InventoryBatch) => {
    if (!window.confirm(`Czy na pewno usunąć wsad ${batch.batchNumber}? Ta operacja cofnie ilość z WMS w tabeli dostaw.`)) return;

    try {
      await runTransaction(db, async (transaction) => {
        const batchRef = doc(db, 'inventoryBatches', batch.id!);
        let poRef = null;
        let poData = null;

        if (batch.sourcePurchaseOrderId) {
          poRef = doc(db, 'expectedDeliveries', batch.sourcePurchaseOrderId);
          const poSnap = await transaction.get(poRef);
          if (poSnap.exists()) {
            poData = poSnap.data();
          }
        }

        const backupQ = query(collection(db, 'wmsReceiptsBackup'), where('batchId', '==', batch.id!));
        const backupSnap = await getDocs(backupQ); // We can still do a read query outside of transaction state in getDocs, but to be robust, just do it.

        if (poRef && poData) {
          const newTotalQty = Math.max(0, Number(((poData.wmsDeliveredQuantity || 0) - (batch.numericQuantity || 0)).toFixed(3)));
          const newTotalValue = newTotalQty * (poData.unitPrice || 0);
          transaction.update(poRef, {
            wmsDeliveredQuantity: newTotalQty,
            wmsTotalValue: newTotalValue
          });
        }

        transaction.delete(batchRef);
        backupSnap.forEach(bDoc => {
          transaction.delete(bDoc.ref);
        });
      });

      alert('Usunięto pomyślnie.');
    } catch (err: any) {
      console.error(err);
      alert('Wystąpił błąd: ' + err.message);
    }
  };

  const handleEditClick = (batch: InventoryBatch) => {
    setEditingBatch(batch);
    setEditData({
      batchNumber: batch.batchNumber || '',
      dimensions: batch.dimensions || '',
      grade: batch.grade || '',
      numericQuantity: batch.numericQuantity || 0,
      quantityString: batch.quantityString || '',
      labelsCount: batch.labelsCount || 1,
      qcCard: !!batch.qcCard,
      certificate: !!batch.certificate,
      notes: batch.notes || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingBatch) return;
    setIsSubmitting(true);
    try {
      const oldQty = editingBatch.numericQuantity || 0;
      const newQty = Number(editData.numericQuantity);
      const qtyDiff = newQty - oldQty;

      await runTransaction(db, async (transaction) => {
        const batchRef = doc(db, 'inventoryBatches', editingBatch.id!);
        let poRef = null;
        let poData = null;

        if (editingBatch.sourcePurchaseOrderId && qtyDiff !== 0) {
          poRef = doc(db, 'expectedDeliveries', editingBatch.sourcePurchaseOrderId);
          const poSnap = await transaction.get(poRef);
          if (poSnap.exists()) {
            poData = poSnap.data();
          }
        }
        
        transaction.update(batchRef, {
          batchNumber: editData.batchNumber,
          dimensions: editData.dimensions,
          grade: editData.grade,
          numericQuantity: newQty,
          initialQuantity: newQty,
          quantityString: editData.quantityString,
          labelsCount: Number(editData.labelsCount) || 1,
          qcCard: editData.qcCard,
          certificate: editData.certificate,
          notes: editData.notes,
        });

        if (poRef && poData) {
          const newTotalQty = Math.max(0, Number(((poData.wmsDeliveredQuantity || 0) + qtyDiff).toFixed(3)));
          const newTotalValue = newTotalQty * (poData.unitPrice || 0);
          transaction.update(poRef, {
            wmsDeliveredQuantity: newTotalQty,
            wmsTotalValue: newTotalValue
          });
        }
      });

      setEditingBatch(null);
    } catch (err: any) {
      console.error(err);
      alert('Wystąpił błąd zapisu: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = batches.filter(b => 
    (b.batchNumber || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
    (b.articleName || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (b.articleNumber || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-stone-400 font-bold">Ładowanie ręcznych przyjęć...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center w-full max-w-sm">
          <Search className="text-stone-400 ml-2 mr-3 shrink-0" size={18} />
          <input 
            type="text" 
            placeholder="Szukaj przyjęcia po nazwie lub indeksie..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none focus:outline-none text-sm font-medium text-stone-700"
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-1.5 bg-stone-100 rounded-lg">
          <History size={16} className="text-stone-500" />
          <span className="text-xs font-bold text-stone-600">Przyjęć ręcznych: {filtered.length}</span>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th className="p-3 font-bold text-stone-500 w-32">Nr Wsadu</th>
              <th className="p-3 font-bold text-stone-500 w-32">Zamówienie</th>
              <th className="p-3 font-bold text-stone-500 w-32">Data Dostawy</th>
              <th className="p-3 font-bold text-stone-500 w-24">Indeks</th>
              <th className="p-3 font-bold text-stone-500">Asortyment</th>
              <th className="p-3 font-bold text-stone-500 w-24">Wymiar</th>
              <th className="p-3 font-bold text-right text-stone-500 w-24">Ilość</th>
              <th className="p-3 font-bold text-center text-stone-500 w-24">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-stone-400">Brak zarejestrowanych ręcznych przyjęć.</td></tr>
            ) : (
              filtered.map(b => (
                <tr key={b.id} className="hover:bg-stone-50 transition-colors group">
                  <td className="p-3 font-black text-indigo-700">{b.batchNumber}</td>
                  <td className="p-3 font-bold text-stone-600">{b.orderNumber || '-'}</td>
                  <td className="p-3 text-stone-500 font-mono text-xs text-center">{b.deliveryDate ? b.deliveryDate : (b.createdAt?.toDate ? b.createdAt.toDate().toLocaleDateString() : '-')}</td>
                  <td className="p-3 font-mono text-xs text-stone-400">{b.articleNumber}</td>
                  <td className="p-3 font-semibold text-stone-700 truncate min-w-[200px]" title={b.articleName}>{b.articleName}</td>
                  <td className="p-3 text-stone-500">{b.dimensions || '-'}</td>
                  <td className="p-3 text-right font-black text-stone-800">{b.numericQuantity}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEditClick(b)} className="p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-200" title="Edytuj">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(b)} className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200" title="Usuń z bazy i cofnij WMS">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-indigo-600 text-white flex items-center justify-between shrink-0">
              <h2 className="font-bold tracking-tight">Edycja ręcznego przyjęcia</h2>
              <button disabled={isSubmitting} onClick={() => setEditingBatch(null)} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500">Numer wsadu</label>
                  <input type="text" value={editData.batchNumber} onChange={e => setEditData({...editData, batchNumber: e.target.value})} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg font-bold" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500">Ilość bazowa (do kalkulacji)</label>
                  <input type="number" step="0.001" value={editData.numericQuantity} onChange={e => setEditData({...editData, numericQuantity: e.target.value})} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg font-bold text-indigo-700" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500">Tekst Ilości (Etykieta)</label>
                  <input type="text" value={editData.quantityString} onChange={e => setEditData({...editData, quantityString: e.target.value})} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500">Wymiar</label>
                  <input type="text" value={editData.dimensions} onChange={e => setEditData({...editData, dimensions: e.target.value})} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500">Gatunek/Szczegóły</label>
                  <input type="text" value={editData.grade} onChange={e => setEditData({...editData, grade: e.target.value})} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500">Liczba etykiet</label>
                  <input type="number" value={editData.labelsCount} onChange={e => setEditData({...editData, labelsCount: e.target.value})} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg" />
                </div>
              </div>

              <div className="flex items-center gap-6 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editData.qcCard} onChange={e => setEditData({...editData, qcCard: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-stone-300" />
                  <span className="text-sm font-bold text-stone-700">Karta kontroli</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editData.certificate} onChange={e => setEditData({...editData, certificate: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-stone-300" />
                  <span className="text-sm font-bold text-stone-700">Wymagany atest</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-stone-500">Uwagi</label>
                <textarea value={editData.notes} onChange={e => setEditData({...editData, notes: e.target.value})} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-sm resize-none h-20" />
              </div>

            </div>
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-3 shrink-0">
              <button disabled={isSubmitting} onClick={() => setEditingBatch(null)} className="px-4 py-2 text-stone-600 font-bold hover:bg-stone-200 rounded-xl transition-colors">
                Anuluj
              </button>
              <button disabled={isSubmitting} onClick={handleSaveEdit} className={cn("flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white font-black rounded-xl shadow-md transition-colors", isSubmitting ? "opacity-50" : "hover:bg-indigo-700")}>
                <Save size={18} />
                Zapisz Zmiany
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
