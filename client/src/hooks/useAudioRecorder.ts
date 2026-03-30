import { useRef, useState, useCallback } from 'react';

interface UseAudioRecorderOptions {
  onAudioData: (data: ArrayBuffer) => void;
}

// Ses seviyesi eşik değeri (0-1 arası float RMS).
// Bu değerin altındaki ses "sessizlik" sayılır ve gönderilmez.
const SILENCE_THRESHOLD = 0.008;
// Sessizlikten sonra kaç buffer daha göndermeye devam et (geçiş yumuşatma)
const SILENCE_TAIL_BUFFERS = 3;

export function useAudioRecorder({ onAudioData }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      contextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // High-pass filter: 85Hz altini kes (oda gurultusu, havalandirma, nefes)
      const highpass = audioContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 85;
      highpass.Q.value = 0.7;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // VAD state
      let silenceTail = 0;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);

        // RMS enerji hesapla
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / input.length);

        // Sessizlik kontrolü: insan sesi yoksa gönderme
        if (rms < SILENCE_THRESHOLD) {
          if (silenceTail > 0) {
            silenceTail--;
            // Geçiş bufferlarını gönder (kelimenin sonu kesilmesin)
          } else {
            return; // Sessizlik — gönderme
          }
        } else {
          silenceTail = SILENCE_TAIL_BUFFERS;
        }

        // Float32 -> Int16 PCM
        const pcmData = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onAudioData(pcmData.buffer);
      };

      // source -> highpass -> processor
      source.connect(highpass);
      highpass.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err) {
      console.error('Mikrofon erişimi reddedildi:', err);
      throw err;
    }
  }, [onAudioData]);

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  return { isRecording, startRecording, stopRecording };
}
