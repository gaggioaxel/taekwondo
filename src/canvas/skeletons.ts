// Scheletri degli atleti (Corpo), colorati come l'atleta del riquadro; polsi e caviglie in evidenza.
import { SKELETON, STRIKE_POINTS, Track } from '../utils/pose';
import { ATHLETE_COLOR, athleteOfSide } from '../game/config';

export function drawSkeletons(ctx: CanvasRenderingContext2D, tracks: Track[], swap: boolean, mirror: boolean, s: number) {
  if (!tracks.length) return;
  const { width: W, height: H } = ctx.canvas;
  ctx.save();
  ctx.lineCap = 'round';
  for (const t of tracks) {
    const color = ATHLETE_COLOR[athleteOfSide(t.side, swap)];
    const P = (i: number) => ({ x: (mirror ? 1 - t.pts[i].x : t.pts[i].x) * W, y: t.pts[i].y * H, v: t.pts[i].v });
    ctx.strokeStyle = color;
    ctx.lineWidth = 4 * s;
    ctx.globalAlpha = 0.85;
    for (const [a, b] of SKELETON) {
      const pa = P(a);
      const pb = P(b);
      if (pa.v < 0.5 || pb.v < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const id of STRIKE_POINTS) {
      const p = P(id);
      if (p.v < 0.5) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }
  ctx.restore();
}
