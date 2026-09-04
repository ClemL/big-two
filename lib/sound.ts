/**
 * Sound effects are synthesized with the Web Audio API rather than shipped as
 * files: a handful of oscillators and noise bursts cost nothing to download and
 * keep the deployment a single static bundle.
 *
 * Browsers refuse to start audio before a user gesture, so the context is
 * created lazily and `unlock()` is called from the first interaction.
 */

export type SoundName =
  | "select"
  | "deselect"
  | "play"
  | "pass"
  | "clear"
  | "deal"
  | "win"
  | "lose"
  | "turn";

const STORAGE_KEY = "bigtwo:muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuffer: AudioBuffer | null = null;
/** Set on the first user gesture; before that, browsers will not play anything. */
let unlocked = false;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

function whiteNoise(context: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(context.sampleRate * 0.4);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

function tone(
  freq: number,
  duration: number,
  options: { type?: OscillatorType; gain?: number; slideTo?: number; delay?: number } = {},
): void {
  const context = audio();
  if (!context || !master) return;
  const { type = "triangle", gain = 0.18, slideTo, delay = 0 } = options;
  const start = context.currentTime + delay;
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Filtered noise burst — the "flick" of a card leaving a hand. */
function flick(options: { delay?: number; gain?: number; freq?: number; sweepTo?: number; q?: number } = {}): void {
  const context = audio();
  if (!context || !master) return;
  const { delay = 0, gain = 0.3, freq = 1800, sweepTo, q = 0.9 } = options;
  const start = context.currentTime + delay;
  const src = context.createBufferSource();
  src.buffer = whiteNoise(context);
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, start);
  filter.Q.value = q;
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + 0.22);
  const env = context.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
  src.connect(filter).connect(env).connect(master);
  src.start(start);
  src.stop(start + 0.3);
}

const RECIPES: Record<SoundName, () => void> = {
  select: () => tone(760, 0.06, { type: "square", gain: 0.06 }),
  deselect: () => tone(520, 0.06, { type: "square", gain: 0.05 }),
  play: () => flick({ freq: 2000, gain: 0.32 }),
  pass: () => tone(190, 0.2, { type: "sine", gain: 0.14, slideTo: 120 }),
  clear: () => flick({ freq: 500, sweepTo: 2600, gain: 0.22, q: 1.6 }),
  deal: () => {
    for (let i = 0; i < 6; i++) flick({ delay: i * 0.07, gain: 0.16, freq: 1500 + i * 120 });
  },
  win: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, 0.22, { delay: i * 0.09, gain: 0.16 }),
    );
  },
  // Distinct from every other cue: this one has to cut through a room.
  turn: () => {
    tone(660, 0.14, { gain: 0.2 });
    tone(990, 0.18, { delay: 0.11, gain: 0.18 });
  },
  lose: () => {
    [440, 392, 329.63, 261.63].forEach((f, i) => tone(f, 0.24, { delay: i * 0.1, gain: 0.13 }));
  },
};

export function play(name: SoundName): void {
  if (muted || !unlocked) return;
  const context = audio();
  if (!context) return;
  if (context.state === "running") {
    RECIPES[name]();
    return;
  }
  // The gesture that unlocked audio also triggers a sound, and resuming is
  // asynchronous — play once the context is actually running rather than
  // dropping that first effect.
  void context.resume().then(() => RECIPES[name]());
}

/** Resume audio after a user gesture. Safe to call repeatedly. */
export function unlock(): void {
  unlocked = true;
  const context = audio();
  if (context && context.state === "suspended") void context.resume();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Private browsing modes can refuse storage; the toggle still works for the session.
    }
  }
}

/** Read the stored preference. Call from an effect so SSR and hydration agree. */
export function loadMutePreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}
