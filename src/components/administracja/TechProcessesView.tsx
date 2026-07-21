import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { ListTree, Plus, Pencil, Trash2, X, Check, ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { db } from '../../firebase';
import { TechProcess, TechOperation, TechProcessStep, WorkStation } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface TechProcessesViewProps {
  workStations: WorkStation[];
  onBack?: () => void;
}

export function TechProcessesView({ workStations, onBack }: TechProcessesViewProps) {
  const [processes, setProcesses] = useState<TechProcess[]>([]);
  const [operations, setOperations] = useState<TechOperation[]>([]);
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formName, setFormName] = useState('');
  const [formSteps, setFormSteps] = useState<TechProcessStep[]>([]);

  useEffect(() => {
    const qProc = query(collection(db, 'techProcesses'), orderBy('name'));
    const unsubProc = onSnapshot(qProc, (snapshot) => {
      setProcesses(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as TechProcess[]);
    });

    const qOps = query(collection(db, 'techOperations'), orderBy('name'));
    const unsubOps = onSnapshot(qOps, (snapshot) => {
      setOperations(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as TechOperation[]);
    });

    return () => { unsubProc(); unsubOps(); };
  }, []);

  const resetForm = () => {
    setFormName('');
    setFormSteps([]);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleAddStep = () => {
    if (workStations.length === 0) return;
    const initialStationId = workStations[0].id;
    const initialOps = operations.filter(o => o.workStationId === initialStationId);
    
    // Find the max stage to propose the same or next one
    const maxStage = formSteps.length > 0 ? Math.max(...formSteps.map(s => s.stage || 1)) : 1;
    
    const newStep: TechProcessStep = {
      workStationId: initialStationId,
      operationId: initialOps.length > 0 ? initialOps[0].id! : '',
      name: initialOps.length > 0 ? initialOps[0].name : '',
      orderIndex: formSteps.length,
      stage: maxStage,
      isExportPoint: false,
    };
    setFormSteps([...formSteps, newStep]);
  };

  const handleUpdateStep = (index: number, field: keyof TechProcessStep, value: any) => {
    const updated = [...formSteps];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'workStationId') {
      const opsForStation = operations.filter(o => o.workStationId === value);
      if (opsForStation.length > 0) {
        updated[index].operationId = opsForStation[0].id!;
        updated[index].name = opsForStation[0].name;
      } else {
        updated[index].operationId = '';
        updated[index].name = '';
      }
    } else if (field === 'operationId') {
      updated[index].name = operations.find(o => o.id === value)?.name || '';
    }
    
    setFormSteps(updated);
  };

  const handleRemoveStep = (index: number) => {
    const updated = formSteps.filter((_, i) => i !== index).map((step, i) => ({ ...step, orderIndex: i }));
    setFormSteps(updated);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === formSteps.length - 1) return;
    
    const updated = [...formSteps];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    
    const temp = updated[index];
    updated[index] = updated[swapIndex];
    updated[swapIndex] = temp;
    
    // update orderIndex
    updated.forEach((step, i) => { step.orderIndex = i; });
    setFormSteps(updated);
  };

  const handleSave = async () => {
    if (!formName) {
      alert('Podaj nazwę procesu.');
      return;
    }
    if (formSteps.length === 0) {
      alert('Dodaj co najmniej jedną operację do procesu.');
      return;
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'techProcesses', editingId), {
          name: formName,
          steps: formSteps,
        });
      } else {
        await addDoc(collection(db, 'techProcesses'), {
          name: formName,
          steps: formSteps,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (e) {
      console.error(e);
      alert('Wystąpił błąd podczas zapisywania procesu.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten proces?')) return;
    try {
      await deleteDoc(doc(db, 'techProcesses', id));
    } catch (e) {
      console.error(e);
      alert('Błąd podczas usuwania.');
    }
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
            <ListTree className="text-emerald-600" />
            Słownik Procesów Technologicznych
          </h2>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium text-sm shadow-sm"
          >
            <Plus size={16} /> Dodaj proces
          </button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-stone-800">
              {editingId ? 'Edytuj proces' : 'Nowy proces'}
            </h3>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-stone-700 mb-1">Nazwa procesu</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="w-full md:w-1/2 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              placeholder="np. Bariera U2b - Standard"
            />
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-stone-700">Kroki procesu</label>
              <button
                onClick={handleAddStep}
                className="flex items-center gap-1 px-3 py-1.5 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors text-sm font-medium"
              >
                <Plus size={14} /> Dodaj krok
              </button>
            </div>
            
            {formSteps.length === 0 ? (
              <div className="text-center p-6 border-2 border-dashed border-stone-200 rounded-xl text-stone-400">
                Brak kroków. Dodaj operacje, aby zdefiniować proces.
              </div>
            ) : (
              <div className="space-y-3">
                {formSteps.map((step, index) => (
                  <div key={index} className="flex flex-col md:flex-row gap-3 items-start md:items-center p-3 bg-stone-50 border border-stone-200 rounded-xl">
                    <div className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-lg border border-stone-200 shadow-sm shrink-0">
                      <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Etap</label>
                      <input 
                        type="number"
                        min="1"
                        value={step.stage || 1}
                        onChange={e => handleUpdateStep(index, 'stage', parseInt(e.target.value) || 1)}
                        className="w-12 px-1 py-0.5 text-sm font-bold bg-stone-50 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-center"
                      />
                    </div>

                    <div className="flex items-center gap-2 self-stretch md:self-auto bg-stone-100 px-2 py-1.5 rounded-lg shrink-0">
                      <button 
                        onClick={() => handleMoveStep(index, 'up')}
                        disabled={index === 0}
                        className="text-stone-400 hover:text-stone-700 disabled:opacity-30 transition-colors"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <span className="text-sm font-bold text-stone-500 w-4 text-center">{index + 1}</span>
                      <button 
                        onClick={() => handleMoveStep(index, 'down')}
                        disabled={index === formSteps.length - 1}
                        className="text-stone-400 hover:text-stone-700 disabled:opacity-30 transition-colors"
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>

                    <div className="flex-1 w-full flex gap-2">
                      <select
                        value={step.workStationId || ''}
                        onChange={e => handleUpdateStep(index, 'workStationId', e.target.value)}
                        className="w-1/2 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                      >
                        <option value="" disabled>Wybierz MPK</option>
                        {workStations.map(ws => (
                          <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                      </select>
                      <select
                        value={step.operationId}
                        onChange={e => handleUpdateStep(index, 'operationId', e.target.value)}
                        className="w-1/2 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                        disabled={!step.workStationId}
                      >
                        {!step.workStationId && <option value="" disabled>Najpierw wybierz MPK</option>}
                        {step.workStationId && operations.filter(o => o.workStationId === step.workStationId).map(op => (
                          <option key={op.id} value={op.id}>{op.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={step.isExportPoint || false}
                          onChange={e => handleUpdateStep(index, 'isExportPoint', e.target.checked)}
                          className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        Operacja wyjściowa
                      </label>
                    </div>

                    <button
                      onClick={() => handleRemoveStep(index)}
                      className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {processes.map(proc => (
          <div key={proc.id} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm hover:border-emerald-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-stone-900 text-lg leading-tight">{proc.name}</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditingId(proc.id!);
                    setFormName(proc.name);
                    setFormSteps(proc.steps || []);
                    setIsAdding(false);
                  }}
                  className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(proc.id!)}
                  className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Kroki operacyjne ({proc.steps?.length || 0})</h4>
              <div className="flex flex-col gap-4">
                {(() => {
                  const stepsWithIndex = (proc.steps || []).map((s, i) => ({ ...s, originalIndex: i }));
                  const groupedSteps = stepsWithIndex.reduce((acc, step) => {
                    const stage = step.stage || 1;
                    if (!acc[stage]) acc[stage] = [];
                    acc[stage].push(step);
                    return acc;
                  }, {} as Record<number, typeof stepsWithIndex>);

                  return Object.keys(groupedSteps).sort((a,b) => Number(a) - Number(b)).map(stage => (
                    <div key={stage} className="flex gap-3">
                      <div className="w-14 shrink-0 pt-0.5">
                        <span className="inline-flex items-center justify-center px-2 py-1 bg-stone-100 text-stone-500 rounded text-[10px] font-bold uppercase tracking-wider border border-stone-200">
                          Etap {stage}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        {groupedSteps[Number(stage)].map(step => {
                          const op = operations.find(o => o.id === step.operationId);
                          const ws = op ? workStations.find(w => w.id === op.workStationId) : null;
                          return (
                            <div key={step.originalIndex} className="flex items-center gap-2 text-sm">
                              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center text-xs font-medium shrink-0">
                                {step.originalIndex + 1}
                              </span>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-stone-700 truncate font-medium leading-tight">{step.name}</span>
                                {ws && <span className="text-[10px] text-stone-500 truncate">{ws.name}</span>}
                              </div>
                              {step.isExportPoint && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase tracking-wider shrink-0">
                                  Wyjście
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        ))}
        {processes.length === 0 && (
          <div className="col-span-full text-center py-12 text-stone-500 bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200">
            Brak zdefiniowanych procesów. Kliknij "Dodaj proces" aby rozpocząć.
          </div>
        )}
      </div>
    </div>
  );
}
