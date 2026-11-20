import React from 'react';
import { Minus, PersonStanding, Play, Plus, Square, Zap } from 'lucide-react';
import { Athlete, COUNTDOWN_MAX, DIFFICOLTA, Difficolta, DURATA_OPTIONS, Tipologia } from '../../game/config';

interface ArenaControlsProps {
  durata: number;
  onDurata: (s: number) => void;
  countdownSec: number;
  onCountdown: (s: number) => void;
  tipologia: Tipologia;
  onTipologia: (t: Tipologia) => void;
  difficolta: Difficolta;
  onDifficolta: (d: Difficolta) => void;
  /** incontro o countdown in corso: impostazioni bloccate */
  busy: boolean;
  inCountdown: boolean;
  swapSides: boolean;
  onSimulate: (a: Athlete) => void;
  /** "Ricalibra" compare solo dopo la prima calibrazione (prima c'è il tasto grande al centro) */
  calibrated: boolean;
  calibrating: boolean;
  onCalibrate: () => void;
  onStart: () => void;
  onStop: () => void;
}

const segBtn = (selected: boolean) =>
  `h-10 min-w-10 px-2.5 rounded comic-box-sm font-comic text-base transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
    selected ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
  }`;

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-xs font-bold text-zinc-400 font-comic uppercase mr-1">{children}</span>
);

/** Barra in basso: impostazioni che si cambiano spesso, simulazione dei colpi, calibrazione, 시작/그만 */
export const ArenaControls: React.FC<ArenaControlsProps> = (p) => (
  <div className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-zinc-900/90 border-2 border-black px-3 py-2 rounded-xl comic-box">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5">
        <Label>Durata</Label>
        {DURATA_OPTIONS.map((sec) => (
          <button key={sec} onClick={() => p.onDurata(sec)} disabled={p.busy} className={segBtn(p.durata === sec)} title={`${sec} secondi`}>
            {sec}s
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Label>Countdown</Label>
        <button onClick={() => p.onCountdown(Math.max(0, p.countdownSec - 1))} disabled={p.busy || p.countdownSec <= 0} className={segBtn(false)} title="-1 secondo">
          <Minus className="w-5 h-5 mx-auto" />
        </button>
        <span className="h-10 min-w-[3.5rem] px-2 rounded comic-box-sm bg-black font-comic text-xl text-yellow-300 flex items-center justify-center tabular-nums">
          {p.countdownSec === 0 ? 'OFF' : `${p.countdownSec}s`}
        </span>
        <button onClick={() => p.onCountdown(Math.min(COUNTDOWN_MAX, p.countdownSec + 1))} disabled={p.busy || p.countdownSec >= COUNTDOWN_MAX} className={segBtn(false)} title="+1 secondo">
          <Plus className="w-5 h-5 mx-auto" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <Label>Tipologia</Label>
        <button onClick={() => p.onTipologia('energia')} disabled={p.busy} className={segBtn(p.tipologia === 'energia')} title="Energia: conta qualsiasi movimento nel riquadro">
          Energia
        </button>
        <button onClick={() => p.onTipologia('corpo')} disabled={p.busy} className={segBtn(p.tipologia === 'corpo')} title="Corpo: un modello segue il corpo e contano solo pugni e calci veloci">
          Corpo
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <Label>Difficoltà</Label>
        {DIFFICOLTA.map((d) => (
          <button key={d.id} onClick={() => p.onDifficolta(d.id)} disabled={p.busy} className={segBtn(p.difficolta === d.id)} title={p.tipologia === 'corpo' ? d.titleCorpo : d.title}>
            {d.label}
          </button>
        ))}
      </div>
    </div>

    <div className="flex items-center gap-2">
      {/* simulazione dei colpi (segue i lati: con lo scambio Chong va a sinistra) */}
      {(['hong', 'chong'] as const).map((a) => (
        <button
          key={a}
          onClick={() => p.onSimulate(a)}
          style={{ order: (a === 'hong') !== p.swapSides ? 1 : 2 }}
          className={`h-10 ${a === 'hong' ? 'bg-red-600/90 hover:bg-red-500' : 'bg-blue-600/90 hover:bg-blue-500'} text-white font-comic text-xs px-3 rounded comic-box-sm flex items-center gap-1 cursor-pointer`}
          title={`Simula colpo bersaglio ${a === 'hong' ? 'Hong' : 'Chong'}`}
        >
          <Zap className="w-4 h-4" />
          <span className="hidden 2xl:inline">COLPISCI</span> {a.toUpperCase()}
        </button>
      ))}

      {p.calibrated && (
        <button
          onClick={p.onCalibrate}
          disabled={p.busy || p.calibrating}
          style={{ order: 3 }}
          className="h-12 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-comic text-lg px-4 rounded-lg comic-box flex items-center gap-2 active:translate-y-0.5 transition cursor-pointer"
          title="Ricalibra gli atleti: campo libero, poi atleti fermi in posizione"
        >
          <PersonStanding className="w-5 h-5" />
          <span>RICALIBRA</span>
        </button>
      )}

      {!p.busy ? (
        <button
          onClick={p.onStart}
          disabled={p.calibrating}
          style={{ order: 3 }}
          className="h-12 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-comic text-xl px-6 rounded-lg comic-box flex items-center gap-2 active:translate-y-0.5 transition shadow-[3px_3px_0px_#000] cursor-pointer"
        >
          <Play className="w-5 h-5 fill-current" />
          <span>시작 (SHIJAK!)</span>
        </button>
      ) : (
        <button
          onClick={p.onStop}
          style={{ order: 3 }}
          className="h-12 bg-rose-600 hover:bg-rose-500 text-white font-comic text-xl px-6 rounded-lg comic-box flex items-center gap-2 active:translate-y-0.5 transition shadow-[3px_3px_0px_#000] cursor-pointer"
        >
          <Square className="w-5 h-5 fill-current" />
          <span>{p.inCountdown ? 'ANNULLA' : '그만 (KEUMAN!)'}</span>
        </button>
      )}
    </div>
  </div>
);
