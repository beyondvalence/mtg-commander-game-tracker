import { useState } from 'react';
import { searchCommanders } from '../lib/scryfall';
export function CommanderAutocomplete({ onSelect }: { onSelect: (c: any) => void }) { const [q,setQ]=useState(''); const [items,setItems]=useState<any[]>([]); const [b,setB]=useState(false);
  return <div><input className='border p-2 w-full' value={q} onChange={async e=>{const v=e.target.value; setQ(v); if(v.length<2) return; const r=await searchCommanders(v); setItems(r.cards.slice(0,8)); setB(r.isBroadened);}} placeholder='Search commander'/>{b&&<p className='text-xs text-amber-600'>Broadened results</p>}<div className='border'>{items.map(i=><button type='button' key={i.scryfallId} className='block w-full text-left p-2' onClick={()=>onSelect(i)}>{i.name}</button>)}</div></div>;
}
