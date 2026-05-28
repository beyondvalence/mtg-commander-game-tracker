import { supabase } from './supabase';

export type Pod = {
  podId: string;
  podName: string;
  role: 'admin' | 'member';
  inviteCode: string | null;
  memberCount: number;
};

export type PodMember = {
  userId: string;
  email: string | null;
  role: 'admin' | 'member';
  joinedAt: string;
};

export async function getUserPods(): Promise<Pod[]> {
  const { data, error } = await supabase.rpc('get_user_pods');
  if (error) throw error;

  return (data ?? []).map((row: {
    pod_id: string;
    pod_name: string;
    role: string;
    invite_code: string | null;
    member_count: number;
  }) => ({
    podId: row.pod_id,
    podName: row.pod_name,
    role: row.role as 'admin' | 'member',
    inviteCode: row.invite_code,
    memberCount: Number(row.member_count),
  }));
}

export async function createPod(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_pod', { p_name: name });
  if (error) throw error;
  return data as string;
}

export async function joinPod(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_pod', { p_invite_code: inviteCode });
  if (error) throw error;
  return data as string;
}

export async function kickPodMember(podId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc('kick_pod_member', {
    p_pod_id: podId,
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
}

export async function promotePodMember(podId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc('promote_pod_member', {
    p_pod_id: podId,
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
}

export async function demotePodMember(podId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc('demote_pod_member', {
    p_pod_id: podId,
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
}

export async function getPodMembers(podId: string): Promise<PodMember[]> {
  const { data, error } = await supabase
    .from('pod_members')
    .select('user_id, role, joined_at, profiles(email)')
    .eq('pod_id', podId)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      userId: row.user_id,
      email: profile?.email ?? null,
      role: row.role as 'admin' | 'member',
      joinedAt: row.joined_at,
    };
  });
}
