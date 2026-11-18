import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, RefreshCw, FlipHorizontal, ArrowLeftRight, Video, VideoOff, Maximize, Minimize, Mic, Play } from 'lucide-react';
import { soundEngine, VOICE_LANGS, VoiceLang, voicesFor } from '../utils/audio';
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
  baroEnabled: boolean;
  onToggleBaro: () => void;
}

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
  baroEnabled,
  onToggleBaro,
}) => {
  const [voiceOpen, setVoiceOpen] = useState(false);
  // voicesVersion cambia quando il browser ha caricato le voci: ricalcola la lista
  const langVoices = React.useMemo(() => voicesFor(voiceLang), [voiceLang, voicesVersion]);
  const langLabel = VOICE_LANGS.find(l => l.id === voiceLang)?.label ?? voiceLang;

  // Precarica i clip registrati della lingua scelta (se esistono in public/voices)
  const [recorded, setRecorded] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setRecorded(null);
    soundEngine.preloadVoice(voiceLang).then(ok => { if (alive) setRecorded(ok); });
    return () => { alive = false; };
  }, [voiceLang]);

  return (
    <header className="w-full bg-zinc-950/95 border-b-4 border-black px-3 py-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 shadow-lg z-30">
      {/* Left: camera & voice setup */}
      <div className="flex items-center gap-2 justify-start">
        {/* Mirror Video */}
        <button
          onClick={onToggleMirror}
          className={`${btnBase} text-xs ${
            mirrorVideo ? 'bg-cyan-400 text-black' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
          }`}
          title={mirrorVideo ? 'Specchio ATTIVO (Dx/Sx invertiti). Clicca per disattivare.' : 'Specchio DISATTIVO. Clicca per invertire Dx/Sx.'}
          aria-pressed={mirrorVideo}
        >
          <FlipHorizontal className="w-5 h-5 stroke-[2.5]" />
          <span className="hidden md:inline uppercase">Specchia Camera</span>
        </button>

        {/* Swap Hong / Chong sides */}
        <button
          onClick={onToggleSwap}
          className={`${btnBase} text-xs bg-zinc-800 hover:bg-zinc-700 text-white`}
          title="Scambia i lati: Hong (rosso) e Chong (blu)"
          aria-pressed={swapSides}
        >
          <span className={swapSides ? 'text-blue-400' : 'text-red-400'}>{swapSides ? '청' : '홍'}</span>
          <ArrowLeftRight className="w-4 h-4" />
          <span className={swapSides ? 'text-red-400' : 'text-blue-400'}>{swapSides ? '홍' : '청'}</span>
          <span className="hidden xl:inline uppercase">Scambia</span>
        </button>

        {/* Referee voice */}
        <div className="relative">
          <button
            onClick={() => setVoiceOpen(o => !o)}
            className={`${btnBase} text-xs bg-zinc-800 hover:bg-zinc-700 text-white`}
            title="Voce dell'arbitro (countdown e comandi)"
            aria-expanded={voiceOpen}
          >
            <Mic className="w-5 h-5 text-yellow-400" />
            <span className="hidden xl:inline uppercase">Voce · {langLabel}</span>
          </button>
          {voiceOpen && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label="Chiudi" onClick={() => setVoiceOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-zinc-900 border-2 border-black rounded comic-box p-3 flex flex-col gap-3">
                {VOICE_LANGS.length > 1 && (
                <div>
                  <div className="text-xs font-bold text-zinc-400 uppercase mb-1">Lingua comandi</div>
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
                <div className={`text-xs font-bold rounded px-2 py-1.5 ${recorded ? 'bg-emerald-900/60 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                  {recorded === null ? 'Controllo la voce registrata…' : recorded ? '✓ Voce registrata energica' : 'Voce registrata non disponibile: uso la sintesi del browser'}
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-400 uppercase mb-1">{recorded ? 'Voce di riserva (browser)' : 'Voce'}</div>
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
                <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={baroEnabled}
                    onChange={onToggleBaro}
                    className="mt-0.5 w-4 h-4 accent-yellow-400"
                  />
                  <span>
                    <span className="font-bold">바로 (Ba-ro)</span> a fine incontro
                    <span className="block text-xs text-zinc-400">5 secondi dopo 그만: atleti di nuovo in posizione</span>
                  </span>
                </label>
                <button
                  onClick={() => soundEngine.previewVoice()}
                  className="h-10 rounded comic-box-sm bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" /> Prova voce
                </button>
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

      {/* Right: camera, audio, fullscreen */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onToggleCamera}
          className={`${btnBase} text-xs uppercase ${
            cameraOn ? 'bg-emerald-500 hover:bg-emerald-400 text-black' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
          }`}
          title={cameraOn ? 'Camera accesa: clicca per spegnerla' : 'Camera spenta: clicca per accenderla'}
          aria-pressed={cameraOn}
        >
          {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          <span className="hidden md:inline">{cameraOn ? 'Camera attiva' : 'Attiva Camera'}</span>
        </button>

        <button
          onClick={onSwitchCamera}
          className={`${btnBase} bg-zinc-800 hover:bg-zinc-700 text-white`}
          title="Cambia Fotocamera (Frontale/Posteriore)"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

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
