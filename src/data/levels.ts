// I livelli seguono le lezioni del corso Make & Code Lab.
// Testi per bambini di 6-8 anni: una cosa per volta, frasi corte.
import type { PartInst, Wire, Analysis } from '../sim/circuit';
import type { RunStats } from '../sim/runtime';

export type Mode = 'build' | 'wire' | 'code';

export interface LevelCtx {
  parts: PartInst[];
  wires: Wire[];
  analysis: Analysis;
  running: boolean;
  stats: RunStats | null;
  servoMoves: number;
  code: string;
  codeChangedSinceStart: boolean;
  ranChangedCode: boolean;
  runInStep: boolean;     // la prova in corso è partita durante questo passo, con il codice di adesso
  icon: string;           // il disegno che il micro:bit mostra adesso ('' = spento)
  tested: Record<string, boolean>; // oggetti provati sul piano di prova: conduce sì/no
  game: { touches: number; finished: boolean; played: boolean; throws: number; hits: number; bands?: number; loaded?: boolean }; // filo, tesoro, catapulta
  friend: RunStats | null;  // il micro:bit dell'amico (radio)
  angles: Record<string, number>; // dove sono i bracci dei servo adesso
}

/** Le pause nel codice (basic.pause(N)). */
const pauses = (code: string) => [...code.matchAll(/basic\.pause\((\d+)\)/g)].map(m => Number(m[1]));
/** I disegni usati nel codice. */
const icons = (code: string) => [...code.matchAll(/IconNames\.(\w+)/g)].map(m => m[1]);

export interface Step {
  title: string;
  text: string;
  mode: Mode;
  goal: (c: LevelCtx) => boolean;
  checklist?: (c: LevelCtx) => { label: string; color?: string; done: boolean }[];
  why?: { q: string; a: string };
  /** Una cosa alla volta: il passo diviso in azioni brevi. Si vede solo la prima non ancora fatta. */
  acts?: Act[];
  /** Il gesto da mostrare con la manina, se il bambino resta fermo. */
  show?: Show;
}
export interface Act { text: string; done: (c: LevelCtx) => boolean }
export type Show =
  | { add: string | string[] }                     // tocca questo pezzo tra "I miei pezzi" (il primo che manca)
  | { drag: [string, string] | [string, string][] } // trascina il primo pezzo sopra il secondo ('horn' = il braccio del servo)
  | { wire: [string, string][] };                  // tocca un cerchietto, poi l'altro: 'servo:GND' → 'microbit:GND' ('testPad:A|B' = uno dei due)

/** La parola nuova del progetto, con una domanda per vedere se è rimasta in testa. */
export interface Word { term: string; means: string; quiz: { q: string; options: string[]; answer: number } }

/** Le azioni di un passo. Se non sono scritte a mano, "Premi Prova! Poi..." e "Premi Ferma. Poi..." si dividono da soli. */
export function actsOf(s: Step): Act[] {
  if (s.acts) return s.acts;
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  let m = s.text.match(/^Premi Prova!\s+(?:Poi\s+)?(.+)$/);
  if (m) return [{ text: 'Premi Prova!', done: c => c.running }, { text: cap(m[1]), done: s.goal }];
  m = s.text.match(/^Premi Ferma\.\s+(?:Poi\s+)?(.+)$/);
  if (m) return [{ text: 'Premi Ferma.', done: c => !c.running }, { text: cap(m[1]), done: s.goal }];
  return [{ text: s.text, done: s.goal }];
}
const SERVO_WIRES: [string, string][] = [['servo:GND', 'microbit:GND'], ['servo:VCC', 'microbit:3V'], ['servo:SIG', 'microbit:P0']];
const POWER_WIRES: [string, string][] = [['battery:PLUG', 'microbit:BAT']];
/** Ha premuto Prova! in questo passo, con il codice di adesso. */
const ran = (c: LevelCtx) => c.runInStep;

export interface Level {
  id: string;
  rev?: number;          // si alza quando il livello cambia tanto: i lavori salvati prima ripartono da capo
  lesson: number;
  title: string;
  icon: string;          // icona game-icons
  intro: string;
  palette: string[];     // pezzi che si possono usare
  start: { parts: PartInst[]; wires: Wire[] };
  code: string;          // codice MakeCode (main.ts)
  namespaces: string[];  // categorie di blocchi visibili in MakeCode
  dependencies: Record<string, string>;
  steps: Step[];
  real: { materials: string[]; safety: [string, string][]; printable?: { label: string; file: string } };
  word?: Word;
}

export interface LessonDef {
  n: number;
  title: string;
  projects: { icon: string; title: string; level?: string }[];
}

const has = (c: LevelCtx, type: string) => c.parts.some(p => p.type === type);
const count = (c: LevelCtx, type: string) => c.parts.filter(p => p.type === type).length;
/** Il gruppo della radio nel codice (radio.setGroup(N)). */
const radioGroup = (code: string) => { const m = code.match(/radio\.setGroup\((\d+)\)/); return m ? Number(m[1]) : null; };
/** La soglia della caccia al tesoro (SignalStrength) > N). */
const huntLimit = (code: string) => { const m = code.match(/SignalStrength\)\s*>\s*(-?\d+)/); return m ? Number(m[1]) : null; };
const powered = (c: LevelCtx) => c.analysis.powered.size > 0;
const onHost = (c: LevelCtx, type: string, host: string) => c.parts.some(p => p.type === type && c.parts.find(h => h.id === p.attachedTo)?.type === host);
/** La soglia di buio della luce notturna (lightLevel() < N). */
const lightGoal = (code: string) => { const m = code.match(/lightLevel\(\)\s*<\s*(\d+)/); return m ? Number(m[1]) : null; };
/** Il piano di prova è collegato tra il pin 1 e il GND (in un verso o nell'altro). */
const padWired = (c: LevelCtx) => {
  const pad = c.parts.find(p => p.type === 'testPad');
  const n = c.analysis.nets;
  return !!pad && c.parts.some(mb => mb.type === 'microbit' && ((n.same(`${mb.id}:P1`, `${pad.id}:A`) && n.same(`${mb.id}:GND`, `${pad.id}:B`)) || (n.same(`${mb.id}:P1`, `${pad.id}:B`) && n.same(`${mb.id}:GND`, `${pad.id}:A`))));
};
/** Il gioco del filo è collegato: un capo al GND e l'altro a un pin. */
const buzzWired = (c: LevelCtx) => {
  const bw = c.parts.find(p => p.type === 'buzzWire');
  const n = c.analysis.nets;
  return !!bw && c.parts.some(mb => mb.type === 'microbit' && ((n.same(`${mb.id}:P0`, `${bw.id}:L`) && n.same(`${mb.id}:GND`, `${bw.id}:W`)) || (n.same(`${mb.id}:P0`, `${bw.id}:W`) && n.same(`${mb.id}:GND`, `${bw.id}:L`))));
};
/** Un frutto è collegato a un punto del micro:bit. */
const fruitOn = (c: LevelCtx, type: string, pin: string) => {
  const f = c.parts.find(p => p.type === type);
  return !!f && c.parts.some(mb => mb.type === 'microbit' && c.analysis.nets.same(`${f.id}:F`, `${mb.id}:${pin}`));
};
/** Sul piano c'è un oggetto che conduce. */
const padConducts = (c: LevelCtx) => c.parts.some(o => c.parts.find(h => h.id === o.attachedTo)?.type === 'testPad' && ['coin', 'banana', 'foilBall'].includes(o.type));
const onStrap = (c: LevelCtx, type: string) => c.parts.some(p => p.type === type && c.parts.find(h => h.id === p.attachedTo)?.type === 'strap');
/** Il numero di passi del traguardo (passi < N). */
const stepGoal = (code: string) => { const m = code.match(/passi\s*<\s*(\d+)/); return m ? Number(m[1]) : null; };
const foilOn = (c: LevelCtx, pin: string) => {
  const f = c.parts.find(p => p.type === 'foilPatch');
  return !!f && c.parts.some(mb => mb.type === 'microbit' && c.analysis.nets.same(`${f.id}:F`, `${mb.id}:${pin}`));
};
const servoOk = (c: LevelCtx) => c.analysis.servos.some(s => s.powered && s.grounded && s.sig?.pin === 'P0');
/** I tre fili del servo al loro posto (lezione 4: 3V, GND, pin 0). */
const servoChecklist = (c: LevelCtx) => {
  const s = c.parts.find(p => p.type === 'servo');
  const mb = c.parts.find(p => p.type === 'microbit');
  const ok = (t: string, target: string) => !!s && !!mb && c.analysis.nets.same(`${s.id}:${t}`, `${mb.id}:${target}`);
  return [
    { label: 'Marrone → GND', color: '#7A4A22', done: ok('GND', 'GND') },
    { label: 'Rosso → 3V', color: '#E5484D', done: ok('VCC', '3V') },
    { label: 'Arancione → pin 0', color: '#F7941D', done: ok('SIG', 'P0') },
  ];
};
/** Il servo poggiato sul pezzo `host` e dove è il suo braccio adesso. */
const hostServo = (c: LevelCtx, host: string) => c.parts.find(p => p.type === 'servo' && c.parts.find(h => h.id === p.attachedTo)?.type === host);
const servoAt = (c: LevelCtx, host: string, angle: number) => { const s = hostServo(c, host); return !!s && Math.abs((c.angles[s.id] ?? 90) - angle) < 3; };
/** Il pezzo legato al braccio del servo di `host` (spago, fermo). */
const onServoOf = (c: LevelCtx, type: string, host: string) => { const s = hostServo(c, host); return s ? c.parts.find(p => p.type === type && p.attachedTo === s.id) : undefined; };

