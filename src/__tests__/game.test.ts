// Test leggeri sulla logica pura: riquadri, soglie, colpitori, Energia.
import { describe, expect, it } from 'vitest';
import { athleteOfSide, inZone, padZones, sideOfAthlete, thresholds } from '../game/config';
import { bodyFromFigure, pickKind, placeTarget, segmentHitsCircle, TARGET_LEVELS } from '../utils/targets';
import { TargetRounds } from '../game/targetRounds';
import { changedRatio } from '../detection/energia';
import type { Strike } from '../detection/corpo';

describe('riquadri e lati', () => {
  it('due riquadri uguali, separati dallo spazio scelto, dentro lo schermo', () => {
    for (const gap of [0.06, 0.15, 0.25, 0.35]) {
      const z = padZones(1280, 720, gap, false);
      expect(z.hong.w).toBe(z.chong.w);
      expect(z.hong.x1).toBeLessThan(z.chong.x1);
      expect(z.chong.x1 - (z.hong.x1 + z.hong.w)).toBeCloseTo(1280 * gap, -1);
      expect(z.chong.x1 + z.chong.w).toBeLessThanOrEqual(1280);
    }
  });

  it('scambio dei lati: Hong a destra', () => {
    const z = padZones(1280, 720, 0.06, true);
    expect(z.hong.x1).toBeGreaterThan(z.chong.x1);
    expect(athleteOfSide('left', true)).toBe('chong');
    expect(sideOfAthlete('hong', true)).toBe('right');
    expect(athleteOfSide('left', false)).toBe('hong');
  });

  it('inZone', () => {
    const z = { x1: 10, y1: 10, w: 100, h: 100 };
    expect(inZone(z, 50, 50)).toBe(true);
    expect(inZone(z, 5, 50)).toBe(false);
  });

  it('le soglie crescono con la difficoltà', () => {
    const [f, m, d] = (['facile', 'medio', 'difficile'] as const).map(thresholds);
    expect(f.energiaQuota).toBeLessThan(m.energiaQuota);
    expect(m.energiaQuota).toBeLessThan(d.energiaQuota);
    expect(f.strikeSpeed).toBeLessThan(m.strikeSpeed);
    expect(m.strikeSpeed).toBeLessThan(d.strikeSpeed);
  });
});

describe('colpitori', () => {
  const zone = { x1: 25, y1: 93, w: 550, h: 612 };
  const body = bodyFromFigure({ x: 200, y: 150, w: 240, h: 480 });

  it('il segmento che attraversa la racchetta la prende, quello lontano no', () => {
    expect(segmentHitsCircle(0, 0, 100, 0, 50, 5, 10)).toBe(true);
    expect(segmentHitsCircle(0, 0, 100, 0, 50, 30, 10)).toBe(false);
  });

  it('probabilità di Medio: circa 60% pugni, 30% calci medi, 10% calci alti', () => {
    const c = { pugno: 0, 'calcio-medio': 0, 'calcio-alto': 0 };
    for (let i = 0; i < 20000; i++) c[pickKind(TARGET_LEVELS.medio)]++;
    expect(c.pugno / 20000).toBeCloseTo(0.6, 1);
    expect(c['calcio-medio'] / 20000).toBeCloseTo(0.3, 1);
    expect(c['calcio-alto'] / 20000).toBeCloseTo(0.1, 1);
  });

  it('sempre dentro il riquadro; il pugno a metà busto', () => {
    for (let i = 0; i < 500; i++) {
      for (const k of ['pugno', 'calcio-medio', 'calcio-alto'] as const) {
        const t = placeTarget(k, body, zone, 1.6, 0, 2500);
        expect(t.x - t.r).toBeGreaterThanOrEqual(zone.x1);
        expect(t.x + t.r).toBeLessThanOrEqual(zone.x1 + zone.w);
        expect(t.y - t.r).toBeGreaterThanOrEqual(zone.y1);
        if (k === 'pugno') {
          expect(t.y).toBeGreaterThan(body.neckY);
          expect(t.y).toBeLessThan(body.hipY);
        }
      }
    }
  });

  it('turni: compaiono dopo la pausa, si prendono con la tecnica giusta, scadono', () => {
    const tr = new TargetRounds();
    tr.reset(true);
    const zones = { hong: zone, chong: { ...zone, x1: 700 } };
    const lvl = TARGET_LEVELS.medio;
    const noop = { miss: () => {}, spawn: () => {} };
    tr.update(0, lvl, () => body, zones, 1.6, noop); // programma il turno
    expect(tr.targets.hong).toBeNull();
    tr.update(lvl.pause[1] + 1, lvl, () => body, zones, 1.6, noop);
    const t = tr.targets.hong!;
    expect(t).not.toBeNull();
    expect(tr.stats.hong.totali).toBe(1);

    const strike = (kind: 'pugno' | 'calcio', speed: number): Strike => ({
      athlete: 'hong', id: 15, kind, x: t.x + 5, y: t.y, px: t.x - 80, py: t.y, speed,
    });
    const right = t.kind === 'pugno' ? 'pugno' : 'calcio';
    const wrong = right === 'pugno' ? 'calcio' : 'pugno';
    expect(tr.match(strike(wrong, 10), lvl)).toBeNull(); // tecnica sbagliata
    expect(tr.match(strike(right, lvl.minSpeed / 2), lvl)).toBeNull(); // troppo lento
    expect(tr.match(strike(right, lvl.minSpeed + 1), lvl)).toBe(t);
    tr.hit('hong', t);
    expect(tr.stats.hong.colpiti).toBe(1);

    // Chong non lo prende: scade
    let missed = 0;
    tr.update(t.born + lvl.window + 1, lvl, () => body, zones, 1.6, { miss: () => missed++, spawn: () => {} });
    expect(missed).toBe(1);
    expect(tr.targets.chong?.missedAt).not.toBeNull();
  });
});

describe('Energia', () => {
  it('parte della sagoma che si muove', () => {
    const W = 64, H = 64;
    const prev = new Uint8ClampedArray(W * H * 4);
    const curr = new Uint8ClampedArray(W * H * 4);
    // metà sinistra del riquadro cambia molto
    for (let y = 0; y < H; y++) for (let x = 0; x < 32; x++) curr[(y * W + x) * 4] = 200;
    const z = { x1: 0, y1: 0, w: 64, h: 64 };
    // 8x8 punti campionati, 32 cambiati; sagoma di riferimento = 64x64 px = 64 punti
    expect(changedRatio(curr, prev, W, z, 64 * 64, 35)).toBeCloseTo(0.5);
    // atleta più piccolo (sagoma di metà area): stesso movimento = il doppio della sua figura
    expect(changedRatio(curr, prev, W, z, 32 * 64, 35)).toBeCloseTo(1);
    expect(changedRatio(prev, prev, W, z, 64 * 64, 35)).toBe(0);
  });
});
