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
let unlocked = false;
let unlockPromise: Promise<void> | null = null;

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
  if (!value) void unlockAudio();
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.28,
  when = 0,
) {
  const audio = getCtx();
  if (!audio || muted || audio.state !== "running") return;

  const t0 = audio.currentTime + when;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function noiseBurst(duration = 0.08, gain = 0.16) {
  const audio = getCtx();
  if (!audio || muted || audio.state !== "running") return;

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
  filter.frequency.value = 1600;
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(audio.destination);
  src.start();
}

function playTone(name: Sfx) {
  switch (name) {
    case "deal":
      noiseBurst(0.08, 0.18);
      tone(540, 0.09, "triangle", 0.22);
      break;
    case "chip":
      tone(980, 0.06, "square", 0.16);
      tone(720, 0.1, "triangle", 0.2, 0.04);
      noiseBurst(0.06, 0.12);
      break;
    case "fold":
      tone(240, 0.16, "sawtooth", 0.2);
      tone(170, 0.2, "sine", 0.16, 0.05);
      break;
    case "check":
      tone(480, 0.08, "sine", 0.22);
      tone(620, 0.06, "triangle", 0.14, 0.05);
      break;
    case "win":
      tone(523.25, 0.16, "triangle", 0.24);
      tone(659.25, 0.18, "triangle", 0.24, 0.11);
      tone(783.99, 0.28, "triangle", 0.26, 0.22);
      tone(1046.5, 0.22, "sine", 0.16, 0.4);
      break;
    case "tick":
      tone(800, 0.04, "square", 0.12);
      break;
    case "urgent":
      tone(980, 0.07, "square", 0.2);
      tone(980, 0.07, "square", 0.16, 0.08);
      break;
    case "click":
      tone(640, 0.05, "square", 0.16);
      break;
    case "alert":
      tone(660, 0.12, "triangle", 0.24);
      tone(880, 0.14, "triangle", 0.26, 0.12);
      tone(1175, 0.2, "triangle", 0.28, 0.26);
      tone(880, 0.1, "sine", 0.16, 0.42);
      break;
    case "timeout":
      tone(300, 0.18, "sawtooth", 0.22);
      tone(180, 0.26, "sine", 0.18, 0.1);
      break;
    default:
      break;
  }
}

/** Unlock audio on first user gesture (browser autoplay policy). */
export async function unlockAudio() {
  const audio = getCtx();
  if (!audio) return;

  if (!unlockPromise) {
    unlockPromise = (async () => {
      try {
        if (audio.state === "suspended") {
          await audio.resume();
        }
        if (!unlocked && audio.state === "running") {
          const buffer = audio.createBuffer(1, 1, audio.sampleRate);
          const src = audio.createBufferSource();
          src.buffer = buffer;
          src.connect(audio.destination);
          src.start(0);
          unlocked = true;
        }
      } catch {
        // Ignore — next gesture will retry
      } finally {
        unlockPromise = null;
      }
    })();
  }

  await unlockPromise;
}

export function playSfx(name: Sfx) {
  if (muted || typeof window === "undefined") return;
  void (async () => {
    await unlockAudio();
    if (muted) return;
    const audio = getCtx();
    if (!audio || audio.state !== "running") return;
    playTone(name);
  })();
}

/** Attach once: unlock on any pointer/key so SFX work without hunting the mute button. */
export function armAudioUnlock() {
  if (typeof window === "undefined") return () => undefined;
  const unlock = () => {
    void unlockAudio();
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
}
