import { describe, it, expect } from 'vitest';
import { transpile } from '../src/sim/transpile';
import { MicrobitRuntime, Bridge } from '../src/sim/runtime';
import { analyze, canConnect, PartInst, Wire } from '../src/sim/circuit';
import { Hardware } from '../src/sim/hardware';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function fakeBridge() {
  const log: string[] = [];
  const errors: string[] = [];
  const servo: [string, number | null][] = [];
  const frames: string[] = [];
  const b: Bridge = {
    display: l => frames.push(Array.from(l).map(v => (v ? '1' : '0')).join('')),
    digitalWrite: (p, v) => log.push(`d ${p} ${v}`),
    analogWrite: (p, v) => log.push(`a ${p} ${v}`),
    servoWrite: (p, a) => servo.push([p, a]),
    digitalRead: () => 0, analogRead: () => 0,
    tone: () => {}, log: t => log.push('log ' + t), error: m => errors.push(m),
  };
  return { b, log, errors, servo, frames };
}

describe('transpile', () => {
  it('rende async funzioni e chiamate', () => {
    const js = transpile('basic.forever(function () { basic.pause(100) })');
    expect(js).toContain('async function');
    expect(js).toContain('await basic.pause(100)');
  });
  it('toglie i tipi TypeScript', () => {
    const js = transpile('let x: number = 5\nfunction f(a: number): number { return a * 2 }');
    expect(js).not.toContain(': number');
  });
  it('mette __tick nei cicli', () => {
    const js = transpile('while (true) { x = 1 }');
    expect(js).toContain('await __tick()');
  });
  it('lascia sincroni i callback di sort', () => {
    const js = transpile('let a = [3,1,2]\na.sort((x, y) => x - y)');
    expect(js).toMatch(/sort\(\(x, y\) =>/);
  });
  it('catene di chiamate', () => {
    const js = transpile('servos.P0.setAngle(Math.abs(-90))');
    expect(js).toContain('await servos.P0.setAngle(await Math.abs(-90))');
  });
  it('errore di sintassi in italiano', () => {
    expect(() => transpile('basic.showNumber(')).toThrow(/errore/);
  });
});

describe('runtime', () => {
  it('mostra un\'icona e muove il servo al pulsante A', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`basic.showIcon(IconNames.Heart)
input.onButtonPressed(Button.A, function () {
  for (let index = 0; index < 2; index++) {
    servos.P0.setAngle(45)
    basic.pause(10)
    servos.P0.setAngle(135)
    basic.pause(10)
  }
})`);
    await wait(50);
    expect(f.frames.at(-1)).toBe('0101011111111110111000100');
    await wait(650); // showIcon aspetta 600 ms prima di passare al blocco dopo
    rt.pressButton('A', true); rt.pressButton('A', false);
    await wait(150);
    expect(f.servo.filter(s => s[1] !== null).map(s => s[1])).toEqual([45, 135, 45, 135]);
    rt.stop();
    expect(f.errors).toEqual([]);
  });
  it('forever gira e stop lo ferma', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`let n = 0
basic.forever(function () { n += 1; pins.digitalWritePin(DigitalPin.P1, n % 2); basic.pause(5) })`);
    await wait(120);
    rt.stop();
    const count = f.log.length;
    expect(count).toBeGreaterThan(3);
    await wait(60);
    expect(f.log.length).toBe(count);
  });
  it('ciclo infinito senza pause non blocca e si ferma', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`let k = 0\nwhile (true) { k++ }`);
    await wait(50);
    rt.stop();
    await wait(20);
    expect(f.errors).toEqual([]);
  });
  it('blocco radio: messaggio gentile', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`radio.sendNumber(1)`);
    await wait(30);
    expect(f.errors[0]).toMatch(/radio/i);
  });
  it('blocco sconosciuto', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`pippo.fai(1)`);
    await wait(30);
    expect(f.errors[0]).toMatch(/pippo/);
  });
  it('showNumber scorre', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`basic.showNumber(42, 1)`);
    await wait(150);
    expect(f.frames.length).toBeGreaterThan(5);
    rt.stop();
  });
  it('funzioni dell\'utente', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`function muovi(a: number) { servos.P2.setAngle(a) }\nmuovi(10)\nmuovi(20)`);
    await wait(30);
    expect(f.servo.map(s => s[1])).toEqual([10, 20]);
    rt.stop();
  });
});

const P = (id: string, type: string): PartInst => ({ id, type, x: 0, z: 0, rot: 0 });
const W = (a: string, b: string): Wire => ({ id: a + b, a, b, color: 'rosso' });
const ids = (parts: PartInst[], wires: Wire[]) => analyze(parts, wires).issues.map(i => i.id);

