import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sampleGames = [
  {
    title: 'Sample Pod: Grave Pact',
    played_at: '2026-05-09',
    bracket: 2,
    win_condition: 'Combo',
    winnerSeat: 2,
    participants: [
      { seat: 1, playerName: 'Maya', commanderName: "Atraxa, Praetors' Voice" },
      { seat: 2, playerName: 'Jordan', commanderName: 'Muldrotha, the Gravetide' },
      { seat: 3, playerName: 'Eli', commanderName: 'Krenko, Mob Boss' },
      { seat: 4, playerName: 'Serena', commanderName: 'Giada, Font of Hope' },
    ],
  },
  {
    title: 'Sample Pod: Blood and Brass',
    played_at: '2026-05-11',
    bracket: 3,
    win_condition: 'Combat',
    winnerSeat: 2,
    participants: [
      { seat: 1, playerName: 'Nico', commanderName: 'Edgar Markov' },
      { seat: 2, playerName: 'Priya', commanderName: 'Isshin, Two Heavens as One' },
      { seat: 3, playerName: 'Theo', commanderName: 'Nekusar, the Mindrazer' },
      { seat: 4, playerName: 'Lena', commanderName: 'Kaalia of the Vast' },
    ],
  },
  {
    title: 'Sample Pod: Wild Growth',
    played_at: '2026-05-13',
    bracket: 4,
    win_condition: 'Commander Damage',
    winnerSeat: 1,
    participants: [
      { seat: 1, playerName: 'Owen', commanderName: 'Aesi, Tyrant of Gyre Strait' },
      { seat: 2, playerName: 'Harper', commanderName: 'Lathril, Blade of the Elves' },
      { seat: 3, playerName: 'Quinn', commanderName: "Yuriko, the Tiger's Shadow" },
      { seat: 4, playerName: 'Sofia', commanderName: 'Brago, King Eternal' },
    ],
  },
];

async function fetchCommander(name) {
  const response = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);

  if (!response.ok) {
    throw new Error(`Scryfall lookup failed for ${name}`);
  }

  const card = await response.json();
  const firstFace = card.card_faces?.[0];

  return {
    scryfall_id: card.id,
    name: card.name,
    image_url: card.image_uris?.small ?? firstFace?.image_uris?.small ?? null,
    color_identity: card.color_identity ?? [],
    type_line: card.type_line ?? firstFace?.type_line ?? null,
    oracle_text: card.oracle_text ?? card.card_faces?.map((face) => face.oracle_text).filter(Boolean).join('\n\n') ?? null,
  };
}

async function main() {
  const existingTitles = new Set();
  const { data: existingGames, error: existingError } = await supabase
    .from('games')
    .select('title')
    .in('title', sampleGames.map((game) => game.title));

  if (existingError) {
    throw existingError;
  }

  for (const row of existingGames ?? []) {
    if (row.title) {
      existingTitles.add(row.title);
    }
  }

  let insertedGames = 0;

  for (const game of sampleGames) {
    if (existingTitles.has(game.title)) {
      continue;
    }

    const participantRows = [];

    for (const participant of game.participants) {
      const commander = await fetchCommander(participant.commanderName);
      const { data: commanderRow, error: commanderError } = await supabase
        .from('commanders')
        .upsert(commander, { onConflict: 'scryfall_id' })
        .select('id')
        .single();

      if (commanderError) {
        throw commanderError;
      }

      const { data: playerRow, error: playerError } = await supabase
        .from('players')
        .upsert({ name: participant.playerName }, { onConflict: 'name' })
        .select('id')
        .single();

      if (playerError) {
        throw playerError;
      }

      participantRows.push({
        seat: participant.seat,
        player_id: playerRow.id,
        primary_commander_id: commanderRow.id,
        is_winner: participant.seat === game.winnerSeat,
      });
    }

    const { data: gameRow, error: gameError } = await supabase
      .from('games')
      .insert({
        title: game.title,
        played_at: game.played_at,
        number_of_players: 4,
        bracket: game.bracket,
        win_condition: game.win_condition,
      })
      .select('id')
      .single();

    if (gameError) {
      throw gameError;
    }

    const insertedParticipants = [];

    for (const participantRow of participantRows) {
      const { data: insertedParticipant, error: participantError } = await supabase
        .from('game_participants')
        .insert({
          game_id: gameRow.id,
          player_id: participantRow.player_id,
          primary_commander_id: participantRow.primary_commander_id,
          turn_order_position: participantRow.seat,
          is_winner: participantRow.is_winner,
        })
        .select('id, player_id, is_winner')
        .single();

      if (participantError) {
        throw participantError;
      }

      insertedParticipants.push(insertedParticipant);
    }

    const winner = insertedParticipants.find((participant) => participant.is_winner);
    if (!winner) {
      throw new Error(`Winner missing for ${game.title}`);
    }

    const { error: updateGameError } = await supabase
      .from('games')
      .update({
        winner_player_id: winner.player_id,
        winner_participant_id: winner.id,
      })
      .eq('id', gameRow.id);

    if (updateGameError) {
      throw updateGameError;
    }

    insertedGames += 1;
  }

  const { count: totalGames, error: countError } = await supabase.from('games').select('*', { count: 'exact', head: true });

  if (countError) {
    throw countError;
  }

  console.log(JSON.stringify({ insertedGames, totalGames }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
