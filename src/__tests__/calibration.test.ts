// Test della calibrazione con fotogrammi sintetici: sfondo, atleti fermi di altezze diverse, atleta che si avvicina.
import { describe, expect, it } from 'vitest';
import { BackgroundModel, Calibration, CAL_TIMES, figureOfMask, foreground } from '../utils/calibration';
import { padZones } from '../game/config';

const W = 320;
const H = 180;
const zones = padZones(W, H, 0.06, false);
const floor = zones.hong.y1 + zones.hong.h - 3; // piedi poco sopra il bordo basso del riquadro

/** Sfondo con un po' di disegno (non uniforme) */
function background(): Uint8ClampedArray {
  const f = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      f[i] = 40 + ((x * 7) % 120);
      f[i + 1] = 60 + ((y * 5) % 100);
      f[i + 2] = 110;
      f[i + 3] = 255;
    }
  }
  return f;
}

/** "Atleta": rettangolo (busto+gambe) con testa, piedi a terra, alto `h` px, centrato in `cx` */
function withPerson(f: Uint8ClampedArray, cx: number, h: number, color = [245, 240, 230]) {
  const out = f.slice();
  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y1)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x++) {
        const i = (y * W + x) * 4;
        out[i] = color[0];
        out[i + 1] = color[1];
        out[i + 2] = color[2];
      }
    }
  };
  const top = floor - h;
  paint(cx - h * 0.07, top, cx + h * 0.07, top + h * 0.15); // testa
  paint(cx - h * 0.13, top + h * 0.15, cx + h * 0.13, floor); // corpo
  return out;
}

const scene = (hongH: number, chongH: number) =>
  withPerson(withPerson(background(), zones.hong.x1 + zones.hong.w / 2, hongH), zones.chong.x1 + zones.chong.w / 2, chongH, [30, 40, 90]);

describe('sfondo e atleta', () => {
  it('l\'atleta fermo si distingue dallo sfondo e se ne misura l\'altezza', () => {
    const bg = new BackgroundModel();
    bg.reset(W, H);
    for (let i = 0; i < 10; i++) bg.accumulate(background());
    const fg = foreground(bg, scene(120, 80), zones.hong);
    const fig = figureOfMask(fg)!;
    expect(fig).not.toBeNull();
    expect(Math.abs(fig.h - 120)).toBeLessThan(120 * 0.08);
    expect(Math.abs(fig.feet - floor)).toBeLessThanOrEqual(5);
    // campo vuoto: nessun atleta
    expect(figureOfMask(foreground(bg, background(), zones.hong))).toBeNull();
  });
});

describe('procedura di calibrazione', () => {
  const pose = { hong: null, chong: null };
  const run = (cal: Calibration, from: number, to: number, frame: () => Uint8ClampedArray) => {
    for (let t = from; t <= to; t += 33) cal.step(frame(), W, H, zones, t, pose);
  };

  it('campo libero → atleti fermi → calibrati, ognuno con la sua altezza; poi segue e avvisa', () => {
    const cal = new Calibration();
    const phases: string[] = [];
    cal.onChange = (s) => phases.push(s.phase);
    cal.start(0);
    run(cal, 0, CAL_TIMES.bgEnd + 40, background);
    expect(cal.phase).toBe('atleti');

    run(cal, 3100, 6000, () => scene(120, 80));
    expect(cal.status('hong')).toBe('ok');
    expect(cal.status('chong')).toBe('ok');
    expect(phases).toContain('fatto');
    expect(Math.abs(cal.shapes.hong!.h0 - 120)).toBeLessThan(10);
    expect(Math.abs(cal.shapes.chong!.h0 - 80)).toBeLessThan(8);
    // atleti di altezze diverse: aree di riferimento diverse
    expect(cal.area('hong')!).toBeGreaterThan(cal.area('chong')!);

    run(cal, 6000, 8000, () => scene(120, 80));
    expect(cal.phase).toBe('off');
    expect(cal.range('hong')).toBe('ok');

    // Hong si avvicina molto: più alto del margine → "troppo vicino"
    run(cal, 8000, 10000, () => scene(150, 80));
    expect(cal.range('hong')).toBe('vicino');
    expect(cal.range('chong')).toBe('ok');
    // torna al suo posto
    run(cal, 10000, 12000, () => scene(120, 80));
    expect(cal.range('hong')).toBe('ok');
    // si allontana: più piccolo del margine → "troppo lontano"
    run(cal, 12000, 14000, () => scene(90, 80));
    expect(cal.range('hong')).toBe('lontano');
  });

  it('se un atleta non entra, dopo il tempo massimo la calibrazione non è completa', () => {
    const cal = new Calibration();
    cal.start(0);
    run(cal, 0, CAL_TIMES.bgEnd + 40, background);
    run(cal, 3100, 3100 + CAL_TIMES.timeout + 100, () => withPerson(background(), zones.hong.x1 + zones.hong.w / 2, 120));
    expect(cal.phase).toBe('errore');
    expect(cal.missing()).toEqual(['chong']);
    // chiudendo si tiene l'atleta calibrato
    cal.close(false);
    expect(cal.shapes.hong).not.toBeNull();
    expect(cal.shapes.chong).toBeNull();
  });

  it('annullare riporta la calibrazione di prima', () => {
    const cal = new Calibration();
    cal.start(0);
    run(cal, 0, CAL_TIMES.bgEnd + 40, background);
    run(cal, 3100, 6000, () => scene(120, 80));
    const before = cal.shapes.hong;
    cal.start(10000);
    expect(cal.shapes.hong).toBeNull();
    cal.close(true);
    expect(cal.shapes.hong).toBe(before);
  });
});
