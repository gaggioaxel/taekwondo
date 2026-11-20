// Colpitori (racchette da colpire) della tipologia "Corpo", difficoltà Medio e Difficile.
// Compaiono a turni, uguali per i due atleti (stesso tipo, posizione calcolata sul corpo di ciascuno):
// chi li colpisce con la tecnica giusta (pugno = polso, calcio = caviglia) entro il tempo fa punto.
import type { TechniqueKind } from './techniques';
import { type Box, SIL_HEAD_Y, SIL_NECK_Y, SIL_TORSO } from './silhouette';

export type TargetKind = 'pugno' | 'calcio-medio' | 'calcio-alto';

export type TargetLevel = {
  /** ms per colpire il colpitore */
  window: number;
  /** pausa tra un turno e il successivo (ms, min-max) */
  pause: [number, number];
  /** probabilità di ogni tipo di colpitore */
  prob: Record<TargetKind, number>;
  /** velocità minima del polso/caviglia per contare il colpo, in busti dell'atleta al secondo */
  minSpeed: number;
};

export const TARGET_LEVELS: Record<'medio' | 'difficile', TargetLevel> = {
  // Medio: meno frequenti, soprattutto pugni; basta toccarli con un movimento piccolo
  medio: { window: 2500, pause: [1200, 2000], prob: { pugno: 0.6, 'calcio-medio': 0.3, 'calcio-alto': 0.1 }, minSpeed: 1.1 },
  // Difficile: più frequenti, pochi pugni, calci alti più probabili, 1,5 s per colpire, colpo forte
  difficile: { window: 1500, pause: [400, 800], prob: { pugno: 0.15, 'calcio-medio': 0.4, 'calcio-alto': 0.45 }, minSpeed: 7.6 },
};

export type Target = {
  kind: TargetKind;
  /** centro della testa della racchetta (pixel del canvas) */
  x: number;
  y: number;
  /** raggio della testa della racchetta = zona da colpire */
  r: number;
  /** true = manico verso destra (colpitore a destra dell'atleta) */
  flip: boolean;
  /** inclinazione del manico verso il basso (radianti): il maestro tiene la racchetta di lato */
  tilt: number;
  born: number;
  window: number;
  hitAt: number | null;
  missedAt: number | null;
};

/** Il corpo dell'atleta in pixel del canvas: centro, collo, bacino, testa, lunghezza del busto */
export type Body = { cx: number; neckY: number; hipY: number; headY: number; L: number };
type Zone = { x1: number; y1: number; w: number; h: number };

export const HIT_FADE_MS = 260;
export const MISS_FADE_MS = 380;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function pickKind(level: TargetLevel): TargetKind {
  let u = Math.random();
  for (const k of ['pugno', 'calcio-medio', 'calcio-alto'] as const) {
    u -= level.prob[k];
    if (u <= 0) return k;
  }
  return 'calcio-alto';
}

export function techniqueKindOf(kind: TargetKind): TechniqueKind {
  return kind === 'pugno' ? 'pugno' : 'calcio';
}

/** Se il corpo non è visibile: corpo ricavato dalla sagoma dell'atleta (stimata o di partenza) */
export function bodyFromFigure(f: Box): Body {
  const L = f.h * SIL_TORSO;
  const neckY = f.y + f.h * SIL_NECK_Y;
  return { cx: f.x + f.w / 2, neckY, hipY: neckY + L, headY: f.y + f.h * SIL_HEAD_Y, L };
}

/**
 * Posizione del colpitore rispetto al corpo:
 * - pugno: a metà busto (sotto il collo, sopra il bacino), a distanza di braccio dal centro del corpo
 * - calcio medio: a metà busto, un po' più lontano
 * - calcio alto: all'altezza della testa
 * Sempre dentro il riquadro (se da un lato non c'è spazio, va dall'altro).
 */
// Ingombro del disegno (racchetta + fumetto) rispetto al centro della testa, in raggi della testa:
// dalla parte del manico ~3,7 r, dalla parte opposta ~1,5 r, in verticale ~2 r
const REACH_HANDLE = 3.7;
const REACH_HEAD = 1.5;

export function placeTarget(kind: TargetKind, b: Body, z: Zone, s: number, now: number, window: number): Target {
  const r = clamp(0.25 * b.L, 20 * s, 60 * s);
  const [dMin, dMax] = kind === 'pugno' ? [1.0, 1.4] : kind === 'calcio-medio' ? [1.2, 1.7] : [1.0, 1.5];
  const d = b.L * rand(dMin, dMax);
  const y0 = kind === 'pugno' ? b.neckY + b.L * rand(0.2, 0.55)
    : kind === 'calcio-medio' ? b.neckY + b.L * rand(0.3, 0.7)
    : b.headY + b.L * rand(-0.1, 0.1);
  const minX = z.x1 + r * REACH_HEAD;
  const maxX = z.x1 + z.w - r * REACH_HEAD;
  let x = b.cx + (Math.random() < 0.5 ? -d : d);
  if (x < minX || x > maxX) {
    const other = 2 * b.cx - x;
    if (other >= minX && other <= maxX) x = other;
  }
  x = clamp(x, minX, maxX);
  const y = clamp(y0, z.y1 + r * 1.2, z.y1 + z.h - r * 1.2);
  // manico verso l'esterno (lontano dall'atleta); se non c'è spazio nel riquadro, la racchetta si inclina
  const flip = x > b.cx;
  const avail = flip ? z.x1 + z.w - x : x - z.x1;
  const minTilt = Math.acos(clamp(avail / (REACH_HANDLE * r), 0, 1));
  const tilt = Math.min(1.25, Math.max(minTilt, rand(-0.15, 0.3)));
  return { kind, x, y, r, flip, tilt, born: now, window, hitAt: null, missedAt: null };
}

