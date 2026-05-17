import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getScryfallSearchUrl } from '../lib/scryfall';
import { supabase } from '../lib/supabase';
import { fetchNumberedGames, fetchWinConditionSuggestions, readSingleCommander, readSingleName, setGameWinner, type NumberedHistoryGame } from '../lib/gameRecords';

const DEFAULT_WIN_CONDITIONS = ['Combat', 'Combo', 'Commander Damage', 'Other'] as const;
const GAME_NOTES_MAX_LENGTH = 500;

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export default function GameHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedGameId = searchParams.get('game') ?? '';
  const [games, setGames] = useState<NumberedHistoryGame[]>([]);
  const [bracketDrafts, setBracketDrafts] = useState<Record<string, string>>({});
  const [winConditionDrafts, setWinConditionDrafts] = useState<Record<string, string>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [winnerDrafts, setWinnerDrafts] = useState<Record<string, string>>({});
  const [winConditionOptions, setWinConditionOptions] = useState<string[]>([]);
  const [playerFilter, setPlayerFilter] = useState(searchParams.get('player') ?? '');
  const [bracketFilter, setBracketFilter] = useState(searchParams.get('bracket') ?? '');
  const [winConditionFilter, setWinConditionFilter] = useState(searchParams.get('winCondition') ?? '');
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [savingGameId, setSavingGameId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGames() {
      try {
        setIsLoading(true);
        setError(null);

        const [nextGames, nextWinConditionOptions] = await Promise.all([
          fetchNumberedGames(),
          fetchWinConditionSuggestions(),
        ]);
        if (isMounted) {
          setGames(nextGames);
          setWinConditionOptions([...new Set([...DEFAULT_WIN_CONDITIONS, ...nextWinConditionOptions])]);
          setBracketDrafts(
            nextGames.reduce<Record<string, string>>((drafts, game) => {
              drafts[game.id] = String(game.bracket);
              return drafts;
            }, {}),
          );
          setWinConditionDrafts(
            nextGames.reduce<Record<string, string>>((drafts, game) => {
              drafts[game.id] = game.win_condition ?? '';
              return drafts;
            }, {}),
          );
          setNotesDrafts(
            nextGames.reduce<Record<string, string>>((drafts, game) => {
              drafts[game.id] = game.notes ?? '';
              return drafts;
            }, {}),
          );
          setWinnerDrafts(
            nextGames.reduce<Record<string, string>>((drafts, game) => {
              drafts[game.id] = game.game_participants.find((participant) => participant.is_winner)?.id ?? '';
              return drafts;
            }, {}),
          );
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load game history');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadGames();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const nextPlayerFilter = searchParams.get('player') ?? '';
    const nextBracketFilter = searchParams.get('bracket') ?? '';
    const nextWinConditionFilter = searchParams.get('winCondition') ?? '';
    setPlayerFilter(nextPlayerFilter);
    setBracketFilter(nextBracketFilter);
    setWinConditionFilter(nextWinConditionFilter);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedGameId || isLoading || error) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const selectedGameCard = document.getElementById(`history-game-${selectedGameId}`);
      selectedGameCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [selectedGameId, isLoading, error, games]);

  const handleWinConditionDraftChange = (gameId: string, winCondition: string) => {
    setWinConditionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: winCondition,
    }));
  };

  const handleBracketDraftChange = (gameId: string, bracket: string) => {
    setBracketDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: bracket,
    }));
  };

  const handleNotesDraftChange = (gameId: string, notes: string) => {
    setNotesDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: notes.slice(0, GAME_NOTES_MAX_LENGTH),
    }));
  };

  const handleGameSave = async (gameId: string) => {
    try {
      setSavingGameId(gameId);
      setError(null);

      const nextBracket = parseInt(bracketDrafts[gameId] ?? '', 10);
      const nextWinCondition = winConditionDrafts[gameId]?.trim();
      const nextNotes = notesDrafts[gameId]?.trim() || null;
      if (!Number.isInteger(nextBracket) || nextBracket < 1 || nextBracket > 5) {
        throw new Error('Please choose a bracket before saving');
      }
      if (!nextWinCondition) {
        throw new Error('Please choose a win condition before saving');
      }

      const { error: updateError } = await supabase
        .from('games')
        .update({ bracket: nextBracket, win_condition: nextWinCondition, notes: nextNotes })
        .eq('id', gameId);

      if (updateError) {
        throw updateError;
      }

      const nextWinnerParticipantId = winnerDrafts[gameId] || null;
      await setGameWinner(gameId, nextWinnerParticipantId);

      setGames((currentGames) =>
        currentGames.map((game) =>
          game.id === gameId
            ? {
                ...game,
                bracket: nextBracket,
                win_condition: nextWinCondition,
                notes: nextNotes,
                game_participants: game.game_participants.map((participant) => ({
                  ...participant,
                  is_winner: participant.id === nextWinnerParticipantId,
                })),
              }
            : game,
        ),
      );
      setEditingGameId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game');
    } finally {
      setSavingGameId(null);
    }
  };

  const handleWinnerDraftChange = (gameId: string, winnerParticipantId: string) => {
    setWinnerDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: winnerParticipantId,
    }));
  };

  const availablePlayers = [...new Set(
    games.flatMap((game) =>
      game.game_participants
        .map((participant) => readSingleName(participant.player))
        .filter((name) => name !== 'Unknown'),
    ),
  )].sort((left, right) => left.localeCompare(right));

  const filteredGames = games.filter((game) => {
    const matchesPlayer = !playerFilter.trim()
      || game.game_participants.some((participant) => readSingleName(participant.player).includes(playerFilter.trim()));
    const matchesBracket = !bracketFilter || String(game.bracket) === bracketFilter;
    const matchesWinCondition = !winConditionFilter || game.win_condition === winConditionFilter;

    return matchesPlayer && matchesBracket && matchesWinCondition;
  });

  return (
    <section className='wireframe-shell space-y-4'>
      <div className='space-y-3 text-left'>
        <h1 className='wireframe-title'>Game History</h1>
        <div className='grid gap-3 md:grid-cols-3'>
          <input
            type='text'
            list='history-player-filter-options'
            value={playerFilter}
            onChange={(event) => {
              const nextValue = event.target.value;
              setPlayerFilter(nextValue);
              const nextParams = new URLSearchParams(searchParams);
              if (nextValue.trim()) {
                nextParams.set('player', nextValue);
              } else {
                nextParams.delete('player');
              }
              setSearchParams(nextParams, { replace: true });
            }}
            placeholder='Filter by player name'
            className='app-input'
          />
          <select
            value={bracketFilter}
            onChange={(event) => {
              const nextValue = event.target.value;
              setBracketFilter(nextValue);
              const nextParams = new URLSearchParams(searchParams);
              if (nextValue) {
                nextParams.set('bracket', nextValue);
              } else {
                nextParams.delete('bracket');
              }
              setSearchParams(nextParams, { replace: true });
            }}
            className='app-input'
          >
            <option value=''>All brackets</option>
            <option value='1'>Bracket 1</option>
            <option value='2'>Bracket 2</option>
            <option value='3'>Bracket 3</option>
            <option value='4'>Bracket 4</option>
            <option value='5'>Bracket 5</option>
          </select>
          <select
            value={winConditionFilter}
            onChange={(event) => {
              const nextValue = event.target.value;
              setWinConditionFilter(nextValue);
              const nextParams = new URLSearchParams(searchParams);
              if (nextValue) {
                nextParams.set('winCondition', nextValue);
              } else {
                nextParams.delete('winCondition');
              }
              setSearchParams(nextParams, { replace: true });
            }}
            className='app-input'
          >
            <option value=''>All win conditions</option>
            {winConditionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <datalist id='history-player-filter-options'>
            {availablePlayers.map((player) => (
              <option key={player} value={player} />
            ))}
          </datalist>
        </div>
      </div>

      {isLoading && <p className='wireframe-copy'>Loading games...</p>}
      {error && <p className='wireframe-copy text-red-600'>{error}</p>}

      {!isLoading && !error && games.length === 0 && (
        <p className='wireframe-copy'>No games saved yet. Add a game to start building your history.</p>
      )}

      {!isLoading && !error && games.length > 0 && filteredGames.length === 0 && (
        <div className='app-card text-left'>
          <p className='text-lg font-semibold'>No games match those filters</p>
          <p className='app-muted mt-2 text-sm'>Try a different player, bracket, or win condition, or clear the filters to see every saved game.</p>
        </div>
      )}

      {!isLoading && !error && filteredGames.length > 0 && (
        <div className='space-y-4'>
          {filteredGames.map((game) => (
            <article
              key={game.id}
              id={`history-game-${game.id}`}
              className={`app-card text-left ${selectedGameId === game.id ? 'history-game-selected' : ''}`}
            >
              {(() => {
                const hasAnySecondaryCommander = game.game_participants.some((participant) => Boolean(readSingleCommander(participant.secondary_commander)));

                return (
                  <>
              <div className='flex flex-wrap items-start justify-between gap-3 border-b pb-3 md:flex-nowrap' style={{ borderColor: 'var(--app-panel-strong)' }}>
                <div className='min-w-0 flex-1 space-y-3'>
                  <p className='app-muted text-base font-semibold uppercase tracking-[0.18em] md:text-lg'>Game #{game.gameNumber}</p>

                  <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                    <p className='app-muted text-base md:text-lg'>{formatPlayedAt(game.played_at)}</p>
                    <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                    <p className='app-muted text-base md:text-lg'>{game.number_of_players} players</p>
                    {editingGameId === game.id ? (
                      <>
                        <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                        <select
                          value={bracketDrafts[game.id] ?? String(game.bracket)}
                          onChange={(event) => handleBracketDraftChange(game.id, event.target.value)}
                          className='app-input-compact min-w-[8.5rem]'
                        >
                          <option value='1'>Bracket 1</option>
                          <option value='2'>Bracket 2</option>
                          <option value='3'>Bracket 3</option>
                          <option value='4'>Bracket 4</option>
                          <option value='5'>Bracket 5</option>
                        </select>
                        <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                        <select
                          value={winConditionDrafts[game.id] ?? ''}
                          onChange={(event) => handleWinConditionDraftChange(game.id, event.target.value)}
                          className='app-input-compact min-w-[13rem] flex-1'
                        >
                          <option value=''>Select win condition</option>
                          {winConditionOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
                        <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                        <p className='app-muted text-base md:text-lg'>Bracket {game.bracket}</p>
                        <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                        <p className='app-muted text-base md:text-lg'>{game.win_condition}</p>
                      </>
                    )}
                  </div>

                  {editingGameId === game.id ? (
                    <div className='game-notes-panel'>
                      <p className='game-notes-label'>Game Notes</p>
                      <textarea
                        value={notesDrafts[game.id] ?? ''}
                        onChange={(event) => handleNotesDraftChange(game.id, event.target.value)}
                        maxLength={GAME_NOTES_MAX_LENGTH}
                        className='app-input game-notes-input game-notes-textarea text-sm md:text-base'
                        placeholder='Add any table notes, memorable plays, or context for this game'
                      />
                      <p className='game-notes-count'>
                        {(notesDrafts[game.id] ?? '').length}/{GAME_NOTES_MAX_LENGTH}
                      </p>
                    </div>
                  ) : game.notes ? (
                    <div className='game-notes-panel'>
                      <p className='game-notes-label'>Game Notes</p>
                      <p className='game-notes-display'>{game.notes}</p>
                    </div>
                  ) : null}
                </div>
                <div className='flex w-full shrink-0 flex-col items-end gap-2 self-start md:w-[22rem]'>
                  <div
                    className='app-chip border'
                    style={{
                      borderColor: game.game_participants.filter((participant) => participant.is_winner).length === 1 ? '#047857' : '#dc2626',
                      color: game.game_participants.filter((participant) => participant.is_winner).length === 1 ? '#047857' : '#dc2626',
                    }}
                  >
                    {game.game_participants.filter((participant) => participant.is_winner).length === 1 ? 'Winner locked in' : 'No winner assigned'}
                  </div>
                  <button
                    type='button'
                    onClick={() => setEditingGameId((currentGameId) => currentGameId === game.id ? null : game.id)}
                    className='rounded-full border px-4 py-2 text-sm font-semibold'
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    {editingGameId === game.id ? 'Close edit' : 'Edit game'}
                  </button>
                  {editingGameId === game.id && (
                    <button
                      type='button'
                      onClick={() => handleGameSave(game.id)}
                      disabled={savingGameId === game.id}
                      className='rounded-full border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
                      style={{ borderColor: 'var(--app-border)' }}
                    >
                      {savingGameId === game.id ? 'Saving...' : 'Save edits'}
                    </button>
                  )}
                </div>
              </div>

              <ul className='mt-4 flex gap-3 overflow-x-auto pb-1'>
                {[...game.game_participants]
                  .sort((a, b) => a.turn_order_position - b.turn_order_position)
                  .map((participant) => {
                    const primaryCommander = readSingleCommander(participant.primary_commander);
                    const secondaryCommander = readSingleCommander(participant.secondary_commander);
                    const isSelectedWinner = winnerDrafts[game.id] === participant.id;

                    return (
                      <li key={participant.id} className='history-player-card app-card-soft flex min-h-[12rem] min-w-[14rem] flex-col gap-3 overflow-hidden p-3'>
                        <div className='flex items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <p className='app-muted text-xs font-bold uppercase tracking-[0.25em]'>Seat {participant.turn_order_position}</p>
                            <Link
                              to={`/players?player=${encodeURIComponent(readSingleName(participant.player))}`}
                              className='font-medium underline decoration-transparent underline-offset-2 transition hover:decoration-current'
                            >
                              {readSingleName(participant.player)}
                            </Link>
                          </div>
                          {editingGameId === game.id ? (
                            <button
                              type='button'
                              onClick={() => handleWinnerDraftChange(game.id, isSelectedWinner ? '' : participant.id)}
                              className='rounded-full border px-3 py-1 text-sm font-semibold transition'
                              style={{
                                borderColor: isSelectedWinner ? '#047857' : 'var(--app-border)',
                                color: isSelectedWinner ? '#047857' : 'var(--app-text)',
                                background: isSelectedWinner ? 'color-mix(in srgb, #047857 10%, var(--app-panel))' : 'var(--app-panel)',
                              }}
                            >
                              Winner
                            </button>
                          ) : participant.is_winner ? (
                            <span className='rounded-full border border-emerald-700 px-3 py-1 text-sm font-semibold text-emerald-700'>
                              Winner
                            </span>
                          ) : null}
                        </div>

                        <div className='history-commander-names min-w-0'>
                          <p className='app-muted text-sm'>
                            <a href={getScryfallSearchUrl(readSingleName(participant.primary_commander))} target='_blank' rel='noreferrer' className='underline underline-offset-2'>
                              {readSingleName(participant.primary_commander)}
                            </a>
                          </p>
                          {secondaryCommander && (
                            <p className='app-muted text-sm'>
                              <a href={getScryfallSearchUrl(secondaryCommander.name)} target='_blank' rel='noreferrer' className='underline underline-offset-2'>
                              {secondaryCommander.name}
                            </a>
                          </p>
                          )}
                          {!secondaryCommander && hasAnySecondaryCommander && (
                            <p className='history-commander-name-spacer' aria-hidden='true'>
                              &nbsp;
                            </p>
                          )}
                        </div>

                        <div className={`history-commander-pair${secondaryCommander ? ' has-secondary' : ''}`}>
                          <div className='history-commander-frame'>
                            {primaryCommander?.image_url ? (
                              <a href={getScryfallSearchUrl(primaryCommander.name)} target='_blank' rel='noreferrer' className='block h-full w-full'>
                                <img
                                  src={primaryCommander.image_url}
                                  alt={primaryCommander.name}
                                  className='history-commander-thumb'
                                  loading='lazy'
                                />
                              </a>
                            ) : (
                              <div className='history-commander-thumb placeholder'>No art</div>
                            )}
                          </div>

                          {secondaryCommander && (
                            <div className='history-commander-frame'>
                              {secondaryCommander.image_url ? (
                                <a href={getScryfallSearchUrl(secondaryCommander.name)} target='_blank' rel='noreferrer' className='block h-full w-full'>
                                  <img
                                    src={secondaryCommander.image_url}
                                    alt={secondaryCommander.name}
                                    className='history-commander-thumb'
                                    loading='lazy'
                                  />
                                </a>
                              ) : (
                                <div className='history-commander-thumb placeholder'>No art</div>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
