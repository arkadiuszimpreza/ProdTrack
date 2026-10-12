/**
 * Testy powiązania stanowisk z MPK. Uruchomienie:
 *   npx tsx --test src/utils/stationMpk.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MPK_SEEDS } from '../data/dictionarySeeds';
import { leadingMpkCode, proposeMpkForStations, type MpkRef } from './stationMpk';

const mpk: MpkRef[] = MPK_SEEDS.map((m) => ({ code: m.code, name: m.name, active: m.active }));

describe('leadingMpkCode', () => {
  it('bierze dokładnie 3 cyfry z początku nazwy', () => {
    assert.equal(leadingMpkCode('110 Laser kimla'), '110');
    assert.equal(leadingMpkCode('  102 Lakiernia'), '102');
    assert.equal(leadingMpkCode('101 WM Obróbka mechaniczna'), '101');
  });

  it('nie zgaduje, gdy nazwa nie zaczyna się od 3 cyfr', () => {
    assert.equal(leadingMpkCode('Spawalnia 1'), null);
    assert.equal(leadingMpkCode('12 Coś'), null);
    assert.equal(leadingMpkCode('1234 Coś'), null);
    assert.equal(leadingMpkCode(''), null);
  });
});

describe('proposeMpkForStations', () => {
  it('proponuje MPK po numerze w nazwie i zgłasza stanowiska bez dopasowania', () => {
    const result = proposeMpkForStations(
      [
        { id: 'a', name: '102 Lakiernia' },
        { id: 'b', name: '108 Plazmy' },
        { id: 'c', name: 'Spawalnia 1' },
        { id: 'd', name: '999 Nieistniejące' },
      ],
      mpk,
    );
    assert.deepEqual(result.proposals.map((p) => [p.stationId, p.mpkCode, p.mpkName]), [
      ['a', '102', 'WM-Lakiernia'],
      ['b', '108', 'WM-Plazma'],
    ]);
    assert.deepEqual(result.unmatched.map((s) => s.id), ['c', 'd']);
  });

  it('pomija stanowiska, które już mają MPK (niczego nie nadpisuje)', () => {
    const result = proposeMpkForStations([{ id: 'a', name: '102 Lakiernia', mpkCode: '104' }], mpk);
    assert.deepEqual(result.proposals, []);
    assert.deepEqual(result.unmatched, []);
  });

  it('oznacza propozycję wskazującą wyłączone MPK (101)', () => {
    const [proposal] = proposeMpkForStations([{ id: 'x', name: '101 WM Obróbka mechaniczna' }], mpk).proposals;
    assert.equal(proposal.mpkCode, '101');
    assert.equal(proposal.mpkActive, false);
  });

  it('kilka stanowisk może wskazywać to samo MPK', () => {
    const result = proposeMpkForStations(
      [
        { id: 'a', name: '107 Robot 1' },
        { id: 'b', name: '107 Robot 2' },
      ],
      mpk,
    );
    assert.deepEqual(result.proposals.map((p) => p.mpkCode), ['107', '107']);
  });
});
