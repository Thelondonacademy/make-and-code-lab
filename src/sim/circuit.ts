// Il controllore dei collegamenti: capisce che cosa è collegato a cosa
// e trova gli errori, spiegandoli con parole semplici.
import { PARTS } from '../data/parts';

export interface PartInst {
  id: string;
  type: string;
  x: number;
  z: number;
  y?: number;
  rot: number;           // giri da 45° attorno all'asse verticale
  tilt?: number;         // 1 = sdraiato su un fianco
  attachedTo?: string;   // id del servo a cui è attaccato (materiali)
}

export interface Wire {
  id: string;
  a: string;   // "idPezzo:idMorsetto"
  b: string;
  color: string;
}

export type IssueLevel = 'error' | 'warning' | 'tip';
export interface Issue {
  id: string;
  level: IssueLevel;
  title: string;
  text: string;
  refs: string[]; // morsetti da evidenziare
}

/** Insieme di nodi collegati tra loro (union-find). */
class Groups {
  private p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    let c = x;
    while (this.p.get(c) !== r) { const n = this.p.get(c)!; this.p.set(c, r); c = n; }
    return r;
  }
  join(a: string, b: string) { this.p.set(this.find(a), this.find(b)); }
  same(a: string, b: string) { return this.find(a) === this.find(b); }
}

export interface ServoInfo { id: string; powered: boolean; grounded: boolean; sig: { mb: string; pin: string } | null }
export interface LedInfo { id: string }

export interface Analysis {
  nets: Groups;       // solo fili (per i cortocircuiti)
  paths: Groups;      // fili + resistenze (per i LED)
  powered: Set<string>;   // micro:bit accesi
  issues: Issue[];
  servos: ServoInfo[];
  microbits: string[];
}

export const PIN_PADS = ['P0', 'P1', 'P2'];
const ref = (part: string, t: string) => `${part}:${t}`;

