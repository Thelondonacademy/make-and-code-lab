// Il "cervello" simulato del micro:bit V2: esegue il codice MakeCode tradotto da transpile.ts.
import { transpile, TranspileError } from './transpile';
import { ICONS, ARROWS, textColumns, NOTE, noteFreq, MELODIES } from './microbit-data';

export type PinName = 'P0' | 'P1' | 'P2';
export const PINS: PinName[] = ['P0', 'P1', 'P2'];

/** Collegamento tra il cervello simulato e il resto del mondo (circuito, scena 3D, audio). */
export interface Bridge {
  display(leds: Uint8Array): void;
  digitalWrite(pin: string, value: number): void;
  analogWrite(pin: string, value: number): void;
  servoWrite(pin: string, angle: number | null): void;
  digitalRead(pin: string): number;
  analogRead(pin: string): number;
  tone(freq: number, ms: number): void;
  log(text: string): void;
  error(message: string, detail?: string): void;
}

export interface Sensors {
  light: number;        // 0..255
  temperature: number;  // °C
  sound: number;        // 0..255
  accX: number; accY: number; accZ: number; // milli-g
  compass: number;      // 0..359
}

class Stopped extends Error { constructor() { super('fermato'); } }
class Unsupported extends Error { constructor(public what: string) { super('non supportato: ' + what); } }

const UNSUPPORTED_NS: Record<string, string> = {
  radio: 'La radio non c\'è', game: 'I giochi con gli sprite non ci sono', bluetooth: 'Il Bluetooth non c\'è', datalogger: 'Il registratore di dati non c\'è',
  neopixel: 'Le strisce NeoPixel non ci sono', power: 'Il risparmio energetico non c\'è',
};

export interface RunStats {
  started: number;
  iconsShown: Set<string>;
  textsShown: string[];
  buttons: Set<string>;
  pins: Set<string>;
  shakes: number;
  clearsAfterLeds: number; // lucine spente dopo averle accese (luce notturna)
  servoWrites: number;
  pinWrites: number;
  tones: number;
}

export class MicrobitRuntime {
  running = false;
  leds = new Uint8Array(25);
  sensors: Sensors = { light: 128, temperature: 21, sound: 40, accX: 0, accY: 0, accZ: -1023, compass: 0 };
  stats: RunStats = this.newStats();
  private generation = 0;
  private sleeps = new Set<() => void>();
  private ticks = 0;
  private startTime = 0;
  private handlers = new Map<string, Array<() => Promise<any>>>();
  private busy = new Map<Function, number>();
  private buttonDown = new Set<string>();
  private logoDown = false;
  private pinTouched = new Set<string>();
  private brightness = 255;
  private volume = 128;
  private tempoBpm = 120;

  constructor(private bridge: Bridge) {}

  private newStats(): RunStats {
    return { started: Date.now(), iconsShown: new Set(), textsShown: [], buttons: new Set(), pins: new Set(), shakes: 0, clearsAfterLeds: 0, servoWrites: 0, pinWrites: 0, tones: 0 };
  }

  // ---------- avvio e arresto ----------

