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
  it('blocco non ancora disponibile: messaggio gentile', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`bluetooth.startUartService()`);
    await wait(30);
    expect(f.errors[0]).toMatch(/Bluetooth/i);
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

describe('correzioni dal controllo qualità', () => {
  it('A+B insieme fa scattare solo A+B', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`input.onButtonPressed(Button.A, function () { servos.P0.setAngle(1) })
input.onButtonPressed(Button.AB, function () { servos.P0.setAngle(2) })`);
    await wait(30);
    rt.pressButton('A', true); rt.pressButton('B', true); rt.pressButton('A', false); rt.pressButton('B', false);
    await wait(30);
    rt.pressButton('A', true); rt.pressButton('A', false);
    await wait(30);
    expect(f.servo.filter(s => s[1] !== null).map(s => s[1])).toEqual([2, 1]);
    rt.stop();
  });
  it('blocchi Matematica e Testo comuni', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`let b = Math.randomBoolean()
let x = Math.map(5, 0, 10, 0, 100) + Math.constrain(500, 0, 10) + Math.idiv(7, 2) + Math.roundWithPrecision(1.234, 1)
serial.writeLine(convertToText(x))
music.play(music.builtinPlayableSoundEffect(soundExpression.giggle), music.PlaybackMode.InBackground)`);
    await wait(40);
    expect(f.errors).toEqual([]);
    expect(f.log).toContain('log 64.2');
    rt.stop();
  });
  it('solo l\'ultimo "quando premi A" vale', async () => {
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(`input.onButtonPressed(Button.A, function () { servos.P0.setAngle(10) })
input.onButtonPressed(Button.A, function () { servos.P0.setAngle(20) })`);
    await wait(20);
    rt.pressButton('A', true); rt.pressButton('A', false);
    await wait(30);
    expect(f.servo.filter(s => s[1] !== null).map(s => s[1])).toEqual([20]);
    rt.stop();
  });
  it('niente "scambiati" se rosso e marrone sono giusti ma c\'è un corto', () => {
    const parts = [P('mb', 'microbit'), P('bat', 'battery'), P('s', 'servo')];
    const list = ids(parts, [W('bat:PLUG', 'mb:BAT'), W('s:VCC', 'mb:3V'), W('s:GND', 'mb:GND'), W('s:VCC', 'mb:GND'), W('s:SIG', 'mb:P0')]);
    expect(list).toContain('short');
    expect(list).not.toContain('servo-reversed');
  });
  it('"gamba libera" solo se una gamba non ha fili', () => {
    const parts = [P('mb', 'microbit'), P('bat', 'battery'), P('l', 'led')];
    const pw = W('bat:PLUG', 'mb:BAT');
    expect(ids(parts, [pw, W('l:A', 'mb:P0'), W('l:K', 'mb:P1')])).not.toContain('led-open');
    expect(ids(parts, [pw, W('l:A', 'mb:P0')])).toContain('led-open');
  });
  it('l\'errore più preciso viene prima', () => {
    const parts = [P('mb', 'microbit'), P('bat', 'battery'), P('s', 'servo')];
    expect(ids(parts, [W('bat:PLUG', 'mb:BAT'), W('s:SIG', 'mb:3V')])[0]).toBe('servo-sig-power');
  });
  it('errore di scrittura in italiano, senza testo inglese', () => {
    expect(() => transpile('basic.showNumber(1 2)')).toThrow(/riga 1/);
    try { transpile('basic.showNumber(1 2)'); } catch (e: any) { expect(e.message).not.toMatch(/Unexpected|expected/); }
  });
});

