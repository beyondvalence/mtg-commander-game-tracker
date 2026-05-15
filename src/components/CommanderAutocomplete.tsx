import { useEffect, useMemo, useState } from 'react';
import { searchBackgrounds, searchCommanders } from '../lib/scryfall';
import type { CommanderCard } from '../types/app';

type CommanderAutocompleteProps = {
  onSelect: (c: CommanderCard) => void;
  placeholder?: string;
  value?: string;
  searchMode?: 'commanders' | 'backgrounds';
};

export function CommanderAutocomplete({
  onSelect,
  placeholder = 'Search commander',
  value = '',
  searchMode = 'commanders',
}: CommanderAutocompleteProps) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CommanderCard[]>([]);
  const [b, setB] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQ(value);
  }, [value]);

  const showResults = useMemo(() => isOpen && items.length > 0, [isOpen, items.length]);

  return (
    <div className='relative'>
      <input
        className='app-input-compact'
        value={q}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 120)}
        onChange={async (e) => {
          const v = e.target.value;
          setQ(v);
          if (v.length < 2) {
            setItems([]);
            setB(false);
            return;
          }
          if (searchMode === 'backgrounds') {
            const cards = await searchBackgrounds(v);
            setItems(cards.slice(0, 8));
            setB(false);
          } else {
            const r = await searchCommanders(v);
            setItems(r.cards.slice(0, 8));
            setB(r.isBroadened);
          }
          setIsOpen(true);
        }}
        placeholder={placeholder}
      />
      {b && <p className='text-xs text-amber-600'>Broadened results</p>}

      {showResults && (
        <div className='app-card absolute z-20 mt-1 max-h-72 w-full overflow-auto shadow-xl'>
          {items.map((i) => (
            <button
              type='button'
              key={i.scryfallId}
              className='flex w-full items-center gap-2 rounded-lg p-2 text-left transition hover:bg-[var(--app-panel-soft)]'
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(i);
                setQ(i.name);
                setIsOpen(false);
              }}
            >
              {i.imageUrl ? <img src={i.imageUrl} alt={i.name} className='h-10 w-7 rounded object-cover' /> : null}
              <span>{i.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
