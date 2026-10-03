import { useSound } from "@/features/audio/soundStore";

let ctx: AudioContext | null = null;
let selectBuffer: AudioBuffer | null = null;
let selectLoading: Promise<void> | null = null;
let selectSource: AudioBufferSourceNode | null = null;

/** Level of the recorded select sound (the file peaks at full scale). */
const SELECT_GAIN = 0.55;
export const SELECT_SOUND_URL = "/sfx/select.wav";

function context(): AudioContext | null {
  try {
    // "interactive" asks the browser for the smallest output buffer, i.e. the least delay
    return (ctx ??= new AudioContext({ latencyHint: "interactive" }));
  } catch {
    return null;
  }
}

/** Fetch and decode the select sound ahead of time so the first tap is not late. Safe to call often. */
export function preloadSounds(): Promise<void> {
  selectLoading ??= (async () => {
    const c = context();
    if (!c) return;
    try {
      const res = await fetch(SELECT_SOUND_URL);
      selectBuffer = await c.decodeAudioData(await res.arrayBuffer());
    } catch {
      selectLoading = null; // allow a retry later
    }
  })();
  return selectLoading;
}

/** Wake the audio output on the first tap so the first select sound is not delayed by a cold start. */
export function unlockSounds() {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

function playSelect() {
  const c = context();
  if (!c || !selectBuffer) return void preloadSounds();
  if (c.state === "suspended") void c.resume().catch(() => {});
  try {
    selectSource?.stop(); // quick successive taps replace the sound instead of piling up
  } catch {
    /* already ended */
  }
  const src = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = SELECT_GAIN;
  src.buffer = selectBuffer;
  src.connect(gain).connect(c.destination);
  src.start();
  selectSource = src;
}

function tone(freq: number, duration: number, delay = 0, volume = 0.05) {
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + delay;
    osc.frequency.value = freq;
    osc.type = "triangle";
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    /* audio unavailable: ignore */
  }
}

export const sfx = {
  /** Choosing a game mode (not a house). Obeys the sound-effects switch. */
  select: () => {
    if (useSound.getState().on) playSelect();
  },
  sow: () => tone(420 + Math.random() * 60, 0.07),
  pick: () => tone(300, 0.1),
  capture: () => {
    tone(520, 0.12);
    tone(780, 0.18, 0.09, 0.07);
  },
  win: () =>
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, i * 0.14, 0.07)),
};
