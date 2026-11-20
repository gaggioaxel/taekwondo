// Calibrazione degli atleti (tasto "Calibra"):
// 1. CAMPO LIBERO: si memorizza lo sfondo (media di qualche fotogramma senza nessuno nei riquadri)
// 2. ATLETI IN POSIZIONE, FERMI: ciò che differisce dallo sfondo è l'atleta → sua sagoma vera (forma, altezza, area)
// Dopo, la stessa differenza dallo sfondo segue l'atleta (anche fermo): la sagoma calibrata lo accompagna
// e se si avvicina o si allontana troppo rispetto alla calibrazione compare un avviso.
// Le soglie (Energia, velocità dei colpi, colpitori) si riferiscono alla figura calibrata di ciascun atleta.

import type { Box } from './silhouette';

type Zone = { x1: number; y1: number; w: number; h: number };

/** lato della cella di campionamento (pixel) */
export const CELL = 4;
/** differenza dallo sfondo (somma |ΔR|+|ΔG|+|ΔB|) oltre la quale un punto è "atleta" */
const FG_DIFF = 70;
/** fuori da questo rapporto con l'altezza calibrata compare l'avviso */
export const RANGE = { min: 0.82, max: 1.2 };

// ---------- Sfondo ----------

export class BackgroundModel {
  W = 0;
  H = 0;
  cols = 0;
  rows = 0;
  data = new Float32Array(0);
  n = 0;
  private tick = 0;

  reset(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.cols = Math.ceil(W / CELL);
    this.rows = Math.ceil(H / CELL);
    this.data = new Float32Array(this.cols * this.rows * 3);
    this.n = 0;
  }

  ready(W: number, H: number) {
    return this.n > 0 && this.W === W && this.H === H;
  }

  /** media dei fotogrammi del campo libero */
  accumulate(frame: Uint8ClampedArray) {
    this.n++;
    const k = 1 / this.n;
    const { cols, rows, W, data } = this;
    for (let r = 0; r < rows; r++) {
      const y = Math.min(this.H - 1, r * CELL);
      for (let c = 0; c < cols; c++) {
        const i = (y * W + Math.min(W - 1, c * CELL)) * 4;
        const j = (r * cols + c) * 3;
        data[j] += (frame[i] - data[j]) * k;
        data[j + 1] += (frame[i + 1] - data[j + 1]) * k;
        data[j + 2] += (frame[i + 2] - data[j + 2]) * k;
      }
    }
  }

  /** Adattamento lento alla luce che cambia, solo dove non c'è un atleta (ogni ~15 fotogrammi) */
  adapt(frame: Uint8ClampedArray, isAthlete: (c: number, r: number) => boolean) {
    if (++this.tick % 15) return;
    const rate = 0.05;
    const { cols, rows, W, data } = this;
    for (let r = 0; r < rows; r++) {
      const y = Math.min(this.H - 1, r * CELL);
      for (let c = 0; c < cols; c++) {
        if (isAthlete(c, r)) continue;
        const i = (y * W + Math.min(W - 1, c * CELL)) * 4;
        const j = (r * cols + c) * 3;
        data[j] += (frame[i] - data[j]) * rate;
        data[j + 1] += (frame[i + 1] - data[j + 1]) * rate;
        data[j + 2] += (frame[i + 2] - data[j + 2]) * rate;
      }
    }
  }
}

// ---------- Atleta = differenza dallo sfondo ----------

/** Maschera dell'atleta in una cornice (celle della griglia globale da c0,r0), solo la parte più grande */
export type FgMask = { c0: number; r0: number; cols: number; rows: number; mask: Uint8Array; count: number };

