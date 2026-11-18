// Tiny WebAudio synth for game SFX — no assets, autoplay-safe (created on first user gesture).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem("otstupy-muted") === "1";
} catch {
  muted = false;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.2, delay = 0) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  unlock() {
    ensureCtx();
  },
  click() {
    tone(620, 0.07, "triangle", 0.15);
  },
  place() {
    tone(440, 0.09, "sine", 0.2);
    tone(660, 0.08, "sine", 0.12, 0.05);
  },
  correct() {
    tone(523, 0.12, "sine", 0.2);
    tone(659, 0.12, "sine", 0.2, 0.09);
    tone(784, 0.22, "sine", 0.22, 0.18);
  },
  wrong() {
    tone(196, 0.16, "sawtooth", 0.1);
    tone(147, 0.22, "sawtooth", 0.09, 0.12);
  },
  star(i: number) {
    tone(700 + i * 180, 0.18, "triangle", 0.2);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, "triangle", 0.2, i * 0.13));
  },
};

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("otstupy-muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}
