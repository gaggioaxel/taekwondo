// Disegno dell'arena sul canvas: video, sfondo di riserva, riquadri, punteggi, banner in alto.
import type { Athlete, Zone } from '../game/config';

const FONT = '"Bangers", Impact, sans-serif';

/** Video della camera (specchiato se richiesto); adatta il canvas alla risoluzione della camera */
export function drawVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, mirror: boolean) {
  const canvas = ctx.canvas;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  ctx.save();
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/** Senza camera: sfondo scuro a griglia */
export function drawIdleBackground(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = '#0f141d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

export function drawCameraHint(ctx: CanvasRenderingContext2D, s: number) {
  const { width: W, height: H } = ctx.canvas;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(14 * s)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('INIZIALIZZAZIONE FOTOCAMERA...', W * 0.5, H * 0.95);
}

const PAD = {
  hong: { rgb: '255, 0, 51', solid: '#ff0033', text: '#ff3344', label: '홍 HONG' },
  chong: { rgb: '0, 153, 255', solid: '#0099ff', text: '#33a3ff', label: '청 CHONG' },
};

/** Riquadro dell'atleta: colorato durante l'incontro, più acceso subito dopo un punto; mirino al centro */
export function drawPad(ctx: CanvasRenderingContext2D, z: Zone, a: Athlete, active: boolean, hit: boolean, s: number) {
  const c = PAD[a];
  ctx.save();
  ctx.fillStyle = active ? `rgba(${c.rgb}, ${hit ? 0.4 : 0.15})` : 'rgba(50, 50, 50, 0.25)';
  ctx.fillRect(z.x1, z.y1, z.w, z.h);
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(z.x1, z.y1, z.w, z.h);
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = active ? c.solid : '#666666';
  ctx.strokeRect(z.x1, z.y1, z.w, z.h);

  ctx.strokeStyle = active ? `rgba(${c.rgb}, 0.5)` : 'rgba(255,255,255,0.2)';
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
  ctx.restore();
}

/** Punteggio dentro il riquadro, in alto a sinistra */
export function drawScore(ctx: CanvasRenderingContext2D, z: Zone, a: Athlete, points: number, s: number) {
  const c = PAD[a];
  const bw = Math.min(200 * s, z.w - 16 * s);
  const bh = 36 * s;
  const bx = z.x1 + 8 * s;
  const by = z.y1 + 8 * s;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = c.solid;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = c.text;
  ctx.font = `bold ${Math.round(22 * s)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${c.label}: ${points}`, bx + 10 * s, by + bh / 2 + 1 * s);
  ctx.restore();
}

/** Banner in alto: tempo durante l'incontro, vincitore alla fine, 준비 prima del via */
export function drawBanner(
  ctx: CanvasRenderingContext2D, s: number,
  st: { active: boolean; tempo: number; vincitore: string; durata: number },
) {
  const W = ctx.canvas.width;
  const bannerW = Math.min(340 * s, W * 0.5);
  const bannerH = 40 * s;
  const bannerX = (W - bannerW) / 2;
  const bannerY = 10 * s;
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = st.active ? '#00ff66' : '#ffcc00';
  ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mid = bannerY + bannerH / 2 + 1 * s;
  if (st.active) {
    ctx.fillStyle = '#00ff66';
    ctx.font = `bold ${Math.round(22 * s)}px ${FONT}`;
    ctx.fillText(`⚡ 시작 (SHIJAK!) - ${st.tempo}s`, W / 2, mid);
  } else if (st.vincitore) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = `bold ${Math.round(20 * s)}px ${FONT}`;
    ctx.fillText(st.vincitore, W / 2, mid);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(21 * s)}px ${FONT}`;
    ctx.fillText(`준비 (CHUNBI) - ${st.durata}s`, W / 2, mid);
  }
  ctx.restore();
}
