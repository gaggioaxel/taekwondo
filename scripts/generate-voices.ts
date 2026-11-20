/**
 * Genera i clip vocali dell'arbitro (conteggio 1-10 in ko/it/en + comandi coreani)
 * con Gemini TTS o ElevenLabs, poi li ripulisce con ffmpeg (taglio silenzi, volume)
 * e li salva in public/voices/ come MP3.
 *
 * Voce attuale dell'app: Typecast, 현준 Hyunjun (spot), emozione "toneup" 1.6, velocità 1.3×:
 *   npx tsx scripts/generate-voices.ts --provider typecast --force
 *   (originali in .voice-cache/typecast-tc_6a6194d59eea84806aea652c; il confronto tra voci è in voci-prova/ascolta.html)
 *
 * Uso:
 *   npx tsx scripts/generate-voices.ts                         # Gemini, voce Fenrir: 1 richiesta per il conteggio
 *                                                              # + 1 per i comandi, poi divisione automatica
 *   npx tsx scripts/generate-voices.ts --single                # una richiesta per clip (vecchio metodo)
 *   npx tsx scripts/generate-voices.ts --voice Orus            # altra voce Gemini
 *   npx tsx scripts/generate-voices.ts --provider elevenlabs --voice <voice_id>
 *   npx tsx scripts/generate-voices.ts --provider elevenlabs --list   # elenca voci e modelli
 *   npx tsx scripts/generate-voices.ts --provider typecast --list     # elenca le voci Typecast
 *   npx tsx scripts/generate-voices.ts --provider typecast --voice tc_... --out tmp/voci-typecast
 *        [--emotion toneup|angry|normal|happy] [--intensity 1.6] [--model ssfm-v31]
 *   npx tsx scripts/generate-voices.ts --only it,cmd --force   # rigenera solo alcuni gruppi
 *   npx tsx scripts/generate-voices.ts --out tmp/voices-test   # cartella diversa (per confronti)
 *   npx tsx scripts/generate-voices.ts --repolish              # rifà solo taglio/volume dagli originali in .voice-cache/
 *   npx tsx scripts/generate-voices.ts --repolish --tempo 1.4  # ...con un'altra velocità (default 2)
 *
 * Chiavi (in .env.local o .env): GEMINI_API_KEY, ELEVENLABS_API_KEY, TYPECAST_API_KEY.
 * Opzioni ElevenLabs: --model <id> (default eleven_multilingual_v2), ELEVENLABS_VOICE_ID al posto di --voice.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const provider = opt('provider', 'gemini') as 'gemini' | 'elevenlabs' | 'typecast';
const outDir = opt('out', 'public/voices')!;
const force = flag('force');
// Velocità della voce senza cambiarne il tono (1 = originale): registrata ben scandita, poi accelerata
// Default: Gemini (registrato lento e scandito) 2×; Typecast (ritmo già naturale) 1.3×, la scelta per l'app
const TEMPO = Number(opt('tempo', provider === 'typecast' ? '1.3' : '2'));
const repolish = flag('repolish'); // rifà solo il post-processing dai file grezzi in cache, senza chiamare l'API
const VOICE = opt('voice', provider === 'gemini' ? 'Fenrir'
  : provider === 'typecast' ? (process.env.TYPECAST_VOICE_ID ?? 'tc_6a6194d59eea84806aea652c') // 현준 Hyunjun
  : process.env.ELEVENLABS_VOICE_ID)!;
const GEMINI_MODEL = opt('model', 'gemini-3.8-flash-tts')!;
// Cache degli originali separata per voce (e per modello Gemini), così i confronti non si sovrascrivono
// (.voice-cache/gemini-Fenrir = vecchie voci, quasi tutte fatte con gemini-3.8-flash-lite-tts)
const CACHE_DIR = path.join('.voice-cache', provider === 'gemini' ? `gemini-${GEMINI_MODEL}-${VOICE}` : `${provider}-${VOICE}`);
// Batch: tutto il conteggio (o tutti i comandi) in UNA richiesta, poi divisione automatica sulle pause.
// Cadenza naturale e uniforme, e 2 richieste invece di 14 (il piano gratuito ne permette 10 al giorno).
// (Typecast legge il conteggio tutto di fila senza pause: lì una richiesta per parola funziona meglio)
const BATCH = provider === 'gemini' && !flag('single');
// Per ora solo coreano + comandi (italiano/inglese disattivati nell'app): --only it,en per generarli
const only = opt('only', 'ko,cmd')!.split(',');
const names = opt('names')?.split(','); // es. --names 5,8 per rigenerare solo alcuni clip

// ---------- Testi ----------
type Group = 'ko' | 'it' | 'en' | 'cmd';
type Clip = { group: Group; name: string; text: string; lang: string };

const NUMBERS: Record<'ko' | 'it' | 'en', string[]> = {
  ko: ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'],
  it: ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Otto', 'Nove', 'Dieci'],
  en: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'],
};
// I comandi del taekwondo sono in coreano in tutto il mondo: un solo set condiviso
const COMMANDS: Record<string, string> = { chunbi: '준비!', shijak: '시작!', keuman: '그만!', baro: '바로!' };

const clips: Clip[] = [
  ...(['ko', 'it', 'en'] as const).flatMap((lang) =>
    NUMBERS[lang].map((word, i) => ({ group: lang as Group, name: String(i + 1), text: `${word}!`, lang })),
  ),
  ...Object.entries(COMMANDS).map(([name, text]) => ({ group: 'cmd' as Group, name, text, lang: 'ko' })),
].filter((c) => only.includes(c.group) && (!names || names.includes(c.name)));

// Pronuncia: coreano nativo di Seul (non "all'inglese")
const KOREAN_PRONUNCIATION =
  'Native Seoul Korean pronunciation, never an English accent: word-initial consonants are voiceless as in ' +
  'standard Korean (둘 sounds like a crisp "tul", never an English "dul"), and each word is said as one connected ' +
  'word with the natural emphasis on its last syllable (하나 sounds like "ha-NA!", never "ha... na").';

// Batch numeri: il maestro conta nel dojang
const STYLE_COUNT_BATCH =
  'A Korean taekwondo master counting out loud for the class in the dojang: each number shouted crisply and ' +
  'energetically as one connected word, firm and confident, with a clear pause after every number. ' +
  KOREAN_PRONUNCIATION;

// Batch comandi
const STYLE_CMD_BATCH =
  'A Korean taekwondo referee giving commands to the athletes: each command is one short, explosive, connected ' +
  'word said in one breath, syllables tightly joined, no stretched vowels, loud and firm, with a clear pause ' +
  'after every command. ' + KOREAN_PRONUNCIATION;

// Comandi (준비, 시작, 그만, 바로): una sola parola secca, sillabe attaccate (es. "시작" non deve sembrare "시… 작")
const STYLE =
  'Taekwondo referee shouting a single command word to the athletes: one short, explosive, connected word ' +
  'said in one breath, both syllables tightly joined with no pause between them and no stretched vowels, ' +
  'the first syllable quick and crisp, every consonant clearly pronounced, loud, firm and energetic.';

// Numeri del countdown: devono stare in meno di un secondo (ne arriva uno al secondo)
const STYLE_NUMBERS =
  'Korean taekwondo master counting out loud for the class: energetic, crisp, one connected word, ' +
  'no syllable swallowed, finished within about 0.7 seconds. ' + KOREAN_PRONUNCIATION;

const LANG_NAME: Record<string, string> = { ko: 'Korean', it: 'Italian', en: 'English' };

// ---------- Provider: Gemini ----------
async function ttsGemini(clip: Clip): Promise<Buffer> {
  const style = clip.lang === 'ko'
    ? (clip.group === 'cmd' ? `${STYLE} ${KOREAN_PRONUNCIATION}` : STYLE_NUMBERS)
    : `${clip.group === 'cmd' ? STYLE : STYLE_NUMBERS.replace(KOREAN_PRONUNCIATION, '')} Native ${LANG_NAME[clip.lang]} pronunciation.`;
  return geminiSpeak(clip.text, style, clip.lang);
}

async function geminiSpeak(text: string, style: string, lang: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY mancante: aggiungila in .env.local');
  const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } });
  const model = GEMINI_MODEL;
  if (/^gemini-(2\.5|3\.1)/.test(model)) {
    // I modelli più vecchi non accettano speech_metadata: la regia va nel testo del prompt
    const r: any = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `${style}\n\nSay exactly this Korean text, nothing else: ${text.replaceAll('<long pause>', '...')}` }] }],
      config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } }, languageCode: `${lang}-KR` } } as any,
    });
    const pcm = r?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!pcm) throw new Error(`Nessun audio nella risposta: ${JSON.stringify(r).slice(0, 300)}`);
    // PCM 16 bit 24 kHz mono senza intestazione: aggiungo l'header WAV
    const body = Buffer.from(pcm, 'base64');
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + body.length, 4); h.write('WAVEfmt ', 8);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24);
    h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(body.length, 40);
    return Buffer.concat([h, body]);
  }
  const interaction: any = await (client as any).interactions.create({
    model,
    input: [{
      type: 'user_input',
      content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }],
    }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: VOICE, language: lang }] },
  });
  const data = interaction?.output_audio?.data;
  if (!data) throw new Error(`Nessun audio nella risposta: ${JSON.stringify(interaction).slice(0, 300)}`);
  return Buffer.from(data, 'base64'); // WAV 24 kHz mono
}

// ---------- Provider: Typecast (coreano nativo, emozioni preimpostate) ----------
const TC_BASE = 'https://api.typecast.ai';
const TC_LANG: Record<string, string> = { ko: 'kor', it: 'ita', en: 'eng' };

async function tcFetch(url: string, init: RequestInit = {}) {
  const key = process.env.TYPECAST_API_KEY;
  if (!key) throw new Error('TYPECAST_API_KEY mancante: aggiungila in .env.local');
  const res = await fetch(`${TC_BASE}${url}`, {
    ...init,
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err: any = new Error(`Typecast ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

async function typecastSpeak(text: string, lang: string): Promise<Buffer> {
  if (!VOICE) throw new Error('Serve --voice <voice_id> (o TYPECAST_VOICE_ID). Usa --provider typecast --list per vedere le voci.');
  const res = await tcFetch('/v1/text-to-speech', {
    method: 'POST',
    body: JSON.stringify({
      model: opt('model', 'ssfm-v31'),
      voice_id: VOICE,
      text,
      language: TC_LANG[lang] ?? 'kor',
      prompt: {
        emotion_type: 'preset',
        emotion_preset: opt('emotion', 'toneup'), // tono energico; prova anche "angry" per un comando più duro
        emotion_intensity: Number(opt('intensity', '1.6')),
      },
      output: { audio_format: 'wav', audio_tempo: 1.0, target_lufs: -14 },
    }),
  });
  return Buffer.from(await res.arrayBuffer()); // WAV 44.1 kHz mono
}

async function listTypecast() {
  const r: any = await (await tcFetch(`/v3/voices?model=${opt('model', 'ssfm-v31')}`)).json();
  const voices: any[] = Array.isArray(r) ? r : (r.voices ?? r.data ?? r.items ?? []);
  console.log(`\n${voices.length} voci Typecast (modello ${opt('model', 'ssfm-v31')}):`);
  for (const v of voices) {
    const name = v.voice_name ?? v.name ?? (typeof v.names === 'object' ? Object.values(v.names).join(' / ') : '');
    const emo = (v.emotions ?? v.models?.find?.((m: any) => m.version === opt('model', 'ssfm-v31'))?.emotions ?? []).join(',');
    console.log(`  ${v.voice_id}  ${name}  (${[v.gender, v.age, (v.use_cases ?? []).join('/')].filter(Boolean).join(', ')})${emo ? ' [' + emo + ']' : ''}`);
  }
}

// ---------- Provider: ElevenLabs ----------
const EL_BASE = 'https://api.elevenlabs.io';

async function elFetch(url: string, init: RequestInit = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY mancante: aggiungila in .env.local');
  const res = await fetch(`${EL_BASE}${url}`, {
    ...init,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const err: any = new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

async function ttsElevenLabs(clip: Clip): Promise<Buffer> {
  const voiceId = VOICE;
  if (!voiceId) throw new Error('Serve --voice <voice_id> (o ELEVENLABS_VOICE_ID). Usa --list per vedere le voci.');
  const model = opt('model', 'eleven_multilingual_v2')!;
  // I modelli v3+ capiscono i tag di regia tra parentesi quadre
  const text = /v[3-9]/.test(model) ? `[shouting] ${clip.text}` : clip.text;
  const res = await elFetch(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.3, similarity_boost: 0.8, style: 0.7, use_speaker_boost: true },
    }),
  });
  return Buffer.from(await res.arrayBuffer());
}

async function listElevenLabs() {
  const models: any[] = await (await elFetch('/v1/models')).json();
  console.log('\nModelli TTS:');
  for (const m of models.filter((m) => m.can_do_text_to_speech)) {
    const langs = (m.languages ?? []).map((l: any) => l.language_id).filter((l: string) => ['ko', 'it', 'en'].includes(l));
    console.log(`  ${m.model_id.padEnd(28)} ${m.name}  [${langs.join(', ')}]`);
  }
  const { voices }: any = await (await elFetch('/v1/voices')).json();
  console.log('\nVoci:');
  for (const v of voices) {
    const l = v.labels ?? {};
    console.log(`  ${v.voice_id}  ${v.name}  (${[l.gender, l.age, l.accent, l.description].filter(Boolean).join(', ')})`);
  }
}

// ---------- Post-processing ----------
function ffmpeg(args: string[]): string {
  return execFileSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Taglia il silenzio iniziale/finale lasciando un po' di respiro (attacco e coda della parola
 * non vengono mangiati), porta il picco a -1 dBFS e codifica in MP3 mono.
 */
