// Disegno sul canvas delle guide degli atleti: sagoma calibrata che segue l'atleta, maschera "ti vedo" durante
// la calibrazione, sagoma generica quando non si è ancora calibrato, e gli avvisi di distanza.
import { Athlete, Calibration, CELL, FgMask, shapeCanvas, shapePad } from '../utils/calibration';
import { figureBox, silhouette } from '../utils/silhouette';

type Zone = { x1: number; y1: number; w: number; h: number };

export const ATHLETE_COLORS: Record<Athlete, { solid: string; fill: string }> = {
  hong: { solid: '#ff2d4a', fill: 'rgba(255,45,74,0.32)' },
  chong: { solid: '#2f9bff', fill: 'rgba(47,155,255,0.32)' },
};
const WARN = '#ffb020';
const WARN_FILL = 'rgba(255,176,32,0.25)';

const RANGE_MSG = { lontano: 'TROPPO LONTANO ⬆', vicino: 'TROPPO VICINO ⬇', perso: 'TORNA IN POSIZIONE' } as const;
const STATUS_MSG = { cerco: 'ENTRA E STAI FERMO', fermo: 'STAI FERMO…', misuro: 'MISURO…' } as const;

/** Scritta in fondo alla cornice */
function label(ctx: CanvasRenderingContext2D, z: Zone, s: number, msg: string, color: string) {
  ctx.save();
  ctx.font = `bold ${Math.round(16 * s)}px "Bangers", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = '#000';
  const tx = z.x1 + z.w / 2;
  const ty = z.y1 + z.h - 4 * s;
  ctx.strokeText(msg, tx, ty);
  ctx.fillStyle = color;
  ctx.fillText(msg, tx, ty);
  ctx.restore();
}

// maschera "ti vedo": una cella = un pixel di un canvas piccolo, poi ingrandito
const maskCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function drawMask(ctx: CanvasRenderingContext2D, fg: FgMask, rgb: [number, number, number]) {
  if (!maskCanvas) return;
  maskCanvas.width = fg.cols;
  maskCanvas.height = fg.rows;
  const m = maskCanvas.getContext('2d')!;
  const img = m.createImageData(fg.cols, fg.rows);
  for (let i = 0; i < fg.mask.length; i++) {
    if (!fg.mask[i]) continue;
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = 140;
  }
  m.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(maskCanvas, fg.c0 * CELL, fg.r0 * CELL, fg.cols * CELL, fg.rows * CELL);
  ctx.restore();
}

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/**
 * Guide di un atleta. `preparing` = prima del via (sagome visibili); durante l'incontro solo l'avviso se esce dal margine.
 */
export function drawAthleteGuide(ctx: CanvasRenderingContext2D, cal: Calibration, a: Athlete, z: Zone, s: number, preparing: boolean) {
  const col = ATHLETE_COLORS[a];
  const sh = cal.shapes[a];
  const range = cal.range(a);

  if (!preparing) {
    if (range && range !== 'ok') label(ctx, z, s, RANGE_MSG[range], WARN);
    return;
  }

  // durante la calibrazione: ciò che il sistema vede dell'atleta, finché non è misurato
  if (cal.phase === 'atleti' && cal.status(a) !== 'ok') {
    const st = cal.status(a) as 'cerco' | 'fermo' | 'misuro';
    const fg = cal.fg[a];
    if (fg && st !== 'cerco') drawMask(ctx, fg, st === 'misuro' ? hexRgb(col.solid) : [255, 255, 255]);
    label(ctx, z, s, STATUS_MSG[st], '#ffffff');
    return;
  }
  if (cal.phase === 'sfondo') {
    label(ctx, z, s, 'CAMPO LIBERO', '#ffffff');
    return;
  }

  // non calibrato: sagoma generica tenue
  if (!sh) {
    const box = figureBox(z);
    const sil = silhouette(box.h, '#ffffff', 3 * s);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(sil.canvas, box.x + box.w / 2 - sil.canvas.width / 2, box.y - sil.pad);
    ctx.restore();
    label(ctx, z, s, 'PREMI CALIBRA', '#ffffff');
    return;
  }

  // calibrato: la sua sagoma, che lo segue; arancione se è fuori dal margine di distanza
  const ok = range === 'ok';
  const tr = cal.track[a] ?? { cx: sh.cx0, feet: sh.feet0, h: sh.h0 };
  const border = 3 * s;
  const canvas = shapeCanvas(sh, ok ? col.solid : WARN, ok ? col.fill : WARN_FILL, border);
  const k = tr.h / sh.h0;
  const P = shapePad(border);
  const w = sh.cols * CELL;
  const h = sh.rows * CELL;
  ctx.save();
  ctx.globalAlpha = range === 'perso' ? 0.45 : 0.95;
  if (ok) {
    ctx.shadowColor = col.solid;
    ctx.shadowBlur = 22 * s;
  }
  ctx.drawImage(canvas, tr.cx - (P + sh.cxFrac * w) * k, tr.feet - (P + h) * k, canvas.width * k, canvas.height * k);
  ctx.restore();
  label(ctx, z, s, ok ? 'PRONTO!' : RANGE_MSG[range as keyof typeof RANGE_MSG], ok ? col.solid : WARN);
}
