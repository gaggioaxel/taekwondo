// Effetti dei colpi sul canvas: esplosioni a stella e fumetti con il nome della tecnica (o onomatopea).
import type { ComicPopup, ImpactBurst } from '../types';
import type { Athlete } from '../game/config';

export type Fx = { popups: ComicPopup[]; bursts: ImpactBurst[] };

/** Aggiunge esplosione + fumetto nel punto del colpo */
export function spawnImpact(fx: Fx, a: Athlete, x: number, y: number, text: string, sub?: string) {
  fx.popups.push({
    id: Math.random().toString(),
    testo: text,
    sub,
    x,
    y,
    color: a === 'hong' ? '#ffff00' : '#ffff33',
    rot: (Math.random() - 0.5) * 35,
    scale: 1.1 + Math.random() * 0.4,
    timer: sub ? 40 : 24, // fotogrammi (i nomi delle tecniche restano un po' di più)
  });
  fx.bursts.push({
    id: Math.random().toString(),
    x,
    y,
    color: a === 'hong' ? '#ff1e44' : '#0099ff',
    size: 60 + Math.random() * 40,
    timer: 16,
  });
}

/** Disegna e fa avanzare gli effetti di un fotogramma (quelli finiti vengono tolti) */
export function drawFx(ctx: CanvasRenderingContext2D, fx: Fx, s: number) {
  for (const b of fx.bursts) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    const spikes = 8;
    const outer = b.size * s * (1 - b.timer / 20 + 0.3);
    const inner = outer * 0.45;
    for (let k = 0; k < spikes * 2; k++) {
      const r = k % 2 === 0 ? outer : inner;
      const ang = (k * Math.PI) / spikes;
      if (k === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
      else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
    b.timer--;
  }
  fx.bursts = fx.bursts.filter((b) => b.timer > 0);

  for (const p of fx.popups) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.scale(p.scale * s, p.scale * s);
    // i nomi delle tecniche (con riga in Hangul) sono più piccoli delle onomatopee
    const tech = !!p.sub;
    ctx.font = `bold ${tech ? 24 : 38}px "Bangers", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = tech ? 6 : 8;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(p.testo, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.testo, 0, 0);
    if (p.sub) {
      ctx.font = 'bold 14px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText(p.sub, 0, 22);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.sub, 0, 22);
    }
    ctx.restore();
    p.timer--;
  }
  fx.popups = fx.popups.filter((p) => p.timer > 0);
}
