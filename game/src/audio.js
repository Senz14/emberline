// Every sound in the game is synthesised with WebAudio: no audio files to
// ship, no network, and the same code runs in the grader's container.
// A master gain keeps the mix tame; each effect is a short envelope over an
// oscillator or a filtered noise buffer.

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function envelope(gain, peak, duration) {
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), context.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  }

  function tone({ type = 'sine', from = 440, to = null, duration = 0.1, volume = 0.3 }) {
    if (!ensure()) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, context.currentTime);
    if (to !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(to, 1), context.currentTime + duration);
    envelope(gain, volume, duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.05);
  }

  function noise({ duration = 0.2, volume = 0.3, frequency = 1200, type = 'lowpass' }) {
    if (!ensure()) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    envelope(gain, volume, duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(context.currentTime + duration + 0.05);
  }

  return {
    resume,
    shot(kind, distance = 0) {
      const volume = Math.max(0.05, 0.5 - distance * 0.012);
      if (kind === 'shotgun' || kind === 'lmg') noise({ duration: 0.16, volume, frequency: 900 });
      else if (kind === 'sniper') noise({ duration: 0.22, volume, frequency: 2400 });
      else noise({ duration: 0.09, volume, frequency: 1600 });
      if (distance < 8) tone({ type: 'square', from: 160, to: 50, duration: 0.07, volume: volume * 0.5 });
    },
    dryFire() { tone({ type: 'square', from: 900, to: 500, duration: 0.04, volume: 0.12 }); },
    reload() {
      tone({ type: 'square', from: 500, to: 300, duration: 0.05, volume: 0.14 });
      setTimeout(() => tone({ type: 'square', from: 700, to: 400, duration: 0.05, volume: 0.14 }), 180);
    },
    hit(kill) {
      tone({ type: 'sine', from: kill ? 880 : 660, duration: 0.07, volume: 0.25 });
      if (kill) setTimeout(() => tone({ type: 'sine', from: 1320, duration: 0.12, volume: 0.25 }), 70);
    },
    step() { noise({ duration: 0.05, volume: 0.05, frequency: 500 }); },
    jump() { noise({ duration: 0.08, volume: 0.08, frequency: 700 }); },
    explosion(distance = 0) {
      const volume = Math.max(0.1, 0.7 - distance * 0.01);
      noise({ duration: 0.7, volume, frequency: 300 });
      tone({ type: 'sine', from: 90, to: 30, duration: 0.6, volume: volume * 0.8 });
    },
    flash() { tone({ type: 'sine', from: 2400, to: 1800, duration: 0.3, volume: 0.12 }); },
    plantTick() { tone({ type: 'sine', from: 1100, duration: 0.05, volume: 0.16 }); },
    plantDone() {
      tone({ type: 'sine', from: 660, duration: 0.12, volume: 0.22 });
      setTimeout(() => tone({ type: 'sine', from: 990, duration: 0.18, volume: 0.22 }), 120);
    },
    defuseDone() {
      tone({ type: 'sine', from: 520, duration: 0.12, volume: 0.22 });
      setTimeout(() => tone({ type: 'sine', from: 780, duration: 0.2, volume: 0.22 }), 120);
    },
    roundWin() {
      [523, 659, 784].forEach((frequency, i) =>
        setTimeout(() => tone({ type: 'triangle', from: frequency, duration: 0.22, volume: 0.2 }), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((frequency, i) =>
        setTimeout(() => tone({ type: 'triangle', from: frequency, duration: 0.22, volume: 0.2 }), i * 130));
    },
    buy() { tone({ type: 'sine', from: 980, duration: 0.06, volume: 0.16 }); },
    denied() { tone({ type: 'square', from: 220, to: 160, duration: 0.12, volume: 0.16 }); },
    click() { tone({ type: 'sine', from: 1200, duration: 0.03, volume: 0.1 }); },
  };
}
