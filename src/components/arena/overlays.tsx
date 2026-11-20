// Piccoli pannelli sopra l'arena: caricamento del modello, invito a calibrare, intensità, countdown, avviso camera.
import React from 'react';
import { PersonStanding, RotateCcw } from 'lucide-react';
import type { PoseStatus } from '../../hooks/usePoseModel';
import type { Athlete } from '../../game/config';

/** Caricamento del modello del corpo: schermata centrale in stile fumetto (o errore con "Riprova") */
export const PoseLoadingOverlay: React.FC<{ status: PoseStatus; onRetry: () => void }> = ({ status, onRetry }) => {
  if (status !== 'loading' && status !== 'error') return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65">
      <div className={`comic-box rounded-2xl rotate-[-2deg] flex flex-col items-center gap-[2vh] px-[4vw] py-[4vh] ${status === 'error' ? 'bg-rose-500' : 'bg-yellow-400'}`}>
        {status === 'loading' ? (
          <>
            <div className="comic-spinner" />
            <div className="font-comic text-black leading-none text-center" style={{ fontSize: 'min(7vh, 6vw)' }}>CARICAMENTO…</div>
            <div className="font-bold text-black/75 text-center" style={{ fontSize: 'max(13px, 2vh)' }}>Preparo il modello del corpo</div>
          </>
        ) : (
          <>
            <div className="font-comic text-white leading-none text-center text-stroke-black" style={{ fontSize: 'min(6vh, 5vw)' }}>OPS! MODELLO NON CARICATO</div>
            <div className="font-bold text-black/80 text-center" style={{ fontSize: 'max(13px, 2vh)' }}>Controlla la connessione a internet</div>
            <button
              onClick={onRetry}
              className="bg-yellow-400 hover:bg-yellow-300 text-black font-comic px-6 py-2 rounded-lg comic-box flex items-center gap-2 cursor-pointer"
              style={{ fontSize: 'max(16px, 2.6vh)' }}
            >
              <RotateCcw className="w-5 h-5 stroke-[2.5]" /> RIPROVA
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/** Sistema non calibrato: grosso invito al centro (non copre i riquadri) */
export const CalibrateCta: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
    <button
      onClick={onClick}
      className="calib-cta pointer-events-auto bg-cyan-400 hover:bg-cyan-300 text-black rounded-2xl comic-box rotate-[-2deg] flex flex-col items-center px-[3vw] py-[2vh] cursor-pointer transition"
      title="Calibra gli atleti prima di iniziare"
    >
      <span className="font-comic leading-none flex items-center gap-3" style={{ fontSize: 'min(8vh, 6vw)' }}>
        <PersonStanding style={{ width: '1em', height: '1em' }} /> CALIBRA
      </span>
      <span className="font-bold text-black/75 mt-1" style={{ fontSize: 'max(12px, 1.8vh)' }}>
        Sistema non calibrato · tocca per iniziare
      </span>
    </button>
  </div>
);

/** Indicatori di intensità durante l'incontro (seguono i lati) */
export const IntensityMeters: React.FC<{ levels: Record<Athlete, number>; swapSides: boolean }> = ({ levels, swapSides }) => (
  <>
    {(['hong', 'chong'] as const).map((a) => {
      const left = (a === 'hong') !== swapSides;
      return (
        <div key={a} className={`absolute bottom-4 ${left ? 'left-4 items-start' : 'right-4 items-end'} z-10 flex flex-col bg-black/80 p-2 rounded comic-box-sm pointer-events-none`}>
          <span className={`text-xs font-bold ${a === 'hong' ? 'text-red-400' : 'text-blue-400'}`}>{a.toUpperCase()} INTENSITY</span>
          <div className="w-32 h-3 bg-zinc-800 rounded-full overflow-hidden mt-1 border border-zinc-700">
            <div className={`h-full ${a === 'hong' ? 'bg-red-500' : 'bg-blue-500'} transition-all duration-75`} style={{ width: `${levels[a]}%` }} />
          </div>
        </div>
      );
    })}
  </>
);

/** Numero grande del countdown */
export const CountdownOverlay: React.FC<{ value: number }> = ({ value }) => (
  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/45 pointer-events-none">
    <span key={value} className="font-comic text-white text-stroke-thick leading-none countdown-pop" style={{ fontSize: 'min(34vh, 30vw)' }}>
      {value}
    </span>
  </div>
);

/** Camera non disponibile o spenta */
export const CameraNotice: React.FC<{ enabled: boolean }> = ({ enabled }) => (
  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-amber-500/95 text-black px-3 py-1.5 rounded comic-box-sm text-xs font-bold flex items-center gap-2 z-20 max-w-[90%] text-center">
    <span>{enabled
      ? '📷 Fotocamera non disponibile. Tocca i riquadri o usa i tasti per simulare i colpi!'
      : '📷 Camera spenta: accendila dalle impostazioni (rotella in alto), oppure tocca i riquadri per simulare i colpi.'}</span>
  </div>
);
