import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './lib/auth';
import { PodProvider } from './contexts/PodContext';
import DashboardPage from './pages/DashboardPage';
import AddGamePage from './pages/AddGamePage';
import GameHistoryPage from './pages/GameHistoryPage';
import PlayersPage from './pages/PlayersPage';
import JoinPodPage from './pages/JoinPodPage';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PodProvider>
          <Routes>
            <Route path='/login' element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path='/join/:inviteCode' element={<JoinPodPage />} />
              <Route element={<Layout />}>
                <Route path='/' element={<DashboardPage />} />
                <Route path='/add-game' element={<AddGamePage />} />
                <Route path='/history' element={<GameHistoryPage />} />
                <Route path='/players' element={<PlayersPage />} />
                <Route path='/me' element={<Navigate to='/' replace />} />
                <Route path='/commanders' element={<Navigate to='/' replace />} />
              </Route>
            </Route>
          </Routes>
        </PodProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
