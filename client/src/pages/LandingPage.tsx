import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const [meetingName, setMeetingName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: meetingName.trim(), participants: [] }),
      });
      const meeting = await res.json();
      navigate(`/meeting/${meeting.id}/lobby`);
    } catch (err) {
      console.error('Toplantı oluşturulamadı:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Toplanti Kayit Sistemi
          </h1>
          <p className="text-gray-500">
            Toplantılarınızı kaydedin, konuşmaları anlık olarak metne dökün
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label
              htmlFor="meetingName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Toplantı Adı
            </label>
            <input
              id="meetingName"
              type="text"
              value={meetingName}
              onChange={(e) => setMeetingName(e.target.value)}
              placeholder="Örn: Haftalık Durum Toplantısı"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={!meetingName.trim() || loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Oluşturuluyor...' : 'Toplantı Oluştur'}
          </button>
        </form>
      </div>
    </div>
  );
}
