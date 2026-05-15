import { useDeferredValue, useEffect, useState } from 'react';
import { fetchPlayerDirectory, type PlayerDirectoryEntry } from '../lib/gameRecords';

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

function formatWinRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerDirectoryEntry[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue.trim().toLowerCase());

  useEffect(() => {
    let isMounted = true;

    async function loadPlayers() {
      try {
        setIsLoading(true);
        setError(null);

        const nextPlayers = await fetchPlayerDirectory();
        if (isMounted) {
          setPlayers(nextPlayers);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load players');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPlayers();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredPlayers = deferredSearchValue
    ? players.filter((player) => {
        const commanderNames = player.commanders.map((commander) => commander.name.toLowerCase()).join(' ');
        return player.name.toLowerCase().includes(deferredSearchValue) || commanderNames.includes(deferredSearchValue);
      })
    : players;

  const totalWins = players.reduce((sum, player) => sum + player.wins, 0);
  const totalCommanders = new Set(players.flatMap((player) => player.commanders.map((commander) => commander.name))).size;

  return (
    <section className='wireframe-shell space-y-6'>
      <div className='space-y-2 text-left'>
        <h1 className='wireframe-title'>Players</h1>
        <p className='wireframe-copy app-muted'>Search by player name or commander to jump straight to the people and decks showing up in your pods.</p>
      </div>

      <div className='grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'>
        <input
          type='text'
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder='Search players or commanders'
          className='app-input'
        />
        <div className='app-card'>
          <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Players</p>
          <p className='mt-2 text-3xl font-bold'>{players.length}</p>
          <p className='app-muted mt-2 text-sm'>Unique player tiles built from saved game history.</p>
        </div>
        <div className='app-card'>
          <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Decks Seen</p>
          <p className='mt-2 text-3xl font-bold'>{totalCommanders}</p>
          <p className='app-muted mt-2 text-sm'>{totalWins} total wins recorded across all players.</p>
        </div>
      </div>

      {isLoading && <p className='wireframe-copy'>Loading player directory...</p>}
      {error && <p className='wireframe-copy text-red-600'>{error}</p>}

      {!isLoading && !error && filteredPlayers.length === 0 && (
        <div className='app-card text-left'>
          <p className='text-lg font-semibold'>No player matches</p>
          <p className='app-muted mt-2 text-sm'>Try a different player name or one of the commander names from your saved games.</p>
        </div>
      )}

      {!isLoading && !error && filteredPlayers.length > 0 && (
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {filteredPlayers.map((player) => (
            <article key={player.id} className='player-tile app-card overflow-hidden text-left'>
              <div className='player-tile-art'>
                {player.commanders.slice(0, 3).map((commander, index) => (
                  <div key={`${player.id}-${commander.name}`} className={`player-tile-art-card card-${index + 1}`}>
                    {commander.imageUrl ? (
                      <img src={commander.imageUrl} alt={commander.name} className='player-tile-art-image' loading='lazy' />
                    ) : (
                      <span>{commander.name}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className='space-y-4'>
                <div className='space-y-1'>
                  <p className='app-muted text-xs font-bold uppercase tracking-[0.25em]'>Player Tile</p>
                  <h2 className='text-2xl font-semibold'>{player.name}</h2>
                  <p className='app-muted text-sm'>
                    Last seen in Game #{player.latestGameNumber} on {formatPlayedAt(player.latestPlayedAt)}
                  </p>
                </div>

                <div className='grid grid-cols-3 gap-3'>
                  <div className='app-card-soft px-3 py-3'>
                    <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Games</p>
                    <p className='mt-2 text-2xl font-bold'>{player.gamesPlayed}</p>
                  </div>
                  <div className='app-card-soft px-3 py-3'>
                    <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Wins</p>
                    <p className='mt-2 text-2xl font-bold'>{player.wins}</p>
                  </div>
                  <div className='app-card-soft px-3 py-3'>
                    <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Rate</p>
                    <p className='mt-2 text-2xl font-bold'>{formatWinRate(player.winRate)}</p>
                  </div>
                </div>

                <div className='space-y-2'>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-sm font-semibold'>Commanders Played</p>
                    <p className='app-muted text-sm'>{player.commanders.length} unique</p>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {player.commanders.map((commander) => (
                      <span key={`${player.id}-${commander.name}`} className='app-chip'>
                        {commander.name} · {commander.appearances}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
