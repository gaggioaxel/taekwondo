// Tipologia Energia: quanta parte della figura dell'atleta si muove tra due fotogrammi.
import type { Zone } from '../game/config';

const STEP = 8; // campiona 1 pixel ogni 8 in orizzontale e in verticale

/**
 * Punti cambiati nella cornice, in rapporto ai punti della sagoma di QUELL'atleta:
 * la soglia è "quanta parte della sua figura si muove", uguale per atleti alti e bassi e per ogni camera.
 * `refArea` = area (px²) della sagoma di riferimento; `pixelDiff` = differenza minima del canale rosso.
 */
export function changedRatio(
  curr: Uint8ClampedArray, prev: Uint8ClampedArray, W: number, z: Zone, refArea: number, pixelDiff: number,
): number {
  const samples = Math.max(1, refArea / (STEP * STEP));
  let changed = 0;
  for (let y = z.y1; y < z.y1 + z.h; y += STEP) {
    for (let x = z.x1; x < z.x1 + z.w; x += STEP) {
      const i = (y * W + x) * 4;
      if (Math.abs(curr[i] - prev[i]) > pixelDiff) changed++;
    }
  }
  return changed / samples;
}