describe('Luna, il cagnolino di carta', () => {
  it('il cavo USB accende il micro:bit', () => {
    const parts = [P('mb', 'microbit'), P('pc', 'usb')];
    expect(analyze(parts, []).powered.size).toBe(0);
    expect(analyze(parts, [W('pc:USBPLUG', 'mb:USB')]).powered.has('mb')).toBe(true);
    expect(ids(parts, [])).toContain('microbit-off');
  });
  it('ogni spina va solo nella sua presa', () => {
    const parts = [P('mb', 'microbit'), P('pc', 'usb'), P('bat', 'battery')];
    expect(canConnect(parts, [], 'pc:USBPLUG', 'mb:BAT')).toMatch(/USB/);
    expect(canConnect(parts, [], 'bat:PLUG', 'mb:USB')).toBeTruthy();
    expect(canConnect(parts, [], 'pc:USBPLUG', 'mb:USB')).toBeNull();
    expect(canConnect(parts, [], 'bat:PLUG', 'mb:BAT')).toBeNull();
  });
  it('USB e pile insieme: nessun errore', () => {
    const parts = [P('mb', 'microbit'), P('pc', 'usb'), P('bat', 'battery')];
    const a = analyze(parts, [W('pc:USBPLUG', 'mb:USB'), W('bat:PLUG', 'mb:BAT')]);
    expect(a.powered.has('mb')).toBe(true);
    expect(a.issues.filter(i => i.level === 'error')).toEqual([]);
  });
  it('la stagnola collegata al pin 1 è nella stessa rete', () => {
    const parts = [P('mb', 'microbit'), P('f', 'foilPatch')];
    expect(analyze(parts, [W('f:F', 'mb:P1')]).nets.same('f:F', 'mb:P1')).toBe(true);
  });
  it('accarezzare la stagnola fa scodinzolare la coda', async () => {
    const { levelById } = await import('../src/data/levels');
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(levelById('paperpet')!.code.replace(/pause\(300\)/g, 'pause(20)'));
    await wait(60);
    expect(f.servo.filter(s => s[1] !== null).map(s => s[1])).toEqual([90]);
    rt.touchPin('P1', true);
    await wait(120);
    rt.touchPin('P1', false);
    await wait(60);
    const n = f.servo.length;
    await wait(80);
    expect(f.servo.length).toBe(n); // tolta la mano, si ferma
    const angles = f.servo.slice(1).map(s => s[1]);
    expect(angles).toContain(60);
    expect(angles).toContain(120);
    expect(rt.stats.pins.has('P1')).toBe(true);
    rt.stop();
    expect(f.errors).toEqual([]);
  });
});

describe('Il contapassi', () => {
  it('conta i passi e al decimo mostra la faccina', async () => {
    const { levelById } = await import('../src/data/levels');
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(levelById('contapassi')!.code);
    await wait(30);
    expect(rt.stats.textsShown).toContain('0');
    rt.gesture('Shake');
    await wait(400);
    expect(rt.stats.textsShown).toContain('1');
    for (let i = 0; i < 9; i++) { rt.gesture('Shake'); await wait(5); } // passi veloci: non se ne perde nessuno
    await wait(450);
    expect(rt.stats.shakes).toBe(10);
    expect(rt.stats.iconsShown.has('Happy')).toBe(true);
    rt.stop();
    expect(f.errors).toEqual([]);
  });
  it('micro:bit e pile si allacciano solo alla fascia', async () => {
    const { mountOf } = await import('../src/data/parts');
    expect(mountOf('microbit')).toBe('strap');
    expect(mountOf('battery')).toBe('strap');
    expect(mountOf('strap')).toBeNull();
  });
});

describe('La luce notturna', () => {
  it('al buio accende tutte le lucine, con la luce le spegne', async () => {
    const { levelById } = await import('../src/data/levels');
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.setSensor('light', 200);
    rt.start(levelById('lucenotte')!.code);
    await wait(80);
    expect(f.frames.at(-1)).toBe('0'.repeat(25));
    rt.setSensor('light', 0);
    await wait(500);
    expect(f.frames.at(-1)).toBe('1'.repeat(25));
    rt.setSensor('light', 200);
    await wait(600);
    expect(f.frames.at(-1)).toBe('0'.repeat(25));
    expect(rt.stats.clearsAfterLeds).toBeGreaterThan(0);
    rt.stop();
    expect(f.errors).toEqual([]);
  });
});

