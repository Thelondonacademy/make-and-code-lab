// La caccia al tesoro nel simulatore: il tesoro (un micro:bit che trasmette) è nascosto in giardino.
// Trascini il micro:bit cercatore: più sei vicino, più forte arriva il segnale radio.
import { icon } from './icons';

export interface HuntCallbacks {
  seekerLeds(): ArrayLike<number>;
  seekerIcon(): string;
  onFinish(): void;
}

export class HuntGame {
  root: HTMLElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private W = 0; private H = 0;
  private seeker = { x: 0, y: 0 };
  private treasure = { x: 0, y: 0 };
  private bushes: { x: number; y: number; r: number }[] = [];
  private grabbing = false;
  private open = false;
  finished = false;
  private raf = 0;

  constructor(private treasureId: string, private seekerId: string, private cb: HuntCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'buzz hunt';
    this.root.innerHTML = `<div class="buzz-card" role="dialog" aria-label="Caccia al tesoro">
      <div class="buzz-head">
        <div class="buzz-txt"><b>Caccia al tesoro</b><span>Il tesoro è nascosto in giardino. Trascina il tuo micro:bit: il cuore grande vuol dire "vicinissimo!"</span></div>
        <button class="icon-btn buzz-x" aria-label="Chiudi il gioco">${icon('ph:x-bold', 22)}</button>
      </div>
      <canvas class="buzz-cv"></canvas>
    </div>`;
    this.cv = this.root.querySelector('canvas')!;
    this.ctx = this.cv.getContext('2d')!;
    this.cv.addEventListener('pointerdown', this.down);
    this.cv.addEventListener('pointermove', this.move);
    this.cv.addEventListener('pointerup', () => { this.grabbing = false; });
    this.cv.addEventListener('pointercancel', () => { this.grabbing = false; });
    this.root.querySelector('.buzz-x')!.addEventListener('click', () => this.close());
  }

  isOpen() { return this.open; }

