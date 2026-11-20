// Modello del corpo: caricato solo la prima volta che serve (tipologia Corpo), con possibilità di riprovare.
import { useEffect, useState } from 'react';
import { loadPoseLandmarkers } from '../utils/pose';
import type { BodyDetector } from '../detection/corpo';

export type PoseStatus = 'idle' | 'loading' | 'ready' | 'error';

export function usePoseModel(needed: boolean, detector: BodyDetector) {
  const [status, setStatus] = useState<PoseStatus>(detector.landmarkers ? 'ready' : 'idle');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!needed || detector.landmarkers) return;
    let cancelled = false;
    setStatus('loading');
    loadPoseLandmarkers()
      .then((lm) => {
        if (cancelled) return;
        detector.landmarkers = lm;
        setStatus('ready');
      })
      .catch((err) => {
        console.warn('Pose model failed to load:', err);
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [needed, attempt, detector]);

  return { status, retry: () => setAttempt((n) => n + 1) };
}
