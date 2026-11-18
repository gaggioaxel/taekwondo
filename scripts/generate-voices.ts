/**
 * Genera i clip vocali dell'arbitro (conteggio 1-10 in ko/it/en + comandi coreani)
 * con Gemini TTS o ElevenLabs, poi li ripulisce con ffmpeg (taglio silenzi, volume)
 * e li salva in public/voices/ come MP3.
 *
 * Uso:
 *   npx tsx scripts/generate-voices.ts                         # Gemini, voce Fenrir
 *   npx tsx scripts/generate-voices.ts --voice Orus            # altra voce Gemini
 *   npx tsx scripts/generate-voices.ts --provider elevenlabs --voice <voice_id>
 *   npx tsx scripts/generate-voices.ts --provider elevenlabs --list   # elenca voci e modelli
 *   npx tsx scripts/generate-voices.ts --only it,cmd --force   # rigenera solo alcuni gruppi
 *   npx tsx scripts/generate-voices.ts --out tmp/voices-test   # cartella diversa (per confronti)
 *   npx tsx scripts/generate-voices.ts --repolish              # rifà solo taglio/volume dagli originali in .voice-cache/
 *
 * Chiavi (in .env.local o .env): GEMINI_API_KEY, ELEVENLABS_API_KEY.
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

const provider = opt('provider', 'gemini') as 'gemini' | 'elevenlabs';
const outDir = opt('out', 'public/voices')!;
const force = flag('force');
const repolish = flag('repolish'); // rifà solo il post-processing dai file grezzi in cache, senza chiamare l'API
const CACHE_DIR = path.join('.voice-cache', provider);
// Per ora solo coreano + comandi (italiano/inglese disattivati nell'app): --only it,en per generarli
const only = opt('only', 'ko,cmd')!.split(',');

// ---------- Testi ----------
type Group = 'ko' | 'it' | 'en' | 'cmd';
type Clip = { group: Group; name: string; text: string; lang: string };

const NUMBERS: Record<'ko' | 'it' | 'en', string[]> = {
  ko: ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'],
  it: ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Otto', 'Nove', 'Dieci'],
  en: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'],
};
// I comandi del taekwondo sono in coreano in tutto il mondo: un solo set condiviso
const COMMANDS: Record<string, string> = { chunbi: '준비!', shijak: '시작!', keuman: '그만!' };

const clips: Clip[] = [
  ...(['ko', 'it', 'en'] as const).flatMap((lang) =>
    NUMBERS[lang].map((word, i) => ({ group: lang as Group, name: String(i + 1), text: `${word}!`, lang })),
  ),
  ...Object.entries(COMMANDS).map(([name, text]) => ({ group: 'cmd' as Group, name, text, lang: 'ko' })),
].filter((c) => only.includes(c.group));

const STYLE =
  'Energetic taekwondo referee calling out the count in a training hall: loud, powerful and motivating, ' +
  'but clearly enunciated: pronounce every syllable fully and distinctly, do not rush or clip the word, ' +
  'give it a strong attack and let the final vowel ring out briefly.';

const LANG_NAME: Record<string, string> = { ko: 'Korean', it: 'Italian', en: 'English' };

// ---------- Provider: Gemini ----------
async function ttsGemini(clip: Clip): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY mancante: aggiungila in .env.local');
  const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } });
  const model = opt('model', 'gemini-3.8-flash-tts')!;
  const voice = opt('voice', 'Fenrir')!;
  const interaction: any = await (client as any).interactions.create({
    model,
    input: [{
      type: 'user_input',
      content: [{
        type: 'text',
        text: clip.text,
        annotations: [{ type: 'speech_metadata', style: `${STYLE} Speak in ${LANG_NAME[clip.lang]}.` }],
      }],
    }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice, language: clip.lang }] },
  });
  const data = interaction?.output_audio?.data;
  if (!data) throw new Error(`Nessun audio nella risposta: ${JSON.stringify(interaction).slice(0, 300)}`);
  return Buffer.from(data, 'base64'); // WAV 24 kHz mono
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
  const voiceId = opt('voice', process.env.ELEVENLABS_VOICE_ID);
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
    `afade=t=in:d=0.005`;
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

  const tts = provider === 'gemini' ? ttsGemini : ttsElevenLabs;
  const ext = provider === 'gemini' ? 'wav' : 'mp3';
  console.log(`Provider: ${provider} · ${clips.length} clip → ${outDir}`);

  let done = 0;
  for (const clip of clips) {
    const outFile = path.join(outDir, clip.group, `${clip.name}.mp3`);
    const label = `${clip.group}/${clip.name} "${clip.text}"`;
    const rawFile = path.join(CACHE_DIR, clip.group, `${clip.name}.${ext}`);
    if (repolish) {
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
