// Grandi fumetti dei comandi: "그만! KEUMAN!" a fine incontro, "바로! BA-RO!" quando l'arbitro lo dice.
import { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../utils/audio';

export type BurstKind = 'keuman' | 'baro';
export type BurstState = { key: number; kind: BurstKind; leaving: boolean };

/** durata di un fumetto quando nessun altro lo sostituisce */
export const KEUMAN_SHOW_MS = 2600;
const BURST_OUT_MS = 300; // durata dell'uscita

export function useCommandBurst() {
  const [burst, setBurst] = useState<BurstState | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (outTimer.current) clearTimeout(outTimer.current);
  };

  /** Mostra un fumetto per `ms` (poi esce); un nuovo fumetto lo sostituisce subito. */
  const show = (kind: BurstKind, ms = KEUMAN_SHOW_MS) => {
    stopTimers();
    const key = Date.now();
    setBurst({ key, kind, leaving: false });
    outTimer.current = setTimeout(() => setBurst((b) => (b && b.key === key ? { ...b, leaving: true } : b)), ms - BURST_OUT_MS);
    showTimer.current = setTimeout(() => setBurst((b) => (b && b.key === key ? null : b)), ms);
  };

  // il motore audio avvisa quando dice "Baro": compare il fumetto in quell'istante
  useEffect(() => {
    soundEngine.onBaro = () => show('baro');
    return () => {
      soundEngine.onBaro = null;
      stopTimers();
    };
  }, []);

  return {
    burst,
    /** KEUMAN resta a schermo finché arriva BARO (se attivo), che lo sostituisce */
    showKeuman: () => show('keuman', soundEngine.baroEnabled ? soundEngine.baroDelayMs + 1000 : KEUMAN_SHOW_MS),
    clear: () => {
      stopTimers();
      setBurst(null);
    },
  };
}
