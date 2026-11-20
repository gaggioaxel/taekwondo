// Camera: flusso video (frontale/posteriore) acceso o spento; errore leggibile se non disponibile.
import { useEffect, useRef, useState } from 'react';

export function useCamera(facingMode: 'user' | 'environment', enabled: boolean, onRestart: () => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const onRestartRef = useRef(onRestart);
  onRestartRef.current = onRestart;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCameraError(null);
    onRestartRef.current();
    if (!enabled) {
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((err: any) => {
        console.warn('Camera access failed or unavailable:', err);
        if (!cancelled) setCameraError(err?.message || 'Impossibile accedere alla fotocamera. Puoi usare la modalità simulazione.');
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode, enabled]);

  return { videoRef, cameraError };
}
