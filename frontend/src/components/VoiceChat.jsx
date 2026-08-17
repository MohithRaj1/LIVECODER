import { useEffect, useMemo, useRef, useState } from 'react';

export default function VoiceChat({ socket, users, currentUsername }) {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(0);

  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const remoteAudioRefs = useRef(new Map()); // socketId -> HTMLAudioElement
  const animFrameRef = useRef(null);
  const audioCtxRef = useRef(null);

  const peers = useMemo(
    () => (users || []).filter((u) => u.username !== currentUsername),
    [users, currentUsername]
  );

  async function ensureLocalAudio() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    setupVolumeAnalyzer(stream);
    return stream;
  }

  function setupVolumeAnalyzer(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setVolumeLevel(normalized);
        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch {
      // AudioContext optional / fallback
    }
  }

  function getOrCreatePc(remoteSocketId) {
    const existing = pcsRef.current.get(remoteSocketId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc-ice', { to: remoteSocketId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (!stream) return;
      let audio = remoteAudioRefs.current.get(remoteSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        remoteAudioRefs.current.set(remoteSocketId, audio);
      }
      audio.srcObject = stream;
    };

    pcsRef.current.set(remoteSocketId, pc);
    return pc;
  }

  async function connectToPeer(remoteSocketId) {
    const stream = await ensureLocalAudio();
    const pc = getOrCreatePc(remoteSocketId);

    // Add tracks only once
    const senders = pc.getSenders();
    const hasAudio = senders.some((s) => s.track && s.track.kind === 'audio');
    if (!hasAudio) {
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc-offer', { to: remoteSocketId, sdp: offer });
  }

  async function start() {
    setError('');
    try {
      setEnabled(true);
      await ensureLocalAudio();
      for (const p of peers) {
        await connectToPeer(p.socketId);
      }
    } catch (e) {
      setEnabled(false);
      setError(e.message || 'Failed to start voice');
    }
  }

  function stop() {
    setEnabled(false);
    setMuted(false);
    setError('');
    setVolumeLevel(0);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    for (const pc of pcsRef.current.values()) {
      try {
        pc.close();
      } catch {
        // ignore
      }
    }
    pcsRef.current.clear();
    for (const a of remoteAudioRefs.current.values()) {
      try {
        a.pause();
      } catch {
        // ignore
      }
    }
    remoteAudioRefs.current.clear();
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    for (const t of stream.getAudioTracks()) t.enabled = !next;
    setMuted(next);
  }

  useEffect(() => {
    if (!socket) return;

    const onOffer = async ({ from, sdp }) => {
      try {
        if (!enabled) return;
        const stream = await ensureLocalAudio();
        const pc = getOrCreatePc(from);
        const senders = pc.getSenders();
        const hasAudio = senders.some((s) => s.track && s.track.kind === 'audio');
        if (!hasAudio) {
          for (const track of stream.getTracks()) pc.addTrack(track, stream);
        }
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { to: from, sdp: answer });
      } catch (e) {
        setError(e.message || 'Failed to handle offer');
      }
    };

    const onAnswer = async ({ from, sdp }) => {
      try {
        const pc = pcsRef.current.get(from);
        if (!pc) return;
        await pc.setRemoteDescription(sdp);
      } catch (e) {
        setError(e.message || 'Failed to handle answer');
      }
    };

    const onIce = async ({ from, candidate }) => {
      try {
        const pc = pcsRef.current.get(from);
        if (!pc) return;
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    };

    socket.on('webrtc-offer', onOffer);
    socket.on('webrtc-answer', onAnswer);
    socket.on('webrtc-ice', onIce);

    return () => {
      socket.off('webrtc-offer', onOffer);
      socket.off('webrtc-answer', onAnswer);
      socket.off('webrtc-ice', onIce);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, enabled]);

  // When enabled, try connecting to newly appearing peers
  useEffect(() => {
    if (!enabled) return;
    for (const p of peers) {
      if (!pcsRef.current.has(p.socketId)) {
        connectToPeer(p.socketId).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, peers.map((p) => p.socketId).join('|')]);

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Voice Chat</span>
          {enabled && (
            <span className={`badge ${muted ? 'badge-red' : 'badge-green'}`}>
              {muted ? '🔇 Muted' : '🎙️ Live'}
            </span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!enabled ? (
            <button className="btn btn-primary btn-sm" onClick={() => start().catch(() => {})}>
              Start Voice
            </button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={toggleMute}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={stop}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {error ? <div className="ai__error">⚠️ {error}</div> : null}

      {/* Mic Audio Meter */}
      {enabled && !muted && (
        <div style={{ marginBottom: 14, background: 'rgba(2,6,23,0.4)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: '#a6adc8', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>Microphone Audio Level</span>
            <span>{volumeLevel > 15 ? '🗣️ Speaking' : 'Silent'}</span>
          </div>
          <div style={{ height: 6, width: '100%', background: '#181825', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${volumeLevel}%`,
                background: volumeLevel > 40 ? 'linear-gradient(90deg, #a6e3a1, #f9e2af, #f38ba8)' : '#a6e3a1',
                transition: 'width 0.1s ease',
              }}
            />
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
        {enabled
          ? 'Microphone connected. Audio is encrypted & peer-to-peer.'
          : 'Click "Start Voice" to join the room audio channel.'}
      </div>

      <div style={{ fontSize: 12, opacity: 0.75 }}>
        Participants in room: {peers.length + 1}
      </div>
    </div>
  );
}

