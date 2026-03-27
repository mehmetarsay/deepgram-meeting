export interface TranscriptEntry {
  id: string;
  speakerIndex: number;
  participantName: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface Meeting {
  id: string;
  name: string;
  participants: string[];
  speakerMap: Record<number, string>;
  transcript: TranscriptEntry[];
  status: 'lobby' | 'active' | 'ended';
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export type ClientMessage =
  | { type: 'join'; meetingId: string }
  | { type: 'end' };

export type ServerMessage =
  | { type: 'transcript'; entry: TranscriptEntry }
  | { type: 'transcript_final'; entry: TranscriptEntry }
  | { type: 'meeting_ended'; meeting: Meeting }
  | { type: 'error'; message: string };
