import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { CommanderAutocomplete } from '../components/CommanderAutocomplete';
import { fetchAddGamePlayerSuggestions, fetchWinConditionSuggestions, type AddGamePlayerSuggestion } from '../lib/gameRecords';
import { supabase } from '../lib/supabase';
import type { CommanderCard } from '../types/app';
import type { ParticipantInput } from '../types/app';

type AddGameFormValues = {
  gameTitle: string;
  playedAt: string;
  playersCount: string;
  bracket: string;
  winCondition: string;
  customWinCondition: string;
};

const DEFAULT_WIN_CONDITIONS = ['Combat', 'Combo', 'Commander Damage', 'Other'] as const;
const CUSTOM_WIN_CONDITION_VALUE = '__custom__';

function createParticipantSeat(seat: number): ParticipantInput {
  return {
    seat,
    playerName: '',
    primary: null,
    isWinner: seat === 1,
  };
}

function syncParticipantsToPlayerCount(participants: ParticipantInput[], playersCount: number) {
  const nextParticipants = Array.from({ length: playersCount }, (_, index) => {
    const seat = index + 1;
    return participants.find((participant) => participant.seat === seat) ?? createParticipantSeat(seat);
  });

  const winnerStillVisible = nextParticipants.some((participant) => participant.isWinner);
  if (!winnerStillVisible && nextParticipants.length > 0) {
    nextParticipants[0] = { ...nextParticipants[0], isWinner: true };
  }

  return nextParticipants;
}

function includesRuleText(card: CommanderCard | null | undefined, text: string) {
  return card?.oracleText?.toLowerCase().includes(text) ?? false;
}

function isBackgroundCard(card: CommanderCard | null | undefined) {
  return card?.typeLine?.toLowerCase().includes('background') ?? false;
}

function getSecondaryMode(card: CommanderCard | null | undefined): 'commanders' | 'backgrounds' | null {
  if (!card) {
    return null;
  }

  if (isBackgroundCard(card)) {
    return 'commanders';
  }

  if (includesRuleText(card, 'choose a background') || includesRuleText(card, 'create a character')) {
    return 'backgrounds';
  }

  if (
    includesRuleText(card, 'partner') ||
    includesRuleText(card, 'friends forever') ||
    includesRuleText(card, 'doctor\'s companion')
  ) {
    return 'commanders';
  }

  return null;
}

function isSecondarySelectionValid(primary: CommanderCard | null | undefined, secondary: CommanderCard | null | undefined) {
  if (!secondary) {
    return true;
  }

  const secondaryMode = getSecondaryMode(primary);
  if (!secondaryMode) {
    return false;
  }

  if (secondaryMode === 'backgrounds') {
    return isBackgroundCard(secondary);
  }

  return !isBackgroundCard(secondary);
}

function isMissingBracketColumnError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : null;
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';

  return (code === 'PGRST204' || code === '42703') && message.includes('bracket');
}

function normalizePlayerName(value: string) {
  return value.trim().toLowerCase();
}

