import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, RefreshCw, FlipHorizontal, ArrowLeftRight, Video, VideoOff, Maximize, Minimize, Mic, Play, Bell, Settings } from 'lucide-react';
import { soundEngine, VOICE_LANGS, VoiceLang, voicesFor, SignalMode, BARO_OPTIONS } from '../utils/audio';
import { TkdLogo } from './TkdLogo';

interface ComicHeaderProps {
  isMuted: boolean;
  onToggleMute: () => void;
  cameraOn: boolean;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  mirrorVideo: boolean;
  onToggleMirror: () => void;
  swapSides: boolean;
  onToggleSwap: () => void;
  isFullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
  voiceLang: VoiceLang;
  onChangeVoiceLang: (l: VoiceLang) => void;
  voiceURI: string | null;
  onChangeVoiceURI: (uri: string | null) => void;
  voicesVersion: number;
  /** secondi tra 그만 e 바로, 0 = spento */
  baroSec: number;
  onChangeBaroSec: (s: number) => void;
  signalMode: SignalMode;
  onChangeSignalMode: (m: SignalMode) => void;
  facingMode: 'user' | 'environment';
  padGap: number;
  onChangePadGap: (g: number) => void;
}

/** Spazio tra i due riquadri (frazione della larghezza dell'immagine) */
export const PAD_GAPS = [
  { value: 0.06, label: 'Minimo' },
  { value: 0.15, label: 'Medio' },
  { value: 0.25, label: 'Ampio' },
  { value: 0.35, label: 'Max' },
];

/** Gruppo di impostazioni con titolo */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-2">
    <h3 className="font-comic text-sm tracking-wider text-yellow-400 uppercase border-b border-zinc-700 pb-1">{title}</h3>
    {children}
  </section>
);