describe('circuito', () => {
  const base = [P('mb', 'microbit'), P('bat', 'battery'), P('s', 'servo')];
  const power = W('bat:PLUG', 'mb:BAT');
  it('micro:bit spento', () => {
    expect(ids(base, [])).toContain('microbit-off');
  });
  it('servo collegato bene: nessun errore', () => {
    expect(ids(base, [power, W('s:GND', 'mb:GND'), W('s:VCC', 'mb:3V'), W('s:SIG', 'mb:P0')])).toEqual([]);
  });
  it('servo senza segnale', () => {
    expect(ids(base, [power, W('s:GND', 'mb:GND'), W('s:VCC', 'mb:3V')])).toEqual(['servo-no-signal']);
  });
  it('servo al contrario', () => {
    expect(ids(base, [power, W('s:GND', 'mb:3V'), W('s:VCC', 'mb:GND'), W('s:SIG', 'mb:P0')])).toContain('servo-reversed');
  });
  it('rosso su un pin', () => {
    expect(ids(base, [power, W('s:GND', 'mb:GND'), W('s:VCC', 'mb:P1'), W('s:SIG', 'mb:P0')])).toContain('servo-vcc-pin');
  });
  it('cortocircuito', () => {
    // il servo fa da ponte: rosso e marrone sullo stesso filo
    const parts = [P('mb', 'microbit'), P('bat', 'battery'), P('r', 'resistor')];
    expect(ids(parts, [power, W('r:A', 'mb:3V'), W('r:A', 'mb:GND')])).toContain('short');
  });
  it('LED: al contrario, senza resistenza, giusto', () => {
    const parts = [P('mb', 'microbit'), P('bat', 'battery'), P('l', 'led'), P('r', 'resistor')];
    expect(ids(parts, [power, W('l:K', 'mb:P0'), W('l:A', 'mb:GND')])).toContain('led-reversed');
    expect(ids(parts, [power, W('l:A', 'mb:P0'), W('l:K', 'mb:GND')])).toContain('led-no-resistor');
    expect(ids(parts, [power, W('mb:P0', 'r:A'), W('r:B', 'l:A'), W('l:K', 'mb:GND')])).toEqual([]);
  });
  it('spina solo nella presa', () => {
    const parts = [P('mb', 'microbit'), P('bat', 'battery')];
    expect(canConnect(parts, [], 'bat:PLUG', 'mb:P0')).toMatch(/presa/);
    expect(canConnect(parts, [], 'bat:PLUG', 'mb:BAT')).toBeNull();
  });
});

describe('hardware', () => {
  it('il servo si muove solo se collegato e alimentato', () => {
    const moves: number[] = [];
    const hw = new Hardware({ display() {}, servo: (_id, a) => moves.push(a), led() {}, tone() {}, log() {}, error() {}, issue() {} });
    const parts = [P('mb', 'microbit'), P('bat', 'battery'), P('s', 'servo')];
    hw.setCircuit(parts, [W('bat:PLUG', 'mb:BAT'), W('s:GND', 'mb:GND'), W('s:VCC', 'mb:3V'), W('s:SIG', 'mb:P0')]);
    hw.reset();
    hw.servoWrite('P0', 0);
    for (let i = 0; i < 40; i++) hw.step(0.02);
    expect(Math.round(hw.servoAngle.get('s')!)).toBe(0);
    expect(hw.servoMoves).toBe(1);
  });
  it('pin sbagliato: avviso', () => {
    const issues: string[] = [];
    const hw = new Hardware({ display() {}, servo() {}, led() {}, tone() {}, log() {}, error() {}, issue: i => issues.push(i.id) });
    const parts = [P('mb', 'microbit'), P('bat', 'battery'), P('s', 'servo')];
    hw.setCircuit(parts, [W('bat:PLUG', 'mb:BAT'), W('s:GND', 'mb:GND'), W('s:VCC', 'mb:3V'), W('s:SIG', 'mb:P1')]);
    hw.reset();
    hw.servoWrite('P0', 30);
    expect(issues).toEqual(['servo-wrong-pin']);
  });
  it('LED con resistenza si accende col pin', () => {
    const levels: number[] = [];
    const hw = new Hardware({ display() {}, servo() {}, led: (_i, l) => levels.push(l), tone() {}, log() {}, error() {}, issue() {} });
    const parts = [P('mb', 'microbit'), P('bat', 'battery'), P('l', 'led'), P('r', 'resistor')];
    hw.setCircuit(parts, [W('bat:PLUG', 'mb:BAT'), W('mb:P1', 'r:A'), W('r:B', 'l:A'), W('l:K', 'mb:GND')]);
    hw.reset();
    hw.digitalWrite('P1', 1);
    expect(hw.ledLevel.get('l')).toBe(1);
    hw.digitalWrite('P1', 0);
    expect(hw.ledLevel.get('l')).toBe(0);
  });
});
