import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type HistoryGameParticipant = {
  id: string;
  turn_order_position: number;
  is_winner: boolean;
  player: { name: string } | { name: string }[] | null;
  primary_commander: { name: string } | { name: string }[] | null;
};

type HistoryGame = {
  id: string;
  played_at: string;
  number_of_players: number;
  win_condition: string;
  game_participants: HistoryGameParticipant[];
};

function readSingleName(value: { name: string } | { name: string }[] | null) {
  if (Array.isArray(value)) {
    return value[0]?.name ?? 'Unknown';
  }

  return value?.name ?? 'Unknown';
}

export default function GameHistoryPage() {
  const [games, setGames] = useState<HistoryGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGames() {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('games')
          .select(`
            id,
            played_at,
            number_of_players,
            win_condition,
            game_participants (
              id,
              turn_order_position,
              is_winner,
              player:players (
                name
              ),
              primary_commander:commanders!game_participants_primary_commander_id_fkey (
                name
              )
            )
          `)
          .order('played_at', { ascending: false });

        if (fetchError) throw fetchError;

        if (isMounted) {
          setGames((data as HistoryGame[]) || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load game history');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadGames();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className='wireframe-shell space-y-4'>
      <div className='space-y-1 text-left'>
        <h1 className='wireframe-title'>Game History</h1>
        <p className='wireframe-copy text-zinc-700'>Saved commander games appear here after they are written to Supabase.</p>
      </div>

      {isLoading && <p className='wireframe-copy'>Loading games...</p>}
      {error && <p className='wireframe-copy text-red-600'>{error}</p>}

      {!isLoading && !error && games.length === 0 && (
        <p className='wireframe-copy'>No games saved yet. Add a game to start building your history.</p>
      )}

      {!isLoading && !error && games.length > 0 && (
        <div className='space-y-4'>
          {games.map((game) => (
            <article key={game.id} className='rounded-xl border border-zinc-400 bg-white p-4 text-left'>
              <div className='flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3'>
                <div>
                  <p className='text-lg font-semibold text-zinc-900'>{game.played_at}</p>
                  <p className='text-sm text-zinc-600'>
                    {game.number_of_players} players · {game.win_condition}
                  </p>
                </div>
              </div>

              <ul className='mt-4 space-y-2'>
                {[...game.game_participants]
                  .sort((a, b) => a.turn_order_position - b.turn_order_position)
                  .map((participant) => (
                    <li key={participant.id} className='flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2'>
                      <div>
                        <p className='font-medium text-zinc-900'>
                          Seat {participant.turn_order_position}: {readSingleName(participant.player)}
                        </p>
                        <p className='text-sm text-zinc-600'>{readSingleName(participant.primary_commander)}</p>
                      </div>
                      {participant.is_winner && (
                        <span className='rounded-full border border-emerald-700 px-3 py-1 text-sm font-semibold text-emerald-700'>
                          Winner
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
