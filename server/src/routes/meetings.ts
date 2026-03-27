import { Router } from 'express';
import { store } from '../store';

const router = Router();

router.post('/meetings', (req, res) => {
  const { name, participants } = req.body;
  if (!name || !Array.isArray(participants)) {
    res.status(400).json({ error: 'name and participants are required' });
    return;
  }
  const meeting = store.createMeeting(name, participants);
  res.status(201).json(meeting);
});

router.get('/meetings/:id', (req, res) => {
  const id = req.params.id as string;
  const meeting = store.getMeeting(id);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }
  res.json(meeting);
});

router.patch('/meetings/:id/participants', (req, res) => {
  const { participants } = req.body;
  if (!Array.isArray(participants)) {
    res.status(400).json({ error: 'participants array is required' });
    return;
  }
  const id = req.params.id as string;
  const meeting = store.updateParticipants(id, participants);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }
  res.json(meeting);
});

router.post('/meetings/:id/start', (req, res) => {
  const id = req.params.id as string;
  const meeting = store.startMeeting(id);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }
  res.json(meeting);
});

router.patch('/meetings/:id/transcript/:entryId', (req, res) => {
  const id = req.params.id as string;
  const entryId = req.params.entryId as string;
  const { text, participantName } = req.body;
  const entry = store.updateTranscriptEntry(id, entryId, {
    text,
    participantName,
  });
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }
  res.json(entry);
});

router.patch('/meetings/:id/transcript/:entryId/reorder', (req, res) => {
  const id = req.params.id as string;
  const entryId = req.params.entryId as string;
  const { newIndex } = req.body;
  if (typeof newIndex !== 'number') {
    res.status(400).json({ error: 'newIndex is required' });
    return;
  }
  const success = store.reorderTranscript(id, entryId, newIndex);
  if (!success) {
    res.status(404).json({ error: 'Entry or meeting not found' });
    return;
  }
  res.json({ success: true });
});

router.patch('/meetings/:id/speakers', (req, res) => {
  const id = req.params.id as string;
  const { speakerIndex, participantName } = req.body;
  if (speakerIndex === undefined || !participantName) {
    res.status(400).json({ error: 'speakerIndex and participantName are required' });
    return;
  }
  store.updateSpeakerMap(id, speakerIndex, participantName);
  const meeting = store.getMeeting(id);
  res.json(meeting);
});

router.post('/meetings/:id/end', (req, res) => {
  const id = req.params.id as string;
  const meeting = store.endMeeting(id);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }
  res.json(meeting);
});

export default router;
