import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { config } from '../config';
import { store } from '../store';
import { TranscriptEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';

type TranscriptCallback = (entry: TranscriptEntry, isFinal: boolean) => void;

export class DeepgramBridge {
  private connection: any = null;
  private meetingId: string;
  private onTranscript: TranscriptCallback;
  private meetingStartTime: number;

  constructor(meetingId: string, onTranscript: TranscriptCallback) {
    this.meetingId = meetingId;
    this.onTranscript = onTranscript;
    this.meetingStartTime = Date.now();
  }

  async start(): Promise<void> {
    const deepgram = createClient(config.deepgramApiKey);

    this.connection = deepgram.listen.live({
      model: 'nova-3',
      language: 'tr',
      smart_format: true,
      punctuate: true,
      diarize: true,
      interim_results: true,
      utterance_end_ms: 1500,
      endpointing: 300,
      encoding: 'linear16',
      sample_rate: 16000,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log(`[Deepgram] Connection opened for meeting ${this.meetingId}`);
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const alternative = data.channel?.alternatives?.[0];
      if (!alternative || !alternative.transcript) return;

      const transcript = alternative.transcript.trim();
      if (!transcript) return;

      const words = alternative.words || [];
      const isFinal = data.is_final === true;

      const segments = this.groupWordsBySpeaker(words);

      for (const segment of segments) {
        const meeting = store.getMeeting(this.meetingId);
        if (!meeting) continue;

        let participantName = meeting.speakerMap[segment.speakerIndex];
        if (!participantName) {
          const mappedCount = Object.keys(meeting.speakerMap).length;
          if (mappedCount < meeting.participants.length) {
            participantName = meeting.participants[mappedCount];
          } else {
            participantName = `Konuşmacı ${segment.speakerIndex + 1}`;
          }
          store.updateSpeakerMap(this.meetingId, segment.speakerIndex, participantName);
        }

        const elapsedSeconds = (Date.now() - this.meetingStartTime) / 1000;

        const entry: TranscriptEntry = {
          id: uuidv4(),
          speakerIndex: segment.speakerIndex,
          participantName,
          text: segment.text,
          timestamp: Math.round(elapsedSeconds),
          isFinal,
        };

        if (isFinal) {
          store.addTranscriptEntry(this.meetingId, entry);
        }

        this.onTranscript(entry, isFinal);
      }
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error(`[Deepgram] Error for meeting ${this.meetingId}:`, error);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log(`[Deepgram] Connection closed for meeting ${this.meetingId}`);
    });
  }

  sendAudio(audio: Buffer): void {
    if (this.connection) {
      this.connection.send(audio);
    }
  }

  stop(): void {
    if (this.connection) {
      this.connection.requestClose();
      this.connection = null;
    }
  }

  private groupWordsBySpeaker(words: any[]): { speakerIndex: number; text: string }[] {
    if (words.length === 0) return [];

    const segments: { speakerIndex: number; text: string }[] = [];
    let currentSpeaker = words[0].speaker ?? 0;
    let currentWords: string[] = [words[0].punctuated_word || words[0].word];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const speaker = word.speaker ?? 0;

      if (speaker !== currentSpeaker) {
        segments.push({
          speakerIndex: currentSpeaker,
          text: currentWords.join(' '),
        });
        currentSpeaker = speaker;
        currentWords = [];
      }
      currentWords.push(word.punctuated_word || word.word);
    }

    segments.push({
      speakerIndex: currentSpeaker,
      text: currentWords.join(' '),
    });

    return segments;
  }
}
