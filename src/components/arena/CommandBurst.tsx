import React from 'react';
import type { BurstState } from '../../hooks/useCommandBurst';

// Poligono a stella "fumetto" (punte irregolari ma sempre uguali)
function burstPoints(rx: number, ry: number, inner: number, spikes: number): string {
  const jitter = [1, 0.86, 1.08, 0.92, 1.04, 0.84, 1.1, 0.95, 1, 0.88];
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 === 0 ? jitter[(i / 2) % jitter.length] : inner;
    pts.push(`${(Math.cos(a) * rx * k).toFixed(1)},${(Math.sin(a) * ry * k).toFixed(1)}`);
  }
  return pts.join(' ');
}

const LOOK = {
  keuman: { ko: '그만!', roman: 'KEUMAN!', outer: '#ff1e44', inner: '#ffe600', accent: '#ff1e44', tilt: 'rotate-[-6deg]' },
  baro: { ko: '바로!', roman: 'BA-RO!', outer: '#10b981', inner: '#ffffff', accent: '#059669', tilt: 'rotate-[5deg]' },
};

/** Fumetti dei comandi: 그만! KEUMAN! (rosso/giallo) e 바로! BA-RO! (verde/bianco), sfondo scurito */
export const CommandBurst: React.FC<{ burst: BurstState | null }> = ({ burst }) => {
  if (!burst) return null;
  const look = LOOK[burst.kind];
  return (
    <div key={burst.key} className={`absolute inset-0 z-40 flex items-center justify-center pointer-events-none bg-black/70 ${burst.leaving ? 'burst-out' : 'burst-dim'}`}>
      <div className="relative burst-in" style={{ width: 'min(78vh, 70vw)', aspectRatio: '1.35' }}>
        <svg viewBox="-68 -50 136 100" className="absolute inset-0 w-full h-full drop-shadow-[6px_6px_0_rgba(0,0,0,0.9)]">
          <polygon points={burstPoints(66, 48, 0.62, 20)} fill="#000" />
          <polygon points={burstPoints(62, 44, 0.64, 20)} fill={look.outer} />
          <polygon points={burstPoints(47, 33, 0.7, 20)} fill={look.inner} />
        </svg>
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${look.tilt}`}>
          <span className="font-comic text-black leading-none" style={{ fontSize: 'min(17vh, 15vw)', WebkitTextStroke: '0.02em #fff' }}>{look.ko}</span>
          <span className="font-comic text-stroke-thick leading-none tracking-wider" style={{ fontSize: 'min(10vh, 9vw)', color: look.accent }}>{look.roman}</span>
        </div>
      </div>
    </div>
  );
};
