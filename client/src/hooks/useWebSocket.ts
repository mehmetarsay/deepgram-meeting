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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const activeIdRef = useRef(0); // Her bağlantıya unique ID ver
  const callbacksRef = useRef({ onTranscript, onFinalTranscript, onMeetingEnded, onError });

  useEffect(() => {
    callbacksRef.current = { onTranscript, onFinalTranscript, onMeetingEnded, onError };
  }, [onTranscript, onFinalTranscript, onMeetingEnded, onError]);

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const createConnection = useCallback(() => {
    // Bu bağlantıya unique ID ata
    const connectionId = ++activeIdRef.current;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      // Eski bağlantının gecikmeli open'ı ise yoksay
      if (connectionId !== activeIdRef.current) {
        ws.close();
        return;
      }
      setIsConnected(true);
      attemptRef.current = 0;
      ws.send(JSON.stringify({ type: 'join', meetingId }));
    };

    ws.onmessage = (event) => {
      if (connectionId !== activeIdRef.current) return;
      try {
        const message = JSON.parse(event.data);
        const cb = callbacksRef.current;
        switch (message.type) {
          case 'transcript':
            cb.onTranscript(message.entry);
            break;
          case 'transcript_final':
            cb.onFinalTranscript(message.entry);
            break;
          case 'meeting_ended':
            cb.onMeetingEnded(message.meeting);
            break;
          case 'error':
            cb.onError(message.message);
            break;
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      // Bu aktif bağlantı değilse reconnect yapma
      if (connectionId !== activeIdRef.current) return;

      setIsConnected(false);
      wsRef.current = null;

      if (attemptRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, attemptRef.current), 10000);
        attemptRef.current++;
        reconnectTimerRef.current = setTimeout(createConnection, delay);
      } else {
        callbacksRef.current.onError('WebSocket bağlantı hatası — yeniden bağlanılamadı');
      }
    };

    ws.onerror = () => {
      // onclose zaten tetiklenecek
    };
  }, [meetingId]);

  const connect = useCallback(() => {
    clearReconnect();
    attemptRef.current = 0;
    // Mevcut bağlantıyı kapat (onclose reconnect tetiklemesin diye önce ID artır)
    activeIdRef.current++;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    createConnection();
  }, [createConnection, clearReconnect]);

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
    clearReconnect();
    // ID'yi artır — eski bağlantının onclose'u reconnect tetiklemesin
    activeIdRef.current++;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearReconnect]);

  useEffect(() => {
    return () => {
      clearReconnect();
      activeIdRef.current++;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clearReconnect]);

  return { isConnected, connect, sendAudio, endMeeting, disconnect };
}