export function analyze(parts: PartInst[], wires: Wire[]): Analysis {
  const byId = new Map(parts.map(p => [p.id, p]));
  const nets = new Groups();
  const paths = new Groups();
  const powered = new Set<string>();
  const issues: Issue[] = [];
  const microbits = parts.filter(p => p.type === 'microbit').map(p => p.id);
  const add = (i: Issue) => { if (!issues.some(x => x.id === i.id && x.refs.join() === i.refs.join())) issues.push(i); };

  for (const p of parts) for (const t of PARTS[p.type]?.terminals || []) { nets.find(ref(p.id, t.id)); paths.find(ref(p.id, t.id)); }

  for (const w of wires) {
    const [pa, ta] = w.a.split(':');
    const [pb, tb] = w.b.split(':');
    if (!byId.has(pa) || !byId.has(pb)) continue;
    const A = byId.get(pa)!, B = byId.get(pb)!;
    // spina delle pile o cavo USB nella presa del micro:bit: lo accendono
    const plug = (P: PartInst, t: string, Q: PartInst, u: string) => {
      const def = PARTS[P.type]?.terminals.find(x => x.id === t);
      return def?.kind === 'plug' && Q.type === 'microbit' && def.fits === u;
    };
    if (plug(A, ta, B, tb)) { powered.add(B.id); continue; }
    if (plug(B, tb, A, ta)) { powered.add(A.id); continue; }
    nets.join(w.a, w.b);
    paths.join(w.a, w.b);
  }
  // le resistenze collegano le loro due gambe (solo per i percorsi dei LED)
  for (const p of parts) if (p.type === 'resistor') paths.join(ref(p.id, 'A'), ref(p.id, 'B'));

  const hasIn = (g: Groups, node: string, pred: (part: PartInst, term: string) => boolean) => {
    for (const p of parts) for (const t of PARTS[p.type]?.terminals || []) {
      if (pred(p, t.id) && g.same(node, ref(p.id, t.id))) return true;
    }
    return false;
  };
  const isPower = (p: PartInst, t: string) => p.type === 'microbit' && t === '3V' && powered.has(p.id);
  const isGnd = (p: PartInst, t: string) => p.type === 'microbit' && t === 'GND';
  const isPin = (p: PartInst, t: string) => p.type === 'microbit' && PIN_PADS.includes(t);
  const pinOn = (g: Groups, node: string) => {
    for (const mb of microbits) for (const pin of PIN_PADS) if (g.same(node, ref(mb, pin))) return { mb, pin };
    return null;
  };

  // micro:bit spento
  for (const mb of microbits) {
    if (!powered.has(mb)) {
      const bat = parts.find(p => p.type === 'battery');
      const usb = parts.find(p => p.type === 'usb');
      add({
        id: 'microbit-off', level: 'error', title: 'Il micro:bit è spento',
        text: usb ? 'Collega il cavo USB del computer alla presa piccola in alto del micro:bit.'
          : bat ? 'Collega la spina delle pile alla presa in alto del micro:bit.'
            : 'Dagli energia: prendi le pile o il computer con il cavo USB, nella famiglia Energia.',
        refs: usb ? [ref(mb, 'USB'), ref(usb.id, 'USBPLUG')] : bat ? [ref(mb, 'BAT'), ref(bat.id, 'PLUG')] : [ref(mb, 'BAT')],
      });
    }
  }

  // cortocircuito 3V-GND
  for (const mb of microbits) {
    if (!powered.has(mb)) continue;
    if (hasIn(nets, ref(mb, '3V'), isGnd)) {
      add({ id: 'short', level: 'error', title: 'Cortocircuito!', text: 'Il 3V è collegato dritto al GND. L\'energia scappa via e le pile si scaldano. Togli quel filo.', refs: [ref(mb, '3V'), ref(mb, 'GND')] });
    }
  }

  // servo
  const servos: ServoInfo[] = [];
  for (const s of parts.filter(p => p.type === 'servo')) {
    const vcc = ref(s.id, 'VCC'), gnd = ref(s.id, 'GND'), sig = ref(s.id, 'SIG');
    const vccPower = hasIn(nets, vcc, isPower);
    const gndOk = hasIn(nets, gnd, isGnd);
    const sigPin = pinOn(nets, sig);
    servos.push({ id: s.id, powered: vccPower, grounded: gndOk, sig: sigPin });
    const is3V = (p: PartInst, t: string) => p.type === 'microbit' && t === '3V';
    const reversed = hasIn(nets, vcc, isGnd) && hasIn(nets, gnd, is3V) && !hasIn(nets, vcc, is3V) && !hasIn(nets, gnd, isGnd);
    if (reversed) {
      add({ id: 'servo-reversed', level: 'error', title: 'Rosso e marrone sono scambiati', text: 'Il filo rosso va al 3V e il marrone al GND. Al contrario il servo si può rompere.', refs: [vcc, gnd] });
      continue;
    }
    if (pinOn(nets, vcc)) add({ id: 'servo-vcc-pin', level: 'error', title: 'Il filo rosso è su un pin', text: 'Il filo rosso porta l\'energia: va al 3V. I pin servono per i messaggi.', refs: [vcc] });
    else if (!vccPower) add({ id: 'servo-no-power', level: 'error', title: 'Il servo non ha energia', text: 'Collega il filo rosso del servo al 3V del micro:bit.', refs: [vcc] });
    if (!gndOk) add({ id: 'servo-no-gnd', level: 'error', title: 'L\'energia non torna indietro', text: 'Collega il filo marrone del servo al GND. L\'energia deve fare il giro.', refs: [gnd] });
    if (hasIn(nets, sig, (p, t) => p.type === 'microbit' && (t === '3V' || t === 'GND'))) {
      add({ id: 'servo-sig-power', level: 'error', title: 'Il filo arancione è nel posto sbagliato', text: 'Il filo arancione porta il messaggio: va su un pin: lo 0, l\'1 o il 2.', refs: [sig] });
    } else if (!sigPin) {
      add({ id: 'servo-no-signal', level: 'error', title: 'Il servo non riceve messaggi', text: 'Collega il filo arancione del servo al pin 0.', refs: [sig] });
    }
  }

  // LED
  for (const l of parts.filter(p => p.type === 'led')) {
    const a = ref(l.id, 'A'), k = ref(l.id, 'K');
    const aHigh = hasIn(paths, a, (p, t) => isPower(p, t) || isPin(p, t));
    const kLow = hasIn(paths, k, isGnd);
    const aLow = hasIn(paths, a, isGnd);
    const kHigh = hasIn(paths, k, (p, t) => isPower(p, t) || isPin(p, t));
    if (aLow && kHigh) {
      add({ id: 'led-reversed', level: 'error', title: 'Il LED è al contrario', text: 'La gamba lunga (+) va verso il pin. La gamba corta (−) va al GND.', refs: [a, k] });
    } else if (aHigh && kLow) {
      const direct = hasIn(nets, a, (p, t) => isPower(p, t) || isPin(p, t)) && hasIn(nets, k, isGnd);
      if (direct) add({ id: 'led-no-resistor', level: 'warning', title: 'Metti una resistenza', text: 'La resistenza è come un rubinetto: fa passare poca energia e protegge il LED.', refs: [a, k] });
    } else if (wires.some(w => [w.a, w.b].includes(a)) !== wires.some(w => [w.a, w.b].includes(k))) {
      add({ id: 'led-open', level: 'tip', title: 'Il LED ha una gamba libera', text: 'Per accendersi il LED ha bisogno di due fili: uno sulla gamba lunga e uno sulla corta.', refs: [a, k] });
    }
  }

  // prima gli errori più precisi (di solito è l'ultimo filo messo), poi quelli generali
  const PRIORITY: Record<string, number> = { short: 0, 'servo-reversed': 1, 'servo-sig-power': 2, 'servo-vcc-pin': 3, 'led-reversed': 4, 'microbit-off': 5 };
  issues.sort((x, y) => (PRIORITY[x.id] ?? 9) - (PRIORITY[y.id] ?? 9));
  return { nets, paths, powered, issues, servos, microbits };
}