export default function AddGamePage() {
  const { register, handleSubmit, watch, setValue } = useForm<AddGameFormValues>({
    defaultValues: {
      gameTitle: '',
      playedAt: new Date().toISOString().slice(0, 10),
      playersCount: '4',
      bracket: '3',
      winCondition: '',
      customWinCondition: '',
    },
  });
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<ParticipantInput[]>(() => Array.from({ length: 4 }, (_, index) => createParticipantSeat(index + 1)));
  const [playerSuggestions, setPlayerSuggestions] = useState<AddGamePlayerSuggestion[]>([]);
  const [winConditionSuggestions, setWinConditionSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playersCount = parseInt(watch('playersCount') || '4', 10);
  const winCondition = watch('winCondition');
  const customWinCondition = watch('customWinCondition');
  const isAddingCustomWinCondition = winCondition === CUSTOM_WIN_CONDITION_VALUE;

  useEffect(() => {
    setParticipants((currentParticipants) => syncParticipantsToPlayerCount(currentParticipants, playersCount));
  }, [playersCount]);

  useEffect(() => {
    let isMounted = true;

    async function loadPlayerSuggestions() {
      try {
        const [nextSuggestions, nextWinConditions] = await Promise.all([
          fetchAddGamePlayerSuggestions(),
          fetchWinConditionSuggestions(),
        ]);
        if (isMounted) {
          setPlayerSuggestions(nextSuggestions);
          setWinConditionSuggestions(nextWinConditions);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load player suggestions');
        }
      }
    }

    loadPlayerSuggestions();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasIncompleteSeat = participants.some((participant) => !participant.playerName.trim() || !participant.primary);
  const playerNameOptions = playerSuggestions.map((player) => player.name);
  const availableWinConditions = [...new Set([...DEFAULT_WIN_CONDITIONS, ...winConditionSuggestions])];

  const findMatchingPlayerSuggestion = (playerName: string) =>
    playerSuggestions.find((player) => normalizePlayerName(player.name) === normalizePlayerName(playerName)) ?? null;

  const handlePlayerNameChange = (seat: number, playerName: string) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              playerName,
            }
          : participant,
      ),
    );
  };

  const handleCommanderChange = (seat: number, primary: ParticipantInput['primary']) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              primary,
              secondary: isSecondarySelectionValid(primary, participant.secondary) ? participant.secondary ?? null : null,
            }
          : participant,
      ),
    );
    setError(null);
  };

  const handleCommanderClear = (seat: number) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              primary: null,
              secondary: null,
            }
          : participant,
      ),
    );
  };

  const handleSecondaryCommanderChange = (seat: number, secondary: ParticipantInput['secondary']) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              secondary,
            }
          : participant,
      ),
    );
    setError(null);
  };

  const handleSecondaryCommanderClear = (seat: number) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              secondary: null,
            }
          : participant,
      ),
    );
  };

  const handleWinnerChange = (seat: number) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) => ({
        ...participant,
        isWinner: participant.seat === seat,
      })),
    );
  };

  const handleSaveGame = async (formData: AddGameFormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      const resolvedWinCondition = formData.winCondition === CUSTOM_WIN_CONDITION_VALUE
        ? formData.customWinCondition.trim()
        : formData.winCondition.trim();

      if (participants.some((participant) => !participant.playerName.trim() || !participant.primary)) {
        throw new Error('Please complete every player card with a name and commander before saving');
      }

      if (!resolvedWinCondition) {
        throw new Error('Please choose a win condition before saving');
      }

      const winner = participants.find((participant) => participant.isWinner);
      if (!winner) {
        throw new Error('Please mark exactly one winner before saving');
      }

      const participantRows: Array<{
        seat: number;
        playerId: string;
        primaryCommanderId: string;
        secondaryCommanderId: string | null;
        isWinner: boolean;
      }> = [];

      for (const participant of participants) {
        if (!participant.primary) {
          throw new Error(`Seat ${participant.seat} is missing a commander`);
        }

        const { data: commanderData, error: commanderError } = await supabase
          .from('commanders')
          .upsert(
            {
              scryfall_id: participant.primary.scryfallId,
              name: participant.primary.name,
              image_url: participant.primary.imageUrl,
              color_identity: participant.primary.colorIdentity || [],
              type_line: participant.primary.typeLine,
              oracle_text: participant.primary.oracleText,
            },
            { onConflict: 'scryfall_id' },
          )
          .select()
          .single();

        if (commanderError) throw commanderError;

        let secondaryCommanderId: string | null = null;

        if (participant.secondary) {
          const { data: secondaryCommanderData, error: secondaryCommanderError } = await supabase
            .from('commanders')
            .upsert(
              {
                scryfall_id: participant.secondary.scryfallId,
                name: participant.secondary.name,
                image_url: participant.secondary.imageUrl,
                color_identity: participant.secondary.colorIdentity || [],
                type_line: participant.secondary.typeLine,
                oracle_text: participant.secondary.oracleText,
              },
              { onConflict: 'scryfall_id' },
            )
            .select()
            .single();

          if (secondaryCommanderError) throw secondaryCommanderError;
          secondaryCommanderId = secondaryCommanderData.id;
        }

        const { data: playerData, error: playerError } = await supabase
          .from('players')
          .upsert(
            {
              name: participant.playerName.trim(),
            },
            { onConflict: 'name' },
          )
          .select()
          .single();

        if (playerError) throw playerError;

        participantRows.push({
          seat: participant.seat,
          playerId: playerData.id,
          primaryCommanderId: commanderData.id,
          secondaryCommanderId,
          isWinner: participant.isWinner || false,
        });
      }

      let gameInsertResult = await supabase
        .from('games')
        .insert({
          title: formData.gameTitle.trim() || null,
          played_at: formData.playedAt,
          number_of_players: parseInt(formData.playersCount, 10),
          bracket: parseInt(formData.bracket, 10),
          win_condition: resolvedWinCondition,
        })
        .select()
        .single();

      if (gameInsertResult.error && isMissingBracketColumnError(gameInsertResult.error)) {
        gameInsertResult = await supabase
          .from('games')
          .insert({
            title: formData.gameTitle.trim() || null,
            played_at: formData.playedAt,
            number_of_players: parseInt(formData.playersCount, 10),
            win_condition: resolvedWinCondition,
          })
          .select()
          .single();
      }

      if (gameInsertResult.error) throw gameInsertResult.error;
      const gameData = gameInsertResult.data;

      const insertedParticipants: Array<{
        id: string;
        player_id: string;
        is_winner: boolean;
      }> = [];

      for (const participantRow of participantRows) {
        const { data: insertedParticipant, error: participantError } = await supabase
          .from('game_participants')
          .insert({
            game_id: gameData.id,
            player_id: participantRow.playerId,
            primary_commander_id: participantRow.primaryCommanderId,
            secondary_commander_id: participantRow.secondaryCommanderId,
            turn_order_position: participantRow.seat,
            is_winner: participantRow.isWinner,
          })
          .select('id, player_id, is_winner')
          .single();

        if (participantError) throw participantError;

        insertedParticipants.push(insertedParticipant);
      }

      const winnerParticipant = insertedParticipants.find((participant) => participant.is_winner);
      if (!winnerParticipant) {
        throw new Error('Winner row could not be resolved after saving participants');
      }

      const { error: updateGameError } = await supabase
        .from('games')
        .update({
          winner_player_id: winnerParticipant.player_id,
          winner_participant_id: winnerParticipant.id,
        })
        .eq('id', gameData.id);

      if (updateGameError) throw updateGameError;

      navigate('/history');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className='wireframe-shell px-5 py-6 md:px-8 md:py-7'>
      <form className='mx-auto flex w-full max-w-6xl flex-col gap-4' onSubmit={handleSubmit(handleSaveGame)}>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='space-y-2 text-left'>
            <h1 className='wireframe-title text-4xl md:text-6xl'>Log a Game</h1>
            <p className='app-muted text-sm md:text-base'>Log the pod details up top, then fill in each active seat below.</p>
          </div>

          <button
            type='submit'
            disabled={isLoading || hasIncompleteSeat}
            className='rounded-full border px-6 py-2.5 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 md:px-8 md:text-xl'
            style={{ background: '#18181b', borderColor: 'var(--app-border)' }}
          >
            {isLoading ? 'Saving...' : 'Save Game'}
          </button>
        </div>

        <div className='grid w-full gap-3 text-left sm:grid-cols-2'>
          <input
            type='text'
            className='app-input sm:col-span-2'
            placeholder='Game title (optional)'
            {...register('gameTitle')}
          />

          <input type='date' className='app-input' {...register('playedAt', { required: true })} />

          <label className='flex items-center gap-3 rounded-xl border px-3 py-2.5' style={{ background: 'var(--app-panel-soft)', borderColor: 'var(--app-border)' }}>
            <span className='min-w-0 flex-1 text-sm font-semibold app-muted md:text-base'>Number of Seats</span>
            <select className='app-input min-w-[8rem] !w-auto !p-2.5 text-base md:text-lg' {...register('playersCount', { required: true })}>
              <option value='2'>2</option>
              <option value='3'>3</option>
              <option value='4'>4</option>
            </select>
          </label>

          <select className='app-input' {...register('bracket', { required: true })}>
            <option value='1'>Bracket 1</option>
            <option value='2'>Bracket 2</option>
            <option value='3'>Bracket 3</option>
            <option value='4'>Bracket 4</option>
            <option value='5'>Bracket 5</option>
          </select>

          <select
            className='app-input'
            {...register('winCondition', {
              required: true,
              onChange: (event) => {
                if (event.target.value !== CUSTOM_WIN_CONDITION_VALUE) {
                  setValue('customWinCondition', '');
                }
              },
            })}
          >
            <option value=''>Select win condition</option>
            {availableWinConditions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={CUSTOM_WIN_CONDITION_VALUE}>Add new win condition</option>
          </select>

          {isAddingCustomWinCondition && (
            <input
              type='text'
              className='app-input sm:col-span-2'
              placeholder='Enter a new win condition'
              {...register('customWinCondition', { required: isAddingCustomWinCondition })}
            />
          )}
        </div>

        <div className='w-full space-y-3 text-left'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h2 className='text-2xl font-semibold'>Player Grid</h2>
              <p className='app-muted text-sm'>Fill out each seat directly here. With four players, the seats display in a 2x2 grid.</p>
            </div>
            <p className='app-chip'>{playersCount} seats active</p>
          </div>

          <div className='grid gap-3 md:grid-cols-2'>
            {participants.map((participant) => {
              const matchingPlayer = findMatchingPlayerSuggestion(participant.playerName);
              const playerCommanderSuggestions = matchingPlayer?.commanders ?? [];

              return (
                <div key={participant.seat} className='app-card space-y-3 p-3.5'>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <p className='app-muted text-xs font-bold uppercase tracking-[0.25em]'>Seat {participant.seat}</p>
                      <h3 className='text-lg font-semibold'>Player {participant.seat}</h3>
                    </div>

                    <label className='app-card-soft flex items-center gap-2 rounded-full px-3 py-2 text-base font-semibold'>
                      <input
                        type='radio'
                        name='winner'
                        checked={Boolean(participant.isWinner)}
                        onChange={() => handleWinnerChange(participant.seat)}
                        className='h-4 w-4'
                      />
                      Winner
                    </label>
                  </div>

                  <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem] md:items-start'>
                    <div className='space-y-3'>
                      <input
                        type='text'
                        list='player-name-suggestions'
                        value={participant.playerName}
                        onChange={(event) => handlePlayerNameChange(participant.seat, event.target.value)}
                        placeholder={`Seat ${participant.seat} player name`}
                        className='app-input-compact'
                      />
                      {matchingPlayer && (
                        <p className='app-muted text-xs'>
                          Suggestions loaded from {matchingPlayer.name}&apos;s saved game history.
                        </p>
                      )}

                      <div className='space-y-2'>
                        <CommanderAutocomplete
                          value={participant.primary?.name ?? ''}
                          onSelect={(commander) => handleCommanderChange(participant.seat, commander)}
                          suggestedItems={playerCommanderSuggestions}
                        />

                        {participant.primary ? (
                          <div className='app-card-soft flex items-center justify-between gap-3 px-3 py-2 text-sm'>
                            <p>
                              <strong>Commander:</strong> {participant.primary.name}
                            </p>
                            <button
                              type='button'
                              className='font-semibold text-red-600 hover:text-red-800'
                              onClick={() => handleCommanderClear(participant.seat)}
                            >
                              Clear
                            </button>
                          </div>
                        ) : (
                          <p className='app-muted text-sm'>Choose a commander for this seat.</p>
                        )}
                      </div>

                      {getSecondaryMode(participant.primary) && (
                        <div className='space-y-2'>
                          <CommanderAutocomplete
                            value={participant.secondary?.name ?? ''}
                            searchMode={getSecondaryMode(participant.primary) ?? 'commanders'}
                            placeholder={getSecondaryMode(participant.primary) === 'backgrounds' ? 'Search background' : 'Search second commander'}
                            onSelect={(commander) => handleSecondaryCommanderChange(participant.seat, commander)}
                            suggestedItems={playerCommanderSuggestions}
                          />

                          {participant.secondary ? (
                            <div className='app-card-soft flex items-center justify-between gap-3 px-3 py-2 text-sm'>
                              <p>
                                <strong>{getSecondaryMode(participant.primary) === 'backgrounds' ? 'Background:' : 'Second commander:'}</strong> {participant.secondary.name}
                              </p>
                              <button
                                type='button'
                                className='font-semibold text-red-600 hover:text-red-800'
                                onClick={() => handleSecondaryCommanderClear(participant.seat)}
                              >
                                Clear
                              </button>
                            </div>
                          ) : (
                            <p className='app-muted text-sm'>
                              {getSecondaryMode(participant.primary) === 'backgrounds'
                                ? 'This commander can pair with a Background.'
                                : 'This commander can pair with a second commander.'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className='commander-stage md:sticky md:top-3'>
                      <div className={`commander-stage-stack${participant.secondary ? ' has-secondary' : ''}`}>
                        <div
                          className={`commander-stage-card primary${participant.primary?.imageUrl ? ' filled' : ''}`}
                          style={participant.primary?.imageUrl ? { backgroundImage: `url(${participant.primary.imageUrl})` } : undefined}
                        >
                          {!participant.primary?.imageUrl && <span>Commander art</span>}
                        </div>

                        {(getSecondaryMode(participant.primary) || participant.secondary) && (
                          <div
                            className={`commander-stage-card secondary${participant.secondary?.imageUrl ? ' filled' : ''}`}
                            style={participant.secondary?.imageUrl ? { backgroundImage: `url(${participant.secondary.imageUrl})` } : undefined}
                          >
                            {!participant.secondary?.imageUrl && <span>Second card</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {error && <p className='text-sm text-red-600'>{error}</p>}
        </div>

        <datalist id='player-name-suggestions'>
          {playerNameOptions.map((playerName) => (
            <option key={playerName} value={playerName} />
          ))}
        </datalist>
      </form>
    </section>
  );
}
