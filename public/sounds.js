// Subtle sound effects, synthesized entirely with the Web Audio API — no audio files to
// download, host, or license. Respects a mute toggle persisted in localStorage (default on).
const MUTE_KEY = 'triviaconquer:muted';

let ctx = null;

function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() {
  return localStorage.getItem(MUTE_KEY) === 'true';
}

export function setMuted(muted) {
  localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false');
}

export function toggleMuted() {
  const next = !isMuted();
  setMuted(next);
  return next;
}

function tone({ freq, duration, type = 'sine', gain = 0.1, delay = 0, freqEnd = null }) {
  if (isMuted()) return;
  const audio = getContext();
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gainNode = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
  gainNode.gain.setValueAtTime(0, t0);
  gainNode.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gainNode).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playCorrect() {
  tone({ freq: 660, duration: 0.12, type: 'sine', gain: 0.1 });
  tone({ freq: 880, duration: 0.16, type: 'sine', gain: 0.1, delay: 0.08 });
}

export function playWrong() {
  tone({ freq: 220, duration: 0.22, type: 'sine', freqEnd: 140, gain: 0.09 });
}

// A short ascending arpeggio for streak-tier celebrations — one extra note every couple of
// tiers, capped so it never turns into a novelty jingle.
export function playTierUp(tierIndex) {
  const notes = [523.25, 659.25, 783.99, 987.77, 1174.66]; // C5 E5 G5 B5 D6
  const noteCount = Math.min(2 + Math.floor(tierIndex / 2), notes.length);
  for (let i = 0; i < noteCount; i++) {
    tone({ freq: notes[i], duration: 0.14, type: 'triangle', gain: 0.09, delay: i * 0.07 });
  }
}

// Filtered noise burst for the Zeus tier — reserved for the biggest moment.
export function playThunder() {
  if (isMuted()) return;
  const audio = getContext();
  const t0 = audio.currentTime;
  const bufferSize = Math.floor(audio.sampleRate * 0.5);
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) ** 2;
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(400, t0);
  const gainNode = audio.createGain();
  gainNode.gain.setValueAtTime(0.25, t0);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
  noise.connect(filter).connect(gainNode).connect(audio.destination);
  noise.start(t0);
}