export function foreground(bg: BackgroundModel, frame: Uint8ClampedArray, z: Zone): FgMask {
  const c0 = Math.ceil(z.x1 / CELL);
  const r0 = Math.ceil(z.y1 / CELL);
  const cols = Math.max(1, Math.floor((z.x1 + z.w) / CELL) - c0);
  const rows = Math.max(1, Math.floor((z.y1 + z.h) / CELL) - r0);
  const raw = new Uint8Array(cols * rows);
  const W = bg.W;
  for (let r = 0; r < rows; r++) {
    const gr = r0 + r;
    const y = Math.min(bg.H - 1, gr * CELL);
    for (let c = 0; c < cols; c++) {
      const gc = c0 + c;
      const i = (y * W + Math.min(W - 1, gc * CELL)) * 4;
      const j = (gr * bg.cols + gc) * 3;
      const d = Math.abs(frame[i] - bg.data[j]) + Math.abs(frame[i + 1] - bg.data[j + 1]) + Math.abs(frame[i + 2] - bg.data[j + 2]);
      raw[r * cols + c] = d > FG_DIFF ? 1 : 0;
    }
  }
  const mask = largestComponent(raw, cols, rows);
  let count = 0;
  for (let i = 0; i < mask.length; i++) count += mask[i];
  return { c0, r0, cols, rows, mask, count };
}

/**
 * Tiene solo la parte più grande (l'atleta), scartando rumore e pezzi staccati.
 * I pezzi vicini (es. un braccio che sullo sfondo si vede a tratti) vengono uniti: la ricerca salta buchi di 1 cella.
 */
function largestComponent(raw: Uint8Array, cols: number, rows: number): Uint8Array {
  const label = new Int32Array(cols * rows);
  const stack: number[] = [];
  let best = 0, bestSize = 0, next = 0;
  for (let start = 0; start < raw.length; start++) {
    if (!raw[start] || label[start]) continue;
    next++;
    let size = 0;
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const r = (k / cols) | 0, c = k - r * cols;
      for (let dr = -2; dr <= 2; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dc = -2; dc <= 2; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= cols || (!dr && !dc)) continue;
          const n = rr * cols + cc;
          if (raw[n] && !label[n]) {
            label[n] = next;
            stack.push(n);
          }
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  const out = new Uint8Array(raw.length);
  if (best) for (let i = 0; i < raw.length; i++) out[i] = label[i] === best ? 1 : 0;
  return out;
}

/** Figura dalla maschera: altezza tra il 2° e il 98° percentile verticale (piedi e testa), centro = mediana */
/** `clipped` = l'atleta esce dal bordo alto della cornice (troppo vicino: la testa è tagliata) */
export type Figure = { cx: number; top: number; feet: number; h: number; area: number; clipped: boolean };

export function figureOfMask(fg: FgMask): Figure | null {
  if (fg.count < 40) return null;
  const rowCount = new Uint32Array(fg.rows);
  const colCount = new Uint32Array(fg.cols);
  for (let r = 0; r < fg.rows; r++) {
    for (let c = 0; c < fg.cols; c++) {
      if (fg.mask[r * fg.cols + c]) {
        rowCount[r]++;
        colCount[c]++;
      }
    }
  }
  const quant = (counts: Uint32Array, q: number) => {
    const target = fg.count * q;
    let acc = 0;
    for (let i = 0; i < counts.length; i++) {
      acc += counts[i];
      if (acc >= target) return i;
    }
    return counts.length - 1;
  };
  const top = (fg.r0 + quant(rowCount, 0.02)) * CELL;
  const feet = (fg.r0 + quant(rowCount, 0.98) + 1) * CELL;
  const cx = (fg.c0 + quant(colCount, 0.5) + 0.5) * CELL;
  const clipped = rowCount[0] > 2;
  return { cx, top, feet, h: feet - top, area: fg.count * CELL * CELL, clipped };
}

// ---------- Sagoma calibrata ----------

export type Shape = {
  /** maschera ritagliata sulla figura (celle) */
  mask: Uint8Array;
  cols: number;
  rows: number;
  /** altezza (px) e area (px²) dell'atleta alla calibrazione */
  h0: number;
  area0: number;
  /** posizione alla calibrazione */
  cx0: number;
  feet0: number;
  /** centro orizzontale della figura dentro il ritaglio (frazione della larghezza) */
  cxFrac: number;
  /** altezza misurata dal modello del corpo alla calibrazione (Corpo): per seguire l'atleta quando mancano i pixel */
  poseH0?: number;
  canvases: Map<string, HTMLCanvasElement>;
};

/** Media delle maschere raccolte da fermo → sagoma (celle presenti in più di metà dei fotogrammi) */
export function buildShape(acc: Float32Array, frames: number, ref: FgMask): Shape | null {
  const raw = new Uint8Array(acc.length);
  for (let i = 0; i < acc.length; i++) raw[i] = acc[i] / frames > 0.5 ? 1 : 0;
  const mask = largestComponent(raw, ref.cols, ref.rows);
  const fg: FgMask = { ...ref, mask, count: mask.reduce((a, b) => a + b, 0) };
  const fig = figureOfMask(fg);
  if (!fig) return null;
  // ritaglio sulla figura
  let cMin = Infinity, cMax = -1, rMin = Infinity, rMax = -1;
  for (let r = 0; r < ref.rows; r++) {
    for (let c = 0; c < ref.cols; c++) {
      if (!mask[r * ref.cols + c]) continue;
      if (c < cMin) cMin = c;
      if (c > cMax) cMax = c;
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }
  }
  const cols = cMax - cMin + 1, rows = rMax - rMin + 1;
  const crop = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) crop[r * cols + c] = mask[(r + rMin) * ref.cols + c + cMin];
  const left = (ref.c0 + cMin) * CELL;
  return {
    mask: crop, cols, rows,
    h0: fig.h, area0: fig.area, cx0: fig.cx, feet0: fig.feet,
    cxFrac: (fig.cx - left) / (cols * CELL),
    canvases: new Map(),
  };
}

