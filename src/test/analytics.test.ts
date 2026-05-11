import { describe, expect, it } from 'vitest';
import { commanderPairWinRates, commanderWinRates, rollingWinRate } from '../lib/analytics';
const games = [
  { id: '1', userId: 'u', playedAt: '2026-01-01', playersCount: 2, winCondition: 'Combat', participants: [{ seat:1, playerName:'A', primary:{scryfallId:'x',name:'Atraxa'}, isWinner:true }, { seat:2, playerName:'B', primary:{scryfallId:'y',name:'Kraum'} }] },
  { id: '2', userId: 'u', playedAt: '2026-01-02', playersCount: 2, winCondition: 'Combo', participants: [{ seat:1, playerName:'A', primary:{scryfallId:'y',name:'Kraum'}, secondary:{scryfallId:'z',name:'Tymna'}, isWinner:true }, { seat:2, playerName:'B', primary:{scryfallId:'x',name:'Atraxa'} }] }
] as any;
describe('analytics deterministic fixtures', () => {
  it('computes commander win rates', () => { const rows = commanderWinRates(games); expect(rows.find((r) => r.name==='Atraxa')?.wins).toBe(1); });
  it('computes pair win rates', () => { const rows = commanderPairWinRates(games); expect(rows.find((r) => r.pair.includes('Kraum'))?.wins).toBe(1); });
  it('rolling window deterministic', () => { const rows = rollingWinRate(games, 2); expect(rows.at(-1)?.value).toBe(1); });
});