  /** Avvia il programma. Restituisce un messaggio di errore se il codice non si può tradurre. */
  start(source: string): string | null {
    this.stop();
    let js: string;
    try {
      js = transpile(source || '');
    } catch (e) {
      const msg = e instanceof TranspileError ? e.message : 'Non riesco a leggere il codice.';
      this.bridge.error(msg);
      return msg;
    }
    this.running = true;
    this.generation++;
    this.stats = this.newStats();
    this.startTime = Date.now();
    this.leds.fill(0);
    this.bridge.display(this.leds);
    const api = this.createApi();
    const names = Object.keys(api);
    let fn: (...a: any[]) => Promise<any>;
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      fn = new AsyncFunction(...names, '"use strict";\n' + js);
    } catch (e: any) {
      const msg = 'Il codice ha un errore di scrittura.';
      this.bridge.error(msg, String(e?.message || e));
      this.running = false;
      return msg;
    }
    this.spawn(() => fn(...names.map(n => (api as any)[n])));
    return null;
  }

  stop() {
    if (!this.running && this.sleeps.size === 0) return;
    this.running = false;
    this.generation++;
    for (const wake of this.sleeps) wake();
    this.sleeps.clear();
    this.handlers.clear();
    this.busy.clear();
    for (const p of ['P0', 'P1', 'P2']) this.bridge.servoWrite(p, null);
  }

  private check(gen: number) {
    if (!this.running || gen !== this.generation) throw new Stopped();
  }

  /** Esegue una "fibra" (un pezzo di programma che va avanti da solo). */
  private spawn(task: () => Promise<any>) {
    const gen = this.generation;
    Promise.resolve().then(task).catch((e: any) => {
      if (e instanceof Stopped || gen !== this.generation) return;
      this.fail(e);
    });
  }

  private fail(e: any) {
    let msg = 'Il programma si è fermato per un errore.';
    let detail = String(e?.message || e);
    if (e instanceof Unsupported) {
      msg = `${e.what} ancora nel laboratorio. Arriverà presto!`;
    } else if (e instanceof ReferenceError) {
      const name = /^(\w+)/.exec(e.message)?.[1] || '';
      msg = UNSUPPORTED_NS[name] ? `${UNSUPPORTED_NS[name]} ancora nel laboratorio. Arriverà presto!`
        : `Nel codice c'è un blocco che non conosco ancora: «${name}».`;
    } else if (e instanceof TypeError && /is not a function|undefined/.test(e.message)) {
      msg = 'Nel codice c\'è un blocco che il laboratorio non conosce ancora.';
    }
    this.bridge.error(msg, detail);
    this.stop();
  }

  sleep(ms: number): Promise<void> {
    const gen = this.generation;
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const wake = () => { if (done) return; done = true; clearTimeout(t); this.sleeps.delete(wake); gen === this.generation && this.running ? resolve() : reject(new Stopped()); };
      const t = setTimeout(wake, Math.max(0, ms));
      this.sleeps.add(wake);
    });
  }

  private async tick() {
    this.check(this.generation);
    if (++this.ticks % 200 === 0) await this.sleep(0);
  }

  // ---------- eventi dall'esterno (scena 3D, pannello sensori) ----------

  private fire(key: string) {
    if (!this.running) return;
    const list = this.handlers.get(key);
    if (!list) return;
    for (const h of list) {
      const n = this.busy.get(h) || 0;
      if (n >= 2) continue; // già in corso e uno in coda: come il micro:bit vero, non si accumulano
      this.busy.set(h, n + 1);
      this.spawn(async () => {
        try { await h(); } finally { this.busy.set(h, Math.max(0, (this.busy.get(h) || 1) - 1)); }
      });
    }
  }

  private abDown = false;
  private longTimer: any = 0;
  /** Come il micro:bit vero: se tieni premuti A e B insieme scatta "A+B" (e non A o B da soli). */
  pressButton(b: 'A' | 'B' | 'AB', down: boolean) {
    if (b === 'AB') { this.pressButton('A', down); this.pressButton('B', down); return; }
    if (down) {
      this.buttonDown.add(b);
      this.stats.buttons.add(b);
      if (this.buttonDown.has('A') && this.buttonDown.has('B')) { this.abDown = true; this.stats.buttons.add('AB'); }
    } else {
      if (!this.buttonDown.has(b)) return;
      this.buttonDown.delete(b);
      if (this.abDown) {
        if (!this.buttonDown.has('A') && !this.buttonDown.has('B')) { this.abDown = false; this.fire('btn:AB'); }
        return;
      }
      this.fire('btn:' + b);
    }
  }
  touchLogo(down: boolean) {
    clearTimeout(this.longTimer);
    if (down) {
      this.logoDown = true; this.fire('logo:Pressed'); this.fire('logo:Touched');
      this.longTimer = setTimeout(() => { if (this.logoDown) this.fire('logo:LongPressed'); }, 1000);
    } else if (this.logoDown) { this.logoDown = false; this.fire('logo:Released'); }
  }
  touchPin(pin: string, down: boolean) {
    if (down) { this.pinTouched.add(pin); this.stats.pins.add(pin); this.fire('pin:' + pin + ':pressed'); }
    else if (this.pinTouched.has(pin)) { this.pinTouched.delete(pin); this.fire('pin:' + pin); this.fire('pin:' + pin + ':released'); }
  }
  gesture(g: string) { if (g === 'Shake' && this.running) this.stats.shakes++; this.fire('gesture:' + g); }
  setSensor<K extends keyof Sensors>(k: K, v: Sensors[K]) {
    const before = this.sensors.sound;
    this.sensors[k] = v;
    if (k === 'sound') {
      if (before < 128 && (v as number) >= 128) this.fire('sound:Loud');
      if (before >= 128 && (v as number) < 128) this.fire('sound:Quiet');
    }
  }

  // ---------- schermo ----------

  private show(bits: string | number[]) {
    for (let i = 0; i < 25; i++) this.leds[i] = (typeof bits === 'string' ? bits[i] === '1' : bits[i]) ? this.brightness : 0;
    this.bridge.display(this.leds);
  }

  private anim = 0; // cambia con led.stopAnimation(): la scritta che scorre si ferma subito
  private async scroll(text: string, interval: number) {
    const gen = this.generation;
    const anim = this.anim;
    const cols = textColumns(text);
    if (text.length === 1) {
      const frame = new Array(25).fill(0);
      cols.slice(0, 5).forEach((col, c) => col.forEach((v, y) => { frame[y * 5 + c] = v; }));
      this.show(frame);
      await this.sleep(Math.max(interval * 2, 300));
      this.check(gen);
      return;
    }
    const all = [...Array(5).fill([0, 0, 0, 0, 0]), ...cols, ...Array(5).fill([0, 0, 0, 0, 0])];
    for (let s = 0; s <= all.length - 5; s++) {
      const frame = new Array(25).fill(0);
      for (let c = 0; c < 5; c++) all[s + c].forEach((v: number, y: number) => { frame[y * 5 + c] = v; });
      this.show(frame);
      await this.sleep(interval);
      this.check(gen);
      if (anim !== this.anim) return;
    }
  }

  // ---------- suoni ----------

  private async tone(freq: number, ms: number, wait = true) {
    this.stats.tones++;
    if (freq > 0 && this.volume > 0) this.bridge.tone(freq, ms);
    if (wait) await this.sleep(ms);
  }
  private beat(fraction: number) { return Math.round((60000 / this.tempoBpm) * fraction); }
  private async melody(text: string, wait: boolean) {
    const tokens = text.trim().split(/\s+/);
    let oct = 4, dur = 4;
    const run = async () => {
      for (const t of tokens) {
        const [n, d] = t.split(':');
        if (d) dur = Number(d) || dur;
        const m = /(\d)$/.exec(n);
        if (m && !/R/i.test(n)) oct = Number(m[1]);
        const f = noteFreq(n.replace(/\d$/, '') + oct, oct);
        await this.tone(f, this.beat(dur / 4));
      }
    };
    if (wait) await run(); else this.spawn(run);
  }

  // ---------- API MakeCode ----------

  private createApi() {
    const rt = this;
    const gen = () => rt.generation;
    // come MakeCode: per ogni evento vale l'ultimo blocco "quando…"
    const on = (key: string, fn: () => Promise<any>) => { rt.handlers.set(key, [fn]); };
    const enumOf = (names: string[]) => Object.fromEntries(names.map(n => [n, n]));
    const pinNames = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P19', 'P20'];
    const checkPin = (p: string) => {
      if (!['P0', 'P1', 'P2'].includes(p)) rt.bridge.log(`Il pin ${p.replace('P', '')} è piccolo e senza coccodrillo: nel laboratorio usiamo 0, 1 e 2.`);
      return p;
    };
    const servoAngle = (p: string, a: number) => {
      rt.stats.servoWrites++;
      rt.bridge.servoWrite(checkPin(p), Math.max(0, Math.min(180, a)));
    };
    const servo = (p: string) => ({
      setAngle: (a: number) => servoAngle(p, a),
      run: (speed: number) => servoAngle(p, 90 + Math.max(-100, Math.min(100, speed)) * 0.9),
      stop: () => rt.bridge.servoWrite(p, null),
      setPulse: (us: number) => servoAngle(p, ((us - 600) / 1800) * 180),
      setRange: () => {}, setStopOnNeutral: () => {},
    });
    const image = (bits: string, width = 5) => {
      const px: number[][] = [];
      const parts = bits.split('').map(c => (c === '1' ? 1 : 0));
      for (let y = 0; y < 5; y++) px.push(parts.slice(y * width, y * width + width));
      return {
        width: () => width,
        height: () => 5,
        pixel: (x: number, y: number) => !!px[y]?.[x],
        setPixel: (x: number, y: number, v: boolean) => { if (px[y]) px[y][x] = v ? 1 : 0; },
        showImage: async (offset = 0, interval = 400) => {
          const frame = new Array(25).fill(0);
          for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) frame[y * 5 + x] = px[y][x + offset] || 0;
          rt.show(frame);
          await rt.sleep(interval);
        },
        plotImage: (offset = 0) => {
          const frame = new Array(25).fill(0);
          for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) frame[y * 5 + x] = px[y][x + offset] || 0;
          rt.show(frame);
        },
        scrollImage: async (step = 1, interval = 200) => {
          for (let off = 0; off + 5 <= width; off += step) {
            const frame = new Array(25).fill(0);
            for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) frame[y * 5 + x] = px[y][x + off] || 0;
            rt.show(frame);
            await rt.sleep(interval);
          }
        },
        clear: () => px.forEach(r => r.fill(0)),
      };
    };
    const parseLeds = (s: string) => {
      const toks = String(s).replace(/[^#.]/g, '');
      const width = Math.max(5, Math.round(toks.length / 5));
      return { bits: toks.split('').map(c => (c === '#' ? '1' : '0')).join(''), width };
    };
    const playable = (kind: string, data: any) => ({ __playable: kind, ...data });

    const basic = {
      showNumber: async (n: number, interval = 150) => {
        const s = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
        rt.stats.textsShown.push(s);
        if (rt.stats.textsShown.length > 300) rt.stats.textsShown.splice(0, 100);
        await rt.scroll(s, interval);
      },
      showString: async (s: string, interval = 150) => { rt.stats.textsShown.push(String(s)); await rt.scroll(String(s), interval); },
      showIcon: async (name: string, interval = 600) => {
        rt.stats.iconsShown.add(name);
        rt.show(ICONS[name] || ICONS.Heart);
        await rt.sleep(interval);
      },
      showArrow: async (dir: string | number, interval = 600) => {
        const names = Object.keys(ARROWS);
        rt.show(ARROWS[typeof dir === 'number' ? names[dir % 8] : dir] || ARROWS.North);
        await rt.sleep(interval);
      },
      showLeds: async (leds: string, interval = 400) => {
        const { bits } = parseLeds(leds);
        rt.stats.iconsShown.add('leds');
        rt.show(bits.slice(0, 25).padEnd(25, '0'));
        await rt.sleep(interval);
      },
      clearScreen: () => { if (rt.leds.some(v => v > 0) && rt.stats.iconsShown.has('leds')) rt.stats.clearsAfterLeds++; rt.leds.fill(0); rt.bridge.display(rt.leds); },
      pause: async (ms: number) => { await rt.sleep(Number(ms) || 0); },
      forever: (fn: () => Promise<any>) => {
        rt.spawn(async () => {
          const g = gen();
          await rt.sleep(0);
          while (rt.running && g === rt.generation) {
            await fn();
            await rt.sleep(20);
          }
        });
      },
      showAnimation: async (leds: string, interval = 400) => {
        const { bits, width } = parseLeds(leds);
        await image(bits, width).scrollImage(5, interval);
      },
      plotLeds: (leds: string) => rt.show(parseLeds(leds).bits.slice(0, 25).padEnd(25, '0')),
      setLedColor: () => {}, turnRgbLedOff: () => {},
    };

    const input = {
      onButtonPressed: (b: string, fn: () => Promise<any>) => on('btn:' + b, fn),
      buttonIsPressed: (b: string) => rt.buttonDown.has(b) || (b === 'AB' && rt.buttonDown.has('A') && rt.buttonDown.has('B')),
      onGesture: (g: string, fn: () => Promise<any>) => on('gesture:' + g, fn),
      isGesture: () => false,
      onLogoEvent: (ev: string, fn: () => Promise<any>) => on('logo:' + ev, fn),
      logoIsPressed: () => rt.logoDown,
      onPinPressed: (p: string, fn: () => Promise<any>) => on('pin:' + p, fn),
      onPinReleased: (p: string, fn: () => Promise<any>) => on('pin:' + p + ':released', fn),
      pinIsPressed: (p: string) => rt.pinTouched.has(p),
      onSound: (s: string, fn: () => Promise<any>) => on('sound:' + s, fn),
      soundLevel: () => Math.round(rt.sensors.sound),
      setSoundThreshold: () => {},
      lightLevel: () => Math.round(rt.sensors.light),
      temperature: () => Math.round(rt.sensors.temperature),
      acceleration: (d: string) => d === 'X' ? rt.sensors.accX : d === 'Y' ? rt.sensors.accY : d === 'Z' ? rt.sensors.accZ
        : Math.round(Math.hypot(rt.sensors.accX, rt.sensors.accY, rt.sensors.accZ)),
      rotation: (r: string) => r === 'Pitch' ? Math.round(Math.atan2(rt.sensors.accY, -rt.sensors.accZ) * 57.3) : Math.round(Math.atan2(rt.sensors.accX, -rt.sensors.accZ) * 57.3),
      compassHeading: () => Math.round(rt.sensors.compass),
      calibrateCompass: () => {},
      magneticForce: () => 0,
      runningTime: () => Date.now() - rt.startTime,
      runningTimeMicros: () => (Date.now() - rt.startTime) * 1000,
      setAccelerometerRange: () => {},
    };

    const led = {
      plot: (x: number, y: number) => { if (x >= 0 && x < 5 && y >= 0 && y < 5) { rt.leds[y * 5 + x] = rt.brightness; rt.bridge.display(rt.leds); } },
      unplot: (x: number, y: number) => { if (x >= 0 && x < 5 && y >= 0 && y < 5) { rt.leds[y * 5 + x] = 0; rt.bridge.display(rt.leds); } },
      toggle: (x: number, y: number) => { if (x >= 0 && x < 5 && y >= 0 && y < 5) { rt.leds[y * 5 + x] = rt.leds[y * 5 + x] ? 0 : rt.brightness; rt.bridge.display(rt.leds); } },
      point: (x: number, y: number) => !!rt.leds[y * 5 + x],
      plotBrightness: (x: number, y: number, b: number) => { if (x >= 0 && x < 5 && y >= 0 && y < 5) { rt.leds[y * 5 + x] = Math.max(0, Math.min(255, b)); rt.bridge.display(rt.leds); } },
      pointBrightness: (x: number, y: number) => rt.leds[y * 5 + x],
      setBrightness: (b: number) => { rt.brightness = Math.max(0, Math.min(255, b)); },
      brightness: () => rt.brightness,
      enable: () => {}, stopAnimation: () => { rt.anim++; },
      plotBarGraph: (v: number, high: number) => {
        const n = Math.round((Math.max(0, v) / Math.max(1, high || 1023)) * 25);
        for (let i = 0; i < 25; i++) { const row = 4 - Math.floor(i / 5); rt.leds[row * 5 + (i % 5)] = i < n ? rt.brightness : 0; }
        rt.bridge.display(rt.leds);
      },
    };

    const pins = {
      digitalWritePin: (p: string, v: number) => { rt.stats.pinWrites++; rt.bridge.digitalWrite(checkPin(p), v ? 1 : 0); },
      analogWritePin: (p: string, v: number) => { rt.stats.pinWrites++; rt.bridge.analogWrite(checkPin(p), Math.max(0, Math.min(1023, Math.round(v)))); },
      digitalReadPin: (p: string) => rt.bridge.digitalRead(p),
      analogReadPin: (p: string) => rt.bridge.analogRead(p),
      servoWritePin: (p: string, a: number) => servoAngle(p, a),
      servoSetPulse: (p: string, us: number) => servoAngle(p, ((us - 600) / 1800) * 180),
      analogSetPeriod: () => {}, setPull: () => {}, touchSetMode: () => {}, setEvents: () => {}, setAudioPin: () => {},
      map: (v: number, fl: number, fh: number, tl: number, th: number) => ((v - fl) * (th - tl)) / (fh - fl) + tl,
      onPulsed: () => {}, pulseIn: () => 0, analogPitch: async (f: number, ms: number) => rt.tone(f, ms),
    };

    const music: any = {
      playTone: async (f: number, ms: number) => rt.tone(f, ms),
      ringTone: (f: number) => rt.tone(f, 200, false),
      rest: async (ms: number) => rt.sleep(ms),
      beat: (fr: number = 1) => rt.beat(fr),
      tempo: () => rt.tempoBpm,
      setTempo: (b: number) => { rt.tempoBpm = Math.max(4, b); },
      changeTempoBy: (b: number) => { rt.tempoBpm = Math.max(4, rt.tempoBpm + b); },
      setVolume: (v: number) => { rt.volume = v; },
      volume: () => rt.volume,
      stopAllSounds: () => {}, stopMelody: () => {},
      noteFrequency: (n: number) => n,
      tonePlayable: (f: number, ms: number) => playable('tone', { f, ms }),
      stringPlayable: (s: string, tempo: number) => playable('melody', { s, tempo }),
      builtInMelody: (m: string) => MELODIES[m] || MELODIES.BaDing,
      builtInPlayableMelody: (m: string) => playable('melody', { s: MELODIES[m] || MELODIES.BaDing }),
      createSoundExpression: () => playable('effect', {}),
      createSoundEffect: () => playable('effect', {}),
      builtinSoundEffect: () => playable('effect', {}),
      builtinPlayableSoundEffect: () => playable('effect', {}),
      play: async (p: any, mode: string) => {
        const wait = mode === 'UntilDone';
        if (!p || !p.__playable) return;
        if (p.__playable === 'tone') await rt.tone(p.f, p.ms, wait);
        else if (p.__playable === 'melody') await rt.melody(p.s, wait);
        else { await rt.tone(660, 120, wait); }
      },
      playMelody: async (s: string, tempo: number) => { const old = rt.tempoBpm; rt.tempoBpm = tempo || old; await rt.melody(s, true); rt.tempoBpm = old; },
      startMelody: (notes: string | string[]) => { void rt.melody(Array.isArray(notes) ? notes.join(' ') : notes, false); },
      playSoundEffect: async () => rt.tone(660, 150),
      onEvent: () => {},
      isSoundPlaying: () => false,
      PlaybackMode: { UntilDone: 'UntilDone', InBackground: 'InBackground', LoopingInBackground: 'LoopingInBackground' },
    };

    const servos = { P0: servo('P0'), P1: servo('P1'), P2: servo('P2') };

    const control = {
      inBackground: (fn: () => Promise<any>) => rt.spawn(fn),
      runInParallel: (fn: () => Promise<any>) => rt.spawn(fn),
      waitMicros: async (us: number) => rt.sleep(us / 1000),
      millis: () => Date.now() - rt.startTime,
      micros: () => (Date.now() - rt.startTime) * 1000,
      reset: () => { rt.bridge.log('Il micro:bit si è riavviato.'); },
      deviceSerialNumber: () => 1234,
      deviceName: () => 'zipaz',
      onEvent: () => {}, raiseEvent: () => {}, eventTimestamp: () => 0, eventValue: () => 0,
      panic: (code: number) => { throw new Error('panic ' + code); },
      assert: (c: any, code: number) => { if (!c) throw new Error('assert ' + code); },
    };

    const serial = {
      writeLine: (s: any) => rt.bridge.log(String(s)),
      writeString: (s: any) => rt.bridge.log(String(s)),
      writeNumber: (n: any) => rt.bridge.log(String(n)),
      writeValue: (k: string, v: any) => rt.bridge.log(`${k}: ${v}`),
      writeNumbers: (a: any[]) => rt.bridge.log(a.join(', ')),
      redirectToUSB: () => {}, setBaudRate: () => {}, readLine: () => '', readString: () => '', onDataReceived: () => {},
    };

    const images = {
      createImage: (s: string) => { const { bits, width } = parseLeds(s); return image(bits, width); },
      createBigImage: (s: string) => { const { bits, width } = parseLeds(s); return image(bits, width); },
      iconImage: (n: string) => image(ICONS[n] || ICONS.Heart),
      arrowImage: (n: string) => image(ARROWS[n] || ARROWS.North),
      arrowNumber: (n: string) => Object.keys(ARROWS).indexOf(n),
    };

    const unsupported = (label: string) => new Proxy({}, { get: (_t, prop) => (typeof prop === 'string' ? () => { throw new Unsupported(label); } : undefined) });

    const randint = (a: number, b: number) => Math.floor(Math.random() * (Math.floor(b) - Math.ceil(a) + 1)) + Math.ceil(a);
    const MathExt = Object.assign(Object.create(Math), {
      randomBoolean: () => Math.random() < 0.5,
      randomRange: randint,
      map: (v: number, fl: number, fh: number, tl: number, th: number) => ((v - fl) * (th - tl)) / (fh - fl) + tl,
      constrain: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
      idiv: (a: number, b: number) => Math.trunc(a / b),
      imul: Math.imul,
      roundWithPrecision: (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d,
    });
    const NoteEnum: Record<string, number> = { ...NOTE };
    const api = {
      Math: MathExt,
      convertToText: (v: any) => String(v),
      parseFloat, parseInt,
      basic, input, led, pins, music, servos, control, serial, images,
      radio: unsupported(UNSUPPORTED_NS.radio), game: unsupported(UNSUPPORTED_NS.game), bluetooth: unsupported(UNSUPPORTED_NS.bluetooth),
      datalogger: unsupported(UNSUPPORTED_NS.datalogger), power: unsupported(UNSUPPORTED_NS.power),
      randint,
      Button: enumOf(['A', 'B', 'AB']),
      IconNames: enumOf(Object.keys(ICONS)),
      ArrowNames: enumOf(Object.keys(ARROWS)),
      Gesture: enumOf(['Shake', 'LogoUp', 'LogoDown', 'ScreenUp', 'ScreenDown', 'TiltLeft', 'TiltRight', 'FreeFall', 'ThreeG', 'SixG', 'EightG']),
      TouchButtonEvent: enumOf(['Pressed', 'Touched', 'Released', 'LongPressed']),
      TouchPin: enumOf(['P0', 'P1', 'P2']),
      TouchTarget: enumOf(['P0', 'P1', 'P2', 'LOGO']), TouchTargetMode: enumOf(['Capacitive', 'Resistive']),
      DigitalPin: enumOf(pinNames), AnalogPin: enumOf(pinNames), AnalogReadWritePin: enumOf(pinNames),
      PinPullMode: enumOf(['PullNone', 'PullUp', 'PullDown']), PinEventType: enumOf(['Edge', 'Pulse', 'Touch', 'None']),
      Dimension: enumOf(['X', 'Y', 'Z', 'Strength']), Rotation: enumOf(['Pitch', 'Roll']),
      DetectedSound: enumOf(['Loud', 'Quiet']),
      Note: NoteEnum,
      BeatFraction: { Whole: 1, Half: 0.5, Quarter: 0.25, Eighth: 0.125, Sixteenth: 0.0625, Double: 2, Breve: 4 },
      Melodies: enumOf(Object.keys(MELODIES)),
      MelodyOptions: enumOf(['Once', 'Forever', 'OnceInBackground', 'ForeverInBackground']),
      MelodyStopOptions: enumOf(['All', 'Foreground', 'Background']),
      SoundExpression: enumOf(['giggle', 'happy', 'hello', 'mysterious', 'sad', 'slide', 'soaring', 'spring', 'twinkle', 'yawn']),
      soundExpression: new Proxy({}, { get: () => ({ play: async () => rt.tone(660, 150), playUntilDone: async () => rt.tone(660, 150) }) }),
      __tick: () => rt.tick(),
    };
    return api;
  }
}
