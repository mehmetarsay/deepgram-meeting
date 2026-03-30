/**
 * Server tarafı ses ön-işleme modülü.
 * Deepgram'a göndermeden önce sesi işleyerek diarization kalitesini artırır.
 */

export class AudioPreprocessor {
  private prevSample = 0;
  private energyHistory: number[] = [];
  private readonly maxHistory = 50;

  /**
   * Pre-emphasis filtresi: Yüksek frekansları güçlendirir.
   * Farklı konuşmacıların formant (F2, F3, F4) farklılıklarını vurgular.
   * Bu frekanslar 1-4 kHz aralığında olup ses kimliğinin en ayırt edici bileşenidir.
   *
   * Formül: y[n] = x[n] - α * x[n-1], α = 0.97
   */
  applyPreEmphasis(audio: Buffer): Buffer {
    const samples = new Int16Array(audio.buffer, audio.byteOffset, audio.length / 2);
    const output = new Int16Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      const val = samples[i] - 0.97 * this.prevSample;
      output[i] = Math.max(-32768, Math.min(32767, Math.round(val)));
      this.prevSample = samples[i];
    }

    return Buffer.from(output.buffer, output.byteOffset, output.byteLength);
  }

  /**
   * Ses seviyesini normalize eder.
   * Mikrofondan uzak/yakın konuşmacıların seslerinin tutarlı olmasını sağlar.
   */
  normalize(audio: Buffer, targetRms = 3000): Buffer {
    const samples = new Int16Array(audio.buffer, audio.byteOffset, audio.length / 2);

    // RMS hesapla
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / samples.length);

    // Çok sessiz ise (sessizlik) olduğu gibi bırak
    if (rms < 100) return audio;

    // Enerji geçmişini güncelle (ani dalgalanmayı önlemek için)
    this.energyHistory.push(rms);
    if (this.energyHistory.length > this.maxHistory) {
      this.energyHistory.shift();
    }

    // Ortalama enerji üzerinden gain hesapla
    const avgRms = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const gain = Math.min(targetRms / Math.max(avgRms, 1), 5); // Max 5x amplifikasyon

    const output = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const val = Math.round(samples[i] * gain);
      output[i] = Math.max(-32768, Math.min(32767, val));
    }

    return Buffer.from(output.buffer, output.byteOffset, output.byteLength);
  }

  /**
   * Tam işleme pipeline'ı: normalize → pre-emphasis
   */
  process(audio: Buffer): Buffer {
    const normalized = this.normalize(audio);
    return this.applyPreEmphasis(normalized);
  }
}
