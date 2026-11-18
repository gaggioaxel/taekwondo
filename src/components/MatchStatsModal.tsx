import React, { useEffect } from 'react';
import { X, Trophy, Zap, Clock, RotateCcw, Camera, Target } from 'lucide-react';
import { MatchStats } from '../types';

interface MatchStatsModalProps {
  stats: MatchStats | null;
  /** true = Hong a destra e Chong a sinistra (come nell'arena) */
  swapSides?: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
}

type Side = 'hong' | 'chong';

const SIDE = {
  hong: {
    label: '홍 HONG',
    sub: 'ROSSO',
    text: 'text-red-500',
    title: 'text-red-400',
    win: 'bg-red-950/70 border-red-500',
    glow: 'shadow-[0_0_40px_rgba(239,68,68,0.45)]',
  },
  chong: {
    label: '청 CHONG',
    sub: 'BLU',
    text: 'text-blue-500',
    title: 'text-blue-400',
    win: 'bg-blue-950/70 border-blue-500',
    glow: 'shadow-[0_0_40px_rgba(59,130,246,0.45)]',
  },
};

// Schermata finale: quasi a tutto schermo, misure in vh così cresce con lo schermo (pensata per il fullscreen)
export const MatchStatsModal: React.FC<MatchStatsModalProps> = ({
  stats,
  swapSides = false,
  onClose,
  onPlayAgain,
}) => {
  useEffect(() => {
    if (!stats) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stats, onClose]);

  if (!stats) return null;

  const winner = stats.vincitore;
  const order: Side[] = swapSides ? ['chong', 'hong'] : ['hong', 'chong'];

  const points = (s: Side) => (s === 'hong' ? stats.puntiHong : stats.puntiChong);
  const cadence = (s: Side) => (s === 'hong' ? stats.cadenzaHong : stats.cadenzaChong);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[1.5vh] bg-black/90 backdrop-blur-sm">
      <div className="stats-pop relative w-[96vw] h-[94vh] bg-zinc-950 border-4 border-black rounded-2xl comic-box shadow-2xl flex flex-col overflow-hidden text-white">

        {/* Banner vincitore */}
        <div
          className={`px-[2vw] py-[2vh] border-b-4 border-black flex items-center justify-between gap-4 ${
            winner === 'hong'
              ? 'bg-gradient-to-r from-red-600 to-rose-700'
              : winner === 'chong'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-700'
              : 'bg-gradient-to-r from-amber-500 to-yellow-600'
          }`}
        >
          <div className="flex items-center gap-[1.5vw] min-w-0">
            <Trophy className="shrink-0 text-yellow-300 fill-yellow-300" style={{ width: '7vh', height: '7vh' }} />
            <div className="min-w-0">
              <div className="uppercase font-extrabold text-black/80 tracking-wider" style={{ fontSize: 'max(12px, 1.8vh)' }}>
                {stats.interrotto ? 'Incontro interrotto · 그만!' : 'Risultato finale · 그만!'}
              </div>
              <h2 className="font-comic text-white tracking-wide leading-none text-stroke-black" style={{ fontSize: 'min(7.5vh, 5.5vw)' }}>
                {winner === 'hong'
                  ? 'VINCE HONG (ROSSO)!'
                  : winner === 'chong'
                  ? 'VINCE CHONG (BLU)!'
                  : 'PARITÀ!'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg bg-black/40 hover:bg-black/60 text-white transition cursor-pointer"
            title="Chiudi (Esc)"
          >
            <X style={{ width: '5vh', height: '5vh' }} />
          </button>
        </div>

        {/* Contenuto */}
        <div className="flex-1 min-h-0 flex flex-col gap-[2vh] p-[2vh_2vw]">

          {/* Punteggi */}
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-[2vw]">
            {order.map((s) => {
              const c = SIDE[s];
              const isWinner = winner === s;
              return (
                <div
                  key={s}
                  className={`relative min-h-0 rounded-2xl border-4 comic-box flex flex-col items-center justify-center gap-[1vh] p-[2vh] ${
                    isWinner ? `${c.win} ${c.glow}` : 'bg-zinc-900 border-zinc-700'
                  }`}
                >
                  {isWinner && (
                    <span className="absolute top-[1.5vh] right-[1.5vh] bg-yellow-400 text-black font-comic px-3 py-1 rounded comic-box-sm" style={{ fontSize: 'max(14px, 2.4vh)' }}>
                      🏆 WINNER
                    </span>
                  )}
                  <div className={`font-comic ${c.title} leading-none`} style={{ fontSize: 'min(6vh, 4.5vw)' }}>
                    {c.label} <span className="opacity-70" style={{ fontSize: '0.6em' }}>({c.sub})</span>
                  </div>
                  <div className={`font-comic ${c.text} leading-none text-stroke-thick`} style={{ fontSize: 'min(28vh, 18vw)' }}>
                    {points(s)}
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-[2vw] gap-y-1 text-zinc-200" style={{ fontSize: 'max(13px, 2.4vh)' }}>
                    <span className="flex items-center gap-2">
                      <Target className="text-yellow-400" style={{ width: '2.6vh', height: '2.6vh' }} />
                      <span><strong>{points(s)}</strong> {points(s) === 1 ? 'colpo' : 'colpi'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Zap className="text-yellow-400" style={{ width: '2.6vh', height: '2.6vh' }} />
                      <span><strong>{cadence(s)}</strong> colpi/sec</span>
                    </span>
                    {stats.tecniche && (
                      <span className="flex items-center gap-[1.2vw]">
                        <span>🦵 <strong>{stats.tecniche[s].calci}</strong> {stats.tecniche[s].calci === 1 ? 'calcio' : 'calci'}</span>
                        <span>👊 <strong>{stats.tecniche[s].pugni}</strong> {stats.tecniche[s].pugni === 1 ? 'pugno' : 'pugni'}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info incontro */}
          <div className="bg-zinc-900 border border-zinc-800 px-[2vw] py-[1.2vh] rounded-lg flex flex-wrap items-center justify-between gap-2 text-zinc-300" style={{ fontSize: 'max(13px, 2.2vh)' }}>
            <div className="flex items-center gap-2">
              <Clock className="text-yellow-400" style={{ width: '2.6vh', height: '2.6vh' }} />
              <span>{stats.interrotto ? 'Durata giocata' : 'Durata incontro'}: <strong>{stats.durata} secondi</strong></span>
            </div>
            <div>
              Colpi totali: <strong>{stats.puntiHong + stats.puntiChong}</strong>
            </div>
          </div>

          {/* Fermi immagine dei colpi più forti */}
          {stats.snapshots && stats.snapshots.length > 0 && (
            <div className="shrink-0 space-y-[1vh]">
              <div className="flex items-center gap-2 font-bold text-zinc-400" style={{ fontSize: 'max(12px, 1.8vh)' }}>
                <Camera className="text-yellow-400" style={{ width: '2.2vh', height: '2.2vh' }} />
                <span>FERMI IMMAGINE D'IMPATTO</span>
              </div>
              <div className="grid grid-cols-4 gap-[1vw]" style={{ height: '16vh' }}>
                {stats.snapshots.map((snap, i) => (
                  <div key={i} className="relative h-full rounded-lg border-2 border-zinc-700 overflow-hidden bg-black">
                    <img src={snap} alt={`Colpo ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 bg-black/80 font-mono px-1.5 rounded text-yellow-400" style={{ fontSize: 'max(11px, 1.6vh)' }}>
                      HIT #{i + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Azioni */}
          <div className="shrink-0 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-comic px-[2vw] rounded-lg comic-box-sm cursor-pointer transition"
              style={{ fontSize: 'max(16px, 2.8vh)', height: '7vh' }}
            >
              CHIUDI
            </button>
            <button
              onClick={onPlayAgain}
              className="bg-yellow-400 hover:bg-yellow-300 text-black font-comic px-[3vw] rounded-lg comic-box flex items-center gap-3 cursor-pointer transition shadow-[3px_3px_0px_#000]"
              style={{ fontSize: 'max(18px, 3.4vh)', height: '7vh' }}
            >
              <RotateCcw className="stroke-[2.5]" style={{ width: '3.4vh', height: '3.4vh' }} />
              <span>RIGIOCA (준비!)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
