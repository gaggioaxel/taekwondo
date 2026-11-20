/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ComicHeader, PAD_GAPS } from './components/ComicHeader';
import { MotionArena } from './components/MotionArena';
import { MatchStatsModal } from './components/MatchStatsModal';
import { soundEngine, VOICE_LANGS, VoiceLang, SignalMode, BARO_OPTIONS } from './utils/audio';
import { loadPref, savePref } from './utils/prefs';
import { MatchStats } from './types';

export default function App() {
  // Tutte le impostazioni sono salvate nel browser: all'apertura l'app riparte com'era
  const [isMuted, setIsMuted] = useState<boolean>(() => loadPref('muted', false));
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => loadPref('facingMode', 'environment'));
  const [mirrorVideo, setMirrorVideo] = useState<boolean>(() => loadPref('mirror', true)); // Dx/Sx invertiti di default
  const [cameraOn, setCameraOn] = useState<boolean>(() => loadPref('camera', true));
  useEffect(() => {
    soundEngine.isMuted = isMuted;
    savePref('muted', isMuted);
  }, [isMuted]);
  useEffect(() => savePref('facingMode', facingMode), [facingMode]);
  useEffect(() => savePref('mirror', mirrorVideo), [mirrorVideo]);
  useEffect(() => savePref('camera', cameraOn), [cameraOn]);
  const [swapSides, setSwapSides] = useState<boolean>(() => loadPref('swapSides', false));
  useEffect(() => savePref('swapSides', swapSides), [swapSides]);
  const [padGap, setPadGap] = useState<number>(() => {
    const v = loadPref<number>('padGap', PAD_GAPS[0].value);
    return PAD_GAPS.some(g => g.value === v) ? v : PAD_GAPS[0].value;
  });
  useEffect(() => savePref('padGap', padGap), [padGap]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Referee voice (impostazione "una volta sola": sta nella barra in alto)
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(() => {
    const saved = loadPref<VoiceLang>('voiceLang', VOICE_LANGS[0].id);
    return VOICE_LANGS.some(l => l.id === saved) ? saved : VOICE_LANGS[0].id; // lingua disattivata → coreano
  });
  const [voiceURI, setVoiceURI] = useState<string | null>(() => loadPref<string | null>('voiceURI', null));
  const [voicesVersion, setVoicesVersion] = useState(0);
  // Voce dell'arbitro oppure solo segnali acustici (ping del countdown, paang di via/fine)
  const [signalMode, setSignalMode] = useState<SignalMode>(() => loadPref<SignalMode>('signalMode', 'voce') === 'ping' ? 'ping' : 'voce');
  useEffect(() => {
    soundEngine.signalMode = signalMode;
    savePref('signalMode', signalMode);
  }, [signalMode]);
  // 바로 (Ba-ro): secondi dopo 그만, 0 = spento. Chi aveva solo il vecchio interruttore spento riparte da OFF.
  const [baroSec, setBaroSec] = useState<number>(() => {
    const v = loadPref<number | null>('baroSec', null);
    if (v !== null && BARO_OPTIONS.includes(v)) return v;
    return loadPref('baro', true) ? 5 : 0;
  });
  useEffect(() => {
    soundEngine.baroEnabled = baroSec > 0;
    soundEngine.baroDelayMs = baroSec * 1000;
    savePref('baroSec', baroSec);
  }, [baroSec]);

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
        cameraOn={cameraOn}
        onToggleCamera={() => { setCameraOn(v => !v); soundEngine.playBeep(600, 'triangle', 0.1); }}
        onSwitchCamera={handleSwitchCamera}
        mirrorVideo={mirrorVideo}
        onToggleMirror={handleToggleMirror}
        swapSides={swapSides}
        onToggleSwap={() => { setSwapSides(v => !v); soundEngine.playBeep(560, 'triangle', 0.1); }}
        isFullscreen={isFullscreen}
        canFullscreen={canFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        voiceLang={voiceLang}
        onChangeVoiceLang={(l) => { setVoiceLang(l); setVoiceURI(null); }}
        voiceURI={voiceURI}
        onChangeVoiceURI={setVoiceURI}
        voicesVersion={voicesVersion}
        baroSec={baroSec}
        onChangeBaroSec={setBaroSec}
        signalMode={signalMode}
        onChangeSignalMode={(m) => { soundEngine.stopVoice(); setSignalMode(m); }}
        facingMode={facingMode}
        padGap={padGap}
        onChangePadGap={setPadGap}
      />

      <main className="flex-1 min-h-0 flex flex-col p-2 w-full">
        <MotionArena
          facingMode={facingMode}
          cameraEnabled={cameraOn}
          mirrorVideo={mirrorVideo}
          swapSides={swapSides}
          padGap={padGap}
          onMatchComplete={(stats) => setMatchStats(stats)}
        />
      </main>

      <MatchStatsModal
        stats={matchStats}
        swapSides={swapSides}
        onClose={() => setMatchStats(null)}
        onPlayAgain={() => {
          setMatchStats(null);
          soundEngine.playChunbi();
        }}
      />
    </div>
  );
}
