import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchPlayerDirectory, type PlayerDirectoryEntry, type PlayerPageSummary } from '../lib/gameRecords';
import { getScryfallSearchUrl } from '../lib/scryfall';
import { usePod } from '../contexts/PodContext';

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

function formatWinRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

const EMPTY_PLAYER_SUMMARY: PlayerPageSummary = {
  totalPlayers: 0,
  totalWins: 0,
  totalCommanders: 0,
  mostGamesPlayer: null,
  highestWinRatePlayer: null,
  mostPopularCommander: null,
  highestCommanderWinRate: null,
};

function computeSummary(players: PlayerDirectoryEntry[]): PlayerPageSummary {
  const commanderMap = new Map<string, number>();
  for (const player of players) {
    for (const commander of player.commanders) {
      commanderMap.set(commander.name, (commanderMap.get(commander.name) ?? 0) + commander.appearances);
    }
  }

  let mostPopularCommander: PlayerPageSummary['mostPopularCommander'] = null;
  for (const [name, appearances] of commanderMap) {
    if (!mostPopularCommander || appearances > mostPopularCommander.appearances) {
      mostPopularCommander = { name, appearances };
    }
  }

  const mostGames = players.reduce<PlayerDirectoryEntry | null>(
    (best, p) => (!best || p.gamesPlayed > best.gamesPlayed ? p : best), null
  );
  const highestWinRate = players.filter((p) => p.gamesPlayed > 0).reduce<PlayerDirectoryEntry | null>(
    (best, p) => (!best || p.winRate > best.winRate || (p.winRate === best.winRate && p.wins > best.wins) ? p : best), null
  );

  return {
    totalPlayers: players.length,
    totalWins: players.reduce((sum, p) => sum + p.wins, 0),
    totalCommanders: commanderMap.size,
    mostGamesPlayer: mostGames ? { name: mostGames.displayName, gamesPlayed: mostGames.gamesPlayed } : null,
    highestWinRatePlayer: highestWinRate
      ? { name: highestWinRate.displayName, gamesPlayed: highestWinRate.gamesPlayed, wins: highestWinRate.wins, winRate: highestWinRate.winRate }
      : null,
    mostPopularCommander,
    highestCommanderWinRate: null,
  };
}

