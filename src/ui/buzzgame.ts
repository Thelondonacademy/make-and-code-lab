// Il gioco "Non toccare il filo" nel simulatore: porti l'anello lungo il filo con il dito o il mouse.
// Se l'anello tocca il filo, il circuito pin 0 – GND si chiude (come nel mondo vero).
import { icon } from './icons';

export interface BuzzCallbacks {
  onTouch(on: boolean): void;
  onFinish(touches: number): void;
  leds(): ArrayLike<number>;
}

export class BuzzGame {
  root: HTMLElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private path: { x: number; y: number }[] = [];
  private ring = { x: 0, y: 0 };
  private grabbing = false;
  private touching = false;
  touches = 0;
  finished = false;
  private raf = 0;
  private W = 0; private H = 0;
  private R = 30;   // raggio dell'anello
  private TOL = 20; // quanto ti puoi allontanare dal filo prima di toccarlo

  constructor(private cb: BuzzCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'buzz';
    this.root.innerHTML = `<div class="buzz-card" role="dialog" aria-label="Gioco del filo">
      <div class="buzz-head">
        <div class="buzz-leds" aria-hidden="true">${'<i></i>'.repeat(25)}</div>
        <div class="buzz-txt"><b>Non toccare il filo!</b><span>Trascina l'anello fino alla bandierina.</span></div>
        <div class="buzz-count" aria-live="polite">Tocchi: <b>0</b></div>
        <button class="icon-btn buzz-x" aria-label="Chiudi il gioco">${icon('ph:x-bold', 22)}</button>
      </div>
      <canvas class="buzz-cv"></canvas>
    </div>`;
    this.cv = this.root.querySelector('canvas')!;
    this.ctx = this.cv.getContext('2d')!;
    this.cv.addEventListener('pointerdown', this.down);
    this.cv.addEventListener('pointermove', this.move);
    this.cv.addEventListener('pointerup', this.up);
    this.cv.addEventListener('pointercancel', this.up);
  }

  open(host: HTMLElement) {
    host.appendChild(this.root);
    this.reset();
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    cancelAnimationFrame(this.raf);
    if (this.touching) { this.touching = false; this.cb.onTouch(false); }
    this.root.remove();
  }

  reset() {
    const box = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(280, box.width); this.H = Math.max(180, box.height);
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.R = Math.max(20, Math.min(32, this.H * 0.09));
    this.TOL = this.R * 0.62;
    this.path = [];
    const x0 = 50, x1 = this.W - 50, mid = this.H / 2, A = this.H * 0.28;
    for (let i = 0; i <= 240; i++) {
      const t = i / 240;
      this.path.push({ x: x0 + (x1 - x0) * t, y: mid - A * Math.sin(Math.PI * 2 * t) * 0.8 - A * 0.35 * Math.sin(Math.PI * 5 * t) });
    }
    this.ring = { ...this.path[0] };
    this.touches = 0; this.finished = false; this.grabbing = false;
    this.setTouch(false);
    this.root.querySelector('.buzz-count b')!.textContent = '0';
  }

  /** Il percorso in coordinate dello schermo (per i test). */
  clientPath(step = 12) {
    const b = this.cv.getBoundingClientRect();
    return this.path.filter((_, i) => i % step === 0 || i === this.path.length - 1).map(p => ({ x: b.left + p.x * (b.width / this.W), y: b.top + p.y * (b.height / this.H) }));
  }

  private local(e: PointerEvent) {
    const b = this.cv.getBoundingClientRect();
    return { x: (e.clientX - b.left) * (this.W / b.width), y: (e.clientY - b.top) * (this.H / b.height) };
  }

