import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchCommanderByName(name) {
  const response = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);

  if (!response.ok) {
    throw new Error(`Scryfall lookup failed for ${name}`);
  }

  const card = await response.json();
  const firstFace = card.card_faces?.[0];

  return {
    image_url: card.image_uris?.small ?? firstFace?.image_uris?.small ?? null,
    color_identity: card.color_identity ?? [],
    type_line: card.type_line ?? firstFace?.type_line ?? null,
    oracle_text: card.oracle_text ?? card.card_faces?.map((face) => face.oracle_text).filter(Boolean).join('\n\n') ?? null,
  };
}

async function main() {
  const { data: commanders, error } = await supabase
    .from('commanders')
    .select('id, name, scryfall_id, image_url')
    .or('image_url.is.null,scryfall_id.like.sample-%');

  if (error) {
    throw error;
  }

  let updated = 0;

  for (const commander of commanders ?? []) {
    const repair = await fetchCommanderByName(commander.name);
    const { error: updateError } = await supabase
      .from('commanders')
      .update(repair)
      .eq('id', commander.id);

    if (updateError) {
      throw updateError;
    }

    updated += 1;
  }

  console.log(JSON.stringify({ updated }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
