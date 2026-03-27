import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Meeting } from '../types';

export default function LobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participantName, setParticipantName] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/meetings/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setMeeting(data);
        setParticipants(data.participants || []);
      });
  }, [id]);

  const addParticipant = () => {
    const name = participantName.trim();
    if (!name || participants.includes(name)) return;
    setParticipants([...participants, name]);
    setParticipantName('');
  };

  const removeParticipant = (name: string) => {
    setParticipants(participants.filter((p) => p !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addParticipant();
    }
  };

  const startMeeting = async () => {
    await fetch(`/api/meetings/${id}/participants`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participants }),
    });
    navigate(`/meeting/${id}/room`);
  };

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{meeting.name}</h1>
        <p className="text-gray-500 mb-6">Katılımcıları ekleyin ve toplantıyı başlatın</p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Katılımcı adı"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            onClick={addParticipant}
            disabled={!participantName.trim()}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition"
          >
            Ekle
          </button>
        </div>

        <div className="mb-6">
          {participants.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">
              Henüz katılımcı eklenmedi
            </p>
          ) : (
            <ul className="space-y-2">
              {participants.map((name) => (
                <li
                  key={name}
                  className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium">
                      {name[0].toUpperCase()}
                    </span>
                    <span className="text-gray-800">{name}</span>
                  </div>
                  <button
                    onClick={() => removeParticipant(name)}
                    className="text-red-400 hover:text-red-600 text-sm transition"
                  >
                    Kaldır
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={startMeeting}
          disabled={participants.length < 1}
          className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Toplantıyı Başlat ({participants.length} katılımcı)
        </button>
      </div>
    </div>
  );
}
