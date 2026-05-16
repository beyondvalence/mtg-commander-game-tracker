import { supabase } from './supabase';

export type HistoryGameParticipant = {
  id: string;
  turn_order_position: number;
  is_winner: boolean;
  player: { id: string; name: string } | { id: string; name: string }[] | null;
  primary_commander: { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null;
  secondary_commander: { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null;
};

export type HistoryGame = {
  id: string;
  title: string | null;
  played_at: string;
  created_at: string;
  number_of_players: number;
  bracket: number;
  win_condition: string;
  notes: string | null;
  game_participants: HistoryGameParticipant[];
};

export type NumberedHistoryGame = HistoryGame & {
  gameNumber: number;
};

function isMissingBracketColumnError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : null;
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';

  return (code === 'PGRST204' || code === '42703') && message.includes('bracket');
}

export type PlayerDirectoryEntry = {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  latestPlayedAt: string;
  latestGameNumber: number;
  commanders: Array<{
    name: string;
    imageUrl: string | null;
    appearances: number;
  }>;
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
  const query = `
      id,
      title,
      played_at,
      created_at,
      number_of_players,
      bracket,
      win_condition,
      notes,
      game_participants!game_participants_game_id_fkey (
        id,
        turn_order_position,
        is_winner,
        player:players (
          id,
          name
        ),
        primary_commander:commanders!game_participants_primary_commander_id_fkey (
          name,
          image_url
        ),
        secondary_commander:commanders!game_participants_secondary_commander_id_fkey (
          name,
          image_url
        )
      )
    `;

  const { data, error } = await supabase
    .from('games')
    .select(query)
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingBracketColumnError(error)) {
      const fallbackResult = await supabase
        .from('games')
        .select(`
          id,
          title,
          played_at,
          created_at,
          number_of_players,
          win_condition,
          notes,
          game_participants!game_participants_game_id_fkey (
            id,
            turn_order_position,
            is_winner,
            player:players (
              id,
              name
            ),
            primary_commander:commanders!game_participants_primary_commander_id_fkey (
              name,
              image_url
            ),
            secondary_commander:commanders!game_participants_secondary_commander_id_fkey (
              name,
              image_url
            )
          )
        `)
        .order('played_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (fallbackResult.error) {
        throw fallbackResult.error;
      }

      const fallbackGames = ((fallbackResult.data as Omit<HistoryGame, 'bracket'>[] | null) ?? []).map((game) => ({
        ...game,
        bracket: 3,
      }));

      return toNumberedGames(fallbackGames);
    }

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

export async function fetchPlayerDirectory() {
  const games = await fetchNumberedGames();
  const playerMap = new Map<string, PlayerDirectoryEntry>();

  for (const game of games) {
    for (const participant of game.game_participants) {
      const player = Array.isArray(participant.player) ? participant.player[0] : participant.player;
      const primaryCommander = readSingleCommander(participant.primary_commander);
      const secondaryCommander = readSingleCommander(participant.secondary_commander);

      if (!player) {
        continue;
      }

      const existingPlayer = playerMap.get(player.id) ?? {
        id: player.id,
        name: player.name,
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
        latestPlayedAt: game.played_at,
        latestGameNumber: game.gameNumber,
        commanders: [],
      };

      existingPlayer.gamesPlayed += 1;
      existingPlayer.wins += participant.is_winner ? 1 : 0;

      const commanderMap = new Map(existingPlayer.commanders.map((commander) => [commander.name, commander]));

      for (const commander of [primaryCommander, secondaryCommander]) {
        if (!commander) {
          continue;
        }

        const existingCommander = commanderMap.get(commander.name);
        if (existingCommander) {
          existingCommander.appearances += 1;
          if (!existingCommander.imageUrl && commander.image_url) {
            existingCommander.imageUrl = commander.image_url;
          }
        } else {
          existingPlayer.commanders.push({
            name: commander.name,
            imageUrl: commander.image_url,
            appearances: 1,
          });
        }
      }

      if (
        game.played_at > existingPlayer.latestPlayedAt ||
        (game.played_at === existingPlayer.latestPlayedAt && game.gameNumber > existingPlayer.latestGameNumber)
      ) {
        existingPlayer.latestPlayedAt = game.played_at;
        existingPlayer.latestGameNumber = game.gameNumber;
      }

      playerMap.set(player.id, existingPlayer);
    }
  }

  return [...playerMap.values()]
    .map((player) => ({
      ...player,
      winRate: player.gamesPlayed > 0 ? player.wins / player.gamesPlayed : 0,
      commanders: [...player.commanders].sort((left, right) => {
        if (right.appearances !== left.appearances) {
          return right.appearances - left.appearances;
        }

        return left.name.localeCompare(right.name);
      }),
    }))
    .sort((left, right) => {
      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }

      if (right.gamesPlayed !== left.gamesPlayed) {
        return right.gamesPlayed - left.gamesPlayed;
      }

      return left.name.localeCompare(right.name);
    });
}

export function readSingleName(value: { name: string } | { name: string }[] | null) {
  if (Array.isArray(value)) {
    return value[0]?.name ?? 'Unknown';
  }

  return value?.name ?? 'Unknown';
}

export function readSingleCommander(
  value: { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null,
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
