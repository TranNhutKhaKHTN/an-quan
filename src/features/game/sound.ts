let ctx: AudioContext | null = null;

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
  sow: () => tone(420 + Math.random() * 60, 0.07),
  pick: () => tone(300, 0.1),
  capture: () => {
    tone(520, 0.12);
    tone(780, 0.18, 0.09, 0.07);
  },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, i * 0.14, 0.07)),
};
