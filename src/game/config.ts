// Regole e parametri del gioco: tipologie, difficoltà, soglie, riquadri degli atleti.
import type { Athlete } from '../utils/calibration';

export type { Athlete };
export type Tipologia = 'energia' | 'corpo';
export type Difficolta = 'facile' | 'medio' | 'difficile';
/** Riquadro di un atleta, in pixel del canvas */
export type Zone = { x1: number; y1: number; w: number; h: number };
/** Lato dello schermo (i riquadri sono analizzati per lato: sinistra/destra) */
export type ScreenSide = 'left' | 'right';

export const ATHLETES: Athlete[] = ['hong', 'chong'];

export const DIFFICOLTA: { id: Difficolta; label: string; title: string; titleCorpo: string }[] = [
  { id: 'facile', label: 'Facile', title: 'Basta un colpo leggero per fare punto',
    titleCorpo: 'Colpi liberi: conta ogni pugno o calcio veloce' },
  { id: 'medio', label: 'Medio', title: 'Serve un colpo deciso',
    titleCorpo: 'Colpitori da colpire: soprattutto pugni, 2,5 s per colpirli, basta toccarli' },
  { id: 'difficile', label: 'Difficile', title: 'Contano solo i colpi forti e ampi',
    titleCorpo: 'Colpitori più frequenti: tanti calci alti, 1,5 s per colpirli, colpo forte' },
];

export const DURATA_OPTIONS = [15, 30, 60]; // secondi
export const COUNTDOWN_MAX = 10; // la voce conta fino a 열 (10)
/** pausa minima tra due punti dello stesso atleta */
export const HIT_COOLDOWN_MS = 320;

export const ONOMATOPEE = [
  'KAPOW!', 'BAM!', 'BOOM!', 'WHAM!', 'TAEKWON!',
  'DWI CHAGI!', 'DOLRYEO!', 'AP CHAGI!', 'YEOP CHAGI!', 'SMASH!',
];

// Energia: frazione della sagoma dell'atleta che deve muoversi per fare punto
// (prima era 0,45% / 0,76% / 1,1% dell'immagine intera; convertita con la sagoma alta l'86% della cornice,
// 5,63% dell'immagine in 16:9)
const ENERGIA_QUOTA: Record<Difficolta, number> = { facile: 0.08, medio: 0.135, difficile: 0.195 };
// Energia: differenza minima di un pixel tra due fotogrammi per dire che è "cambiato"
const PIXEL_DIFF: Record<Difficolta, number> = { facile: 28, medio: 35, difficile: 42 };
// Corpo: velocità minima di polso/caviglia, in busti dell'atleta al secondo (alti e bassi fanno la stessa fatica)
// (prima 0,6 / 0,9 / 1,3 larghezze dello schermo al secondo, con l'atleta della sagoma di partenza)
const STRIKE_SPEED: Record<Difficolta, number> = { facile: 4.6, medio: 6.8, difficile: 9.9 };

export function thresholds(d: Difficolta) {
  return { energiaQuota: ENERGIA_QUOTA[d], pixelDiff: PIXEL_DIFF[d], strikeSpeed: STRIKE_SPEED[d] };
}

/** Colori degli atleti (scheletri, sagome) */
export const ATHLETE_COLOR: Record<Athlete, string> = { hong: '#ff2d4a', chong: '#2f9bff' };

/**
 * Riquadri di Hong e Chong: quasi fino ai bordi della camera, dal banner quasi fino al pavimento.
 * `gap` = spazio in mezzo (impostazioni); `swap` = Hong a destra.
 */
export function padZones(W: number, H: number, gap: number, swap: boolean): Record<Athlete, Zone> {
  const padW = (0.96 - gap) / 2;
  const leftX = 0.02;
  const rightX = 0.02 + padW + gap;
  const zone = (x: number): Zone => ({ x1: Math.floor(W * x), y1: Math.floor(H * 0.13), w: Math.floor(W * padW), h: Math.floor(H * 0.85) });
  return { hong: zone(swap ? rightX : leftX), chong: zone(swap ? leftX : rightX) };
}

export const inZone = (z: Zone, x: number, y: number) => x >= z.x1 && x <= z.x1 + z.w && y >= z.y1 && y <= z.y1 + z.h;

/** Riquadro di sinistra = Hong, salvo lati scambiati */
export const athleteOfSide = (side: ScreenSide | null, swap: boolean): Athlete => ((side === 'left') !== swap ? 'hong' : 'chong');
export const sideOfAthlete = (a: Athlete, swap: boolean): ScreenSide => ((a === 'hong') !== swap ? 'left' : 'right');
