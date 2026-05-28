import { supabase } from './supabase';

export type UserCommander = {
  id: string;
  scryfallId: string | null;
  name: string;
  imageUrl: string | null;
  colorIdentity: string[];
  addedAt: string;
};

export async function getUserCommanders(): Promise<UserCommander[]> {
  const { data, error } = await supabase
    .from('user_commanders')
    .select('id, scryfall_id, name, image_url, color_identity, added_at')
    .order('added_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    scryfallId: row.scryfall_id,
    name: row.name,
    imageUrl: row.image_url,
    colorIdentity: row.color_identity ?? [],
    addedAt: row.added_at,
  }));
}

export async function addUserCommander(commander: {
  scryfallId: string | null;
  name: string;
  imageUrl: string | null;
  colorIdentity: string[];
}): Promise<void> {
  if (!commander.scryfallId) {
    const { data } = await supabase
      .from('user_commanders')
      .select('id')
      .eq('name', commander.name)
      .limit(1);
    if (data && data.length > 0) return;
    const { error } = await supabase.from('user_commanders').insert({
      name: commander.name,
      image_url: commander.imageUrl,
      color_identity: commander.colorIdentity,
    });
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('user_commanders')
    .upsert(
      {
        scryfall_id: commander.scryfallId,
        name: commander.name,
        image_url: commander.imageUrl,
        color_identity: commander.colorIdentity,
      },
      { onConflict: 'user_id,scryfall_id', ignoreDuplicates: true },
    );

  if (error) throw error;
}

export async function removeUserCommander(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_commanders')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
