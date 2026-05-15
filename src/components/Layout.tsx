import { Link, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home' },
  { to: '/add-game', label: 'Add Game' },
  { to: '/history', label: 'History' },
  { to: '/commanders', label: 'Commanders' },
  { to: '/players', label: 'Players' },
];

export function Layout() {
  return (
    <div className='mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-8'>
      <nav className='wireframe-shell flex flex-wrap items-center justify-center gap-3 text-xl font-semibold md:text-3xl'>
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className='rounded-full border border-zinc-500 px-5 py-2 transition hover:bg-zinc-200'
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className='wireframe-shell'>
        <p className='wireframe-copy text-zinc-700'>
          This tracker saves directly to your connected Supabase project without an in-app login.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
