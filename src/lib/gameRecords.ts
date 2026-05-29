import { supabase } from './supabase';
import type { CommanderCard } from '../types/app';

export type GameService = 'paper' | 'Convoke' | 'Spelltable';

export type HistoryGameParticipant = {
  id: string;
  turn_order_position: number;
  is_winner: boolean;
  killed_first: boolean;
  player: { id: string; display_name: string } | { id: string; display_name: string }[] | null;
  primary_commander: { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null;
  secondary_commander: { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null;
};

export type HistoryGame = {
  id: string;
  played_at: string;
  created_at: string;
  number_of_players: number;
  bracket: number;
  service: GameService;
  turn_length: number | null;
  win_condition: string;
  notes: string | null;
  finished: boolean;
  game_participants: HistoryGameParticipant[];
};

export type NumberedHistoryGame = HistoryGame & {
  gameNumber: number;
};

export type PlayerDirectoryEntry = {
  id: string;
  displayName: string;
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

export type PlayerPageSummary = {
  totalPlayers: number;
  totalWins: number;
  totalCommanders: number;
  mostGamesPlayer: { name: string; gamesPlayed: number } | null;
  highestWinRatePlayer: { name: string; gamesPlayed: number; wins: number; winRate: number } | null;
  mostPopularCommander: { name: string; appearances: number } | null;
  highestCommanderWinRate: { name: string; wins: number; appearances: number; winRate: number } | null;
};

type CommanderRow = {
  scryfall_id: string | null;
  name: string;
  image_url: string | null;
  color_identity: string[] | null;
  type_line: string | null;
  oracle_text: string | null;
};

export type AddGamePlayerSuggestion = {
  id: string;
  displayName: string;
  commanders: Array<
    CommanderCard & {
      appearances: number;
    }
  >;
};

export type CreateGameParticipantPayload = {
  seat: number;
  playerName: string;
  primaryCommander: CommanderCard;
  secondaryCommander: CommanderCard | null;
  isWinner: boolean;
  killedFirst: boolean;
};

type NumberedGameRow = Omit<HistoryGame, 'game_participants'> & {
  game_number: number;
};

type HistoryGameParticipantRow = HistoryGameParticipant & {
  game_id: string;
};

type PlayerDirectoryRow = {
  id: string;
  display_name: string;
  games_played: number;
  wins: number;
  win_rate: number;
  latest_played_at: string;
  latest_game_number: number;
  commanders: unknown;
};

type PlayerPageSummaryRow = {
  total_players: number;
  total_wins: number;
  total_commanders: number;
  most_games_player: unknown;
  highest_win_rate_player: unknown;
  most_popular_commander: unknown;
  highest_commander_win_rate: unknown;
};

export async function fetchWinConditionSuggestions() {
  const { data, error } = await supabase
    .from('games')
    .select('win_condition')
    .not('win_condition', 'is', null);

  if (error) {
    throw error;
  }

  return [...new Set((data ?? []).map((row) => row.win_condition?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right));
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readSummaryObject<T extends Record<string, unknown>>(value: unknown): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as T;
}

function parsePlayerCommanders(value: unknown): PlayerDirectoryEntry['commanders'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((commander) => {
      const row = readSummaryObject(commander);
      if (!row || typeof row.name !== 'string') {
        return null;
      }

      return {
        name: row.name,
        imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null,
        appearances: toNumber(row.appearances),
      };
    })
    .filter((commander): commander is PlayerDirectoryEntry['commanders'][number] => Boolean(commander));
}

function toPlayerDirectoryEntry(row: PlayerDirectoryRow): PlayerDirectoryEntry {
  return {
    id: row.id,
    displayName: row.display_name,
    gamesPlayed: row.games_played,
    wins: row.wins,
    winRate: row.win_rate,
    latestPlayedAt: row.latest_played_at,
    latestGameNumber: row.latest_game_number,
    commanders: parsePlayerCommanders(row.commanders),
  };
}

function toPlayerPageSummary(row: PlayerPageSummaryRow | null): PlayerPageSummary {
  const mostGamesPlayer = readSummaryObject<{ name?: unknown; gamesPlayed?: unknown }>(row?.most_games_player);
  const highestWinRatePlayer = readSummaryObject<{ name?: unknown; gamesPlayed?: unknown; wins?: unknown; winRate?: unknown }>(row?.highest_win_rate_player);
  const mostPopularCommander = readSummaryObject<{ name?: unknown; appearances?: unknown }>(row?.most_popular_commander);
  const highestCommanderWinRate = readSummaryObject<{ name?: unknown; wins?: unknown; appearances?: unknown; winRate?: unknown }>(row?.highest_commander_win_rate);

  return {
    totalPlayers: row?.total_players ?? 0,
    totalWins: row?.total_wins ?? 0,
    totalCommanders: row?.total_commanders ?? 0,
    mostGamesPlayer: typeof mostGamesPlayer?.name === 'string'
      ? { name: mostGamesPlayer.name, gamesPlayed: toNumber(mostGamesPlayer.gamesPlayed) }
      : null,
    highestWinRatePlayer: typeof highestWinRatePlayer?.name === 'string'
      ? {
          name: highestWinRatePlayer.name,
          gamesPlayed: toNumber(highestWinRatePlayer.gamesPlayed),
          wins: toNumber(highestWinRatePlayer.wins),
          winRate: toNumber(highestWinRatePlayer.winRate),
        }
      : null,
    mostPopularCommander: typeof mostPopularCommander?.name === 'string'
      ? { name: mostPopularCommander.name, appearances: toNumber(mostPopularCommander.appearances) }
      : null,
    highestCommanderWinRate: typeof highestCommanderWinRate?.name === 'string'
      ? {
          name: highestCommanderWinRate.name,
          wins: toNumber(highestCommanderWinRate.wins),
          appearances: toNumber(highestCommanderWinRate.appearances),
          winRate: toNumber(highestCommanderWinRate.winRate),
        }
      : null,
  };
}

async function fetchParticipantsForGames(gameIds: string[] | null) {
  let participantsQuery = supabase
    .from('game_participants')
    .select(`
      game_id,
      id,
      turn_order_position,
      is_winner,
      killed_first,
      player:players (
        id,
        display_name
      ),
      primary_commander:commanders!game_participants_primary_commander_id_fkey (
        name,
        image_url
      ),
      secondary_commander:commanders!game_participants_secondary_commander_id_fkey (
        name,
        image_url
      )
    `)
    .order('turn_order_position', { ascending: true });

  if (gameIds) {
    if (gameIds.length === 0) {
      return new Map<string, HistoryGameParticipant[]>();
    }

    participantsQuery = participantsQuery.in('game_id', gameIds);
  }

  const { data, error } = await participantsQuery;

  if (error) {
    throw error;
  }

  const participantsByGame = new Map<string, HistoryGameParticipant[]>();

  for (const participant of (data as HistoryGameParticipantRow[] | null) ?? []) {
    const participants = participantsByGame.get(participant.game_id) ?? [];
    participants.push({
      id: participant.id,
      turn_order_position: participant.turn_order_position,
      is_winner: participant.is_winner,
      killed_first: participant.killed_first,
      player: participant.player,
      primary_commander: participant.primary_commander,
      secondary_commander: participant.secondary_commander,
    });
    participantsByGame.set(participant.game_id, participants);
  }

  return participantsByGame;
}

export async function fetchNumberedGames(options: { limit?: number; podId?: string } = {}) {
  const query = `
      id,
      played_at,
      created_at,
      number_of_players,
      bracket,
      service,
      turn_length,
      win_condition,
      notes,
      finished,
      game_number
    `;

  let gamesQuery = supabase
    .from('numbered_games')
    .select(query)
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (options.podId) {
    gamesQuery = gamesQuery.eq('pod_id', options.podId);
  }

  if (options.limit) {
    gamesQuery = gamesQuery.limit(options.limit);
  }

  const { data, error } = await gamesQuery;

  if (error) {
    throw error;
  }

  const gameRows = (data as NumberedGameRow[] | null) ?? [];
  if (gameRows.length === 0) {
    return [];
  }

  const participantGameIds = options.limit ? gameRows.map((game) => game.id) : null;
  const participantsByGame = await fetchParticipantsForGames(participantGameIds);

  return gameRows.map((game) => ({
    id: game.id,
    played_at: game.played_at,
    created_at: game.created_at,
    number_of_players: game.number_of_players,
    bracket: game.bracket,
    service: game.service,
    turn_length: game.turn_length,
    win_condition: game.win_condition,
    notes: game.notes,
    finished: game.finished,
    gameNumber: game.game_number,
    game_participants: participantsByGame.get(game.id) ?? [],
  }));
}

export async function fetchDashboardSnapshot(podId: string) {
  const [gamesResult, participantsResult, recentGames] = await Promise.all([
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('pod_id', podId),
    supabase
      .from('game_participants')
      .select('player_id, primary_commander_id')
      .eq('pod_id', podId),
    fetchNumberedGames({ limit: 3, podId }),
  ]);

  if (gamesResult.error) throw gamesResult.error;
  if (participantsResult.error) throw participantsResult.error;

  const participants = participantsResult.data ?? [];
  const totalPlayers = new Set(participants.map((p) => p.player_id)).size;
  const totalCommanders = new Set(participants.map((p) => p.primary_commander_id)).size;

  return {
    totalGames: gamesResult.count ?? 0,
    totalCommanders,
    totalPlayers,
    latestGame: recentGames[0] ?? null,
    recentGames,
  };
}

export async function fetchPlayerDirectory(podId: string) {
  const { data: participants, error: pErr } = await supabase
    .from('game_participants')
    .select('player_id')
    .eq('pod_id', podId);

  if (pErr) throw pErr;

  const playerIds = [...new Set((participants ?? []).map((p) => p.player_id))];
  if (playerIds.length === 0) return [];

  const { data, error } = await supabase
    .from('player_directory_entries')
    .select('id, display_name, games_played, wins, win_rate, latest_played_at, latest_game_number, commanders')
    .in('id', playerIds)
    .order('wins', { ascending: false })
    .order('games_played', { ascending: false })
    .order('display_name', { ascending: true });

  if (error) throw error;

  return ((data as PlayerDirectoryRow[] | null) ?? []).map(toPlayerDirectoryEntry);
}

export async function fetchPlayerPageSummary() {
  const { data, error } = await supabase
    .from('player_page_summary')
    .select(`
      total_players,
      total_wins,
      total_commanders,
      most_games_player,
      highest_win_rate_player,
      most_popular_commander,
      highest_commander_win_rate
    `)
    .single();

  if (error) {
    throw error;
  }

  return toPlayerPageSummary(data as PlayerPageSummaryRow | null);
}

function toCommanderCardSuggestion(commander: CommanderRow): CommanderCard {
  return {
    scryfallId: commander.scryfall_id ?? commander.name,
    name: commander.name,
    imageUrl: commander.image_url ?? undefined,
    colorIdentity: commander.color_identity ?? [],
    typeLine: commander.type_line ?? undefined,
    oracleText: commander.oracle_text ?? undefined,
  };
}

export async function fetchAddGamePlayerSuggestions(podId: string): Promise<AddGamePlayerSuggestion[]> {
  const { data: members, error: membersError } = await supabase
    .from('pod_members')
    .select('user_id')
    .eq('pod_id', podId);

  if (membersError) throw membersError;

  const memberUserIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);
  if (memberUserIds.length === 0) return [];

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, display_name')
    .in('linked_user_id', memberUserIds);

  if (playersError) throw playersError;

  const podPlayers = (players ?? []) as Array<{ id: string; display_name: string }>;
  if (podPlayers.length === 0) return [];

  const playerMap = new Map<string, AddGamePlayerSuggestion>(
    podPlayers.map((p) => [p.id, { id: p.id, displayName: p.display_name, commanders: [] }]),
  );

  const playerIds = podPlayers.map((p) => p.id);

  const { data: participantData, error: partError } = await supabase
    .from('game_participants')
    .select(`
      player_id,
      primary_commander:commanders!game_participants_primary_commander_id_fkey (
        scryfall_id,
        name,
        image_url,
        color_identity,
        type_line,
        oracle_text
      ),
      secondary_commander:commanders!game_participants_secondary_commander_id_fkey (
        scryfall_id,
        name,
        image_url,
        color_identity,
        type_line,
        oracle_text
      )
    `)
    .eq('pod_id', podId)
    .in('player_id', playerIds);

  if (partError) throw partError;

  for (const participant of participantData ?? []) {
    const playerId = (participant as { player_id: string }).player_id;
    const entry = playerMap.get(playerId);
    if (!entry) continue;

    const primaryCommander = Array.isArray(participant.primary_commander) ? participant.primary_commander[0] : participant.primary_commander;
    const secondaryCommander = Array.isArray(participant.secondary_commander) ? participant.secondary_commander[0] : participant.secondary_commander;

    const commanderMap = new Map(entry.commanders.map((c) => [c.scryfallId || c.name, c]));

    for (const commander of [primaryCommander, secondaryCommander] as Array<CommanderRow | null | undefined>) {
      if (!commander) continue;

      const key = commander.scryfall_id ?? commander.name;
      const existing = commanderMap.get(key);
      if (existing) {
        existing.appearances += 1;
        if (!existing.imageUrl && commander.image_url) {
          existing.imageUrl = commander.image_url;
        }
      } else {
        const next = { ...toCommanderCardSuggestion(commander), appearances: 1 };
        entry.commanders.push(next);
        commanderMap.set(key, next);
      }
    }
  }

  return [...playerMap.values()]
    .map((player) => ({
      ...player,
      commanders: [...player.commanders].sort((left, right) => {
        if (right.appearances !== left.appearances) return right.appearances - left.appearances;
        return left.name.localeCompare(right.name);
      }),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function setGameWinner(gameId: string, winnerParticipantId: string | null) {
  const { error } = await supabase.rpc('set_game_winner', {
    p_game_id: gameId,
    p_winner_participant_id: winnerParticipantId,
  });

  if (error) {
    throw error;
  }
}

export async function createGameWithParticipants(input: {
  podId: string;
  playedAt: string;
  playersCount: number;
  bracket: number;
  service: GameService;
  turnLength: number | null;
  winCondition: string;
  notes: string;
  participants: CreateGameParticipantPayload[];
}) {
  const { data, error } = await supabase.rpc('create_game_with_participants', {
    p_pod_id: input.podId,
    p_played_at: input.playedAt,
    p_number_of_players: input.playersCount,
    p_bracket: input.bracket,
    p_service: input.service,
    p_turn_length: input.turnLength,
    p_win_condition: input.winCondition,
    p_notes: input.notes,
    p_participants: input.participants.map((participant) => ({
      seat: participant.seat,
      player_name: participant.playerName.trim(),
      is_winner: participant.isWinner,
      killed_first: participant.killedFirst,
      primary_commander: {
        scryfall_id: participant.primaryCommander.scryfallId,
        name: participant.primaryCommander.name,
        image_url: participant.primaryCommander.imageUrl ?? null,
        color_identity: participant.primaryCommander.colorIdentity ?? [],
        type_line: participant.primaryCommander.typeLine ?? null,
        oracle_text: participant.primaryCommander.oracleText ?? null,
      },
      secondary_commander: participant.secondaryCommander
        ? {
            scryfall_id: participant.secondaryCommander.scryfallId,
            name: participant.secondaryCommander.name,
            image_url: participant.secondaryCommander.imageUrl ?? null,
            color_identity: participant.secondaryCommander.colorIdentity ?? [],
            type_line: participant.secondaryCommander.typeLine ?? null,
            oracle_text: participant.secondaryCommander.oracleText ?? null,
          }
        : null,
    })),
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchProfilePlayerId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('player_id')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return (data as { player_id: string | null } | null)?.player_id ?? null;
}

export async function updateProfilePlayerId(playerId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('profiles')
    .update({ player_id: playerId })
    .eq('id', user.id);

  if (error) throw error;
}

export async function createOrLinkPlayer(displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc('update_player_display_name', {
    p_new_display_name: displayName,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchPlayerById(playerId: string): Promise<PlayerDirectoryEntry> {
  const { data, error } = await supabase
    .from('player_directory_entries')
    .select('id, display_name, games_played, wins, win_rate, latest_played_at, latest_game_number, commanders')
    .eq('id', playerId)
    .maybeSingle();

  if (error) throw error;

  if (data) return toPlayerDirectoryEntry(data as PlayerDirectoryRow);

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, display_name')
    .eq('id', playerId)
    .single();

  if (playerError) throw playerError;

  const p = player as { id: string; display_name: string };
  return { id: p.id, displayName: p.display_name, gamesPlayed: 0, wins: 0, winRate: 0, latestPlayedAt: '', latestGameNumber: 0, commanders: [] };
}

export async function fetchPlayerRecentGames(playerId: string, limit: number): Promise<NumberedHistoryGame[]> {
  const { data: participantData, error: participantError } = await supabase
    .from('game_participants')
    .select('game_id')
    .eq('player_id', playerId);

  if (participantError) throw participantError;

  const gameIds = (participantData ?? []).map((p) => (p as { game_id: string }).game_id);

  if (gameIds.length === 0) return [];

  const { data, error } = await supabase
    .from('numbered_games')
    .select('id, played_at, created_at, number_of_players, bracket, service, turn_length, win_condition, notes, finished, game_number')
    .in('id', gameIds)
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const gameRows = (data as NumberedGameRow[] | null) ?? [];
  if (gameRows.length === 0) return [];

  const participantsByGame = await fetchParticipantsForGames(gameRows.map((g) => g.id));

  return gameRows.map((game) => ({
    id: game.id,
    played_at: game.played_at,
    created_at: game.created_at,
    number_of_players: game.number_of_players,
    bracket: game.bracket,
    service: game.service,
    turn_length: game.turn_length,
    win_condition: game.win_condition,
    notes: game.notes,
    finished: game.finished,
    gameNumber: game.game_number,
    game_participants: participantsByGame.get(game.id) ?? [],
  }));
}

export async function relinkParticipantPlayer(
  participantId: string,
  gameId: string,
  newDisplayName: string,
): Promise<void> {
  const { error } = await supabase.rpc('relink_participant_player', {
    p_participant_id: participantId,
    p_game_id: gameId,
    p_new_display_name: newDisplayName,
  });
  if (error) throw error;
}

export function readSingleName(value: { name?: string; display_name?: string } | { name?: string; display_name?: string }[] | null) {
  const obj = Array.isArray(value) ? value[0] : value;
  return obj?.display_name ?? obj?.name ?? 'Unknown';
}

export function readSingleCommander(
  value: { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null,
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
