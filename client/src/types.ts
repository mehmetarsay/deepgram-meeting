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
