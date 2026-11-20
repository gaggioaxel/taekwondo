import React, { useEffect, useState } from 'react';
import { PersonStanding, X } from 'lucide-react';
import { Athlete, AthStatus, CAL_TIMES, CalSnapshot } from '../../utils/calibration';

interface CalibrationOverlayProps {
  cal: CalSnapshot;
  /** true = Chong a sinistra (come nell'arena) */
  swapSides: boolean;
  onStart: () => void;
  /** annulla: torna alla calibrazione di prima */
  onCancel: () => void;
  /** chiudi tenendo gli atleti già calibrati */
  onClose: () => void;
}

const STATUS_LABEL: Record<AthStatus, string> = {
  cerco: 'entra nel riquadro',
  fermo: 'stai fermo…',
  misuro: 'misuro…',
  ok: 'calibrato ✓',
};
const NAME = { hong: '홍 HONG', chong: '청 CHONG' };

/** Finestra della calibrazione sopra l'arena: istruzioni, campo libero, atleti, esito */
export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({ cal, swapSides, onStart, onCancel, onClose }) => {
  // conto alla rovescia del "campo libero"
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (cal.phase !== 'sfondo') return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [cal.phase]);

  if (cal.phase === 'off') return null;

  // finestra centrale: istruzioni ed errore
  if (cal.phase === 'intro' || cal.phase === 'errore') {
    const missing = (['hong', 'chong'] as const).filter((a) => cal.status[a] !== 'ok').map((a) => NAME[a]);
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
        <div className={`relative comic-box rounded-2xl rotate-[-1deg] max-w-xl w-full flex flex-col gap-4 p-6 ${cal.phase === 'errore' ? 'bg-rose-500' : 'bg-yellow-400'} text-black`}>
          <button onClick={onCancel} className="absolute top-3 right-3 p-1 rounded bg-black/15 hover:bg-black/30 cursor-pointer" title="Annulla">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <PersonStanding className="w-10 h-10 shrink-0" />
            <h2 className="font-comic leading-none" style={{ fontSize: 'min(6vh, 6vw)' }}>
              {cal.phase === 'intro' ? 'CALIBRAZIONE' : 'CALIBRAZIONE NON COMPLETA'}
            </h2>
          </div>
          {cal.phase === 'intro' ? (
            <ol className="flex flex-col gap-2 font-bold" style={{ fontSize: 'max(14px, 2.1vh)' }}>
              <li><span className="font-comic text-xl mr-2">1</span>Tutti <b>fuori dalla scena</b>: i riquadri devono essere vuoti.</li>
              <li><span className="font-comic text-xl mr-2">2</span>Al segnale gli atleti <b>rientrano</b> davanti alla camera, alla distanza desiderata, e <b>restano fermi</b> in guardia.</li>
              <li><span className="font-comic text-xl mr-2">3</span>Quando la sagoma si accende, l'atleta è calibrato: da lì può muoversi solo entro un margine di distanza.</li>
            </ol>
          ) : (
            <p className="font-bold" style={{ fontSize: 'max(14px, 2.1vh)' }}>
              {cal.error ?? <>Non trovo <b>{missing.join(' e ')}</b>: deve stare tutto nel suo riquadro, ben distinto dallo sfondo, e restare fermo. Prima di riprovare, la scena deve essere vuota.</>}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {cal.phase === 'errore' && (
              <button onClick={onClose} className="h-11 px-4 rounded-lg comic-box-sm bg-zinc-900 text-white font-comic cursor-pointer">
                CHIUDI
              </button>
            )}
            <button onClick={onStart} className="h-11 px-5 rounded-lg comic-box bg-emerald-500 hover:bg-emerald-400 font-comic text-lg cursor-pointer">
              {cal.phase === 'intro' ? 'AVVIA CALIBRAZIONE' : 'RIPROVA'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // fascia in alto durante la procedura (così si vedono le sagome nei riquadri)
  const order: Athlete[] = swapSides ? ['chong', 'hong'] : ['hong', 'chong'];
  const secs = Math.max(0, Math.ceil((CAL_TIMES.bgEnd - (now - cal.t0)) / 1000));
  return (
    <div className="absolute top-[3%] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none">
      <div className={`comic-box rounded-xl px-6 py-2 rotate-[-1deg] text-center ${cal.phase === 'fatto' ? 'bg-emerald-400' : 'bg-yellow-400'} text-black`}>
        <div className="font-comic leading-none" style={{ fontSize: 'min(5.5vh, 5vw)' }}>
          {cal.phase === 'sfondo' ? `CAMPO LIBERO! ${secs || ''}` : cal.phase === 'atleti' ? 'ATLETI IN POSIZIONE, FERMI!' : 'CALIBRATO! ✓'}
        </div>
        {cal.phase === 'sfondo' && <div className="font-bold text-sm">Tutti fuori dai riquadri: memorizzo lo sfondo</div>}
      </div>
      {cal.phase === 'atleti' && (
        <div className="flex gap-2 pointer-events-auto">
          {order.map((a) => (
            <span key={a} className={`comic-box-sm rounded px-3 py-1 font-bold text-sm ${cal.status[a] === 'ok' ? (a === 'hong' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white') : 'bg-zinc-900 text-zinc-200'}`}>
              {NAME[a]}: {STATUS_LABEL[cal.status[a]]}
            </span>
          ))}
          <button onClick={onCancel} className="comic-box-sm rounded px-3 py-1 font-bold text-sm bg-zinc-800 text-white hover:bg-zinc-700 cursor-pointer">
            Annulla
          </button>
        </div>
      )}
    </div>
  );
};
