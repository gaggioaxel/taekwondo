import React from 'react';
import { Volume2, VolumeX, RefreshCw, Sliders, FlipHorizontal } from 'lucide-react';

interface ComicHeaderProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onSwitchCamera: () => void;
  mirrorVideo: boolean;
  onToggleMirror: () => void;
  sensitivity: 'low' | 'normal' | 'high';
  onChangeSensitivity: (s: 'low' | 'normal' | 'high') => void;
}

export const ComicHeader: React.FC<ComicHeaderProps> = ({
  isMuted,
  onToggleMute,
  onSwitchCamera,
  mirrorVideo,
  onToggleMirror,
  sensitivity,
  onChangeSensitivity,
}) => {
  return (
    <header className="w-full bg-zinc-950/95 border-b-4 border-black px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-lg z-30">
      {/* Title & Korean Badge */}
      <div className="flex items-center gap-3">
        <div className="bg-yellow-400 text-black font-comic text-xl sm:text-2xl px-3 py-1 comic-box rotate-[-2deg] flex items-center gap-2">
          <span>🥋 태권도</span>
          <span className="tracking-wider">TKD CHALLENGE</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-xs font-bold text-zinc-400 bg-zinc-900 border border-zinc-700 px-2.5 py-1 rounded">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>MOTION ARENA</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Sensitivity Selector */}
        <div className="relative group">
          <button
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 py-1.5 rounded comic-box-sm text-xs font-bold flex items-center gap-1 cursor-pointer"
            title="Sensibilità rilevamento movimento"
          >
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span className="uppercase text-[11px]">{sensitivity}</span>
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-zinc-900 border-2 border-black rounded shadow-xl p-1 z-50 min-w-[110px]">
            {(['low', 'normal', 'high'] as const).map(lvl => (
              <button
                key={lvl}
                onClick={() => onChangeSensitivity(lvl)}
                className={`text-left text-xs px-2 py-1 rounded font-bold capitalize ${
                  sensitivity === lvl ? 'bg-yellow-400 text-black' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {lvl === 'low' ? 'Bassa (160)' : lvl === 'normal' ? 'Normale (110)' : 'Turbo (65)'}
              </button>
            ))}
          </div>
        </div>

        {/* Flip Horizontal / Mirror Video */}
        <button
          onClick={onToggleMirror}
          className={`px-2 py-1.5 rounded comic-box-sm text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
            mirrorVideo ? 'bg-cyan-400 text-black shadow-sm' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
          }`}
          title={mirrorVideo ? 'Specchio orizzontale ATTIVO (Dx/Sx invertiti). Clicca per disattivare.' : 'Specchio orizzontale DISATTIVO. Clicca per invertire Dx/Sx.'}
        >
          <FlipHorizontal className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline text-[11px]">SPECCHIO</span>
        </button>

        {/* Camera Switch */}
        <button
          onClick={onSwitchCamera}
          className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5 rounded comic-box-sm text-xs cursor-pointer"
          title="Cambia Fotocamera (Frontale/Posteriore)"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Audio Mute Toggle */}
        <button
          onClick={onToggleMute}
          className={`p-1.5 rounded comic-box-sm text-xs cursor-pointer ${
            isMuted ? 'bg-zinc-800 text-zinc-500' : 'bg-yellow-400 text-black'
          }`}
          title={isMuted ? 'Riattiva Audio' : 'Disattiva Audio'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
