/**
 * Testy operacji edycji słowników. Uruchomienie:
 *   npx tsx --test src/utils/dictionaryEditing.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DICTIONARY_SEEDS } from '../data/dictionarySeeds';
import { DICTIONARY_IDS, type DictionaryId } from '../types/dictionaries';
import {
  DICTIONARY_FIELDS,
  DICTIONARY_TAB_ORDER,
  DICTIONARY_TITLES,
  emptyRow,
  keyFieldOf,
  type DictionaryRow,
} from './dictionaryFields';
import {
  DictionaryValidationError,
  appendRow,
  describeDictionaryError,
  mergeMissingSeeds,
  nextSortOrder,
  normalizeRow,
  replaceRow,
  rowKey,
  toggleActive,
} from './dictionaryEditing';
import { DICTIONARY_KEY_FIELD, validateDictionaryItems } from './dictionaryUtils';

/** Dane startowe jako zwykłe obiekty (kopie — testy nie mogą zmieniać oryginałów). */
function seedRows(id: DictionaryId): DictionaryRow[] {
  return (DICTIONARY_SEEDS[id] as readonly object[]).map((item) => ({ ...item }) as DictionaryRow);
}

describe('opis pól a dane startowe', () => {
  it('każdy słownik ma tytuł, zakładkę i dokładnie jedno pole-klucz zgodne z DICTIONARY_KEY_FIELD', () => {
    assert.deepEqual([...DICTIONARY_TAB_ORDER].sort(), [...DICTIONARY_IDS].sort());
    for (const id of DICTIONARY_IDS) {
      assert.ok(DICTIONARY_TITLES[id].length > 0, id);
      assert.equal(keyFieldOf(id), DICTIONARY_KEY_FIELD[id]);
      assert.ok(DICTIONARY_FIELDS[id].some((f) => f.name === keyFieldOf(id)), `${id}: brak pola-klucza w opisie`);
    }
  });

  it('pola każdej pozycji startowej to dokładnie pola z opisu (obowiązkowe są wszystkie poza opcjonalnymi)', () => {
    for (const id of DICTIONARY_IDS) {
      const allowed = new Set(DICTIONARY_FIELDS[id].map((f) => f.name));
      const required = DICTIONARY_FIELDS[id].filter((f) => !f.optional).map((f) => f.name);
      for (const row of seedRows(id)) {
        for (const name of Object.keys(row)) assert.ok(allowed.has(name), `${id}: nieznane pole ${name}`);
        for (const name of required) assert.ok(name in row, `${id}/${rowKey(id, row)}: brak pola ${name}`);
      }
    }
  });

  it('normalizeRow nie zmienia danych startowych (są już w postaci znormalizowanej)', () => {
    for (const id of DICTIONARY_IDS) {
      for (const row of seedRows(id)) {
        assert.deepEqual(normalizeRow(id, row), row, `${id}/${rowKey(id, row)}`);
      }
    }
  });

  it('emptyRow daje pozycję aktywną z pustymi tekstami i bez pól opcjonalnych', () => {
    const row = emptyRow('mpk');
    assert.equal(row.active, true);
    assert.equal(row.code, '');
    assert.equal(row.unit, 'WM');
    assert.ok(!('note' in row));
    assert.deepEqual(emptyRow('warehouses').groups, []);
    assert.equal(emptyRow('warehouses').inWms, false);
    assert.equal(emptyRow('customerOrderStatuses').stageConfirmed, false);
  });
});

describe('normalizeRow', () => {
  it('przycina spacje, podnosi kod magazynu do wielkich liter i usuwa puste uwagi', () => {
    const result = normalizeRow('warehouses', { code: ' wip ', name: '  Produkcja  ', groups: ['surowce', 5], inWms: 'tak', active: true });
    assert.deepEqual(result, { code: 'WIP', name: 'Produkcja', groups: ['surowce'], inWms: false, active: true });
  });

  it('zostawia pusty opis wydziału (pole wymagane), ale usuwa pustą uwagę', () => {
    const result = normalizeRow('departments', { id: 'x', name: 'X', description: ' ', note: ' ', sortOrder: '30', mpkCodes: [], active: true });
    assert.equal(result.description, '');
    assert.ok(!('note' in result));
    assert.equal(result.sortOrder, 30);
  });
});

