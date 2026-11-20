// Colpitori a turni (Corpo Medio/Difficile): stesso tipo per i due atleti, posizione sul corpo di ciascuno.
import {
  Body, drawTarget, HIT_FADE_MS, isLive, MISS_FADE_MS, pickKind, placeTarget, segmentHitsCircle, Target, TargetKind,
  TargetLevel, techniqueKindOf,
} from '../utils/targets';
import { Athlete, ATHLETES, Zone } from './config';
import type { Strike } from '../detection/corpo';

type PerAthlete<T> = Record<Athlete, T>;

export class TargetRounds {
  /** l'incontro in corso usa i colpitori */
  enabled = false;
  targets: PerAthlete<Target | null> = { hong: null, chong: null };
  stats: PerAthlete<{ colpiti: number; totali: number }> = { hong: { colpiti: 0, totali: 0 }, chong: { colpiti: 0, totali: 0 } };
  private nextRound = 0; // istante del prossimo turno; 0 = da programmare

  /** inizio incontro */
  reset(enabled: boolean) {
    this.enabled = enabled;
    this.targets = { hong: null, chong: null };
    this.nextRound = 0;
    this.stats = { hong: { colpiti: 0, totali: 0 }, chong: { colpiti: 0, totali: 0 } };
  }

  /** fine incontro: via i colpitori a schermo */
  clear() {
    this.targets = { hong: null, chong: null };
  }

  live(a: Athlete): Target | null {
    const t = this.targets[a];
    return isLive(t) ? t : null;
  }

  /**
   * Un fotogramma: colpitori scaduti, pulizia di quelli finiti, nuovo turno dopo la pausa.
   * `bodyOf` = corpo dell'atleta su cui posizionare il colpitore.
   */
  update(now: number, level: TargetLevel, bodyOf: (a: Athlete) => Body, zones: PerAthlete<Zone>, s: number,
    sounds: { miss: () => void; spawn: (k: TargetKind) => void }) {
    const T = this.targets;
    for (const a of ATHLETES) {
      const t = T[a];
      if (isLive(t) && now - t.born > t.window) {
        t.missedAt = now; // tempo scaduto
        sounds.miss();
      }
      if (t && ((t.hitAt !== null && now - t.hitAt > HIT_FADE_MS) || (t.missedAt !== null && now - t.missedAt > MISS_FADE_MS))) {
        T[a] = null;
      }
    }
    if (isLive(T.hong) || isLive(T.chong)) return;
    if (this.nextRound === 0) {
      const [p0, p1] = level.pause;
      this.nextRound = now + p0 + Math.random() * (p1 - p0);
    } else if (now >= this.nextRound && !T.hong && !T.chong) {
      this.nextRound = 0;
      const kind = pickKind(level);
      for (const a of ATHLETES) {
        T[a] = placeTarget(kind, bodyOf(a), zones[a], s, now, level.window);
        this.stats[a].totali++;
      }
      sounds.spawn(kind);
    }
  }

  /**
   * Il colpo prende il colpitore? Solo la tecnica giusta (polso = pugno, caviglia = calcio), con la forza richiesta,
   * che passa sulla testa della racchetta tra un fotogramma e l'altro.
   */
  match(st: Strike, level: TargetLevel): Target | null {
    const tg = this.live(st.athlete);
    if (!tg || st.kind !== techniqueKindOf(tg.kind) || st.speed < level.minSpeed) return null;
    return segmentHitsCircle(st.px, st.py, st.x, st.y, tg.x, tg.y, tg.r * 1.1) ? tg : null;
  }

  /** Colpitore preso */
  hit(a: Athlete, t: Target) {
    t.hitAt = Date.now();
    this.stats[a].colpiti++;
  }

  draw(ctx: CanvasRenderingContext2D, now: number, s: number) {
    for (const a of ATHLETES) {
      const t = this.targets[a];
      if (t) drawTarget(ctx, t, now, s);
    }
  }
}
