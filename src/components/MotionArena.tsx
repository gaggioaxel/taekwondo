import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Square, Zap, Minus, Plus, Loader2 } from 'lucide-react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { soundEngine } from '../utils/audio';
import { loadPref, savePref } from '../utils/prefs';
import { loadPoseLandmarker, Pose, SKELETON, STRIKE_POINTS } from '../utils/pose';
import { ComicPopup, ImpactBurst, MatchStats } from '../types';

export type Tipologia = 'energia' | 'corpo';
export type Difficolta = 'facile' | 'medio' | 'difficile';

const DIFFICOLTA: { id: Difficolta; label: string; title: string }[] = [
  { id: 'facile', label: 'Facile', title: 'Basta un colpo leggero per fare punto' },
  { id: 'medio', label: 'Medio', title: 'Serve un colpo deciso' },
  { id: 'difficile', label: 'Difficile', title: 'Contano solo i colpi forti e ampi' },
];

interface MotionArenaProps {
  facingMode: 'user' | 'environment';
  mirrorVideo: boolean;
  onMatchComplete: (stats: MatchStats) => void;
}

const ONOMATOPEE = [
  "KAPOW!", "BAM!", "BOOM!", "WHAM!", "TAEKWON!",
  "DWI CHAGI!", "DOLRYEO!", "AP CHAGI!", "YEOP CHAGI!", "SMASH!"
];

const COUNTDOWN_OPTIONS = [0, 3, 5, 10];
const DURATA_MIN = 5;
const DURATA_MAX = 300;
const DURATA_STEP = 5;
const HIT_COOLDOWN_MS = 320;
const POSE_COLORS = ['#ffe600', '#00ffcc', '#ff66ff', '#ffffff'];

type PoseStatus = 'idle' | 'loading' | 'ready' | 'error';
type StrikePoint = { id: number; x: number; y: number }; // coordinate canvas in pixel

