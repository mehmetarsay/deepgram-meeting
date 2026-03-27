import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LobbyPage from './pages/LobbyPage';
import MeetingRoom from './pages/MeetingRoom';
import SummaryPage from './pages/SummaryPage';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/meeting/:id/lobby" element={<LobbyPage />} />
        <Route path="/meeting/:id/room" element={<MeetingRoom />} />
        <Route path="/meeting/:id/summary" element={<SummaryPage />} />
      </Routes>
    </div>
  );
}
