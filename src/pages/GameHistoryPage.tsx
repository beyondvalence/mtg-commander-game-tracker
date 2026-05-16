import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getScryfallSearchUrl } from '../lib/scryfall';
import { supabase } from '../lib/supabase';
import { fetchNumberedGames, fetchWinConditionSuggestions, readSingleCommander, readSingleName, setGameWinner, type NumberedHistoryGame } from '../lib/gameRecords';

const DEFAULT_WIN_CONDITIONS = ['Combat', 'Combo', 'Commander Damage', 'Other'] as const;

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export default function GameHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [games, setGames] = useState<NumberedHistoryGame[]>([]);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [winConditionDrafts, setWinConditionDrafts] = useState<Record<string, string>>({});
  const [winnerDrafts, setWinnerDrafts] = useState<Record<string, string>>({});
  const [winConditionOptions, setWinConditionOptions] = useState<string[]>([]);
  const [playerFilter, setPlayerFilter] = useState(searchParams.get('player') ?? '');
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
          setTitleDrafts(
            nextGames.reduce<Record<string, string>>((drafts, game) => {
              drafts[game.id] = game.title ?? '';
              return drafts;
            }, {}),
          );
          setWinConditionDrafts(
            nextGames.reduce<Record<string, string>>((drafts, game) => {
              drafts[game.id] = game.win_condition ?? '';
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
    setPlayerFilter(nextPlayerFilter);
  }, [searchParams]);

  const handleTitleDraftChange = (gameId: string, title: string) => {
    setTitleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: title,
    }));
  };

  const handleWinConditionDraftChange = (gameId: string, winCondition: string) => {
    setWinConditionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: winCondition,
    }));
  };

  const handleGameSave = async (gameId: string) => {
    try {
      setSavingGameId(gameId);
      setError(null);

      const nextTitle = titleDrafts[gameId]?.trim() || null;
      const nextWinCondition = winConditionDrafts[gameId]?.trim();
      if (!nextWinCondition) {
        throw new Error('Please choose a win condition before saving');
      }

      const { error: updateError } = await supabase
        .from('games')
        .update({ title: nextTitle, win_condition: nextWinCondition })
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
                title: nextTitle,
                win_condition: nextWinCondition,
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

  const filteredGames = playerFilter.trim()
    ? games.filter((game) =>
        game.game_participants.some((participant) => readSingleName(participant.player).toLowerCase().includes(playerFilter.trim().toLowerCase())),
      )
    : games;

  return (
    <section className='wireframe-shell space-y-4'>
      <div className='space-y-3 text-left'>
        <h1 className='wireframe-title'>Game History</h1>
        <div className='max-w-xl space-y-2'>
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
          <p className='text-lg font-semibold'>No games match that player</p>
          <p className='app-muted mt-2 text-sm'>Try a different player name, or clear the filter to see every saved game.</p>
        </div>
      )}

      {!isLoading && !error && filteredGames.length > 0 && (
        <div className='space-y-4'>
          {filteredGames.map((game) => (
            <article key={game.id} className='app-card text-left'>
              <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-3' style={{ borderColor: 'var(--app-panel-strong)' }}>
                <div className='min-w-0 flex-1 space-y-3'>
                  <p className='app-muted text-sm font-semibold uppercase tracking-[0.2em]'>Game #{game.gameNumber}</p>
                  <p className='text-2xl font-semibold md:text-3xl'>{formatPlayedAt(game.played_at)}</p>
                  {editingGameId === game.id ? (
                    <input
                      type='text'
                      value={titleDrafts[game.id] ?? ''}
                      onChange={(event) => handleTitleDraftChange(game.id, event.target.value)}
                      placeholder={`Game #${game.gameNumber} title`}
                      className='app-input-compact text-xl font-semibold md:text-2xl'
                    />
                  ) : (
                    <p className='text-xl font-semibold md:text-2xl'>{game.title?.trim() || `Untitled Game #${game.gameNumber}`}</p>
                  )}
                  <p className='app-muted text-base md:text-lg'>
                    {game.number_of_players} players · Bracket {game.bracket} · {game.win_condition}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => setEditingGameId((currentGameId) => currentGameId === game.id ? null : game.id)}
                    className='rounded-full border px-4 py-2 text-sm font-semibold'
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    {editingGameId === game.id ? 'Close edit' : 'Edit game'}
                  </button>
                  <div
                    className='app-chip border'
                    style={{
                      borderColor: game.game_participants.filter((participant) => participant.is_winner).length === 1 ? '#047857' : '#dc2626',
                      color: game.game_participants.filter((participant) => participant.is_winner).length === 1 ? '#047857' : '#dc2626',
                    }}
                  >
                    {game.game_participants.filter((participant) => participant.is_winner).length === 1 ? 'Winner locked in' : 'No winner assigned'}
                  </div>
                </div>
              </div>

              {editingGameId === game.id && (
                <div className='mt-4 flex flex-wrap items-center gap-2'>
                  <select
                    value={winConditionDrafts[game.id] ?? ''}
                    onChange={(event) => handleWinConditionDraftChange(game.id, event.target.value)}
                    className='app-input-compact min-w-[14rem] flex-1'
                  >
                    <option value=''>Select win condition</option>
                    {winConditionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type='button'
                    onClick={() => handleGameSave(game.id)}
                    disabled={savingGameId === game.id}
                    className='rounded-full border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    {savingGameId === game.id ? 'Saving...' : 'Save edits'}
                  </button>
                </div>
              )}

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
                            <p className='font-medium'>{readSingleName(participant.player)}</p>
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

                        <div className='space-y-1 min-w-0'>
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

              {game.notes && <p className='app-card-soft app-muted mt-4 px-3 py-2 text-sm'>{game.notes}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
