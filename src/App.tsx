/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ComicHeader } from './components/ComicHeader';
import { MotionArena } from './components/MotionArena';
import { MatchStatsModal } from './components/MatchStatsModal';
import { soundEngine, VOICE_LANGS, VoiceLang } from './utils/audio';
import { loadPref, savePref } from './utils/prefs';
import { MatchStats } from './types';

export default function App() {
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [mirrorVideo, setMirrorVideo] = useState<boolean>(true); // Left/Right inverted by default
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Referee voice (impostazione "una volta sola": sta nella barra in alto)
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(() => {
    const saved = loadPref<VoiceLang>('voiceLang', VOICE_LANGS[0].id);
    return VOICE_LANGS.some(l => l.id === saved) ? saved : VOICE_LANGS[0].id; // lingua disattivata → coreano
  });
  const [voiceURI, setVoiceURI] = useState<string | null>(() => loadPref<string | null>('voiceURI', null));
  const [voicesVersion, setVoicesVersion] = useState(0);

  useEffect(() => {
    soundEngine.voiceLang = voiceLang;
    soundEngine.voiceURI = voiceURI;
    savePref('voiceLang', voiceLang);
    savePref('voiceURI', voiceURI);
  }, [voiceLang, voiceURI]);

  // Le voci di sistema arrivano in modo asincrono (Chrome): aggiorna la lista quando sono pronte
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const onVoices = () => setVoicesVersion(v => v + 1);
    window.speechSynthesis.addEventListener('voiceschanged', onVoices);
    onVoices();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
  }, []);

  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);

  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    soundEngine.isMuted = nextMute;
    if (nextMute) soundEngine.stopVoice();
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
    <div className="h-[100dvh] overflow-hidden bg-comic-dots flex flex-col text-white selection:bg-yellow-400 selection:text-black">
      <ComicHeader
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onSwitchCamera={handleSwitchCamera}
        mirrorVideo={mirrorVideo}
        onToggleMirror={handleToggleMirror}
        isFullscreen={isFullscreen}
        canFullscreen={canFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        voiceLang={voiceLang}
        onChangeVoiceLang={(l) => { setVoiceLang(l); setVoiceURI(null); }}
        voiceURI={voiceURI}
        onChangeVoiceURI={setVoiceURI}
        voicesVersion={voicesVersion}
      />

      <main className="flex-1 min-h-0 flex flex-col p-2 w-full">
        <MotionArena
          facingMode={facingMode}
          mirrorVideo={mirrorVideo}
          onMatchComplete={(stats) => setMatchStats(stats)}
        />
      </main>

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