describe('Sasso, carta, forbice', () => {
  it('a ogni scossa sceglie una delle tre mani', async () => {
    const { levelById } = await import('../src/data/levels');
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(levelById('sasso')!.code);
    await wait(20);
    for (let i = 0; i < 12; i++) { rt.gesture('Shake'); await wait(650); }
    const seen = [...rt.stats.iconsShown];
    expect(seen.every(n => ['SmallSquare', 'Square', 'Scissors'].includes(n))).toBe(true);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(['SmallSquare', 'Square', 'Scissors']).toContain(rt.lastIcon);
    rt.stop();
    expect(f.errors).toEqual([]);
  }, 15000);
});

describe('Il tester dei conduttori', () => {
  it('circuito chiuso sul pin 1: cuore; aperto: spento', async () => {
    const { levelById } = await import('../src/data/levels');
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    rt.start(levelById('tester')!.code);
    await wait(60);
    expect(f.frames.at(-1)).toBe('0'.repeat(25));
    rt.touchPin('P1', true);
    await wait(80);
    expect(rt.lastIcon).toBe('Heart');
    rt.touchPin('P1', false);
    await wait(700);
    expect(f.frames.at(-1)).toBe('0'.repeat(25));
    expect(rt.lastIcon).toBe('');
    rt.stop();
  });
  it('gli oggetti da provare: metalli e banana conducono, gomma e plastica no', async () => {
    const { PARTS, mountsOf } = await import('../src/data/parts');
    expect(['coin', 'banana', 'foilBall'].every(t => PARTS[t].conductive)).toBe(true);
    expect(['eraser', 'plasticCap'].some(t => PARTS[t].conductive)).toBe(false);
    expect(['coin', 'banana', 'eraser', 'plasticCap', 'foilBall'].every(t => mountsOf(t).includes('testPad'))).toBe(true);
  });
});

describe('Non toccare il filo', () => {
  it('se l\'anello tocca il filo: X e suono; se no: faccina felice', async () => {
    const { levelById } = await import('../src/data/levels');
    let tones = 0;
    const f = fakeBridge();
    f.b.tone = () => { tones++; };
    const rt = new MicrobitRuntime(f.b);
    rt.start(levelById('filo')!.code);
    await wait(80);
    expect(rt.lastIcon).toBe('Happy');
    rt.touchPin('P0', true);
    await wait(1300);
    expect(rt.stats.iconsShown.has('No')).toBe(true);
    expect(tones).toBeGreaterThan(0);
    rt.touchPin('P0', false);
    await wait(1400);
    expect(rt.lastIcon).toBe('Happy');
    rt.stop();
    expect(f.errors).toEqual([]);
  });
});

describe('Il piano di frutta', () => {
  it('ogni frutto (pin) suona la sua nota', async () => {
    const { levelById } = await import('../src/data/levels');
    const notes: number[] = [];
    const f = fakeBridge();
    f.b.tone = (fr: number) => { notes.push(Math.round(fr)); };
    const rt = new MicrobitRuntime(f.b);
    rt.start(levelById('frutta')!.code);
    await wait(30);
    for (const p of ['P0', 'P1', 'P2']) { rt.touchPin(p, true); await wait(20); rt.touchPin(p, false); await wait(950); }
    expect(notes).toEqual([262, 330, 392]);
    expect(rt.stats.iconsShown.has('EighthNote')).toBe(true);
    rt.stop();
    expect(f.errors).toEqual([]);
  }, 10000);
});

