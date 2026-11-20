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

  // ---- Segnali senza voce: "ping" che scandiscono il countdown e "paang" per via e fine ----

  /** 'voce' = arbitro registrato; 'ping' = solo segnali acustici (ping, paang) */
  public signalMode: SignalMode = 'voce';

  /**
   * Un rintocco: somma di sinusoidi (frequenza, peso) con attacco rapido, breve tenuta e coda che si spegne.
   * Restituisce la durata in secondi.
   */
  private tone(partials: [number, number][], dur: number, vol: number, hold = 0.02, delay = 0): number {
    if (this.isMuted) return 0;
    const ctx = this.getAudioContext();
    if (!ctx) return 0;
    try {
      const t0 = ctx.currentTime + delay;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.004);
      gain.gain.setValueAtTime(vol, t0 + 0.004 + hold);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      gain.connect(ctx.destination);
      const total = partials.reduce((a, [, w]) => a + w, 0);
      for (const [f, w] of partials) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        g.gain.value = w / total;
        osc.connect(g);
        g.connect(gain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      }
    } catch {
      // Audio autoplay policy
    }
    return delay + dur;
  }

  /** "Ping" del countdown: medio da 10 a 4, più acuto negli ultimi 3 secondi */
  private ping(n: number): number {
    const f = n <= 3 ? 880 : 660;
    return this.tone([[f, 1], [f * 2, 0.3], [f * 3, 0.08]], 0.22, n <= 3 ? 0.5 : 0.4);
  }

  /** Segnale al posto del comando vocale; restituisce la durata */
  private signal(cmd: RefereeCommand): number {
    switch (cmd) {
      case 'chunbi': // ding-ding: attenzione, in posizione
        this.tone([[660, 1], [1320, 0.3]], 0.2, 0.4);
        return this.tone([[660, 1], [1320, 0.3]], 0.25, 0.4, 0.02, 0.16);
      case 'shijak': // PAANG acuto e lungo: via!
        return this.tone([[1320, 1], [660, 0.45], [2640, 0.2], [1980, 0.1]], 1.0, 0.6, 0.3);
      case 'keuman': // PAANG grave e più lungo: stop
        return this.tone([[523, 1], [1046, 0.5], [784, 0.3], [261, 0.25]], 1.5, 0.65, 0.4);
      case 'baro': // ping-PING che sale: di nuovo in posizione
        this.tone([[880, 1], [1760, 0.25]], 0.2, 0.45);
        return this.tone([[1175, 1], [2350, 0.25]], 0.35, 0.5, 0.05, 0.16);
    }
  }

  // Chunbi preparation tone
  playChunbi() {
    if (this.signalMode === 'voce') this.playBeep(440, 'triangle', 0.25, 0.3);
    this.sayCommand('chunbi');
  }

  // Shijak: prima la voce, poi il fischio (così il segnale non copre la parola)
  playShijak() {
    if (this.signalMode === 'ping') {
      this.sayCommand('shijak'); // il paang è già il segnale di via
      return;
    }
    const whistle = () => {
      this.playBeep(600, 'square', 0.2, 0.3);
      setTimeout(() => this.playBeep(900, 'square', 0.3, 0.3), 100);
    };
    this.sayCommand('shijak').then((dur) => setTimeout(whistle, dur * 1000));
  }

  // Keuman end gong, poi "Baro!" (tornare in posizione)
  private baroTimer: ReturnType<typeof setTimeout> | null = null;
  /** Se attivo, 5 secondi dopo "Keuman" l'arbitro dice "Baro" (tornare in posizione) */
  public baroEnabled = true;
  public baroDelayMs = 5000;
  /** Chiamata nell'istante in cui l'arbitro dice "Baro" (per mostrare il fumetto) */
  public onBaro: (() => void) | null = null;

  playKeuman() {
    const gong = () => {
      this.playBeep(800, 'square', 0.4, 0.35);
      setTimeout(() => this.playBeep(520, 'sine', 0.6, 0.3), 150);
    };
    this.cancelBaro();
    if (this.signalMode === 'ping') this.sayCommand('keuman'); // il paang grave fa già da gong
    // Prima "Keuman", poi il gong; "Baro" 5 secondi dopo Keuman (se attivo)
    else this.sayCommand('keuman').then((dur) => setTimeout(gong, dur * 1000));
    if (this.baroEnabled) {
      this.baroTimer = setTimeout(() => {
        this.baroTimer = null;
        this.sayCommand('baro');
        this.onBaro?.();
      }, this.baroDelayMs);
    }
  }

  private cancelBaro() {
    if (this.baroTimer) clearTimeout(this.baroTimer);
    this.baroTimer = null;
  }

  // Countdown tick: voce registrata se c'è, altrimenti beep + sintesi del browser
  playCountdownTick(n: number) {
    this.cancelBaro();
    if (this.signalMode === 'ping') {
      this.ping(n);
      return;
    }
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
    if (this.signalMode === 'ping' || await this.hasRecordedVoice(this.voiceLang)) {
      [3, 2, 1].forEach((n, i) => setTimeout(() => this.playCountdownTick(n), i * 1000));
      setTimeout(() => this.sayCommand('shijak'), 3000);
      return;
    }
    const native = this.hasNativeVoice();
    const nums = [3, 2, 1].map(n => countWord(this.voiceLang, n, native)).join(', ');
    this.speak(`${nums}, ${COMMANDS[this.voiceLang][native ? 'native' : 'fallback'].shijak}`, true);
  }

  /** Dice il comando; restituisce la durata del clip registrato in secondi (0 se usa la voce del browser). */
  sayCommand(cmd: RefereeCommand): Promise<number> {
    if (this.signalMode === 'ping') return Promise.resolve(this.signal(cmd));
    return this.playClipOr('cmd', cmd, () => this.speakCommand(cmd));
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
    this.loadClip('cmd', 'baro'); // facoltativo: se manca, "Baro" lo dice la voce del browser
    return all.every(Boolean);
  }

  async hasRecordedVoice(lang: VoiceLang): Promise<boolean> {
    return !!(await this.loadClip(lang, '1'));
  }

  private playClipOr(group: string, name: string, fallback: () => void): Promise<number> {
    if (this.isMuted) return Promise.resolve(0);
    return this.loadClip(group, name).then((buf) => {
      const ctx = this.getAudioContext();
      if (!buf || !ctx) {
        fallback();
        return 0;
      }
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
      return buf.duration;
    });
  }

  stopVoice() {
    this.cancelBaro();
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
export type SignalMode = 'voce' | 'ping';
/** Ritardo del 바로 (Ba-ro) dopo 그만, in secondi (0 = spento) */
export const BARO_OPTIONS = [0, 1, 3, 5, 7];
export type RefereeCommand = 'chunbi' | 'shijak' | 'keuman' | 'baro';

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
    native: { chunbi: '준비', shijak: '시작!', keuman: '그만!', baro: '바로!' },
    fallback: { chunbi: 'Chunbi', shijak: 'Shijak!', keuman: 'Keuman!', baro: 'Baro!' },
  },
  it: {
    native: { chunbi: 'Ciunbì', shijak: 'Scigiàk!', keuman: 'Kéuman!', baro: 'Barò!' },
    fallback: { chunbi: 'Chunbi', shijak: 'Shijak!', keuman: 'Keuman!', baro: 'Baro!' },
  },
  en: {
    native: { chunbi: 'Chun-bee', shijak: 'Shee-jahk!', keuman: 'Keu-mahn!', baro: 'Bah-roh!' },
    fallback: { chunbi: 'Chunbi', shijak: 'Shijak!', keuman: 'Keuman!', baro: 'Baro!' },
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
