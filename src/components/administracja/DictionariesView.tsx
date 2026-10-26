import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Check, Pencil, Plus, X } from 'lucide-react';
import type { DictionaryId } from '../../types/dictionaries';
import { useDictionary } from '../../hooks/useDictionary';
import {
  DICTIONARY_FIELDS,
  DICTIONARY_TAB_ORDER,
  DICTIONARY_TITLES,
  emptyRow,
  keyFieldOf,
  type DictionaryRow,
  type FieldDef,
  type FieldOption,
} from '../../utils/dictionaryFields';
import {
  appendRow,
  describeDictionaryError,
  getSeedRows,
  mergeMissingSeeds,
  nextSortOrder,
  normalizeRow,
  replaceRow,
  rowKey,
  toggleActive,
} from '../../utils/dictionaryEditing';
import { updateDictionary } from '../../utils/dictionaryService';
import { cn } from '../../utils/firestore-helpers';

interface DictionariesViewProps {
  onBack?: () => void;
  readOnly?: boolean;
}

type EditorState = { mode: 'add' } | { mode: 'edit'; key: string };

type Notice = { kind: 'ok' | 'error'; text: string };

const inputClass =
  'w-full px-3 py-2 min-h-[44px] bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all disabled:bg-stone-100 disabled:text-stone-500';

/** Opcje pola: stałe z opisu albo (dla powiązań z MPK) zbudowane z aktualnej zawartości słownika MPK. */
function optionsFor(field: FieldDef, mpkRows: DictionaryRow[]): FieldOption[] {
  if (field.optionsFrom === 'mpk') {
    return mpkRows.map((row) => ({ value: String(row.code ?? ''), label: `${String(row.code ?? '')} ${String(row.name ?? '')}` }));
  }
  return field.options ?? [];
}

/** Tekst komórki tabeli dla danej wartości pola. */
function displayValue(field: FieldDef, value: unknown, options: FieldOption[]): string {
  if (field.kind === 'boolean') return value === true ? 'Tak' : 'Nie';
  if (field.kind === 'select') return options.find((o) => o.value === value)?.label ?? String(value ?? '');
  if (field.kind === 'multiselect') {
    const values = Array.isArray(value) ? value : [];
    return values.map((v) => options.find((o) => o.value === v)?.label ?? String(v)).join(', ');
  }
  return value === undefined || value === null ? '' : String(value);
}