export const isLive = (t: Target | null): t is Target => !!t && t.hitAt === null && t.missedAt === null;

/** Il segmento a→b (movimento del polso/caviglia tra due fotogrammi) passa dentro il cerchio? */
export function segmentHitsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(ax + k * dx - cx, ay + k * dy - cy) <= r;
}

// ---------- Disegno ----------

// Immagini scontornate (scripts/make-targets.py): racchetta col manico a sinistra e la testa a destra.
// HEAD = centro e raggio della testa della racchetta, in frazioni dell'immagine.
const HEAD = { cx: 0.75, cy: 0.495, r: 0.23 };
let imgs: { pugno: HTMLImageElement; calcio: HTMLImageElement } | null = null;
function images() {
  if (!imgs) {
    const load = (n: string) => {
      const i = new Image();
      i.src = `${import.meta.env.BASE_URL}targets/${n}.webp`;
      return i;
    };
    imgs = { pugno: load('pugno'), calcio: load('calcio') };
  }
  return imgs;
}
export const preloadTargetImages = () => void images();

const BURST_JITTER = [1, 0.9, 1.07, 0.94, 1.03, 0.88, 1.09, 0.96, 1, 0.91, 1.05, 0.93];
const BURST_FILL: Record<TargetKind, string> = { pugno: '#ffe14d', 'calcio-medio': '#8dff6e', 'calcio-alto': '#5ef2ff' };

/** Fumetto a stella attorno al colpitore */
function comicBurst(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, fill: string, lw: number) {
  const spikes = 14;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 === 0 ? BURST_JITTER[(i / 2) % BURST_JITTER.length] : 0.8;
    const px = cx + Math.cos(a) * rx * k;
    const py = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = '#000';
  ctx.stroke();
}

export function drawTarget(ctx: CanvasRenderingContext2D, t: Target, now: number, s: number) {
  const age = now - t.born;
  // comparsa a scatto (con un piccolo rimbalzo), poi colpito = si gonfia e svanisce, mancato = grigio e svanisce
  let scale = age < 110 ? 0.55 + (age / 110) * 0.6 : age < 200 ? 1.15 - ((age - 110) / 90) * 0.15 : 1;
  let alpha = 1;
  if (t.hitAt !== null) {
    const k = Math.min(1, (now - t.hitAt) / HIT_FADE_MS);
    scale *= 1 + 0.45 * k;
    alpha = 1 - k;
  } else if (t.missedAt !== null) {
    const k = Math.min(1, (now - t.missedAt) / MISS_FADE_MS);
    scale *= 1 - 0.35 * k;
    alpha = 1 - k;
  }
  if (alpha <= 0) return;

  const img = images()[t.kind === 'pugno' ? 'pugno' : 'calcio'];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (t.missedAt !== null) ctx.filter = 'grayscale(1) brightness(0.8)';
  ctx.translate(t.x, t.y);
  ctx.scale(scale, scale);
  ctx.rotate(t.flip ? t.tilt : -t.tilt); // tilt > 0 = manico verso il basso
  if (t.flip) ctx.scale(-1, 1);
  if (img.complete && img.naturalWidth > 0) {
    const k = t.r / (HEAD.r * img.naturalWidth);
    const iw = img.naturalWidth * k;
    const ih = img.naturalHeight * k;
    const ox = -HEAD.cx * iw;
    const oy = -HEAD.cy * ih;
    comicBurst(ctx, ox + iw * 0.5, oy + ih * 0.5, iw * 0.6, ih * 0.95, BURST_FILL[t.kind], 4 * s);
    ctx.drawImage(img, ox, oy, iw, ih);
  } else {
    // immagine non ancora caricata: cerchio semplice
    comicBurst(ctx, 0, 0, t.r * 1.6, t.r * 1.6, BURST_FILL[t.kind], 4 * s);
    ctx.beginPath();
    ctx.arc(0, 0, t.r, 0, Math.PI * 2);
    ctx.fillStyle = '#e53935';
    ctx.fill();
  }
  ctx.restore();

  // anello del tempo rimasto attorno alla zona da colpire (rosso nell'ultimo mezzo secondo)
  if (t.hitAt === null && t.missedAt === null) {
    const left = Math.max(0, 1 - age / t.window);
    const R = t.r * 1.15;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(t.x, t.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.lineWidth = 10 * s;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = t.window * left < 500 ? '#ff3344' : '#ffffff';
    ctx.stroke();
    ctx.restore();
  }
}
