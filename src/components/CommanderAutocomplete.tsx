import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchBackgrounds, searchCommanders } from '../lib/scryfall';
import type { CommanderCard } from '../types/app';

type CommanderAutocompleteProps = {
  onSelect: (c: CommanderCard) => void;
  placeholder?: string;
  value?: string;
  searchMode?: 'commanders' | 'backgrounds';
  suggestedItems?: CommanderCard[];
};

function isBackgroundCard(card: CommanderCard) {
  return card.typeLine?.toLowerCase().includes('background') ?? false;
}

function isAllowedForMode(card: CommanderCard, searchMode: 'commanders' | 'backgrounds') {
  return searchMode === 'backgrounds' ? isBackgroundCard(card) : !isBackgroundCard(card);
}

export function CommanderAutocomplete({
  onSelect,
  placeholder = 'Search commander',
  value = '',
  searchMode = 'commanders',
  suggestedItems = [],
}: CommanderAutocompleteProps) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CommanderCard[]>([]);
  const [b, setB] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setQ(value);
  }, [value]);

  const filteredSuggestedItems = useMemo(() => {
    const normalizedQuery = q.trim().toLowerCase();

    return suggestedItems
      .filter((item) => isAllowedForMode(item, searchMode))
      .filter((item) => !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }, [q, searchMode, suggestedItems]);

  const visibleItems = useMemo(() => {
    const nextItems = [...filteredSuggestedItems];
    const seen = new Set(nextItems.map((item) => `${item.scryfallId}:${item.name}`));

    for (const item of items) {
      const key = `${item.scryfallId}:${item.name}`;
      if (seen.has(key)) {
        continue;
      }

      nextItems.push(item);
      seen.add(key);
    }

    return nextItems.slice(0, 8);
  }, [filteredSuggestedItems, items]);

  const hasSuggestions = filteredSuggestedItems.length > 0;
  const showResults = useMemo(() => isOpen && visibleItems.length > 0, [isOpen, visibleItems.length]);

  useEffect(() => {
    if (showResults && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [showResults]);

  const dropdown = showResults && dropdownRect
    ? createPortal(
        <div
          className='app-card z-50 max-h-72 overflow-auto shadow-xl'
          style={{ position: 'fixed', top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
        >
          {hasSuggestions && (
            <p className='app-muted px-2 pb-1 text-xs font-semibold uppercase tracking-[0.15em]'>
              Played by this player
            </p>
          )}
          {visibleItems.map((i, index) => (
            <button
              type='button'
              key={`${i.scryfallId}-${index}`}
              className='flex w-full items-center gap-2 rounded-lg p-2 text-left transition hover:bg-[var(--app-panel-soft)]'
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(i);
                setQ(i.name);
                setIsOpen(false);
              }}
            >
              {i.imageUrl ? <img src={i.imageUrl} alt={i.name} className='h-10 w-7 rounded object-cover' /> : null}
              <div className='min-w-0'>
                <span className='block truncate'>{i.name}</span>
                {index < filteredSuggestedItems.length && <span className='app-muted block text-xs'>From saved games</span>}
              </div>
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className='relative'>
      <input
        ref={inputRef}
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
            setIsOpen(true);
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
      {dropdown}
    </div>
  );
}