export function DictionariesView({ onBack, readOnly = false }: DictionariesViewProps) {
  const [activeId, setActiveId] = useState<DictionaryId>('departments');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<DictionaryRow>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const dictionary = useDictionary(activeId);
  // MPK potrzebne zawsze: do wyboru powiązań w wydziałach i do sprawdzania, czy kod MPK istnieje.
  const mpk = useDictionary('mpk');

  const fields = DICTIONARY_FIELDS[activeId];
  const keyField = keyFieldOf(activeId);
  const validationContext = activeId === 'departments' && mpk.exists ? { mpkCodes: new Set(mpk.items.map((r) => String(r.code ?? ''))) } : {};

  const closeEditor = () => {
    setEditor(null);
    setForm({});
  };

  const selectTab = (id: DictionaryId) => {
    setActiveId(id);
    closeEditor();
    setNotice(null);
  };

  /** Wspólna obsługa zapisu: blokuje przyciski na czas operacji i zamienia błędy na komunikat po polsku. */
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try {
      const text = await action();
      setNotice({ kind: 'ok', text });
      closeEditor();
    } catch (error) {
      console.error('Błąd zapisu słownika:', error);
      setNotice({ kind: 'error', text: describeDictionaryError(error) });
    } finally {
      setBusy(false);
    }
  };

  const openAdd = () => {
    const row = emptyRow(activeId);
    if (activeId === 'departments') row.sortOrder = nextSortOrder(dictionary.items);
    setForm(row);
    setEditor({ mode: 'add' });
    setNotice(null);
  };

  const openEdit = (row: DictionaryRow) => {
    setForm({ ...row });
    setEditor({ mode: 'edit', key: rowKey(activeId, row) });
    setNotice(null);
  };

  const handleSave = () => {
    if (!editor) return;
    const row = normalizeRow(activeId, form);
    void run(async () => {
      await updateDictionary(
        activeId,
        (current) => (editor.mode === 'add' ? appendRow(current, row) : replaceRow(activeId, current, editor.key, row)),
        validationContext,
      );
      return editor.mode === 'add' ? 'Dodano pozycję.' : 'Zapisano zmiany.';
    });
  };

  const handleToggle = (key: string) => {
    void run(async () => {
      await updateDictionary(activeId, (current) => toggleActive(activeId, current, key), validationContext);
      return 'Zmieniono aktywność pozycji.';
    });
  };

  const handleSeeds = () => {
    const seeds = getSeedRows(activeId);
    const preview = mergeMissingSeeds(activeId, dictionary.items, seeds);
    if (preview.addedKeys.length === 0) {
      setNotice({ kind: 'ok', text: 'Wszystkie wartości startowe już są w słowniku — nic do dopisania.' });
      return;
    }
    const confirmed = window.confirm(
      `Dopisać ${preview.addedKeys.length} brakujących pozycji startowych do słownika „${DICTIONARY_TITLES[activeId]}”?\n\nIstniejące pozycje nie zostaną zmienione ani usunięte.`,
    );
    if (!confirmed) return;
    void run(async () => {
      let added = 0;
      await updateDictionary(
        activeId,
        (current) => {
          const merged = mergeMissingSeeds(activeId, current, seeds);
          added = merged.addedKeys.length;
          return merged.items;
        },
        validationContext,
      );
      return `Dopisano pozycji: ${added}.`;
    });
  };

  const setField = (name: string, value: unknown) => setForm((prev) => ({ ...prev, [name]: value }));

  const renderInput = (field: FieldDef) => {
    const value = form[field.name];
    const isLockedKey = editor?.mode === 'edit' && field.name === keyField;
    const options = optionsFor(field, mpk.items);

    switch (field.kind) {
      case 'boolean':
        return (
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => setField(field.name, e.target.checked)}
              className="w-5 h-5 accent-emerald-600"
            />
            <span className="text-sm text-stone-700">{field.label}</span>
          </label>
        );
      case 'longtext':
        return (
          <textarea
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setField(field.name, e.target.value)}
            rows={2}
            className={inputClass}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => setField(field.name, e.target.value === '' ? '' : Number(e.target.value))}
            className={inputClass}
          />
        );
      case 'select':
        return (
          <select value={typeof value === 'string' ? value : ''} onChange={(e) => setField(field.name, e.target.value)} className={inputClass}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case 'multiselect': {
        const selected = Array.isArray(value) ? (value as unknown[]) : [];
        if (options.length === 0) return <p className="text-sm text-stone-500">Brak dostępnych opcji.</p>;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 max-h-56 overflow-y-auto border border-stone-200 rounded-lg px-3 bg-stone-50">
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={(e) =>
                    setField(field.name, e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
                  }
                  className="w-5 h-5 accent-emerald-600"
                />
                <span className="text-sm text-stone-700">{o.label}</span>
              </label>
            ))}
          </div>
        );
      }
      default:
        return (
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setField(field.name, e.target.value)}
            disabled={isLockedKey}
            className={inputClass}
          />
        );
    }
  };

  const tableFields = fields.filter((f) => f.inTable);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 min-w-[44px] min-h-[44px] hover:bg-stone-100 rounded-full transition-colors">
              <ArrowLeft size={20} className="text-stone-500" />
            </button>
          )}
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <BookOpen className="text-emerald-600" />
            Słowniki systemowe
          </h2>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {DICTIONARY_TAB_ORDER.map((id) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            className={cn(
              'px-4 min-h-[44px] rounded-xl text-sm font-medium border transition-colors',
              id === activeId ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50',
            )}
          >
            {DICTIONARY_TITLES[id]}
          </button>
        ))}
      </div>

      {notice && (
        <div
          className={cn(
            'p-4 rounded-xl border text-sm whitespace-pre-line',
            notice.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800',
          )}
        >
          {notice.text}
        </div>
      )}

      {dictionary.error && <div className="p-4 rounded-xl border bg-red-50 border-red-200 text-red-800 text-sm">{dictionary.error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-stone-800">
          {DICTIONARY_TITLES[activeId]} <span className="text-stone-400 font-normal">({dictionary.items.length})</span>
        </h3>
        {!editor && !readOnly && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSeeds}
              disabled={busy || dictionary.loading}
              className="px-4 min-h-[44px] text-stone-700 border border-stone-200 bg-white rounded-xl hover:bg-stone-50 transition-colors font-medium text-sm disabled:opacity-50"
            >
              Dopisz brakujące wartości startowe
            </button>
            <button
              onClick={openAdd}
              disabled={busy || dictionary.loading}
              className="flex items-center gap-2 px-4 min-h-[44px] bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium text-sm shadow-sm disabled:opacity-50"
            >
              <Plus size={16} /> Dodaj pozycję
            </button>
          </div>
        )}
      </div>

      {!dictionary.loading && !dictionary.exists && !dictionary.error && (
        <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 text-sm">
          Ten słownik nie został jeszcze zapisany w bazie. Kliknij „Dopisz brakujące wartości startowe”, aby wczytać wartości z plików ERP i listy właściciela — potem możesz je dowolnie poprawiać.
        </div>
      )}

      {editor && (
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-800 mb-4">{editor.mode === 'add' ? 'Nowa pozycja' : `Edytuj: ${editor.key}`}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {fields.map((field) => (
              <div key={field.name} className={cn(field.kind === 'longtext' || field.kind === 'multiselect' ? 'md:col-span-2' : '')}>
                {field.kind !== 'boolean' && <label className="block text-sm font-medium text-stone-700 mb-1">{field.label}</label>}
                {renderInput(field)}
                {field.hint && <p className="text-xs text-stone-500 mt-1">{field.hint}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={closeEditor}
              disabled={busy}
              className="flex items-center gap-2 px-4 min-h-[44px] text-stone-600 font-medium hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X size={16} /> Anuluj
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="flex items-center gap-2 px-4 min-h-[44px] bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-sm disabled:opacity-50"
            >
              <Check size={16} /> {busy ? 'Zapisuję…' : 'Zapisz'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              {tableFields.map((field) => (
                <th key={field.name} className="px-4 py-3 text-sm font-semibold text-stone-600">
                  {field.label}
                </th>
              ))}
              {!readOnly && <th className="px-4 py-3 text-sm font-semibold text-stone-600 text-right">Akcje</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {dictionary.items.map((row) => {
              const key = rowKey(activeId, row);
              return (
                <tr key={key} className={cn('hover:bg-stone-50 transition-colors', row.active === false && 'opacity-60')}>
                  {tableFields.map((field) => (
                    <td key={field.name} className="px-4 py-3 text-sm text-stone-700 align-top">
                      {displayValue(field, row[field.name], optionsFor(field, mpk.items))}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(row)}
                          disabled={busy || editor !== null}
                          title="Edytuj"
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleToggle(key)}
                          disabled={busy || editor !== null}
                          className="px-3 min-h-[44px] text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {row.active === false ? 'Włącz' : 'Wyłącz'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {dictionary.loading && (
              <tr>
                <td colSpan={tableFields.length + (readOnly ? 0 : 1)} className="px-6 py-12 text-center text-stone-500">
                  Wczytuję…
                </td>
              </tr>
            )}
            {!dictionary.loading && dictionary.items.length === 0 && (
              <tr>
                <td colSpan={tableFields.length + (readOnly ? 0 : 1)} className="px-6 py-12 text-center text-stone-500">
                  Słownik jest pusty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
