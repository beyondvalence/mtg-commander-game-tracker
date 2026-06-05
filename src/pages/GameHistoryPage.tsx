import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getScryfallSearchUrl } from '../lib/scryfall';
import { supabase } from '../lib/supabase';
import { fetchNumberedGames, fetchWinConditionSuggestions, readSingleCommander, readSingleName, relinkParticipantPlayer, setGameWinner, type NumberedHistoryGame } from '../lib/gameRecords';
import { usePod } from '../contexts/PodContext';

const DEFAULT_WIN_CONDITIONS = ['Combat', 'Combo', 'Commander Damage', 'Other'] as const;
const GAME_NOTES_MAX_LENGTH = 500;

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export default function GameHistoryPage() {
  const { activePodId, isPodAdmin } = usePod();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedGameId = searchParams.get('game') ?? '';
  const [games, setGames] = useState<NumberedHistoryGame[]>([]);
  const [bracketDrafts, setBracketDrafts] = useState<Record<string, string>>({});
  const [winConditionDrafts, setWinConditionDrafts] = useState<Record<string, string>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [winnerDrafts, setWinnerDrafts] = useState<Record<string, string>>({});
  const [killedFirstDrafts, setKilledFirstDrafts] = useState<Record<string, string[]>>({});
  const [turnLengthDrafts, setTurnLengthDrafts] = useState<Record<string, string>>({});
  const [playerNameDrafts, setPlayerNameDrafts] = useState<Record<string, Record<string, string>>>({});
  const [winConditionOptions, setWinConditionOptions] = useState<string[]>([]);
  const [playerFilter, setPlayerFilter] = useState<string[]>(() => {
    const raw = searchParams.get('player') ?? '';
    return raw ? raw.split(',').filter(Boolean) : [];
  });
  const [playerFilterDraft, setPlayerFilterDraft] = useState<string[]>(() => {
    const raw = searchParams.get('player') ?? '';
    return raw ? raw.split(',').filter(Boolean) : [];
  });
  const [isPlayerDropdownOpen, setIsPlayerDropdownOpen] = useState(false);
  const playerDropdownRef = useRef<HTMLDivElement>(null);
  const [bracketFilter, setBracketFilter] = useState(searchParams.get('bracket') ?? '');
  const [winConditionFilter, setWinConditionFilter] = useState(searchParams.get('winCondition') ?? '');
  const [finishedFilter, setFinishedFilter] = useState(searchParams.get('finished') ?? '');
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
          fetchNumberedGames({ podId: activePodId ?? undefined }),
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
          setKilledFirstDrafts(
            nextGames.reduce<Record<string, string[]>>((drafts, game) => {
              drafts[game.id] = game.game_participants.filter((participant) => participant.killed_first).map((participant) => participant.id);
              return drafts;
            }, {}),
          );
          setTurnLengthDrafts(
            nextGames.reduce<Record<string, string>>((drafts, game) => {
              drafts[game.id] = game.turn_length != null ? String(game.turn_length) : '';
              return drafts;
            }, {}),
          );
          setPlayerNameDrafts(
            nextGames.reduce<Record<string, Record<string, string>>>((drafts, game) => {
              drafts[game.id] = game.game_participants.reduce<Record<string, string>>((pd, participant) => {
                pd[participant.id] = readSingleName(participant.player);
                return pd;
              }, {});
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
    const rawPlayer = searchParams.get('player') ?? '';
    const nextPlayerFilter = rawPlayer ? rawPlayer.split(',').filter(Boolean) : [];
    const nextBracketFilter = searchParams.get('bracket') ?? '';
    const nextWinConditionFilter = searchParams.get('winCondition') ?? '';
    const nextFinishedFilter = searchParams.get('finished') ?? '';
    setPlayerFilter(nextPlayerFilter);
    setPlayerFilterDraft(nextPlayerFilter);
    setBracketFilter(nextBracketFilter);
    setWinConditionFilter(nextWinConditionFilter);
    setFinishedFilter(nextFinishedFilter);
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (playerDropdownRef.current && !playerDropdownRef.current.contains(event.target as Node)) {
        setIsPlayerDropdownOpen(false);
        setPlayerFilterDraft(playerFilter);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [playerFilter]);

  const handlePlayerFilterApply = () => {
    setPlayerFilter(playerFilterDraft);
    setIsPlayerDropdownOpen(false);
    const nextParams = new URLSearchParams(searchParams);
    if (playerFilterDraft.length > 0) {
      nextParams.set('player', playerFilterDraft.join(','));
    } else {
      nextParams.delete('player');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handlePlayerFilterClear = () => {
    setPlayerFilterDraft([]);
    setPlayerFilter([]);
    setIsPlayerDropdownOpen(false);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('player');
    setSearchParams(nextParams, { replace: true });
  };

  const togglePlayerDraft = (player: string) => {
    setPlayerFilterDraft((current) =>
      current.includes(player) ? current.filter((p) => p !== player) : [...current, player],
    );
  };

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

  const handleTurnLengthDraftChange = (gameId: string, turnLength: string) => {
    setTurnLengthDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: turnLength,
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
      const nextTurnLength = turnLengthDrafts[gameId] ? parseInt(turnLengthDrafts[gameId], 10) : null;
      if (!Number.isInteger(nextBracket) || nextBracket < 1 || nextBracket > 5) {
        throw new Error('Please choose a bracket before saving');
      }
      if (!nextWinCondition) {
        throw new Error('Please choose a win condition before saving');
      }

      const { error: updateError } = await supabase
        .from('games')
        .update({ bracket: nextBracket, win_condition: nextWinCondition, notes: nextNotes, turn_length: nextTurnLength })
        .eq('id', gameId);

      if (updateError) {
        throw updateError;
      }

      const game = games.find((g) => g.id === gameId);
      if (game) {
        for (const participant of game.game_participants) {
          const newName = playerNameDrafts[gameId]?.[participant.id]?.trim();
          const currentName = readSingleName(participant.player);
          if (newName && newName !== currentName) {
            await relinkParticipantPlayer(participant.id, gameId, newName);
          }
        }
      }

      const nextWinnerParticipantId = winnerDrafts[gameId] || null;
      const nextKilledFirstIds = (killedFirstDrafts[gameId] ?? []).filter((id) => id !== nextWinnerParticipantId);

      const { error: clearKilledFirstError } = await supabase
        .from('game_participants')
        .update({ killed_first: false })
        .eq('game_id', gameId);

      if (clearKilledFirstError) {
        throw clearKilledFirstError;
      }

      await setGameWinner(gameId, nextWinnerParticipantId);

      if (nextKilledFirstIds.length > 0) {
        const { error: setKilledFirstError } = await supabase
          .from('game_participants')
          .update({ killed_first: true })
          .in('id', nextKilledFirstIds);

        if (setKilledFirstError) {
          throw setKilledFirstError;
        }
      }

      const renamedNames = playerNameDrafts[gameId] ?? {};
      setGames((currentGames) =>
        currentGames.map((g) =>
          g.id === gameId
            ? {
                ...g,
                bracket: nextBracket,
                win_condition: nextWinCondition,
                notes: nextNotes,
                turn_length: nextTurnLength,
                finished: nextWinnerParticipantId !== null,
                game_participants: g.game_participants.map((participant) => {
                  const newName = renamedNames[participant.id]?.trim();
                  const playerObj = Array.isArray(participant.player) ? participant.player[0] : participant.player;
                  return {
                    ...participant,
                    is_winner: participant.id === nextWinnerParticipantId,
                    killed_first: nextKilledFirstIds.includes(participant.id),
                    player: newName && playerObj ? { ...playerObj, display_name: newName } : participant.player,
                  };
                }),
              }
            : g,
        ),
      );
      setEditingGameId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game');
    } finally {
      setSavingGameId(null);
    }
  };

  const handlePlayerNameDraftChange = (gameId: string, participantId: string, name: string) => {
    setPlayerNameDrafts((drafts) => ({
      ...drafts,
      [gameId]: { ...drafts[gameId], [participantId]: name },
    }));
  };

  const handleWinnerDraftChange = (gameId: string, winnerParticipantId: string) => {
    setWinnerDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: winnerParticipantId,
    }));
    if (winnerParticipantId) {
      setKilledFirstDrafts((currentDrafts) => ({
        ...currentDrafts,
        [gameId]: (currentDrafts[gameId] ?? []).filter((id) => id !== winnerParticipantId),
      }));
    }
  };

  const handleKilledFirstDraftToggle = (gameId: string, participantId: string) => {
    setKilledFirstDrafts((currentDrafts) => {
      const current = currentDrafts[gameId] ?? [];
      const isSelected = current.includes(participantId);
      return {
        ...currentDrafts,
        [gameId]: isSelected ? current.filter((id) => id !== participantId) : [...current, participantId],
      };
    });
    setWinnerDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: currentDrafts[gameId] === participantId ? '' : currentDrafts[gameId] ?? '',
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
    const matchesPlayer = playerFilter.length === 0
      || game.game_participants.some((participant) => playerFilter.includes(readSingleName(participant.player)));
    const matchesBracket = !bracketFilter || String(game.bracket) === bracketFilter;
    const matchesWinCondition = !winConditionFilter || game.win_condition === winConditionFilter;
    const matchesFinished = !finishedFilter || String(game.finished) === finishedFilter;

    return matchesPlayer && matchesBracket && matchesWinCondition && matchesFinished;
  });

  return (
    <section className='wireframe-shell space-y-4'>
      <datalist id='player-rename-suggestions'>
        {availablePlayers.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className='space-y-3 text-left'>
        <h1 className='wireframe-title'>Game History</h1>
        <div className='grid gap-3 md:grid-cols-4'>
          <div className='relative' ref={playerDropdownRef}>
            <button
              type='button'
              onClick={() => {
                setPlayerFilterDraft(playerFilter);
                setIsPlayerDropdownOpen((open) => !open);
              }}
              className='app-input flex w-full items-center justify-between gap-2 text-left'
            >
              <span className={playerFilter.length === 0 ? 'app-muted' : ''}>
                {playerFilter.length === 0
                  ? 'All players'
                  : playerFilter.length === 1
                  ? playerFilter[0]
                  : `${playerFilter.length} players`}
              </span>
              <svg viewBox='0 0 20 20' className='h-4 w-4 shrink-0 app-muted' fill='none' stroke='currentColor' strokeWidth='1.9'>
                <path d='m6 8 4 4 4-4' strokeLinecap='round' strokeLinejoin='round' />
              </svg>
            </button>
            {isPlayerDropdownOpen && (
              <div className='absolute left-0 top-full z-20 mt-1 w-full min-w-[12rem] rounded-xl border shadow-lg' style={{ background: 'var(--app-panel)', borderColor: 'var(--app-border)' }}>
                <div className='max-h-52 overflow-y-auto p-1'>
                  <label className='flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--app-panel-soft)]'>
                    <input
                      type='checkbox'
                      checked={playerFilterDraft.length === 0}
                      onChange={() => setPlayerFilterDraft([])}
                      className='h-4 w-4'
                    />
                    All players
                  </label>
                  {availablePlayers.map((player) => (
                    <label key={player} className='flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-[var(--app-panel-soft)]'>
                      <input
                        type='checkbox'
                        checked={playerFilterDraft.includes(player)}
                        onChange={() => togglePlayerDraft(player)}
                        className='h-4 w-4'
                      />
                      {player}
                    </label>
                  ))}
                </div>
                <div className='flex gap-2 border-t p-2' style={{ borderColor: 'var(--app-border)' }}>
                  <button
                    type='button'
                    onClick={handlePlayerFilterApply}
                    className='flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold'
                    style={{ background: 'var(--app-accent)', color: 'var(--app-accent-text)' }}
                  >
                    Apply
                  </button>
                  <button
                    type='button'
                    onClick={handlePlayerFilterClear}
                    className='flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold'
                    style={{ background: 'var(--app-panel-soft)', color: 'var(--app-muted)' }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
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
          <select
            value={finishedFilter}
            onChange={(event) => {
              const nextValue = event.target.value;
              setFinishedFilter(nextValue);
              const nextParams = new URLSearchParams(searchParams);
              if (nextValue) {
                nextParams.set('finished', nextValue);
              } else {
                nextParams.delete('finished');
              }
              setSearchParams(nextParams, { replace: true });
            }}
            className='app-input'
          >
            <option value=''>All games</option>
            <option value='true'>Finished</option>
            <option value='false'>Unfinished</option>
          </select>
        </div>
      </div>

      {isLoading && <p className='app-muted text-sm' role='status'>Loading games...</p>}
      {error && <p className='text-sm app-error-text'>{error}</p>}

      {!isLoading && !error && games.length === 0 && (
        <p className='app-muted text-base'>No games saved yet. Add a game to start building your history.</p>
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
                    <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                    <p className='app-muted text-base md:text-lg'>{game.service}</p>
                    {editingGameId === game.id ? (
                      <>
                        <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                        <select
                          value={turnLengthDrafts[game.id] ?? ''}
                          onChange={(event) => handleTurnLengthDraftChange(game.id, event.target.value)}
                          className='app-input-compact w-auto'
                        >
                          <option value=''>No turn count</option>
                          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={String(n)}>{n} turns</option>
                          ))}
                        </select>
                        <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                        <select
                          value={bracketDrafts[game.id] ?? String(game.bracket)}
                          onChange={(event) => handleBracketDraftChange(game.id, event.target.value)}
                          className='app-input-compact w-auto'
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
                          className='app-input-compact w-auto'
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
                        {game.turn_length ? (
                          <>
                            <span className='app-muted text-base md:text-lg' aria-hidden='true'>•</span>
                            <p className='app-muted text-base md:text-lg'>{game.turn_length} turns</p>
                          </>
                        ) : null}
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
                      borderColor: game.finished ? 'var(--app-success)' : 'var(--app-error)',
                      color: game.finished ? 'var(--app-success)' : 'var(--app-error)',
                    }}
                  >
                    {game.finished ? 'Game Finished' : 'Unfinished'}
                  </div>
                  {isPodAdmin && (
                  <button
                    type='button'
                    onClick={() => setEditingGameId((currentGameId) => currentGameId === game.id ? null : game.id)}
                    className='rounded-full border px-4 py-2 text-sm font-semibold'
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    {editingGameId === game.id ? 'Close edit' : 'Edit game'}
                  </button>
                  )}
                  {isPodAdmin && editingGameId === game.id && (
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
                    const isSelectedKilledFirst = (killedFirstDrafts[game.id] ?? []).includes(participant.id);
                    const killedFirstDraftCount = (killedFirstDrafts[game.id] ?? []).length;
                    const killedFirstCount = game.game_participants.filter((p) => p.killed_first).length;

                    return (
                      <li key={participant.id} className='history-player-card app-card-soft flex min-h-[12rem] min-w-[14rem] flex-col gap-3 overflow-hidden p-3'>
                        <div className='flex items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <p className='app-muted text-xs font-bold uppercase tracking-[0.25em]'>Seat {participant.turn_order_position}</p>
                            {editingGameId === game.id ? (
                              <input
                                type='text'
                                list='player-rename-suggestions'
                                value={playerNameDrafts[game.id]?.[participant.id] ?? readSingleName(participant.player)}
                                onChange={(e) => handlePlayerNameDraftChange(game.id, participant.id, e.target.value)}
                                className='app-input-compact mt-0.5 w-full'
                              />
                            ) : (
                              <Link
                                to={`/players?player=${encodeURIComponent(readSingleName(participant.player))}`}
                                className='font-medium underline decoration-transparent underline-offset-2 transition hover:decoration-current'
                              >
                                {readSingleName(participant.player)}
                              </Link>
                            )}
                          </div>
                          <div className='flex flex-col items-end gap-1.5'>
                            {editingGameId === game.id ? (
                              <>
                                <button
                                  type='button'
                                  onClick={() => handleWinnerDraftChange(game.id, isSelectedWinner ? '' : participant.id)}
                                  className='rounded-full border px-3 py-1 text-sm font-semibold transition'
                                  style={{
                                    borderColor: isSelectedWinner ? 'var(--app-success)' : 'var(--app-border)',
                                    color: isSelectedWinner ? 'var(--app-success)' : 'var(--app-text)',
                                    background: isSelectedWinner ? 'color-mix(in srgb, var(--app-success) 10%, var(--app-panel))' : 'var(--app-panel)',
                                  }}
                                >
                                  Winner
                                </button>
                                <button
                                  type='button'
                                  onClick={() => handleKilledFirstDraftToggle(game.id, participant.id)}
                                  disabled={isSelectedWinner}
                                  className='rounded-full border px-3 py-1 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'
                                  style={{
                                    borderColor: isSelectedKilledFirst ? 'var(--app-error)' : 'var(--app-border)',
                                    color: isSelectedKilledFirst ? 'var(--app-error)' : 'var(--app-text)',
                                    background: isSelectedKilledFirst ? 'color-mix(in srgb, var(--app-error) 10%, var(--app-panel))' : 'var(--app-panel)',
                                  }}
                                >
                                  {killedFirstDraftCount >= 2 && isSelectedKilledFirst ? 'Died Together' : 'Killed First'}
                                </button>
                              </>
                            ) : (
                              <>
                                {participant.is_winner && (
                                  <span className='rounded-full border px-3 py-1 text-sm font-semibold app-success-text' style={{ borderColor: 'var(--app-success)' }}>
                                    Winner
                                  </span>
                                )}
                                {participant.killed_first && (
                                  <span className='rounded-full border px-3 py-1 text-sm font-semibold app-error-text' style={{ borderColor: 'var(--app-error)' }}>
                                    {killedFirstCount >= 2 ? 'Died Together' : 'Killed First'}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
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
