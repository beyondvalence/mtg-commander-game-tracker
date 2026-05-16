import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNumberedGames, fetchPlayerDirectory, readSingleCommander, type NumberedHistoryGame, type PlayerDirectoryEntry } from '../lib/gameRecords';
import { getScryfallSearchUrl } from '../lib/scryfall';

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

function formatWinRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function PlayersPage() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerDirectoryEntry[]>([]);
  const [games, setGames] = useState<NumberedHistoryGame[]>([]);
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

        const [nextPlayers, nextGames] = await Promise.all([
          fetchPlayerDirectory(),
          fetchNumberedGames(),
        ]);
        if (isMounted) {
          setPlayers(nextPlayers);
          setGames(nextGames);
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
  const mostGamesPlayer = players.reduce<PlayerDirectoryEntry | null>((leader, player) => {
    if (!leader || player.gamesPlayed > leader.gamesPlayed) {
      return player;
    }

    if (player.gamesPlayed === leader.gamesPlayed && player.name.localeCompare(leader.name) < 0) {
      return player;
    }

    return leader;
  }, null);
  const commanderTotals = new Map<string, { name: string; appearances: number }>();
  for (const player of players) {
    for (const commander of player.commanders) {
      const existing = commanderTotals.get(commander.name);
      if (existing) {
        existing.appearances += commander.appearances;
      } else {
        commanderTotals.set(commander.name, { name: commander.name, appearances: commander.appearances });
      }
    }
  }
  const mostPopularCommander = [...commanderTotals.values()].reduce<{ name: string; appearances: number } | null>((leader, commander) => {
    if (!leader || commander.appearances > leader.appearances) {
      return commander;
    }

    if (commander.appearances === leader.appearances && commander.name.localeCompare(leader.name) < 0) {
      return commander;
    }

    return leader;
  }, null);
  const highestWinRatePlayer = players.reduce<PlayerDirectoryEntry | null>((leader, player) => {
    if (!leader || player.winRate > leader.winRate) {
      return player;
    }

    if (player.winRate === leader.winRate && player.wins > leader.wins) {
      return player;
    }

    if (player.winRate === leader.winRate && player.wins === leader.wins && player.name.localeCompare(leader.name) < 0) {
      return player;
    }

    return leader;
  }, null);
  const commanderPerformanceTotals = new Map<string, { name: string; wins: number; appearances: number }>();
  for (const game of games) {
    for (const participant of game.game_participants) {
      const primaryCommander = readSingleCommander(participant.primary_commander);
      const secondaryCommander = readSingleCommander(participant.secondary_commander);

      for (const commander of [primaryCommander, secondaryCommander]) {
        if (!commander) {
          continue;
        }

        const existing = commanderPerformanceTotals.get(commander.name);
        if (existing) {
          existing.appearances += 1;
          existing.wins += participant.is_winner ? 1 : 0;
        } else {
          commanderPerformanceTotals.set(commander.name, {
            name: commander.name,
            appearances: 1,
            wins: participant.is_winner ? 1 : 0,
          });
        }
      }
    }
  }
  const highestCommanderWinRate = [...commanderPerformanceTotals.values()].reduce<{ name: string; wins: number; appearances: number } | null>((leader, commander) => {
    const commanderRate = commander.appearances > 0 ? commander.wins / commander.appearances : 0;
    const leaderRate = leader && leader.appearances > 0 ? leader.wins / leader.appearances : -1;

    if (!leader || commanderRate > leaderRate) {
      return commander;
    }

    if (commanderRate === leaderRate && commander.wins > leader.wins) {
      return commander;
    }

    if (commanderRate === leaderRate && commander.wins === leader.wins && commander.name.localeCompare(leader.name) < 0) {
      return commander;
    }

    return leader;
  }, null);

  return (
    <section className='wireframe-shell space-y-6'>
      <div className='text-left'>
        <h1 className='wireframe-title'>Players</h1>
      </div>

      <div className='space-y-4'>
        <div className='flex gap-3 overflow-x-auto pb-1'>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Players in Pod</p>
            <p className='mt-2 text-3xl font-bold'>{players.length}</p>
            <p className='app-muted mt-2 text-sm'>Unique player tiles built from saved game history.</p>
          </div>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Decks Seen</p>
            <p className='mt-2 text-3xl font-bold'>{totalCommanders}</p>
            <p className='app-muted mt-2 text-sm'>{totalWins} total wins recorded across all players.</p>
          </div>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Most Played Commander</p>
            <p className='mt-2 text-2xl font-bold'>{mostPopularCommander?.name ?? 'No commanders yet'}</p>
            <p className='app-muted mt-2 text-sm'>
              {mostPopularCommander ? `${mostPopularCommander.appearances} appearances` : 'Play a game to populate this card.'}
            </p>
          </div>
        </div>

        <div className='flex gap-3 overflow-x-auto pb-1'>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Most Games</p>
            <p className='mt-2 text-2xl font-bold'>{mostGamesPlayer?.name ?? 'No players yet'}</p>
            <p className='app-muted mt-2 text-sm'>
              {mostGamesPlayer ? `${mostGamesPlayer.gamesPlayed} games played` : 'Play a game to populate this card.'}
            </p>
          </div>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Highest Win Rate</p>
            <p className='mt-2 text-2xl font-bold'>{highestWinRatePlayer?.name ?? 'No players yet'}</p>
            <p className='app-muted mt-2 text-sm'>
              {highestWinRatePlayer ? `${formatWinRate(highestWinRatePlayer.winRate)} over ${highestWinRatePlayer.gamesPlayed} games` : 'Play a game to populate this card.'}
            </p>
          </div>
          <div className='app-card min-w-[13rem] flex-1 px-3 py-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.2em] app-muted'>Best Commander Win Rate</p>
            <p className='mt-2 text-2xl font-bold'>{highestCommanderWinRate?.name ?? 'No commanders yet'}</p>
            <p className='app-muted mt-2 text-sm'>
              {highestCommanderWinRate
                ? `${formatWinRate(highestCommanderWinRate.wins / highestCommanderWinRate.appearances)} over ${highestCommanderWinRate.appearances} games`
                : 'Play a game to populate this card.'}
            </p>
          </div>
        </div>
      </div>

      <div className='max-w-xl'>
        <input
          type='text'
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder='Search players or commanders'
          className='app-input h-12 px-4 py-2 text-base'
        />
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
                    onClick={() => navigate(`/history?player=${encodeURIComponent(player.name)}`)}
                    className='text-left text-2xl font-semibold transition hover:opacity-75'
                  >
                    {player.name}
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
