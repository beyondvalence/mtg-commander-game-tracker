import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CommanderAutocomplete } from '../components/CommanderAutocomplete';

export default function AddGamePage() {
  const { register, handleSubmit } = useForm();
  const [picked, setPicked] = useState<any[]>([]);

  return (
    <section className='wireframe-shell'>
      <form className='mx-auto flex w-full max-w-3xl flex-col items-center space-y-4 text-center' onSubmit={handleSubmit((v) => console.log(v, picked))}>
        <h1 className='wireframe-title'>Add Game</h1>
        <input type='date' className='w-full rounded-xl border border-zinc-500 bg-zinc-50 p-3 text-xl' {...register('playedAt')} />
        <input type='number' defaultValue={4} min={2} className='w-full rounded-xl border border-zinc-500 bg-zinc-50 p-3 text-xl' {...register('playersCount')} />
        <select className='w-full rounded-xl border border-zinc-500 bg-zinc-50 p-3 text-xl' {...register('winCondition')}>
          <option>Combat</option>
          <option>Combo</option>
          <option>Commander Damage</option>
          <option>Other</option>
        </select>

        <div className='w-full'>
          <CommanderAutocomplete onSelect={(c) => setPicked((prev) => [...prev, c])} />
        </div>

        {picked.length > 0 ? (
          <div className='w-full rounded-xl border border-zinc-500 p-4 text-left'>
            <p className='text-xl font-semibold'>Selected commanders</p>
            <ul className='list-inside list-disc text-lg'>
              {picked.map((c, idx) => (
                <li key={`${c.scryfallId}-${idx}`}>{c.name}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button className='rounded-full border border-zinc-500 bg-zinc-900 px-8 py-3 text-2xl text-zinc-100'>Save Game</button>
      </form>
    </section>
  );
}
