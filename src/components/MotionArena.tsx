// Arena: tiene insieme camera, rilevamento (Energia / Corpo), calibrazione, colpitori e incontro.
// Ogni fotogramma: video → calibrazione → rilevamento dei colpi → disegno (moduli in canvas/, detection/, game/).
import React, { useEffect, useRef, useState } from 'react';
import { loadPref, savePref } from '../utils/prefs';
import type { MatchStats } from '../types';
import type { TechniqueKind } from '../utils/techniques';
import { bodyFromFigure, isLive, Target, TARGET_LEVELS, techniqueKindOf } from '../utils/targets';
import { figureBox, figureFromPose, SIL_TORSO, silMask } from '../utils/silhouette';
import { soundEngine } from '../utils/audio';
import {
  Athlete, ATHLETES, COUNTDOWN_MAX, Difficolta, DURATA_OPTIONS, HIT_COOLDOWN_MS, inZone, padZones, thresholds, Tipologia,
  athleteOfSide,
} from '../game/config';
import { TargetRounds } from '../game/targetRounds';
import { BodyDetector } from '../detection/corpo';
import { changedRatio } from '../detection/energia';
import { drawBanner, drawCameraHint, drawIdleBackground, drawPad, drawScore, drawVideo } from '../canvas/arena';
import { drawFx } from '../canvas/effects';
import { drawSkeletons } from '../canvas/skeletons';
import { drawAthleteGuide } from '../canvas/athleteGuides';
import { useCamera } from '../hooks/useCamera';
import { usePoseModel } from '../hooks/usePoseModel';
import { useCalibration } from '../hooks/useCalibration';
import { useCommandBurst } from '../hooks/useCommandBurst';
import { useMatch } from '../hooks/useMatch';
import { ArenaControls } from './arena/ArenaControls';
import { CalibrationOverlay } from './arena/CalibrationOverlay';
import { CommandBurst } from './arena/CommandBurst';
import { CalibrateCta, CameraNotice, CountdownOverlay, IntensityMeters, PoseLoadingOverlay } from './arena/overlays';

export type { Difficolta, Tipologia } from '../game/config';

interface MotionArenaProps {
  facingMode: 'user' | 'environment';
  /** false = camera spenta: niente richiesta di accesso, solo simulazione */
  cameraEnabled: boolean;
  mirrorVideo: boolean;
  /** true = Hong (rosso) a destra e Chong (blu) a sinistra */
  swapSides: boolean;
  /** spazio tra i due riquadri, in frazione della larghezza (per distanziare gli atleti) */
  padGap: number;
  onMatchComplete: (stats: MatchStats) => void;
}

