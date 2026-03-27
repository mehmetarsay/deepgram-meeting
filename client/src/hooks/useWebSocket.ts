import { useRef, useState, useCallback, useEffect } from 'react';
import { TranscriptEntry, Meeting } from '../types';

interface UseWebSocketOptions {
  meetingId: string;
  onTranscript: (entry: TranscriptEntry) => void;
  onFinalTranscript: (entry: TranscriptEntry) => void;
  onMeetingEnded: (meeting: Meeting) => void;
  onError: (message: string) => void;
}

export function useWebSocket({
  meetingId,
  onTranscript,
  onFinalTranscript,
  onMeetingEnded,
  onError,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: 'join', meetingId }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'transcript':
            onTranscript(message.entry);
            break;
          case 'transcript_final':
            onFinalTranscript(message.entry);
            break;
          case 'meeting_ended':
            onMeetingEnded(message.meeting);
            break;
          case 'error':
            onError(message.message);
            break;
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      onError('WebSocket bağlantı hatası');
    };

    wsRef.current = ws;
  }, [meetingId, onTranscript, onFinalTranscript, onMeetingEnded, onError]);

  const sendAudio = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const endMeeting = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { isConnected, connect, sendAudio, endMeeting, disconnect };
}
