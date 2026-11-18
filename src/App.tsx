/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ComicHeader } from './components/ComicHeader';
import { MotionArena } from './components/MotionArena';
import { MatchStatsModal } from './components/MatchStatsModal';
import { soundEngine } from './utils/audio';
import { MatchStats } from './types';

export default function App() {
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [sensitivity, setSensitivity] = useState<'low' | 'normal' | 'high'>('normal');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [mirrorVideo, setMirrorVideo] = useState<boolean>(true); // Left/Right inverted by default

  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    soundEngine.isMuted = nextMute;
  };

  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    soundEngine.playBeep(520, 'sine', 0.1);
  };

  const handleToggleMirror = () => {
    setMirrorVideo((prev) => !prev);
    soundEngine.playBeep(640, 'triangle', 0.1);
  };

  return (
    <div className="min-h-screen bg-comic-dots flex flex-col justify-between text-white selection:bg-yellow-400 selection:text-black">
      
      {/* Top Bar */}
      <ComicHeader
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onSwitchCamera={handleSwitchCamera}
        mirrorVideo={mirrorVideo}
        onToggleMirror={handleToggleMirror}
        sensitivity={sensitivity}
        onChangeSensitivity={setSensitivity}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 w-full">
        <MotionArena
          sensitivity={sensitivity}
          facingMode={facingMode}
          mirrorVideo={mirrorVideo}
          onToggleMirror={handleToggleMirror}
          onMatchComplete={(stats) => setMatchStats(stats)}
        />

        {/* Quick Instructions & Comic Badges strip */}
        <div className="w-full max-w-5xl mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-900/80 border border-black p-2 rounded comic-box-sm flex items-center justify-center gap-2">
            <span className="text-red-500 font-comic text-base">홍 HONG</span>
            <span className="text-[11px] text-zinc-400">Bersaglio Sinistro</span>
          </div>
          <div className="bg-zinc-900/80 border border-black p-2 rounded comic-box-sm flex items-center justify-center gap-2">
            <span className="text-blue-500 font-comic text-base">청 CHONG</span>
            <span className="text-[11px] text-zinc-400">Bersaglio Destro</span>
          </div>
          <div className="bg-zinc-900/80 border border-black p-2 rounded comic-box-sm flex items-center justify-center gap-2">
            <span className="text-yellow-400 font-comic text-base">KAPOW!</span>
            <span className="text-[11px] text-zinc-400">Effetti Audio Comic</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-black/90 border-t-2 border-black py-2 px-4 text-center text-[11px] text-zinc-500 font-mono">
        Taekwondo Comic Challenge • Motion Tracking &amp; Web Audio Arcade
      </footer>

      {/* Match Stats Modal */}
      <MatchStatsModal
        stats={matchStats}
        onClose={() => setMatchStats(null)}
        onPlayAgain={() => {
          setMatchStats(null);
          soundEngine.playChunbi();
        }}
      />

    </div>
  );
}
