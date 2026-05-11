import { Navigate } from 'react-router-dom';
export function ProtectedRoute({ authed, children }: { authed: boolean; children: JSX.Element }) { return authed ? children : <Navigate to="/login" replace />; }
