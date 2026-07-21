"use client";

import type { ThrowableItem } from "@/lib/table-reactions";

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

const STORAGE_KEY = "rl-poker-table-sound";

let ctx: AudioContext | null = null;
/** Default ON — only flipped off when the player mutes. */
let muted = false;
let unlocked = false;
let unlockPromise: Promise<void> | null = null;
const unlockListeners = new Set<() => void>();

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
  const raw = localStorage.getItem(STORAGE_KEY);
  // Default sound ON. Mute only when preference is explicitly "off".
  muted = raw === "off";
  if (raw == null || raw === "") {
    localStorage.setItem(STORAGE_KEY, "on");
    muted = false;
  }
  // Drop legacy mute flag so everyone starts with sound on once
  try {
    localStorage.removeItem("rl-poker-sfx-muted");
  } catch {
    // ignore
  }
  return muted;
}

export function isMuted() {
  return muted;
}

export function isAudioUnlocked() {
  return unlocked;
}

export function onAudioUnlock(listener: () => void) {
  unlockListeners.add(listener);
  if (unlocked) listener();
  return () => {
    unlockListeners.delete(listener);
  };
}

function notifyUnlocked() {
  for (const listener of unlockListeners) listener();
}

export function setMuted(value: boolean) {
  muted = value;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, value ? "off" : "on");
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

function noiseBurst(duration = 0.08, gain = 0.16, filterHz = 1600) {
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
  filter.frequency.value = filterHz;
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(audio.destination);
  src.start();
}

function playReactionImpactTone(item: ThrowableItem) {
  switch (item) {
    case "ice":
      tone(1200, 0.05, "sine", 0.2);
      tone(880, 0.08, "triangle", 0.22, 0.04);
      noiseBurst(0.12, 0.14, 2400);
      tone(620, 0.14, "sine", 0.16, 0.1);
      break;
    case "water":
      noiseBurst(0.18, 0.22, 900);
      tone(280, 0.12, "sine", 0.18);
      noiseBurst(0.1, 0.12, 600);
      tone(180, 0.16, "triangle", 0.14, 0.08);
      break;
    case "fireworks":
      tone(523, 0.08, "triangle", 0.2);
      tone(784, 0.08, "triangle", 0.22, 0.08);
      tone(1046, 0.1, "triangle", 0.24, 0.16);
      noiseBurst(0.06, 0.18, 2000);
      tone(1318, 0.14, "sine", 0.2, 0.24);
      noiseBurst(0.08, 0.16, 2800);
      tone(1568, 0.18, "triangle", 0.18, 0.34);
      break;
    case "tomato":
      noiseBurst(0.14, 0.24, 700);
      tone(220, 0.1, "sawtooth", 0.2);
      noiseBurst(0.08, 0.16, 500);
      tone(140, 0.18, "sine", 0.14, 0.06);
      break;
    case "beer":
      tone(420, 0.06, "sine", 0.18);
      noiseBurst(0.05, 0.1, 1200);
      tone(560, 0.08, "triangle", 0.16, 0.05);
      tone(680, 0.06, "sine", 0.12, 0.1);
      break;
    case "crown":
      tone(659, 0.12, "triangle", 0.22);
      tone(784, 0.14, "triangle", 0.24, 0.1);
      tone(988, 0.18, "sine", 0.26, 0.22);
      tone(1175, 0.22, "triangle", 0.2, 0.34);
      break;
    case "rocket":
      tone(180, 0.28, "sawtooth", 0.16);
      noiseBurst(0.2, 0.14, 400);
      tone(120, 0.2, "sine", 0.22, 0.22);
      noiseBurst(0.16, 0.28, 1800);
      tone(80, 0.3, "sine", 0.2, 0.32);
      break;
    case "egg":
      noiseBurst(0.04, 0.14, 2200);
      tone(340, 0.08, "square", 0.16);
      noiseBurst(0.12, 0.2, 800);
      tone(200, 0.14, "sine", 0.14, 0.06);
      break;
    case "lightning":
      noiseBurst(0.03, 0.28, 4000);
      tone(1800, 0.04, "square", 0.26);
      tone(900, 0.06, "sawtooth", 0.22, 0.03);
      noiseBurst(0.08, 0.2, 2000);
      tone(440, 0.12, "sine", 0.16, 0.08);
      break;
    case "kiss":
      tone(880, 0.06, "sine", 0.18);
      tone(1046, 0.08, "triangle", 0.16, 0.05);
      tone(740, 0.1, "sine", 0.14, 0.1);
      break;
    case "bomb":
      tone(55, 0.06, "sine", 0.34);
      noiseBurst(0.05, 0.42, 180);
      tone(38, 0.5, "sine", 0.38, 0.06);
      noiseBurst(0.32, 0.36, 260);
      tone(28, 0.55, "sine", 0.3, 0.14);
      noiseBurst(0.22, 0.24, 720);
      break;
    case "haha":
      tone(420, 0.07, "triangle", 0.2);
      tone(520, 0.07, "triangle", 0.22, 0.11);
      tone(440, 0.07, "triangle", 0.2, 0.22);
      tone(580, 0.08, "triangle", 0.22, 0.33);
      tone(500, 0.1, "sine", 0.18, 0.44);
      break;
    default:
      tone(640, 0.08, "triangle", 0.18);
      break;
  }
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
      // Clear “your turn” chime — louder and more noticeable
      tone(523.25, 0.1, "triangle", 0.28);
      tone(659.25, 0.12, "triangle", 0.3, 0.1);
      tone(783.99, 0.16, "triangle", 0.32, 0.22);
      tone(1046.5, 0.22, "sine", 0.34, 0.36);
      tone(880, 0.14, "sine", 0.22, 0.55);
      break;
    case "timeout":
      tone(260, 0.2, "sawtooth", 0.26);
      tone(180, 0.28, "sine", 0.22, 0.12);
      tone(140, 0.3, "sine", 0.16, 0.28);
      break;
    default:
      break;
  }
}

