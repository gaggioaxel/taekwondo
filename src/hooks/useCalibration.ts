// Calibrazione degli atleti: oggetto Calibration (logica) + stato per l'interfaccia + suoni delle fasi.
// Non viene salvata: a ogni caricamento della pagina si ricalibra (sfondo e atleti possono essere cambiati).
import { RefObject, useEffect, useState } from 'react';
import { soundEngine } from '../utils/audio';
import { Calibration, CalSnapshot } from '../utils/calibration';

export function useCalibration(videoRef: RefObject<HTMLVideoElement | null>, canOpen: () => boolean) {
  const [cal] = useState(() => new Calibration());
  const [ui, setUi] = useState<CalSnapshot>(() => cal.snapshot());
  const [calibrated, setCalibrated] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) (window as any).__cal = cal; // ispezione dalla console in sviluppo
    cal.onChange = (snap) => {
      setUi(snap);
      setCalibrated(cal.calibrated);
    };
    cal.onEvent = (e, a) => {
      if (e === 'sfondo-ok') soundEngine.playBeep(880, 'sine', 0.15, 0.3);
      else if (e === 'atleta-ok') soundEngine.playBeep(a === 'hong' ? 990 : 1180, 'sine', 0.14, 0.35);
      else if (e === 'fatto') [660, 880, 1320].forEach((f, i) => setTimeout(() => soundEngine.playBeep(f, 'sine', 0.16, 0.35), i * 110));
      else soundEngine.playBeep(200, 'sawtooth', 0.25, 0.2);
    };
    return () => {
      cal.onChange = null;
      cal.onEvent = null;
    };
  }, [cal]);

  return {
    cal,
    ui,
    calibrated,
    open: () => {
      if (canOpen()) cal.open();
    },
    start: () => {
      soundEngine.unlock();
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) {
        cal.fail('Serve la camera accesa: attivala dalle impostazioni (rotella in alto).');
        return;
      }
      soundEngine.playBeep(660, 'sine', 0.12, 0.3);
      cal.start(Date.now());
    },
    /** annulla: torna alla calibrazione di prima */
    cancel: () => cal.close(true),
    /** chiudi tenendo gli atleti già calibrati */
    close: () => cal.close(false),
  };
}
