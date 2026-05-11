import { Link, Outlet } from 'react-router-dom';
export function Layout() { return <div className='p-4 space-y-4'><nav className='flex gap-3 text-sm'>{['/','/add-game','/history','/commanders','/players'].map((p)=><Link key={p} to={p}>{p}</Link>)}</nav><Outlet/></div>; }
