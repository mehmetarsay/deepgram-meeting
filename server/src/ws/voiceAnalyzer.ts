/**
 * Ses özelliklerini analiz ederek konuşmacıları tanımlayan modül.
 * Her konuşmacı için pitch, enerji ve zero-crossing rate profili oluşturur.
 * Bilinmeyen konuşmacılar en yakın profile göre eşleştirilir.
 */

export interface VoiceProfile {
  speakerIndex: number;
  avgPitch: number;
  avgEnergy: number;
  avgZcr: number;
  sampleCount: number;
}

interface AudioChunk {
  sampleOffset: number; // başlangıçtan itibaren toplam sample sayısı
  data: Int16Array;
}

export class VoiceAnalyzer {
  private audioBuffer: AudioChunk[] = [];
  private totalSamplesReceived = 0;
  private profiles = new Map<number, VoiceProfile>();
  private sampleRate: number;
  private maxBufferSeconds = 60;

  constructor(sampleRate = 16000) {
    this.sampleRate = sampleRate;
  }

  /** Gelen ses verisini zaman damgalı olarak tampona ekler */
  addAudio(audio: Buffer): void {
    const int16 = new Int16Array(
      audio.buffer,
      audio.byteOffset,
      audio.length / 2
    );
    this.audioBuffer.push({
      sampleOffset: this.totalSamplesReceived,
      data: Int16Array.from(int16),
    });
    this.totalSamplesReceived += int16.length;

    // Eski verileri temizle
    const cutoffSample =
      this.totalSamplesReceived - this.maxBufferSeconds * this.sampleRate;
    if (cutoffSample > 0) {
      this.audioBuffer = this.audioBuffer.filter(
        (c) => c.sampleOffset + c.data.length > cutoffSample
      );
    }
  }

  /**
   * Deepgram'dan gelen kelime zaman aralığı için ses özelliklerini çıkarıp
   * ilgili konuşmacı profilini günceller.
   */
  updateProfile(speakerIndex: number, startSec: number, endSec: number): void {
    const startSample = Math.floor(startSec * this.sampleRate);
    const endSample = Math.floor(endSec * this.sampleRate);
    const samples = this.extractSamples(startSample, endSample);

    if (samples.length < 160) return; // 10ms'den kısa segmentleri atla

    const pitch = this.estimatePitch(samples);
    const energy = this.calcEnergy(samples);
    const zcr = this.calcZeroCrossingRate(samples);

    // Geçersiz pitch'i atla
    if (pitch === 0) return;

    const existing = this.profiles.get(speakerIndex);
    if (existing) {
      const n = existing.sampleCount;
      existing.avgPitch = (existing.avgPitch * n + pitch) / (n + 1);
      existing.avgEnergy = (existing.avgEnergy * n + energy) / (n + 1);
      existing.avgZcr = (existing.avgZcr * n + zcr) / (n + 1);
      existing.sampleCount = n + 1;
    } else {
      this.profiles.set(speakerIndex, {
        speakerIndex,
        avgPitch: pitch,
        avgEnergy: energy,
        avgZcr: zcr,
        sampleCount: 1,
      });
    }
  }

  /**
   * Bilinmeyen bir konuşmacıyı, bilinen konuşmacılar arasından
   * ses profiline en yakın olanla eşleştirir.
   */
  findClosestSpeaker(unknownIndex: number, knownIndices: number[]): number {
    const unknownProfile = this.profiles.get(unknownIndex);
    if (!unknownProfile || knownIndices.length === 0) {
      return knownIndices[0] ?? unknownIndex;
    }

    let bestMatch = knownIndices[0];
    let bestDistance = Infinity;

    for (const knownIdx of knownIndices) {
      const knownProfile = this.profiles.get(knownIdx);
      if (!knownProfile) continue;

      const dist = this.profileDistance(unknownProfile, knownProfile);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = knownIdx;
      }
    }

    console.log(
      `[VoiceAnalyzer] Speaker ${unknownIndex} -> closest match: speaker ${bestMatch} (distance: ${bestDistance.toFixed(3)})`
    );

    return bestMatch;
  }

  /** Tampondaki ses verisinden belirli bir aralığı çıkarır */
  private extractSamples(startSample: number, endSample: number): Int16Array {
    const result: number[] = [];

    for (const chunk of this.audioBuffer) {
      const chunkStart = chunk.sampleOffset;
      const chunkEnd = chunkStart + chunk.data.length;

      if (chunkEnd <= startSample || chunkStart >= endSample) continue;

      const from = Math.max(0, startSample - chunkStart);
      const to = Math.min(chunk.data.length, endSample - chunkStart);

      for (let i = from; i < to; i++) {
        result.push(chunk.data[i]);
      }
    }

    return Int16Array.from(result);
  }

  /** Autocorrelation ile temel frekans (pitch) tahmini */
  private estimatePitch(samples: Int16Array): number {
    const minPeriod = Math.floor(this.sampleRate / 400); // max 400Hz
    const maxPeriod = Math.floor(this.sampleRate / 60); // min 60Hz
    const frameSize = Math.min(samples.length, maxPeriod * 2);

    if (frameSize < maxPeriod) return 0;

    let bestCorrelation = 0;
    let bestPeriod = 0;

    for (let period = minPeriod; period <= maxPeriod && period < frameSize; period++) {
      let correlation = 0;
      let energy1 = 0;
      let energy2 = 0;

      const len = frameSize - period;
      for (let i = 0; i < len; i++) {
        correlation += samples[i] * samples[i + period];
        energy1 += samples[i] * samples[i];
        energy2 += samples[i + period] * samples[i + period];
      }

      const norm = Math.sqrt(energy1 * energy2);
      if (norm > 0) {
        correlation /= norm;
      }

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestPeriod = period;
      }
    }

    // Zayıf korelasyon -> güvenilir pitch yok
    if (bestCorrelation < 0.3 || bestPeriod === 0) return 0;

    return this.sampleRate / bestPeriod;
  }

  /** RMS enerji hesaplama */
  private calcEnergy(samples: Int16Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /** Zero-crossing rate hesaplama */
  private calcZeroCrossingRate(samples: Int16Array): number {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if (
        (samples[i] >= 0 && samples[i - 1] < 0) ||
        (samples[i] < 0 && samples[i - 1] >= 0)
      ) {
        crossings++;
      }
    }
    return crossings / samples.length;
  }

  /** İki profil arasındaki normalize mesafe */
  private profileDistance(a: VoiceProfile, b: VoiceProfile): number {
    // Pitch farkı (en ayırt edici özellik) — ağırlık yüksek
    const pitchDiff =
      Math.abs(a.avgPitch - b.avgPitch) /
      Math.max(a.avgPitch, b.avgPitch, 1);

    // Enerji farkı
    const energyDiff =
      Math.abs(a.avgEnergy - b.avgEnergy) /
      Math.max(a.avgEnergy, b.avgEnergy, 1);

    // ZCR farkı
    const zcrDiff =
      Math.abs(a.avgZcr - b.avgZcr) /
      Math.max(a.avgZcr, b.avgZcr, 0.001);

    // Ağırlıklı mesafe: pitch en önemli
    return Math.sqrt(
      pitchDiff * pitchDiff * 4 +
        energyDiff * energyDiff +
        zcrDiff * zcrDiff
    );
  }
}