/** Disegno della sagoma calibrata (bordo colorato + interno trasparente), alla grandezza della calibrazione */
export function shapeCanvas(sh: Shape, outline: string, fill: string, border: number): HTMLCanvasElement {
  const key = `${outline}|${fill}|${Math.round(border)}`;
  const cached = sh.canvases.get(key);
  if (cached) return cached;
  const B = Math.max(2, Math.round(border));
  const w = sh.cols * CELL, h = sh.rows * CELL;
  // maschera ammorbidita (le celle da 4 px diventano un contorno liscio)
  const base = document.createElement('canvas');
  base.width = w + B * 4;
  base.height = h + B * 4;
  const b = base.getContext('2d', { willReadFrequently: true })!;
  b.filter = 'blur(3px)';
  b.fillStyle = '#fff';
  for (let r = 0; r < sh.rows; r++) for (let c = 0; c < sh.cols; c++) {
    if (sh.mask[r * sh.cols + c]) b.fillRect(B * 2 + c * CELL - 0.5, B * 2 + r * CELL - 0.5, CELL + 1, CELL + 1);
  }
  b.filter = 'none';
  const img = b.getImageData(0, 0, base.width, base.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  b.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = base.width;
  out.height = base.height;
  const o = out.getContext('2d')!;
  // bordo: la maschera spostata tutt'intorno, colorata
  o.globalCompositeOperation = 'source-over';
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    o.drawImage(base, Math.cos(ang) * B, Math.sin(ang) * B);
  }
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = outline;
  o.fillRect(0, 0, out.width, out.height);
  // interno svuotato e riempito di colore trasparente
  o.globalCompositeOperation = 'destination-out';
  o.drawImage(base, 0, 0);
  o.globalCompositeOperation = 'destination-over';
  const tint = document.createElement('canvas');
  tint.width = out.width;
  tint.height = out.height;
  const t = tint.getContext('2d')!;
  t.drawImage(base, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = fill;
  t.fillRect(0, 0, tint.width, tint.height);
  o.drawImage(tint, 0, 0);
  sh.canvases.set(key, out);
  return out;
}

/** Margine (px) attorno alla figura nel canvas di shapeCanvas */
export const shapePad = (border: number) => Math.max(2, Math.round(border)) * 2;

// ---------- Atleta calibrato che si muove ----------

/** `clip` = quanto spesso di recente l'atleta esce dal bordo alto (0..1) */
export type Tracked = { cx: number; feet: number; h: number; seen: number; clip: number };

/** Segue l'atleta con un filtro leggero (la sagoma lo accompagna senza tremare) */
export function follow(tr: Tracked | null, fig: { cx: number; feet: number; h: number; clipped?: boolean } | null, now: number): Tracked | null {
  if (!fig) return tr && now - tr.seen < 1500 ? tr : null;
  const c = fig.clipped ? 1 : 0;
  if (!tr) return { cx: fig.cx, feet: fig.feet, h: fig.h, seen: now, clip: c };
  const k = 0.3;
  return {
    cx: tr.cx + k * (fig.cx - tr.cx), feet: tr.feet + k * (fig.feet - tr.feet), h: tr.h + k * (fig.h - tr.h),
    seen: now, clip: tr.clip * 0.85 + c * 0.15,
  };
}

export type RangeState = 'ok' | 'lontano' | 'vicino' | 'perso';

export function rangeOf(sh: Shape, tr: Tracked | null): RangeState {
  if (!tr) return 'perso';
  const k = tr.h / sh.h0;
  // testa tagliata dal bordo alto in modo persistente (non un calcio per un attimo) = troppo vicino
  return k > RANGE.max || tr.clip > 0.6 ? 'vicino' : k < RANGE.min ? 'lontano' : 'ok';
}

/** Riquadro della figura attuale (per i colpitori e le proporzioni del corpo) */
export function boxOf(tr: { cx: number; feet: number; h: number }): Box {
  return { x: tr.cx - tr.h / 4, y: tr.feet - tr.h, w: tr.h / 2, h: tr.h };
}

/** Area di riferimento per Energia: quella calibrata, scalata con la distanza attuale (entro il margine) */
export function refArea(sh: Shape, tr: Tracked | null): number {
  const k = tr ? Math.min(RANGE.max, Math.max(RANGE.min, tr.h / sh.h0)) : 1;
  return sh.area0 * k * k;
}

// ---------- Procedura di calibrazione (stato + passo per ogni fotogramma) ----------

export type Athlete = 'hong' | 'chong';
export type CalPhase = 'off' | 'intro' | 'sfondo' | 'atleti' | 'fatto' | 'errore';
/** cerco = nessuno nel riquadro · fermo = trovato, aspetto che stia fermo · misuro = raccolgo la sagoma · ok = calibrato */
export type AthStatus = 'cerco' | 'fermo' | 'misuro' | 'ok';
export type CalSnapshot = { phase: CalPhase; t0: number; status: Record<Athlete, AthStatus>; error?: string };
export type CalEvent = 'sfondo-ok' | 'atleta-ok' | 'fatto' | 'errore';
type PadZones = Record<Athlete, Zone>;
type Fig = { cx: number; feet: number; h: number };

/** tempi della procedura (ms) */
export const CAL_TIMES = {
  /** "campo libero": si aspetta che escano, poi si fotografa lo sfondo */
  bgWait: 1500,
  bgEnd: 3000,
  /** l'atleta deve restare fermo così prima della misura */
  still: 700,
  /** fotogrammi raccolti per la sagoma (~1,2 s) */
  frames: 36,
  timeout: 25000,
  doneShow: 1800,
};

type AthCal = { status: AthStatus; stableSince: number; last: { cx: number; h: number } | null; acc: Float32Array | null; frames: number; ref: FgMask | null };
const newAth = (): AthCal => ({ status: 'cerco', stableSince: 0, last: null, acc: null, frames: 0, ref: null });
const ATHLETES: Athlete[] = ['hong', 'chong'];

export class Calibration {
  phase: CalPhase = 'off';
  t0 = 0;
  error?: string;
  readonly bg = new BackgroundModel();
  shapes: Record<Athlete, Shape | null> = { hong: null, chong: null };
  track: Record<Athlete, Tracked | null> = { hong: null, chong: null };
  /** ultima maschera dell'atleta (per il disegno "ti vedo" e per non adattare lo sfondo sopra di lui) */
  fg: Record<Athlete, FgMask | null> = { hong: null, chong: null };
  /** avvisa l'interfaccia (cambio di fase o di stato di un atleta) */
  onChange: ((s: CalSnapshot) => void) | null = null;
  /** suoni */
  onEvent: ((e: CalEvent, a?: Athlete) => void) | null = null;

  private ath: Record<Athlete, AthCal> = { hong: newAth(), chong: newAth() };
  private backup: Record<Athlete, Shape | null> | null = null;
  private bgStarted = false;

  get calibrated() {
    return !!(this.shapes.hong || this.shapes.chong);
  }
  get active() {
    return this.phase !== 'off';
  }
  status(a: Athlete) {
    return this.ath[a].status;
  }
  snapshot(): CalSnapshot {
    return { phase: this.phase, t0: this.t0, status: { hong: this.ath.hong.status, chong: this.ath.chong.status }, error: this.error };
  }
  private emit() {
    this.onChange?.(this.snapshot());
  }

  open() {
    this.phase = 'intro';
    this.error = undefined;
    this.emit();
  }

  /** "Avvia calibrazione": campo libero, poi atleti */
  start(now: number) {
    if (!this.backup) this.backup = { ...this.shapes };
    this.phase = 'sfondo';
    this.t0 = now;
    this.error = undefined;
    this.bgStarted = false;
    this.ath = { hong: newAth(), chong: newAth() };
    this.shapes = { hong: null, chong: null };
    this.track = { hong: null, chong: null };
    this.emit();
  }

  fail(error?: string) {
    this.phase = 'errore';
    this.error = error;
    this.onEvent?.('errore');
    this.emit();
  }

  /**
   * Chiude la procedura. `restore` (annulla) = si torna alla calibrazione di prima;
   * altrimenti si tengono gli atleti calibrati e, per gli altri, quelli di prima.
   */
  close(restore: boolean) {
    if (this.backup) {
      for (const a of ATHLETES) if (restore || !this.shapes[a]) this.shapes[a] = this.backup[a];
    }
    this.backup = null;
    this.phase = 'off';
    this.emit();
  }

  /** Atleti non ancora calibrati (per il messaggio di errore) */
  missing(): Athlete[] {
    return ATHLETES.filter((a) => this.ath[a].status !== 'ok');
  }

  /**
   * Un passo per ogni fotogramma.
   * `frame` = pixel del canvas (solo video) o null se non letti; `pose` = figura dal modello del corpo, se c'è.
   */
  step(frame: Uint8ClampedArray | null, W: number, H: number, zones: PadZones, now: number, pose: Record<Athlete, Fig | null>) {
    if (this.phase === 'sfondo') return this.stepBackground(frame, W, H, now);
    if (this.phase === 'atleti') return this.stepAthletes(frame, W, H, zones, now, pose);
    if (this.phase === 'fatto' && now - this.t0 > CAL_TIMES.doneShow) {
      this.phase = 'off';
      this.emit();
    }
    if (this.phase === 'off' || this.phase === 'fatto') this.follow(frame, W, H, zones, now, pose);
  }

  private stepBackground(frame: Uint8ClampedArray | null, W: number, H: number, now: number) {
    const el = now - this.t0;
    if (el < CAL_TIMES.bgWait) return;
    if (el < CAL_TIMES.bgEnd) {
      if (!frame) return;
      if (!this.bgStarted) {
        this.bg.reset(W, H);
        this.bgStarted = true;
      }
      this.bg.accumulate(frame);
      return;
    }
    if (!this.bgStarted) return this.fail('La camera non manda immagini: controlla che sia accesa.');
    this.phase = 'atleti';
    this.t0 = now;
    this.onEvent?.('sfondo-ok');
    this.emit();
  }

  private stepAthletes(frame: Uint8ClampedArray | null, W: number, H: number, zones: PadZones, now: number, pose: Record<Athlete, Fig | null>) {
    if (!frame || !this.bg.ready(W, H)) return;
    let changed = false;
    for (const a of ATHLETES) {
      const st = this.ath[a];
      if (st.status === 'ok') continue;
      const z = zones[a];
      const before = st.status;
      const fg = foreground(this.bg, frame, z);
      this.fg[a] = fg;
      const fig = figureOfMask(fg);
      if (!fig || fig.h < z.h * 0.3) {
        Object.assign(st, newAth());
      } else {
        // fermo = altezza e posizione stabili (confronto con la media degli ultimi fotogrammi)
        const moved = !st.last || Math.abs(fig.h - st.last.h) > st.last.h * 0.06 || Math.abs(fig.cx - st.last.cx) > z.w * 0.04;
        st.last = st.last ? { cx: st.last.cx + 0.3 * (fig.cx - st.last.cx), h: st.last.h + 0.3 * (fig.h - st.last.h) } : { cx: fig.cx, h: fig.h };
        if (moved) {
          st.status = 'fermo';
          st.stableSince = now;
          st.acc = null;
          st.frames = 0;
        } else if (now - st.stableSince > CAL_TIMES.still) {
          st.status = 'misuro';
          if (!st.acc || !st.ref || st.acc.length !== fg.mask.length) {
            st.acc = new Float32Array(fg.mask.length);
            st.frames = 0;
            st.ref = fg;
          }
          for (let i = 0; i < fg.mask.length; i++) st.acc[i] += fg.mask[i];
          st.frames++;
          if (st.frames >= CAL_TIMES.frames) {
            const sh = buildShape(st.acc, st.frames, st.ref);
            if (sh && sh.h0 >= z.h * 0.3) {
              if (pose[a]) sh.poseH0 = pose[a]!.h;
              this.shapes[a] = sh;
              this.track[a] = { cx: sh.cx0, feet: sh.feet0, h: sh.h0, seen: now, clip: 0 };
              st.status = 'ok';
              this.onEvent?.('atleta-ok', a);
            } else {
              st.acc = null;
              st.stableSince = now;
            }
          }
        }
      }
      if (st.status !== before) changed = true;
    }
    if (this.ath.hong.status === 'ok' && this.ath.chong.status === 'ok') {
      this.phase = 'fatto';
      this.t0 = now;
      this.backup = null;
      this.onEvent?.('fatto');
      changed = true;
    } else if (now - this.t0 > CAL_TIMES.timeout) {
      return this.fail();
    }
    if (changed) this.emit();
  }

  /** Dopo la calibrazione: segue ogni atleta (differenza dallo sfondo, o modello del corpo se mancano i pixel) */
  private follow(frame: Uint8ClampedArray | null, W: number, H: number, zones: PadZones, now: number, pose: Record<Athlete, Fig | null>) {
    const bgOk = !!frame && this.bg.ready(W, H);
    for (const a of ATHLETES) {
      const sh = this.shapes[a];
      if (!sh) continue;
      let fig: Fig | null = null;
      if (bgOk) {
        const fg = foreground(this.bg, frame!, zones[a]);
        this.fg[a] = fg;
        const f = figureOfMask(fg);
        if (f && f.h > zones[a].h * 0.2) fig = f;
      }
      const p = pose[a];
      if (!fig && p) fig = { cx: p.cx, feet: p.feet, h: sh.poseH0 ? (sh.h0 * p.h) / sh.poseH0 : p.h };
      this.track[a] = follow(this.track[a], fig, now);
    }
    if (bgOk) {
      this.bg.adapt(frame!, (c, r) => {
        for (const a of ATHLETES) {
          const fg = this.fg[a];
          if (fg && c >= fg.c0 && c < fg.c0 + fg.cols && r >= fg.r0 && r < fg.r0 + fg.rows && fg.mask[(r - fg.r0) * fg.cols + (c - fg.c0)]) return true;
        }
        return false;
      });
    }
  }

  // ---------- Riferimenti per le soglie ----------

  /** Riquadro della figura attuale dell'atleta (calibrata e seguita), o null se non calibrato */
  figure(a: Athlete): Box | null {
    const sh = this.shapes[a];
    if (!sh) return null;
    return boxOf(this.track[a] ?? { cx: sh.cx0, feet: sh.feet0, h: sh.h0 });
  }

  /** Area di riferimento (px²) per Energia, o null se non calibrato */
  area(a: Athlete): number | null {
    const sh = this.shapes[a];
    return sh ? refArea(sh, this.track[a]) : null;
  }

  range(a: Athlete): RangeState | null {
    const sh = this.shapes[a];
    return sh ? rangeOf(sh, this.track[a]) : null;
  }
}
