// Il piccolo altoparlante del micro:bit V2: suoni a onda quadra, come quello vero.
let ctx: AudioContext | null = null;
export function tone(freq: number, ms: number) {
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.setValueAtTime(0.06, t + Math.max(0.02, ms / 1000 - 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch { /* audio non disponibile */ }
}
export function cheer() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 120), i * 110));
}

/** La festa di fine progetto: tre stelle (una nota ciascuna) e poi l'accordo finale. */
export function fanfare() {
  [659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 150), 250 + i * 300));
  setTimeout(() => { tone(523, 420); tone(659, 420); tone(784, 420); tone(1047, 420); }, 1250);
}
