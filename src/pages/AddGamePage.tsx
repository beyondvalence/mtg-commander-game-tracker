import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { usePod } from '../contexts/PodContext';
import { CommanderAutocomplete } from '../components/CommanderAutocomplete';
import {
  createGameWithParticipants,
  fetchAddGamePlayerSuggestions,
  fetchWinConditionSuggestions,
  type AddGamePlayerSuggestion,
} from '../lib/gameRecords';
import { getScryfallSearchUrl } from '../lib/scryfall';
import type { CommanderCard } from '../types/app';
import type { ParticipantInput } from '../types/app';

type AddGameFormValues = {
  playedAt: string;
  playersCount: string;
  bracket: string;
  service: 'paper' | 'Convoke' | 'Spelltable';
  turnLength: string;
  finishedGame: boolean;
  winCondition: string;
  customWinCondition: string;
  gameNotes: string;
};

const DEFAULT_WIN_CONDITIONS = ['Combat', 'Combo', 'Commander Damage', 'Other'] as const;
const SERVICE_OPTIONS = ['paper', 'Convoke', 'Spelltable'] as const;
const CUSTOM_WIN_CONDITION_VALUE = '__custom__';
const UNFINISHED_GAME_WIN_CONDITION = 'Unfinished';
const GAME_NOTES_MAX_LENGTH = 500;
const TURN_LENGTH_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1);

function createParticipantSeat(seat: number): ParticipantInput {
  return {
    seat,
    playerName: '',
    primary: null,
    isWinner: false,
    killedFirst: false,
  };
}

