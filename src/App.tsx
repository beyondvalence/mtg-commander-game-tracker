import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AddGamePage from './pages/AddGamePage';
import GameHistoryPage from './pages/GameHistoryPage';
import CommandersPage from './pages/CommandersPage';
import PlayersPage from './pages/PlayersPage';
export default function App(){ const authed=true; return <BrowserRouter><Routes><Route path='/login' element={<LoginPage/>}/><Route element={<ProtectedRoute authed={authed}><Layout/></ProtectedRoute>}><Route path='/' element={<DashboardPage/>}/><Route path='/add-game' element={<AddGamePage/>}/><Route path='/history' element={<GameHistoryPage/>}/><Route path='/commanders' element={<CommandersPage/>}/><Route path='/players' element={<PlayersPage/>}/></Route></Routes></BrowserRouter>; }
