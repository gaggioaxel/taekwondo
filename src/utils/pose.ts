// Livello 2: pose tracking 2D multipersona con MediaPipe Pose Landmarker (modello "lite").
// Il pacchetto viene caricato solo quando serve (import dinamico), così il Livello 1 resta leggero.
import type { PoseLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

const TASKS_VERSION = '1.2.2'; // deve coincidere con la versione in package.json
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const MAX_POSES = 4;

// Indici dei landmark MediaPipe usati come "armi": polsi e caviglie
export const STRIKE_POINTS = [15, 16, 27, 28] as const;

// Scheletro semplificato (spalle, braccia, busto, gambe)
export const SKELETON: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
];

let loading: Promise<PoseLandmarker> | null = null;

export function loadPoseLandmarker(): Promise<PoseLandmarker> {
  if (!loading) {
    loading = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate: 'GPU' | 'CPU') =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numPoses: MAX_POSES,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        return await make('GPU');
      } catch {
        return await make('CPU');
      }
    })();
    loading.catch(() => {
      loading = null; // permette di riprovare
    });
  }
  return loading;
}

export type Pose = NormalizedLandmark[];
