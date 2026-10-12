/**
 * Testy słowników. Uruchomienie (wbudowany runner Node, bez dodatkowych pakietów):
 *   npx tsx --test src/utils/dictionaryUtils.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CUSTOMER_ORDER_STATUS_SEEDS,
  DEPARTMENT_SEEDS,
  DICTIONARY_SEEDS,
  MPK_SEEDS,
  PSP_STATUS_SEEDS,
  WAREHOUSE_SEEDS,
} from '../data/dictionarySeeds';
import { DICTIONARY_IDS, type Department, type Warehouse } from '../types/dictionaries';
import {
  MAX_DICTIONARY_ITEMS,
  findUnknownCodes,
  normalizeWarehouseCode,
  parseConstructionSiteWarehouse,
  resolveOrderStage,
  validateDictionaryItems,
} from './dictionaryUtils';

const mpkCodes = new Set(MPK_SEEDS.map((m) => m.code));

describe('dane startowe', () => {
  it('przechodzą własną walidację (wszystkie 5 słowników)', () => {
    for (const id of DICTIONARY_IDS) {
      assert.deepEqual(validateDictionaryItems(id, DICTIONARY_SEEDS[id], { mpkCodes }), [], `słownik ${id}`);
    }
  });

  it('mają oczekiwane liczności z plików właściciela', () => {
    assert.equal(WAREHOUSE_SEEDS.length, 46);
    assert.equal(MPK_SEEDS.length, 40);
    assert.equal(DEPARTMENT_SEEDS.length, 12);
    assert.equal(CUSTOMER_ORDER_STATUS_SEEDS.length, 14);
    assert.equal(PSP_STATUS_SEEDS.length, 5);
  });

  it('MPK: 101 jest nieaktywne, a piony mają 22/5/5/6/2 pozycji', () => {
    assert.equal(MPK_SEEDS.find((m) => m.code === '101')?.active, false);
    assert.equal(MPK_SEEDS.filter((m) => !m.active).length, 1);
    const perUnit = (unit: string) => MPK_SEEDS.filter((m) => m.unit === unit).length;
    assert.deepEqual(
      ['WM', 'WEP', 'WLOG', 'WTI', 'Prac.zewn.'].map(perUnit),
      [22, 5, 5, 6, 2],
    );
  });

  it('magazyny: tylko MRB i MSN są w WMS; WIP należy do dwóch grup', () => {
    const inWms = WAREHOUSE_SEEDS.filter((w) => w.inWms).map((w) => w.code).sort();
    assert.deepEqual(inWms, ['MRB', 'MSN']);
    const wip = WAREHOUSE_SEEDS.find((w) => w.code === 'WIP');
    assert.deepEqual(wip?.groups, ['produkcja-w-toku', 'surowce']);
  });

  it('statusy klienta: potwierdzone tylko PM i PC (oba „przekazane do montażu”)', () => {
    const confirmed = CUSTOMER_ORDER_STATUS_SEEDS.filter((s) => s.stageConfirmed).map((s) => s.code).sort();
    assert.deepEqual(confirmed, ['PC', 'PM']);
    for (const code of confirmed) {
      assert.equal(CUSTOMER_ORDER_STATUS_SEEDS.find((s) => s.code === code)?.stage, 'przekazane-do-montazu');
    }
  });

  it('wydziały nie mają jeszcze powiązanych MPK (to etap późniejszy)', () => {
    assert.ok(DEPARTMENT_SEEDS.every((d) => d.mpkCodes.length === 0));
  });
});

describe('magazyny', () => {
  it('normalizeWarehouseCode usuwa spacje wyrównujące i ujednolica wielkość liter', () => {
    assert.equal(normalizeWarehouseCode('MRB       '), 'MRB');
    assert.equal(normalizeWarehouseCode(' wip '), 'WIP');
    assert.equal(normalizeWarehouseCode(undefined), '');
    assert.equal(normalizeWarehouseCode(42), '');
  });

  it('parseConstructionSiteWarehouse rozpoznaje MRD + 4 cyfry', () => {
    assert.deepEqual(parseConstructionSiteWarehouse('MRD1234'), { contractSuffix: '1234' });
    assert.deepEqual(parseConstructionSiteWarehouse('mrd0042  '), { contractSuffix: '0042' });
    assert.equal(parseConstructionSiteWarehouse('MRD12345'), null);
    assert.equal(parseConstructionSiteWarehouse('MRD123'), null);
    assert.equal(parseConstructionSiteWarehouse('MRB'), null);
    assert.equal(parseConstructionSiteWarehouse(null), null);
  });

  it('findUnknownCodes: pomija budowy MRD####, zgłasza nieznane (posortowane, bez duplikatów)', () => {
    const result = findUnknownCodes('warehouses', ['MRB   ', 'MRD0001', 'ZZZ', 'AAA', 'ZZZ', '', 'wip'], WAREHOUSE_SEEDS);
    assert.deepEqual(result, ['AAA', 'ZZZ']);
  });

  it('findUnknownCodes działa też dla statusów klienta', () => {
    assert.deepEqual(findUnknownCodes('customerOrderStatuses', ['PM', 'XX', 'PR', ''], CUSTOMER_ORDER_STATUS_SEEDS), ['XX']);
  });
});

describe('statusy zleceń klienta', () => {
  it('resolveOrderStage zwraca etap i informację o potwierdzeniu', () => {
    assert.deepEqual(resolveOrderStage('PM', CUSTOMER_ORDER_STATUS_SEEDS), { stage: 'przekazane-do-montazu', confirmed: true });
    assert.deepEqual(resolveOrderStage(' pm ', CUSTOMER_ORDER_STATUS_SEEDS), { stage: 'przekazane-do-montazu', confirmed: true });
    assert.deepEqual(resolveOrderStage('PR', CUSTOMER_ORDER_STATUS_SEEDS), { stage: 'przekazane-do-produkcji', confirmed: false });
  });

  it('resolveOrderStage zwraca null dla nieznanego lub pustego kodu (nie zgadujemy)', () => {
    assert.equal(resolveOrderStage('XX', CUSTOMER_ORDER_STATUS_SEEDS), null);
    assert.equal(resolveOrderStage('', CUSTOMER_ORDER_STATUS_SEEDS), null);
  });
});

describe('validateDictionaryItems — wykrywanie błędów', () => {
  const dept = (patch: Partial<Department> = {}): Department => ({
    id: 'test',
    name: 'Test',
    description: '',
    active: true,
    sortOrder: 1,
    mpkCodes: [],
    ...patch,
  });
  const wh = (patch: Partial<Warehouse> = {}): Warehouse => ({
    code: 'ABC',
    name: 'Test',
    groups: ['pozostale'],
    inWms: false,
    active: true,
    ...patch,
  });

  it('odrzuca coś, co nie jest listą', () => {
    assert.equal(validateDictionaryItems('departments', { a: 1 }).length, 1);
    assert.equal(validateDictionaryItems('departments', null).length, 1);
  });

  it('odrzuca więcej niż MAX_DICTIONARY_ITEMS pozycji', () => {
    const many = Array.from({ length: MAX_DICTIONARY_ITEMS + 1 }, (_, i) => dept({ id: `d${i}` }));
    assert.ok(validateDictionaryItems('departments', many).some((e) => e.includes('Za dużo pozycji')));
  });

  it('wykrywa powtórzony klucz, pustą nazwę i zły identyfikator', () => {
    const errors = validateDictionaryItems('departments', [dept(), dept(), dept({ id: 'Złe Id', name: ' ' })]);
    assert.ok(errors.some((e) => e.includes('powtórzony klucz')));
    assert.ok(errors.some((e) => e.includes('brak nazwy')));
    assert.ok(errors.some((e) => e.includes('identyfikator może zawierać')));
  });

  it('wydział wskazujący nieistniejące MPK jest odrzucany (gdy znamy słownik MPK)', () => {
    const items = [dept({ mpkCodes: ['102', '999'] })];
    assert.deepEqual(validateDictionaryItems('departments', items), []);
    const errors = validateDictionaryItems('departments', items, { mpkCodes });
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('999'));
  });

  it('magazyn: odrzuca MRD####, kod ze spacją, pustą listę grup i nieznaną grupę', () => {
    assert.ok(validateDictionaryItems('warehouses', [wh({ code: 'MRD1234' })]).some((e) => e.includes('powstają automatycznie')));
    assert.ok(validateDictionaryItems('warehouses', [wh({ code: 'AB C' })]).length > 0);
    assert.ok(validateDictionaryItems('warehouses', [wh({ groups: [] })]).length > 0);
    assert.ok(validateDictionaryItems('warehouses', [{ ...wh(), groups: ['nie-ma-takiej'] }]).length > 0);
    assert.deepEqual(validateDictionaryItems('warehouses', [wh()]), []);
  });

  it('MPK: pilnuje formatu kodu i zgodności nazwy z pionem', () => {
    const ok = { code: '102', name: 'WM-Lakiernia', unit: 'WM', active: true };
    assert.deepEqual(validateDictionaryItems('mpk', [ok]), []);
    assert.ok(validateDictionaryItems('mpk', [{ ...ok, code: '12' }]).some((e) => e.includes('3 cyfry')));
    assert.ok(validateDictionaryItems('mpk', [{ ...ok, unit: 'WEP' }]).some((e) => e.includes('zaczynać się od')));
    assert.ok(validateDictionaryItems('mpk', [{ ...ok, unit: 'XYZ' }]).some((e) => e.includes('nieznany pion')));
  });

  it('statusy klienta: pilnuje kodu i etapu', () => {
    const ok = { code: 'PM', name: 'Przekazane do montażu', stage: 'przekazane-do-montazu', stageConfirmed: true, active: true };
    assert.deepEqual(validateDictionaryItems('customerOrderStatuses', [ok]), []);
    assert.ok(validateDictionaryItems('customerOrderStatuses', [{ ...ok, code: 'P' }]).length > 0);
    assert.ok(validateDictionaryItems('customerOrderStatuses', [{ ...ok, stage: 'cos' }]).length > 0);
  });
});