/** Riga con interruttore acceso/spento */
const ToggleRow: React.FC<{ icon: React.ReactNode; label: string; hint?: string; on: boolean; onToggle: () => void }> = ({
  icon, label, hint, on, onToggle,
}) => (
  <button
    role="switch"
    aria-checked={on}
    onClick={onToggle}
    className="w-full flex items-center gap-3 rounded px-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-left cursor-pointer"
  >
    <span className={`shrink-0 ${on ? 'text-yellow-400' : 'text-zinc-500'}`}>{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-bold">{label}</span>
      {hint && <span className="block text-xs text-zinc-400">{hint}</span>}
    </span>
    <span className={`relative shrink-0 w-11 h-6 rounded-full border-2 border-black transition-colors ${on ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white border border-black transition-all ${on ? 'left-[1.35rem]' : 'left-0.5'}`} />
    </span>
  </button>
);

const btnBase =
  'h-10 px-2.5 rounded comic-box-sm font-bold flex items-center gap-2 cursor-pointer transition active:translate-y-0.5';

export const ComicHeader: React.FC<ComicHeaderProps> = ({
  isMuted,
  onToggleMute,
  cameraOn,
  onToggleCamera,
  onSwitchCamera,
  mirrorVideo,
  onToggleMirror,
  swapSides,
  onToggleSwap,
  isFullscreen,
  canFullscreen,
  onToggleFullscreen,
  voiceLang,
  onChangeVoiceLang,
  voiceURI,
  onChangeVoiceURI,
  voicesVersion,
  baroSec,
  onChangeBaroSec,
  signalMode,
  onChangeSignalMode,
  facingMode,
  padGap,
  onChangePadGap,
}) => {
  const ping = signalMode === 'ping';
  // voicesVersion cambia quando il browser ha caricato le voci: ricalcola la lista
  const langVoices = React.useMemo(() => voicesFor(voiceLang), [voiceLang, voicesVersion]);

  // Precarica i clip registrati della lingua scelta (se esistono in public/voices)
  const [recorded, setRecorded] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setRecorded(null);
    soundEngine.preloadVoice(voiceLang).then(ok => { if (alive) setRecorded(ok); });
    return () => { alive = false; };
  }, [voiceLang]);

  // Menu impostazioni (rotella): si chiude cliccando fuori o con Esc
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="w-full bg-zinc-950/95 border-b-4 border-black px-3 py-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 shadow-lg z-30">
      {/* Left: impostazioni (tutto ciò che si regola una volta sola) */}
      <div className="flex items-center gap-2 justify-start">
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className={`${btnBase} text-xs uppercase ${menuOpen ? 'bg-yellow-400 text-black' : 'bg-zinc-800 hover:bg-zinc-700 text-white'}`}
            title="Impostazioni: camera, lati, voce dell'arbitro"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
          >
            <Settings className={`w-5 h-5 transition-transform duration-300 ${menuOpen ? 'rotate-90' : ''}`} />
            <span className="hidden md:inline">Impostazioni</span>
          </button>
          {menuOpen && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label="Chiudi impostazioni" onClick={() => setMenuOpen(false)} />
              <div
                role="dialog"
                aria-label="Impostazioni"
                className="absolute left-0 top-full mt-2 z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto bg-zinc-900 border-2 border-black rounded-lg comic-box p-3 flex flex-col gap-4"
              >
                {/* Camera */}
                <Section title="Camera">
                  <ToggleRow
                    icon={cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                    label="Camera"
                    hint={cameraOn ? 'Accesa' : 'Spenta: solo simulazione con i tasti'}
                    on={cameraOn}
                    onToggle={onToggleCamera}
                  />
                  <ToggleRow
                    icon={<FlipHorizontal className="w-5 h-5" />}
                    label="Specchia camera"
                    hint="Destra e sinistra invertite, come uno specchio"
                    on={mirrorVideo}
                    onToggle={onToggleMirror}
                  />
                  <button
                    onClick={onSwitchCamera}
                    disabled={!cameraOn}
                    className="w-full flex items-center gap-3 rounded px-2 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-left cursor-pointer"
                  >
                    <RefreshCw className="w-5 h-5 text-yellow-400 shrink-0" />
                    <span className="flex-1">
                      <span className="block text-sm font-bold">Cambia fotocamera</span>
                      <span className="block text-xs text-zinc-400">In uso: {facingMode === 'user' ? 'frontale' : 'posteriore'}</span>
                    </span>
                  </button>
                </Section>

                {/* Atleti */}
                <Section title="Atleti">
                  <button
                    onClick={onToggleSwap}
                    className="w-full flex items-center gap-3 rounded px-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-left cursor-pointer"
                    aria-pressed={swapSides}
                  >
                    <ArrowLeftRight className="w-5 h-5 text-yellow-400 shrink-0" />
                    <span className="flex-1">
                      <span className="block text-sm font-bold">Scambia i lati</span>
                      <span className="block text-xs text-zinc-400">Sinistra / destra dello schermo</span>
                    </span>
                    <span className="font-comic text-lg flex items-center gap-1">
                      <span className={swapSides ? 'text-blue-400' : 'text-red-400'}>{swapSides ? '청' : '홍'}</span>
                      <span className="text-zinc-500 text-sm">|</span>
                      <span className={swapSides ? 'text-red-400' : 'text-blue-400'}>{swapSides ? '홍' : '청'}</span>
                    </span>
                  </button>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Spazio tra i riquadri (distanza tra gli atleti)</div>
                    <div className="flex gap-1">
                      {PAD_GAPS.map(g => (
                        <button
                          key={g.value}
                          onClick={() => onChangePadGap(g.value)}
                          aria-pressed={padGap === g.value}
                          className={`flex-1 h-9 text-sm rounded font-bold cursor-pointer ${
                            padGap === g.value ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </Section>

                {/* Arbitro */}
                <Section title="Arbitro">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Countdown e comandi</div>
                    <div className="flex gap-1">
                      {([['voce', 'Voce', Mic], ['ping', 'Ping', Bell]] as const).map(([m, label, Icon]) => (
                        <button
                          key={m}
                          onClick={() => onChangeSignalMode(m)}
                          aria-pressed={signalMode === m}
                          className={`flex-1 text-sm px-2 py-1.5 rounded font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                            signalMode === m ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          <Icon className="w-4 h-4" /> {label}
                        </button>
                      ))}
                    </div>
                    {ping && (
                      <p className="text-xs text-zinc-400 mt-1.5">
                        Niente voce: un <b>ping</b> per ogni secondo del countdown, un <b>paang</b> acuto al via e uno grave a fine incontro.
                      </p>
                    )}
                  </div>
                  {!ping && VOICE_LANGS.length > 1 && (
                    <div>
                      <div className="text-xs text-zinc-400 mb-1">Lingua comandi</div>
                      <div className="flex gap-1">
                        {VOICE_LANGS.map(l => (
                          <button
                            key={l.id}
                            onClick={() => onChangeVoiceLang(l.id)}
                            className={`flex-1 text-sm px-2 py-1.5 rounded font-bold ${
                              voiceLang === l.id ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!ping && (
                    <>
                      <div className={`text-xs font-bold rounded px-2 py-1.5 ${recorded ? 'bg-emerald-900/60 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                        {recorded === null ? 'Controllo la voce registrata…' : recorded ? '✓ Voce registrata energica' : 'Voce registrata non disponibile: uso la sintesi del browser'}
                      </div>
                      <div>
                        <div className="text-xs text-zinc-400 mb-1">{recorded ? 'Voce di riserva (browser)' : 'Voce'}</div>
                        <select
                          value={voiceURI ?? ''}
                          onChange={e => onChangeVoiceURI(e.target.value || null)}
                          className="w-full bg-zinc-800 text-white text-sm rounded px-2 py-1.5 border border-zinc-700"
                        >
                          <option value="">Automatica (la migliore disponibile)</option>
                          {langVoices.map(v => (
                            <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                          ))}
                        </select>
                        {langVoices.length === 0 && !recorded && (
                          <p className="text-xs text-amber-400 mt-1">
                            Nessuna voce installata per questa lingua: i comandi vengono letti con pronuncia romanizzata.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">
                      <span className="font-bold text-zinc-200">바로 (Ba-ro)</span> dopo 그만: atleti di nuovo in posizione{ping ? ' (doppio ping)' : ''}
                    </div>
                    <div className="flex gap-1">
                      {BARO_OPTIONS.map(sec => (
                        <button
                          key={sec}
                          onClick={() => onChangeBaroSec(sec)}
                          aria-pressed={baroSec === sec}
                          className={`flex-1 h-9 text-sm rounded font-comic tracking-wide cursor-pointer ${
                            baroSec === sec ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {sec === 0 ? 'OFF' : `${sec}s`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => soundEngine.previewVoice()}
                    className="h-10 rounded comic-box-sm bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" /> {ping ? 'Prova segnali' : 'Prova voce'}
                  </button>
                </Section>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: logo */}
      <div className="bg-yellow-400 text-black font-comic text-xl lg:text-2xl pl-1.5 pr-4 py-1 comic-box rotate-[-2deg] flex items-center gap-2 whitespace-nowrap">
        <TkdLogo className="h-8 w-8 lg:h-9 lg:w-9 rounded-md border-2 border-black shrink-0" />
        <span className="hidden xl:inline">태권도</span>
        <span className="tracking-wider">TKD CHALLENGE</span>
      </div>

      {/* Right: azioni rapide (audio, schermo intero) */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onToggleMute}
          className={`${btnBase} ${isMuted ? 'bg-zinc-800 text-zinc-500' : 'bg-yellow-400 text-black'}`}
          title={isMuted ? 'Riattiva Audio' : 'Disattiva Audio'}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {canFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className={`${btnBase} text-xs uppercase ${
              isFullscreen ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-zinc-100 hover:bg-white text-black'
            }`}
            title={isFullscreen ? 'Esci dallo schermo intero' : 'Schermo intero'}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            <span className="hidden md:inline">{isFullscreen ? 'Riduci' : 'Fullscreen'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
