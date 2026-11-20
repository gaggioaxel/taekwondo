// Sagoma generica dell'atleta in guardia: si vede prima della calibrazione e fa da riferimento finché un atleta
// non è calibrato (vedi calibration.ts, dove si ricava la sagoma vera di ciascun atleta).
// Proporzioni (frazioni dell'altezza) usate anche per stimare busto e testa dalla figura.

type Zone = { x1: number; y1: number; w: number; h: number };
export type Box = { x: number; y: number; w: number; h: number };

/** Busto (spalle → anche) in frazioni dell'altezza della sagoma */
export const SIL_TORSO = 0.32;
export const SIL_NECK_Y = 0.17; // spalle
export const SIL_HEAD_Y = 0.075; // centro della testa

/** Sagoma di partenza (atleta non ancora trovato): alta il 78% della cornice, piedi poco sopra il bordo basso */
export function figureBox(z: Zone): Box {
  const h = z.h * 0.78;
  const w = h * 0.5;
  return { x: z.x1 + (z.w - w) / 2, y: z.y1 + z.h - h - z.h * 0.03, w, h };
}

// Parti del corpo in coordinate della sagoma: x dal centro, y dall'alto, in frazioni dell'altezza
type Pt = [number, number];
const LIMBS: { pts: Pt[]; w: number }[] = [
  { pts: [[0, 0.12], [0, 0.19]], w: 0.05 }, // collo
  // braccia in guardia: spalla → gomito → pugno davanti al mento
  { pts: [[-0.11, 0.2], [-0.17, 0.35], [-0.075, 0.27]], w: 0.055 },
  { pts: [[0.11, 0.2], [0.17, 0.35], [0.075, 0.27]], w: 0.055 },
  // gambe divaricate: anca → ginocchio → caviglia → punta del piede
  { pts: [[-0.06, 0.49], [-0.115, 0.73], [-0.145, 0.95], [-0.2, 0.975]], w: 0.07 },
  { pts: [[0.06, 0.49], [0.115, 0.73], [0.145, 0.95], [0.2, 0.975]], w: 0.07 },
];
const TORSO: Pt[] = [[-0.115, 0.185], [0.115, 0.185], [0.085, 0.5], [-0.085, 0.5]];
const HEAD = { y: SIL_HEAD_Y, r: 0.062 };
const FISTS: Pt[] = [[-0.075, 0.27], [0.075, 0.27]];

/** Disegna la sagoma piena, con tutte le parti ingrossate di `extra` pixel (per il bordo) */
function trace(ctx: CanvasRenderingContext2D, H: number, cx: number, top: number, extra: number) {
  const P = ([x, y]: Pt) => [cx + x * H, top + y * H] as const;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const l of LIMBS) {
    ctx.lineWidth = l.w * H + extra;
    ctx.beginPath();
    l.pts.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
    ctx.stroke();
  }
  ctx.lineWidth = 0.04 * H + extra;
  ctx.beginPath();
  TORSO.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (const [c, r] of [[[0, HEAD.y] as Pt, HEAD.r], ...FISTS.map((f) => [f, 0.038] as [Pt, number])] as [Pt, number][]) {
    ctx.beginPath();
    ctx.arc(...P(c), r * H + extra / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

type Cached = { canvas: HTMLCanvasElement; pad: number };
const cache = new Map<string, Cached>();

/** Sagoma pronta da disegnare (bordo colorato + interno semitrasparente), alta `h` pixel. */
export function silhouette(h: number, outline: string, border: number, fill = 'rgba(255,255,255,0.22)'): Cached {
  const H = Math.max(12, Math.round(h / 4) * 4); // a passi di 4 px: la sagoma stimata cambia di continuo
  const B = Math.max(1, Math.round(border));
  const key = `${H}|${outline}|${B}|${fill}`;
  let c = cache.get(key);
  if (c) return c;
  const pad = B * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(H * 0.5) + pad * 2;
  canvas.height = H + pad * 2;
  const ctx = canvas.getContext('2d')!;
  const cx = canvas.width / 2;
  // bordo pieno, poi interno svuotato e riempito di colore trasparente
  ctx.fillStyle = ctx.strokeStyle = outline;
  trace(ctx, H, cx, pad, B * 2);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = ctx.strokeStyle = '#000';
  trace(ctx, H, cx, pad, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = ctx.strokeStyle = fill;
  trace(ctx, H, cx, pad, 0);
  c = { canvas, pad };
  if (cache.size > 64) cache.clear();
  cache.set(key, c);
  return c;
}

/** Pixel coperti dalla sagoma alta `h` pixel (per la soglia di Energia) */
export type SilMask = { area: number };
const maskCache = new Map<number, SilMask>();
export function silMask(h: number): SilMask {
  const H = Math.max(12, Math.round(h / 4) * 4);
  let m = maskCache.get(H);
  if (m) return m;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(H * 0.5) + 4;
  canvas.height = H + 4;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  trace(ctx, H, canvas.width / 2, 2, 0);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let area = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 127) area++;
  m = { area };
  if (maskCache.size > 32) maskCache.clear();
  maskCache.set(H, m);
  return m;
}

/** Sagoma dall'altezza testa→piedi del modello del corpo (testa = centro della testa, piedi = caviglie/talloni) */
export function figureFromPose(cx: number, headY: number, feetY: number): Box {
  const h = Math.max(1, (feetY - headY) / (0.975 - SIL_HEAD_Y));
  return { x: cx - h / 4, y: headY - SIL_HEAD_Y * h, w: h / 2, h };
}
