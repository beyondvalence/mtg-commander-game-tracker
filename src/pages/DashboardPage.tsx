import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDashboardSnapshot, readSingleName, type NumberedHistoryGame } from '../lib/gameRecords';
import { usePod } from '../contexts/PodContext';

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

function formatSeatOrder(game: NumberedHistoryGame) {
  return [...game.game_participants]
    .sort((left, right) => left.turn_order_position - right.turn_order_position)
    .map((participant) => readSingleName(participant.player))
    .join(' · ');
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { activePodId, activePod } = usePod();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activePodId) {
      setIsLoading(false);
      setSnapshot(null);
      return;
    }

    let isMounted = true;

    async function loadDashboard() {
      try {
        setIsLoading(true);
        setError(null);

        const nextSnapshot = await fetchDashboardSnapshot(activePodId!);
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
  }, [activePodId]);

  return (
    <section className='wireframe-shell'>
      <div className='space-y-6'>
        <div className='space-y-2'>
          <h1 className='wireframe-title'>Pod Highlights</h1>
          {activePod && <p className='app-muted text-sm'>{activePod.podName}</p>}
        </div>

        {!activePodId && <p className='wireframe-copy'>No pod selected. Create or join a pod to get started.</p>}
        {isLoading && activePodId && <p className='wireframe-copy'>Loading tracker summary...</p>}
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

              <Link to='/add-game' className='app-card dashboard-link-card dashboard-add-game-card dashboard-grid-add-game'>
                <div className='dashboard-add-game-row'>
                  <div className='dashboard-add-game-plus' aria-hidden='true'>
                    +
                  </div>
                  <p className='dashboard-add-game-label'>Add Game</p>
                </div>
              </Link>
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
                              <div className='dashboard-recent-game-details'>
                                <p className='dashboard-recent-game-meta'>
                                  <span className='font-semibold text-[color:var(--app-text)]'>Game #{game.gameNumber}</span>
                                  <span className='dashboard-recent-game-dash' aria-hidden='true'>
                                    -
                                  </span>
                                  <span>{formatPlayedAt(game.played_at)}</span>
                                  <span className='dashboard-recent-game-separator' aria-hidden='true' />
                                  <span>Bracket {game.bracket}</span>
                                  <span className='dashboard-recent-game-separator' aria-hidden='true' />
                                  <span>{game.win_condition}</span>
                                </p>
                                <p className='dashboard-recent-game-seat-order'>
                                  <span className='dashboard-recent-game-seat-label'>Seats</span>
                                  <span>{formatSeatOrder(game)}</span>
                                </p>
                              </div>
                            </div>
                            {winner ? (
                              <p className='dashboard-winner-badge dashboard-winner-badge-compact'>
                                Winner: {readSingleName(winner.player)}
                              </p>
                            ) : (
                              <p className='app-muted text-sm'>Winner not recorded</p>
                            )}
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
