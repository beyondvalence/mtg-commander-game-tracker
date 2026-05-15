import type { CommanderCard } from '../types/app';

const strict = '(type:legendary type:creature OR oracle:"can be your commander" OR keyword:partner OR oracle:"Friends forever" OR oracle:"Choose a Background" OR oracle:"Doctor\'s companion" OR oracle:"Create a Character") format:commander';
const broadened = 'format:commander';

function toCommanderCard(card: any): CommanderCard {
  const firstFace = card.card_faces?.[0];

  return {
    scryfallId: card.id,
    name: card.name,
    imageUrl: card.image_uris?.small ?? firstFace?.image_uris?.small,
    colorIdentity: card.color_identity,
    typeLine: card.type_line ?? firstFace?.type_line,
    oracleText: card.oracle_text ?? card.card_faces?.map((face: any) => face.oracle_text).filter(Boolean).join('\n\n'),
  };
}

export async function searchCommanders(q: string) {
  const tryQuery = async (filter: string) => fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${q} ${filter}`)}`).then(r => r.ok ? r.json() : ({ data: [] }));
  let result = await tryQuery(strict);
  let isBroadened = false;
  if (!result.data?.length) { result = await tryQuery(broadened); isBroadened = true; }
  const cards: CommanderCard[] = (result.data ?? []).map(toCommanderCard);
  cards.sort((a, b) => Number(b.name.toLowerCase().startsWith(q.toLowerCase())) - Number(a.name.toLowerCase().startsWith(q.toLowerCase())) || a.name.localeCompare(b.name));
  return { cards, isBroadened };
}

export async function searchBackgrounds(q: string) {
  const r = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${q} type:background format:commander`)}`);
  const j = await r.json();
  return (j.data ?? []).map(toCommanderCard);
}
