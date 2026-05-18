import { supabase } from './supabase';
import type { CommanderCard } from '../types/app';

export type GameService = 'paper' | 'Convoke' | 'Spelltable';

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
  played_at: string;
  created_at: string;
  number_of_players: number;
  bracket: number;
  service: GameService;
  turn_length: number | null;
  win_condition: string;
  notes: string | null;
  game_participants: HistoryGameParticipant[];
};

export type NumberedHistoryGame = HistoryGame & {
  gameNumber: number;
};

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
  name: string;
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
};

type NumberedGameRow = Omit<HistoryGame, 'game_participants'> & {
  game_number: number;
};

type HistoryGameParticipantRow = HistoryGameParticipant & {
  game_id: string;
};

type PlayerDirectoryRow = {
  id: string;
  name: string;
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
    name: row.name,
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
      player: participant.player,
      primary_commander: participant.primary_commander,
      secondary_commander: participant.secondary_commander,
    });
    participantsByGame.set(participant.game_id, participants);
  }

  return participantsByGame;
}

export async function fetchNumberedGames(options: { limit?: number } = {}) {
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
      game_number
    `;

  let gamesQuery = supabase
    .from('numbered_games')
    .select(query)
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

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
    gameNumber: game.game_number,
    game_participants: participantsByGame.get(game.id) ?? [],
  }));
}

export async function fetchDashboardSnapshot() {
  const [summaryResult, recentGames] = await Promise.all([
    supabase
      .from('dashboard_summary')
      .select('total_games, total_commanders, total_players')
      .single(),
    fetchNumberedGames({ limit: 3 }),
  ]);

  if (summaryResult.error) {
    throw summaryResult.error;
  }

  return {
    totalGames: summaryResult.data.total_games ?? 0,
    totalCommanders: summaryResult.data.total_commanders ?? 0,
    totalPlayers: summaryResult.data.total_players ?? 0,
    latestGame: recentGames[0] ?? null,
    recentGames,
  };
}

export async function fetchPlayerDirectory() {
  const { data, error } = await supabase
    .from('player_directory_entries')
    .select('id, name, games_played, wins, win_rate, latest_played_at, latest_game_number, commanders')
    .order('wins', { ascending: false })
    .order('games_played', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

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

export async function fetchAddGamePlayerSuggestions() {
  const { data, error } = await supabase
    .from('game_participants')
    .select(`
      player:players (
        id,
        name
      ),
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
    `);

  if (error) {
    throw error;
  }

  const playerMap = new Map<string, AddGamePlayerSuggestion>();

  for (const participant of data ?? []) {
    const player = Array.isArray(participant.player) ? participant.player[0] : participant.player;
    const primaryCommander = Array.isArray(participant.primary_commander) ? participant.primary_commander[0] : participant.primary_commander;
    const secondaryCommander = Array.isArray(participant.secondary_commander) ? participant.secondary_commander[0] : participant.secondary_commander;

    if (!player) {
      continue;
    }

    const existingPlayer: AddGamePlayerSuggestion = playerMap.get(player.id) ?? {
      id: player.id,
      name: player.name,
      commanders: [],
    };

    const commanderMap = new Map(existingPlayer.commanders.map((commander) => [commander.scryfallId || commander.name, commander]));

    for (const commander of [primaryCommander, secondaryCommander] as Array<CommanderRow | null | undefined>) {
      if (!commander) {
        continue;
      }

      const key = commander.scryfall_id ?? commander.name;
      const existingCommander = commanderMap.get(key);
      if (existingCommander) {
        existingCommander.appearances += 1;
        if (!existingCommander.imageUrl && commander.image_url) {
          existingCommander.imageUrl = commander.image_url;
        }
      } else {
        const nextCommander = {
          ...toCommanderCardSuggestion(commander),
          appearances: 1,
        };
        existingPlayer.commanders.push(nextCommander);
        commanderMap.set(key, nextCommander);
      }
    }

    playerMap.set(player.id, existingPlayer);
  }

  return [...playerMap.values()]
    .map((player) => ({
      ...player,
      commanders: [...player.commanders].sort((left, right) => {
        if (right.appearances !== left.appearances) {
          return right.appearances - left.appearances;
        }

        return left.name.localeCompare(right.name);
      }),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
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
