import React from 'react';
import { X, Trophy, Zap, Clock, RotateCcw, Camera } from 'lucide-react';
import { MatchStats } from '../types';

interface MatchStatsModalProps {
  stats: MatchStats | null;
  onClose: () => void;
  onPlayAgain: () => void;
}

export const MatchStatsModal: React.FC<MatchStatsModalProps> = ({
  stats,
  onClose,
  onPlayAgain,
}) => {
  if (!stats) return null;

  const winnerHong = stats.vincitore === 'hong';
  const winnerChong = stats.vincitore === 'chong';
  const isTie = stats.vincitore === 'tie';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-950 border-4 border-black rounded-2xl comic-box shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* Banner */}
        <div
          className={`px-4 py-4 border-b-4 border-black flex items-center justify-between ${
            winnerHong
              ? 'bg-gradient-to-r from-red-600 to-rose-700'
              : winnerChong
              ? 'bg-gradient-to-r from-blue-600 to-cyan-700'
              : 'bg-gradient-to-r from-amber-500 to-yellow-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-300 fill-yellow-300" />
            <div>
              <div className="text-xs uppercase font-extrabold text-black/80 tracking-wider">
                RISULTATO FINALE GARA
              </div>
              <h2 className="font-comic text-2xl sm:text-3xl text-white tracking-wide">
                {winnerHong
                  ? 'KEUMAN! VINCITORE: HONG (ROSSO)!'
                  : winnerChong
                  ? 'KEUMAN! VINCITORE: CHONG (BLU)!'
                  : "KEUMAN! PARITÀ ASSOLUTA!"}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded bg-black/40 hover:bg-black/60 text-white transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          
          {/* Dual Scoreboard */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* Hong Stats */}
            <div className={`p-4 rounded-xl border-3 comic-box ${winnerHong ? 'bg-red-950/70 border-red-500 comic-box-glow-red' : 'bg-zinc-900 border-zinc-700'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-comic text-lg text-red-400">홍 HONG (ROSSO)</span>
                {winnerHong && <span className="bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">WINNER</span>}
              </div>
              <div className="font-comic text-5xl text-red-500">{stats.puntiHong}</div>
              <div className="mt-2 text-xs text-zinc-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span>Cadenza: <strong>{stats.cadenzaHong}</strong> colpi/sec</span>
              </div>
            </div>

            {/* Chong Stats */}
            <div className={`p-4 rounded-xl border-3 comic-box ${winnerChong ? 'bg-blue-950/70 border-blue-500 comic-box-glow-blue' : 'bg-zinc-900 border-zinc-700'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-comic text-lg text-blue-400">청 CHONG (BLU)</span>
                {winnerChong && <span className="bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">WINNER</span>}
              </div>
              <div className="font-comic text-5xl text-blue-500">{stats.puntiChong}</div>
              <div className="mt-2 text-xs text-zinc-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span>Cadenza: <strong>{stats.cadenzaChong}</strong> colpi/sec</span>
              </div>
            </div>

          </div>

          {/* Match Info Bar */}
          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg flex items-center justify-between text-xs text-zinc-300">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span>Durata Incontro: <strong>{stats.durata} secondi</strong></span>
            </div>
            <div>
              Colpi Totali Registrati: <strong>{stats.puntiHong + stats.puntiChong}</strong>
            </div>
          </div>

          {/* Highlight Snapshots if any */}
          {stats.snapshots && stats.snapshots.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-400">
                <Camera className="w-3.5 h-3.5 text-yellow-400" />
                <span>FERMI IMMAGINE D'IMPATTO (SNAPSHOTS AUTOMATICI):</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {stats.snapshots.map((snap, i) => (
                  <div
                    key={i}
                    className="relative aspect-video rounded border border-zinc-700 overflow-hidden group bg-black"
                  >
                    <img src={snap} alt={`Impact ${i}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] font-mono px-1 rounded text-yellow-400">
                      HIT #{i + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              onClick={onPlayAgain}
              className="bg-yellow-400 hover:bg-yellow-300 text-black font-comic text-base px-6 py-2 rounded comic-box flex items-center gap-2 cursor-pointer transition shadow-[2px_2px_0px_#000]"
            >
              <RotateCcw className="w-4 h-4 stroke-[2.5]" />
              <span>RIGIOCA (CHUNBI!)</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
