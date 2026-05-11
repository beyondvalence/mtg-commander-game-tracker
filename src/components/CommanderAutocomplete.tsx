import { useMemo, useState } from 'react';
import { searchCommanders } from '../lib/scryfall';

type CommanderCard = {
  scryfallId: string;
  name: string;
  imageUrl?: string;
  colorIdentity?: string[];
  typeLine?: string;
  oracleText?: string;
};

export function CommanderAutocomplete({ onSelect }: { onSelect: (c: CommanderCard) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CommanderCard[]>([]);
  const [b, setB] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const showResults = useMemo(() => isOpen && items.length > 0, [isOpen, items.length]);

  return (
    <div className='relative'>
      <input
        className='border p-2 w-full'
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
          const r = await searchCommanders(v);
          setItems(r.cards.slice(0, 8));
          setB(r.isBroadened);
          setIsOpen(true);
        }}
        placeholder='Search commander'
      />
      {b && <p className='text-xs text-amber-600'>Broadened results</p>}

      {showResults && (
        <div className='absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border bg-white shadow'>
          {items.map((i) => (
            <button
              type='button'
              key={i.scryfallId}
              className='flex w-full items-center gap-2 p-2 text-left hover:bg-slate-100'
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
