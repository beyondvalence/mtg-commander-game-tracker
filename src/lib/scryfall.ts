import type { CommanderCard } from '../types/app';
const strict = '(type:legendary type:creature OR oracle:"can be your commander" OR keyword:partner OR oracle:"Friends forever" OR oracle:"Choose a Background" OR oracle:"Doctor\'s companion" OR oracle:"Create a Character") format:commander';
const broadened = 'format:commander';
export async function searchCommanders(q: string) {
  const tryQuery = async (filter: string) => fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${q} ${filter}`)}`).then(r => r.ok ? r.json() : ({ data: [] }));
  let result = await tryQuery(strict);
  let isBroadened = false;
  if (!result.data?.length) { result = await tryQuery(broadened); isBroadened = true; }
  const cards: CommanderCard[] = (result.data ?? []).map((c: any) => ({ scryfallId: c.id, name: c.name, imageUrl: c.image_uris?.small, colorIdentity: c.color_identity, typeLine: c.type_line, oracleText: c.oracle_text }));
  cards.sort((a, b) => Number(b.name.toLowerCase().startsWith(q.toLowerCase())) - Number(a.name.toLowerCase().startsWith(q.toLowerCase())) || a.name.localeCompare(b.name));
  return { cards, isBroadened };
}
export async function searchBackgrounds(q: string) { const r = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${q} type:background format:commander`)}`); const j = await r.json(); return (j.data ?? []).map((c: any) => ({ scryfallId: c.id, name: c.name })); }
