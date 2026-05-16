import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import AddGamePage from './pages/AddGamePage';
import GameHistoryPage from './pages/GameHistoryPage';
import PlayersPage from './pages/PlayersPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/login' element={<Navigate to='/' replace />} />
        <Route element={<Layout />}>
          <Route path='/' element={<DashboardPage />} />
          <Route path='/add-game' element={<AddGamePage />} />
          <Route path='/history' element={<GameHistoryPage />} />
          <Route path='/players' element={<PlayersPage />} />
          <Route path='/commanders' element={<Navigate to='/' replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
