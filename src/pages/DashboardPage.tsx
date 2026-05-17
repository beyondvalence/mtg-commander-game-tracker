import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDashboardSnapshot, readSingleName, type NumberedHistoryGame } from '../lib/gameRecords';

type DashboardSnapshot = {
  totalGames: number;
  totalCommanders: number;
  totalPlayers: number;
  latestGame: NumberedHistoryGame | null;
  recentGames: NumberedHistoryGame[];
};

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        setIsLoading(true);
        setError(null);

        const nextSnapshot = await fetchDashboardSnapshot();
        if (isMounted) {
          setSnapshot(nextSnapshot);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const latestWinner = snapshot?.latestGame?.game_participants.find((participant) => participant.is_winner) ?? null;

  return (
    <section className='wireframe-shell'>
      <div className='space-y-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='space-y-2'>
            <h1 className='wireframe-title'>Pod Highlights</h1>
          </div>
          <Link to='/add-game' className='app-card dashboard-add-game-card dashboard-header-add-game'>
            <div className='dashboard-add-game-row'>
              <div className='dashboard-add-game-plus' aria-hidden='true'>
                +
              </div>
              <p className='dashboard-add-game-label'>Add Game</p>
            </div>
          </Link>
        </div>

        {isLoading && <p className='wireframe-copy'>Loading tracker summary...</p>}
        {error && <p className='wireframe-copy text-red-600'>{error}</p>}

        {!isLoading && !error && snapshot && (
          <>
            <div className='grid gap-4 md:grid-cols-4'>
              <Link to='/history' className='app-card dashboard-link-card'>
                <p className='dashboard-stat-label'>Total Games</p>
                <p className='dashboard-stat-value'>{snapshot.totalGames}</p>
              </Link>

              <Link to='/players' className='app-card dashboard-link-card'>
                <p className='dashboard-stat-label'>Players in Pod</p>
                <p className='dashboard-stat-value'>{snapshot.totalPlayers}</p>
              </Link>

              <Link to='/players' className='app-card dashboard-link-card'>
                <p className='dashboard-stat-label'>Commanders</p>
                <p className='dashboard-stat-value'>{snapshot.totalCommanders}</p>
              </Link>

              {snapshot.latestGame && (
                <Link
                  to={`/history?game=${encodeURIComponent(snapshot.latestGame.id)}`}
                  className='app-card dashboard-link-card dashboard-feature-card text-left'
                >
                  <p className='app-muted text-sm font-semibold uppercase tracking-[0.2em]'>Latest Game</p>
                  <div className='mt-2 flex flex-1 flex-wrap items-center justify-between gap-3'>
                    <div>
                      <h2 className='text-xl font-semibold'>Game #{snapshot.latestGame.gameNumber}</h2>
                      <p className='app-muted text-sm'>
                        {formatPlayedAt(snapshot.latestGame.played_at)} · {snapshot.latestGame.number_of_players} players · {snapshot.latestGame.win_condition}
                      </p>
                    </div>
                    {latestWinner && (
                      <div className='rounded-full border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-700'>
                        Winner: {readSingleName(latestWinner.player)}
                      </div>
                    )}
                  </div>
                </Link>
              )}
            </div>

            <div className='app-card text-left'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <h2 className='text-xl font-semibold'>Recent Games</h2>
                <p className='app-muted text-sm'>A quick tracker for your latest sessions.</p>
              </div>

              {snapshot.recentGames.length === 0 ? (
                <p className='app-muted mt-4 text-sm'>No games saved yet. Add a game to start the tracker.</p>
              ) : (
                <ul className='mt-4 space-y-3'>
                  {snapshot.recentGames.map((game) => {
                    const winner = game.game_participants.find((participant) => participant.is_winner) ?? null;

                    return (
                      <li key={game.id}>
                        <button
                          type='button'
                          className='app-card-soft dashboard-recent-game w-full px-4 py-3 text-left transition'
                          onClick={() => navigate(`/history?game=${encodeURIComponent(game.id)}`)}
                        >
                          <div className='flex flex-wrap items-center justify-between gap-3'>
                            <div>
                              <p className='font-semibold'>Game #{game.gameNumber}</p>
                              <p className='app-muted text-sm'>
                                {formatPlayedAt(game.played_at)} · {game.win_condition}
                              </p>
                            </div>
                            <p className='app-muted text-sm'>
                              {winner ? `Winner: ${readSingleName(winner.player)}` : 'Winner not recorded'}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
