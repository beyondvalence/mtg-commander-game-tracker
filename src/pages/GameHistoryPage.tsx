import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchNumberedGames, readSingleCommander, readSingleName, type NumberedHistoryGame } from '../lib/gameRecords';

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export default function GameHistoryPage() {
  const [games, setGames] = useState<NumberedHistoryGame[]>([]);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [playerFilter, setPlayerFilter] = useState('');
  const [savingGameId, setSavingGameId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGames() {
      try {
        setIsLoading(true);
        setError(null);

        const nextGames = await fetchNumberedGames();
        if (isMounted) {
          setGames(nextGames);
          setTitleDrafts(
            nextGames.reduce<Record<string, string>>((drafts, game) => {
              drafts[game.id] = game.title ?? '';
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

  const handleTitleDraftChange = (gameId: string, title: string) => {
    setTitleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [gameId]: title,
    }));
  };

  const handleGameTitleSave = async (gameId: string) => {
    try {
      setSavingGameId(gameId);
      setError(null);

      const nextTitle = titleDrafts[gameId]?.trim() || null;
      const { error: updateError } = await supabase.from('games').update({ title: nextTitle }).eq('id', gameId);

      if (updateError) {
        throw updateError;
      }

      setGames((currentGames) =>
        currentGames.map((game) =>
          game.id === gameId
            ? {
                ...game,
                title: nextTitle,
              }
            : game,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game title');
    } finally {
      setSavingGameId(null);
    }
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
            onChange={(event) => setPlayerFilter(event.target.value)}
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
                  <div className='flex flex-wrap items-center gap-2'>
                    <input
                      type='text'
                      value={titleDrafts[game.id] ?? ''}
                      onChange={(event) => handleTitleDraftChange(game.id, event.target.value)}
                      placeholder={`Game #${game.gameNumber} title`}
                      className='app-input-compact min-w-[16rem] flex-1'
                    />
                    <button
                      type='button'
                      onClick={() => handleGameTitleSave(game.id)}
                      disabled={savingGameId === game.id || (titleDrafts[game.id] ?? '') === (game.title ?? '')}
                      className='rounded-full border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
                      style={{ borderColor: 'var(--app-border)' }}
                    >
                      {savingGameId === game.id ? 'Saving...' : 'Save title'}
                    </button>
                  </div>

                  <p className='app-muted text-sm font-semibold uppercase tracking-[0.2em]'>Game #{game.gameNumber}</p>
                  <p className='text-lg font-semibold'>{game.title?.trim() || `Untitled Game #${game.gameNumber}`}</p>
                  <p className='text-lg font-semibold'>{formatPlayedAt(game.played_at)}</p>
                  <p className='app-muted text-sm'>
                    {game.number_of_players} players · {game.win_condition}
                  </p>
                </div>
                <div className='app-chip'>
                  {game.game_participants.filter((participant) => participant.is_winner).length === 1 ? 'Winner locked in' : 'Winner missing'}
                </div>
              </div>

              <ul className='mt-4 grid gap-3 md:grid-cols-2'>
                {[...game.game_participants]
                  .sort((a, b) => a.turn_order_position - b.turn_order_position)
                  .map((participant) => {
                    const primaryCommander = readSingleCommander(participant.primary_commander);
                    const secondaryCommander = readSingleCommander(participant.secondary_commander);

                    return (
                      <li key={participant.id} className='history-player-card app-card-soft flex min-h-[12rem] items-stretch justify-between gap-4 overflow-hidden p-3'>
                        <div className='flex min-w-0 flex-1 flex-col justify-between gap-3'>
                          <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                              <p className='app-muted text-xs font-bold uppercase tracking-[0.25em]'>Seat {participant.turn_order_position}</p>
                              <p className='font-medium'>{readSingleName(participant.player)}</p>
                            </div>
                            {participant.is_winner && (
                              <span className='rounded-full border border-emerald-700 px-3 py-1 text-sm font-semibold text-emerald-700'>
                                Winner
                              </span>
                            )}
                          </div>

                          <div className='space-y-1 min-w-0'>
                            <p className='app-muted text-sm'>{readSingleName(participant.primary_commander)}</p>
                            {secondaryCommander && <p className='app-muted text-sm'>{secondaryCommander.name}</p>}
                          </div>
                        </div>

                        <div className={`history-commander-pair${secondaryCommander ? ' has-secondary' : ''}`}>
                          <div className='history-commander-frame'>
                            {primaryCommander?.image_url ? (
                              <img
                                src={primaryCommander.image_url}
                                alt={primaryCommander.name}
                                className='history-commander-thumb'
                                loading='lazy'
                              />
                            ) : (
                              <div className='history-commander-thumb placeholder'>No art</div>
                            )}
                          </div>

                          {secondaryCommander && (
                            <div className='history-commander-frame'>
                              {secondaryCommander.image_url ? (
                                <img
                                  src={secondaryCommander.image_url}
                                  alt={secondaryCommander.name}
                                  className='history-commander-thumb'
                                  loading='lazy'
                                />
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
