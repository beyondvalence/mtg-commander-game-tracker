import { useEffect, useRef, useState } from 'react';
import { usePod } from '../contexts/PodContext';

export function PodSwitcher() {
  const { pods, activePod, setActivePodId } = usePod();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (pods.length === 0) return null;

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        className='pod-switcher-button'
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label='Switch pod'
      >
        <span className='pod-switcher-label'>{activePod?.podName ?? 'Select pod'}</span>
        <svg viewBox='0 0 20 20' className='h-3.5 w-3.5 shrink-0' fill='currentColor' aria-hidden='true'>
          <path
            fillRule='evenodd'
            d='M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z'
          />
        </svg>
      </button>

      {open && (
        <div className='absolute left-0 top-full z-40 mt-2 w-52 app-card p-1 shadow-xl'>
          {pods.map((pod) => (
            <button
              key={pod.podId}
              type='button'
              className={`pod-switcher-option ${pod.podId === activePod?.podId ? 'pod-switcher-option-active' : ''}`}
              onClick={() => {
                setActivePodId(pod.podId);
                setOpen(false);
              }}
            >
              <span className='truncate'>{pod.podName}</span>
              {pod.podId === activePod?.podId && <span aria-hidden='true'>•</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
