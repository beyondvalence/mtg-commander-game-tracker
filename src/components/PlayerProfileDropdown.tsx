import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  createOrLinkPlayer,
  fetchProfilePlayerId,
  fetchPlayerById,
  type PlayerDirectoryEntry,
} from '../lib/gameRecords';
import { supabase } from '../lib/supabase';
import { DeckRoster } from './profile/DeckRoster';
import { PodManager } from './profile/PodManager';

type Tab = 'account' | 'decks' | 'pods';

export function PlayerProfileDropdown() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('account');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        className='profile-avatar-button'
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label='Open profile menu'
      >
        {initial}
      </button>

      {open && (
        <div className='profile-dropdown-panel app-card'>
          <div className='profile-dropdown-header'>
            <div className='profile-avatar-large' aria-hidden='true'>
              {initial}
            </div>
            <p className='min-w-0 truncate text-sm font-medium app-muted'>{user?.email}</p>
          </div>

          <div className='profile-dropdown-tabs'>
            {(['account', 'decks', 'pods'] as Tab[]).map((t) => (
              <button
                key={t}
                type='button'
                className={`profile-tab ${tab === t ? 'profile-tab-active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className='profile-dropdown-content'>
            {tab === 'account' && <AccountTab />}
            {tab === 'decks' && <DeckRoster />}
            {tab === 'pods' && <PodManager />}
          </div>

          <div className='profile-dropdown-footer'>
            <button
              type='button'
              className='logout-button w-full text-center'
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountTab() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [player, setPlayer] = useState<PlayerDirectoryEntry | null>(null);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setIsLoading(true);
        const playerId = await fetchProfilePlayerId();
        if (!isMounted) return;

        if (playerId) {
          const playerData = await fetchPlayerById(playerId);
          if (isMounted) setPlayer(playerData);
        } else {
          const { data } = await supabase.from('players').select('name').order('name');
          if (isMounted) setPlayerNames((data ?? []).map((p: { name: string }) => p.name));
        }
      } catch {
        // silent — not critical
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, []);

  async function handleSave() {
    const name = nameInput.trim();
    if (!name) return;
    try {
      setIsSaving(true);
      setError(null);
      const playerId = await createOrLinkPlayer(name);
      const linked = await fetchPlayerById(playerId);
      setPlayer(linked);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link player');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className='space-y-3'>
      <div>
        <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Email</p>
        <p className='mt-1 truncate text-sm'>{user?.email}</p>
      </div>

      {isLoading ? (
        <p className='app-muted text-sm'>Loading...</p>
      ) : player ? (
        <div>
          <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Linked Player</p>
          <p className='mt-1 text-sm font-semibold'>{player.name}</p>
          <p className='app-muted mt-0.5 text-xs'>{player.gamesPlayed} games · {Math.round(player.winRate * 100)}% win rate</p>
          <button
            type='button'
            className='app-muted mt-2 text-xs underline-offset-2 hover:underline'
            onClick={() => { setPlayer(null); setNameInput(''); }}
          >
            Change player
          </button>
        </div>
      ) : (
        <div className='space-y-2'>
          <p className='app-muted text-xs font-semibold uppercase tracking-[0.15em]'>Link Player Identity</p>
          <datalist id='account-player-names'>
            {playerNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          <input
            type='text'
            value={nameInput}
            list='account-player-names'
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder='Your player name'
            className='app-input-compact w-full'
          />
          {error && <p className='text-xs text-red-600'>{error}</p>}
          {success && <p className='text-xs text-green-600'>Linked!</p>}
          <button
            type='button'
            className='logout-button w-full text-sm'
            onClick={handleSave}
            disabled={!nameInput.trim() || isSaving}
          >
            {isSaving ? 'Saving...' : 'Link'}
          </button>
        </div>
      )}
    </div>
  );
}
