import { WebSocket } from 'ws';
import { store } from '../store';
import { DeepgramBridge } from './deepgram';
import { ClientMessage, ServerMessage } from '../types';

export function handleConnection(ws: WebSocket): void {
  let bridge: DeepgramBridge | null = null;
  let meetingId: string | null = null;

  ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
    if (isBinary || (Buffer.isBuffer(data) && meetingId)) {
      if (bridge) {
        bridge.sendAudio(Buffer.isBuffer(data) ? data : Buffer.from(data));
      }
      return;
    }

    try {
      const message: ClientMessage = JSON.parse(data.toString());

      if (message.type === 'join') {
        meetingId = message.meetingId;
        const meeting = store.getMeeting(meetingId);

        if (!meeting) {
          sendMessage(ws, { type: 'error', message: 'Toplantı bulunamadı' });
          return;
        }

        if (meeting.status === 'lobby') {
          store.startMeeting(meetingId);
        }

        bridge = new DeepgramBridge(meetingId, (entry, isFinal) => {
          if (ws.readyState === WebSocket.OPEN) {
            sendMessage(ws, {
              type: isFinal ? 'transcript_final' : 'transcript',
              entry,
            });
          }
        });

        await bridge.start();
        console.log(`[WS] Client joined meeting ${meetingId}`);
      }

      if (message.type === 'end') {
        if (bridge) {
          bridge.stop();
          bridge = null;
        }
        if (meetingId) {
          const meeting = store.endMeeting(meetingId);
          if (meeting) {
            sendMessage(ws, { type: 'meeting_ended', meeting });
          }
        }
      }
    } catch (err) {
      // Binary data that wasn't caught above
      if (bridge) {
        bridge.sendAudio(Buffer.isBuffer(data) ? data : Buffer.from(data));
      }
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected from meeting ${meetingId}`);
    if (bridge) {
      bridge.stop();
      bridge = null;
    }
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error:`, error);
    if (bridge) {
      bridge.stop();
      bridge = null;
    }
  });
}

function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