export const MotionArena: React.FC<MotionArenaProps> = ({ facingMode, cameraEnabled, mirrorVideo, swapSides, padGap, onMatchComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const [detector] = useState(() => new BodyDetector());
  const [targets] = useState(() => new TargetRounds());

  // ---- impostazioni della barra in basso (salvate nel browser) ----
  const [durata, setDurata] = useState<number>(() => {
    const saved = loadPref('durata', 30); // durata salvata non più tra le opzioni → la più vicina
    return DURATA_OPTIONS.reduce((best, d) => (Math.abs(d - saved) < Math.abs(best - saved) ? d : best));
  });
  const [countdownSec, setCountdownSec] = useState<number>(() => Math.min(COUNTDOWN_MAX, Math.max(0, loadPref('countdown', 10))));
  const [tipologia, setTipologia] = useState<Tipologia>(() => loadPref<Tipologia>('tipologia', 'energia'));
  const [difficolta, setDifficolta] = useState<Difficolta>(() => loadPref<Difficolta>('difficolta', 'medio'));
  useEffect(() => savePref('durata', durata), [durata]);
  useEffect(() => savePref('countdown', countdownSec), [countdownSec]);
  useEffect(() => savePref('difficolta', difficolta), [difficolta]);
  const tipologiaRef = useRef(tipologia);
  useEffect(() => {
    tipologiaRef.current = tipologia;
    savePref('tipologia', tipologia);
    prevFrameRef.current = null;
    detector.reset();
  }, [tipologia, detector]);
  // cambi di specchio o lati: il tracking ricomincia
  useEffect(() => {
    prevFrameRef.current = null;
    detector.reset();
  }, [mirrorVideo, swapSides, detector]);

  // ---- stato condiviso: camera, modello, calibrazione, fumetti, incontro ----
  const { videoRef, cameraError } = useCamera(facingMode, cameraEnabled, () => { prevFrameRef.current = null; });
  const pose = usePoseModel(tipologia === 'corpo', detector);
  const burst = useCommandBurst();
  const match = useMatch({
    durata, countdownSec, tipologiaRef, targets, canvasRef, burst, onMatchComplete,
    targetsEnabled: () => tipologiaRef.current === 'corpo' && difficolta !== 'facile',
    blocked: () => calibration.cal.active,
  });
  const calibration = useCalibration(videoRef, () => !match.garaAttivaRef.current && !match.inCountdown);
  const [levels, setLevels] = useState<Record<Athlete, number>>({ hong: 0, chong: 0 });

  /** Colpitore preso: punto e fumetto con il nome della tecnica */
  const hitTarget = (a: Athlete, t: Target, strong: boolean) => {
    targets.hit(a, t);
    match.registerHit(a, t.x, t.y, strong, techniqueKindOf(t.kind));
  };

  // Simulazione (tasti o tocco sul riquadro): con i colpitori colpisce quello in gioco; in Corpo alterna calcio/pugno
  const simKind = useRef<TechniqueKind>('calcio');
  const simulateHit = (a: Athlete) => {
    const canvas = canvasRef.current;
    if (!match.garaAttivaRef.current || !canvas) return;
    if (targets.enabled) {
      const t = targets.targets[a];
      if (isLive(t)) hitTarget(a, t, false);
      return;
    }
    let kind: TechniqueKind | undefined;
    if (tipologiaRef.current === 'corpo') {
      kind = simKind.current;
      simKind.current = kind === 'calcio' ? 'pugno' : 'calcio';
    }
    const onLeft = (a === 'hong') !== swapSides;
    match.registerHit(a, canvas.width * (onLeft ? 0.25 : 0.75), canvas.height * 0.5, false, kind);
  };

  // Valori letti dal ciclo dei fotogrammi senza farlo ripartire a ogni cambio
  const live = useRef({ mirrorVideo, swapSides, padGap, difficolta, durata, cameraError, cameraEnabled, hitTarget });
  live.current = { mirrorVideo, swapSides, padGap, difficolta, durata, cameraError, cameraEnabled, hitTarget };

  // ---- ciclo dei fotogrammi ----
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const cal = calibration.cal;
    const setLevel = (a: Athlete, ratio: number) => setLevels((l) => (l[a] === Math.min(100, Math.floor(ratio * 100)) ? l : { ...l, [a]: Math.min(100, Math.floor(ratio * 100)) }));
    let animId = 0;

    const frame = () => {
      const L = live.current;
      const th = thresholds(L.difficolta);
      const videoLive = !!video && video.readyState >= 2 && video.videoWidth > 0;

      // 1. video (o sfondo di riserva)
      if (videoLive) drawVideo(ctx, video!, L.mirrorVideo);
      else drawIdleBackground(ctx);
      const W = canvas.width;
      const H = canvas.height;
      const s = W / 800; // la grafica è pensata per 800 px di larghezza
      if (!videoLive && !L.cameraError && L.cameraEnabled) drawCameraHint(ctx, s);

      const zones = padZones(W, H, L.padGap, L.swapSides);
      const ora = Date.now();
      const active = match.garaAttivaRef.current;
      const corpo = tipologiaRef.current === 'corpo';
      const body = (a: Athlete) => (corpo ? detector.body(a, L.swapSides, L.mirrorVideo, W, H, s) : null);
      const targetLevel = corpo && targets.enabled && L.difficolta !== 'facile' ? TARGET_LEVELS[L.difficolta] : null;

      // 2. pixel del fotogramma (solo video): Energia, preparazione e calibrazione
      let frameData: ImageData | null = null;
      if (videoLive && (!corpo || !active || cal.active)) {
        try {
          frameData = ctx.getImageData(0, 0, W, H);
        } catch {
          // canvas non leggibile
        }
      }
      const prev = prevFrameRef.current;
      const havePair = !!frameData && !!prev && prev.width === W && prev.height === H;

      // 3. calibrazione e atleti seguiti
      const poseFig = (a: Athlete) => {
        const pb = body(a);
        if (!pb) return null;
        const b = figureFromPose(pb.cx, pb.headY, pb.feetY);
        return { cx: pb.cx, feet: b.y + b.h, h: b.h };
      };
      cal.step(frameData?.data ?? null, W, H, zones, ora, { hong: poseFig('hong'), chong: poseFig('chong') });
      const figNow = (a: Athlete) => cal.figure(a) ?? figureBox(zones[a]);

      // 4a. Energia: parte della figura dell'atleta che si muove
      if (!corpo && havePair && active) {
        for (const a of ATHLETES) {
          const z = zones[a];
          const ratio = changedRatio(frameData!.data, prev!.data, W, z, cal.area(a) ?? silMask(figureBox(z).h).area, th.pixelDiff);
          setLevel(a, ratio / th.energiaQuota);
          if (ratio > th.energiaQuota && ora - match.cooldownRef.current[a] > HIT_COOLDOWN_MS) {
            match.registerHit(a, z.x1 + z.w * 0.5, z.y1 + z.h * 0.45, ratio > th.energiaQuota * 1.5);
          }
        }
      }
      if (frameData) prevFrameRef.current = frameData;

      // 4b. Corpo: un riquadro per fotogramma; colpi liberi (Facile) o colpitori (Medio/Difficile)
      if (corpo && videoLive && detector.landmarkers) {
        const an = detector.analyze(video!, W, H, zones, L.mirrorVideo);
        if (an && active) {
          const analyzed = athleteOfSide(an.side, L.swapSides);
          let max = 0;
          for (const st of detector.strikes(an, W, H, L.mirrorVideo, L.swapSides, s, (a) => figNow(a).h * SIL_TORSO)) {
            if (targetLevel) {
              if (st.athlete === analyzed) max = Math.max(max, st.speed);
              const tg = targets.match(st, targetLevel);
              if (tg) L.hitTarget(st.athlete, tg, st.speed > Math.max(targetLevel.minSpeed, th.strikeSpeed) * 1.5);
              continue;
            }
            // colpo libero: conta per l'atleta del riquadro in cui sta la mano o il piede
            const a = inZone(zones.hong, st.x, st.y) ? 'hong' : inZone(zones.chong, st.x, st.y) ? 'chong' : null;
            if (!a) continue;
            if (a === analyzed) max = Math.max(max, st.speed);
            if (st.speed > th.strikeSpeed && ora - match.cooldownRef.current[a] > HIT_COOLDOWN_MS) {
              match.registerHit(a, st.x, st.y, st.speed > th.strikeSpeed * 1.5, st.kind);
            }
          }
          setLevel(analyzed, max / th.strikeSpeed);
        }
      }

      // 5. disegno
      for (const a of ATHLETES) drawPad(ctx, zones[a], a, active, ora - match.cooldownRef.current[a] < 250, s);
      for (const a of ATHLETES) drawAthleteGuide(ctx, cal, a, zones[a], s, !active);
      if (targetLevel && active) {
        targets.update(ora, targetLevel, (a) => body(a) ?? bodyFromFigure(figNow(a)), zones, s, {
          miss: () => soundEngine.playBeep(170, 'sine', 0.18, 0.2),
          spawn: (k) => soundEngine.playBeep(k === 'calcio-alto' ? 1500 : 1250, 'sine', 0.07, 0.18),
        });
        targets.draw(ctx, ora, s);
      }
      if (corpo) drawSkeletons(ctx, detector.tracks, L.swapSides, L.mirrorVideo, s);
      for (const a of ATHLETES) drawScore(ctx, zones[a], a, match.puntiRef.current[a], s);
      drawFx(ctx, match.fxRef.current, s);
      drawBanner(ctx, s, { active, tempo: match.tempoRef.current, vincitore: match.vincitoreRef.current, durata: L.durata });

      animId = requestAnimationFrame(frame);
    };
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
    // il ciclo legge tutto da ref e oggetti stabili: parte una volta sola
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeDurata = (d: number) => {
    if (match.busy) return;
    setDurata(d);
    match.resetIdle(d);
    soundEngine.playBeep(440, 'triangle', 0.08);
  };

  return (
    <div className="flex flex-col w-full h-full min-h-0 gap-2">
      <video ref={videoRef} playsInline autoPlay muted className="hidden" />

      <div className="relative flex-1 min-h-0 w-full bg-black comic-box rounded-xl overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-contain cursor-default"
          onClick={(e) => {
            // tocco sul riquadro = colpo simulato dell'atleta di quel lato
            const rect = e.currentTarget.getBoundingClientRect();
            simulateHit(athleteOfSide(e.clientX - rect.left < rect.width * 0.5 ? 'left' : 'right', swapSides));
          }}
        />
        <div className="absolute inset-0 scanlines opacity-40 pointer-events-none" />

        <CalibrationOverlay
          cal={calibration.ui}
          swapSides={swapSides}
          onStart={calibration.start}
          onCancel={calibration.cancel}
          onClose={calibration.close}
        />
        {!calibration.calibrated && calibration.ui.phase === 'off' && !match.busy && <CalibrateCta onClick={calibration.open} />}
        {tipologia === 'corpo' && <PoseLoadingOverlay status={pose.status} onRetry={pose.retry} />}
        {match.garaAttiva && <IntensityMeters levels={levels} swapSides={swapSides} />}
        <CommandBurst burst={burst.burst} />
        {match.countdownValue !== null && <CountdownOverlay value={match.countdownValue} />}
        {(cameraError || !cameraEnabled) && !match.inCountdown && <CameraNotice enabled={cameraEnabled} />}
      </div>

      <ArenaControls
        durata={durata}
        onDurata={changeDurata}
        countdownSec={countdownSec}
        onCountdown={setCountdownSec}
        tipologia={tipologia}
        onTipologia={setTipologia}
        difficolta={difficolta}
        onDifficolta={setDifficolta}
        busy={match.busy}
        inCountdown={match.inCountdown}
        swapSides={swapSides}
        onSimulate={simulateHit}
        calibrated={calibration.calibrated}
        calibrating={calibration.ui.phase !== 'off'}
        onCalibrate={calibration.open}
        onStart={match.start}
        onStop={match.stop}
      />
    </div>
  );
};
