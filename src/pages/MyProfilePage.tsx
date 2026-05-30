import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createOrLinkPlayer,
  fetchPlayerById,
  fetchPlayerRecentGames,
  fetchProfilePlayerId,
  readSingleName,
  type PlayerDirectoryEntry,
  type NumberedHistoryGame,
} from '../lib/gameRecords';
import { supabase } from '../lib/supabase';
import { getScryfallSearchUrl } from '../lib/scryfall';

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`),
  );
}

function formatWinRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatSeatOrder(game: NumberedHistoryGame) {
  return [...game.game_participants]
    .sort((a, b) => a.turn_order_position - b.turn_order_position)
    .map((p) => readSingleName(p.player))
    .join(' · ');
}

export default function MyProfilePage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profilePlayerId, setProfilePlayerId] = useState<string | null | undefined>(undefined);
  const [player, setPlayer] = useState<PlayerDirectoryEntry | null>(null);
  const [recentGames, setRecentGames] = useState<NumberedHistoryGame[]>([]);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const playerId = await fetchProfilePlayerId();
        if (!isMounted) return;

        if (playerId) {
          const [playerData, games] = await Promise.all([
            fetchPlayerById(playerId),
            fetchPlayerRecentGames(playerId, 3),
          ]);
          if (isMounted) {
            setProfilePlayerId(playerId);
            setPlayer(playerData);
            setRecentGames(games);
          }
        } else {
          const { data } = await supabase.from('players').select('display_name').order('display_name');
          if (isMounted) {
            setProfilePlayerId(null);
            setPlayerNames((data ?? []).map((p: { display_name: string }) => p.display_name));
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if ((profilePlayerId === null || isChanging) && !isLoading) {
      nameInputRef.current?.focus();
    }
  }, [profilePlayerId, isChanging, isLoading]);

  const handleLinkPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    try {
      setIsSaving(true);
      setError(null);
      const playerId = await createOrLinkPlayer(trimmed);
      const [playerData, games] = await Promise.all([
        fetchPlayerById(playerId),
        fetchPlayerRecentGames(playerId, 3),
      ]);
      setProfilePlayerId(playerId);
      setPlayer(playerData);
      setRecentGames(games);
      setIsChanging(false);
      setNameInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link player');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartChange = () => {
    setNameInput(player?.displayName ?? '');
    setIsChanging(true);
  };

  const handleCancelChange = () => {
    setIsChanging(false);
    setNameInput('');
  };

  const showNameForm = !isLoading && !error && (profilePlayerId === null || isChanging);
  const showProfile = !isLoading && !error && player && !isChanging;

  return (
    <section className='wireframe-shell space-y-6'>
      {isLoading && <p className='wireframe-copy'>Loading profile...</p>}
      {error && <p className='wireframe-copy text-red-600'>{error}</p>}

      {showNameForm && (
        <div>
          <h1 className='wireframe-title'>My Profile</h1>
          {!isChanging && (
            <p className='mt-2 text-sm text-amber-600'>
              Display name not set — you won't appear as a player option when adding games to your pod.
            </p>
          )}
          <p className='app-muted mt-2 text-sm'>
            {isChanging
              ? 'Enter a different display name to change your player identity.'
              : 'Enter your display name to set up your profile.'}
          </p>

          <form onSubmit={handleLinkPlayer} className='mt-6 flex max-w-md flex-col gap-3'>
            <datalist id='me-player-name-suggestions'>
              {playerNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            <input
              ref={nameInputRef}
              type='text'
              list='me-player-name-suggestions'
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder='Your display name'
              autoComplete='off'
              disabled={isSaving}
              className='app-input h-14 text-base md:text-lg'
            />

            <div className='flex gap-3'>
              <button
                type='submit'
                disabled={isSaving || !nameInput.trim()}
                className='dashboard-add-game-card dashboard-save-button disabled:cursor-not-allowed disabled:opacity-50'
              >
                {isSaving ? 'Saving...' : 'Confirm'}
              </button>
              {isChanging && (
                <button
                  type='button'
                  onClick={handleCancelChange}
                  className='rounded-full border px-5 py-2 text-base font-medium transition hover:opacity-75 app-muted'
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {showProfile && player && (
        <>
          <div>
            <h1 className='wireframe-title'>{player.displayName}</h1>
            <button
              type='button'
              onClick={handleStartChange}
              className='app-muted mt-1 text-sm underline underline-offset-2 transition hover:opacity-75'
            >
              Change
            </button>
          </div>

          <div className='flex gap-3'>
            <div className='app-card-soft px-4 py-3'>
              <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Games</p>
              <p className='mt-2 text-2xl font-bold'>{player.gamesPlayed}</p>
            </div>
            <div className='app-card-soft px-4 py-3'>
              <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Wins</p>
              <p className='mt-2 text-2xl font-bold'>{player.wins}</p>
            </div>
            <div className='app-card-soft px-4 py-3'>
              <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Win Rate</p>
              <p className='mt-2 text-2xl font-bold'>{formatWinRate(player.winRate)}</p>
            </div>
          </div>

          <div className='app-card text-left'>
            <h2 className='text-xl font-semibold'>Recent Games</h2>
            {recentGames.length === 0 ? (
              <p className='app-muted mt-4 text-sm'>No games recorded yet.</p>
            ) : (
              <ul className='mt-4 space-y-3'>
                {recentGames.map((game) => {
                  const winner = game.game_participants.find((p) => p.is_winner) ?? null;
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
                                <span className='font-semibold text-[color:var(--app-text)]'>
                                  Game #{game.gameNumber}
                                </span>
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

          {player.commanders.length > 0 && (
            <div className='app-card text-left'>
              <div className='flex items-center justify-between gap-3'>
                <h2 className='text-xl font-semibold'>Commanders</h2>
                <p className='app-muted text-sm'>{player.commanders.length} unique</p>
              </div>
              <div className='mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                {player.commanders.map((commander) => (
                  <a
                    key={commander.name}
                    href={getScryfallSearchUrl(commander.name)}
                    target='_blank'
                    rel='noreferrer'
                    className='app-card-soft overflow-hidden rounded-xl text-left transition hover:opacity-75'
                  >
                    {commander.imageUrl && (
                      <img
                        src={commander.imageUrl}
                        alt={commander.name}
                        className='w-full object-cover'
                        loading='lazy'
                      />
                    )}
                    <div className='px-3 py-2'>
                      <p className='text-sm font-semibold'>{commander.name}</p>
                      <p className='app-muted text-xs'>{commander.appearances} appearances</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
