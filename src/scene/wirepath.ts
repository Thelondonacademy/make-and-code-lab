// Il percorso di un cavo sul banco. Un cavo vero non sta in aria come un arcobaleno: esce dalla pinza,
// scende, si appoggia sul banco e passa SOPRA i pezzi che incontra (non ci passa attraverso).

export type P3 = [number, number, number];
/** L'ingombro di un pezzo visto dall'alto, e quanto è alto. */
export interface Obstacle { minX: number; maxX: number; minZ: number; maxZ: number; top: number }

const FLOOR = 0.22; // il cavo appoggiato sul banco
const N = 18;

/** `seed` sposta un po' di lato ogni cavo, così due cavi vicini non si sovrappongono. */
export function wirePath(a: P3, b: P3, obstacles: Obstacle[] = [], seed = 0): P3[] {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const flat = Math.hypot(dx, dz);
  // di lato: perpendicolare al cavo
  const nx = flat > 1e-6 ? -dz / flat : 0, nz = flat > 1e-6 ? dx / flat : 0;
  const side = flat > 3 ? (((seed % 5) + 5) % 5 - 2) * Math.min(0.5, flat * 0.035) : 0;
  const ya = a[1] + 0.3, yb = b[1] + 0.3;
  const pts: P3[] = [];
  const base: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, bow = Math.sin(Math.PI * t);
    const x = a[0] + dx * t + nx * side * bow, z = a[2] + dz * t + nz * side * bow;
    // vicino alle pinze il cavo è ancora alto, poi scende piano: più la pinza è in alto, più lunga è la discesa
    const fall = (y0: number, d: number) => FLOOR + (y0 + 0.7 - FLOOR) * Math.exp(-d / (1.3 + Math.max(0, y0) * 0.55));
    let y = Math.max(fall(ya, flat * t), fall(yb, flat * (1 - t)));
    // un cavo corto non fa in tempo ad appoggiarsi: resta un archetto
    if (flat < 5) y = Math.max(y, Math.max(ya, yb) + 0.5 * bow);
    base.push(y);
    pts.push([x, y, z]);
  }
  // sopra i pezzi: dove il cavo passa su un pezzo, sale fin sopra
  const need = pts.map(([x, , z]) => {
    let top = 0;
    for (const o of obstacles) if (x > o.minX - 0.35 && x < o.maxX + 0.35 && z > o.minZ - 0.35 && z < o.maxZ + 0.35) top = Math.max(top, o.top + 0.3);
    return top;
  });
  for (let i = 1; i < N; i++) {
    // anche un po' prima e un po' dopo, così non taglia lo spigolo
    const near = Math.max(need[i], need[i - 1] * 0.7, need[i + 1] * 0.7, (need[i - 2] ?? 0) * 0.3, (need[i + 2] ?? 0) * 0.3);
    pts[i][1] = Math.max(base[i], near);
  }
  pts[0][1] = ya; pts[N][1] = yb;
  return pts;
}
