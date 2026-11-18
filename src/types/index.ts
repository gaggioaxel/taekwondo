export interface ZoneConfig {
  x1: number;
  y1: number;
  w: number;
  h: number;
}

export interface ComicPopup {
  id: string;
  testo: string;
  /** seconda riga più piccola (es. nome coreano della tecnica) */
  sub?: string;
  x: number;
  y: number;
  color: string;
  rot: number;
  scale: number;
  timer: number;
}

export interface ImpactBurst {
  id: string;
  x: number;
  y: number;
  color: string;
  size: number;
  timer: number;
}

export interface HitRecord {
  id: string;
  side: 'hong' | 'chong';
  timestamp: number;
  timeRemaining: number;
  diffScore: number;
  onomatopoeia: string;
  snapshotUrl?: string;
}

export interface KitItem {
  codice: string;
  nome: string;
  categoria: string;
  priorProbability: number; // P(C)
  descrizioneVisiva: string;
  coloriDominanti: string[];
  geometriaLoghi: string;
}

export interface ScanResultJSON {
  status: 'success' | 'error';
  codice_identificato: string;
  livello_confidenza: number;
  analisi_tecnica: string;
  dettagli_bayesiani?: {
    candidati: Array<{
      codice: string;
      nome: string;
      prior: number;
      likelihood: number;
      posterior: number;
    }>;
  };
}

export interface MatchStats {
  puntiHong: number;
  puntiChong: number;
  durata: number;
  vincitore: 'hong' | 'chong' | 'tie' | null;
  colpiHong: number;
  colpiChong: number;
  cadenzaHong: number; // colpi al secondo
  cadenzaChong: number;
  snapshots: string[];
  /** true se l'incontro è stato fermato con 그만 prima della fine del tempo */
  interrotto?: boolean;
  /** solo tipologia "Corpo": colpi distinti in calci (caviglie) e pugni (polsi) */
  tecniche?: { hong: { calci: number; pugni: number }; chong: { calci: number; pugni: number } };
}
