// Incontro: countdown, 시작, tempo, punti, effetti dei colpi, 그만 e riepilogo finale.
// Lo stato che legge il ciclo dei fotogrammi sta nei ref (aggiornati subito); quello per l'interfaccia negli state.
import { MutableRefObject, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../utils/audio';
import type { MatchStats } from '../types';
import { TechniqueKind, TechniqueRotation } from '../utils/techniques';
import { Athlete, ONOMATOPEE, Tipologia } from '../game/config';
import type { TargetRounds } from '../game/targetRounds';
import { Fx, spawnImpact } from '../canvas/effects';
import { KEUMAN_SHOW_MS } from './useCommandBurst';

type PerAthlete<T> = Record<Athlete, T>;
const zero = (): PerAthlete<number> => ({ hong: 0, chong: 0 });
const noTech = () => ({ hong: { calci: 0, pugni: 0 }, chong: { calci: 0, pugni: 0 } });

export type MatchOptions = {
  durata: number;
  countdownSec: number;
  tipologiaRef: MutableRefObject<Tipologia>;
  /** l'incontro che parte usa i colpitori? */
  targetsEnabled: () => boolean;
  targets: TargetRounds;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** true = non si può partire (es. calibrazione in corso) */
  blocked: () => boolean;
  burst: { showKeuman: () => void; clear: () => void };
  onMatchComplete: (stats: MatchStats) => void;
};

export function useMatch(o: MatchOptions) {
  const [punti, setPunti] = useState(zero);
  const puntiRef = useRef(zero());
  const [tempo, setTempo] = useState(o.durata);
  const tempoRef = useRef(o.durata);
  const [garaAttiva, setGaraAttiva] = useState(false);
  const garaAttivaRef = useRef(false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const vincitoreRef = useRef('');

  const cooldownRef = useRef(zero()); // istante dell'ultimo punto di ogni atleta
  const fxRef = useRef<Fx>({ popups: [], bursts: [] });
  const snapshotsRef = useRef<string[]>([]);
  const rotationRef = useRef(new TechniqueRotation());
  const techRef = useRef(noTech());
  const matchDurata = useRef(o.durata);

  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    if (clockTimer.current) clearInterval(clockTimer.current);
    if (statsTimer.current) clearTimeout(statsTimer.current);
  }, []);

  /** Durata cambiata a incontro fermo: azzera il tempo e la scritta del vincitore */
  const resetIdle = (d: number) => {
    setTempo(d);
    tempoRef.current = d;
    vincitoreRef.current = '';
  };

  /**
   * Punto per un atleta (Energia, Corpo e simulazione). In Corpo il fumetto mostra il nome coreano della tecnica
   * (a rotazione nella categoria calcio/pugno); in Energia un'onomatopea.
   */
  const registerHit = useCallback((a: Athlete, x: number, y: number, strong: boolean, kind?: TechniqueKind) => {
    if (!kind && o.tipologiaRef.current === 'corpo') kind = 'calcio';
    let text = ONOMATOPEE[Math.floor(Math.random() * ONOMATOPEE.length)];
    let sub: string | undefined;
    if (kind) {
      const t = rotationRef.current.next(kind);
      text = `${t.rom.toUpperCase()}!`;
      sub = t.ko;
      techRef.current[a][kind === 'calcio' ? 'calci' : 'pugni']++;
    }
    puntiRef.current[a] += 1;
    setPunti({ ...puntiRef.current });
    cooldownRef.current[a] = Date.now();
    soundEngine.playPunchImpact(a);
    soundEngine.playBeep(a === 'hong' ? 900 : 450, 'square', 0.15);
    spawnImpact(fxRef.current, a, x, y, text, sub);
    // fermo immagine dei colpi forti (massimo 4)
    const canvas = o.canvasRef.current;
    if (strong && canvas && snapshotsRef.current.length < 4) snapshotsRef.current.push(canvas.toDataURL('image/jpeg', 0.75));
  }, [o.tipologiaRef, o.canvasRef]);

  const begin = () => {
    puntiRef.current = zero();
    setPunti(zero());
    snapshotsRef.current = [];
    techRef.current = noTech();
    o.targets.reset(o.targetsEnabled());
    matchDurata.current = o.durata;
    tempoRef.current = o.durata;
    setTempo(o.durata);
    vincitoreRef.current = '';
    garaAttivaRef.current = true;
    setGaraAttiva(true);
    soundEngine.playShijak();
    if (clockTimer.current) clearInterval(clockTimer.current);
    clockTimer.current = setInterval(() => {
      tempoRef.current -= 1;
      setTempo(tempoRef.current);
      if (tempoRef.current <= 0) finish(false);
    }, 1000);
  };

  /** Fine incontro (tempo scaduto o fermato con 그만): KEUMAN, poi BARO se attivo, poi il riepilogo */
  const finish = (interrotto: boolean) => {
    if (clockTimer.current) clearInterval(clockTimer.current);
    garaAttivaRef.current = false;
    setGaraAttiva(false);
    o.targets.clear();
    soundEngine.playKeuman();
    o.burst.showKeuman();

    const { hong, chong } = puntiRef.current;
    const winner: 'hong' | 'chong' | 'tie' = hong > chong ? 'hong' : chong > hong ? 'chong' : 'tie';
    const durata = interrotto ? Math.max(1, matchDurata.current - tempoRef.current) : matchDurata.current; // secondi giocati
    vincitoreRef.current = (interrotto ? 'INTERROTTO! ' : 'KEUMAN! ') +
      (winner === 'hong' ? 'WINNER: HONG (ROSSO)!' : winner === 'chong' ? 'WINNER: CHONG (BLU)!' : "PARITA'!");

    const stats: MatchStats = {
      puntiHong: hong,
      puntiChong: chong,
      durata,
      vincitore: winner,
      colpiHong: hong,
      colpiChong: chong,
      cadenzaHong: Number((hong / durata).toFixed(2)),
      cadenzaChong: Number((chong / durata).toFixed(2)),
      snapshots: snapshotsRef.current,
      interrotto,
      tecniche: o.tipologiaRef.current === 'corpo' ? { hong: { ...techRef.current.hong }, chong: { ...techRef.current.chong } } : undefined,
      bersagli: o.targets.enabled ? { hong: { ...o.targets.stats.hong }, chong: { ...o.targets.stats.chong } } : undefined,
    };
    // il riepilogo arriva dopo i fumetti (KEUMAN, e BARO se attivo), così non li copre
    if (statsTimer.current) clearTimeout(statsTimer.current);
    const delay = soundEngine.baroEnabled ? soundEngine.baroDelayMs + KEUMAN_SHOW_MS : KEUMAN_SHOW_MS;
    statsTimer.current = setTimeout(() => {
      statsTimer.current = null;
      o.onMatchComplete(stats);
    }, delay);
  };

  const cancelCountdown = () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    countdownTimer.current = null;
    setCountdownValue(null);
    soundEngine.stopVoice();
  };

  /** 시작: countdown (se impostato), poi l'incontro */
  const start = () => {
    if (garaAttivaRef.current || countdownTimer.current || o.blocked()) return;
    soundEngine.unlock();
    // nuovo incontro: via le scritte KEUMAN/BARO e le statistiche ancora in arrivo
    if (statsTimer.current) clearTimeout(statsTimer.current);
    statsTimer.current = null;
    o.burst.clear();
    vincitoreRef.current = '';
    if (o.countdownSec <= 0) return begin();
    let n = o.countdownSec;
    setCountdownValue(n);
    soundEngine.playCountdownTick(n);
    countdownTimer.current = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCountdownValue(n);
        soundEngine.playCountdownTick(n);
      } else {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        countdownTimer.current = null;
        setCountdownValue(null);
        begin();
      }
    }, 1000);
  };

  /** 그만 (o annulla il countdown) */
  const stop = () => (countdownTimer.current ? cancelCountdown() : finish(true));

  return {
    punti, tempo, garaAttiva, countdownValue,
    inCountdown: countdownValue !== null,
    busy: garaAttiva || countdownValue !== null,
    puntiRef, tempoRef, garaAttivaRef, vincitoreRef, cooldownRef, fxRef,
    registerHit, start, stop, resetIdle,
  };
}