describe('operacje na liście', () => {
  const base: DictionaryRow[] = [
    { code: 'AAA', name: 'a', active: true },
    { code: 'BBB', name: 'b', active: true },
  ];

  it('appendRow dodaje na końcu i nie zmienia wejścia', () => {
    const result = appendRow(base, { code: 'CCC', name: 'c', active: true });
    assert.equal(result.length, 3);
    assert.equal(base.length, 2);
    assert.equal(rowKey('pspStatuses', result[2]), 'CCC');
  });

  it('replaceRow podmienia tylko wskazaną pozycję i zachowuje kolejność', () => {
    const result = replaceRow('pspStatuses', base, 'BBB', { code: 'BBB', name: 'zmieniona', active: true });
    assert.deepEqual(result.map((r) => r.name), ['a', 'zmieniona']);
    assert.equal(base[1].name, 'b');
  });

  it('replaceRow i toggleActive zgłaszają błąd dla nieznanego klucza (nie dopisują po cichu)', () => {
    assert.throws(() => replaceRow('pspStatuses', base, 'ZZZ', { code: 'ZZZ' }), /nie istnieje/);
    assert.throws(() => toggleActive('pspStatuses', base, 'ZZZ'), /nie istnieje/);
  });

  it('toggleActive przełącza aktywność tylko jednej pozycji', () => {
    const result = toggleActive('pspStatuses', base, 'AAA');
    assert.deepEqual(result.map((r) => r.active), [false, true]);
    assert.deepEqual(toggleActive('pspStatuses', result, 'AAA').map((r) => r.active), [true, true]);
  });

  it('nextSortOrder: największa kolejność + 10, a dla pustej listy 10', () => {
    assert.equal(nextSortOrder([]), 10);
    assert.equal(nextSortOrder([{ sortOrder: 20 }, { sortOrder: 120 }, { sortOrder: 'x' }]), 130);
  });
});

describe('mergeMissingSeeds („Dopisz brakujące wartości startowe”)', () => {
  it('do pustego słownika wstawia wszystkie wartości startowe w tej samej kolejności', () => {
    for (const id of DICTIONARY_IDS) {
      const seeds = seedRows(id);
      const { items, addedKeys } = mergeMissingSeeds(id, [], seeds);
      assert.deepEqual(items, seeds, id);
      assert.equal(addedKeys.length, seeds.length, id);
      assert.deepEqual(validateDictionaryItems(id, items), validateDictionaryItems(id, seeds), id);
    }
  });

  it('nie nadpisuje i nie duplikuje pozycji, które admin już zmienił', () => {
    const seeds = seedRows('warehouses');
    const edited = { ...seeds[0], name: 'Moja własna nazwa', active: false };
    const { items, addedKeys } = mergeMissingSeeds('warehouses', [edited], seeds);
    assert.equal(items[0].name, 'Moja własna nazwa');
    assert.equal(items.filter((r) => rowKey('warehouses', r) === rowKey('warehouses', seeds[0])).length, 1);
    assert.equal(addedKeys.length, seeds.length - 1);
    assert.ok(!addedKeys.includes(rowKey('warehouses', seeds[0])));
  });

  it('jest idempotentne: drugie wywołanie nic już nie dopisuje', () => {
    const seeds = seedRows('mpk');
    const first = mergeMissingSeeds('mpk', [], seeds);
    const second = mergeMissingSeeds('mpk', first.items, seeds);
    assert.deepEqual(second.addedKeys, []);
    assert.deepEqual(second.items, first.items);
  });

  it('zachowuje własne pozycje admina spoza wartości startowych', () => {
    const own: DictionaryRow = { code: 'ZZ', name: 'Własny', groups: ['pozostale'], inWms: false, active: true };
    const { items } = mergeMissingSeeds('warehouses', [own], seedRows('warehouses'));
    assert.equal(items[0], own);
    assert.equal(items.length, 47);
  });
});

describe('describeDictionaryError', () => {
  it('lista błędów walidacji jest czytelną listą punktów', () => {
    const text = describeDictionaryError(new DictionaryValidationError(['Pozycja 1: brak nazwy.', 'Pozycja 2: powtórzony klucz „X”.']));
    assert.match(text, /^Nie zapisano — popraw:\n• Pozycja 1: brak nazwy\.\n• Pozycja 2/);
  });

  it('błędy Firestore dostają ludzkie komunikaty', () => {
    assert.match(describeDictionaryError({ code: 'permission-denied' }), /Brak uprawnień/);
    assert.match(describeDictionaryError({ code: 'unavailable' }), /Brak połączenia/);
    assert.match(describeDictionaryError({ code: 'aborted' }), /w tej samej chwili/);
  });

  it('zwykły Error pokazuje swoją treść, a nieznana wartość — komunikat ogólny', () => {
    assert.equal(describeDictionaryError(new Error('Pozycja „X” nie istnieje')), 'Pozycja „X” nie istnieje');
    assert.match(describeDictionaryError(42), /Nie udało się zapisać/);
  });
});
