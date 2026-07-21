import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Settings, Plus, Pencil, Trash2, X, Check, ArrowLeft } from 'lucide-react';
import { db } from '../../firebase';
import { TechOperation, WorkStation } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface TechOperationsViewProps {
  workStations: WorkStation[];
  onBack?: () => void;
}

export function TechOperationsView({ workStations, onBack }: TechOperationsViewProps) {
  const [operations, setOperations] = useState<TechOperation[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formName, setFormName] = useState('');
  const [formWorkStationId, setFormWorkStationId] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'techOperations'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOperations(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as TechOperation[]);
    });
    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setFormName('');
    setFormWorkStationId(workStations[0]?.id || '');
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!formName || !formWorkStationId) {
      alert('Wypełnij wszystkie pola.');
      return;
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'techOperations', editingId), {
          name: formName,
          workStationId: formWorkStationId,
        });
      } else {
        await addDoc(collection(db, 'techOperations'), {
          name: formName,
          workStationId: formWorkStationId,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (e) {
      console.error(e);
      alert('Wystąpił błąd podczas zapisywania operacji.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę operację?')) return;
    try {
      await deleteDoc(doc(db, 'techOperations', id));
    } catch (e) {
      console.error(e);
      alert('Błąd podczas usuwania.');
    }
  };

  const getStationName = (id: string) => {
    return workStations.find(ws => ws.id === id)?.name || 'Nieznane gniazdo';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
              <ArrowLeft size={20} className="text-stone-500" />
            </button>
          )}
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Settings className="text-emerald-600" />
            Słownik Operacji Technologicznych
          </h2>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => {
              setFormWorkStationId(workStations[0]?.id || '');
              setIsAdding(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium text-sm shadow-sm"
          >
            <Plus size={16} /> Dodaj operację
          </button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-800 mb-4">
            {editingId ? 'Edytuj operację' : 'Nowa operacja'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Nazwa operacji</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="np. Cięcie Laserowe 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Gniazdo produkcyjne</label>
              <select
                value={formWorkStationId}
                onChange={e => setFormWorkStationId(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                {workStations.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-stone-600 font-medium hover:bg-stone-100 rounded-lg transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-sm"
            >
              <Check size={16} /> Zapisz
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th className="px-6 py-4 text-sm font-semibold text-stone-600">Nazwa operacji</th>
              <th className="px-6 py-4 text-sm font-semibold text-stone-600">Gniazdo produkcyjne</th>
              <th className="px-6 py-4 text-sm font-semibold text-stone-600 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {operations.map(op => (
              <tr key={op.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-6 py-4 font-medium text-stone-900">{op.name}</td>
                <td className="px-6 py-4 text-stone-600">{getStationName(op.workStationId)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditingId(op.id!);
                        setFormName(op.name);
                        setFormWorkStationId(op.workStationId);
                        setIsAdding(false);
                      }}
                      className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(op.id!)}
                      className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {operations.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-stone-500">
                  Brak zdefiniowanych operacji. Kliknij "Dodaj operację" aby rozpocząć.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