  private down = (e: PointerEvent) => {
    const p = this.local(e);
    if (Math.hypot(p.x - this.ring.x, p.y - this.ring.y) > this.R * 1.8) return;
    if (this.finished) this.reset();
    this.grabbing = true;
    this.cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private move = (e: PointerEvent) => {
    if (!this.grabbing) return;
    const p = this.local(e);
    // l'anello non può saltare avanti: segue il dito, ma resta infilato sul filo
    const far = this.path.reduce((m, q, i) => (q.x <= p.x + 1 ? i : m), 0);
    const end = this.path[this.path.length - 1];
    let ring = { x: Math.max(this.path[0].x, Math.min(end.x, p.x)), y: p.y };
    const { d, q } = this.nearest(ring);
    // l'anello è infilato sul filo: non si può allontanare più del suo raggio (il filo tocca il bordo)
    const max = this.R - 5;
    if (d > max) ring = { x: q.x + ((ring.x - q.x) * max) / d, y: q.y + ((ring.y - q.y) * max) / d };
    this.ring = ring;
    this.setTouch(d > this.TOL);
    if (!this.touching && far >= this.path.length - 2) this.win();
  };

  private up = () => { this.grabbing = false; };

  private nearest(p: { x: number; y: number }) {
    let d = Infinity, q = this.path[0];
    for (const c of this.path) { const k = Math.hypot(c.x - p.x, c.y - p.y); if (k < d) { d = k; q = c; } }
    return { d, q };
  }

  private setTouch(on: boolean) {
    if (on === this.touching) return;
    this.touching = on;
    if (on) { this.touches++; this.root.querySelector('.buzz-count b')!.textContent = String(this.touches); }
    this.root.classList.toggle('buzz-hit', on);
    this.cb.onTouch(on);
  }

  private win() {
    if (this.finished) return;
    this.finished = true;
    this.grabbing = false;
    this.cb.onFinish(this.touches);
  }

  private draw() {
    const c = this.ctx, W = this.W, H = this.H;
    c.clearRect(0, 0, W, H);
    // base di cartone e plastilina
    c.fillStyle = '#F3E3C6'; c.fillRect(0, 0, W, H);
    const a = this.path[0], z = this.path[this.path.length - 1];
    c.fillStyle = '#4FB06A';
    for (const p of [a, z]) { c.beginPath(); c.ellipse(p.x, p.y + 10, 22, 14, 0, 0, Math.PI * 2); c.fill(); }
    // il filo
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#8C939D'; c.lineWidth = 7;
    c.beginPath(); this.path.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
    c.strokeStyle = '#D6DAE0'; c.lineWidth = 2;
    c.beginPath(); this.path.forEach((p, i) => (i ? c.lineTo(p.x, p.y - 1.5) : c.moveTo(p.x, p.y - 1.5))); c.stroke();
    // bandierina dell'arrivo
    c.strokeStyle = '#3B3644'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(z.x + 18, z.y - 4); c.lineTo(z.x + 18, z.y - 54); c.stroke();
    c.fillStyle = this.finished ? '#2E8B57' : '#F6520A';
    c.beginPath(); c.moveTo(z.x + 18, z.y - 54); c.lineTo(z.x + 44, z.y - 45); c.lineTo(z.x + 18, z.y - 36); c.fill();
    // l'anello con il manico
    const r = this.ring, col = this.touching ? '#E5484D' : '#5E6670';
    c.strokeStyle = col; c.lineWidth = 6;
    c.beginPath(); c.arc(r.x, r.y, this.R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(r.x, r.y + this.R); c.lineTo(r.x + 8, r.y + this.R + 38); c.stroke();
    c.fillStyle = '#E5484D'; c.beginPath(); c.roundRect(r.x + 2, r.y + this.R + 30, 14, 30, 6); c.fill();
    if (!this.grabbing && !this.finished && r.x === a.x) {
      c.fillStyle = '#1D1C1F'; c.font = '600 15px Lexend, sans-serif'; c.textAlign = 'left';
      c.fillText('Prendi l\'anello e trascinalo →', Math.min(r.x + this.R + 14, W - 230), r.y - this.R - 10);
    }
    if (this.finished) {
      c.fillStyle = 'rgba(46,139,87,.92)'; c.beginPath(); c.roundRect(W / 2 - 150, 16, 300, 44, 14); c.fill();
      c.fillStyle = '#fff'; c.font = '800 19px Lexend, sans-serif'; c.textAlign = 'center';
      c.fillText(this.touches ? `Arrivato! Tocchi: ${this.touches}` : 'Arrivato senza toccare!', W / 2, 45);
    }
    // le lucine del micro:bit
    const L = this.cb.leds();
    this.root.querySelectorAll<HTMLElement>('.buzz-leds i').forEach((el, i) => el.classList.toggle('on', L[i] > 0));
  }
}
