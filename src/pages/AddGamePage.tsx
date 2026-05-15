import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { CommanderAutocomplete } from '../components/CommanderAutocomplete';
import { supabase } from '../lib/supabase';
import type { ParticipantInput } from '../types/app';

type AddGameFormValues = {
  playedAt: string;
  playersCount: string;
  winCondition: string;
};

function createParticipantSeat(seat: number): ParticipantInput {
  return {
    seat,
    playerName: '',
    primary: null,
    isWinner: seat === 1,
  };
}

function syncParticipantsToPlayerCount(participants: ParticipantInput[], playersCount: number) {
  const nextParticipants = Array.from({ length: playersCount }, (_, index) => {
    const seat = index + 1;
    return participants.find((participant) => participant.seat === seat) ?? createParticipantSeat(seat);
  });

  const winnerStillVisible = nextParticipants.some((participant) => participant.isWinner);
  if (!winnerStillVisible && nextParticipants.length > 0) {
    nextParticipants[0] = { ...nextParticipants[0], isWinner: true };
  }

  return nextParticipants;
}

export default function AddGamePage() {
  const { register, handleSubmit, watch } = useForm<AddGameFormValues>({
    defaultValues: {
      playedAt: new Date().toISOString().slice(0, 10),
      playersCount: '4',
      winCondition: '',
    },
  });
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<ParticipantInput[]>(() => Array.from({ length: 4 }, (_, index) => createParticipantSeat(index + 1)));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playersCount = parseInt(watch('playersCount') || '4', 10);

  useEffect(() => {
    setParticipants((currentParticipants) => syncParticipantsToPlayerCount(currentParticipants, playersCount));
  }, [playersCount]);

  const hasIncompleteSeat = participants.some((participant) => !participant.playerName.trim() || !participant.primary);

  const handlePlayerNameChange = (seat: number, playerName: string) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              playerName,
            }
          : participant,
      ),
    );
  };

  const handleCommanderChange = (seat: number, primary: ParticipantInput['primary']) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              primary,
            }
          : participant,
      ),
    );
    setError(null);
  };

  const handleCommanderClear = (seat: number) => {
    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) =>
        participant.seat === seat
          ? {
              ...participant,
              primary: null,
            }
          : participant,
      ),
    );
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

      if (participants.some((participant) => !participant.playerName.trim() || !participant.primary)) {
        throw new Error('Please complete every player card with a name and commander before saving');
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
          throw new Error(`Seat ${participant.seat} is missing a commander`);
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
              name: participant.playerName.trim(),
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
      <form className='mx-auto flex w-full max-w-5xl flex-col items-center space-y-4 text-center' onSubmit={handleSubmit(handleSaveGame)}>
        <h1 className='wireframe-title'>Add Game</h1>

        <input type='date' className='app-input' {...register('playedAt', { required: true })} />

        <input
          type='number'
          min={2}
          max={4}
          className='app-input'
          {...register('playersCount', { required: true, min: 2, max: 4 })}
        />

        <select className='app-input' {...register('winCondition', { required: true })}>
          <option value=''>Select win condition</option>
          <option value='Combat'>Combat</option>
          <option value='Combo'>Combo</option>
          <option value='Commander Damage'>Commander Damage</option>
          <option value='Other'>Other</option>
        </select>

        <div className='w-full space-y-4 text-left'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h2 className='text-2xl font-semibold'>Player Grid</h2>
              <p className='app-muted text-sm'>Fill out each seat directly here. With four players, the seats display in a 2x2 grid.</p>
            </div>
            <p className='app-chip'>{playersCount} seats active</p>
          </div>

          <div className='grid gap-4 md:grid-cols-2'>
            {participants.map((participant) => (
              <div key={participant.seat} className='app-card space-y-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='app-muted text-xs font-bold uppercase tracking-[0.25em]'>Seat {participant.seat}</p>
                    <h3 className='text-xl font-semibold'>Player {participant.seat}</h3>
                  </div>

                  <label className='app-muted flex items-center gap-2 text-sm font-semibold'>
                    <input
                      type='radio'
                      name='winner'
                      checked={Boolean(participant.isWinner)}
                      onChange={() => handleWinnerChange(participant.seat)}
                    />
                    Winner
                  </label>
                </div>

                <input
                  type='text'
                  value={participant.playerName}
                  onChange={(event) => handlePlayerNameChange(participant.seat, event.target.value)}
                  placeholder={`Seat ${participant.seat} player name`}
                  className='app-input-compact'
                />

                <div className='space-y-2'>
                  <CommanderAutocomplete onSelect={(commander) => handleCommanderChange(participant.seat, commander)} />

                  {participant.primary ? (
                    <div className='app-card-soft flex items-center justify-between gap-3 px-3 py-2 text-sm'>
                      <p>
                        <strong>Commander:</strong> {participant.primary.name}
                      </p>
                      <button
                        type='button'
                        className='font-semibold text-red-600 hover:text-red-800'
                        onClick={() => handleCommanderClear(participant.seat)}
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <p className='app-muted text-sm'>Choose a commander for this seat.</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <p className='text-sm text-red-600'>{error}</p>}
        </div>

        <button
          type='submit'
          disabled={isLoading || hasIncompleteSeat}
          className='rounded-full border px-8 py-3 text-2xl font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
          style={{ background: '#18181b', borderColor: 'var(--app-border)' }}
        >
          {isLoading ? 'Saving...' : 'Save Game'}
        </button>
      </form>
    </section>
  );
}
