import { useEffect, useState } from 'react';
import { CommanderAutocomplete } from '../CommanderAutocomplete';
import { addUserCommander, getUserCommanders, removeUserCommander, type UserCommander } from '../../lib/userCommanderRecords';
import { getScryfallSearchUrl } from '../../lib/scryfall';
import type { CommanderCard } from '../../types/app';

export function DeckRoster() {
  const [commanders, setCommanders] = useState<UserCommander[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CommanderCard | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    try {
      setIsLoading(true);
      setError(null);
      setCommanders(await getUserCommanders());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deck roster');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!selected) return;
    try {
      setIsSaving(true);
      setError(null);
      await addUserCommander({
        scryfallId: selected.scryfallId ?? null,
        name: selected.name,
        imageUrl: selected.imageUrl ?? null,
        colorIdentity: selected.colorIdentity ?? [],
      });
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add commander');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      setError(null);
      await removeUserCommander(id);
      setCommanders((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove commander');
    }
  }

  return (
    <div className='space-y-3'>
      <div className='flex gap-2'>
        <div className='flex-1 min-w-0'>
          <CommanderAutocomplete
            onSelect={setSelected}
            placeholder='Search commander to add'
            value={selected?.name ?? ''}
          />
        </div>
        <button
          type='button'
          className='logout-button shrink-0 px-3 py-1.5 text-sm'
          onClick={handleAdd}
          disabled={!selected || isSaving}
        >
          {isSaving ? '...' : 'Add'}
        </button>
      </div>

      {error && <p className='text-xs text-red-600'>{error}</p>}
      {isLoading && <p className='app-muted text-sm'>Loading...</p>}

      {!isLoading && commanders.length === 0 && (
        <p className='app-muted text-sm'>No commanders yet. Add one above or play games.</p>
      )}

      <div className='max-h-64 space-y-1.5 overflow-y-auto'>
        {commanders.map((cmd) => (
          <div key={cmd.id} className='flex items-center gap-2 rounded-xl px-2 py-1.5' style={{ background: 'var(--app-panel-soft)' }}>
            {cmd.imageUrl && (
              <img src={cmd.imageUrl} alt={cmd.name} className='h-9 w-6 shrink-0 rounded object-cover' />
            )}
            <a
              href={getScryfallSearchUrl(cmd.name)}
              target='_blank'
              rel='noreferrer'
              className='min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline'
            >
              {cmd.name}
            </a>
            <button
              type='button'
              className='app-muted shrink-0 text-xs transition hover:text-red-500'
              onClick={() => handleRemove(cmd.id)}
              aria-label={`Remove ${cmd.name}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
