// La manina che mostra il gesto: compare se il bambino resta fermo e non sa cosa fare.
// Non tocca niente davvero: fa solo vedere dove toccare o cosa trascinare.
import { icon } from './icons';

export interface HandPoint { x: number; y: number }

export class HandHint {
  private el: HTMLElement;
  private token = 0;
  active = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'hand-hint';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `<span class="hand-ring"></span>${icon('ph:hand-pointing-fill', 54)}`;
    this.el.hidden = true;
    document.body.appendChild(this.el);
  }

  /** Un punto: tocca lì. Due punti: tocca il primo e poi il secondo; con `drag` tiene premuto e trascina. */
  async show(pts: HandPoint[], drag = false) {
    if (!pts.length) return;
    const my = ++this.token;
    const alive = () => my === this.token;
    this.active = true;
    this.el.hidden = false;
    const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const at = (p: HandPoint, s = 1) => `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) scale(${s})`;
    const run = (frames: Keyframe[], ms: number) => this.el.animate(frames, { duration: still ? 1 : ms, easing: 'ease-in-out', fill: 'forwards' }).finished.catch(() => undefined);
    const ring = () => { const r = this.el.querySelector('.hand-ring') as HTMLElement; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); };
    const tap = async (p: HandPoint) => { ring(); await run([{ transform: at(p) }, { transform: at(p, 0.8) }, { transform: at(p) }], 520); };
    const wait = (ms: number) => new Promise(r => setTimeout(r, still ? ms / 2 : ms));
    try {
      for (let round = 0; round < 2 && alive(); round++) {
        const a = pts[0], b = pts[1];
        await run([{ transform: at(a), opacity: 0 }, { transform: at(a), opacity: 1 }], 250);
        if (!alive()) break;
        if (!b) { await tap(a); if (alive()) await wait(180); if (alive()) await tap(a); }
        else if (drag) {
          ring();
          await run([{ transform: at(a) }, { transform: at(a, 0.8) }], 260);
          if (alive()) await run([{ transform: at(a, 0.8) }, { transform: at(b, 0.8) }], 1000);
          if (alive()) await run([{ transform: at(b, 0.8) }, { transform: at(b) }], 220);
        } else {
          await tap(a);
          if (alive()) await run([{ transform: at(a) }, { transform: at(b) }], 800);
          if (alive()) await tap(b);
        }
        if (alive()) await wait(350);
        if (alive()) await run([{ opacity: 1 }, { opacity: 0 }], 220);
      }
    } finally {
      if (alive()) this.hide();
    }
  }

  hide() {
    this.token++;
    this.active = false;
    this.el.getAnimations().forEach(a => a.cancel());
    this.el.hidden = true;
  }

  dispose() { this.hide(); this.el.remove(); }
}
