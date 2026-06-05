import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function ProtectedRoute() {
  const { isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <section className='wireframe-page'>
        <p className='app-muted text-base' role='status'>Checking session...</p>
      </section>
    );
  }

  if (!user) {
    return <Navigate to='/login' replace state={{ from: location }} />;
  }

  return <Outlet />;
}