export const MotionArena: React.FC<MotionArenaProps> = ({
  facingMode,
  mirrorVideo,
  onMatchComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Match State
  const [puntiHong, setPuntiHong] = useState<number>(0);
  const [puntiChong, setPuntiChong] = useState<number>(0);
  const [durataGara, setDurataGara] = useState<number>(() => loadPref('durata', 20));
  const [tempoRimanente, setTempoRimanente] = useState<number>(durataGara);
  const [garaAttiva, setGaraAttiva] = useState<boolean>(false);
  const [vincitoreText, setVincitoreText] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [, setCameraReady] = useState<boolean>(false);

  // Countdown before Shijak
  const [countdownSec, setCountdownSec] = useState<number>(() => loadPref('countdown', 10));
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const countdownTimerRef = useRef<any>(null);

  // Tipologia: 'energia' = differenza tra fotogrammi, 'corpo' = tracking del corpo (modello)
  const [tipologia, setTipologia] = useState<Tipologia>(() => loadPref<Tipologia>('tipologia', 'energia'));
  const [difficolta, setDifficolta] = useState<Difficolta>(() => loadPref<Difficolta>('difficolta', 'medio'));
  const [poseStatus, setPoseStatus] = useState<PoseStatus>('idle');
  const [personeRilevate, setPersoneRilevate] = useState<number>(0);
  const tipologiaRef = useRef<Tipologia>(tipologia);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const posesRef = useRef<Pose[]>([]);
  const lastPoseTsRef = useRef<number>(0);
  const prevStrikeRef = useRef<{ t: number; points: StrikePoint[] } | null>(null);
  const personeRef = useRef<number>(0);

  // Live motion activity levels (for UI meter)
  const [motionHongLevel, setMotionHongLevel] = useState<number>(0);
  const [motionChongLevel, setMotionChongLevel] = useState<number>(0);

  // Internal refs for animation loop
  const garaAttivaRef = useRef<boolean>(false);
  const tempoRimanenteRef = useRef<number>(durataGara);
  const puntiHongRef = useRef<number>(0);
  const puntiChongRef = useRef<number>(0);
  const prevFrameDataRef = useRef<ImageData | null>(null);
  const cooldownHongRef = useRef<number>(0);
  const cooldownChongRef = useRef<number>(0);
  const popupsRef = useRef<ComicPopup[]>([]);
  const burstsRef = useRef<ImpactBurst[]>([]);
  const snapshotsRef = useRef<string[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Soglie per difficoltà
  // Energia: pixel campionati che cambiano nel riquadro
  // Quota (0-1) dell'immagine della camera che deve cambiare dentro una finestra: indipendente
  // da risoluzione e dimensione delle finestre (tarata sui vecchi 65/110/160 punti campionati
  // su 160x90 campioni di un'immagine 1280x720)
  const energiaQuota = difficolta === 'difficile' ? 0.011 : difficolta === 'medio' ? 0.0076 : 0.0045;
  const pixelDiffThreshold = difficolta === 'difficile' ? 42 : difficolta === 'medio' ? 35 : 28;
  // Corpo: velocità minima di polso/caviglia, in larghezze-schermo al secondo
  const strikeSpeedThreshold = difficolta === 'difficile' ? 1.3 : difficolta === 'medio' ? 0.9 : 0.6;

  // Sync refs
  const mirrorVideoRef = useRef<boolean>(mirrorVideo);
  useEffect(() => {
    mirrorVideoRef.current = mirrorVideo;
    prevStrikeRef.current = null;
  }, [mirrorVideo]);

  useEffect(() => {
    garaAttivaRef.current = garaAttiva;
  }, [garaAttiva]);

  useEffect(() => {
    tempoRimanenteRef.current = tempoRimanente;
  }, [tempoRimanente]);

  useEffect(() => savePref('countdown', countdownSec), [countdownSec]);
  useEffect(() => savePref('durata', durataGara), [durataGara]);
  useEffect(() => savePref('difficolta', difficolta), [difficolta]);

  // Level switch: load the pose model lazily the first time LV2 is chosen
  useEffect(() => {
    tipologiaRef.current = tipologia;
    savePref('tipologia', tipologia);
    prevFrameDataRef.current = null;
    prevStrikeRef.current = null;
    posesRef.current = [];
    if (tipologia !== 'corpo' || landmarkerRef.current) return;
    let cancelled = false;
    setPoseStatus('loading');
    loadPoseLandmarker()
      .then((lm) => {
        if (cancelled) return;
        landmarkerRef.current = lm;
        setPoseStatus('ready');
      })
      .catch((err) => {
        console.warn('Pose model failed to load:', err);
        if (!cancelled) setPoseStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [tipologia]);

  useEffect(() => () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  }, []);

  // Start Camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().then(() => {
          setCameraReady(true);
        }).catch(() => {
          setCameraReady(true);
        });
      }
    } catch (err: any) {
      console.warn("Camera access failed or unavailable:", err);
      setCameraError(err.message || "Impossibile accedere alla fotocamera. Puoi usare la modalità simulazione.");
      setCameraReady(true); // Allow simulation loop
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  // Spawn visual impact burst
  const triggerImpact = useCallback((side: 'hong' | 'chong', x: number, y: number, text: string) => {
    const burstColor = side === 'hong' ? '#ff1e44' : '#0099ff';
    const popupColor = side === 'hong' ? '#ffff00' : '#ffff33';

    popupsRef.current.push({
      id: Math.random().toString(),
      testo: text,
      x: x,
      y: y,
      color: popupColor,
      rot: (Math.random() - 0.5) * 35,
      scale: 1.1 + Math.random() * 0.4,
      timer: 24, // frames to show
    });

    burstsRef.current.push({
      id: Math.random().toString(),
      x: x,
      y: y,
      color: burstColor,
      size: 60 + Math.random() * 40,
      timer: 16,
    });
  }, []);

  // Score a hit for one side (shared by LV1, LV2 and manual simulation)
  const registerHit = useCallback((side: 'hong' | 'chong', x: number, y: number, strong: boolean) => {
    const onom = ONOMATOPEE[Math.floor(Math.random() * ONOMATOPEE.length)];
    if (side === 'hong') {
      puntiHongRef.current += 1;
      setPuntiHong(puntiHongRef.current);
      cooldownHongRef.current = Date.now();
      soundEngine.playPunchImpact('hong');
      soundEngine.playBeep(900, 'square', 0.15);
    } else {
      puntiChongRef.current += 1;
      setPuntiChong(puntiChongRef.current);
      cooldownChongRef.current = Date.now();
      soundEngine.playPunchImpact('chong');
      soundEngine.playBeep(450, 'square', 0.15);
    }
    triggerImpact(side, x, y, onom);

    // Capture highlight snapshot on strong hits
    const canvas = canvasRef.current;
    if (strong && canvas && snapshotsRef.current.length < 4) {
      snapshotsRef.current.push(canvas.toDataURL('image/jpeg', 0.75));
    }
  }, [triggerImpact]);

  // Duration controls
  const changeDurata = (delta: number) => {
    if (garaAttiva || countdownValue !== null) return;
    const next = Math.min(DURATA_MAX, Math.max(DURATA_MIN, durataGara + delta));
    setDurataGara(next);
    setTempoRimanente(next);
    tempoRimanenteRef.current = next;
    setVincitoreText("");
    soundEngine.playBeep(440, 'triangle', 0.08);
  };

  const handleStartGara = () => {
    if (garaAttivaRef.current || countdownTimerRef.current) return;
    soundEngine.unlock();
    setVincitoreText("");
    if (countdownSec <= 0) {
      beginMatch();
      return;
    }
    let n = countdownSec;
    setCountdownValue(n);
    soundEngine.playCountdownTick(n);
    countdownTimerRef.current = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCountdownValue(n);
        soundEngine.playCountdownTick(n);
      } else {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setCountdownValue(null);
        beginMatch();
      }
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setCountdownValue(null);
    soundEngine.stopVoice();
  };

  const beginMatch = () => {
    setPuntiHong(0);
    setPuntiChong(0);
    puntiHongRef.current = 0;
    puntiChongRef.current = 0;
    snapshotsRef.current = [];
    setTempoRimanente(durataGara);
    tempoRimanenteRef.current = durataGara;
    setVincitoreText("");
    setGaraAttiva(true);
    garaAttivaRef.current = true;

    soundEngine.playShijak();

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      tempoRimanenteRef.current -= 1;
      setTempoRimanente(tempoRimanenteRef.current);

      if (tempoRimanenteRef.current <= 0) {
        clearInterval(timerIntervalRef.current);
        setGaraAttiva(false);
        garaAttivaRef.current = false;
        soundEngine.playKeuman();

        let wText = "";
        let winner: 'hong' | 'chong' | 'tie' = 'tie';
        const finalHong = puntiHongRef.current;
        const finalChong = puntiChongRef.current;

        if (finalHong > finalChong) {
          wText = "KEUMAN! WINNER: HONG (ROSSO)!";
          winner = 'hong';
        } else if (finalChong > finalHong) {
          wText = "KEUMAN! WINNER: CHONG (BLU)!";
          winner = 'chong';
        } else {
          wText = "KEUMAN! PARITA'!";
          winner = 'tie';
        }
        setVincitoreText(wText);

        onMatchComplete({
          puntiHong: finalHong,
          puntiChong: finalChong,
          durata: durataGara,
          vincitore: winner,
          colpiHong: finalHong,
          colpiChong: finalChong,
          cadenzaHong: Number((finalHong / durataGara).toFixed(2)),
          cadenzaChong: Number((finalChong / durataGara).toFixed(2)),
          snapshots: snapshotsRef.current,
        });
      }
    }, 1000);
  };

  const handleStopGara = () => {
    if (countdownTimerRef.current) {
      cancelCountdown();
      return;
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setGaraAttiva(false);
    garaAttivaRef.current = false;
    soundEngine.playKeuman();
    setVincitoreText("INCONTRO INTERROTTO");
  };

  // Manual hit simulation
  const handleSimulateHit = (side: 'hong' | 'chong') => {
    if (!garaAttivaRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    registerHit(side, side === 'hong' ? w * 0.25 : w * 0.75, h * 0.5, false);
  };

  // Process Video Frame & Draw Comic Graphics
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let animId: number;

    const processFrame = () => {
      const w = canvas.width;
      const h = canvas.height;
      const videoLive = !!video && video.readyState >= 2 && video.videoWidth > 0;

      // 1. Draw camera video or simulation background
      if (videoLive) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.save();
        if (mirrorVideoRef.current) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        // Fallback animated arcade background
        ctx.fillStyle = '#0f141d';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      const currentW = canvas.width;
      const currentH = canvas.height;
      // Fattore di scala: la grafica è disegnata pensando a 800px di larghezza
      const s = currentW / 800;

      if (!videoLive && !cameraError) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(14 * s)}px "Bangers", Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          "INIZIALIZZAZIONE FOTOCAMERA...",
          currentW * 0.5,
          currentH * 0.95
        );
      }

      // Zone Hong e Chong (45% ciascuna, quasi fino ai bordi della camera), dal banner quasi fino al pavimento
      const zoneHong = {
        x1: Math.floor(currentW * 0.02),
        y1: Math.floor(currentH * 0.13),
        w: Math.floor(currentW * 0.45),
        h: Math.floor(currentH * 0.85),
      };
      const zoneChong = {
        x1: Math.floor(currentW * 0.53),
        y1: Math.floor(currentH * 0.13),
        w: Math.floor(currentW * 0.45),
        h: Math.floor(currentH * 0.85),
      };
      const inZone = (z: typeof zoneHong, x: number, y: number) =>
        x >= z.x1 && x <= z.x1 + z.w && y >= z.y1 && y <= z.y1 + z.h;

      const ora = Date.now();

      // 2a. LIVELLO 1 — Motion Detection via Pixel Differencing
      if (tipologiaRef.current === 'energia') {
        let currentFrameData: ImageData | null = null;
        try {
          currentFrameData = ctx.getImageData(0, 0, currentW, currentH);
        } catch {
          // Cross-origin fallback
        }

        if (currentFrameData && prevFrameDataRef.current && garaAttivaRef.current
            && prevFrameDataRef.current.width === currentW && prevFrameDataRef.current.height === currentH) {
          const prev = prevFrameDataRef.current.data;
          const curr = currentFrameData.data;

          // Punti cambiati nella finestra, in rapporto ai punti dell'intera immagine (campiona 1 pixel ogni 8)
          const frameSamples = Math.ceil(currentW / 8) * Math.ceil(currentH / 8);
          const changedRatio = (z: typeof zoneHong) => {
            let changed = 0;
            for (let y = z.y1; y < z.y1 + z.h; y += 8) {
              for (let x = z.x1; x < z.x1 + z.w; x += 8) {
                const i = (y * currentW + x) * 4;
                if (Math.abs(curr[i] - prev[i]) > pixelDiffThreshold) changed++;
              }
            }
            return changed / frameSamples;
          };
          const ratioHong = changedRatio(zoneHong);
          const ratioChong = changedRatio(zoneChong);

          setMotionHongLevel(Math.min(100, Math.floor((ratioHong / energiaQuota) * 100)));
          setMotionChongLevel(Math.min(100, Math.floor((ratioChong / energiaQuota) * 100)));

          if (ratioHong > energiaQuota && ora - cooldownHongRef.current > HIT_COOLDOWN_MS) {
            registerHit('hong', zoneHong.x1 + zoneHong.w * 0.5, zoneHong.y1 + zoneHong.h * 0.45, ratioHong > energiaQuota * 1.5);
          }
          if (ratioChong > energiaQuota && ora - cooldownChongRef.current > HIT_COOLDOWN_MS) {
            registerHit('chong', zoneChong.x1 + zoneChong.w * 0.5, zoneChong.y1 + zoneChong.h * 0.45, ratioChong > energiaQuota * 1.5);
          }
        }

        if (currentFrameData) {
          prevFrameDataRef.current = currentFrameData;
        }
      }

      // 2b. LIVELLO 2 — Body tracking: only fast wrists/ankles inside a pad score
      if (tipologiaRef.current === 'corpo' && landmarkerRef.current && videoLive) {
        const now = performance.now();
        if (now > lastPoseTsRef.current) {
          try {
            const res = landmarkerRef.current.detectForVideo(video, now);
            posesRef.current = res.landmarks;
            lastPoseTsRef.current = now;
          } catch (err) {
            console.warn('Pose detection error:', err);
          }
        }

        const toCanvasX = (nx: number) => (mirrorVideoRef.current ? 1 - nx : nx) * currentW;
        const strikes: StrikePoint[] = [];
        posesRef.current.forEach((pose) => {
          STRIKE_POINTS.forEach((id) => {
            const p = pose[id];
            if (p && (p.visibility ?? 1) > 0.5) strikes.push({ id, x: toCanvasX(p.x), y: p.y * currentH });
          });
        });

        if (personeRef.current !== posesRef.current.length) {
          personeRef.current = posesRef.current.length;
          setPersoneRilevate(posesRef.current.length);
        }

        const prev = prevStrikeRef.current;
        if (prev && garaAttivaRef.current) {
          const dt = Math.max(0.001, (now - prev.t) / 1000);
          let maxHong = 0;
          let maxChong = 0;
          for (const pt of strikes) {
            // Abbina lo stesso landmark più vicino nel frame precedente (le persone non hanno id stabili)
            let best: StrikePoint | null = null;
            let bestDist = Infinity;
            for (const q of prev.points) {
              if (q.id !== pt.id) continue;
              const d = Math.hypot(pt.x - q.x, pt.y - q.y);
              if (d < bestDist) { bestDist = d; best = q; }
            }
            if (!best || bestDist > currentW * 0.25) continue;
            const speed = bestDist / currentW / dt; // larghezze-schermo al secondo

            if (inZone(zoneHong, pt.x, pt.y)) {
              maxHong = Math.max(maxHong, speed);
              if (speed > strikeSpeedThreshold && ora - cooldownHongRef.current > HIT_COOLDOWN_MS) {
                registerHit('hong', pt.x, pt.y, speed > strikeSpeedThreshold * 1.5);
              }
            } else if (inZone(zoneChong, pt.x, pt.y)) {
              maxChong = Math.max(maxChong, speed);
              if (speed > strikeSpeedThreshold && ora - cooldownChongRef.current > HIT_COOLDOWN_MS) {
                registerHit('chong', pt.x, pt.y, speed > strikeSpeedThreshold * 1.5);
              }
            }
          }
          setMotionHongLevel(Math.min(100, Math.floor((maxHong / strikeSpeedThreshold) * 100)));
          setMotionChongLevel(Math.min(100, Math.floor((maxChong / strikeSpeedThreshold) * 100)));
        }
        prevStrikeRef.current = { t: now, points: strikes };
      }

      // 3. Draw Zone Graphics
      const isHongHitRecently = ora - cooldownHongRef.current < 250;
      const isChongHitRecently = ora - cooldownChongRef.current < 250;

      const drawPad = (z: typeof zoneHong, side: 'hong' | 'chong', hit: boolean) => {
        const active = garaAttivaRef.current;
        const rgb = side === 'hong' ? '255, 0, 51' : '0, 153, 255';
        const solid = side === 'hong' ? '#ff0033' : '#0099ff';
        ctx.fillStyle = active ? `rgba(${rgb}, ${hit ? 0.4 : 0.15})` : 'rgba(50, 50, 50, 0.25)';
        ctx.fillRect(z.x1, z.y1, z.w, z.h);

        ctx.lineWidth = 6 * s;
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(z.x1, z.y1, z.w, z.h);
        ctx.lineWidth = 4 * s;
        ctx.strokeStyle = active ? solid : '#666666';
        ctx.strokeRect(z.x1, z.y1, z.w, z.h);

        ctx.strokeStyle = active ? `rgba(${rgb}, 0.5)` : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2 * s;
        const cx = z.x1 + z.w / 2;
        const cy = z.y1 + z.h / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 32 * s, 0, Math.PI * 2);
        ctx.moveTo(cx - 45 * s, cy);
        ctx.lineTo(cx + 45 * s, cy);
        ctx.moveTo(cx, cy - 45 * s);
        ctx.lineTo(cx, cy + 45 * s);
        ctx.stroke();
      };

      ctx.save();
      drawPad(zoneHong, 'hong', isHongHitRecently);
      drawPad(zoneChong, 'chong', isChongHitRecently);
      ctx.restore();

      // 3b. LV2 skeletons
      if (tipologiaRef.current === 'corpo' && posesRef.current.length) {
        ctx.save();
        ctx.lineCap = 'round';
        posesRef.current.forEach((pose, pi) => {
          const color = POSE_COLORS[pi % POSE_COLORS.length];
          const P = (i: number) => ({
            x: (mirrorVideoRef.current ? 1 - pose[i].x : pose[i].x) * currentW,
            y: pose[i].y * currentH,
            v: pose[i].visibility ?? 1,
          });
          ctx.strokeStyle = color;
          ctx.lineWidth = 4 * s;
          ctx.globalAlpha = 0.85;
          for (const [a, b] of SKELETON) {
            const pa = P(a);
            const pb = P(b);
            if (pa.v < 0.5 || pb.v < 0.5) continue;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          for (const id of STRIKE_POINTS) {
            const p = P(id);
            if (p.v < 0.5) continue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 9 * s, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 3 * s;
            ctx.strokeStyle = '#000';
            ctx.stroke();
          }
        });
        ctx.restore();
      }

      // 4. Score Boxes
      const drawScore = (z: typeof zoneHong, label: string, stroke: string, fill: string) => {
        // Dentro il riquadro, in alto a sinistra
        const bw = Math.min(200 * s, z.w - 16 * s);
        const bh = 36 * s;
        const bx = z.x1 + 8 * s;
        const by = z.y1 + 8 * s;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = stroke;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = fill;
        ctx.font = `bold ${Math.round(22 * s)}px "Bangers", Impact, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 10 * s, by + bh / 2 + 1 * s);
      };
      ctx.save();
      drawScore(zoneHong, `홍 HONG: ${puntiHongRef.current}`, '#ff0033', '#ff3344');
      drawScore(zoneChong, `청 CHONG: ${puntiChongRef.current}`, '#0099ff', '#33a3ff');
      ctx.restore();

      // 5. Draw Impact Bursts
      burstsRef.current.forEach((burst) => {
        if (burst.timer > 0) {
          ctx.save();
          ctx.translate(burst.x, burst.y);
          ctx.fillStyle = burst.color;
          ctx.beginPath();
          const spikes = 8;
          const outerRadius = burst.size * s * (1 - burst.timer / 20 + 0.3);
          const innerRadius = outerRadius * 0.45;
          for (let k = 0; k < spikes * 2; k++) {
            const radius = k % 2 === 0 ? outerRadius : innerRadius;
            const angle = (k * Math.PI) / spikes;
            const px = Math.cos(angle) * radius;
            const py = Math.sin(angle) * radius;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 3 * s;
          ctx.strokeStyle = '#000';
          ctx.stroke();
          ctx.restore();
          burst.timer--;
        }
      });
      burstsRef.current = burstsRef.current.filter(b => b.timer > 0);

      // 6. Draw Onomatopoeia Popups
      popupsRef.current.forEach((popup) => {
        if (popup.timer > 0) {
          ctx.save();
          ctx.translate(popup.x, popup.y);
          ctx.rotate((popup.rot * Math.PI) / 180);
          ctx.scale(popup.scale * s, popup.scale * s);

          ctx.font = 'bold 38px "Bangers", Impact, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 8;
          ctx.strokeStyle = '#000000';
          ctx.strokeText(popup.testo, 0, 0);
          ctx.fillStyle = popup.color;
          ctx.fillText(popup.testo, 0, 0);

          ctx.restore();
          popup.timer--;
        }
      });
      popupsRef.current = popupsRef.current.filter(p => p.timer > 0);

      // 7. Top Match Status Ribbon
      ctx.save();
      const bannerW = Math.min(340 * s, currentW * 0.5);
      const bannerH = 40 * s;
      const bannerX = (currentW - bannerW) / 2;
      const bannerY = 10 * s;
      ctx.fillStyle = '#000000';
      ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = garaAttivaRef.current ? '#00ff66' : '#ffcc00';
      ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const bannerMid = bannerY + bannerH / 2 + 1 * s;

      if (garaAttivaRef.current) {
        ctx.fillStyle = '#00ff66';
        ctx.font = `bold ${Math.round(22 * s)}px "Bangers", Impact, sans-serif`;
        ctx.fillText(`⚡ 시작 (SHIJAK!) - ${tempoRimanenteRef.current}s`, currentW / 2, bannerMid);
      } else if (vincitoreText) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold ${Math.round(20 * s)}px "Bangers", Impact, sans-serif`;
        ctx.fillText(vincitoreText, currentW / 2, bannerMid);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(21 * s)}px "Bangers", Impact, sans-serif`;
        ctx.fillText(`준비 (CHUNBI) - ${durataGara}s`, currentW / 2, bannerMid);
      }
      ctx.restore();

      animId = requestAnimationFrame(processFrame);
    };

    animId = requestAnimationFrame(processFrame);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [cameraError, energiaQuota, pixelDiffThreshold, strikeSpeedThreshold, durataGara, vincitoreText, registerHit]);

  const inCountdown = countdownValue !== null;
  const busy = garaAttiva || inCountdown;

  const segBtn = (selected: boolean) =>
    `h-10 min-w-10 px-2.5 rounded comic-box-sm font-comic text-base transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
      selected ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
    }`;

  return (
    <div className="flex flex-col w-full h-full min-h-0 gap-2">
      {/* Hidden Video Feed for stream input */}
      <video ref={videoRef} playsInline autoPlay muted className="hidden" />

      {/* Main Interactive Comic Stage */}
      <div className="relative flex-1 min-h-0 w-full bg-black comic-box rounded-xl overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-contain cursor-default"
          onClick={(e) => {
            // Tap-to-strike: map the click through object-contain letterboxing
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            if (clickX < rect.width * 0.5) {
              handleSimulateHit('hong');
            } else {
              handleSimulateHit('chong');
            }
          }}
        />

        {/* Scanlines Effect */}
        <div className="absolute inset-0 scanlines opacity-40 pointer-events-none" />

        {/* Level 2 status */}
        {tipologia === 'corpo' && (
          <div className="absolute top-3 left-3 z-20 bg-black/80 comic-box-sm rounded px-2.5 py-1 text-xs font-bold flex items-center gap-2 pointer-events-none">
            {poseStatus === 'loading' && (<><Loader2 className="w-4 h-4 animate-spin text-yellow-400" /><span>Carico il modello del corpo…</span></>)}
            {poseStatus === 'ready' && (<><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" /><span>Body tracking · {personeRilevate} {personeRilevate === 1 ? 'persona' : 'persone'}</span></>)}
            {poseStatus === 'error' && (<span className="text-amber-400">Modello non caricato: controlla la connessione</span>)}
          </div>
        )}

        {/* Live Motion Activity Gauges */}
        {garaAttiva && (
          <>
            <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start bg-black/80 p-2 rounded comic-box-sm pointer-events-none">
              <span className="text-xs font-bold text-red-400">HONG INTENSITY</span>
              <div className="w-32 h-3 bg-zinc-800 rounded-full overflow-hidden mt-1 border border-zinc-700">
                <div className="h-full bg-red-500 transition-all duration-75" style={{ width: `${motionHongLevel}%` }} />
              </div>
            </div>
            <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end bg-black/80 p-2 rounded comic-box-sm pointer-events-none">
              <span className="text-xs font-bold text-blue-400">CHONG INTENSITY</span>
              <div className="w-32 h-3 bg-zinc-800 rounded-full overflow-hidden mt-1 border border-zinc-700">
                <div className="h-full bg-blue-500 transition-all duration-75" style={{ width: `${motionChongLevel}%` }} />
              </div>
            </div>
          </>
        )}

        {/* Countdown overlay */}
        {inCountdown && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/45 pointer-events-none">
            <span
              key={countdownValue}
              className="font-comic text-white text-stroke-thick leading-none countdown-pop"
              style={{ fontSize: 'min(34vh, 30vw)' }}
            >
              {countdownValue}
            </span>
          </div>
        )}

        {/* Camera Permission Alert Banner */}
        {cameraError && !inCountdown && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-amber-500/95 text-black px-3 py-1.5 rounded comic-box-sm text-xs font-bold flex items-center gap-2 z-20 max-w-[90%] text-center">
            <span>📷 Fotocamera non attiva. Tocca i riquadri o usa i tasti per simulare i colpi!</span>
          </div>
        )}
      </div>

      {/* Bottom bar: impostazioni che si cambiano spesso + start */}
      <div className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-zinc-900/90 border-2 border-black px-3 py-2 rounded-xl comic-box">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Durata */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-zinc-400 font-comic uppercase mr-1">Durata</span>
            <button onClick={() => changeDurata(-DURATA_STEP)} disabled={busy || durataGara <= DURATA_MIN} className={segBtn(false)} title="-5 secondi">
              <Minus className="w-5 h-5 mx-auto" />
            </button>
            <span className="h-10 min-w-[4rem] px-2 rounded comic-box-sm bg-black font-comic text-xl text-yellow-300 flex items-center justify-center tabular-nums">
              {garaAttiva ? tempoRimanente : durataGara}s
            </span>
            <button onClick={() => changeDurata(DURATA_STEP)} disabled={busy || durataGara >= DURATA_MAX} className={segBtn(false)} title="+5 secondi">
              <Plus className="w-5 h-5 mx-auto" />
            </button>
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-zinc-400 font-comic uppercase mr-1">Countdown</span>
            {COUNTDOWN_OPTIONS.map((sec) => (
              <button key={sec} onClick={() => setCountdownSec(sec)} disabled={busy} className={segBtn(countdownSec === sec)}>
                {sec === 0 ? 'OFF' : sec}
              </button>
            ))}
          </div>

          {/* Tipologia */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-zinc-400 font-comic uppercase mr-1">Tipologia</span>
            <button onClick={() => setTipologia('energia')} disabled={busy} className={segBtn(tipologia === 'energia')} title="Energia: conta qualsiasi movimento nel riquadro">
              Energia
            </button>
            <button onClick={() => setTipologia('corpo')} disabled={busy} className={segBtn(tipologia === 'corpo')} title="Corpo: un modello segue il corpo e contano solo pugni e calci veloci">
              Corpo
            </button>
          </div>

          {/* Difficoltà */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-zinc-400 font-comic uppercase mr-1">Difficoltà</span>
            {DIFFICOLTA.map((d) => (
              <button key={d.id} onClick={() => setDifficolta(d.id)} disabled={busy} className={segBtn(difficolta === d.id)} title={d.title}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Simulator hit buttons */}
          <button
            onClick={() => handleSimulateHit('hong')}
            className="h-10 bg-red-600/90 hover:bg-red-500 text-white font-comic text-xs px-3 rounded comic-box-sm flex items-center gap-1 cursor-pointer"
            title="Simula colpo bersaglio Hong"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden 2xl:inline">COLPISCI</span> HONG
          </button>
          <button
            onClick={() => handleSimulateHit('chong')}
            className="h-10 bg-blue-600/90 hover:bg-blue-500 text-white font-comic text-xs px-3 rounded comic-box-sm flex items-center gap-1 cursor-pointer"
            title="Simula colpo bersaglio Chong"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden 2xl:inline">COLPISCI</span> CHONG
          </button>

          {/* Start / Stop */}
          {!busy ? (
            <button
              onClick={handleStartGara}
              className="h-12 bg-emerald-500 hover:bg-emerald-400 text-black font-comic text-xl px-6 rounded-lg comic-box flex items-center gap-2 active:translate-y-0.5 transition shadow-[3px_3px_0px_#000] cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>시작 (SHIJAK!)</span>
            </button>
          ) : (
            <button
              onClick={handleStopGara}
              className="h-12 bg-rose-600 hover:bg-rose-500 text-white font-comic text-xl px-6 rounded-lg comic-box flex items-center gap-2 active:translate-y-0.5 transition shadow-[3px_3px_0px_#000] cursor-pointer"
            >
              <Square className="w-5 h-5 fill-current" />
              <span>{inCountdown ? 'ANNULLA' : '그만 (KEUMAN!)'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
