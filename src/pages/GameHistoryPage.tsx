import { useEffect, useState } from 'react';
import { fetchNumberedGames, readSingleName, type NumberedHistoryGame } from '../lib/gameRecords';

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export default function GameHistoryPage() {
  const [games, setGames] = useState<NumberedHistoryGame[]>([]);
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

  return (
    <section className='wireframe-shell space-y-4'>
      <div className='space-y-1 text-left'>
        <h1 className='wireframe-title'>Game History</h1>
        <p className='wireframe-copy app-muted'>Every saved game is numbered from oldest to newest, then listed here with its players and winner.</p>
      </div>

      {isLoading && <p className='wireframe-copy'>Loading games...</p>}
      {error && <p className='wireframe-copy text-red-600'>{error}</p>}

      {!isLoading && !error && games.length === 0 && (
        <p className='wireframe-copy'>No games saved yet. Add a game to start building your history.</p>
      )}

      {!isLoading && !error && games.length > 0 && (
        <div className='space-y-4'>
          {games.map((game) => (
            <article key={game.id} className='app-card text-left'>
              <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-3' style={{ borderColor: 'var(--app-panel-strong)' }}>
                <div>
                  <p className='app-muted text-sm font-semibold uppercase tracking-[0.2em]'>Game #{game.gameNumber}</p>
                  <p className='text-lg font-semibold'>{formatPlayedAt(game.played_at)}</p>
                  <p className='app-muted text-sm'>
                    {game.number_of_players} players · {game.win_condition}
                  </p>
                </div>
                <div className='app-chip'>
                  {game.game_participants.filter((participant) => participant.is_winner).length === 1 ? 'Winner locked in' : 'Winner missing'}
                </div>
              </div>

              <ul className='mt-4 space-y-2'>
                {[...game.game_participants]
                  .sort((a, b) => a.turn_order_position - b.turn_order_position)
                  .map((participant) => (
                    <li key={participant.id} className='app-card-soft flex items-center justify-between px-3 py-2'>
                      <div>
                        <p className='font-medium'>
                          Seat {participant.turn_order_position}: {readSingleName(participant.player)}
                        </p>
                        <p className='app-muted text-sm'>{readSingleName(participant.primary_commander)}</p>
                      </div>
                      {participant.is_winner && (
                        <span className='rounded-full border border-emerald-700 px-3 py-1 text-sm font-semibold text-emerald-700'>
                          Winner
                        </span>
                      )}
                    </li>
                  ))}
              </ul>

              {game.notes && <p className='app-card-soft app-muted mt-4 px-3 py-2 text-sm'>{game.notes}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
