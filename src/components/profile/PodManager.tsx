import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { usePod } from '../../contexts/PodContext';
import {
  createPod,
  demotePodMember,
  getPodMembers,
  joinPod,
  kickPodMember,
  promotePodMember,
  type PodMember,
} from '../../lib/podRecords';

export function PodManager() {
  const { user } = useAuth();
  const { pods, activePod, setActivePodId, isPodAdmin, refreshPods } = usePod();
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPodId, setExpandedPodId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, PodMember[]>>({});
  const [memberOp, setMemberOp] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (expandedPodId && !members[expandedPodId]) {
      getPodMembers(expandedPodId)
        .then((m) => setMembers((prev) => ({ ...prev, [expandedPodId]: m })))
        .catch(() => {});
    }
  }, [expandedPodId, members]);

  async function handleCreate() {
    const name = createName.trim();
    if (!name) return;
    try {
      setIsCreating(true);
      setError(null);
      const podId = await createPod(name);
      await refreshPods();
      setActivePodId(podId);
      setCreateName('');
    } catch (e) {
      const msg = (e as any)?.message ?? '';
      setError(msg.includes('pod_creation_disabled')
        ? 'Pod creation is currently disabled.'
        : msg || 'Failed to create pod');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleJoin() {
    let code = joinCode.trim();
    if (!code) return;
    // Support pasting full invite URLs
    const joinMatch = code.match(/\/join\/([0-9a-f-]{36})$/i);
    if (joinMatch) code = joinMatch[1];
    try {
      setIsJoining(true);
      setError(null);
      const podId = await joinPod(code);
      await refreshPods();
      setActivePodId(podId);
      setJoinCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid invite code or already a member');
    } finally {
      setIsJoining(false);
    }
  }

  async function handleMemberOp(podId: string, targetUserId: string, op: 'kick' | 'promote' | 'demote') {
    const key = `${op}:${targetUserId}`;
    try {
      setMemberOp(key);
      setError(null);
      if (op === 'kick') await kickPodMember(podId, targetUserId);
      else if (op === 'promote') await promotePodMember(podId, targetUserId);
      else await demotePodMember(podId, targetUserId);
      const updated = await getPodMembers(podId);
      setMembers((prev) => ({ ...prev, [podId]: updated }));
      await refreshPods();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${op} member`);
    } finally {
      setMemberOp(null);
    }
  }

  function copyInviteLink(inviteCode: string, podId: string) {
    const url = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(podId);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-xs app-error-text'>{error}</p>}

      {pods.length === 0 && (
        <p className='app-muted text-sm'>No pods yet. Create one below.</p>
      )}

      <div className='space-y-2'>
        {pods.map((pod) => {
          const isActive = pod.podId === activePod?.podId;
          const isExpanded = expandedPodId === pod.podId;
          const podMembers = members[pod.podId] ?? [];
          const userIsAdmin = pod.role === 'admin';

          return (
            <div key={pod.podId} className='rounded-xl border' style={{ borderColor: 'var(--app-border)', background: 'var(--app-panel-soft)' }}>
              <div className='flex items-center gap-2 px-3 py-2'>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-semibold'>{pod.podName}</p>
                  <p className='app-muted text-xs'>
                    {pod.memberCount} {pod.memberCount === 1 ? 'member' : 'members'} · {pod.role}
                  </p>
                </div>
                <div className='flex shrink-0 items-center gap-1.5'>
                  {!isActive && (
                    <button
                      type='button'
                      className='logout-button px-2 py-1 text-xs'
                      onClick={() => setActivePodId(pod.podId)}
                    >
                      Switch
                    </button>
                  )}
                  {isActive && (
                    <span className='rounded-full px-2 py-0.5 text-xs font-semibold' style={{ background: 'var(--app-panel-strong)', color: 'var(--app-text)' }}>
                      Active
                    </span>
                  )}
                  {pod.inviteCode && (
                    <button
                      type='button'
                      className='logout-button px-2 py-1 text-xs'
                      onClick={() => copyInviteLink(pod.inviteCode!, pod.podId)}
                    >
                      {copied === pod.podId ? 'Copied!' : 'Invite'}
                    </button>
                  )}
                  <button
                    type='button'
                    className='app-muted text-xs underline-offset-2 hover:underline'
                    onClick={() => setExpandedPodId(isExpanded ? null : pod.podId)}
                  >
                    {isExpanded ? 'Hide' : 'Members'}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className='border-t px-3 pb-3 pt-2' style={{ borderColor: 'var(--app-border)' }}>
                  {podMembers.length === 0 ? (
                    <p className='app-muted text-xs'>Loading...</p>
                  ) : (
                    <div className='space-y-1.5'>
                      {podMembers.map((m) => {
                        const isSelf = m.userId === user?.id;
                        const opKey = `kick:${m.userId}`;
                        const promoteKey = `promote:${m.userId}`;
                        const demoteKey = `demote:${m.userId}`;

                        return (
                          <div key={m.userId} className='flex items-center gap-2'>
                            <div className='min-w-0 flex-1'>
                              <p className='truncate text-xs'>
                                {m.email ?? m.userId.slice(0, 8)}
                                {isSelf && <span className='app-muted'> (you)</span>}
                              </p>
                              <p className='app-muted text-xs'>{m.role}</p>
                              {m.displayName === null && (
                                <p className='text-xs app-warning-text'>Display name not set</p>
                              )}
                            </div>
                            {userIsAdmin && !isSelf && (
                              <div className='flex shrink-0 gap-1'>
                                {m.role === 'member' && (
                                  <button
                                    type='button'
                                    className='app-muted min-h-[2rem] px-2 py-1 text-xs underline-offset-2 hover:underline'
                                    disabled={memberOp === promoteKey}
                                    onClick={() => handleMemberOp(pod.podId, m.userId, 'promote')}
                                  >
                                    Promote
                                  </button>
                                )}
                                {m.role === 'admin' && (
                                  <button
                                    type='button'
                                    className='app-muted min-h-[2rem] px-2 py-1 text-xs underline-offset-2 hover:underline'
                                    disabled={memberOp === demoteKey}
                                    onClick={() => handleMemberOp(pod.podId, m.userId, 'demote')}
                                  >
                                    Demote
                                  </button>
                                )}
                                <button
                                  type='button'
                                  className='app-error-text min-h-[2rem] px-2 py-1 text-xs underline-offset-2 hover:underline'
                                  disabled={memberOp === opKey}
                                  onClick={() => handleMemberOp(pod.podId, m.userId, 'kick')}
                                >
                                  Kick
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className='space-y-2 border-t pt-3' style={{ borderColor: 'var(--app-border)' }}>
        <p className='text-xs font-semibold uppercase tracking-[0.15em] app-muted'>Create Pod</p>
        <div className='flex gap-2'>
          <input
            type='text'
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder='Pod name'
            className='app-input-compact flex-1'
          />
          <button
            type='button'
            className='logout-button shrink-0 px-3 py-1.5 text-sm'
            onClick={handleCreate}
            disabled={!createName.trim() || isCreating}
          >
            {isCreating ? '...' : 'Create'}
          </button>
        </div>
      </div>

      <div className='space-y-2'>
        <p className='text-xs font-semibold uppercase tracking-[0.15em] app-muted'>Join via Invite Code</p>
        <div className='flex gap-2'>
          <input
            type='text'
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder='Paste invite code or URL'
            className='app-input-compact flex-1'
          />
          <button
            type='button'
            className='logout-button shrink-0 px-3 py-1.5 text-sm'
            onClick={handleJoin}
            disabled={!joinCode.trim() || isJoining}
          >
            {isJoining ? '...' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  );
}
