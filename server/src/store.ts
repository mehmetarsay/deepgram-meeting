import { v4 as uuidv4 } from 'uuid';
import { Meeting, TranscriptEntry } from './types';

class MeetingStore {
  private meetings = new Map<string, Meeting>();

  createMeeting(name: string, participants: string[]): Meeting {
    const meeting: Meeting = {
      id: uuidv4(),
      name,
      participants,
      speakerMap: {},
      transcript: [],
      status: 'lobby',
      createdAt: Date.now(),
    };
    this.meetings.set(meeting.id, meeting);
    return meeting;
  }

  getMeeting(id: string): Meeting | undefined {
    return this.meetings.get(id);
  }

  startMeeting(id: string): Meeting | undefined {
    const meeting = this.meetings.get(id);
    if (meeting) {
      meeting.status = 'active';
      meeting.startedAt = Date.now();
    }
    return meeting;
  }

  addTranscriptEntry(meetingId: string, entry: TranscriptEntry): void {
    const meeting = this.meetings.get(meetingId);
    if (meeting) {
      meeting.transcript.push(entry);
    }
  }

  updateTranscriptEntry(
    meetingId: string,
    entryId: string,
    updates: Partial<Pick<TranscriptEntry, 'text' | 'participantName'>>
  ): TranscriptEntry | undefined {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return undefined;

    const entry = meeting.transcript.find((e) => e.id === entryId);
    if (!entry) return undefined;

    if (updates.text !== undefined) entry.text = updates.text;
    if (updates.participantName !== undefined) entry.participantName = updates.participantName;
    return entry;
  }

  updateSpeakerMap(meetingId: string, speakerIndex: number, participantName: string): void {
    const meeting = this.meetings.get(meetingId);
    if (meeting) {
      meeting.speakerMap[speakerIndex] = participantName;
    }
  }

  endMeeting(id: string): Meeting | undefined {
    const meeting = this.meetings.get(id);
    if (meeting) {
      meeting.status = 'ended';
      meeting.endedAt = Date.now();
    }
    return meeting;
  }

  updateParticipants(id: string, participants: string[]): Meeting | undefined {
    const meeting = this.meetings.get(id);
    if (meeting) {
      meeting.participants = participants;
    }
    return meeting;
  }
}

export const store = new MeetingStore();
