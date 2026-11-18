// Tecniche del taekwondo per la tipologia "Corpo".
// Per ora il programma sa solo se un colpo è un CALCIO (caviglia/piede) o un PUGNO (polso/mano):
// i nomi qui sotto vengono mostrati a rotazione dentro la categoria giusta. Quando sapremo
// classificare il colpo (traiettoria, altezza, gamba/braccio), assegneremo il nome vero.
//
// Fonti: eurolinguiste.com (Martial Arts Vocabulary in Korean) per calci e colpi di mano con Hangul;
// glossari taekwondo (taekwondopreschool.com, nbtkda.com, blackbeltwiki.com) per i pugni base 지르기.
// Romanizzazione uniformata (Revised Romanization).

export type TechniqueKind = 'calcio' | 'pugno';

export type Technique = {
  ko: string; // Hangul
  rom: string; // romanizzazione
  it: string; // significato
};

export const KICKS: Technique[] = [
  { ko: '앞차기', rom: 'Ap chagi', it: 'calcio frontale' },
  { ko: '돌려차기', rom: 'Dollyeo chagi', it: 'calcio circolare' },
  { ko: '옆차기', rom: 'Yeop chagi', it: 'calcio laterale' },
  { ko: '뒤차기', rom: 'Dwi chagi', it: 'calcio all\'indietro' },
  { ko: '내려차기', rom: 'Naeryeo chagi', it: 'calcio ad ascia' },
  { ko: '반달차기', rom: 'Bandal chagi', it: 'calcio a mezzaluna' },
  { ko: '후려차기', rom: 'Huryeo chagi', it: 'calcio a uncino' },
  { ko: '밀어차기', rom: 'Mireo chagi', it: 'calcio di spinta' },
  { ko: '뒤후려차기', rom: 'Dwi huryeo chagi', it: 'calcio a uncino girato' },
  { ko: '앞돌려차기', rom: 'Ap dollyeo chagi', it: 'circolare frontale' },
  { ko: '뒤돌려차기', rom: 'Dwi dollyeo chagi', it: 'circolare girato' },
  { ko: '가위차기', rom: 'Gawi chagi', it: 'calcio a forbice' },
  { ko: '뛰어차기', rom: 'Ttwieo chagi', it: 'calcio in salto' },
  { ko: '뛰어앞차기', rom: 'Ttwieo ap chagi', it: 'frontale in salto' },
  { ko: '뛰어뒤차기', rom: 'Ttwieo dwi chagi', it: 'all\'indietro in salto' },
];

export const PUNCHES: Technique[] = [
  { ko: '바로지르기', rom: 'Baro jireugi', it: 'pugno opposto' },
  { ko: '앞지르기', rom: 'Ap jireugi', it: 'pugno frontale' },
  { ko: '몸통지르기', rom: 'Momtong jireugi', it: 'pugno al tronco' },
  { ko: '주먹지르기', rom: 'Jumeok jireugi', it: 'pugno a mano chiusa' },
  { ko: '등주먹치기', rom: 'Deung jumeok chigi', it: 'dorso del pugno' },
  { ko: '손날치기', rom: 'Sonnal chigi', it: 'colpo a mano a taglio' },
  { ko: '손바닥치기', rom: 'Sonbadak chigi', it: 'colpo col palmo' },
  { ko: '팔꿈치치기', rom: 'Palkkumchi chigi', it: 'colpo di gomito' },
  { ko: '아금손치기', rom: 'Ageumson chigi', it: 'colpo a mano ad arco' },
];

/** Nomi a rotazione per categoria (provvisorio, finché non classifichiamo i colpi). */
export class TechniqueRotation {
  private idx: Record<TechniqueKind, number> = { calcio: 0, pugno: 0 };

  next(kind: TechniqueKind): Technique {
    const list = kind === 'calcio' ? KICKS : PUNCHES;
    const t = list[this.idx[kind] % list.length];
    this.idx[kind]++;
    return t;
  }

  reset() {
    this.idx = { calcio: 0, pugno: 0 };
  }
}

/** Polsi (15, 16) = pugno; caviglie (27, 28) = calcio. */
export function kindOfLandmark(id: number): TechniqueKind {
  return id === 27 || id === 28 ? 'calcio' : 'pugno';
}
