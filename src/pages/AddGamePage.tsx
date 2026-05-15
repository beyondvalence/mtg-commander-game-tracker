import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { CommanderAutocomplete } from '../components/CommanderAutocomplete';
import { supabase } from '../lib/supabase';
import type { CommanderCard, ParticipantInput } from '../types/app';

export default function AddGamePage() {
  const { register, handleSubmit, watch } = useForm();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);
  const [selectedCommander, setSelectedCommander] = useState<CommanderCard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playersCount = parseInt(watch('playersCount') || '4');

  const handleAddParticipant = (playerName: string) => {
    if (!selectedCommander || !playerName.trim()) {
      setError('Please enter a player name and select a commander');
      return;
    }

    const newParticipant: ParticipantInput = {
      seat: participants.length + 1,
      playerName,
      primary: selectedCommander,
    };

    setParticipants([...participants, newParticipant]);
    setSelectedCommander(null);
    setError(null);
  };

  const handleRemoveParticipant = (idx: number) => {
    setParticipants(participants.filter((_, i) => i !== idx));
  };

  const handleSaveGame = async (formData: any) => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to save a game');
      }

      if (participants.length === 0) {
        throw new Error('Please add at least one participant');
      }

      // Create game record
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .insert({
          user_id: user.id,
          played_at: formData.playedAt,
          number_of_players: parseInt(formData.playersCount),
          win_condition: formData.winCondition,
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // For each participant, ensure commander exists and create game_participant
      for (const participant of participants) {
        if (!participant.primary) {
          throw new Error(`Participant "${participant.playerName}" is missing a commander`);
        }

        // Ensure commander exists in database
        const { data: commanderData, error: commanderError } = await supabase
          .from('commanders')
          .upsert({
            user_id: user.id,
            scryfall_id: participant.primary.scryfallId,
            name: participant.primary.name,
            image_url: participant.primary.imageUrl,
            color_identity: participant.primary.colorIdentity || [],
            type_line: participant.primary.typeLine,
            oracle_text: participant.primary.oracleText,
          }, { onConflict: 'user_id,scryfall_id' })
          .select()
          .single();

        if (commanderError) throw commanderError;

        // Ensure player exists
        const { data: playerData, error: playerError } = await supabase
          .from('players')
          .upsert({
            user_id: user.id,
            name: participant.playerName,
          }, { onConflict: 'user_id,name' })
          .select()
          .single();

        if (playerError) throw playerError;

        // Create game_participant record
        const { error: participantError } = await supabase.from('game_participants').insert({
          user_id: user.id,
          game_id: gameData.id,
          player_id: playerData.id,
          primary_commander_id: commanderData.id,
          turn_order_position: participant.seat,
          is_winner: participant.isWinner || false,
        });

        if (participantError) throw participantError;
      }

      // Redirect to dashboard or game history
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className='wireframe-shell'>
      <form className='mx-auto flex w-full max-w-3xl flex-col items-center space-y-4 text-center' onSubmit={handleSubmit(handleSaveGame)}>
        <h1 className='wireframe-title'>Add Game</h1>

        <input type='date' className='w-full rounded-xl border border-zinc-500 bg-zinc-50 p-3 text-xl' {...register('playedAt', { required: true })} />

        <input
          type='number'
          defaultValue={4}
          min={2}
          className='w-full rounded-xl border border-zinc-500 bg-zinc-50 p-3 text-xl'
          {...register('playersCount', { required: true })}
        />

        <select className='w-full rounded-xl border border-zinc-500 bg-zinc-50 p-3 text-xl' {...register('winCondition', { required: true })}>
          <option value=''>Select win condition</option>
          <option value='Combat'>Combat</option>
          <option value='Combo'>Combo</option>
          <option value='Commander Damage'>Commander Damage</option>
          <option value='Other'>Other</option>
        </select>

        {/* Participant form */}
        <div className='w-full space-y-3 rounded-xl border border-zinc-300 bg-zinc-50 p-4'>
          <h2 className='text-lg font-semibold'>Add Participants ({participants.length}/{playersCount})</h2>

          <div className='space-y-2'>
            <input
              type='text'
              placeholder='Player name'
              className='w-full rounded-lg border border-zinc-500 bg-white p-2 text-lg'
              id='playerName'
            />

            <div className='w-full'>
              <CommanderAutocomplete onSelect={(c) => setSelectedCommander(c)} />
            </div>

            {selectedCommander && (
              <div className='rounded-lg bg-white p-2 text-sm text-left'>
                <strong>Selected:</strong> {selectedCommander.name}
              </div>
            )}

            <button
              type='button'
              className='w-full rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold'
              onClick={() => {
                const playerNameInput = document.getElementById('playerName') as HTMLInputElement;
                if (playerNameInput) {
                  handleAddParticipant(playerNameInput.value);
                  playerNameInput.value = '';
                }
              }}
            >
              Add Participant
            </button>
          </div>

          {error && <p className='text-red-600 text-sm'>{error}</p>}
        </div>

        {/* Display participants */}
        {participants.length > 0 && (
          <div className='w-full rounded-xl border border-zinc-500 p-4 text-left'>
            <p className='text-xl font-semibold mb-3'>Participants ({participants.length})</p>
            <ul className='space-y-2'>
              {participants.map((p, idx) => (
                <li key={idx} className='flex justify-between items-center p-2 bg-zinc-100 rounded-lg'>
                  <div>
                    <p className='font-semibold'>Seat {p.seat}: {p.playerName}</p>
                    <p className='text-sm text-zinc-600'>{p.primary?.name ?? 'No commander selected'}</p>
                  </div>
                  <button
                    type='button'
                    onClick={() => handleRemoveParticipant(idx)}
                    className='text-red-600 hover:text-red-800 font-semibold'
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type='submit'
          disabled={isLoading || participants.length === 0}
          className='rounded-full border border-zinc-500 bg-zinc-900 px-8 py-3 text-2xl text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {isLoading ? 'Saving...' : 'Save Game'}
        </button>
      </form>
    </section>
  );
}
