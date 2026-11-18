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

  /** Da chiamare dentro un clic: sblocca l'audio del browser (autoplay policy) prima che parta la voce */
  unlock() {
    const ctx = this.getAudioContext();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
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
    this.sayCommand('chunbi');
  }

  // Shijak start whistle & siren
  playShijak() {
    this.playBeep(600, 'square', 0.2, 0.3);
    setTimeout(() => this.playBeep(900, 'square', 0.3, 0.3), 100);
    this.sayCommand('shijak');
  }

  // Keuman end gong
  playKeuman() {
    this.playBeep(800, 'square', 0.4, 0.35);
    setTimeout(() => this.playBeep(520, 'sine', 0.6, 0.3), 150);
    this.sayCommand('keuman');
  }

  // Countdown tick: voce registrata se c'è, altrimenti beep + sintesi del browser
  playCountdownTick(n: number) {
    this.playClipOr(this.voiceLang, String(n), () => {
      this.playBeep(n <= 3 ? 880 : 660, 'sine', 0.12, 0.25);
      this.speak(countWord(this.voiceLang, n, this.hasNativeVoice()), true);
    });
  }

  // ---- Referee voice ----

  public voiceLang: VoiceLang = 'ko';
  /** voiceURI scelto dall'utente; null = scelta automatica della voce migliore */
  public voiceURI: string | null = null;

  /** Anteprima della voce: "3, 2, 1, Shijak!" */
  async previewVoice() {
    this.unlock();
    if (await this.hasRecordedVoice(this.voiceLang)) {
      [3, 2, 1].forEach((n, i) => setTimeout(() => this.playCountdownTick(n), i * 1000));
      setTimeout(() => this.sayCommand('shijak'), 3000);
      return;
    }
    const native = this.hasNativeVoice();
    const nums = [3, 2, 1].map(n => countWord(this.voiceLang, n, native)).join(', ');
    this.speak(`${nums}, ${COMMANDS[this.voiceLang][native ? 'native' : 'fallback'].shijak}`, true);
  }

  sayCommand(cmd: RefereeCommand) {
    this.playClipOr('cmd', cmd, () => this.speakCommand(cmd));
  }

  speakCommand(cmd: RefereeCommand) {
    this.speak(COMMANDS[this.voiceLang][this.hasNativeVoice() ? 'native' : 'fallback'][cmd], true);
  }

  // ---- Clip registrati (public/voices/<gruppo>/<nome>.mp3, generati da scripts/generate-voices.ts) ----

  private clips = new Map<string, Promise<AudioBuffer | null>>();
  private currentClip: AudioBufferSourceNode | null = null;

  private loadClip(group: string, name: string): Promise<AudioBuffer | null> {
    const key = `${group}/${name}`;
    let p = this.clips.get(key);
    if (!p) {
      p = (async () => {
        const ctx = this.getAudioContext();
        if (!ctx) return null;
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}voices/${key}.mp3`);
          if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) return null;
          return await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          return null;
        }
      })();
      this.clips.set(key, p);
    }
    return p;
  }

  /** Precarica conteggio e comandi di una lingua; true se la voce registrata è disponibile. */
  async preloadVoice(lang: VoiceLang): Promise<boolean> {
    const all = await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => this.loadClip(lang, String(i + 1))),
      this.loadClip('cmd', 'chunbi'), this.loadClip('cmd', 'shijak'), this.loadClip('cmd', 'keuman'),
    ]);
    return all.every(Boolean);
  }

  async hasRecordedVoice(lang: VoiceLang): Promise<boolean> {
    return !!(await this.loadClip(lang, '1'));
  }

  private playClipOr(group: string, name: string, fallback: () => void) {
    if (this.isMuted) return;
    this.loadClip(group, name).then((buf) => {
      const ctx = this.getAudioContext();
      if (!buf || !ctx) return fallback();
      try {
        this.currentClip?.stop();
      } catch {
        // already stopped
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      this.currentClip = src;
    });
  }

  stopVoice() {
    try {
      this.currentClip?.stop();
    } catch {
      // already stopped
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** True se c'è una voce installata per la lingua scelta (altrimenti si usa la pronuncia romanizzata) */
  hasNativeVoice(): boolean {
    return voicesFor(this.voiceLang).length > 0;
  }

  pickVoice(): SpeechSynthesisVoice | null {
    const all = getVoices();
    if (this.voiceURI) {
      const chosen = all.find(v => v.voiceURI === this.voiceURI);
      if (chosen) return chosen;
    }
    return bestVoice(voicesFor(this.voiceLang)) ?? bestVoice(voicesFor('it')) ?? bestVoice(voicesFor('en')) ?? null;
  }

  speak(text: string, interrupt: boolean = true) {
    if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      if (interrupt) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = this.pickVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore voice error
    }
  }
}

export type VoiceLang = 'ko' | 'it' | 'en';
export type RefereeCommand = 'chunbi' | 'shijak' | 'keuman';

// Lingue attive nell'interfaccia. Per ora solo coreano: italiano e inglese sono pronti nel codice
// (testi e comandi qui sotto) e si riattivano aggiungendoli a questa lista dopo averne generato i clip.
export const VOICE_LANGS: { id: VoiceLang; label: string }[] = [
  { id: 'ko', label: '🇰🇷 Coreano' },
];

// Conteggio tradizionale coreano del taekwondo (1-10)
const KO_NATIVE = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const KO_ROMAN = ['', 'hana', 'dul', 'set', 'net', 'dasot', 'yosot', 'ilgop', 'yodol', 'ahop', 'yol'];

function countWord(lang: VoiceLang, n: number, native: boolean): string {
  if (lang === 'ko' && n >= 1 && n <= 10) return native ? KO_NATIVE[n] : KO_ROMAN[n];
  return String(n);
}

// Comandi arbitrali: nella lingua nativa se c'è la voce, altrimenti scritti "a orecchio"
const COMMANDS: Record<VoiceLang, Record<'native' | 'fallback', Record<RefereeCommand, string>>> = {
  ko: {
    native: { chunbi: '준비', shijak: '시작!', keuman: '그만!' },
    fallback: { chunbi: 'Chunbi', shijak: 'Shijak!', keuman: 'Keuman!' },
  },
  it: {
    native: { chunbi: 'Ciunbì', shijak: 'Scigiàk!', keuman: 'Kéuman!' },
    fallback: { chunbi: 'Chunbi', shijak: 'Shijak!', keuman: 'Keuman!' },
  },
  en: {
    native: { chunbi: 'Chun-bee', shijak: 'Shee-jahk!', keuman: 'Keu-mahn!' },
    fallback: { chunbi: 'Chunbi', shijak: 'Shijak!', keuman: 'Keuman!' },
  },
};

export function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function voicesFor(lang: VoiceLang): SpeechSynthesisVoice[] {
  return getVoices().filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
}

// Preferisce le voci "di qualità" (Google, neurali, online, premium) a quelle robotiche di sistema
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/natural|neural|online/.test(n)) s += 4;
  if (n.includes('google')) s += 3;
  if (/premium|enhanced/.test(n)) s += 2;
  if (n.includes('espeak')) s -= 3;
  if (v.localService === false) s += 1;
  return s;
}

function bestVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return [...list].sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}

export const soundEngine = new ComicSoundEngine();
