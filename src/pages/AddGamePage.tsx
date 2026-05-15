import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { CommanderAutocomplete } from '../components/CommanderAutocomplete';
import { supabase } from '../lib/supabase';
import type { CommanderCard, ParticipantInput } from '../types/app';

type AddGameFormValues = {
  playedAt: string;
  playersCount: string;
  winCondition: string;
};

export default function AddGamePage() {
  const { register, handleSubmit, watch } = useForm<AddGameFormValues>({
    defaultValues: {
      playedAt: new Date().toISOString().slice(0, 10),
      playersCount: '4',
      winCondition: '',
    },
  });
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [selectedSeat, setSelectedSeat] = useState('1');
  const [selectedCommander, setSelectedCommander] = useState<CommanderCard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playersCount = parseInt(watch('playersCount') || '4', 10);
  const availableSeats = useMemo(() => {
    const takenSeats = new Set(participants.map((participant) => participant.seat));
    return Array.from({ length: playersCount }, (_, idx) => idx + 1).filter((seat) => !takenSeats.has(seat));
  }, [participants, playersCount]);
  const sortedParticipants = [...participants].sort((a, b) => a.seat - b.seat);

  const handleAddParticipant = () => {
    if (!selectedCommander || !playerName.trim()) {
      setError('Please enter a player name and select a commander');
      return;
    }

    const seat = parseInt(selectedSeat, 10);
    if (!availableSeats.includes(seat)) {
      setError('Please choose an available turn order position');
      return;
    }

    const newParticipant: ParticipantInput = {
      seat,
      playerName: playerName.trim(),
      primary: selectedCommander,
      isWinner: participants.length === 0,
    };

    setParticipants((currentParticipants) => [...currentParticipants, newParticipant]);
    setPlayerName('');
    setSelectedCommander(null);
    setSelectedSeat(String(availableSeats.find((candidateSeat) => candidateSeat !== seat) ?? seat));
    setError(null);
  };

  const handleRemoveParticipant = (seat: number) => {
    setParticipants((currentParticipants) => {
      const nextParticipants = currentParticipants.filter((participant) => participant.seat !== seat);

      if (nextParticipants.length > 0 && !nextParticipants.some((participant) => participant.isWinner)) {
        nextParticipants[0] = { ...nextParticipants[0], isWinner: true };
      }

      return nextParticipants;
    });
  };

  const handleWinnerChange = (seat: number) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) => ({
        ...participant,
        isWinner: participant.seat === seat,
      })),
    );
  };

  const handleSaveGame = async (formData: AddGameFormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      if (participants.length !== parseInt(formData.playersCount, 10)) {
        throw new Error(`Please add exactly ${formData.playersCount} participants before saving`);
      }

      const winner = participants.find((participant) => participant.isWinner);
      if (!winner) {
        throw new Error('Please mark exactly one winner before saving');
      }

      const participantRows: Array<{
        seat: number;
        playerId: string;
        primaryCommanderId: string;
        isWinner: boolean;
      }> = [];

      for (const participant of participants) {
        if (!participant.primary) {
          throw new Error(`Participant "${participant.playerName}" is missing a commander`);
        }

        const { data: commanderData, error: commanderError } = await supabase
          .from('commanders')
          .upsert(
            {
              scryfall_id: participant.primary.scryfallId,
              name: participant.primary.name,
              image_url: participant.primary.imageUrl,
              color_identity: participant.primary.colorIdentity || [],
              type_line: participant.primary.typeLine,
              oracle_text: participant.primary.oracleText,
            },
            { onConflict: 'scryfall_id' },
          )
          .select()
          .single();

        if (commanderError) throw commanderError;

        const { data: playerData, error: playerError } = await supabase
          .from('players')
          .upsert(
            {
              name: participant.playerName,
            },
            { onConflict: 'name' },
          )
          .select()
          .single();

        if (playerError) throw playerError;

        participantRows.push({
          seat: participant.seat,
          playerId: playerData.id,
          primaryCommanderId: commanderData.id,
          isWinner: participant.isWinner || false,
        });
      }

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .insert({
          played_at: formData.playedAt,
          number_of_players: parseInt(formData.playersCount, 10),
          win_condition: formData.winCondition,
        })
        .select()
        .single();

      if (gameError) throw gameError;

      const insertedParticipants: Array<{
        id: string;
        player_id: string;
        is_winner: boolean;
      }> = [];

      for (const participantRow of participantRows) {
        const { data: insertedParticipant, error: participantError } = await supabase
          .from('game_participants')
          .insert({
            game_id: gameData.id,
            player_id: participantRow.playerId,
            primary_commander_id: participantRow.primaryCommanderId,
            turn_order_position: participantRow.seat,
            is_winner: participantRow.isWinner,
          })
          .select('id, player_id, is_winner')
          .single();

        if (participantError) throw participantError;

        insertedParticipants.push(insertedParticipant);
      }

      const winnerParticipant = insertedParticipants.find((participant) => participant.is_winner);
      if (!winnerParticipant) {
        throw new Error('Winner row could not be resolved after saving participants');
      }

      const { error: updateGameError } = await supabase
        .from('games')
        .update({
          winner_player_id: winnerParticipant.player_id,
          winner_participant_id: winnerParticipant.id,
        })
        .eq('id', gameData.id);

      if (updateGameError) throw updateGameError;

      navigate('/history');
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
          min={2}
          className='w-full rounded-xl border border-zinc-500 bg-zinc-50 p-3 text-xl'
          {...register('playersCount', { required: true, min: 2 })}
        />

        <select className='w-full rounded-xl border border-zinc-500 bg-zinc-50 p-3 text-xl' {...register('winCondition', { required: true })}>
          <option value=''>Select win condition</option>
          <option value='Combat'>Combat</option>
          <option value='Combo'>Combo</option>
          <option value='Commander Damage'>Commander Damage</option>
          <option value='Other'>Other</option>
        </select>

        <div className='w-full space-y-3 rounded-xl border border-zinc-300 bg-zinc-50 p-4'>
          <h2 className='text-lg font-semibold'>Add Participants ({participants.length}/{playersCount})</h2>

          <div className='space-y-2'>
            <input
              type='text'
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder='Player name'
              className='w-full rounded-lg border border-zinc-500 bg-white p-2 text-lg'
            />

            <select
              value={selectedSeat}
              onChange={(event) => setSelectedSeat(event.target.value)}
              className='w-full rounded-lg border border-zinc-500 bg-white p-2 text-lg'
            >
              {availableSeats.map((seat) => (
                <option key={seat} value={seat}>
                  Turn order: {seat}
                </option>
              ))}
            </select>

            <div className='w-full'>
              <CommanderAutocomplete onSelect={(commander) => setSelectedCommander(commander)} />
            </div>

            {selectedCommander && (
              <div className='rounded-lg bg-white p-2 text-left text-sm'>
                <strong>Selected:</strong> {selectedCommander.name}
              </div>
            )}

            <button
              type='button'
              disabled={availableSeats.length === 0}
              className='w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
              onClick={handleAddParticipant}
            >
              Add Participant
            </button>
          </div>

          {error && <p className='text-sm text-red-600'>{error}</p>}
        </div>

        {participants.length > 0 && (
          <div className='w-full rounded-xl border border-zinc-500 p-4 text-left'>
            <p className='mb-3 text-xl font-semibold'>Participants ({participants.length})</p>
            <ul className='space-y-2'>
              {sortedParticipants.map((participant) => (
                <li key={`${participant.playerName}-${participant.seat}`} className='flex items-center justify-between rounded-lg bg-zinc-100 p-2'>
                  <div className='space-y-1'>
                    <p className='font-semibold'>Seat {participant.seat}: {participant.playerName}</p>
                    <p className='text-sm text-zinc-600'>{participant.primary?.name ?? 'No commander selected'}</p>
                    <label className='flex items-center gap-2 text-sm text-zinc-700'>
                      <input
                        type='radio'
                        name='winner'
                        checked={Boolean(participant.isWinner)}
                        onChange={() => handleWinnerChange(participant.seat)}
                      />
                      Winner
                    </label>
                  </div>
                  <button
                    type='button'
                    onClick={() => handleRemoveParticipant(participant.seat)}
                    className='font-semibold text-red-600 hover:text-red-800'
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
          className='rounded-full border border-zinc-500 bg-zinc-900 px-8 py-3 text-2xl text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {isLoading ? 'Saving...' : 'Save Game'}
        </button>
      </form>
    </section>
  );
}