/** Si può collegare un filo tra questi due morsetti? Se no, restituisce il motivo. */
export function canConnect(parts: PartInst[], wires: Wire[], a: string, b: string): string | null {
  if (a === b) return 'Scegli un altro punto: un filo deve avere due capi diversi.';
  const [pa, ta] = a.split(':');
  const [pb, tb] = b.split(':');
  if (pa === pb) return 'Un filo tra due punti dello stesso pezzo non serve.';
  const A = parts.find(p => p.id === pa), B = parts.find(p => p.id === pb);
  if (!A || !B) return 'Questo pezzo non c\'è più.';
  const dA = PARTS[A.type].terminals.find(t => t.id === ta);
  const dB = PARTS[B.type].terminals.find(t => t.id === tb);
  const kA = dA?.kind, kB = dB?.kind;
  const plugA = kA === 'plug' || kA === 'socket', plugB = kB === 'plug' || kB === 'socket';
  if (plugA || plugB) {
    const plugDef = kA === 'plug' ? dA : kB === 'plug' ? dB : null;
    const sockId = kA === 'socket' ? ta : kB === 'socket' ? tb : null;
    const what = plugDef?.fits === 'USB' ? 'Il cavo USB entra solo nella presa USB in alto del micro:bit.' : 'La spina delle pile entra solo nella presa delle pile in alto del micro:bit.';
    if (!plugDef || !sockId) return plugDef ? what : 'Qui va una spina: le pile o il cavo USB.';
    if (plugDef.fits !== sockId) return what;
    const used = wires.some(w => w.a === a || w.b === a || w.a === b || w.b === b);
    if (used) return 'Questa presa è già occupata.';
    return null;
  }
  if (wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return 'Questi due punti sono già collegati.';
  return null;
}