describe('radio', () => {
  function pair() {
    const a = fakeBridge(), b = fakeBridge();
    const ra = new MicrobitRuntime(a.b), rb = new MicrobitRuntime(b.b);
    const all = [ra, rb];
    const bus = { send: (from: MicrobitRuntime, p: any) => { for (const r of all) if (r !== from) setTimeout(() => r.receive(p, -50), 5); } };
    ra.bus = bus; rb.bus = bus;
    return { a, b, ra, rb };
  }
  it('un numero arriva solo a chi ha lo stesso gruppo', async () => {
    const { ra, rb } = pair();
    const code = `radio.setGroup(1)
input.onButtonPressed(Button.A, function () { radio.sendNumber(1) })
radio.onReceivedNumber(function (receivedNumber) { if (receivedNumber == 1) { basic.showIcon(IconNames.Happy) } })`;
    ra.start(code); rb.start(code);
    await wait(30);
    ra.pressButton('A', true); ra.pressButton('A', false);
    await wait(60);
    expect(rb.stats.iconsShown.has('Happy')).toBe(true);
    expect(ra.stats.iconsShown.has('Happy')).toBe(false);
    rb.start(code.replace('setGroup(1)', 'setGroup(7)'));
    await wait(30);
    ra.pressButton('A', true); ra.pressButton('A', false);
    await wait(60);
    expect(rb.stats.iconsShown.has('Happy')).toBe(false);
    ra.stop(); rb.stop();
  });
  it('forza del segnale nel pacchetto', async () => {
    const { ra, rb } = pair();
    rb.start(`radio.setGroup(1)
radio.onReceivedNumber(function (receivedNumber) { basic.showNumber(radio.receivedPacket(RadioPacketProperty.SignalStrength)) })`);
    ra.start(`radio.setGroup(1)
radio.sendNumber(0)`);
    await wait(80);
    expect(rb.stats.textsShown).toContain('-50');
    ra.stop(); rb.stop();
  });
});

describe('Mostro del latte e catapulta', () => {
  it('la bocca: chiusa dove hai legato lo spago, aperta quando il servo torna indietro', async () => {
    const { jawOpen } = await import('../src/scene/builders');
    expect(jawOpen(180, 180)).toBe(0);
    expect(jawOpen(100, 180)).toBeCloseTo(1.1);
    expect(jawOpen(140, 180)).toBeGreaterThan(0);
    expect(jawOpen(140, 180)).toBeLessThan(jawOpen(100, 180));
    // spago legato con il servo storto (non calibrato): la bocca non si apre più
    expect(jawOpen(100, 90)).toBe(0);
  });
  it('il servo si monta su Luna, sul mostro e sulla catapulta; il micro:bit fa da occhio al mostro', async () => {
    const { mountsOf } = await import('../src/data/parts');
    expect(mountsOf('servo')).toEqual(['petBody', 'milkCarton', 'catapultBase']);
    expect(mountsOf('microbit')).toEqual(['strap', 'cardStand', 'milkCarton']);
    expect(mountsOf('catapultLatch')).toEqual(['horn']);
    expect(mountsOf('milkString')).toEqual(['horn']);
  });
  it('il codice del mostro: buio = bocca aperta, luce = bocca chiusa', async () => {
    const { LEVELS } = await import('../src/data/levels');
    const lv = LEVELS.find(l => l.id === 'mostro')!;
    const f = fakeBridge();
    const rt = new MicrobitRuntime(f.b);
    const writes = { at: (i: number) => f.servo.at(i)?.[1] };
    rt.setSensor('light', 200);
    rt.start(lv.code);
    await wait(60);
    expect(writes.at(-1)).toBe(180);
    rt.setSensor('light', 0);
    await wait(60);
    expect(writes.at(-1)).toBe(100);
    rt.stop();
  });
  it('il servo che ha già lo spago legato parte dove era calibrato', async () => {
    const hw = new Hardware({ display() {}, servo() {}, led() {}, issue() {}, tone() {}, log() {}, error() {} } as any);
    hw.setCircuit([{ id: 's1', type: 'servo', x: 0, z: 0, rot: 0 }, { id: 'k', type: 'milkString', x: 0, z: 0, rot: 0, attachedTo: 's1', rest: 180 }], []);
    expect(hw.servoAngle.get('s1')).toBe(180);
  });
});

