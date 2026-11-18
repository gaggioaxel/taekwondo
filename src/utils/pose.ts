// Tipologia "Corpo": pose tracking 2D con MediaPipe Pose Landmarker (modello "lite").
// Due istanze, una per riquadro (sinistra/destra), ognuna cerca UNA sola persona nel proprio ritaglio.
// Il pacchetto viene caricato solo quando serve (import dinamico), così il Livello 1 resta leggero.
import type { PoseLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

const TASKS_VERSION = '1.2.2'; // deve coincidere con la versione in package.json
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';


// Indici dei landmark MediaPipe usati come "armi": polsi e caviglie
export const STRIKE_POINTS = [15, 16, 27, 28] as const;

// Scheletro semplificato (spalle, braccia, busto, gambe)
export const SKELETON: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
];

export type LandmarkerPair = { left: PoseLandmarker; right: PoseLandmarker };

let loading: Promise<LandmarkerPair> | null = null;

/** Carica (una volta) le due istanze del modello: una per il riquadro di sinistra, una per quello di destra. */
export function loadPoseLandmarkers(): Promise<LandmarkerPair> {
  if (!loading) {
    loading = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const modelBuffer = new Uint8Array(await (await fetch(MODEL_URL)).arrayBuffer()); // scaricato una volta, usato da entrambe
      const make = (delegate: 'GPU' | 'CPU') =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: modelBuffer, delegate },
          runningMode: 'VIDEO',
          numPoses: 1, // una sola persona per riquadro
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      const makeOne = async () => {
        try {
          return await make('GPU');
        } catch {
          return await make('CPU');
        }
      };
      return { left: await makeOne(), right: await makeOne() };
    })();
    loading.catch(() => {
      loading = null; // permette di riprovare
    });
  }
  return loading;
}

export type Pose = NormalizedLandmark[];

// ---------- Tracking tra i fotogrammi + filtro anti-tremolio ----------

export type TrackPoint = { x: number; y: number; v: number }; // coordinate normalizzate 0..1 (come MediaPipe)

export type Track = {
  id: number;
  pts: TrackPoint[]; // punti filtrati
  prevPts: TrackPoint[] | null; // punti filtrati del fotogramma precedente (per la velocità dei colpi)
  prevT: number;
  lastSeen: number; // ms (performance.now)
  /** riquadro dell'atleta (sinistra/destra dello schermo) */
  side: 'left' | 'right' | null;
};

const HOLD_MS = 250; // una persona persa per un attimo resta visibile per questo tempo
const MATCH_DIST = 0.2; // distanza massima (normalizzata) per riconoscere la stessa persona

/** Centro del busto (spalle + anche) o, in mancanza, il naso: serve per riconoscere la persona */
function anchor(p: { x: number; y: number; visibility?: number; v?: number }[]): { x: number; y: number } | null {
  const ids = [11, 12, 23, 24].filter((i) => p[i] && (p[i].visibility ?? p[i].v ?? 1) > 0.4);
  const use = ids.length ? ids : p[0] ? [0] : [];
  if (!use.length) return null;
  return { x: use.reduce((s, i) => s + p[i].x, 0) / use.length, y: use.reduce((s, i) => s + p[i].y, 0) / use.length };
}

export class PoseTracker {
  tracks: Track[] = [];
  private nextId = 1;

  reset() {
    this.tracks = [];
  }

  update(poses: Pose[], now: number): Track[] {
    const free = new Set(this.tracks.map((t) => t.id));
    for (const pose of poses) {
      const a = anchor(pose);
      if (!a) continue;
      // persona già vista più vicina
      let best: Track | null = null;
      let bestD = MATCH_DIST;
      for (const t of this.tracks) {
        if (!free.has(t.id)) continue;
        const b = anchor(t.pts);
        if (!b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (!best) {
        this.tracks.push({
          id: this.nextId++, pts: pose.map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 })),
          prevPts: null, prevT: now, lastSeen: now, side: null,
        });
        continue;
      }
      free.delete(best.id);
      const dt = Math.max(0.001, (now - best.lastSeen) / 1000);
      best.prevPts = best.pts.map((p) => ({ ...p }));
      best.prevT = best.lastSeen;
      best.pts = best.pts.map((old, i) => {
        const n = pose[i];
        if (!n) return old;
        // filtro adattivo (tipo "One Euro"): fermo → molto liscio, veloce → segue subito (non perde i colpi)
        const speed = Math.hypot(n.x - old.x, n.y - old.y) / dt;
        const alpha = Math.min(0.95, 0.25 + speed * 0.6);
        return {
          x: old.x + alpha * (n.x - old.x),
          y: old.y + alpha * (n.y - old.y),
          v: old.v + 0.3 * ((n.visibility ?? 1) - old.v),
        };
      });
      best.lastSeen = now;
    }
    this.tracks = this.tracks.filter((t) => now - t.lastSeen < HOLD_MS);
    return this.tracks;
  }
}
