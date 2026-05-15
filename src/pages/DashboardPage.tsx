import { useEffect, useState } from 'react';
import { fetchDashboardSnapshot, readSingleName, type NumberedHistoryGame } from '../lib/gameRecords';

type DashboardSnapshot = {
  totalGames: number;
  totalCommanders: number;
  latestGame: NumberedHistoryGame | null;
  recentGames: NumberedHistoryGame[];
};

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export default function DashboardPage() {
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
        <div className='space-y-2'>
          <h1 className='wireframe-title'>Dashboard</h1>
          <p className='wireframe-copy app-muted'>Your home page now reads live totals and recent results directly from Supabase.</p>
        </div>

        {isLoading && <p className='wireframe-copy'>Loading tracker summary...</p>}
        {error && <p className='wireframe-copy text-red-600'>{error}</p>}

        {!isLoading && !error && snapshot && (
          <>
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='app-card'>
                <p className='text-lg font-semibold'>Total Games</p>
                <p className='text-4xl font-bold'>{snapshot.totalGames}</p>
                <p className='app-muted mt-2 text-sm'>
                  {snapshot.totalGames > 0 ? `Latest entry is Game #${snapshot.latestGame?.gameNumber ?? snapshot.totalGames}.` : 'Your first saved game will appear here.'}
                </p>
              </div>

              <div className='app-card'>
                <p className='text-lg font-semibold'>Commanders</p>
                <p className='text-4xl font-bold'>{snapshot.totalCommanders}</p>
                <p className='app-muted mt-2 text-sm'>Unique commanders saved in your connected project.</p>
              </div>
            </div>

            {snapshot.latestGame && (
              <article className='app-card text-left'>
                <p className='app-muted text-sm font-semibold uppercase tracking-[0.2em]'>Latest Game</p>
                <div className='mt-2 flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <h2 className='text-2xl font-semibold'>Game #{snapshot.latestGame.gameNumber}</h2>
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
              </article>
            )}

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
                      <li key={game.id} className='app-card-soft px-4 py-3'>
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
