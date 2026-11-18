import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Square, Zap, FlipHorizontal } from 'lucide-react';
import { soundEngine } from '../utils/audio';
import { ComicPopup, ImpactBurst, MatchStats } from '../types';

interface MotionArenaProps {
  sensitivity: 'low' | 'normal' | 'high';
  facingMode: 'user' | 'environment';
  mirrorVideo: boolean;
  onToggleMirror: () => void;
  onMatchComplete: (stats: MatchStats) => void;
}

const ONOMATOPEE = [
  "KAPOW!", "BAM!", "BOOM!", "WHAM!", "TAEKWON!",
  "DWI CHAGI!", "DOLRYEO!", "AP CHAGI!", "YEOP CHAGI!", "SMASH!"
];

export const MotionArena: React.FC<MotionArenaProps> = ({
  sensitivity,
  facingMode,
  mirrorVideo,
  onToggleMirror,
  onMatchComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Match State
  const [puntiHong, setPuntiHong] = useState<number>(0);
  const [puntiChong, setPuntiChong] = useState<number>(0);
  const [durataGara, setDurataGara] = useState<number>(20);
  const [tempoRimanente, setTempoRimanente] = useState<number>(20);
  const [garaAttiva, setGaraAttiva] = useState<boolean>(false);
  const [vincitoreText, setVincitoreText] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState<boolean>(false);

  // Live motion activity levels (for UI meter)
  const [motionHongLevel, setMotionHongLevel] = useState<number>(0);
  const [motionChongLevel, setMotionChongLevel] = useState<number>(0);

  // Internal refs for animation loop
  const garaAttivaRef = useRef<boolean>(false);
  const tempoRimanenteRef = useRef<number>(20);
  const puntiHongRef = useRef<number>(0);
  const puntiChongRef = useRef<number>(0);
  const prevFrameDataRef = useRef<ImageData | null>(null);
  const cooldownHongRef = useRef<number>(0);
  const cooldownChongRef = useRef<number>(0);
  const popupsRef = useRef<ComicPopup[]>([]);
  const burstsRef = useRef<ImpactBurst[]>([]);
  const snapshotsRef = useRef<string[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const reqAnimRef = useRef<number>(0);

  // Sensitivity thresholds
  const sensitivityThreshold = sensitivity === 'low' ? 160 : sensitivity === 'normal' ? 110 : 65;
  const pixelDiffThreshold = sensitivity === 'low' ? 42 : sensitivity === 'normal' ? 35 : 28;

  // Sync refs
  const mirrorVideoRef = useRef<boolean>(mirrorVideo);
  useEffect(() => {
    mirrorVideoRef.current = mirrorVideo;
  }, [mirrorVideo]);

  useEffect(() => {
    garaAttivaRef.current = garaAttiva;
  }, [garaAttiva]);

  useEffect(() => {
    tempoRimanenteRef.current = tempoRimanente;
  }, [tempoRimanente]);

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

  // Timer controls
  const handleSetTimer = (sec: number) => {
    if (garaAttiva) return;
    setDurataGara(sec);
    setTempoRimanente(sec);
    tempoRimanenteRef.current = sec;
    setVincitoreText("");
    soundEngine.playBeep(440, 'triangle', 0.1);
  };

  const handleStartGara = () => {
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
    const w = canvas.width || 640;
    const h = canvas.height || 480;

    const onom = ONOMATOPEE[Math.floor(Math.random() * ONOMATOPEE.length)];
    if (side === 'hong') {
      puntiHongRef.current += 1;
      setPuntiHong(puntiHongRef.current);
      soundEngine.playPunchImpact('hong');
      soundEngine.playBeep(900, 'square', 0.15);
      triggerImpact('hong', w * 0.25, h * 0.5, onom);
    } else {
      puntiChongRef.current += 1;
      setPuntiChong(puntiChongRef.current);
      soundEngine.playPunchImpact('chong');
      soundEngine.playBeep(450, 'square', 0.15);
      triggerImpact('chong', w * 0.75, h * 0.5, onom);
    }
  };

  // Process Video Frame & Draw Comic Graphics
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const processFrame = () => {
      const w = canvas.width || 640;
      const h = canvas.height || 480;

      // 1. Draw camera video or simulation background
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
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

        // Comic grid pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px "Bangers", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          cameraError ? "MODALITA' SIMULATORE TARGET (CLICCA I TASTI O IL PAD)" : "INIZIALIZZAZIONE FOTOCAMERA...",
          w * 0.5,
          h * 0.18
        );
      }

      const currentW = canvas.width;
      const currentH = canvas.height;

      // Define Hong and Chong Zones (Left 40%, Right 40%)
      const zoneHong = {
        x1: Math.floor(currentW * 0.05),
        y1: Math.floor(currentH * 0.22),
        w: Math.floor(currentW * 0.40),
        h: Math.floor(currentH * 0.65),
      };
      const zoneChong = {
        x1: Math.floor(currentW * 0.55),
        y1: Math.floor(currentH * 0.22),
        w: Math.floor(currentW * 0.40),
        h: Math.floor(currentH * 0.65),
      };

      // 2. Motion Detection via Pixel Differencing
      let currentFrameData: ImageData | null = null;
      try {
        currentFrameData = ctx.getImageData(0, 0, currentW, currentH);
      } catch {
        // Cross-origin fallback
      }

      if (currentFrameData && prevFrameDataRef.current && garaAttivaRef.current) {
        let diffHong = 0;
        let diffChong = 0;
        const prev = prevFrameDataRef.current.data;
        const curr = currentFrameData.data;

        // Sample every 8 pixels as in user prototype
        for (let y = zoneHong.y1; y < zoneHong.y1 + zoneHong.h; y += 8) {
          for (let x = zoneHong.x1; x < zoneHong.x1 + zoneHong.w; x += 8) {
            const i = (y * currentW + x) * 4;
            const diff = Math.abs(curr[i] - prev[i]);
            if (diff > pixelDiffThreshold) diffHong++;
          }
        }

        for (let y = zoneChong.y1; y < zoneChong.y1 + zoneChong.h; y += 8) {
          for (let x = zoneChong.x1; x < zoneChong.x1 + zoneChong.w; x += 8) {
            const i = (y * currentW + x) * 4;
            const diff = Math.abs(curr[i] - prev[i]);
            if (diff > pixelDiffThreshold) diffChong++;
          }
        }

        setMotionHongLevel(Math.min(100, Math.floor((diffHong / sensitivityThreshold) * 100)));
        setMotionChongLevel(Math.min(100, Math.floor((diffChong / sensitivityThreshold) * 100)));

        const ora = Date.now();

        // Hong Hit Detection
        if (diffHong > sensitivityThreshold && ora - cooldownHongRef.current > 320) {
          puntiHongRef.current += 1;
          setPuntiHong(puntiHongRef.current);
          cooldownHongRef.current = ora;
          soundEngine.playPunchImpact('hong');
          soundEngine.playBeep(900, 'square', 0.15);

          const onom = ONOMATOPEE[Math.floor(Math.random() * ONOMATOPEE.length)];
          triggerImpact('hong', zoneHong.x1 + zoneHong.w * 0.5, zoneHong.y1 + zoneHong.h * 0.45, onom);

          // Capture highlight snapshot on strong hits
          if (diffHong > sensitivityThreshold * 1.5 && snapshotsRef.current.length < 4) {
            snapshotsRef.current.push(canvas.toDataURL('image/jpeg', 0.75));
          }
        }

        // Chong Hit Detection
        if (diffChong > sensitivityThreshold && ora - cooldownChongRef.current > 320) {
          puntiChongRef.current += 1;
          setPuntiChong(puntiChongRef.current);
          cooldownChongRef.current = ora;
          soundEngine.playPunchImpact('chong');
          soundEngine.playBeep(450, 'square', 0.15);

          const onom = ONOMATOPEE[Math.floor(Math.random() * ONOMATOPEE.length)];
          triggerImpact('chong', zoneChong.x1 + zoneChong.w * 0.5, zoneChong.y1 + zoneChong.h * 0.45, onom);

          if (diffChong > sensitivityThreshold * 1.5 && snapshotsRef.current.length < 4) {
            snapshotsRef.current.push(canvas.toDataURL('image/jpeg', 0.75));
          }
        }
      }

      if (currentFrameData) {
        prevFrameDataRef.current = currentFrameData;
      }

      // 3. Draw Zone Graphics (Hong Red Pad)
      const isHongHitRecently = Date.now() - cooldownHongRef.current < 250;
      const isChongHitRecently = Date.now() - cooldownChongRef.current < 250;

      // Hong Pad
      ctx.save();
      ctx.fillStyle = garaAttivaRef.current
        ? (isHongHitRecently ? 'rgba(255, 30, 68, 0.4)' : 'rgba(255, 0, 51, 0.15)')
        : 'rgba(50, 50, 50, 0.25)';
      ctx.fillRect(zoneHong.x1, zoneHong.y1, zoneHong.w, zoneHong.h);

      // Black thick comic border
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(zoneHong.x1, zoneHong.y1, zoneHong.w, zoneHong.h);

      // Color inner border
      ctx.lineWidth = 4;
      ctx.strokeStyle = garaAttivaRef.current ? '#ff0033' : '#666666';
      ctx.strokeRect(zoneHong.x1, zoneHong.y1, zoneHong.w, zoneHong.h);

      // Target Crosshair inside Hong
      ctx.strokeStyle = garaAttivaRef.current ? 'rgba(255, 0, 51, 0.5)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      const hCenterX = zoneHong.x1 + zoneHong.w / 2;
      const hCenterY = zoneHong.y1 + zoneHong.h / 2;
      ctx.beginPath();
      ctx.arc(hCenterX, hCenterY, 32, 0, Math.PI * 2);
      ctx.moveTo(hCenterX - 45, hCenterY);
      ctx.lineTo(hCenterX + 45, hCenterY);
      ctx.moveTo(hCenterX, hCenterY - 45);
      ctx.lineTo(hCenterX, hCenterY + 45);
      ctx.stroke();

      // Chong Pad
      ctx.fillStyle = garaAttivaRef.current
        ? (isChongHitRecently ? 'rgba(0, 153, 255, 0.4)' : 'rgba(0, 153, 255, 0.15)')
        : 'rgba(50, 50, 50, 0.25)';
      ctx.fillRect(zoneChong.x1, zoneChong.y1, zoneChong.w, zoneChong.h);

      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(zoneChong.x1, zoneChong.y1, zoneChong.w, zoneChong.h);

      ctx.lineWidth = 4;
      ctx.strokeStyle = garaAttivaRef.current ? '#0099ff' : '#666666';
      ctx.strokeRect(zoneChong.x1, zoneChong.y1, zoneChong.w, zoneChong.h);

      // Target Crosshair inside Chong
      ctx.strokeStyle = garaAttivaRef.current ? 'rgba(0, 153, 255, 0.5)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      const cCenterX = zoneChong.x1 + zoneChong.w / 2;
      const cCenterY = zoneChong.y1 + zoneChong.h / 2;
      ctx.beginPath();
      ctx.arc(cCenterX, cCenterY, 32, 0, Math.PI * 2);
      ctx.moveTo(cCenterX - 45, cCenterY);
      ctx.lineTo(cCenterX + 45, cCenterY);
      ctx.moveTo(cCenterX, cCenterY - 45);
      ctx.lineTo(cCenterX, cCenterY + 45);
      ctx.stroke();
      ctx.restore();

      // 4. Header Badges & Score Boxes
      // Hong Box
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(zoneHong.x1, zoneHong.y1 - 44, Math.min(220, zoneHong.w), 38);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ff0033';
      ctx.strokeRect(zoneHong.x1, zoneHong.y1 - 44, Math.min(220, zoneHong.w), 38);

      ctx.fillStyle = '#ff3344';
      ctx.font = 'bold 24px "Bangers", Impact, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`홍 HONG: ${puntiHongRef.current}`, zoneHong.x1 + 12, zoneHong.y1 - 18);

      // Chong Box
      ctx.fillStyle = '#000000';
      ctx.fillRect(zoneChong.x1, zoneChong.y1 - 44, Math.min(220, zoneChong.w), 38);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0099ff';
      ctx.strokeRect(zoneChong.x1, zoneChong.y1 - 44, Math.min(220, zoneChong.w), 38);

      ctx.fillStyle = '#33a3ff';
      ctx.font = 'bold 24px "Bangers", Impact, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`청 CHONG: ${puntiChongRef.current}`, zoneChong.x1 + 12, zoneChong.y1 - 18);
      ctx.restore();

      // 5. Draw Impact Bursts
      burstsRef.current.forEach((burst, idx) => {
        if (burst.timer > 0) {
          ctx.save();
          ctx.translate(burst.x, burst.y);
          ctx.fillStyle = burst.color;
          ctx.beginPath();
          const spikes = 8;
          const outerRadius = burst.size * (1 - burst.timer / 20 + 0.3);
          const innerRadius = outerRadius * 0.45;
          for (let s = 0; s < spikes * 2; s++) {
            const radius = s % 2 === 0 ? outerRadius : innerRadius;
            const angle = (s * Math.PI) / spikes;
            const px = Math.cos(angle) * radius;
            const py = Math.sin(angle) * radius;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 3;
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
          ctx.scale(popup.scale, popup.scale);

          ctx.font = 'bold 42px "Bangers", Impact, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Black stroke shadow
          ctx.lineWidth = 8;
          ctx.strokeStyle = '#000000';
          ctx.strokeText(popup.testo, 0, 0);

          // Yellow/bright comic fill
          ctx.fillStyle = popup.color;
          ctx.fillText(popup.testo, 0, 0);

          ctx.restore();
          popup.timer--;
        }
      });
      popupsRef.current = popupsRef.current.filter(p => p.timer > 0);

      // 7. Top Match Status Ribbon
      ctx.save();
      const bannerW = Math.min(460, currentW * 0.7);
      const bannerX = (currentW - bannerW) / 2;
      ctx.fillStyle = '#000000';
      ctx.fillRect(bannerX, 8, bannerW, 40);
      ctx.lineWidth = 3;
      ctx.strokeStyle = garaAttivaRef.current ? '#00ff66' : '#ffcc00';
      ctx.strokeRect(bannerX, 8, bannerW, 40);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (garaAttivaRef.current) {
        ctx.fillStyle = '#00ff66';
        ctx.font = 'bold 22px "Bangers", Impact, sans-serif';
        ctx.fillText(`⚡ 시작 (SHIJAK!) - ${tempoRimanenteRef.current}s`, currentW / 2, 28);
      } else if (vincitoreText) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 20px "Bangers", Impact, sans-serif';
        ctx.fillText(vincitoreText, currentW / 2, 28);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Bangers", Impact, sans-serif';
        ctx.fillText(`준비 (CHUNBI) - ${durataGara}s`, currentW / 2, 28);
      }
      ctx.restore();

      animId = requestAnimationFrame(processFrame);
    };

    animId = requestAnimationFrame(processFrame);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [cameraError, sensitivityThreshold, pixelDiffThreshold, durataGara, vincitoreText, triggerImpact]);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-5xl mx-auto p-2 sm:p-4">
      {/* Hidden Video Feed for stream input */}
      <video ref={videoRef} playsInline autoPlay muted className="hidden" />

      {/* Main Interactive Comic Stage */}
      <div className="relative w-full aspect-video max-h-[75vh] bg-black comic-box rounded-xl overflow-hidden shadow-2xl flex items-center justify-center">
        {/* Canvas for Video + Real-Time Motion Processing */}
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="w-full h-full object-contain cursor-crosshair"
          onClick={(e) => {
            // Allow tap-to-strike for touch screens or simulator testing
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

        {/* Floating Quick Action: Mirror */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <button
            onClick={onToggleMirror}
            className={`font-comic text-xs sm:text-sm px-2.5 py-1.5 comic-box-sm flex items-center gap-1.5 shadow-md active:translate-y-0.5 transition cursor-pointer ${
              mirrorVideo ? 'bg-cyan-400 hover:bg-cyan-300 text-black' : 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300'
            }`}
            title="Inverti Destra e Sinistra (Specchio orizzontale)"
          >
            <FlipHorizontal className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">SPECCHIO: {mirrorVideo ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Live Motion Activity Gauges on bottom corners */}
        {garaAttiva && (
          <>
            <div className="absolute bottom-16 left-4 z-10 flex flex-col items-start bg-black/80 p-2 rounded comic-box-sm pointer-events-none">
              <span className="text-[11px] font-bold text-red-400">HONG INTENSITY</span>
              <div className="w-24 h-2.5 bg-zinc-800 rounded-full overflow-hidden mt-1 border border-zinc-700">
                <div
                  className="h-full bg-red-500 transition-all duration-75"
                  style={{ width: `${motionHongLevel}%` }}
                />
              </div>
            </div>

            <div className="absolute bottom-16 right-4 z-10 flex flex-col items-end bg-black/80 p-2 rounded comic-box-sm pointer-events-none">
              <span className="text-[11px] font-bold text-blue-400">CHONG INTENSITY</span>
              <div className="w-24 h-2.5 bg-zinc-800 rounded-full overflow-hidden mt-1 border border-zinc-700">
                <div
                  className="h-full bg-blue-500 transition-all duration-75"
                  style={{ width: `${motionChongLevel}%` }}
                />
              </div>
            </div>
          </>
        )}

        {/* Camera Permission Alert Banner */}
        {cameraError && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-amber-500/95 text-black px-4 py-2 rounded comic-box-sm text-xs font-bold flex items-center gap-2 z-20">
            <span>📷 Fotocamera non attiva. Clicca sui tasti sotto o tocca i riquadri per simulare i colpi!</span>
          </div>
        )}
      </div>

      {/* Comic Arcade Controls Bar */}
      <div className="w-full mt-3 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/90 border-2 border-black p-3 rounded-xl comic-box shadow-lg">
        {/* Timer Presets */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-zinc-400 font-comic uppercase mr-1">DURATA:</span>
          {[10, 20, 30, 60].map((sec) => (
            <button
              key={sec}
              onClick={() => handleSetTimer(sec)}
              disabled={garaAttiva}
              className={`px-3 py-1.5 rounded comic-box-sm font-comic text-sm transition cursor-pointer ${
                durataGara === sec
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50'
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>

        {/* Start / Stop Battle */}
        <div className="flex items-center gap-2">
          {!garaAttiva ? (
            <button
              onClick={handleStartGara}
              className="bg-emerald-500 hover:bg-emerald-400 text-black font-comic text-lg sm:text-xl px-6 py-2 rounded-lg comic-box flex items-center gap-2 active:translate-y-0.5 transition shadow-[3px_3px_0px_#000] cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>시작 (SHIJAK!)</span>
            </button>
          ) : (
            <button
              onClick={handleStopGara}
              className="bg-rose-600 hover:bg-rose-500 text-white font-comic text-lg sm:text-xl px-6 py-2 rounded-lg comic-box flex items-center gap-2 active:translate-y-0.5 transition shadow-[3px_3px_0px_#000] cursor-pointer"
            >
              <Square className="w-5 h-5 fill-current" />
              <span>그만 (KEUMAN!)</span>
            </button>
          )}
        </div>

        {/* Quick Simulator Hit Trigger Buttons (for testing without camera waving) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSimulateHit('hong')}
            className="bg-red-600/90 hover:bg-red-500 text-white font-comic text-xs px-3 py-2 rounded comic-box-sm flex items-center gap-1 cursor-pointer"
            title="Simula colpo bersaglio Hong"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>COLPISCI HONG</span>
          </button>
          <button
            onClick={() => handleSimulateHit('chong')}
            className="bg-blue-600/90 hover:bg-blue-500 text-white font-comic text-xs px-3 py-2 rounded comic-box-sm flex items-center gap-1 cursor-pointer"
            title="Simula colpo bersaglio Chong"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>COLPISCI CHONG</span>
          </button>
        </div>
      </div>
    </div>
  );
};
