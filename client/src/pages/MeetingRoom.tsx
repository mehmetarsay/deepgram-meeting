import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TranscriptEntry, Meeting } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

export default function MeetingRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [interimEntry, setInterimEntry] = useState<TranscriptEntry | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  const onTranscript = useCallback((entry: TranscriptEntry) => {
    setInterimEntry(entry);
  }, []);

  const onFinalTranscript = useCallback((entry: TranscriptEntry) => {
    setTranscripts((prev) => [...prev, entry]);
    setInterimEntry(null);
  }, []);

  const onMeetingEnded = useCallback(
    (_m: Meeting) => {
      navigate(`/meeting/${id}/summary`);
    },
    [id, navigate]
  );

  const onError = useCallback((message: string) => {
    setError(message);
  }, []);

  const { isConnected, connect, sendAudio, endMeeting, disconnect } = useWebSocket({
    meetingId: id!,
    onTranscript,
    onFinalTranscript,
    onMeetingEnded,
    onError,
  });

  const { isRecording, startRecording, stopRecording } = useAudioRecorder({
    onAudioData: sendAudio,
  });

  useEffect(() => {
    fetch(`/api/meetings/${id}`)
      .then((res) => res.json())
      .then(setMeeting);
  }, [id]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  useEffect(() => {
    if (isConnected && !isRecording) {
      startRecording().catch(() => {
        setError('Mikrofon erişimi reddedildi. Lütfen tarayıcı ayarlarından izin verin.');
      });
    }
  }, [isConnected]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, interimEntry]);

  const handleEndMeeting = async () => {
    setEnding(true);
    stopRecording();

    // Try WebSocket first, then fallback to REST API
    try {
      endMeeting();
    } catch {
      // ignore
    }

    // Always call REST API as fallback to ensure meeting ends
    try {
      await fetch(`/api/meetings/${id}/end`, { method: 'POST' });
    } catch {
      // ignore
    }

    disconnect();
    navigate(`/meeting/${id}/summary`);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleEditSave = async (entryId: string) => {
    await fetch(`/api/meetings/${id}/transcript/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: editText }),
    });
    setTranscripts((prev) =>
      prev.map((t) => (t.id === entryId ? { ...t, text: editText } : t))
    );
    setEditingId(null);
    setEditText('');
  };

  const handleSpeakerChange = async (entryId: string, newName: string) => {
    await fetch(`/api/meetings/${id}/transcript/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantName: newName }),
    });
    const entry = transcripts.find((t) => t.id === entryId);
    if (entry) {
      await fetch(`/api/meetings/${id}/speakers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakerIndex: entry.speakerIndex,
          participantName: newName,
        }),
      });
    }
    setTranscripts((prev) =>
      prev.map((t) => (t.id === entryId ? { ...t, participantName: newName } : t))
    );
    setEditingSpeakerId(null);
  };

  const speakerColors = [
    { badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
    { badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
    { badge: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
    { badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
    { badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
    { badge: 'bg-cyan-100 text-cyan-800', dot: 'bg-cyan-500' },
  ];

  const getColor = (index: number) => speakerColors[index % speakerColors.length];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {meeting?.name || 'Toplanti'}
            </h1>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className={`flex items-center gap-1.5 font-medium ${isRecording ? 'text-red-600' : 'text-slate-400'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
                {isRecording ? 'Kayit Yapiliyor' : 'Bekleniyor'}
              </span>
              <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
                {formatTime(elapsed)}
              </span>
              <span>{meeting?.participants.length || 0} katilimci</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleEndMeeting}
          disabled={ending}
          className="px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 active:scale-95 font-semibold transition-all shadow-md shadow-red-200 disabled:opacity-50"
        >
          {ending ? 'Bitiyor...' : 'Toplantiyi Bitir'}
        </button>
      </header>

      {error && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-amber-800 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-amber-600 hover:text-amber-800">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-white/60 backdrop-blur-sm border-r border-slate-200 p-5 hidden md:flex flex-col">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
            Katilimcilar
          </h2>
          <ul className="space-y-2">
            {meeting?.participants.map((name, i) => (
              <li key={name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition">
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${getColor(i).badge}`}
                >
                  {name[0].toUpperCase()}
                </span>
                <span className="text-slate-700 font-medium text-sm">{name}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 px-3 py-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}
              />
              <span className="text-sm text-slate-500">
                {isConnected ? 'Sunucuya bagli' : 'Baglanti kesildi'}
              </span>
            </div>
          </div>
        </aside>

        {/* Transcript area */}
        <main className="flex-1 overflow-y-auto">
          {transcripts.length === 0 && !interimEntry && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-slate-500">Konusmalar burada gorunecek</p>
              <p className="text-sm mt-1">Mikrofona konusmaya baslayin</p>
            </div>
          )}

          <div className="max-w-3xl mx-auto p-6 space-y-1">
            {transcripts.map((entry, idx) => {
              const prevEntry = idx > 0 ? transcripts[idx - 1] : null;
              const showSpeaker = !prevEntry || prevEntry.participantName !== entry.participantName;

              return (
                <div key={entry.id} className={`group ${showSpeaker ? 'mt-4' : ''}`}>
                  {showSpeaker && (
                    <div className="flex items-center gap-2 mb-1.5">
                      {editingSpeakerId === entry.id ? (
                        <select
                          className="text-sm font-semibold border border-slate-300 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                          value={entry.participantName}
                          onChange={(e) => handleSpeakerChange(entry.id, e.target.value)}
                          onBlur={() => setEditingSpeakerId(null)}
                          autoFocus
                        >
                          {meeting?.participants.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingSpeakerId(entry.id)}
                          className={`text-sm font-semibold px-2.5 py-1 rounded-lg ${getColor(entry.speakerIndex).badge} hover:opacity-80 transition cursor-pointer`}
                          title="Konusmacıyı degistir"
                        >
                          {entry.participantName}
                        </button>
                      )}
                      <span className="text-xs text-slate-400 font-mono">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                  )}

                  {editingId === entry.id ? (
                    <div className="flex gap-2 pl-0.5">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave(entry.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-blue-50/50"
                        autoFocus
                      />
                      <button
                        onClick={() => handleEditSave(entry.id)}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition font-medium"
                      >
                        Kaydet
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-slate-400 hover:text-slate-600 px-2"
                      >
                        Iptal
                      </button>
                    </div>
                  ) : (
                    <p
                      className="text-slate-700 text-sm leading-relaxed cursor-pointer hover:bg-white rounded-lg px-2 py-1 -mx-2 transition group-hover:bg-white/50"
                      onClick={() => {
                        setEditingId(entry.id);
                        setEditText(entry.text);
                      }}
                      title="Duzenlemek icin tiklayin"
                    >
                      {!showSpeaker && (
                        <span className="text-xs text-slate-400 font-mono mr-2">
                          {formatTime(entry.timestamp)}
                        </span>
                      )}
                      {entry.text}
                    </p>
                  )}
                </div>
              );
            })}

            {interimEntry && (
              <div className="mt-4 opacity-70">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-sm font-semibold px-2.5 py-1 rounded-lg ${getColor(interimEntry.speakerIndex).badge}`}>
                    {interimEntry.participantName}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatTime(interimEntry.timestamp)}
                  </span>
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
                <p className="text-slate-500 text-sm italic leading-relaxed px-0.5">
                  {interimEntry.text}
                </p>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>
        </main>
      </div>
    </div>
  );
}
