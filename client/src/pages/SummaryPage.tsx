import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Meeting } from '../types';

export default function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/meetings/${id}`)
      .then((res) => res.json())
      .then(setMeeting);
  }, [id]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatDuration = () => {
    if (!meeting?.startedAt || !meeting?.endedAt) return '-';
    const seconds = Math.floor((meeting.endedAt - meeting.startedAt) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs} saniye`;
    return `${mins} dk ${secs} sn`;
  };

  const getTranscriptText = () => {
    if (!meeting) return '';
    return meeting.transcript
      .map((t) => `[${formatTime(t.timestamp)}] ${t.participantName}: ${t.text}`)
      .join('\n');
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(getTranscriptText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAsText = () => {
    const blob = new Blob([getTranscriptText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting?.name || 'toplanti'}-kayit.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const colors = [
    'bg-blue-100 text-blue-800',
    'bg-emerald-100 text-emerald-800',
    'bg-violet-100 text-violet-800',
    'bg-amber-100 text-amber-800',
    'bg-rose-100 text-rose-800',
    'bg-cyan-100 text-cyan-800',
  ];

  const speakerColors: Record<string, string> = {};
  meeting.participants.forEach((p, i) => {
    speakerColors[p] = colors[i % colors.length];
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-3xl mx-auto py-10 px-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-sm font-medium text-emerald-600 mb-1">Toplanti Tamamlandi</p>
              <h1 className="text-2xl font-bold text-slate-900">{meeting.name}</h1>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Sure</p>
              <p className="font-bold text-slate-800 text-lg">{formatDuration()}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Katilimci</p>
              <p className="font-bold text-slate-800 text-lg">{meeting.participants.length}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Konusma</p>
              <p className="font-bold text-slate-800 text-lg">{meeting.transcript.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {meeting.participants.map((name, i) => (
              <span
                key={name}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${colors[i % colors.length]}`}
              >
                {name}
              </span>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm hover:bg-slate-800 active:scale-95 transition-all font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? 'Kopyalandi!' : 'Panoya Kopyala'}
            </button>
            <button
              onClick={downloadAsText}
              className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-sm hover:bg-slate-50 active:scale-95 transition-all font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              TXT Indir
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 active:scale-95 transition-all font-medium ml-auto"
            >
              Yeni Toplanti
            </button>
          </div>
        </div>

        {/* Transcript card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Toplanti Kaydi</h2>

          {meeting.transcript.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <p className="text-slate-400">Bu toplantida kayit bulunamadi</p>
            </div>
          ) : (
            <div className="space-y-1">
              {meeting.transcript.map((entry, idx) => {
                const prev = idx > 0 ? meeting.transcript[idx - 1] : null;
                const showSpeaker = !prev || prev.participantName !== entry.participantName;

                return (
                  <div key={entry.id} className={showSpeaker ? 'mt-5 first:mt-0' : ''}>
                    {showSpeaker && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-lg ${speakerColors[entry.participantName] || 'bg-slate-100 text-slate-700'}`}>
                          {entry.participantName}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {formatTime(entry.timestamp)}
                        </span>
                      </div>
                    )}
                    <p className="text-slate-700 text-sm leading-relaxed pl-0.5">
                      {!showSpeaker && (
                        <span className="text-xs text-slate-400 font-mono mr-2">
                          {formatTime(entry.timestamp)}
                        </span>
                      )}
                      {entry.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
