import { supabase } from './supabase';

export type HistoryGameParticipant = {
  id: string;
  turn_order_position: number;
  is_winner: boolean;
  player: { name: string } | { name: string }[] | null;
  primary_commander: { name: string } | { name: string }[] | null;
};

export type HistoryGame = {
  id: string;
  played_at: string;
  created_at: string;
  number_of_players: number;
  win_condition: string;
  notes: string | null;
  game_participants: HistoryGameParticipant[];
};

export type NumberedHistoryGame = HistoryGame & {
  gameNumber: number;
};

function toNumberedGames(games: HistoryGame[]) {
  const chronological = [...games].sort((left, right) => {
    const playedAtOrder = left.played_at.localeCompare(right.played_at);
    if (playedAtOrder !== 0) {
      return playedAtOrder;
    }

    const createdAtOrder = left.created_at.localeCompare(right.created_at);
    if (createdAtOrder !== 0) {
      return createdAtOrder;
    }

    return left.id.localeCompare(right.id);
  });

  const gameNumbers = new Map(chronological.map((game, index) => [game.id, index + 1]));

  return [...games]
    .sort((left, right) => {
      const playedAtOrder = right.played_at.localeCompare(left.played_at);
      if (playedAtOrder !== 0) {
        return playedAtOrder;
      }

      const createdAtOrder = right.created_at.localeCompare(left.created_at);
      if (createdAtOrder !== 0) {
        return createdAtOrder;
      }

      return right.id.localeCompare(left.id);
    })
    .map((game) => ({
      ...game,
      gameNumber: gameNumbers.get(game.id) ?? 0,
    }));
}

export async function fetchNumberedGames() {
  const { data, error } = await supabase
    .from('games')
    .select(`
      id,
      played_at,
      created_at,
      number_of_players,
      win_condition,
      notes,
      game_participants (
        id,
        turn_order_position,
        is_winner,
        player:players (
          name
        ),
        primary_commander:commanders!game_participants_primary_commander_id_fkey (
          name
        )
      )
    `)
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return toNumberedGames((data as HistoryGame[]) || []);
}

export async function fetchDashboardSnapshot() {
  const [gamesResult, commandersResult] = await Promise.all([
    fetchNumberedGames(),
    supabase.from('commanders').select('*', { count: 'exact', head: true }),
  ]);

  if (commandersResult.error) {
    throw commandersResult.error;
  }

  return {
    totalGames: gamesResult.length,
    totalCommanders: commandersResult.count ?? 0,
    latestGame: gamesResult[0] ?? null,
    recentGames: gamesResult.slice(0, 3),
  };
}

export function readSingleName(value: { name: string } | { name: string }[] | null) {
  if (Array.isArray(value)) {
    return value[0]?.name ?? 'Unknown';
  }

  return value?.name ?? 'Unknown';
}