export default function PlayersPage() {
  const navigate = useNavigate();
  const { activePodId } = usePod();
  const [searchParams, setSearchParams] = useSearchParams();
  const [players, setPlayers] = useState<PlayerDirectoryEntry[]>([]);
  const [searchValue, setSearchValue] = useState(searchParams.get('player') ?? '');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue.trim());
  const summary = useMemo(() => computeSummary(players), [players]);

  useEffect(() => {
    setSearchValue(searchParams.get('player') ?? '');
  }, [searchParams]);

  const handleSearchChange = (value: string) => {
    setSearchValue(value);

    const nextParams = new URLSearchParams(searchParams);
    if (value.trim()) {
      nextParams.set('player', value);
    } else {
      nextParams.delete('player');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const clearSearchFilter = () => {
    setSearchValue('');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('player');
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (!activePodId) {
      setIsLoading(false);
      setPlayers([]);
      return;
    }

    let isMounted = true;

    async function loadPlayers() {
      try {
        setIsLoading(true);
        setError(null);

        const nextPlayers = await fetchPlayerDirectory(activePodId!);
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
  }, [activePodId]);

  const filteredPlayers = deferredSearchValue
    ? players.filter((player) => {
        const needle = deferredSearchValue.toLowerCase();
        const commanderNames = player.commanders.map((commander) => commander.name).join(' ').toLowerCase();
        return player.displayName.toLowerCase().includes(needle) || commanderNames.includes(needle);
      })
    : players;

  return (
    <section className='wireframe-shell space-y-6'>
      <div className='text-left'>
        <h1 className='wireframe-title'>Pod Stats</h1>
      </div>

      <div className='space-y-4'>
        <div className='flex gap-3 overflow-x-auto pb-1'>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Players in Pod</p>
            <p className='mt-2 text-3xl font-bold'>{summary.totalPlayers}</p>
            <p className='app-muted mt-2 text-sm'>Unique player tiles built from saved game history.</p>
          </div>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Decks Seen</p>
            <p className='mt-2 text-3xl font-bold'>{summary.totalCommanders}</p>
            <p className='app-muted mt-2 text-sm'>{summary.totalWins} total wins recorded across all players.</p>
          </div>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Most Played Commander</p>
            <p className='mt-2 text-2xl font-bold'>{summary.mostPopularCommander?.name ?? 'No commanders yet'}</p>
            <p className='app-muted mt-2 text-sm'>
              {summary.mostPopularCommander ? `${summary.mostPopularCommander.appearances} appearances` : 'Play a game to populate this card.'}
            </p>
          </div>
        </div>

        <div className='flex gap-3 overflow-x-auto pb-1'>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Most Games</p>
            <p className='mt-2 text-2xl font-bold'>{summary.mostGamesPlayer?.name ?? 'No players yet'}</p>
            <p className='app-muted mt-2 text-sm'>
              {summary.mostGamesPlayer ? `${summary.mostGamesPlayer.gamesPlayed} games played` : 'Play a game to populate this card.'}
            </p>
          </div>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Highest Win Rate</p>
            <p className='mt-2 text-2xl font-bold'>{summary.highestWinRatePlayer?.name ?? 'No players yet'}</p>
            <p className='app-muted mt-2 text-sm'>
              {summary.highestWinRatePlayer
                ? `${formatWinRate(summary.highestWinRatePlayer.winRate)} over ${summary.highestWinRatePlayer.gamesPlayed} games`
                : 'Play a game to populate this card.'}
            </p>
          </div>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Best Commander Win Rate</p>
            <p className='mt-2 text-2xl font-bold'>{summary.highestCommanderWinRate?.name ?? 'No commanders yet'}</p>
            <p className='app-muted mt-2 text-sm'>
              {summary.highestCommanderWinRate
                ? `${formatWinRate(summary.highestCommanderWinRate.winRate)} over ${summary.highestCommanderWinRate.appearances} games`
                : 'Play a game to populate this card.'}
            </p>
          </div>
        </div>
      </div>

      <div className='player-search-bar'>
        <p className='player-search-copy'>Filter</p>
        <input
          type='text'
          value={searchValue}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder='Search players or commanders'
          className='app-input h-12 min-w-0 flex-1 px-4 py-2 text-base'
        />
        {searchValue.trim() && (
          <button
            type='button'
            onClick={clearSearchFilter}
            className='player-search-clear'
            aria-label='Clear player filter'
          >
            X
          </button>
        )}
      </div>

      {isLoading && <p className='app-muted text-sm' role='status'>Loading player directory...</p>}
      {error && <p className='text-sm app-error-text'>{error}</p>}

      {!isLoading && !error && filteredPlayers.length === 0 && (
        <div className='app-card text-left'>
          <p className='text-lg font-semibold'>No player matches</p>
          <p className='app-muted mt-2 text-sm'>Try a different player name or one of the commander names from your saved games.</p>
        </div>
      )}

      {!isLoading && !error && filteredPlayers.length > 0 && (
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'>
          {filteredPlayers.map((player) => (
            <article key={player.id} className='player-tile app-card overflow-hidden text-left'>
              <div className='player-tile-art'>
                {player.commanders.slice(0, 3).map((commander, index) => (
                  <div key={`${player.id}-${commander.name}`} className={`player-tile-art-card card-${index + 1}`}>
                    {commander.imageUrl ? (
                      <a href={getScryfallSearchUrl(commander.name)} target='_blank' rel='noreferrer' className='block h-full w-full'>
                        <img src={commander.imageUrl} alt={commander.name} className='player-tile-art-image' loading='lazy' />
                      </a>
                    ) : (
                      <a href={getScryfallSearchUrl(commander.name)} target='_blank' rel='noreferrer'>
                        <span>{commander.name}</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <div className='space-y-4'>
                <div className='space-y-1'>
                  <button
                    type='button'
                    onClick={() => navigate(`/history?player=${encodeURIComponent(player.displayName)}`)}
                    className='text-left text-2xl font-semibold transition hover:opacity-75'
                  >
                    {player.displayName}
                  </button>
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
                      <a
                        key={`${player.id}-${commander.name}`}
                        href={getScryfallSearchUrl(commander.name)}
                        target='_blank'
                        rel='noreferrer'
                        className='app-chip underline-offset-2 hover:underline'
                      >
                        {commander.name} · {commander.appearances}
                      </a>
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