function polish(input: Buffer, ext: string, outFile: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tkd-voice-'));
  const raw = path.join(tmp, `raw.${ext}`);
  const trimmed = path.join(tmp, 'trimmed.wav');
  fs.writeFileSync(raw, input);
  const LEAD = 0.05; // secondi di silenzio lasciati prima della parola
  const TAIL = 0.18; // secondi lasciati dopo, perché la vocale finale si spenga da sola
  const trim = `silenceremove=start_periods=1:start_threshold=-55dB:start_silence=${LEAD},` +
    `areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=${TAIL},areverse,` +
    `atempo=${TEMPO},afade=t=in:d=0.005`;
  ffmpeg(['-i', raw, '-af', trim, '-ac', '1', '-ar', '44100', trimmed]);
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', trimmed], { encoding: 'utf8' }).stdout);

  // volumedetect scrive le statistiche su stderr: porta il picco a -1 dBFS
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', trimmed, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume: (-?[\d.]+) dB/.exec(probe.stderr ?? '');
  const gain = m ? -1 - Number(m[1]) : 0;

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const fadeOut = dur > 0.1 ? `,afade=t=out:st=${(dur - 0.04).toFixed(3)}:d=0.04` : '';
  ffmpeg(['-i', trimmed, '-af', `volume=${gain.toFixed(2)}dB${fadeOut}`, '-c:a', 'libmp3lame', '-b:a', '96k', outFile]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- Divisione di una registrazione in più parole ----------
const SR = 24000;

function decodePcm(file: string): Float32Array {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const i16 = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 2);
  return Float32Array.from(i16, (v) => v / 32768);
}

/** Trova esattamente `n` parole separate da pause; restituisce [inizio, fine] in secondi. */
function splitWords(file: string, n: number): [number, number][] {
  const a = decodePcm(file);
  const win = SR / 100; // 10 ms
  const env: number[] = [];
  for (let i = 0; i + win <= a.length; i += win) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += a[j] * a[j];
    env.push(10 * Math.log10(e / win + 1e-12));
  }
  const peak = Math.max(...env);
  const thr = Math.max(-50, peak - 35);
  // pezzi di parlato
  const raw: [number, number][] = [];
  let start = -1;
  env.forEach((v, i) => {
    if (v > thr && start < 0) start = i;
    if (v <= thr && start >= 0) { raw.push([start, i]); start = -1; }
  });
  if (start >= 0) raw.push([start, env.length]);
  // unisce i pezzi separati da pause brevi (dentro la stessa parola) finché le parole sono n
  for (let gap = 6; gap <= 60; gap += 2) {
    const words: [number, number][] = [];
    for (const seg of raw) {
      const last = words[words.length - 1];
      if (last && seg[0] - last[1] < gap) last[1] = seg[1];
      else words.push([seg[0], seg[1]]);
    }
    const real = words.filter(([s, e]) => e - s >= 5); // scarta rumori < 50 ms
    if (real.length === n) {
      return real.map(([s, e], k) => {
        const prevEnd = k > 0 ? real[k - 1][1] : 0;
        const nextStart = k < n - 1 ? real[k + 1][0] : env.length;
        const from = Math.max((s - 6) / 100, (prevEnd + s) / 200); // ~60 ms prima, senza invadere la parola prima
        const to = Math.min((e + 15) / 100, (e + nextStart) / 200); // ~150 ms dopo
        return [from, to];
      });
    }
  }
  throw new Error(`Non riesco a dividere ${file} in ${n} parole (trovati ${raw.length} pezzi): controlla l'audio`);
}

