// Il mondo fisico simulato: cosa succede ai pezzi quando il micro:bit manda segnali sui pin.
import { analyze, Analysis, Issue, PartInst, Wire, PIN_PADS } from './circuit';
import type { Bridge } from './runtime';

export interface HardwareEvents {
  display(mbId: string, leds: Uint8Array): void;
  servo(servoId: string, angle: number): void;
  led(ledId: string, level: number): void;
  tone(freq: number, ms: number): void;
  log(text: string): void;
  error(message: string, detail?: string): void;
  issue(issue: Issue): void;
}

type PinOut = { mode: 'digital' | 'analog' | 'servo' | null; v: number };

export class Hardware implements Bridge {
  parts: PartInst[] = [];
  wires: Wire[] = [];
  analysis!: Analysis;
  mbId: string | null = null;
  pinOut: Record<string, PinOut> = {};
  servoAngle = new Map<string, number>();
  servoTarget = new Map<string, number>();
  ledLevel = new Map<string, number>();
  servoMoves = 0;
  private told = new Set<string>();

  constructor(private ev: HardwareEvents) { this.setCircuit([], []); }

  setCircuit(parts: PartInst[], wires: Wire[]) {
    this.parts = parts;
    this.wires = wires;
    this.analysis = analyze(parts, wires);
    this.mbId = parts.find(p => p.type === 'microbit')?.id ?? null;
    // un servo nuovo parte a 90; se ha già qualcosa legato al braccio (spago, fermo), parte dov'era calibrato
    for (const s of parts.filter(p => p.type === 'servo')) if (!this.servoAngle.has(s.id)) this.servoAngle.set(s.id, parts.find(m => m.attachedTo === s.id && m.rest !== undefined)?.rest ?? 90);
    this.updateLeds();
  }

  /** Nuova esecuzione: i pin tornano a riposo. */
  reset() {
    this.pinOut = {};
    for (const p of PIN_PADS) this.pinOut[p] = { mode: null, v: 0 };
    this.servoTarget.clear();
    this.servoMoves = 0;
    this.told.clear();
    this.updateLeds();
  }

  get powered() { return !!this.mbId && this.analysis.powered.has(this.mbId); }

  private tell(issue: Issue) {
    if (this.told.has(issue.id)) return;
    this.told.add(issue.id);
    this.ev.issue(issue);
  }

  private netHas(pin: string, pred: (type: string, term: string, partId: string) => boolean) {
    if (!this.mbId) return false;
    const node = `${this.mbId}:${pin}`;
    for (const p of this.parts) for (const t of ['3V', 'GND']) {
      if (p.type === 'microbit' && pred(p.type, t, p.id) && this.analysis.nets.same(node, `${p.id}:${t}`)) return true;
    }
    return false;
  }

  private checkShort(pin: string, value: number) {
    if (value && this.netHas(pin, (_t, term) => term === 'GND')) {
      this.tell({ id: 'pin-short', level: 'warning', title: `Il pin ${pin.slice(1)} è collegato al GND`, text: 'Se il pin si accende e va dritto al GND, l\'energia scappa via. Togli quel filo.', refs: [`${this.mbId}:${pin}`] });
    }
  }

  // ---------- Bridge (chiamato dal programma) ----------

  display(leds: Uint8Array) { if (this.mbId) this.ev.display(this.mbId, leds); }

  digitalWrite(pin: string, value: number) {
    if (!PIN_PADS.includes(pin)) return;
    this.pinOut[pin] = { mode: 'digital', v: value };
    this.checkShort(pin, value);
    this.updateLeds();
  }

  analogWrite(pin: string, value: number) {
    if (!PIN_PADS.includes(pin)) return;
    this.pinOut[pin] = { mode: 'analog', v: value };
    this.checkShort(pin, value);
    this.updateLeds();
  }

