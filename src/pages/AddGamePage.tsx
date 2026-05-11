import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CommanderAutocomplete } from '../components/CommanderAutocomplete';
export default function AddGamePage(){ const {register,handleSubmit}=useForm(); const [picked,setPicked]=useState<any[]>([]);
return <form className='space-y-3' onSubmit={handleSubmit((v)=>console.log(v,picked))}><input type='date' className='border p-2' {...register('playedAt')} /><input type='number' defaultValue={4} min={2} className='border p-2' {...register('playersCount')} /><select className='border p-2' {...register('winCondition')}><option>Combat</option><option>Combo</option><option>Commander Damage</option><option>Other</option></select><CommanderAutocomplete onSelect={(c)=>setPicked([...picked,c])}/><button className='bg-blue-600 text-white px-4 py-2 sticky bottom-3'>Save Game</button></form>}
