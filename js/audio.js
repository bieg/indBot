let audioCtx = null;
let noiseBuffer = null;

export function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  _buildNoiseBuffer();
}

export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function _buildNoiseBuffer() {
  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * 0.3);
  noiseBuffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
}

function playTone({ freq, type, duration, gainPeak, freqEnd = null }) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
  }
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(gainPeak, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function playCrush() {
  if (!audioCtx || !noiseBuffer) return;
  const t = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, t);
  filter.frequency.exponentialRampToValueAtTime(80, t + 0.25);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.7, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(t);
  src.stop(t + 0.3);
}

export function playGestureSound(type) {
  if (!audioCtx) return;
  switch (type) {
    case 'structure':
      playTone({ freq: 440, type: 'sine', duration: 0.3, gainPeak: 0.3 });
      break;
    case 'energy':
      playTone({ freq: 660, freqEnd: 600, type: 'triangle', duration: 0.4, gainPeak: 0.25 });
      break;
    case 'gravity': {
      playTone({ freq: 220, type: 'sine', duration: 0.6, gainPeak: 0.3 });
      playTone({ freq: 221, type: 'sine', duration: 0.6, gainPeak: 0.15 });
      break;
    }
    case 'ghost':
      playTone({ freq: 880, type: 'sine', duration: 0.5, gainPeak: 0.05 });
      break;
    case 'crush':
      playCrush();
      break;
    case 'rotate':
      playTone({ freq: 528, freqEnd: 396, type: 'sine', duration: 0.5, gainPeak: 0.2 });
      break;
    case 'solly-touch':
      // warm resonant chime — two harmonics
      playTone({ freq: 528, type: 'sine', duration: 0.8, gainPeak: 0.25 });
      playTone({ freq: 792, type: 'sine', duration: 0.5, gainPeak: 0.12 });
      break;
  }
}