  servoWrite(pin: string, angle: number | null) {
    if (!PIN_PADS.includes(pin)) return;
    if (angle === null) { this.pinOut[pin] = { mode: null, v: 0 }; return; }
    this.pinOut[pin] = { mode: 'servo', v: angle };
    const servos = this.analysis.servos;
    const here = servos.filter(s => s.sig && s.sig.mb === this.mbId && s.sig.pin === pin);
    if (here.length === 0) {
      const other = servos.find(s => s.sig && s.sig.mb === this.mbId);
      if (other) {
        this.tell({ id: 'servo-wrong-pin', level: 'error', title: 'Il servo ascolta un altro pin',
          text: `Il codice parla al pin ${pin.slice(1)}, ma il filo arancione è sul pin ${other.sig!.pin.slice(1)}. Sposta il filo o cambia il pin nel codice.`,
          refs: [`${other.id}:SIG`, `${this.mbId}:${pin}`] });
      } else if (servos.length === 0) {
        this.tell({ id: 'no-servo', level: 'tip', title: 'Manca il servo', text: 'Il codice vuole muovere un servo, ma sul banco non c\'è. Lo trovi tra i pezzi, nella famiglia Movimento.', refs: [] });
      }
      return;
    }
    for (const s of here) {
      if (!s.powered || !s.grounded) continue; // senza energia non si muove (il controllore lo spiega già)
      const old = this.servoTarget.get(s.id) ?? this.servoAngle.get(s.id) ?? 90;
      if (Math.abs(old - angle) > 0.5) this.servoMoves++;
      this.servoTarget.set(s.id, angle);
    }
  }

  digitalRead(pin: string): number {
    if (this.netHas(pin, (_t, term, id) => term === '3V' && this.analysis.powered.has(id))) return 1;
    return 0;
  }

  analogRead(pin: string): number {
    if (this.netHas(pin, (_t, term, id) => term === '3V' && this.analysis.powered.has(id))) return 1023;
    return 0;
  }

  tone(freq: number, ms: number) { if (this.powered) this.ev.tone(freq, ms); }
  log(text: string) { this.ev.log(text); }
  error(message: string, detail?: string) { this.ev.error(message, detail); }

  // ---------- fisica ----------

  /** Muove i servo verso l'angolo voluto (un SG90 a 3V fa circa 300° al secondo). */
  step(dt: number) {
    for (const [id, target] of this.servoTarget) {
      const cur = this.servoAngle.get(id) ?? 90;
      if (Math.abs(cur - target) < 0.01) continue;
      const maxStep = 300 * dt;
      const next = cur + Math.max(-maxStep, Math.min(maxStep, target - cur));
      this.servoAngle.set(id, next);
      this.ev.servo(id, next);
    }
  }

  /** Quanto è acceso ogni LED (0..1). */
  updateLeds() {
    const a = this.analysis;
    if (!a) return;
    const drive = (node: string): number => {
      let best = 0;
      for (const p of this.parts) {
        if (p.type !== 'microbit' || !a.powered.has(p.id)) continue;
        if (a.paths.same(node, `${p.id}:3V`)) best = Math.max(best, 1);
        if (p.id === this.mbId) for (const pin of PIN_PADS) {
          if (!a.paths.same(node, `${p.id}:${pin}`)) continue;
          const o = this.pinOut[pin];
          if (o?.mode === 'digital' && o.v) best = Math.max(best, 1);
          if (o?.mode === 'analog') best = Math.max(best, o.v / 1023);
        }
      }
      return best;
    };
    const sink = (node: string): boolean => {
      for (const p of this.parts) {
        if (p.type !== 'microbit') continue;
        if (a.paths.same(node, `${p.id}:GND`)) return true;
        if (p.id === this.mbId) for (const pin of PIN_PADS) {
          const o = this.pinOut[pin];
          if (a.paths.same(node, `${p.id}:${pin}`) && o?.mode === 'digital' && !o.v) return true;
        }
      }
      return false;
    };
    for (const l of this.parts.filter(p => p.type === 'led')) {
      const level = sink(`${l.id}:K`) ? drive(`${l.id}:A`) : 0;
      if ((this.ledLevel.get(l.id) ?? -1) !== level) {
        this.ledLevel.set(l.id, level);
        this.ev.led(l.id, level);
      }
    }
  }
}