function cutWav(file: string, from: number, to: number): Buffer {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ss', from.toFixed(3), '-to', to.toFixed(3), '-ac', '1', '-ar', String(SR), '-f', 'wav', '-'], { maxBuffer: 1 << 26 });
  return r.stdout;
}

// ---------- Main ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.status ?? e?.code;
      const retriable = status === 429 || status === 503 || /429|RESOURCE_EXHAUSTED|UNAVAILABLE/.test(String(e?.message));
      if (!retriable || attempt >= 6) throw e;
      const wait = 15000 * attempt;
      console.log(`  ${label}: limite di richieste, riprovo tra ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
}

async function main() {
  if (provider === 'elevenlabs' && flag('list')) return listElevenLabs();
  if (provider === 'typecast' && flag('list')) return listTypecast();
  if (flag('test-split')) {
    // Collaudo della divisione senza chiamare l'API: --test-split <file.wav> <numero di parole>
    const i = argv.indexOf('--test-split');
    const words = splitWords(argv[i + 1], Number(argv[i + 2]));
    words.forEach(([f, t], k) => console.log(`  parola ${k + 1}: ${f.toFixed(2)}–${t.toFixed(2)} s`));
    return;
  }

  const tts = provider === 'gemini' ? ttsGemini
    : provider === 'typecast' ? (c: Clip) => typecastSpeak(c.text, c.lang) : ttsElevenLabs;
  const ext = provider === 'elevenlabs' ? 'mp3' : 'wav';
  console.log(`Provider: ${provider} · voce ${VOICE} · ${clips.length} clip → ${outDir}${BATCH && !repolish ? ' (batch)' : ''}`);

  // Batch: una registrazione per gruppo, divisa in parole e salvata in cache come se fossero clip singoli
  if (BATCH && !repolish) {
    for (const group of [...new Set(clips.map((c) => c.group))]) {
      const all = clips.filter((c) => c.group === group);
      if (!force && all.every((c) => fs.existsSync(path.join(outDir, c.group, `${c.name}.mp3`)))) {
        console.log(`  ✓ ${group}: già presente (usa --force per rigenerare)`);
        continue;
      }
      const lang = all[0].lang;
      const text = all.map((c) => c.text).join(' <long pause> '); // tag di pausa di Gemini
      const style = group === 'cmd' ? STYLE_CMD_BATCH : lang === 'ko' ? STYLE_COUNT_BATCH : STYLE_NUMBERS;
      console.log(`  … ${group}: "${all.map((c) => c.text).join(' ')}"`);
      const audio = await withRetry(() => geminiSpeak(text, style, lang), group);
      const batchFile = path.join(CACHE_DIR, `batch-${group}.wav`);
      fs.mkdirSync(path.dirname(batchFile), { recursive: true });
      fs.writeFileSync(batchFile, audio);
      const words = splitWords(batchFile, all.length);
      all.forEach((c, k) => {
        const rawFile = path.join(CACHE_DIR, c.group, `${c.name}.wav`);
        fs.mkdirSync(path.dirname(rawFile), { recursive: true });
        fs.writeFileSync(rawFile, cutWav(batchFile, words[k][0], words[k][1]));
      });
      console.log(`    diviso in ${all.length} parole`);
    }
  }

  let done = 0;
  for (const clip of clips) {
    const outFile = path.join(outDir, clip.group, `${clip.name}.mp3`);
    const label = `${clip.group}/${clip.name} "${clip.text}"`;
    const rawFile = path.join(CACHE_DIR, clip.group, `${clip.name}.${ext}`);
    if (repolish || BATCH) {
      if (!fs.existsSync(rawFile)) {
        console.log(`  · ${label}: nessun originale in cache, salto`);
        continue;
      }
      polish(fs.readFileSync(rawFile), ext, outFile);
      done++;
      console.log(`  ↻ ${label}`);
      continue;
    }
    if (!force && fs.existsSync(outFile)) {
      console.log(`  ✓ ${label} (già presente)`);
      continue;
    }
    const audio = await withRetry(() => tts(clip), label);
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(rawFile, audio); // originale non tagliato, per poter rifare il post-processing
    polish(audio, ext, outFile);
    done++;
    console.log(`  ＋ ${label}`);
  }
  console.log(`Fatto: ${done} clip generati.`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
