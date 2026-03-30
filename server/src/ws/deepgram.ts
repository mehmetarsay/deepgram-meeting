import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { config } from '../config';
import { store } from '../store';
import { TranscriptEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { VoiceAnalyzer } from './voiceAnalyzer';

type TranscriptCallback = (entry: TranscriptEntry, isFinal: boolean) => void;

interface SpeakerSegment {
  speakerIndex: number;
  text: string;
  startTime: number;
  endTime: number;
}

export class DeepgramBridge {
  private connection: any = null;
  private meetingId: string;
  private onTranscript: TranscriptCallback;
  private meetingStartTime: number;
  private voiceAnalyzer: VoiceAnalyzer;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(meetingId: string, onTranscript: TranscriptCallback) {
    this.meetingId = meetingId;
    this.onTranscript = onTranscript;
    this.meetingStartTime = Date.now();
    this.voiceAnalyzer = new VoiceAnalyzer(16000);
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

      // Keep-alive: her 8 saniyede bir bağlantıyı canlı tut
      this.keepAliveTimer = setInterval(() => {
        if (this.connection) {
          try {
            this.connection.keepAlive();
          } catch {
            // ignore
          }
        }
      }, 8000);
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

        // Ses profilini güncelle (final sonuçlarda)
        if (isFinal && segment.startTime >= 0 && segment.endTime > segment.startTime) {
          this.voiceAnalyzer.updateProfile(
            segment.speakerIndex,
            segment.startTime,
            segment.endTime
          );
        }

        // Konuşmacı eşleştirme: kullanıcı eşleştirmediyse genel isim kullan
        let participantName = meeting.speakerMap[segment.speakerIndex];
        if (!participantName) {
          participantName = `Ses ${segment.speakerIndex + 1}`;
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
      // Ham sesi VoiceAnalyzer'a ver (profil oluşturma için)
      this.voiceAnalyzer.addAudio(audio);
      // Deepgram'a ham ses gönder — kendi diarization modeli işlesin
      this.connection.send(audio);
    }
  }

  stop(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.connection) {
      this.connection.requestClose();
      this.connection = null;
    }
  }

  private groupWordsBySpeaker(words: any[]): SpeakerSegment[] {
    if (words.length === 0) return [];

    const segments: SpeakerSegment[] = [];
    let currentSpeaker = words[0].speaker ?? 0;
    let currentWords: string[] = [words[0].punctuated_word || words[0].word];
    let segmentStart: number = words[0].start ?? 0;

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const speaker = word.speaker ?? 0;

      if (speaker !== currentSpeaker) {
        segments.push({
          speakerIndex: currentSpeaker,
          text: currentWords.join(' '),
          startTime: segmentStart,
          endTime: words[i - 1].end ?? segmentStart,
        });
        currentSpeaker = speaker;
        currentWords = [];
        segmentStart = word.start ?? 0;
      }
      currentWords.push(word.punctuated_word || word.word);
    }

    segments.push({
      speakerIndex: currentSpeaker,
      text: currentWords.join(' '),
      startTime: segmentStart,
      endTime: words[words.length - 1].end ?? segmentStart,
    });

    return segments;
  }
}
