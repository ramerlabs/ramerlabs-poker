"use client";

type Sfx =
  | "deal"
  | "chip"
  | "fold"
  | "check"
  | "win"
  | "tick"
  | "urgent"
  | "click"
  | "alert"
  | "timeout";

const STORAGE_KEY = "rl-poker-sfx-muted";

let ctx: AudioContext | null = null;
let muted = false;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export function loadMutePreference() {
  if (typeof window === "undefined") return false;
  muted = localStorage.getItem(STORAGE_KEY) === "1";
  return muted;
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  }
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.08,
  when = 0,
) {
  const audio = getCtx();
  if (!audio || muted) return;

  if (audio.state === "suspended") {
    void audio.resume();
  }

  const t0 = audio.currentTime + when;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst(duration = 0.08, gain = 0.04) {
  const audio = getCtx();
  if (!audio || muted) return;
  if (audio.state === "suspended") void audio.resume();

  const length = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const src = audio.createBufferSource();
  const g = audio.createGain();
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(audio.destination);
  src.start();
}

export function playSfx(name: Sfx) {
  if (muted || typeof window === "undefined") return;

  switch (name) {
    case "deal":
      noiseBurst(0.06, 0.035);
      tone(520, 0.07, "triangle", 0.04);
      break;
    case "chip":
      tone(880, 0.05, "square", 0.03);
      tone(660, 0.08, "triangle", 0.04, 0.04);
      noiseBurst(0.05, 0.03);
      break;
    case "fold":
      tone(220, 0.12, "sawtooth", 0.035);
      tone(160, 0.16, "sine", 0.03, 0.05);
      break;
    case "check":
      tone(440, 0.06, "sine", 0.04);
      break;
    case "win":
      tone(523.25, 0.12, "triangle", 0.06);
      tone(659.25, 0.14, "triangle", 0.06, 0.1);
      tone(783.99, 0.22, "triangle", 0.07, 0.2);
      break;
    case "tick":
      tone(760, 0.03, "square", 0.02);
      break;
    case "urgent":
      tone(920, 0.05, "square", 0.035);
      tone(920, 0.05, "square", 0.03, 0.08);
      break;
    case "click":
      tone(600, 0.03, "square", 0.02);
      break;
    case "alert":
      // Attention chime — rising triple ping
      tone(660, 0.1, "triangle", 0.07);
      tone(880, 0.12, "triangle", 0.08, 0.12);
      tone(1175, 0.16, "triangle", 0.09, 0.26);
      tone(880, 0.08, "sine", 0.04, 0.42);
      break;
    case "timeout":
      tone(300, 0.14, "sawtooth", 0.05);
      tone(180, 0.22, "sine", 0.045, 0.1);
      break;
    default:
      break;
  }
}

/** Unlock audio on first user gesture (browser autoplay policy). */
export function unlockAudio() {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
}