export const LEVELS: Level[] = [
  {
    id: 'cuore',
    lesson: 1,
    title: 'Il cuore che batte',
    icon: 'gi:heart-beats',
    intro: 'Il micro:bit disegna un cuore che batte, come il tuo!',
    palette: ['microbit', 'battery'],
    start: { parts: [], wires: [] },
    code: `basic.forever(function () {
    basic.showIcon(IconNames.Heart)
    basic.showIcon(IconNames.SmallHeart)
})
`,
    namespaces: ['basic', 'input', 'music', 'loops'],
    dependencies: { core: '*' },
    steps: [
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco. È il cervello del progetto.', show: { add: 'microbit' }, goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Ora trascina le pile vicino al micro:bit.', show: { add: 'battery' }, goal: c => has(c, 'battery') },
      {
        title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa in alto sul micro:bit.',
        show: { wire: POWER_WIRES },
        goal: powered, why: { q: 'Perché servono le pile?', a: 'Le pile danno l\'energia. Senza energia il micro:bit dorme.' },
      },
      {
        title: 'Guarda il cuore', mode: 'code', text: 'Il codice è già pronto. Premi Prova! e guarda le lucine.',
        goal: c => c.running && !!c.stats && c.stats.iconsShown.size > 0,
        why: { q: 'Cosa fa il blocco "per sempre"?', a: 'Ripete i blocchi dentro di lui, ancora e ancora, senza fermarsi mai.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Nel codice scegli un altro disegno al posto del cuore. Poi premi Prova!',
        acts: [{ text: 'Nel codice scegli un altro disegno al posto del cuore.', done: c => icons(c.code).some(n => n !== 'Heart' && n !== 'SmallHeart') || /showLeds|showString|showNumber|showArrow/.test(c.code) }, { text: 'Premi Prova!', done: c => c.runInStep && (icons(c.code).some(n => n !== 'Heart' && n !== 'SmallHeart') || /showLeds|showString|showNumber|showArrow/.test(c.code)) && !!c.stats && c.stats.iconsShown.size + c.stats.textsShown.length > 0 }],
        goal: c => c.runInStep && (icons(c.code).some(n => n !== 'Heart' && n !== 'SmallHeart') || /showLeds|showString|showNumber|showArrow/.test(c.code)) && !!c.stats && c.stats.iconsShown.size + c.stats.textsShown.length > 0,
      },
    ],
    word: { term: 'Programma', means: 'Un programma è la lista delle cose che il micro:bit deve fare, una dopo l\'altra.', quiz: { q: 'Chi dice al micro:bit cosa fare?', options: ['Le pile', 'Il programma', 'Il cavo'], answer: 1 } },
    real: {
      materials: ['un micro:bit V2', 'un portapile con 2 pile AAA', 'il cavo USB per caricare il codice'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['solo', 'Collega la spina al micro:bit.']],
    },
  },
  {
    id: 'contapassi',
    lesson: 1,
    title: 'Il contapassi',
    icon: 'gi:footprint',
    intro: 'Allacci il micro:bit alla caviglia. Ogni passo che fai, conta 1!',
    palette: ['microbit', 'battery', 'strap'],
    start: { parts: [], wires: [] },
    code: `let passi = 0
input.onGesture(Gesture.Shake, function () {
    passi += 1
    led.stopAnimation()
})
basic.forever(function () {
    if (passi < 10) {
        basic.showNumber(passi)
    } else {
        basic.showIcon(IconNames.Happy)
    }
})
`,
    namespaces: ['basic', 'input', 'variables', 'logic'],
    dependencies: { core: '*' },
    steps: [
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco.', show: { add: 'microbit' }, goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Trascina le pile vicino al micro:bit. Il contapassi gira libero: niente cavo USB.', show: { add: 'battery' }, goal: c => has(c, 'battery') },
      {
        title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa delle pile sul micro:bit.',
        show: { wire: POWER_WIRES },
        goal: powered,
      },
      {
        title: 'Fai un passo', mode: 'code', text: 'Premi Prova! Poi premi "Fai un passo", tante volte. Il micro:bit conta: 1, 2, 3...',
        goal: c => c.running && !!c.stats && c.stats.shakes > 0 && c.stats.textsShown.some(t => t !== '0'),
        why: { q: 'Come fa a sentire i passi?', a: 'Dentro il micro:bit c\'è un sensore che sente il movimento. Quando la gamba si muove, il micro:bit viene scosso: è un passo!' },
      },
      {
        title: 'Allaccialo alla caviglia', mode: 'build', text: 'Trascina la fascia sul banco. Poi trascina sopra la fascia il micro:bit e le pile.',
        show: { drag: [['microbit', 'strap'], ['battery', 'strap']] },
        goal: c => onStrap(c, 'microbit') && onStrap(c, 'battery'),
        checklist: c => [
          { label: 'Fascia sul banco', done: has(c, 'strap') },
          { label: 'Micro:bit sulla fascia', done: onStrap(c, 'microbit') },
          { label: 'Pile sulla fascia', done: onStrap(c, 'battery') },
        ],
        why: { q: 'Perché alla caviglia?', a: 'La caviglia si muove a ogni passo. Il micro:bit va fuori, con le lucine verso di te. Le pile dietro.' },
      },
      {
        title: 'Fai 10 passi', mode: 'code', text: 'Premi Prova! e fai 10 passi. Al decimo passo arriva una sorpresa!',
        goal: c => c.running && !!c.stats && c.stats.iconsShown.has('Happy'),
        why: { q: 'Cos\'è "passi"?', a: 'È una variabile: una scatola che ricorda un numero. Parte da 0. Ogni passo aggiunge 1.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Quanti passi vuoi fare? Nel blocco "se passi < 10" cambia il 10 con un altro numero. Poi premi Prova! e cammina.',
        acts: [{ text: 'Nel blocco "se passi < 10" cambia il 10 con un altro numero.', done: c => stepGoal(c.code) !== null && stepGoal(c.code) !== 10 }, { text: 'Premi Prova!', done: ran }, { text: 'Cammina: premi tante volte "Fai un passo".', done: c => c.runInStep && stepGoal(c.code) !== null && stepGoal(c.code) !== 10 && !!c.stats && c.stats.iconsShown.has('Happy') }],
        goal: c => c.runInStep && stepGoal(c.code) !== null && stepGoal(c.code) !== 10 && !!c.stats && c.stats.iconsShown.has('Happy'),
        why: { q: 'Nel mondo vero conta giusto?', a: 'Quasi! Se cammini piano a volte non sente il passo. Se salti, a volte ne conta due. È un esperimento: prova e conta anche tu.' },
      },
    ],
    word: { term: 'Variabile', means: 'Una variabile è una scatola con un nome e un numero dentro. Qui si chiama "passi".', quiz: { q: 'Dove tiene il conto dei passi il micro:bit?', options: ['In una variabile', 'Nelle pile', 'Nella fascia'], answer: 0 } },
    real: {
      materials: ['un micro:bit V2', 'un portapile con 2 pile AAA', 'il cavo USB per caricare il codice', 'un elastico largo, una fascia con il velcro o un calzino lungo', 'un po\' di nastro adesivo'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['solo', 'Allaccia la fascia: comoda, non troppo stretta.'], ['solo', 'Cammina piano e guarda dove vai.']],
    },
  },
  {
    id: 'lucenotte',
    lesson: 1,
    title: 'La luce notturna',
    icon: 'gi:moon',
    intro: 'Quando fa buio, il micro:bit accende tutte le sue lucine. Quando torna la luce, si spegne da solo!',
    palette: ['microbit', 'battery', 'cardStand'],
    start: { parts: [], wires: [] },
    code: `basic.forever(function () {
    if (input.lightLevel() < 100) {
        basic.showLeds(\`
            # # # # #
            # # # # #
            # # # # #
            # # # # #
            # # # # #
            \`)
    } else {
        basic.clearScreen()
    }
})
`,
    namespaces: ['basic', 'input', 'logic'],
    dependencies: { core: '*' },
    steps: [
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco.', show: { add: 'microbit' }, goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Trascina le pile vicino al micro:bit.', show: { add: 'battery' }, goal: c => has(c, 'battery') },
      { title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa delle pile sul micro:bit.', goal: powered },
      {
        title: 'Fai notte', mode: 'code', text: 'Premi Prova! Poi premi la luna: si fa buio e il micro:bit si accende!',
        goal: c => c.running && !!c.stats && c.stats.iconsShown.has('leds'),
        why: { q: 'Come fa a sapere che è buio?', a: 'Le lucine del micro:bit sanno anche sentire la luce. Il micro:bit misura la luce con un numero: 0 è buio, 255 è tanta luce.' },
      },
      {
        title: 'Fai giorno', mode: 'code', text: 'Ora premi la lampadina: torna la luce e il micro:bit si spegne da solo.',
        goal: c => c.running && !!c.stats && c.stats.clearsAfterLeds > 0,
        why: { q: 'Cosa vuol dire "se... altrimenti"?', a: 'Se la luce è meno di 100, accendi le lucine. Altrimenti, cioè se c\'è tanta luce, spegnile.' },
      },
      {
        title: 'Il leggio di cartone', mode: 'build', text: 'Trascina il leggio sul banco. Poi trascina sopra il micro:bit e le pile.',
        show: { drag: [['microbit', 'cardStand'], ['battery', 'cardStand']] },
        goal: c => onHost(c, 'microbit', 'cardStand') && onHost(c, 'battery', 'cardStand'),
        checklist: c => [
          { label: 'Leggio sul banco', done: has(c, 'cardStand') },
          { label: 'Micro:bit davanti', done: onHost(c, 'microbit', 'cardStand') },
          { label: 'Pile dietro', done: onHost(c, 'battery', 'cardStand') },
        ],
        why: { q: 'Posso coprirlo con un bicchiere?', a: 'Sì, ma sotto il bicchiere è sempre buio: resterebbe sempre acceso! Il sensore deve vedere la stanza. Per provarlo, coprilo con la mano.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Cambia il 100 con un altro numero, per esempio 50. Poi premi Prova!, spegni la luce oppure copri il micro:bit con la mano.',
        acts: [{ text: 'Cambia il 100 con un altro numero, per esempio 50.', done: c => lightGoal(c.code) !== null && lightGoal(c.code) !== 100 }, { text: 'Premi Prova!', done: ran }, { text: 'Premi la luna, oppure copri il micro:bit con la mano.', done: c => c.runInStep && lightGoal(c.code) !== null && lightGoal(c.code) !== 100 && !!c.stats && c.stats.iconsShown.has('leds') }],
        goal: c => c.runInStep && lightGoal(c.code) !== null && lightGoal(c.code) !== 100 && !!c.stats && c.stats.iconsShown.has('leds'),
        why: { q: 'Quale numero è giusto?', a: 'Dipende dalla tua stanza! La luna vale 10, la lampadina 120, il sole 250. Con 150 si accende anche con la lampadina. Con 5 non si accende mai. Prova!' },
      },
    ],
    word: { term: 'Sensore', means: 'Un sensore sente il mondo. Il micro:bit sente la luce, il movimento e i suoni.', quiz: { q: 'Cosa fa un sensore?', options: ['Dà l\'energia', 'Fa girare un braccio', 'Sente il mondo: luce, movimento, suoni'], answer: 2 } },
    real: {
      materials: ['un micro:bit V2', 'un portapile con 2 pile AAA', 'il cavo USB per caricare il codice', 'un cartoncino (va bene una scatola di cereali)', 'nastro adesivo', 'una torcia, oppure la tua mano per fare buio'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['adulto', 'Il cartoncino si taglia con un adulto.'], ['solo', 'Piega il leggio e attacca il micro:bit con il nastro.']],
    },
  },
  {
    id: 'sasso',
    lesson: 1,
    title: 'Sasso, carta, forbice',
    icon: 'gi:rock',
    intro: 'Scuoti il micro:bit: sceglie a caso sasso, carta o forbice. Sfida un amico!',
    palette: ['microbit', 'battery'],
    start: { parts: [], wires: [] },
    code: `let mano = 0
input.onGesture(Gesture.Shake, function () {
    mano = randint(1, 3)
    if (mano == 1) {
        basic.showIcon(IconNames.SmallSquare)
    } else if (mano == 2) {
        basic.showIcon(IconNames.Square)
    } else {
        basic.showIcon(IconNames.Scissors)
    }
})
`,
    namespaces: ['basic', 'input', 'Math', 'variables', 'logic'],
    dependencies: { core: '*' },
    steps: [
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco.', show: { add: 'microbit' }, goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Trascina le pile vicino al micro:bit. Così puoi giocare tenendolo in mano.', show: { add: 'battery' }, goal: c => has(c, 'battery') },
      { title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa delle pile sul micro:bit.', goal: powered },
      {
        title: 'Scuoti!', mode: 'code', text: 'Premi Prova! Poi premi "Scuoti". Il micro:bit sceglie: sasso, carta o forbice.',
        goal: c => c.running && !!c.stats && c.stats.shakes > 0 && ['SmallSquare', 'Square', 'Scissors'].some(n => c.stats!.iconsShown.has(n)),
        why: { q: 'Come fa a scegliere?', a: 'Pesca un numero a caso: 1, 2 o 3. Il quadratino piccolo è il sasso, il quadrato grande è la carta, poi c\'è la forbice.' },
      },
      {
        title: 'Sfida l\'amico', mode: 'code', text: 'Scuoti almeno 3 volte. L\'amico gioca con te: guarda chi vince!',
        goal: c => c.running && !!c.stats && c.stats.shakes >= 3 && c.stats.iconsShown.size >= 2,
        why: { q: 'Chi vince?', a: 'Il sasso rompe la forbice. La forbice taglia la carta. La carta avvolge il sasso. Se fate uguale, è pareggio!' },
      },
      {
        title: 'Disegna il tuo sasso', mode: 'code', text: 'Nel blocco del sasso (il quadratino piccolo) scegli un altro disegno, o disegnalo tu con "mostra LED". Poi premi Prova! e scuoti.',
        acts: [{ text: 'Nel blocco del sasso (il quadratino piccolo) scegli un altro disegno.', done: c => !c.code.includes('IconNames.SmallSquare') }, { text: 'Premi Prova!', done: ran }, { text: 'Scuoti!', done: c => c.runInStep && !c.code.includes('IconNames.SmallSquare') && !!c.stats && c.stats.shakes > 0 && (c.stats.iconsShown.size > 0) }],
        goal: c => c.runInStep && !c.code.includes('IconNames.SmallSquare') && !!c.stats && c.stats.shakes > 0 && (c.stats.iconsShown.size > 0),
        why: { q: 'Posso inventare altre mani?', a: 'Sì! Puoi cambiare tutti i disegni, o inventare un gioco nuovo con regole tue.' },
      },
    ],
    word: { term: 'A caso', means: 'A caso vuol dire che non sai cosa uscirà, come quando tiri un dado.', quiz: { q: 'Cosa vuol dire "a caso"?', options: ['Esce sempre il sasso', 'Non sai cosa uscirà, come con un dado', 'Vince sempre il micro:bit'], answer: 1 } },
    real: {
      materials: ['due micro:bit V2, uno a testa (oppure uno solo contro la mano di un amico)', 'un portapile con 2 pile AAA per ogni micro:bit', 'il cavo USB per caricare il codice', 'un amico con cui giocare'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['solo', 'Scuoti piano e tieni forte micro:bit e pile.'], ['solo', 'Non lanciarlo: si rompe!']],
    },
  },
  {
    id: 'tester',
    lesson: 2,
    title: 'Il tester dei conduttori',
    icon: 'gi:lightning-electron',
    intro: 'Diventa uno scienziato: scopri quali oggetti fanno passare l\'elettricità!',
    palette: ['microbit', 'battery', 'testPad', 'coin', 'banana', 'eraser', 'plasticCap', 'foilBall'],
    start: { parts: [], wires: [] },
    code: `basic.forever(function () {
    if (input.pinIsPressed(TouchPin.P1)) {
        basic.showIcon(IconNames.Heart)
    } else {
        basic.clearScreen()
    }
})
`,
    namespaces: ['basic', 'input', 'logic'],
    dependencies: { core: '*' },
    steps: [
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco.', show: { add: 'microbit' }, goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Trascina le pile vicino al micro:bit.', show: { add: 'battery' }, goal: c => has(c, 'battery') },
      { title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa delle pile sul micro:bit.', goal: powered },
      {
        title: 'Il piano di prova', mode: 'build', text: 'Trascina il piano di prova sul banco: un cartoncino con due graffette.',
        show: { add: 'testPad' },
        goal: c => has(c, 'testPad'),
      },
      {
        title: 'Due cavi', mode: 'wire', text: 'Un cavo dal pin 1 a una graffetta. Un altro cavo dal GND all\'altra graffetta.',
        show: { wire: [['microbit:P1', 'testPad:A|B'], ['microbit:GND', 'testPad:A|B']] },
        goal: c => padWired(c),
        checklist: c => {
          const pad = c.parts.find(p => p.type === 'testPad');
          const mb = c.parts.find(p => p.type === 'microbit');
          const to = (t: string) => !!pad && !!mb && ['A', 'B'].some(e => c.analysis.nets.same(`${mb.id}:${t}`, `${pad.id}:${e}`));
          return [{ label: 'Pin 1 → graffetta', color: '#F5C400', done: to('P1') }, { label: 'GND → graffetta', color: '#1D1C1F', done: to('GND') }];
        },
        why: { q: 'Perché due cavi?', a: 'L\'elettricità fa un giro: esce dal pin 1, passa nell\'oggetto e torna al GND. Se il giro è chiuso, il micro:bit lo sente.' },
      },
      {
        title: 'La moneta', mode: 'build', text: 'Trascina la moneta sul piano di prova, sopra le due graffette.',
        show: { drag: ['coin', 'testPad'] },
        goal: c => onHost(c, 'coin', 'testPad'),
      },
      {
        title: 'Si accende?', mode: 'code', text: 'Premi Prova! Se compare il cuore, la moneta fa passare l\'elettricità.',
        goal: c => c.running && c.tested.coin === true && c.icon === 'Heart',
        why: { q: 'Perché la moneta sì?', a: 'La moneta è di metallo. I metalli fanno passare bene l\'elettricità: sono conduttori.' },
      },
      {
        title: 'Lo scienziato', mode: 'build', text: 'Lascia acceso. Togli la moneta e prova la gomma, il tappo e la banana. Prima indovina: si accenderà?',
        acts: [
          { text: 'Lascia acceso. Togli la moneta dal piano.', done: c => !c.parts.some(p => p.type === 'coin' && !!p.attachedTo) || ['eraser', 'plasticCap', 'banana'].some(t => t in c.tested) },
          { text: 'Prova la gomma, il tappo e la banana. Prima indovina: si accenderà?', done: c => ['eraser', 'plasticCap', 'banana'].every(t => t in c.tested) },
        ],
        goal: c => ['eraser', 'plasticCap', 'banana'].every(t => t in c.tested),
        checklist: c => [['eraser', 'Gomma'], ['plasticCap', 'Tappo di plastica'], ['banana', 'Banana']].map(([t, n]) => ({
          label: t in c.tested ? `${n}: ${c.tested[t] ? 'conduce' : 'non conduce'}` : `${n}: ?`, done: t in c.tested,
        })),
        why: { q: 'Conduttore o isolante?', a: 'Se il cuore si accende, l\'oggetto è un conduttore. Se resta spento, è un isolante: plastica e gomma fermano l\'elettricità.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Lascia sul piano un oggetto che conduce, come la moneta o la banana. Poi nel codice cambia il cuore con un altro disegno e premi Prova!',
        acts: [{ text: 'Lascia sul piano un oggetto che conduce: la moneta o la banana.', done: c => padConducts(c) }, { text: 'Nel codice cambia il cuore con un altro disegno.', done: c => !c.code.includes('IconNames.Heart') }, { text: 'Premi Prova!', done: c => c.runInStep && !c.code.includes('IconNames.Heart') && c.icon !== '' && c.tested.coin !== undefined && padConducts(c) }],
        goal: c => c.runInStep && !c.code.includes('IconNames.Heart') && c.icon !== '' && c.tested.coin !== undefined && padConducts(c),
      },
    ],
    word: { term: 'Conduttore', means: 'Un conduttore lascia passare l\'elettricità. I metalli sono conduttori.', quiz: { q: 'Quale di questi è un conduttore?', options: ['La gomma', 'Il tappo di plastica', 'La moneta'], answer: 2 } },
    real: {
      materials: ['un micro:bit V2 e un portapile con 2 pile AAA', '2 cavi a coccodrillo', 'un cartoncino e 2 graffette', 'oggetti da provare: una moneta, una banana, una gomma, un tappo di plastica, carta stagnola', 'il foglio dove scrivere: conduce o non conduce?'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['solo', 'Attacca i coccodrilli alle graffette.'], ['solo', 'Non collegare mai il 3V con il GND: il micro:bit si può rompere.']],
    },
  },
  {
    id: 'filo',
    lesson: 2,
    title: 'Non toccare il filo!',
    icon: 'gi:wire-coil',
    intro: 'Porta l\'anello lungo il filo a onde. Se lo tocchi, il micro:bit fa BZZZ!',
    palette: ['microbit', 'battery', 'buzzWire'],
    start: { parts: [], wires: [] },
    code: `basic.forever(function () {
    if (input.pinIsPressed(TouchPin.P0)) {
        basic.showIcon(IconNames.No)
        music.playTone(131, music.beat(BeatFraction.Half))
    } else {
        basic.showIcon(IconNames.Happy)
    }
})
`,
    namespaces: ['basic', 'input', 'music', 'logic'],
    dependencies: { core: '*' },
    steps: [
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco.', show: { add: 'microbit' }, goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Trascina le pile vicino al micro:bit.', show: { add: 'battery' }, goal: c => has(c, 'battery') },
      { title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa delle pile sul micro:bit.', goal: powered },
      {
        title: 'Il filo e l\'anello', mode: 'build', text: 'Trascina sul banco il gioco del filo: un filo a onde e un anello.',
        show: { add: 'buzzWire' },
        goal: c => has(c, 'buzzWire'),
        why: { q: 'Come si fa quello vero?', a: 'Un adulto piega un filo di metallo a onde e lo ferma in due palline di plastilina. Con un pezzo corto fa un anello e lo infila sul filo prima di chiudere.' },
      },
      {
        title: 'Due cavi', mode: 'wire', text: 'Un cavo dal GND al filo. Un altro cavo dal pin 0 all\'anello.',
        show: { wire: [['microbit:GND', 'buzzWire:W'], ['microbit:P0', 'buzzWire:L']] },
        goal: c => buzzWired(c),
        checklist: c => {
          const bw = c.parts.find(p => p.type === 'buzzWire');
          const mb = c.parts.find(p => p.type === 'microbit');
          const on = (a: string, b: string) => !!bw && !!mb && c.analysis.nets.same(`${mb.id}:${a}`, `${bw.id}:${b}`);
          return [{ label: 'GND → filo', color: '#1D1C1F', done: on('GND', 'W') }, { label: 'Pin 0 → anello', color: '#F5C400', done: on('P0', 'L') }];
        },
        why: { q: 'Perché si accende quando tocchi?', a: 'Il filo e l\'anello sono di metallo. Quando si toccano, l\'elettricità passa dal pin 0 al GND: il circuito si chiude, come nel tester.' },
      },
      {
        title: 'Gioca!', mode: 'code', text: 'Premi Prova! Poi premi "Gioca" e porta l\'anello fino alla bandierina. Se tocchi il filo: X e BZZZ!',
        goal: c => c.running && c.game.played && !!c.stats && c.stats.pins.has('P0'),
        why: { q: 'Cosa fa il micro:bit?', a: 'Se il pin 0 è toccato, mostra una X e suona. Altrimenti mostra una faccina felice. Lo controlla per sempre, senza fermarsi.' },
      },
      {
        title: 'Arriva in fondo', mode: 'code', text: 'Ora prova ad arrivare alla bandierina. Pochi tocchi = mano fermissima!',
        goal: c => c.running && c.game.finished,
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Cambia la X con un altro disegno, per esempio una faccina triste. Poi premi Prova!, gioca e tocca il filo.',
        acts: [{ text: 'Cambia la X con un altro disegno, per esempio una faccina triste.', done: c => !c.code.includes('IconNames.No') }, { text: 'Premi Prova!', done: ran }, { text: 'Premi "Gioca" e tocca il filo.', done: c => c.runInStep && !c.code.includes('IconNames.No') && !!c.stats && c.stats.pins.has('P0') && c.stats.iconsShown.size >= 2 }],
        goal: c => c.runInStep && !c.code.includes('IconNames.No') && !!c.stats && c.stats.pins.has('P0') && c.stats.iconsShown.size >= 2,
      },
    ],
    word: { term: 'Circuito', means: 'Un circuito è una strada chiusa per l\'elettricità. Quando la strada si chiude, l\'elettricità passa.', quiz: { q: 'L\'anello tocca il filo. Cosa succede?', options: ['Il circuito si chiude e l\'elettricità passa', 'Le pile si scaricano', 'Il micro:bit si spegne'], answer: 0 } },
    real: {
      materials: ['un micro:bit V2 e un portapile con 2 pile AAA', '2 cavi a coccodrillo', 'un filo di metallo spesso (gruccia o filo da giardino), circa 50 cm', 'plastilina e una base di cartone', 'nastro adesivo per coprire le punte'],
      safety: [['adulto', 'Piegare e tagliare il filo: lo fa un adulto, le punte pungono.'], ['adulto', 'Metti le pile per il verso giusto.'], ['solo', 'Attacca i coccodrilli: GND al filo, pin 0 all\'anello.']],
    },
  },
  {
    id: 'frutta',
    lesson: 2,
    title: 'Il piano di frutta',
    icon: 'gi:banana',
    intro: 'Collega la frutta al micro:bit e suona! Ogni frutto è un tasto del piano.',
    palette: ['microbit', 'battery', 'banana', 'apple', 'lemon', 'orange'],
    start: { parts: [], wires: [] },
    code: `input.onPinPressed(TouchPin.P0, function () {
    music.playTone(262, music.beat(BeatFraction.Half))
    basic.showIcon(IconNames.EighthNote)
})
input.onPinPressed(TouchPin.P1, function () {
    music.playTone(330, music.beat(BeatFraction.Half))
    basic.showIcon(IconNames.EighthNote)
})
input.onPinPressed(TouchPin.P2, function () {
    music.playTone(392, music.beat(BeatFraction.Half))
    basic.showIcon(IconNames.EighthNote)
})
`,
    namespaces: ['basic', 'input', 'music'],
    dependencies: { core: '*' },
    steps: [
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco.', show: { add: 'microbit' }, goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Trascina le pile vicino al micro:bit.', show: { add: 'battery' }, goal: c => has(c, 'battery') },
      { title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa delle pile sul micro:bit.', goal: powered },
      {
        title: 'La frutta', mode: 'build', text: 'Metti sul banco la banana, la mela, il limone e l\'arancia.',
        show: { add: ['banana', 'apple', 'lemon', 'orange'] },
        goal: c => ['banana', 'apple', 'lemon', 'orange'].every(t => has(c, t)),
        checklist: c => [['banana', 'Banana'], ['apple', 'Mela'], ['lemon', 'Limone'], ['orange', 'Arancia']].map(([t, n]) => ({ label: n, done: has(c, t) })),
      },
      {
        title: 'L\'arancia in mano', mode: 'wire', text: 'Un cavo dal GND all\'arancia. Mentre suoni, l\'arancia la tieni in mano.',
        show: { wire: [['microbit:GND', 'orange:F']] },
        goal: c => fruitOn(c, 'orange', 'GND'),
        why: { q: 'Perché tenere l\'arancia?', a: 'Con una mano tieni l\'arancia, con l\'altra tocchi un frutto. L\'elettricità passa dal frutto, nel tuo corpo, fino all\'arancia e al GND: il circuito si chiude!' },
      },
      {
        title: 'I tasti del piano', mode: 'wire', text: 'Pin 0 alla banana, pin 1 alla mela, pin 2 al limone.',
        show: { wire: [['microbit:P0', 'banana:F'], ['microbit:P1', 'apple:F'], ['microbit:P2', 'lemon:F']] },
        goal: c => fruitOn(c, 'banana', 'P0') && fruitOn(c, 'apple', 'P1') && fruitOn(c, 'lemon', 'P2'),
        checklist: c => [
          { label: 'Pin 0 → banana', color: '#F5C400', done: fruitOn(c, 'banana', 'P0') },
          { label: 'Pin 1 → mela', color: '#E5484D', done: fruitOn(c, 'apple', 'P1') },
          { label: 'Pin 2 → limone', color: '#2E8B57', done: fruitOn(c, 'lemon', 'P2') },
        ],
      },
      {
        title: 'Suona!', mode: 'code', text: 'Premi Prova! Tieni l\'arancia e tocca banana, mela e limone, o i loro pulsanti in alto.',
        goal: c => c.running && !!c.stats && ['P0', 'P1', 'P2'].every(p => c.stats!.pins.has(p)) && c.stats.tones >= 3,
        why: { q: 'Perché i suoni sono diversi?', a: 'Ogni frutto suona una nota diversa: Do, Mi, Sol. Il numero dice quanto vibra il suono: più è grande, più la nota è alta.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Cambia una nota: in un blocco "suona tono" scegli un\'altra nota, per esempio DO Alto. Poi premi Prova! e suona.',
        acts: [{ text: 'In un blocco "suona tono" scegli un\'altra nota, per esempio DO Alto.', done: c => !['262', '330', '392'].every(n => c.code.includes(`playTone(${n}`)) }, { text: 'Premi Prova!', done: ran }, { text: 'Suona!', done: c => c.runInStep && !['262', '330', '392'].every(n => c.code.includes(`playTone(${n}`)) && !!c.stats && c.stats.tones > 0 }],
        goal: c => c.runInStep && !['262', '330', '392'].every(n => c.code.includes(`playTone(${n}`)) && !!c.stats && c.stats.tones > 0,
      },
    ],
    word: { term: 'Nota', means: 'Una nota è un suono con un nome: DO, MI, SOL... Qui ogni frutto suona la sua.', quiz: { q: 'Che cos\'è una nota?', options: ['Un tipo di frutto', 'Un suono con un nome, come DO o MI', 'Un cavo colorato'], answer: 1 } },
    real: {
      materials: ['un micro:bit V2 (ha l\'altoparlante) e un portapile con 2 pile AAA', '4 cavi a coccodrillo', 'frutta: una banana, una mela, un limone e un\'arancia', 'il cavo USB per caricare il codice'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['solo', 'Attacca i coccodrilli alla frutta. La corrente è piccolissima: non si sente.'], ['solo', 'Dopo, lava la frutta prima di mangiarla.']],
    },
  },
  {
    id: 'messaggi',
    lesson: 3,
    title: 'Messaggi segreti',
    icon: 'gi:walkie-talkie',
    intro: 'Due micro:bit si parlano con la radio, senza fili. Manda un messaggio al tuo amico!',
    palette: ['microbit', 'battery'],
    start: { parts: [], wires: [] },
    code: `radio.setGroup(1)
input.onButtonPressed(Button.A, function () {
    radio.sendNumber(1)
})
input.onButtonPressed(Button.B, function () {
    radio.sendNumber(2)
})
radio.onReceivedNumber(function (receivedNumber) {
    if (receivedNumber == 1) {
        basic.showIcon(IconNames.Happy)
    } else {
        basic.showIcon(IconNames.Heart)
    }
})
`,
    namespaces: ['basic', 'input', 'radio', 'logic'],
    dependencies: { core: '*', radio: '*' },
    steps: [
      { title: 'Il tuo micro:bit', mode: 'build', text: 'Trascina il micro:bit sul banco. Questo è il tuo.', goal: c => count(c, 'microbit') >= 1 },
      { title: 'Il micro:bit dell\'amico', mode: 'build', text: 'Trascina un secondo micro:bit. Questo è quello del tuo amico.', goal: c => count(c, 'microbit') >= 2 },
      { title: 'Le pile', mode: 'build', text: 'Ogni micro:bit ha le sue pile: trascinane due.', goal: c => count(c, 'battery') >= 2 },
      {
        title: 'Accendili tutti e due', mode: 'wire', text: 'Collega le pile a ogni micro:bit: spina bianca nella presa delle pile.',
        show: { wire: POWER_WIRES },
        goal: c => c.analysis.powered.size >= 2,
        why: { q: 'Perché niente cavi tra i micro:bit?', a: 'Si parlano con la radio, come i walkie-talkie. Il messaggio vola nell\'aria!' },
      },
      {
        title: 'Manda un messaggio', mode: 'code', text: 'Premi Prova! Poi premi A sul tuo micro:bit. Sul micro:bit dell\'amico arriva una faccina!',
        goal: c => !!c.friend && c.friend.iconsShown.has('Happy'),
        why: { q: 'Come fa ad arrivare?', a: 'Il tuo micro:bit manda il numero 1 con la radio. Quello dell\'amico lo riceve e mostra la faccina.' },
      },
      {
        title: 'Rispondi', mode: 'code', text: 'Ora premi B sul micro:bit dell\'amico (i pulsanti viola). Sul tuo arriva un cuore!',
        goal: c => !!c.friend && c.friend.radioSent > 0 && !!c.stats && c.stats.iconsShown.has('Heart'),
      },
      {
        title: 'Il canale segreto', mode: 'code', text: 'Nel blocco "radio imposta gruppo" metti il vostro numero segreto, per esempio 7. Poi premi Prova! e manda un messaggio.',
        acts: [{ text: 'Nel blocco "radio imposta gruppo" metti il vostro numero segreto, per esempio 7.', done: c => radioGroup(c.code) !== null && radioGroup(c.code) !== 1 }, { text: 'Premi Prova!', done: ran }, { text: 'Manda un messaggio: premi A.', done: c => c.runInStep && radioGroup(c.code) !== null && radioGroup(c.code) !== 1 && !!c.friend && (c.friend.radioReceived > 0 || (!!c.stats && c.stats.radioReceived > 0)) }],
        goal: c => c.runInStep && radioGroup(c.code) !== null && radioGroup(c.code) !== 1 && !!c.friend && (c.friend.radioReceived > 0 || (!!c.stats && c.stats.radioReceived > 0)),
        why: { q: 'Perché è segreto?', a: 'Il gruppo è come un canale. Solo i micro:bit con lo stesso numero si sentono. Chi ha un altro numero non riceve niente!' },
      },
    ],
    word: { term: 'Radio', means: 'La radio manda messaggi nell\'aria, senza fili. Due micro:bit si parlano se hanno lo stesso gruppo.', quiz: { q: 'Quando due micro:bit si parlano con la radio?', options: ['Quando hanno lo stesso gruppo', 'Quando sono collegati con un cavo', 'Quando sono dello stesso colore'], answer: 0 } },
    real: {
      materials: ['due micro:bit V2, uno a testa', 'due portapile con 2 pile AAA', 'il cavo USB per caricare lo stesso codice su tutti e due', 'un amico!'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['solo', 'Carica lo stesso codice su tutti e due i micro:bit.'], ['solo', 'Scegliete un numero segreto diverso da quello degli altri gruppi.']],
    },
  },
  {
    id: 'tesoro',
    lesson: 3,
    title: 'Caccia al tesoro',
    icon: 'gi:open-treasure-chest',
    intro: 'Un micro:bit è il tesoro e manda segnali radio. Con l\'altro lo cerchi: più sei vicino, più il segnale è forte!',
    palette: ['microbit', 'battery'],
    start: { parts: [], wires: [] },
    code: `let tesoro = false
radio.setGroup(1)
input.onButtonPressed(Button.A, function () {
    tesoro = true
    basic.showIcon(IconNames.Diamond)
})
radio.onReceivedNumber(function (receivedNumber) {
    if (radio.receivedPacket(RadioPacketProperty.SignalStrength) > -60) {
        basic.showIcon(IconNames.Heart)
    } else {
        basic.showIcon(IconNames.SmallHeart)
    }
})
basic.forever(function () {
    if (tesoro) {
        radio.sendNumber(0)
    }
    basic.pause(200)
})
`,
    namespaces: ['basic', 'input', 'radio', 'logic', 'variables'],
    dependencies: { core: '*', radio: '*' },
    steps: [
      { title: 'Il cercatore', mode: 'build', text: 'Trascina il micro:bit sul banco. Con questo cerchi il tesoro.', goal: c => count(c, 'microbit') >= 1 },
      { title: 'Il tesoro', mode: 'build', text: 'Trascina un secondo micro:bit: sarà il tesoro da nascondere.', goal: c => count(c, 'microbit') >= 2 },
      { title: 'Le pile', mode: 'build', text: 'Ogni micro:bit ha le sue pile: trascinane due.', goal: c => count(c, 'battery') >= 2 },
      { title: 'Accendili tutti e due', mode: 'wire', text: 'Collega le pile a ogni micro:bit.', goal: c => c.analysis.powered.size >= 2 },
      {
        title: 'Accendi il tesoro', mode: 'code', text: 'Premi Prova! Poi premi A sul secondo micro:bit (pulsanti viola): mostra un rombo e comincia a mandare segnali.',
        goal: c => c.running && ((!!c.friend && c.friend.iconsShown.has('Diamond')) || (!!c.stats && c.stats.iconsShown.has('Diamond'))),
        why: { q: 'Cosa fa il tesoro?', a: 'Per sempre, 5 volte al secondo, manda un segnale con la radio. Come un faro che fa "sono qui, sono qui!"' },
      },
      {
        title: 'Cerca il tesoro', mode: 'code', text: 'Premi "Cerca il tesoro" e trascina il micro:bit in giardino. Cuore grande = vicino!',
        goal: c => c.running && c.game.finished,
        why: { q: 'Come fa a sapere quanto è lontano?', a: 'Più sei vicino al tesoro, più il segnale arriva forte. Il micro:bit misura la forza: se è più di -60, sei vicino e mostra il cuore grande.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Rendi la caccia più difficile: cambia -60 con -50. Così il cuore grande arriva solo quando sei vicinissimo. Poi premi Prova! e cerca ancora.',
        acts: [{ text: 'Rendi la caccia più difficile: cambia -60 con -50.', done: c => huntLimit(c.code) !== null && huntLimit(c.code) !== -60 }, { text: 'Premi Prova!', done: ran }, { text: 'Accendi il tesoro e cercalo ancora.', done: c => c.runInStep && huntLimit(c.code) !== null && huntLimit(c.code) !== -60 && c.game.finished }],
        goal: c => c.runInStep && huntLimit(c.code) !== null && huntLimit(c.code) !== -60 && c.game.finished,
      },
    ],
    word: { term: 'Segnale', means: 'Il segnale della radio è forte da vicino e debole da lontano.', quiz: { q: 'Il cuore è grande. Il tesoro è...', options: ['Lontano', 'Spento', 'Vicino'], answer: 2 } },
    real: {
      materials: ['due micro:bit V2', 'due portapile con 2 pile AAA', 'il cavo USB per caricare lo stesso codice su tutti e due', 'un posto grande per nascondere il tesoro (aula, corridoio, giardino)'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['adulto', 'L\'adulto sceglie dove nascondere il tesoro: niente posti alti o pericolosi.'], ['solo', 'Cammina mentre cerchi, non correre.']],
    },
  },
  {
    id: 'paperpet',
    lesson: 4,
    title: 'Luna che scodinzola',
    icon: 'gi:labrador-head',
    intro: 'Luna è un cagnolino di carta. Accarezzale la schiena: muove la coda!',
    palette: ['microbit', 'usb', 'battery', 'servo', 'petBody', 'petLegs', 'petFace', 'petTail', 'foilPatch', 'glueStick', 'scissors'],
    start: {
      parts: [
        { id: 'mb1', type: 'microbit', x: -12, z: 6, rot: 0 },
        { id: 'pc1', type: 'usb', x: -24, z: -6, rot: 0 },
      ],
      wires: [],
    },
    code: `pins.touchSetMode(TouchTarget.P1, TouchTargetMode.Capacitive)
servos.P0.setAngle(90)
input.onButtonPressed(Button.A, function () {
    servos.P0.setAngle(90)
})
basic.forever(function () {
    while (input.pinIsPressed(TouchPin.P1)) {
        servos.P0.setAngle(60)
        basic.pause(300)
        servos.P0.setAngle(120)
        basic.pause(300)
    }
})
`,
    namespaces: ['basic', 'input', 'loops', 'logic', 'servos'],
    dependencies: { core: '*', servo: '*' },
    steps: [
      {
        title: 'Il corpo di Luna', mode: 'build', text: 'Trascina il corpo di carta sul banco. Nel mondo vero lo ritagli e lo pieghi.',
        show: { add: 'petBody' },
        goal: c => has(c, 'petBody'),
        why: { q: 'Come si fa il corpo vero?', a: 'Stampi la sagoma. Tagli sulle righe piene. Pieghi sulle righe a puntini. Poi incolli le linguette.' },
      },
      {
        title: 'Il motore nella pancia', mode: 'build', text: 'Trascina il servo sopra il corpo di Luna. Entra da solo nella finestrella.',
        show: { drag: ['servo', 'petBody'] },
        goal: c => c.parts.some(p => p.type === 'servo' && !!p.attachedTo && c.parts.find(b => b.id === p.attachedTo)?.type === 'petBody'),
        why: { q: 'Perché il servo sta dentro?', a: 'Così il braccio bianco esce dalla schiena. Lì metteremo la coda.' },
      },
      {
        title: 'Collega il servo', mode: 'wire', text: 'Tocca la fine di un filo, poi il suo posto sul micro:bit.',
        show: { wire: SERVO_WIRES },
        goal: c => {
          const s = c.parts.find(p => p.type === 'servo');
          return !!s && c.parts.some(mb => mb.type === 'microbit' && [['GND', 'GND'], ['VCC', '3V'], ['SIG', 'P0']].every(([t, d]) => c.analysis.nets.same(`${s.id}:${t}`, `${mb.id}:${d}`)));
        },
        checklist: c => {
          const s = c.parts.find(p => p.type === 'servo');
          const mb = c.parts.find(p => p.type === 'microbit');
          const ok = (t: string, target: string) => !!s && !!mb && c.analysis.nets.same(`${s.id}:${t}`, `${mb.id}:${target}`);
          return [
            { label: 'Marrone → GND', color: '#7A4A22', done: ok('GND', 'GND') },
            { label: 'Rosso → 3V', color: '#E5484D', done: ok('VCC', '3V') },
            { label: 'Arancione → pin 0', color: '#F7941D', done: ok('SIG', 'P0') },
          ];
        },
        why: { q: 'Perché 3 fili?', a: 'Rosso e marrone portano l\'energia. L\'arancione porta il messaggio: "gira!"' },
      },
      {
        title: 'Dai energia', mode: 'wire', text: 'Tocca la spina del cavo USB, poi la sua presa sul micro:bit.',
        show: { wire: [['usb:USBPLUG', 'microbit:USB']] },
        goal: c => servoOk(c),
        why: { q: 'USB o pile?', a: 'Tutte e due vanno bene. Il cavo USB dà energia e porta il codice. Le pile servono quando Luna gira libera.' },
      },
      {
        title: 'Raddrizza il servo', mode: 'code', text: 'Premi Prova! Il servo va dritto, a 90. Così la coda parte dal centro.',
        goal: c => c.running && !!c.stats && c.stats.servoWrites > 0,
        why: { q: 'Perché prima dritto?', a: 'Se il braccio parte storto, la coda sbatte da una parte sola. Dritto, scodinzola bene da tutte e due.' },
      },
      {
        title: 'Zampe, faccia e coda', mode: 'build', text: 'Trascina le zampe e la faccia sul corpo. Poi la coda sopra il braccio bianco del servo.',
        acts: [
          { text: 'Trascina le zampe e la faccia sul corpo di Luna.', done: c => ['petLegs', 'petFace'].every(t => c.parts.some(p => p.type === t && c.parts.find(b => b.id === p.attachedTo)?.type === 'petBody')) },
          { text: 'Trascina la coda sopra il braccio bianco del servo.', done: c => c.parts.some(p => p.type === 'petTail' && c.parts.find(s => s.id === p.attachedTo)?.type === 'servo') },
        ],
        show: { drag: [['petLegs', 'petBody'], ['petFace', 'petBody'], ['petTail', 'horn']] },
        goal: c => {
          const body = c.parts.find(p => p.type === 'petBody');
          const on = (t: string) => !!body && c.parts.some(p => p.type === t && p.attachedTo === body.id);
          return on('petLegs') && on('petFace') && c.parts.some(p => p.type === 'petTail' && c.parts.find(s => s.id === p.attachedTo)?.type === 'servo');
        },
        checklist: c => {
          const body = c.parts.find(p => p.type === 'petBody');
          const on = (t: string) => !!body && c.parts.some(p => p.type === t && p.attachedTo === body.id);
          return [
            { label: 'Zampe', done: on('petLegs') },
            { label: 'Faccia', done: on('petFace') },
            { label: 'Coda sul servo', done: c.parts.some(p => p.type === 'petTail' && c.parts.find(s => s.id === p.attachedTo)?.type === 'servo') },
          ];
        },
        why: { q: 'Come sta su la coda vera?', a: 'La coda ha una linguetta. La pieghi e la chiudi con un po\' di colla: diventa una tasca. La tasca si infila sul braccio del servo.' },
      },
      {
        title: 'La stagnola sulla schiena', mode: 'build', text: 'Trascina la stagnola sulla schiena di Luna. Lì la accarezzerai.',
        show: { drag: ['foilPatch', 'petBody'] },
        goal: c => c.parts.some(p => p.type === 'foilPatch' && c.parts.find(b => b.id === p.attachedTo)?.type === 'petBody'),
        why: { q: 'Perché la stagnola?', a: 'La stagnola è metallo: fa passare l\'elettricità. Il micro:bit sente quando la tocchi.' },
      },
      {
        title: 'Collega la stagnola', mode: 'wire', text: 'Tocca il cerchietto sulla stagnola. Poi tocca il pin 1 del micro:bit.',
        show: { wire: [['foilPatch:F', 'microbit:P1']] },
        goal: c => foilOn(c, 'P1'),
        checklist: c => [{ label: 'Stagnola → pin 1', color: '#F5C400', done: foilOn(c, 'P1') }],
      },
      {
        title: 'Accarezza Luna', mode: 'code', text: 'Premi Prova! Poi tieni premuto il pulsante Accarezza, o tocca la stagnola sulla schiena.',
        goal: c => c.running && !!c.stats && c.stats.pins.has('P1') && c.servoMoves >= 2,
        why: { q: 'Cosa fa "mentre"?', a: 'Ripete i blocchi dentro finché tocchi la stagnola. Quando togli la mano, si ferma.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Luna è contenta: falla scodinzolare più veloce. Metti un numero più piccolo nelle pause. Poi premi Prova! e accarezzala.',
        acts: [{ text: 'Fai scodinzolare Luna più veloce: metti un numero più piccolo nelle pause.', done: c => pauses(c.code).length > 0 && Math.min(...pauses(c.code)) < 300 }, { text: 'Premi Prova!', done: ran }, { text: 'Accarezza Luna.', done: c => c.runInStep && pauses(c.code).length > 0 && Math.min(...pauses(c.code)) < 300 && !!c.stats && c.stats.pins.has('P1') && c.servoMoves >= 2 }],
        goal: c => c.runInStep && pauses(c.code).length > 0 && Math.min(...pauses(c.code)) < 300 && !!c.stats && c.stats.pins.has('P1') && c.servoMoves >= 2,
      },
    ],
    word: { term: 'Servo', means: 'Il servo è un motore che va all\'angolo che gli dici, e poi resta lì.', quiz: { q: 'Cosa fa muovere la coda di Luna?', options: ['La stagnola', 'Il servo', 'La colla'], answer: 1 } },
    real: {
      materials: ['un micro:bit V2', 'il cavo USB, oppure 2 pile AAA con il portapile', 'un servo SG90 con il braccio lungo', '4 cavi a coccodrillo', 'la sagoma di Luna stampata su cartoncino', 'stagnola, circa 3,5 x 2 cm', 'colla stick o nastro adesivo', 'forbici'],
      printable: { label: 'Scarica le sagome di Luna (PDF)', file: 'paper-pet/luna-sagome.pdf' },
      safety: [['adulto', 'La finestrella del servo è piccola: la taglia l\'adulto prima.'], ['adulto', 'I coccodrilli li attacca l\'adulto prima, con un giro di nastro isolante.'], ['solo', 'Ritaglia, piega, incolla con la colla stick e accarezza Luna.']],
    },
  },
  {
    id: 'mostro',
    rev: 2,
    lesson: 4,
    title: 'Il mostro del latte',
    icon: 'gi:milk-carton',
    intro: 'Un cartone del latte diventa un mostro affamato. Avvicini un biscotto, fa buio... e il mostro apre la bocca!',
    palette: ['microbit', 'battery', 'servo', 'milkCarton', 'milkString', 'tape', 'scissors'],
    start: {
      parts: [
        { id: 'mb1', type: 'microbit', x: -16, z: 8, rot: 0 },
        { id: 'bat1', type: 'battery', x: -16, z: -2, rot: 0 },
      ],
      wires: [{ id: 'w-pow', a: 'bat1:PLUG', b: 'mb1:BAT', color: 'bianco' }],
    },
    code: `pins.servoWritePin(AnalogPin.P0, 180)
basic.forever(function () {
    if (input.lightLevel() < 20) {
        pins.servoWritePin(AnalogPin.P0, 100)
    } else {
        pins.servoWritePin(AnalogPin.P0, 180)
    }
})
`,
    namespaces: ['basic', 'input', 'logic', 'pins'],
    dependencies: { core: '*' },
    steps: [
      {
        title: 'La testa del mostro', mode: 'build', text: 'Trascina il cartone del latte sul banco: è la testa del mostro.',
        show: { add: 'milkCarton' },
        goal: c => has(c, 'milkCarton'),
        why: { q: 'Come si fa quello vero?', a: 'L\'adulto ritaglia la bocca prima della lezione. Tu incolli il modello sul cartone e disegni occhi e denti.' },
      },
      {
        title: 'L\'occhio del mostro', mode: 'build', text: 'Trascina il micro:bit sul cartone: va sotto la bocca, con le lucine verso di te.',
        show: { drag: ['microbit', 'milkCarton'] },
        goal: c => onHost(c, 'microbit', 'milkCarton'),
        why: { q: 'Perché il micro:bit è l\'occhio?', a: 'Ti ricordi il sensore di luce della prima lezione? Le lucine del micro:bit sentono anche la luce. Qui fanno da occhio al mostro.' },
      },
      {
        title: 'Il servo sul tappo', mode: 'build', text: 'Trascina il servo sopra il cartone: si mette in cima, vicino al tappo.',
        show: { drag: ['servo', 'milkCarton'] },
        goal: c => onHost(c, 'servo', 'milkCarton'),
      },
      {
        title: 'Collega il servo', mode: 'wire', text: 'Tocca la fine di un filo del servo, poi il suo posto sul micro:bit.',
        show: { wire: SERVO_WIRES },
        goal: servoOk,
        checklist: servoChecklist,
        why: { q: 'E nel mondo vero?', a: 'I collegamenti li fa l\'adulto prima della lezione. Ferma ogni coccodrillo con un giro di nastro isolante, così non si stacca.' },
      },
      {
        title: 'Calibra il servo', mode: 'code', text: 'Premi Prova! Il servo va a 180: è la posizione della bocca chiusa.',
        goal: c => c.running && servoAt(c, 'milkCarton', 180),
        why: { q: 'Cosa vuol dire calibrare?', a: 'Vuol dire mettere il servo nella posizione di partenza prima di montare i pezzi. Così il robot parte nel modo giusto.' },
      },
      {
        title: 'Lo spago', mode: 'build', text: 'Premi Ferma. Poi trascina lo spago sopra il braccio bianco del servo: ora il servo è legato alla bocca.',
        show: { drag: ['milkString', 'horn'] },
        goal: c => (onServoOf(c, 'milkString', 'milkCarton')?.rest ?? 0) >= 170,
        checklist: c => {
          const st = onServoOf(c, 'milkString', 'milkCarton');
          return [
            { label: 'Spago sul braccio del servo', done: !!st },
            { label: 'Legato con il servo a 180', done: !!st && (st.rest ?? 0) >= 170 },
          ];
        },
        why: { q: 'Perché prima il servo e poi lo spago?', a: 'Se leghi lo spago con il servo storto, la bocca resta un po\' aperta o non si apre più. Prima servo a 180 e bocca chiusa, poi lo spago.' },
      },
      {
        title: 'Arriva il biscotto', mode: 'code', text: 'Premi Prova! Poi tieni premuto Biscotto: davanti all\'occhio fa buio e il mostro apre la bocca. Gnam!',
        goal: c => c.running && !!onServoOf(c, 'milkString', 'milkCarton') && c.servoMoves >= 1,
        why: { q: 'Come fa a capire che arriva il biscotto?', a: 'Il biscotto copre l\'occhio: passa poca luce. Se la luce è meno di 20, il servo va a 100 e tira lo spago: la bocca si apre. Prova con il sole: c\'è così tanta luce che il biscotto non basta più! Allora cambia 20 con 40.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Fai aprire la bocca solo un pochino: cambia 100 con 140. Poi premi Prova! e avvicina il biscotto.',
        acts: [{ text: 'Cambia 100 con 140: la bocca si aprirà solo un pochino.', done: c => !/AnalogPin\.P0,\s*100\)/.test(c.code) }, { text: 'Premi Prova!', done: ran }, { text: 'Tieni premuto Biscotto.', done: c => c.runInStep && !/AnalogPin\.P0,\s*100\)/.test(c.code) && /lightLevel/.test(c.code) && c.servoMoves >= 1 }],
        goal: c => c.runInStep && !/AnalogPin\.P0,\s*100\)/.test(c.code) && /lightLevel/.test(c.code) && c.servoMoves >= 1,
        why: { q: 'Perché si apre di meno?', a: 'Da 180 a 140 il braccio gira poco e tira poco lo spago. Da 180 a 100 gira di più. Se premi la luna la bocca resta sempre aperta: la stanza è buia. Metti 5 al posto di 20.' },
      },
    ],
    word: { term: 'Calibrare', means: 'Calibrare vuol dire mettere il servo nella posizione di partenza prima di montare i pezzi.', quiz: { q: 'Quando si calibra il servo?', options: ['Prima di legare lo spago', 'Dopo aver montato tutto', 'Mai'], answer: 0 } },
    real: {
      materials: ['un micro:bit V2 con il portapile da 2 pile AAA (con l\'interruttore)', 'un micro servo SG90 con le crocette', '3 cavi a coccodrillo e il nastro isolante', 'un cartone del latte con il tappo a vite, con la bocca già tagliata', 'uno spago (va bene quello di una bustina di tè) e una graffetta', 'il modello stampato, biadesivo spesso e nastro di carta', 'un biscotto'],
      safety: [['adulto', 'I coccodrilli li attacca l\'adulto prima, con un giro di nastro isolante.'], ['adulto', 'La bocca del cartone la ritaglia l\'adulto prima.'], ['solo', 'Interruttore delle pile spento mentre monti e smonti.'], ['solo', 'Incolla il modello, lega lo spago, avvicina il biscotto.']],
    },
  },
  {
    id: 'catapulta',
    rev: 3,
    lesson: 4,
    title: 'La catapulta',
    icon: 'gi:catapult',
    intro: 'Qui il servo fa il grilletto: tiene ferma la catapulta carica. Premi A... e via!',
    palette: ['microbit', 'battery', 'servo', 'catapultLatch', 'bucket', 'tape', 'scissors'],
    start: {
      parts: [
        { id: 'mb1', type: 'microbit', x: -16, z: 8, rot: 0 },
        { id: 'bat1', type: 'battery', x: -16, z: -2, rot: 0 },
        { id: 'cb1', type: 'catapultBase', x: 4, z: 10, rot: 0 },
        { id: 'bk1', type: 'bucket', x: 4, z: -13, rot: 0 },
      ],
      wires: [{ id: 'w-pow', a: 'bat1:PLUG', b: 'mb1:BAT', color: 'bianco' }],
    },
    code: `pins.servoWritePin(AnalogPin.P0, 90)
input.onButtonPressed(Button.A, function () {
    pins.servoWritePin(AnalogPin.P0, 0)
    basic.pause(1000)
    pins.servoWritePin(AnalogPin.P0, 90)
})
`,
    namespaces: ['basic', 'input', 'pins'],
    dependencies: { core: '*' },
    steps: [
      {
        title: 'Il servo accanto al braccio', mode: 'build', text: 'Trascina il servo vicino alla catapulta: si mette in piedi, accanto al braccio.',
        show: { drag: ['servo', 'catapultBase'] },
        goal: c => onHost(c, 'servo', 'catapultBase'),
        why: { q: 'Come si fa quella vera?', a: 'Segui il tutorial con un adulto: cartone, bastoncini e un elastico morbido. L\'elastico è il motore della catapulta.' },
      },
      {
        title: 'Collega il servo', mode: 'wire', text: 'Tocca la fine di un filo del servo, poi il suo posto sul micro:bit.',
        show: { wire: SERVO_WIRES },
        goal: servoOk,
        checklist: servoChecklist,
        why: { q: 'E nel mondo vero?', a: 'I collegamenti li fa l\'adulto prima della lezione. Ferma ogni coccodrillo con un giro di nastro isolante, così non si stacca.' },
      },
      {
        title: 'Calibra il grilletto', mode: 'code', text: 'Premi Prova! Il servo va a 90: è la posizione che tiene ferma la catapulta.',
        goal: c => c.running && !!c.stats && c.stats.servoWrites > 0 && servoAt(c, 'catapultBase', 90),
        why: { q: 'Cosa vuol dire calibrare?', a: 'Vuol dire mettere il servo nella posizione di partenza prima di montare i pezzi. Così il fermo va proprio sopra il braccio.' },
      },
      {
        title: 'Il fermo', mode: 'build', text: 'Premi Ferma. Poi trascina il fermo sopra il braccio bianco del servo: va sopra il braccio della catapulta.',
        show: { drag: ['catapultLatch', 'horn'] },
        goal: c => { const l = onServoOf(c, 'catapultLatch', 'catapultBase'); return !!l && Math.abs((l.rest ?? 0) - 90) < 10; },
        checklist: c => {
          const l = onServoOf(c, 'catapultLatch', 'catapultBase');
          return [
            { label: 'Fermo sul braccio del servo', done: !!l },
            { label: 'Montato con il servo a 90', done: !!l && Math.abs((l.rest ?? 0) - 90) < 10 },
          ];
        },
      },
      {
        title: 'Carica e lancia!', mode: 'code', text: 'Premi Prova! Poi premi Carica: il braccio va giù e il fermo lo tiene. Poi premi A: il servo sposta il fermo e... via!',
        acts: [{ text: 'Premi Prova!', done: c => c.running }, { text: 'Premi Carica: il braccio va giù e il fermo lo tiene.', done: c => c.running && (!!c.game.loaded || c.game.throws >= 1) }, { text: 'Premi A: il servo sposta il fermo e... via!', done: c => c.running && c.game.throws >= 1 }],
        goal: c => c.running && c.game.throws >= 1,
        why: { q: 'Chi lancia la pallina?', a: 'L\'elastico! Il servo non muove la catapulta: la tiene ferma, carica. È il grilletto. A 3 volt il servo è piccolo: basta che sposti il fermo.' },
      },
      {
        title: 'Fai centro!', mode: 'code', text: 'La pallina cade prima del bersaglio. Scegli 3 elastici. Poi premi Carica e A.',
        acts: [{ text: 'La pallina cade prima del bersaglio. Scegli 3 elastici.', done: c => c.game.bands === 3 || c.game.hits >= 1 }, { text: 'Premi Carica, poi A.', done: c => c.running && c.game.hits >= 1 }],
        goal: c => c.running && c.game.hits >= 1,
        why: { q: 'Perché con 3 elastici va più lontano?', a: 'Più elastici tirano più forte il braccio: la pallina parte più veloce e vola più lontano. Con 1 elastico cade vicino. Puoi anche spostare il bersaglio.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Il servo lavora bene tra 10 e 170: a 0 arriva in fondo e ronza. Cambia 0 con 20. Poi premi Prova!, Carica e A: parte ancora?',
        acts: [{ text: 'Cambia 0 con 20: a 0 il servo arriva in fondo e ronza.', done: c => !/AnalogPin\.P0,\s*0\)/.test(c.code) }, { text: 'Premi Prova!', done: ran }, { text: 'Premi Carica, poi A. Parte ancora?', done: c => c.runInStep && !/AnalogPin\.P0,\s*0\)/.test(c.code) && c.game.throws >= 1 }],
        goal: c => c.runInStep && !/AnalogPin\.P0,\s*0\)/.test(c.code) && c.game.throws >= 1,
        why: { q: 'E se metto 60?', a: 'Prova! Il fermo si sposta troppo poco e il braccio resta bloccato. Il numero giusto si trova provando: anche questo è calibrare.' },
      },
    ],
    word: { term: 'Angolo', means: 'L\'angolo dice al servo quanto girare: da 0° a 180°. Il servo lavora bene tra 10 e 170.', quiz: { q: 'Quale angolo fa lavorare bene il servo?', options: ['0', '200', '90'], answer: 2 } },
    real: {
      materials: ['un micro:bit V2 con il portapile da 2 pile AAA (con l\'interruttore)', 'un micro servo SG90 con le crocette', '3 cavi a coccodrillo e il nastro isolante', 'i materiali della catapulta indicati nel tutorial', 'un elastico morbido', 'palline di carta o pon pon', 'biadesivo spesso e nastro di carta'],
      safety: [['adulto', 'I coccodrilli li attacca l\'adulto prima, con un giro di nastro isolante.'], ['adulto', 'Se il servo non riesce a sganciare, la catapulta la carica l\'adulto: tu premi solo A.'], ['solo', 'Elastico morbido, solo palline di carta, e mai verso le persone.']],
    },
  },
];

export const LESSONS: LessonDef[] = [
  { n: 1, title: 'Primi passi', projects: [{ icon: 'gi:heart-beats', title: 'Il cuore che batte', level: 'cuore' }, { icon: 'gi:footprint', title: 'Il contapassi', level: 'contapassi' }, { icon: 'gi:moon', title: 'La luce notturna', level: 'lucenotte' }, { icon: 'gi:rock', title: 'Sasso, carta, forbice', level: 'sasso' }] },
  { n: 2, title: 'Il laboratorio dello scienziato', projects: [{ icon: 'gi:lightning-electron', title: 'Il tester dei conduttori', level: 'tester' }, { icon: 'gi:wire-coil', title: 'Non toccare il filo!', level: 'filo' }, { icon: 'gi:banana', title: 'Il piano di frutta', level: 'frutta' }] },
  { n: 3, title: 'Messaggi senza fili', projects: [{ icon: 'gi:walkie-talkie', title: 'Messaggi segreti', level: 'messaggi' }, { icon: 'gi:open-treasure-chest', title: 'Caccia al tesoro', level: 'tesoro' }] },
  { n: 4, title: 'Il servo e i materiali di riciclo', projects: [{ icon: 'gi:labrador-head', title: 'Luna che scodinzola', level: 'paperpet' }, { icon: 'gi:milk-carton', title: 'Il mostro del latte', level: 'mostro' }, { icon: 'gi:catapult', title: 'La catapulta', level: 'catapulta' }] },
  { n: 5, title: 'La macchinina robot', projects: [{ icon: 'gi:tv-remote', title: 'Guida col telecomando' }, { icon: 'gi:race-car', title: 'Lo slalom' }] },
  { n: 6, title: 'Il robot intelligente', projects: [{ icon: 'gi:radar-sweep', title: 'Il robot che evita i muri' }, { icon: 'gi:podium-winner', title: 'La grande Expo' }] },
];

export const FREE_LAB: Level = {
  id: 'libero',
  lesson: 0,
  title: 'Laboratorio libero',
  icon: 'gi:podium-winner',
  intro: 'Inventa il tuo robot con tutti i pezzi.',
  palette: ['microbit', 'battery', 'servo', 'led', 'resistor', 'cardboardBox', 'cardboardPanel', 'paperCup', 'straw', 'cardboardTube', 'foilBall', 'scissors', 'hotGlue'],
  start: { parts: [], wires: [] },
  code: `basic.showIcon(IconNames.Happy)
`,
  namespaces: [],
  dependencies: { core: '*', servo: '*' },
  steps: [],
  real: { materials: [], safety: [] },
};

export const levelById = (id: string) => (id === 'libero' ? FREE_LAB : LEVELS.find(l => l.id === id));
