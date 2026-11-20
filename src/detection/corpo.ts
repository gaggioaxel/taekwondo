// Tipologia Corpo: modello del corpo (MediaPipe) su un riquadro per fotogramma, a turno, e colpi di polsi/caviglie.
import { LandmarkerPair, PoseTracker, STRIKE_POINTS, Track } from '../utils/pose';
import { kindOfLandmark, TechniqueKind } from '../utils/techniques';
import type { Body } from '../utils/targets';
import { Athlete, athleteOfSide, ScreenSide, sideOfAthlete, Zone } from '../game/config';

/** Un polso o una caviglia che si muove: posizione attuale e precedente (px) e velocità in busti/s */
export type Strike = { athlete: Athlete; id: number; kind: TechniqueKind; x: number; y: number; px: number; py: number; speed: number };
/** Riquadro analizzato in questo fotogramma */
export type Analysis = { side: ScreenSide; now: number };

export class BodyDetector {
  landmarkers: LandmarkerPair | null = null;
  readonly trackers: Record<ScreenSide, PoseTracker> = { left: new PoseTracker(), right: new PoseTracker() };
  private crops: Record<ScreenSide, HTMLCanvasElement> = { left: document.createElement('canvas'), right: document.createElement('canvas') };
  private next: ScreenSide = 'left';

  reset() {
    this.trackers.left.reset();
    this.trackers.right.reset();
  }

  get tracks(): Track[] {
    return [...this.trackers.left.tracks, ...this.trackers.right.tracks];
  }

  /**
   * Analizza un riquadro (a fotogrammi alterni): solo la fascia del riquadro, a tutta altezza (la testa può stare
   * sopra il bordo), a mezza risoluzione. Le coordinate tornano a quelle dell'intero fotogramma (0..1).
   */
  analyze(video: HTMLVideoElement, W: number, H: number, zones: Record<Athlete, Zone>, mirror: boolean): Analysis | null {
    if (!this.landmarkers) return null;
    const now = performance.now();
    const side = this.next;
    this.next = side === 'left' ? 'right' : 'left';
    const [leftZone, rightZone] = [zones.hong, zones.chong].sort((a, b) => a.x1 - b.x1);
    const zone = side === 'left' ? leftZone : rightZone;

    const margin = W * 0.03;
    const sx0 = Math.max(0, zone.x1 - margin);
    const sx1 = Math.min(W, zone.x1 + zone.w + margin);
    const rawW = sx1 - sx0;
    const rawX0 = mirror ? W - sx1 : sx0; // schermo specchiato → fotogramma originale della camera
    const scale = Math.min(1, 480 / H);
    const crop = this.crops[side];
    crop.width = Math.round(rawW * scale);
    crop.height = Math.round(H * scale);
    const cctx = crop.getContext('2d');
    const tracker = this.trackers[side];
    if (cctx) {
      try {
        cctx.drawImage(video, rawX0, 0, rawW, H, 0, 0, crop.width, crop.height);
        const res = this.landmarkers[side].detectForVideo(crop, now);
        const poses = res.landmarks.map((pose) => pose.map((p) => ({ ...p, x: (rawX0 + p.x * rawW) / W })));
        tracker.update(poses, now);
        for (const t of tracker.tracks) t.side = side;
      } catch (err) {
        console.warn('Pose detection error:', err);
      }
    }
    return { side, now };
  }

  /** Corpo dell'atleta (busto, testa, piedi) in pixel del canvas; null se non si vede */
  body(a: Athlete, swap: boolean, mirror: boolean, W: number, H: number, s: number): (Body & { feetY: number }) | null {
    const tr = this.trackers[sideOfAthlete(a, swap)].tracks[0];
    if (!tr) return null;
    const P = (i: number) => (tr.pts[i] && tr.pts[i].v > 0.5
      ? { x: (mirror ? 1 - tr.pts[i].x : tr.pts[i].x) * W, y: tr.pts[i].y * H } : null);
    const isPt = (q: { x: number; y: number } | null): q is { x: number; y: number } => !!q;
    const sh = [P(11), P(12)].filter(isPt);
    const hp = [P(23), P(24)].filter(isPt);
    if (!sh.length || !hp.length) return null;
    const avg = (v: number[]) => v.reduce((m, n) => m + n, 0) / v.length;
    const neckY = avg(sh.map((q) => q.y));
    const hipY = avg(hp.map((q) => q.y));
    const L = hipY - neckY;
    if (L < 10 * s) return null;
    const nose = P(0);
    // piedi: il punto più basso tra caviglie, talloni e punte (se non si vedono, stima dalle anche)
    const feet = [27, 28, 29, 30, 31, 32].map(P).filter(isPt);
    const feetY = feet.length ? Math.max(...feet.map((q) => q.y)) : hipY + 1.6 * L;
    return { cx: avg([...sh, ...hp].map((q) => q.x)), neckY, hipY, headY: nose ? nose.y : neckY - 0.45 * L, L, feetY };
  }

  /**
   * Polsi e caviglie dell'atleta analizzato in questo fotogramma, con la velocità rispetto al fotogramma
   * precedente in busti al secondo (busto dal modello; se non si vede, `torsoFallback`).
   */
  strikes(an: Analysis, W: number, H: number, mirror: boolean, swap: boolean, s: number, torsoFallback: (a: Athlete) => number): Strike[] {
    const out: Strike[] = [];
    const X = (nx: number) => (mirror ? 1 - nx : nx) * W;
    for (const t of this.trackers[an.side].tracks) {
      if (t.lastSeen !== an.now || !t.prevPts) continue;
      const dt = Math.max(0.001, (t.lastSeen - t.prevT) / 1000);
      const athlete = athleteOfSide(an.side, swap);
      const tp = [11, 12, 23, 24].map((i) => t.pts[i]);
      const torsoPx = tp.every((q) => q && q.v > 0.5) ? ((tp[2].y + tp[3].y) / 2 - (tp[0].y + tp[1].y) / 2) * H : 0;
      const torso = torsoPx > 10 * s ? torsoPx : torsoFallback(athlete);
      for (const id of STRIKE_POINTS) {
        const c = t.pts[id], p = t.prevPts[id];
        if (!c || !p || c.v < 0.5) continue;
        out.push({
          athlete, id, kind: kindOfLandmark(id),
          x: X(c.x), y: c.y * H, px: X(p.x), py: p.y * H,
          speed: Math.hypot((c.x - p.x) * W, (c.y - p.y) * H) / torso / dt,
        });
      }
    }
    return out;
  }
}
