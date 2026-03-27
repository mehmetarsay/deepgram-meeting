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
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const editInputRef = useRef<HTMLInputElement>(null);

  // Algılanan benzersiz ses indekslerini topla
  const detectedVoices = Array.from(
    new Set(transcripts.map((t) => t.speakerIndex))
  ).sort();

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
        setError('Mikrofon erisimi reddedildi.');
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

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleEndMeeting = async () => {
    setEnding(true);
    stopRecording();
    try { endMeeting(); } catch {}
    try { await fetch(`/api/meetings/${id}/end`, { method: 'POST' }); } catch {}
    disconnect();
    navigate(`/meeting/${id}/summary`);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- Inline metin duzenleme ---
  const handleEditSave = async (entryId: string) => {
    if (!editText.trim()) return;
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

  // --- Konusmaci degistirme (transkript uzerinde) ---
  const handleSpeakerChange = async (entryId: string, newName: string) => {
    await fetch(`/api/meetings/${id}/transcript/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantName: newName }),
    });
    setTranscripts((prev) =>
      prev.map((t) => (t.id === entryId ? { ...t, participantName: newName } : t))
    );
  };

  // --- Sol panel: ses-katilimci eslestirme ---
  const handleVoiceMapping = async (speakerIndex: number, participantName: string) => {
    // Sunucuda speaker map guncelle
    await fetch(`/api/meetings/${id}/speakers`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakerIndex, participantName }),
    });
    // Meeting state guncelle
    setMeeting((prev) =>
      prev ? { ...prev, speakerMap: { ...prev.speakerMap, [speakerIndex]: participantName } } : prev
    );
    // Tum transkript satirlarini guncelle
    setTranscripts((prev) =>
      prev.map((t) =>
        t.speakerIndex === speakerIndex ? { ...t, participantName } : t
      )
    );
  };

  // --- Surukleme ---
  const handleDragStart = (entryId: string) => {
    setDraggedId(entryId);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = async (dropIdx: number) => {
    if (!draggedId) return;
    const oldIdx = transcripts.findIndex((t) => t.id === draggedId);
    if (oldIdx === -1 || oldIdx === dropIdx) {
      setDraggedId(null);
      setDragOverIdx(null);
      return;
    }

    // Yerel state guncelle
    const newList = [...transcripts];
    const [moved] = newList.splice(oldIdx, 1);
    const insertIdx = dropIdx > oldIdx ? dropIdx - 1 : dropIdx;
    newList.splice(insertIdx, 0, moved);
    setTranscripts(newList);

    // Sunucuya bildir
    fetch(`/api/meetings/${id}/transcript/${draggedId}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newIndex: insertIdx }),
    });

    setDraggedId(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverIdx(null);
  };

  const speakerColors = [
    { badge: 'bg-blue-100 text-blue-800', border: 'border-blue-300' },
    { badge: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-300' },
    { badge: 'bg-violet-100 text-violet-800', border: 'border-violet-300' },
    { badge: 'bg-amber-100 text-amber-800', border: 'border-amber-300' },
    { badge: 'bg-rose-100 text-rose-800', border: 'border-rose-300' },
    { badge: 'bg-cyan-100 text-cyan-800', border: 'border-cyan-300' },
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
        <aside className="w-72 bg-white/60 backdrop-blur-sm border-r border-slate-200 p-5 hidden md:flex flex-col gap-6">
          {/* Ses Eslestirme */}
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Ses Eslestirme
            </h2>
            {detectedVoices.length === 0 ? (
              <p className="text-xs text-slate-400 italic px-1">
                Henuz ses algilanmadi...
              </p>
            ) : (
              <ul className="space-y-2">
                {detectedVoices.map((si) => {
                  const color = getColor(si);
                  const currentMapping = meeting?.speakerMap?.[si];
                  const isMapped = currentMapping && !currentMapping.startsWith('Ses ');
                  return (
                    <li key={si} className={`rounded-xl border ${color.border} bg-white p-3`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${color.badge}`}>
                          {si + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          Ses {si + 1}
                        </span>
                        {isMapped && (
                          <span className="ml-auto text-xs text-emerald-600 font-medium">
                            ✓
                          </span>
                        )}
                      </div>
                      <select
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={isMapped ? currentMapping : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleVoiceMapping(si, e.target.value);
                          }
                        }}
                      >
                        <option value="">-- Katilimci sec --</option>
                        {meeting?.participants.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Katilimcilar */}
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Katilimcilar
            </h2>
            <ul className="space-y-1.5">
              {meeting?.participants.map((name, i) => {
                // Bu katilimciya eslestirilmis ses var mi?
                const matchedVoice = Object.entries(meeting.speakerMap || {}).find(
                  ([, v]) => v === name
                );
                return (
                  <li key={name} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${getColor(i).badge}`}>
                      {name[0].toUpperCase()}
                    </span>
                    <span className="text-slate-700 font-medium text-sm flex-1">{name}</span>
                    {matchedVoice && (
                      <span className="text-xs text-slate-400">
                        Ses {Number(matchedVoice[0]) + 1}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-auto pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
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

          <div className="p-6 space-y-0">
            {transcripts.map((entry, idx) => {
              const prevEntry = idx > 0 ? transcripts[idx - 1] : null;
              const showSpeaker = !prevEntry || prevEntry.participantName !== entry.participantName;
              const isDragging = draggedId === entry.id;
              const isDropTarget = dragOverIdx === idx;

              return (
                <div key={entry.id}>
                  {/* Drop zone */}
                  <div
                    className={`transition-all ${isDropTarget ? 'h-1 bg-blue-400 rounded-full my-1' : 'h-0'}`}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                  />

                  <div
                    draggable
                    onDragStart={() => handleDragStart(entry.id)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    className={`group flex items-start gap-2 ${showSpeaker ? 'mt-4' : ''} ${isDragging ? 'opacity-30' : ''} transition-opacity`}
                  >
                    {/* Drag handle */}
                    <div className="w-5 pt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing select-none text-slate-300 hover:text-slate-500">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="5" cy="3" r="1.5" />
                        <circle cx="11" cy="3" r="1.5" />
                        <circle cx="5" cy="8" r="1.5" />
                        <circle cx="11" cy="8" r="1.5" />
                        <circle cx="5" cy="13" r="1.5" />
                        <circle cx="11" cy="13" r="1.5" />
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      {showSpeaker && (
                        <div className="flex items-center gap-2 mb-1">
                          <select
                            className={`text-sm font-semibold px-2 py-0.5 rounded-lg ${getColor(entry.speakerIndex).badge} border-0 outline-none cursor-pointer appearance-none bg-transparent`}
                            style={{ backgroundImage: 'none' }}
                            value={entry.participantName}
                            onChange={(e) => handleSpeakerChange(entry.id, e.target.value)}
                          >
                            <option value={entry.participantName}>{entry.participantName}</option>
                            {meeting?.participants
                              .filter((p) => p !== entry.participantName)
                              .map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                          </select>
                          <span className="text-xs text-slate-400 font-mono">
                            {formatTime(entry.timestamp)}
                          </span>
                        </div>
                      )}

                      {editingId === entry.id ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditSave(entry.id);
                            if (e.key === 'Escape') { setEditingId(null); setEditText(''); }
                          }}
                          onBlur={() => {
                            if (editText.trim() && editText !== entry.text) {
                              handleEditSave(entry.id);
                            } else {
                              setEditingId(null);
                              setEditText('');
                            }
                          }}
                          className="w-full text-slate-700 text-sm leading-relaxed px-2 py-1 -mx-2 rounded-lg border border-blue-300 bg-blue-50/50 outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      ) : (
                        <p
                          className="text-slate-700 text-sm leading-relaxed cursor-text hover:bg-white rounded-lg px-2 py-1 -mx-2 transition"
                          onClick={() => {
                            setEditingId(entry.id);
                            setEditText(entry.text);
                          }}
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
                  </div>
                </div>
              );
            })}

            {/* Son drop zone */}
            {draggedId && (
              <div
                className={`transition-all ${dragOverIdx === transcripts.length ? 'h-1 bg-blue-400 rounded-full my-1' : 'h-px'}`}
                onDragOver={(e) => handleDragOver(e, transcripts.length)}
                onDrop={() => handleDrop(transcripts.length)}
              />
            )}

            {interimEntry && (
              <div className="mt-4 opacity-70 flex items-start gap-2">
                <div className="w-5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-semibold px-2 py-0.5 rounded-lg ${getColor(interimEntry.speakerIndex).badge}`}>
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
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>
        </main>
      </div>
    </div>
  );
}