function syncParticipantsToPlayerCount(participants: ParticipantInput[], playersCount: number) {
  return Array.from({ length: playersCount }, (_, index) => {
    const seat = index + 1;
    return participants.find((participant) => participant.seat === seat) ?? createParticipantSeat(seat);
  });
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

function normalizePlayerName(value: string) {
  return value.trim();
}

export default function AddGamePage() {
  const { register, handleSubmit, watch, setValue } = useForm<AddGameFormValues>({
    defaultValues: {
      playedAt: new Date().toISOString().slice(0, 10),
      playersCount: '4',
      bracket: '3',
      service: 'Convoke',
      turnLength: '',
      finishedGame: true,
      winCondition: '',
      customWinCondition: '',
      gameNotes: '',
    },
  });
  const navigate = useNavigate();
  const { activePodId, isPodAdmin } = usePod();
  const [participants, setParticipants] = useState<ParticipantInput[]>(() => Array.from({ length: 4 }, (_, index) => createParticipantSeat(index + 1)));
  const [playerSuggestions, setPlayerSuggestions] = useState<AddGamePlayerSuggestion[]>([]);
  const [winConditionSuggestions, setWinConditionSuggestions] = useState<string[]>([]);
  const [visibleCommanderCardBySeat, setVisibleCommanderCardBySeat] = useState<Record<number, number>>({});
  const [isGameNotesOpen, setIsGameNotesOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playersCount = parseInt(watch('playersCount') || '4', 10);
  const finishedGame = watch('finishedGame');
  const winCondition = watch('winCondition');
  const customWinCondition = watch('customWinCondition');
  const gameNotes = watch('gameNotes') ?? '';
  const isAddingCustomWinCondition = finishedGame && winCondition === CUSTOM_WIN_CONDITION_VALUE;

  useEffect(() => {
    setParticipants((currentParticipants) => syncParticipantsToPlayerCount(currentParticipants, playersCount));
  }, [playersCount]);

  useEffect(() => {
    if (!finishedGame) {
      setParticipants((currentParticipants) =>
        currentParticipants.map((participant) => ({
          ...participant,
          isWinner: false,
          killedFirst: false,
        })),
      );
    }
  }, [finishedGame]);

  useEffect(() => {
    let isMounted = true;

    fetchWinConditionSuggestions()
      .then((next) => { if (isMounted) setWinConditionSuggestions(next); })
      .catch(() => {});

    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!activePodId) return;

    let isMounted = true;

    fetchAddGamePlayerSuggestions(activePodId)
      .then((next) => { if (isMounted) setPlayerSuggestions(next); })
      .catch((err) => { if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load player suggestions'); });

    return () => { isMounted = false; };
  }, [activePodId]);

  const findMatchingPlayerSuggestion = (playerName: string) =>
    playerSuggestions.find((player) => normalizePlayerName(player.displayName) === normalizePlayerName(playerName)) ?? null;

  const incompleteFields: string[] = [];
  for (const participant of participants) {
    if (!participant.playerName.trim()) {
      incompleteFields.push(`Seat ${participant.seat}: player name`);
    } else if (playerSuggestions.length > 0 && !findMatchingPlayerSuggestion(participant.playerName.trim())) {
      incompleteFields.push(`Seat ${participant.seat}: player not in pod`);
    }
    if (!participant.primary) incompleteFields.push(`Seat ${participant.seat}: commander`);
  }
  if (finishedGame && !winCondition) incompleteFields.push('Win condition');
  if (isAddingCustomWinCondition && !customWinCondition.trim()) incompleteFields.push('Custom win condition text');

  const hasIncompleteSeat = participants.some((participant) => !participant.playerName.trim() || !participant.primary);
  const playerNameOptions = playerSuggestions.map((player) => player.displayName);
  const availableWinConditions = [...new Set([...DEFAULT_WIN_CONDITIONS, ...winConditionSuggestions])];

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
        isWinner: participant.seat === seat ? !participant.isWinner : false,
        killedFirst: participant.seat === seat && !participant.isWinner ? false : participant.killedFirst,
      })),
    );
  };

  const handleKilledFirstChange = (seat: number) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              killedFirst: !participant.killedFirst,
              isWinner: participant.isWinner && participant.killedFirst ? false : participant.isWinner,
            }
          : participant,
      ),
    );
  };

  const handleVisibleCommanderCardChange = (seat: number, nextIndex: number) => {
    setVisibleCommanderCardBySeat((current) => ({
      ...current,
      [seat]: nextIndex,
    }));
  };

  const handleSaveGame = async (formData: AddGameFormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      const resolvedWinCondition = formData.finishedGame
        ? formData.winCondition === CUSTOM_WIN_CONDITION_VALUE
          ? formData.customWinCondition.trim()
          : formData.winCondition.trim()
        : UNFINISHED_GAME_WIN_CONDITION;

      if (participants.some((participant) => !participant.playerName.trim() || !participant.primary)) {
        throw new Error('Please complete every player card with a name and commander before saving');
      }

      if (formData.finishedGame && !resolvedWinCondition) {
        throw new Error('Please choose a win condition before saving');
      }

      if (!activePodId) throw new Error('No active pod selected');

      await createGameWithParticipants({
        podId: activePodId,
        playedAt: formData.playedAt,
        playersCount: parseInt(formData.playersCount, 10),
        bracket: parseInt(formData.bracket, 10),
        service: formData.service,
        turnLength: formData.turnLength ? parseInt(formData.turnLength, 10) : null,
        winCondition: resolvedWinCondition,
        notes: formData.gameNotes,
        participants: participants.map((participant) => {
          if (!participant.primary) {
            throw new Error(`Seat ${participant.seat} is missing a commander`);
          }

          return {
            seat: participant.seat,
            playerName: participant.playerName,
            primaryCommander: participant.primary,
            secondaryCommander: participant.secondary ?? null,
            isWinner: formData.finishedGame ? participant.isWinner || false : false,
            killedFirst: participant.killedFirst || false,
          };
        }),
      });

      navigate('/history');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isPodAdmin) {
    return (
      <section className='wireframe-shell'>
        <p className='wireframe-copy'>Only pod admins can add games.</p>
      </section>
    );
  }

  return (
    <section className='wireframe-shell px-5 py-6 md:px-8 md:py-7'>
      <form className='mx-auto flex w-full max-w-6xl flex-col gap-4' onSubmit={handleSubmit(handleSaveGame)}>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='text-left'>
            <h1 className='wireframe-title'>Add Game</h1>
          </div>

          <div className='relative'>
            <button
              type='submit'
              disabled={isLoading || incompleteFields.length > 0}
              className='dashboard-add-game-card dashboard-save-button disabled:cursor-not-allowed disabled:opacity-50'
            >
              {isLoading ? 'Saving...' : 'Save Game'}
            </button>
            {incompleteFields.length > 0 && !isLoading && (
              <div className='save-button-tooltip'>
                <p className='save-button-tooltip-heading'>Required to save:</p>
                <ul className='save-button-tooltip-list'>
                  {incompleteFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className='grid w-full gap-3 text-left sm:grid-cols-2 lg:grid-cols-4'>
          <select className='app-input h-14 text-base md:text-lg' {...register('bracket', { required: true })}>
            <option value='1'>Bracket 1</option>
            <option value='2'>Bracket 2</option>
            <option value='3'>Bracket 3</option>
            <option value='4'>Bracket 4</option>
            <option value='5'>Bracket 5</option>
          </select>

          <input type='date' className='app-input h-14 text-base md:text-lg' {...register('playedAt', { required: true })} />

          <label className='flex h-14 items-center gap-3 rounded-xl border px-3 py-2.5' style={{ background: 'var(--app-panel-soft)', borderColor: 'var(--app-border)' }}>
            <span className='min-w-0 flex-1 text-sm font-semibold app-muted md:text-base'>Seats</span>
            <select className='app-input flex-1 !p-2.5 text-base md:text-lg' {...register('playersCount', { required: true })}>
              <option value='2'>2</option>
              <option value='3'>3</option>
              <option value='4'>4</option>
            </select>
          </label>

          <label className='flex h-14 items-center gap-3 rounded-xl border px-3 py-2.5' style={{ background: 'var(--app-panel-soft)', borderColor: 'var(--app-border)' }}>
            <input type='checkbox' className='h-5 w-5' {...register('finishedGame')} />
            <span className='min-w-0 flex-1 text-sm font-semibold app-muted md:text-base'>Finished game</span>
          </label>

          {finishedGame && (
            <div className='grid gap-3 sm:col-span-2 lg:col-span-4 lg:grid-cols-3'>
              <select className='app-input h-14 text-base md:text-lg' {...register('service', { required: true })}>
                {SERVICE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select className='app-input h-14 text-base md:text-lg' {...register('turnLength')}>
                <option value=''>Turn length</option>
                {TURN_LENGTH_OPTIONS.map((option) => (
                  <option key={option} value={String(option)}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                className='app-input h-14 text-base md:text-lg'
                {...register('winCondition', {
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
            </div>
          )}

          {isAddingCustomWinCondition && (
            <input
              type='text'
              className='app-input h-14 text-base md:text-lg sm:col-span-2 lg:col-span-4'
              placeholder='Enter a new win condition'
              {...register('customWinCondition', { required: isAddingCustomWinCondition })}
            />
          )}

          <div className='game-notes-panel sm:col-span-2 lg:col-span-4'>
            <button
              type='button'
              className='game-notes-toggle'
              aria-expanded={isGameNotesOpen}
              aria-controls='add-game-notes-panel'
              onClick={() => setIsGameNotesOpen((open) => !open)}
            >
              <span className='game-notes-label'>Game Notes</span>
              <span className={`game-notes-caret ${isGameNotesOpen ? 'is-open' : ''}`} aria-hidden='true'>
                <svg viewBox='0 0 20 20' className='h-4 w-4' fill='none' stroke='currentColor' strokeWidth='1.9'>
                  <path d='m6 8 4 4 4-4' strokeLinecap='round' strokeLinejoin='round' />
                </svg>
              </span>
            </button>

            {isGameNotesOpen && (
              <div id='add-game-notes-panel' className='game-notes-content'>
                <textarea
                  maxLength={GAME_NOTES_MAX_LENGTH}
                  className='app-input game-notes-input game-notes-textarea text-base md:text-lg'
                  placeholder='Add any table notes, memorable plays, or context for this game'
                  {...register('gameNotes')}
                />
                <p className='game-notes-count'>{gameNotes.length}/{GAME_NOTES_MAX_LENGTH}</p>
              </div>
            )}
          </div>
        </div>

        <div className='w-full space-y-3 text-left'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h2 className='text-2xl font-semibold'>Seats + Commanders</h2>
            </div>
            <p className='app-chip'>{playersCount} seats active</p>
          </div>

          <div className='grid gap-3 md:grid-cols-2'>
            {participants.map((participant) => {
              const killedFirstCount = participants.filter((p) => p.killedFirst).length;
              const matchingPlayer = findMatchingPlayerSuggestion(participant.playerName);
              const playerCommanderSuggestions = matchingPlayer?.commanders ?? [];
              const commanderCards = [
                participant.primary
                  ? {
                      name: participant.primary.name,
                      imageUrl: participant.primary.imageUrl ?? null,
                    }
                  : null,
                participant.secondary
                  ? {
                      name: participant.secondary.name,
                      imageUrl: participant.secondary.imageUrl ?? null,
                    }
                  : null,
              ].filter((card): card is { name: string; imageUrl: string | null } => Boolean(card));
              const hasCommanderCarousel = commanderCards.length > 1;
              const visibleCommanderIndex = Math.min(visibleCommanderCardBySeat[participant.seat] ?? 0, Math.max(commanderCards.length - 1, 0));
              const visibleCommanderCard = commanderCards[visibleCommanderIndex] ?? null;

              return (
                <div key={participant.seat} className='app-card flex h-full flex-col gap-3 p-3.5'>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='app-muted text-sm font-bold uppercase tracking-[0.25em] md:text-base'>Seat {participant.seat}</p>
                    {finishedGame && (
                      <div className='flex items-center gap-1.5'>
                        <label
                          className='inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold'
                          style={participant.killedFirst
                            ? { opacity: 0.4, cursor: 'not-allowed', borderColor: 'var(--app-border)', color: 'var(--app-text)', background: 'var(--app-panel-soft)' }
                            : { borderColor: participant.isWinner ? '#047857' : 'var(--app-border)', color: participant.isWinner ? '#047857' : 'var(--app-text)', background: participant.isWinner ? 'color-mix(in srgb, #047857 10%, var(--app-panel))' : 'var(--app-panel-soft)' }}
                        >
                          <input
                            type='checkbox'
                            checked={Boolean(participant.isWinner)}
                            onChange={() => handleWinnerChange(participant.seat)}
                            disabled={Boolean(participant.killedFirst)}
                            className='h-4 w-4'
                          />
                          Winner
                        </label>
                        <label
                          className='inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold'
                          style={{ borderColor: participant.killedFirst ? '#dc2626' : 'var(--app-border)', color: participant.killedFirst ? '#dc2626' : 'var(--app-text)', background: participant.killedFirst ? 'color-mix(in srgb, #dc2626 10%, var(--app-panel))' : 'var(--app-panel-soft)' }}
                        >
                          <input
                            type='checkbox'
                            checked={Boolean(participant.killedFirst)}
                            onChange={() => handleKilledFirstChange(participant.seat)}
                            className='h-4 w-4'
                          />
                          {killedFirstCount >= 2 && participant.killedFirst ? 'Died Together' : 'Killed First'}
                        </label>
                      </div>
                    )}
                  </div>

                  {matchingPlayer && (
                    <p className='app-muted text-xs'>
                      Suggestions loaded from {matchingPlayer.displayName}&apos;s saved game history.
                    </p>
                  )}

                  <div className='grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem] md:items-start'>
                    <div className='space-y-3'>
                      <input
                        type='text'
                        list='player-name-suggestions'
                        value={participant.playerName}
                        onChange={(event) => handlePlayerNameChange(participant.seat, event.target.value)}
                        placeholder={`Seat ${participant.seat} player name`}
                        className='app-input-compact'
                      />

                      <div className='space-y-2'>
                        <CommanderAutocomplete
                          value={participant.primary?.name ?? ''}
                          onSelect={(commander) => handleCommanderChange(participant.seat, commander)}
                          suggestedItems={playerCommanderSuggestions}
                        />

                        {participant.primary ? (
                          <div className='app-card-soft flex items-center justify-between gap-3 px-3 py-2 text-sm'>
                            <p>
                              <strong>Commander:</strong>{' '}
                              <a href={getScryfallSearchUrl(participant.primary.name)} target='_blank' rel='noreferrer' className='underline underline-offset-2'>
                                {participant.primary.name}
                              </a>
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
                                <strong>{getSecondaryMode(participant.primary) === 'backgrounds' ? 'Background:' : 'Second commander:'}</strong>{' '}
                                <a href={getScryfallSearchUrl(participant.secondary.name)} target='_blank' rel='noreferrer' className='underline underline-offset-2'>
                                  {participant.secondary.name}
                                </a>
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

                    <div className='commander-stage min-h-[16rem] md:min-h-[17rem]'>
                      <div className='commander-stage-stack'>
                        <div className={`commander-stage-card${visibleCommanderCard?.imageUrl ? ' filled' : ''}`}>
                          {visibleCommanderCard?.imageUrl ? (
                            <a href={getScryfallSearchUrl(visibleCommanderCard.name)} target='_blank' rel='noreferrer' className='commander-stage-link'>
                              <img
                                src={visibleCommanderCard.imageUrl}
                                alt={visibleCommanderCard.name}
                                className='commander-stage-image'
                                loading='lazy'
                              />
                            </a>
                          ) : participant.primary?.imageUrl ? (
                            <a href={getScryfallSearchUrl(participant.primary.name)} target='_blank' rel='noreferrer' className='commander-stage-link'>
                              <img
                                src={participant.primary.imageUrl}
                                alt={participant.primary.name}
                                className='commander-stage-image'
                                loading='lazy'
                              />
                            </a>
                          ) : (
                            <span>{participant.secondary ? 'Commander pair art' : 'Commander art'}</span>
                          )}
                        </div>

                        {hasCommanderCarousel && (
                          <div className='commander-stage-controls'>
                            <button
                              type='button'
                              className='commander-stage-arrow'
                              onClick={() => handleVisibleCommanderCardChange(participant.seat, visibleCommanderIndex === 0 ? commanderCards.length - 1 : visibleCommanderIndex - 1)}
                              aria-label='Show previous commander card'
                            >
                              ←
                            </button>
                            <p className='commander-stage-indicator'>
                              {visibleCommanderIndex + 1} / {commanderCards.length}
                            </p>
                            <button
                              type='button'
                              className='commander-stage-arrow'
                              onClick={() => handleVisibleCommanderCardChange(participant.seat, visibleCommanderIndex === commanderCards.length - 1 ? 0 : visibleCommanderIndex + 1)}
                              aria-label='Show next commander card'
                            >
                              →
                            </button>
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
