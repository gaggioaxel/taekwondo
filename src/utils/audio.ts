// Web Audio API Synthesizer for Taekwondo Comic Challenge

class ComicSoundEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Classic pure beep like in user prototype
  playBeep(freq: number, type: OscillatorType = 'sine', duration: number = 0.15, vol: number = 0.3) {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio autoplay policy catch
    }
  }

  // Punch impact (thud + snap noise)
  playPunchImpact(side: 'hong' | 'chong') {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const baseFreq = side === 'hong' ? 180 : 130;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);

      // Noise clapper layer
      const bufferSize = ctx.sampleRate * 0.08;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = side === 'hong' ? 1200 : 900;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();
    } catch {
      // Ignore
    }
  }

  // Chunbi preparation tone
  playChunbi() {
    this.playBeep(440, 'triangle', 0.25, 0.3);
    this.speak('Chunbi');
  }

  // Shijak start whistle & siren
  playShijak() {
    this.playBeep(600, 'square', 0.2, 0.4);
    setTimeout(() => this.playBeep(900, 'square', 0.35, 0.45), 100);
    this.speak('Shijak!');
  }

  // Keuman end gong
  playKeuman() {
    this.playBeep(800, 'square', 0.4, 0.5);
    setTimeout(() => this.playBeep(520, 'sine', 0.6, 0.4), 150);
    this.speak('Keuman!');
  }

  // Speech referee voice
  speak(text: string) {
    if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.15;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore voice error
    }
  }
}

export const soundEngine = new ComicSoundEngine();
