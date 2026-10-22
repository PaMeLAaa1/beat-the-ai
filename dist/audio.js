const MASTER_VOLUME = 0.32;
const MAX_VOICES = 18;

export function createAudio() {
  let context = null;
  let master = null;
  let compressor = null;
  let noiseBuffer = null;
  let muted = false;
  let disposed = false;
  let lastHitAt = -Infinity;
  const voices = new Set();

  function releaseVoice(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
  }
  function stopVoice(voice) {
    try { voice.source.stop(); } catch {}
    releaseVoice(voice);
  }
  function stopAll() {
    for (const voice of Array.from(voices)) stopVoice(voice);
  }
  function track(source, nodes) {
    while (voices.size >= MAX_VOICES) stopVoice(voices.values().next().value);
    const voice = { source, nodes };
    voices.add(voice);
    source.onended = () => releaseVoice(voice);
  }
  function unlock() {
    if (disposed || muted) return Promise.resolve();
    try {
      if (!context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return Promise.resolve();
        context = new AudioContextClass({ latencyHint: "interactive" });
        master = context.createGain();
        master.gain.value = MASTER_VOLUME;
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.12;
        master.connect(compressor);
        compressor.connect(context.destination);
        noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.4), context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (context.state === "suspended" || context.state === "interrupted") {
        return Promise.resolve(context.resume()).catch(() => {});
      }
    } catch {
      stopAll();
      try { master?.disconnect(); } catch {}
      try { compressor?.disconnect(); } catch {}
      try { const closing = context?.close(); closing?.catch?.(() => {}); } catch {}
      context = master = compressor = noiseBuffer = null;
    }
    return Promise.resolve();
  }
  function tone(time, frequency, endFrequency, duration, volume, type = "sine") {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), time + duration);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    track(oscillator, [oscillator, envelope]);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }
  function noise(time, duration, volume, cutoff) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(160, time + duration);
    filter.Q.value = 0.6;
    envelope.gain.setValueAtTime(volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    track(source, [source, filter, envelope]);
    source.start(time);
    source.stop(time + duration);
  }
  function play(event) {
    if (disposed || muted || !event || !context || context.state !== "running" || !master || !noiseBuffer) return;
    try {
      const now = context.currentTime;
      if (event.type === "hit") {
        if (now - lastHitAt < 0.035) return;
        lastHitAt = now;
        const intensity = Math.min(1, Math.max(0, Number(event.intensity) || 0));
        const pitch = 125 + intensity * 35 + (Number(event.combo) % 3 || 0) * 9;
        tone(now, pitch, 42, 0.12, 0.28 + intensity * 0.08);
        noise(now, 0.075, 0.11 + intensity * 0.035, 1500 + intensity * 1600);
      } else if (event.type === "phase" && event.phase === "broken") {
        noise(now, 0.28, 0.14, 2200);
        tone(now, 220, 48, 0.24, 0.15, "triangle");
        tone(now + 0.08, 147, 40, 0.21, 0.1, "triangle");
        tone(now + 0.15, 98, 28, 0.22, 0.1);
      } else if (event.type === "phase" && event.phase === "rebooting") {
        [165, 220, 330].forEach((frequency, index) => {
          tone(now + index * 0.08, frequency, frequency, 0.085, 0.075, "triangle");
        });
      }
    } catch {
      // Audio is optional. Browser limitations must not stop the game.
      stopAll();
    }
  }
  function setMuted(enabled) {
    if (disposed) return;
    muted = Boolean(enabled);
    if (muted) stopAll();
    if (context && master) {
      try {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, context.currentTime, 0.01);
      } catch {}
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    stopAll();
    try { master?.disconnect(); } catch {}
    try { compressor?.disconnect(); } catch {}
    try { const closing = context?.close(); closing?.catch?.(() => {}); } catch {}
    context = master = compressor = noiseBuffer = null;
  }
  return { unlock, play, setMuted, dispose };
}
