import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { joinPod } from '../lib/podRecords';
import { usePod } from '../contexts/PodContext';

export default function JoinPodPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { setActivePodId, refreshPods } = usePod();
  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!inviteCode || attemptedRef.current) return;
    attemptedRef.current = true;

    joinPod(inviteCode)
      .then(async (podId) => {
        await refreshPods();
        setActivePodId(podId);
        navigate('/', { replace: true });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('invalid_invite_code')) {
          setError('This invite link is invalid or has expired.');
        } else {
          setError('Failed to join pod. Please try again.');
        }
      });
  }, [inviteCode, navigate, setActivePodId, refreshPods]);

  if (error) {
    return (
      <section className='wireframe-page'>
        <p className='wireframe-copy' style={{ color: 'var(--color-error, red)' }}>{error}</p>
        <button onClick={() => navigate('/')} className='btn-secondary mt-4'>
          Go home
        </button>
      </section>
    );
  }

  return (
    <section className='wireframe-page'>
      <p className='wireframe-copy'>Joining pod…</p>
    </section>
  );
}