describe('I cavi sul banco', () => {
  it('un cavo lungo si appoggia sul banco, non sta in aria', async () => {
    const { wirePath } = await import('../src/scene/wirepath');
    const pts = wirePath([0, 0.5, 0], [20, 0.5, 0]);
    expect(pts[0][1]).toBeCloseTo(0.8);
    expect(pts.at(-1)![1]).toBeCloseTo(0.8);
    const mid = pts[Math.floor(pts.length / 2)];
    expect(mid[1]).toBeLessThan(0.5);
    expect(Math.min(...pts.map(p => p[1]))).toBeGreaterThanOrEqual(0.2);
  });
  it('passa sopra un pezzo che trova sulla strada, non ci passa attraverso', async () => {
    const { wirePath } = await import('../src/scene/wirepath');
    const box = { minX: 8, maxX: 12, minZ: -2, maxZ: 2, top: 5 };
    const pts = wirePath([0, 0.5, 0], [20, 0.5, 0], [box]);
    for (const p of pts) if (p[0] > 8 && p[0] < 12) expect(p[1]).toBeGreaterThanOrEqual(5.3);
    // lontano dal pezzo torna giù
    expect(pts[2][1]).toBeLessThan(2);
  });
  it('un cavo corto fa un archetto; un cavo che parte dall\'alto scende piano', async () => {
    const { wirePath } = await import('../src/scene/wirepath');
    const short = wirePath([0, 0.5, 0], [3, 0.5, 0]);
    expect(Math.max(...short.map(p => p[1]))).toBeGreaterThan(0.8);
    const high = wirePath([0, 10, 0], [20, 0.5, 0]);
    for (let i = 1; i < high.length; i++) expect(high[i][1]).toBeLessThanOrEqual(high[i - 1][1] + 0.9);
    expect(high[2][1]).toBeGreaterThan(5);
  });
  it('due cavi tra gli stessi pezzi non si sovrappongono', async () => {
    const { wirePath } = await import('../src/scene/wirepath');
    const a = wirePath([0, 0.5, 0], [20, 0.5, 0], [], 0), b = wirePath([0, 0.5, 0], [20, 0.5, 0], [], 4);
    expect(Math.abs(a[9][2] - b[9][2])).toBeGreaterThan(0.5);
  });
});

describe('Una cosa alla volta e parole nuove', () => {
  it('"Premi Prova! Poi..." e "Premi Ferma. Poi..." si dividono da soli in due azioni', async () => {
    const { actsOf } = await import('../src/data/levels');
    const goal = () => false;
    const a = actsOf({ title: 't', mode: 'code', text: 'Premi Prova! Poi premi la luna: si fa buio.', goal });
    expect(a.map(x => x.text)).toEqual(['Premi Prova!', 'Premi la luna: si fa buio.']);
    expect(a[0].done({ running: true } as any)).toBe(true);
    expect(a[1].done).toBe(goal);
    const b = actsOf({ title: 't', mode: 'build', text: 'Premi Ferma. Poi trascina lo spago.', goal });
    expect(b.map(x => x.text)).toEqual(['Premi Ferma.', 'Trascina lo spago.']);
    expect(b[0].done({ running: false } as any)).toBe(true);
    expect(actsOf({ title: 't', mode: 'build', text: 'Trascina il servo.', goal })).toHaveLength(1);
  });
  it('nessuna azione è più lunga di 16 parole; ogni progetto ha la sua parola con una domanda valida', async () => {
    const { LEVELS, actsOf } = await import('../src/data/levels');
    const long: string[] = [];
    for (const l of LEVELS) {
      for (const s of l.steps) for (const a of actsOf(s)) if (a.text.split(/\s+/).length > 16) long.push(`${l.id}: ${a.text}`);
      expect(l.word, l.id).toBeTruthy();
      expect(l.word!.quiz.options).toHaveLength(3);
      expect(l.word!.quiz.answer).toBeGreaterThanOrEqual(0);
      expect(l.word!.quiz.answer).toBeLessThan(3);
    }
    expect(long).toEqual([]);
    expect(new Set(LEVELS.map(l => l.word!.term)).size).toBe(LEVELS.length);
  });
});
