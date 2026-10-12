import React, { useState } from 'react';
import { Factory, Plus, X, Save, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WorkStation } from '../../types';
import { useDictionary } from '../../hooks/useDictionary';
import { proposeMpkForStations, type MpkRef } from '../../utils/stationMpk';

export function WorkStationManagementView({
  stations,
  onAdd,
  onDelete,
  onUpdate
}: {
  stations: WorkStation[],
  onAdd: (data: Omit<WorkStation, 'id' | 'createdAt'>) => Promise<boolean>,
  onDelete: (id: string) => Promise<boolean>,
  onUpdate: (id: string, data: Partial<WorkStation>) => Promise<boolean>
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<WorkStation>>({});
  const [mpkCode, setMpkCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // Słownik MPK (pozycje zapisane w słowniku systemowym); puste, dopóki nie zostanie wczytany.
  const mpkDictionary = useDictionary('mpk');
  const mpkList: MpkRef[] = mpkDictionary.items.map((row) => ({
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    active: row.active !== false,
  }));
  const mpkLabel = (code: string | undefined) => {
    if (!code) return null;
    const found = mpkList.find((m) => m.code === code);
    return found ? `${found.code} ${found.name}` : `${code} (brak w słowniku MPK)`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setIsSubmitting(true);
    const success = await onAdd(mpkCode ? { name, description, mpkCode } : { name, description });
    if (success) {
      setName('');
      setDescription('');
      setMpkCode('');
      setShowAddForm(false);
    }
    setIsSubmitting(false);
  };

  // Propozycja MPK z numeru na początku nazwy stanowiska — tylko dla stanowisk bez przypisanego MPK.
  const handleProposeMpk = async () => {
    setNotice(null);
    const { proposals, unmatched } = proposeMpkForStations(stations, mpkList);
    if (proposals.length === 0) {
      setNotice(
        unmatched.length > 0
          ? `Nie znaleziono dopasowań w słowniku MPK (stanowisk bez MPK: ${unmatched.length}). Sprawdź, czy słownik MPK został wczytany.`
          : 'Wszystkie stanowiska mają już przypisane MPK.'
      );
      return;
    }
    const inactive = proposals.filter((p) => !p.mpkActive).length;
    const confirmed = window.confirm(
      `Przypisać MPK ${proposals.length} stanowiskom na podstawie numeru w nazwie?` +
        (inactive > 0 ? `\n\nUwaga: ${inactive} z nich wskazuje wyłączone MPK.` : '') +
        (unmatched.length > 0 ? `\n\nBez dopasowania zostanie: ${unmatched.length}.` : '') +
        '\n\nStanowiska, które już mają MPK, nie zostaną zmienione.'
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    let failed = 0;
    for (const proposal of proposals) {
      const ok = await onUpdate(proposal.stationId, { mpkCode: proposal.mpkCode });
      if (!ok) failed++;
    }
    setIsSubmitting(false);
    setNotice(
      failed === 0
        ? `Przypisano MPK: ${proposals.length}.`
        : `Przypisano MPK: ${proposals.length - failed} z ${proposals.length}. Nie udało się zapisać: ${failed}.`
    );
  };

  const handleEditSave = async (id: string) => {
    setIsSubmitting(true);
    const success = await onUpdate(id, editData);
    if (success) {
      setEditingId(null);
      setEditData({});
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <h2 className="text-2xl font-black text-stone-900 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
            <Factory size={20} />
          </div>
          Zarządzanie Stanowiskami
        </h2>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleProposeMpk}
            disabled={isSubmitting || mpkList.length === 0}
            title={mpkList.length === 0 ? 'Najpierw wczytaj słownik MPK (Administracja → Słowniki systemowe)' : undefined}
            className="px-4 py-2 min-h-[44px] bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-bold hover:bg-stone-50 transition-all disabled:opacity-50"
          >
            Zaproponuj MPK z numeru w nazwie
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
          >
            <Plus size={18} />
            Dodaj stanowisko
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 text-sm whitespace-pre-line">
          {notice}
        </div>
      )}

      <AnimatePresence>
        {showAddForm && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-xl mb-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Nazwa stanowiska</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="np. Lakiernia, Spawalnia"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Opis (opcjonalnie)</label>
                  <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Krótki opis stanowiska"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">Miejsce powstawania kosztów (opcjonalnie)</label>
                  <select
                    value={mpkCode}
                    onChange={(e) => setMpkCode(e.target.value)}
                    className="w-full p-3 min-h-[44px] bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">— nie przypisano —</option>
                    {mpkList.filter((m) => m.active).map((m) => (
                      <option key={m.code} value={m.code}>{m.code} {m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-6 py-2 text-sm font-bold text-stone-500 hover:text-stone-700 transition-all"
                >
                  Anuluj
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Dodawanie...' : 'Zapisz stanowisko'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
        {stations.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-stone-50 text-stone-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Factory size={32} />
            </div>
            <p className="text-stone-500 font-medium">Brak zdefiniowanych stanowisk pracy.</p>
            <button 
              onClick={() => setShowAddForm(true)}
              className="mt-4 text-emerald-600 font-bold hover:underline"
            >
              Dodaj pierwsze stanowisko
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-wider text-stone-400">Nazwa</th>
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-wider text-stone-400">Opis</th>
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-wider text-stone-400">MPK</th>
                  <th className="p-4 text-right text-[10px] font-black uppercase tracking-wider text-stone-400">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {stations.map(station => (
                  <tr key={station.id} className="hover:bg-stone-50/50 transition-colors group">
                    <td className="p-4">
                      {editingId === station.id ? (
                        <input 
                          value={editData.name || ''}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="w-full p-2 text-sm border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20"
                        />
                      ) : (
                        <span className="font-bold text-stone-900">{station.name}</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-stone-600">
                      {editingId === station.id ? (
                        <input 
                          value={editData.description || ''}
                          onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                          className="w-full p-2 text-sm border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20"
                        />
                      ) : (
                        station.description || <span className="text-stone-300 italic">Brak opisu</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-stone-600">
                      {editingId === station.id ? (
                        <select
                          value={editData.mpkCode || ''}
                          onChange={(e) => setEditData({ ...editData, mpkCode: e.target.value })}
                          className="w-full p-2 min-h-[44px] text-sm border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20"
                        >
                          <option value="">— nie przypisano —</option>
                          {mpkList
                            .filter((m) => m.active || m.code === editData.mpkCode)
                            .map((m) => (
                              <option key={m.code} value={m.code}>{m.code} {m.name}</option>
                            ))}
                          {editData.mpkCode && !mpkList.some((m) => m.code === editData.mpkCode) && (
                            <option value={editData.mpkCode}>{editData.mpkCode} (brak w słowniku MPK)</option>
                          )}
                        </select>
                      ) : (
                        mpkLabel(station.mpkCode) || <span className="text-stone-300 italic">Nie przypisano</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {editingId === station.id ? (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handleEditSave(station.id)}
                              disabled={isSubmitting}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Zapisz"
                            >
                              <Save size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                setEditingId(null);
                                setEditData({});
                              }}
                              className="p-1.5 text-stone-400 hover:bg-stone-100 rounded-lg transition-all"
                              title="Anuluj"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : deletingId === station.id ? (
                          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                            <span className="text-[10px] font-black uppercase text-red-500">Na pewno?</span>
                            <button 
                              onClick={() => {
                                onDelete(station.id);
                                setDeletingId(null);
                              }}
                              className="px-2 py-1 bg-red-600 text-white text-[10px] font-black uppercase rounded hover:bg-red-700 transition-all"
                            >
                              Tak
                            </button>
                            <button 
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 bg-stone-100 text-stone-600 text-[10px] font-black uppercase rounded hover:bg-stone-200 transition-all"
                            >
                              Nie
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingId(station.id);
                                setEditData({ name: station.name, description: station.description, mpkCode: station.mpkCode ?? '' });
                              }}
                              className="p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Edytuj"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => setDeletingId(station.id)}
                              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Usuń"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}