/** Unlock audio on first user gesture (browser autoplay policy). */
export async function unlockAudio() {
  const audio = getCtx();
  if (!audio) return;

  // Always try resume — don't skip when a previous attempt left unlocked=false
  if (!unlockPromise) {
    unlockPromise = (async () => {
      try {
        if (audio.state === "suspended" || audio.state === "interrupted") {
          await audio.resume();
        }
        // Prime destination so later oscillators aren't silent on some browsers
        if (audio.state === "running") {
          const buffer = audio.createBuffer(1, 1, audio.sampleRate);
          const src = audio.createBufferSource();
          const g = audio.createGain();
          g.gain.value = 0.001;
          src.buffer = buffer;
          src.connect(g);
          g.connect(audio.destination);
          src.start(0);
          unlocked = true;
          notifyUnlocked();
        }
      } catch {
        unlocked = false;
      } finally {
        unlockPromise = null;
      }
    })();
  }

  await unlockPromise;

  // If still not running after await, force one more resume attempt
  if (getCtx()?.state !== "running") {
    try {
      await audio.resume();
      if (getCtx()?.state === "running" && !unlocked) {
        unlocked = true;
        notifyUnlocked();
      }
    } catch {
      // next gesture retries
    }
  }
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

/** Unique impact sound per reaction item — plays when the throw lands on target. */
export function playReactionSfx(item: ThrowableItem, delayMs = 0) {
  if (muted || typeof window === "undefined") return;
  window.setTimeout(() => {
    void (async () => {
      await unlockAudio();
      if (muted) return;
      const audio = getCtx();
      if (!audio || audio.state !== "running") return;
      playReactionImpactTone(item);
    })();
  }, Math.max(0, delayMs));
}

/** Attach once: unlock on any pointer/key so SFX work without hunting the mute button. */
export function armAudioUnlock() {
  if (typeof window === "undefined") return () => undefined;
  const unlock = () => {
    void unlockAudio();
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("click", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
}