  show(host: HTMLElement) {
    host.appendChild(this.root);
    this.open = true;
    const b = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(300, b.width); this.H = Math.max(200, b.height);
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // cespugli: il tesoro è nascosto sotto uno di quelli lontani dalla partenza
    const r = Math.min(this.W, this.H) * 0.07;
    this.bushes = [[0.22, 0.25], [0.5, 0.18], [0.8, 0.28], [0.35, 0.62], [0.65, 0.55], [0.86, 0.75], [0.55, 0.85]].map(([x, y]) => ({ x: x * this.W, y: y * this.H, r }));
    const far = this.bushes.filter(c => Math.hypot(c.x - 0.08 * this.W, c.y - 0.85 * this.H) > Math.min(this.W, this.H) * 0.5);
    const hide = far[Math.floor(Math.random() * far.length)];
    this.treasure = { x: hide.x, y: hide.y };
    this.seeker = { x: 0.08 * this.W, y: 0.85 * this.H };
    this.finished = false;
    const loop = () => { this.draw(); this.check(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  /** Forza del segnale dal tesoro al cercatore, in base alla distanza sulla mappa. */
  strength(from: string, to: string) {
    if (from !== this.treasureId || to !== this.seekerId) return -128;
    const d = Math.hypot(this.seeker.x - this.treasure.x, this.seeker.y - this.treasure.y);
    const max = Math.hypot(this.W, this.H) * 0.6;
    if (d > max) return -128;
    return -42 - 53 * Math.max(0, Math.min(1, (d - 30) / (max - 30)));
  }

  testState() {
    const b = this.cv.getBoundingClientRect();
    const k = b.width / this.W;
    return { treasure: { x: b.left + this.treasure.x * k, y: b.top + this.treasure.y * k }, seeker: { x: b.left + this.seeker.x * k, y: b.top + this.seeker.y * k }, finished: this.finished };
  }
  testMove(x: number, y: number) { this.seeker = { x, y }; }

  private local(e: PointerEvent) {
    const b = this.cv.getBoundingClientRect();
    return { x: (e.clientX - b.left) * (this.W / b.width), y: (e.clientY - b.top) * (this.H / b.height) };
  }
  private down = (e: PointerEvent) => {
    const p = this.local(e);
    if (Math.abs(p.x - this.seeker.x) > 60 || Math.abs(p.y - this.seeker.y) > 55) return;
    this.grabbing = true;
    this.cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  private move = (e: PointerEvent) => {
    if (!this.grabbing) return;
    const p = this.local(e);
    this.seeker = { x: Math.max(30, Math.min(this.W - 30, p.x)), y: Math.max(26, Math.min(this.H - 26, p.y)) };
  };

  private check() {
    if (this.finished) return;
    const d = Math.hypot(this.seeker.x - this.treasure.x, this.seeker.y - this.treasure.y);
    if (d < Math.min(this.W, this.H) * 0.09 && this.cb.seekerIcon() === 'Heart') {
      this.finished = true;
      this.grabbing = false;
      this.cb.onFinish();
    }
  }

  private draw() {
    const c = this.ctx, W = this.W, H = this.H;
    c.fillStyle = '#9ED37A'; c.fillRect(0, 0, W, H);
    // sentiero
    c.strokeStyle = '#E8D3A6'; c.lineWidth = 26; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0.04 * W, 0.92 * H); c.bezierCurveTo(0.3 * W, 0.7 * H, 0.45 * W, 0.4 * H, 0.96 * W, 0.12 * H); c.stroke();
    // cespugli
    for (const b of this.bushes) {
      c.fillStyle = '#4F9A3C';
      for (const [dx, dy, k] of [[-0.5, 0.1, 0.7], [0.5, 0.1, 0.7], [0, -0.3, 0.8], [0, 0.15, 1]] as const) { c.beginPath(); c.arc(b.x + dx * b.r, b.y + dy * b.r, b.r * k, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#6DBB4F'; c.beginPath(); c.arc(b.x - b.r * 0.25, b.y - b.r * 0.35, b.r * 0.35, 0, Math.PI * 2); c.fill();
    }
    if (this.finished) {
      const t = this.treasure;
      c.fillStyle = '#8B5A2B'; c.beginPath(); c.roundRect(t.x - 26, t.y - 14, 52, 32, 6); c.fill();
      c.fillStyle = '#F2C94C'; c.fillRect(t.x - 26, t.y - 2, 52, 6); c.fillRect(t.x - 4, t.y - 14, 8, 32);
      c.fillStyle = 'rgba(46,139,87,.92)'; c.beginPath(); c.roundRect(W / 2 - 130, 14, 260, 42, 14); c.fill();
      c.fillStyle = '#fff'; c.font = '800 19px Lexend, sans-serif'; c.textAlign = 'center'; c.fillText('Tesoro trovato!', W / 2, 42);
    }
    // il micro:bit cercatore, con le sue lucine
    const s = this.seeker, L = this.cb.seekerLeds();
    c.fillStyle = '#1D1C1F'; c.beginPath(); c.roundRect(s.x - 34, s.y - 28, 68, 56, 8); c.fill();
    for (let i = 0; i < 25; i++) {
      const x = s.x - 20 + (i % 5) * 10, y = s.y - 20 + Math.floor(i / 5) * 10;
      c.fillStyle = L[i] ? '#FF3B30' : '#3A1D1D';
      c.fillRect(x - 3, y - 3, 6, 6);
    }
    c.fillStyle = '#C9A24A'; c.fillRect(s.x - 34, s.y + 22, 68, 6);
    if (!this.grabbing && !this.finished && s.x < W * 0.15) {
      c.fillStyle = '#1D1C1F'; c.font = '600 15px Lexend, sans-serif'; c.textAlign = 'left';
      c.fillText('← Trascinami e cerca!', s.x + 42, s.y + 5);
    }
  }
}
