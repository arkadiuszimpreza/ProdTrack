import React, { useState } from 'react';
import { UserPlus, Trash2, Upload, Plus, AlertTriangle, X, CheckCircle2, AlertCircle, Save, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee } from '../../types';

export function EmployeeManagementView({
  employees,
  onAdd,
  onDelete,
  onUpdate,
  onImport,
  isImporting,
  importSummary,
  onClearSummary,
  onClearAll
}: {
  employees: Employee[],
  onAdd: (data: Omit<Employee, 'id' | 'displayName'>) => Promise<boolean>,
  onDelete: (id: string) => Promise<boolean>,
  onUpdate: (id: string, data: Partial<Employee>) => Promise<boolean>,
  onClearAll: () => Promise<boolean>,
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void,
  isImporting: boolean,
  importSummary: { added: string[], skipped: string[] } | null,
  onClearSummary: () => void
}) {
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [group, setGroup] = useState('');
  const [position, setPosition] = useState('');
  const [rfidCard, setRfidCard] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Employee>>({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName) return;

    setIsSubmitting(true);
    const success = await onAdd({ employeeNumber, firstName, lastName, group, position, rfidCard });
    if (success) {
      setEmployeeNumber('');
      setFirstName('');
      setLastName('');
      setGroup('');
      setPosition('');
      setRfidCard('');
      setShowAddForm(false);
    }
    setIsSubmitting(false);
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

  const handleClearAll = async () => {
    setIsSubmitting(true);
    const success = await onClearAll();
    if (success) {
      setShowClearConfirm(false);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <h2 className="text-2xl font-black text-stone-900 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
            <UserPlus size={20} />
          </div>
          Zarządzanie Pracownikami
        </h2>
        
        <div className="flex gap-3">
          {employees.length > 0 && (
            <button 
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-all border border-red-100"
            >
              <Trash2 size={18} />
              Wyczyść wszystko
            </button>
          )}
          <label className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-600 hover:bg-stone-50 transition-all cursor-pointer shadow-sm">
            <Upload size={18} className="text-emerald-600" />
            Importuj z Excel
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              className="hidden" 
              onChange={onImport}
              disabled={isImporting}
            />
          </label>
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
          >
            <Plus size={18} />
            Dodaj pracownika
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm"
          >
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-stone-100">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-black text-center text-stone-900 mb-2">Czy na pewno chcesz wyczyścić bazę?</h3>
              <p className="text-stone-500 text-center mb-8">Ta operacja usunie wszystkich pracowników z systemu. Nie można tego cofnąć.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-6 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-all"
                >
                  Anuluj
                </button>
                <button 
                  onClick={handleClearAll}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-50"
                >
                  {isSubmitting ? 'Czyszczenie...' : 'Tak, usuń wszystko'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {importSummary && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-xl mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-stone-900">Podsumowanie importu</h3>
                <button 
                  onClick={onClearSummary}
                  className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold mb-2">
                    <CheckCircle2 size={18} />
                    Dodano ({importSummary.added.length})
                  </div>
                  <div className="max-h-32 overflow-y-auto text-xs text-emerald-600 space-y-1">
                    {importSummary.added.length > 0 ? (
                      importSummary.added.map((name, i) => <div key={i}>{name}</div>)
                    ) : (
                      <div className="italic opacity-50">Brak nowych rekordów</div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="flex items-center gap-2 text-amber-700 font-bold mb-2">
                    <AlertCircle size={18} />
                    Pominięto duplikaty ({importSummary.skipped.length})
                  </div>
                  <div className="max-h-32 overflow-y-auto text-xs text-amber-600 space-y-1">
                    {importSummary.skipped.length > 0 ? (
                      importSummary.skipped.map((name, i) => <div key={i}>{name}</div>)
                    ) : (
                      <div className="italic opacity-50">Brak duplikatów</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {showAddForm && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-xl mb-6">
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Nr ewidencyjny</label>
                  <input 
                    value={employeeNumber}
                    onChange={(e) => setEmployeeNumber(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="np. 1234"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Imię</label>
                  <input 
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="np. Jan"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Nazwisko</label>
                  <input 
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="np. Kowalski"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Grupa</label>
                  <input 
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="np. A1"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Stanowisko</label>
                  <input 
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="np. Spawacz"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 ml-1">Karta RFID</label>
                  <input 
                    value={rfidCard}
                    onChange={(e) => setRfidCard(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="Przyłóż kartę..."
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-6 flex justify-end gap-3 mt-2">
                  <button 
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-6 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100 rounded-xl transition-all"
                  >
                    Anuluj
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-2 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Zapisywanie...' : 'Zapisz pracownika'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Nr ewidencyjny</th>
                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Imię i Nazwisko</th>
                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Grupa</th>
                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Stanowisko</th>
                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Karta RFID</th>
                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-stone-400 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-stone-400">
                    <UserPlus size={48} className="mx-auto mb-4 opacity-10" />
                    <p>Brak pracowników w systemie.</p>
                    <p className="text-xs">Dodaj ręcznie lub zaimportuj z pliku Excel.</p>
                  </td>
                </tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-stone-50/50 transition-colors group">
                    <td className="p-4 text-sm font-medium text-stone-500">
                      {editingId === emp.id ? (
                        <input 
                          value={editData.employeeNumber || ''}
                          onChange={(e) => setEditData({ ...editData, employeeNumber: e.target.value })}
                          className="w-20 p-1 text-xs border border-stone-200 rounded"
                          placeholder="Nr"
                        />
                      ) : (
                        emp.employeeNumber || '—'
                      )}
                    </td>
                    <td className="p-4">
                      {editingId === emp.id ? (
                        <div className="flex gap-2">
                          <input 
                            value={editData.firstName || ''}
                            onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                            className="w-24 p-1 text-xs border border-stone-200 rounded"
                            placeholder="Imię"
                          />
                          <input 
                            value={editData.lastName || ''}
                            onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                            className="w-24 p-1 text-xs border border-stone-200 rounded"
                            placeholder="Nazwisko"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-stone-100 text-stone-500 rounded-lg flex items-center justify-center font-bold text-xs">
                            {emp.firstName[0]}{emp.lastName[0]}
                          </div>
                          <span className="font-bold text-stone-900">{emp.firstName} {emp.lastName}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      {editingId === emp.id ? (
                        <input 
                          value={editData.group || ''}
                          onChange={(e) => setEditData({ ...editData, group: e.target.value })}
                          className="w-20 p-1 text-xs border border-stone-200 rounded"
                          placeholder="Grupa"
                        />
                      ) : (
                        <span className="px-2 py-1 bg-stone-100 text-stone-600 rounded text-[10px] font-bold uppercase tracking-wider">
                          {emp.group || '—'}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-stone-600 font-medium">
                      {editingId === emp.id ? (
                        <input 
                          value={editData.position || ''}
                          onChange={(e) => setEditData({ ...editData, position: e.target.value })}
                          className="w-full p-1 text-xs border border-stone-200 rounded"
                          placeholder="Stanowisko"
                        />
                      ) : (
                        emp.position || '—'
                      )}
                    </td>
                    <td className="p-4 text-sm text-stone-600 font-medium">
                      {editingId === emp.id ? (
                        <input 
                          value={editData.rfidCard || ''}
                          onChange={(e) => setEditData({ ...editData, rfidCard: e.target.value })}
                          className="w-full p-1 text-xs border border-stone-200 rounded"
                          placeholder="Karta RFID"
                        />
                      ) : (
                        emp.rfidCard || '—'
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {editingId === emp.id ? (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handleEditSave(emp.id)}
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
                        ) : deletingId === emp.id ? (
                          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                            <span className="text-[10px] font-black uppercase text-red-500">Na pewno?</span>
                            <button 
                              onClick={() => {
                                onDelete(emp.id);
                                setDeletingId(null);
                              }}
                              className="px-2 py-1 bg-red-600 text-white text-[10px] font-black uppercase rounded hover:bg-red-700 transition-all"
                            >
                              Tak
                            </button>
                            <button 
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 bg-stone-100 text-stone-500 text-[10px] font-black uppercase rounded hover:bg-stone-200 transition-all"
                            >
                              Nie
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              onClick={() => {
                                setEditingId(emp.id);
                                setEditData({
                                  employeeNumber: emp.employeeNumber,
                                  firstName: emp.firstName,
                                  lastName: emp.lastName,
                                  group: emp.group,
                                  position: emp.position,
                                  rfidCard: emp.rfidCard
                                });
                              }}
                              className="p-2 text-stone-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Edytuj pracownika"
                            >
                              <Pencil size={18} />
                            </button>
                            <button 
                              onClick={() => setDeletingId(emp.id)}
                              className="p-2 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Usuń pracownika"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}