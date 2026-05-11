import type { GameRecord } from '../types/app';
export type Filters = { commander?: string[]; winCondition?: string[] };
const keyPair = (a?: string, b?: string) => [a, b].filter(Boolean).sort().join(' + ');
export function applyFilters(games: GameRecord[], filters: Filters) {
  return games.filter((g) => {
    if (filters.winCondition?.length && !filters.winCondition.includes(g.winCondition)) return false;
    if (filters.commander?.length) {
      const names = g.participants.flatMap((p) => [p.primary?.name, p.secondary?.name].filter(Boolean) as string[]);
      if (!filters.commander.some((c) => names.includes(c))) return false;
    }
    return true;
  });
}
export function commanderWinRates(games: GameRecord[]) {
  const m = new Map<string, { wins: number; games: number }>();
  for (const g of games) for (const p of g.participants) if (p.primary?.name) { const rec = m.get(p.primary.name) ?? { wins: 0, games: 0 }; rec.games++; if (p.isWinner) rec.wins++; m.set(p.primary.name, rec); }
  return [...m.entries()].map(([name, r]) => ({ name, ...r, winRate: r.games ? r.wins / r.games : 0 }));
}
export function commanderPairWinRates(games: GameRecord[]) {
  const m = new Map<string, { wins: number; games: number }>();
  for (const g of games) for (const p of g.participants) { const k = keyPair(p.primary?.name, p.secondary?.name) || 'Unknown'; const rec = m.get(k) ?? { wins: 0, games: 0 }; rec.games++; if (p.isWinner) rec.wins++; m.set(k, rec); }
  return [...m.entries()].map(([pair, r]) => ({ pair, ...r, winRate: r.wins / r.games }));
}
export function rollingWinRate(games: GameRecord[], window = 5) { const ordered = [...games].sort((a, b) => a.playedAt.localeCompare(b.playedAt)); return ordered.map((_, i) => { const slice = ordered.slice(Math.max(0, i - window + 1), i + 1); const wins = slice.filter((g) => g.participants.some((p) => p.isWinner)).length; return { index: i + 1, value: wins / slice.length }; }); }
