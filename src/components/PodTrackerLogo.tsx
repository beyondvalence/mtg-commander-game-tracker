export function PodTrackerLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`podtracker-logo ${className}`.trim()} aria-label='PodTracker home'>
      <svg viewBox='0 0 140 64' className='podtracker-logo-mark' role='img' aria-hidden='true'>
        <defs>
          <linearGradient id='podtracker-core' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor='#9bfda7' />
            <stop offset='55%' stopColor='#34d399' />
            <stop offset='100%' stopColor='#0f172a' />
          </linearGradient>
          <linearGradient id='podtracker-grid' x1='0%' y1='0%' x2='100%' y2='0%'>
            <stop offset='0%' stopColor='#22c55e' stopOpacity='0.15' />
            <stop offset='50%' stopColor='#86efac' stopOpacity='0.85' />
            <stop offset='100%' stopColor='#22c55e' stopOpacity='0.15' />
          </linearGradient>
        </defs>
        <rect x='2' y='6' width='136' height='52' rx='20' fill='#05070a' stroke='#1f2937' strokeWidth='2' />
        <path d='M14 46 38 18h20L34 46Z' fill='url(#podtracker-core)' />
        <path d='M46 46 70 18h20L66 46Z' fill='url(#podtracker-core)' opacity='0.92' />
        <path d='M78 46 102 18h24L102 46Z' fill='url(#podtracker-core)' opacity='0.84' />
        <path d='M18 52h104' stroke='url(#podtracker-grid)' strokeWidth='2.2' strokeLinecap='round' />
        <path d='M28 12h68' stroke='#86efac' strokeOpacity='0.55' strokeWidth='1.6' strokeLinecap='round' />
        <circle cx='114' cy='24' r='5' fill='#86efac' fillOpacity='0.95' />
        <circle cx='114' cy='24' r='10' fill='none' stroke='#22c55e' strokeOpacity='0.4' strokeWidth='1.5' />
      </svg>
      <span className='podtracker-logo-wordmark'>PodTracker</span>
    </div>
  );
}
