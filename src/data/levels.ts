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
}

export interface Level {
  id: string;
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
}

export interface LessonDef {
  n: number;
  title: string;
  projects: { icon: string; title: string; level?: string }[];
}

const has = (c: LevelCtx, type: string) => c.parts.some(p => p.type === type);
const powered = (c: LevelCtx) => c.analysis.powered.size > 0;
const onStrap = (c: LevelCtx, type: string) => c.parts.some(p => p.type === type && c.parts.find(h => h.id === p.attachedTo)?.type === 'strap');
/** Il numero di passi del traguardo (passi < N). */
const stepGoal = (code: string) => { const m = code.match(/passi\s*<\s*(\d+)/); return m ? Number(m[1]) : null; };
const foilOn = (c: LevelCtx, pin: string) => {
  const f = c.parts.find(p => p.type === 'foilPatch');
  return !!f && c.parts.some(mb => mb.type === 'microbit' && c.analysis.nets.same(`${f.id}:F`, `${mb.id}:${pin}`));
};
const servoOk = (c: LevelCtx) => c.analysis.servos.some(s => s.powered && s.grounded && s.sig?.pin === 'P0');

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
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco. È il cervello del progetto.', goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Ora trascina le pile vicino al micro:bit.', goal: c => has(c, 'battery') },
      {
        title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa in alto sul micro:bit.',
        goal: powered, why: { q: 'Perché servono le pile?', a: 'Le pile danno l\'energia. Senza energia il micro:bit dorme.' },
      },
      {
        title: 'Guarda il cuore', mode: 'code', text: 'Il codice è già pronto. Premi Prova! e guarda le lucine.',
        goal: c => c.running && !!c.stats && c.stats.iconsShown.size > 0,
        why: { q: 'Cosa fa il blocco "per sempre"?', a: 'Ripete i blocchi dentro di lui, ancora e ancora, senza fermarsi mai.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Nel codice scegli un altro disegno al posto del cuore. Poi premi Prova!',
        goal: c => c.runInStep && (icons(c.code).some(n => n !== 'Heart' && n !== 'SmallHeart') || /showLeds|showString|showNumber|showArrow/.test(c.code)) && !!c.stats && c.stats.iconsShown.size + c.stats.textsShown.length > 0,
      },
    ],
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
      { title: 'Prendi il cervello', mode: 'build', text: 'Trascina il micro:bit sul banco.', goal: c => has(c, 'microbit') },
      { title: 'Prendi le pile', mode: 'build', text: 'Trascina le pile vicino al micro:bit. Il contapassi gira libero: niente cavo USB.', goal: c => has(c, 'battery') },
      {
        title: 'Accendi il micro:bit', mode: 'wire', text: 'Tocca la spina bianca delle pile. Poi tocca la presa delle pile sul micro:bit.',
        goal: powered,
      },
      {
        title: 'Fai un passo', mode: 'code', text: 'Premi Prova! Poi premi "Fai un passo", tante volte. Il micro:bit conta: 1, 2, 3...',
        goal: c => c.running && !!c.stats && c.stats.shakes > 0 && c.stats.textsShown.some(t => t !== '0'),
        why: { q: 'Come fa a sentire i passi?', a: 'Dentro il micro:bit c\'è un sensore che sente il movimento. Quando la gamba si muove, il micro:bit viene scosso: è un passo!' },
      },
      {
        title: 'Allaccialo alla caviglia', mode: 'build', text: 'Trascina la fascia sul banco. Poi trascina sopra la fascia il micro:bit e le pile.',
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
        goal: c => c.runInStep && stepGoal(c.code) !== null && stepGoal(c.code) !== 10 && !!c.stats && c.stats.iconsShown.has('Happy'),
        why: { q: 'Nel mondo vero conta giusto?', a: 'Quasi! Se cammini piano a volte non sente il passo. Se salti, a volte ne conta due. È un esperimento: prova e conta anche tu.' },
      },
    ],
    real: {
      materials: ['un micro:bit V2', 'un portapile con 2 pile AAA', 'il cavo USB per caricare il codice', 'un elastico largo, una fascia con il velcro o un calzino lungo', 'un po\' di nastro adesivo'],
      safety: [['adulto', 'Metti le pile per il verso giusto.'], ['solo', 'Allaccia la fascia: comoda, non troppo stretta.'], ['solo', 'Cammina piano e guarda dove vai.']],
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
        goal: c => has(c, 'petBody'),
        why: { q: 'Come si fa il corpo vero?', a: 'Stampi la sagoma. Tagli sulle righe piene. Pieghi sulle righe a puntini. Poi incolli le linguette.' },
      },
      {
        title: 'Il motore nella pancia', mode: 'build', text: 'Trascina il servo sopra il corpo di Luna. Entra da solo nella finestrella.',
        goal: c => c.parts.some(p => p.type === 'servo' && !!p.attachedTo && c.parts.find(b => b.id === p.attachedTo)?.type === 'petBody'),
        why: { q: 'Perché il servo sta dentro?', a: 'Così il braccio bianco esce dalla schiena. Lì metteremo la coda.' },
      },
      {
        title: 'Collega il servo', mode: 'wire', text: 'I 3 fili escono dal buco dietro. Tocca la fine di un filo, poi il suo posto sul micro:bit.',
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
        title: 'Dai energia', mode: 'wire', text: 'Collega il computer con il cavo USB. Oppure usa le pile. Tocca la spina, poi la sua presa sul micro:bit.',
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
        goal: c => c.parts.some(p => p.type === 'foilPatch' && c.parts.find(b => b.id === p.attachedTo)?.type === 'petBody'),
        why: { q: 'Perché la stagnola?', a: 'La stagnola è metallo: fa passare l\'elettricità. Il micro:bit sente quando la tocchi.' },
      },
      {
        title: 'Collega la stagnola', mode: 'wire', text: 'Tocca il cerchietto sulla stagnola. Poi tocca il pin 1 del micro:bit.',
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
        goal: c => c.runInStep && pauses(c.code).length > 0 && Math.min(...pauses(c.code)) < 300 && !!c.stats && c.stats.pins.has('P1') && c.servoMoves >= 2,
      },
    ],
    real: {
      materials: ['un micro:bit V2', 'il cavo USB, oppure 2 pile AAA con il portapile', 'un servo SG90 con il braccio lungo', '4 cavi a coccodrillo', 'la sagoma di Luna stampata su cartoncino', 'stagnola, circa 3,5 x 2 cm', 'colla stick o nastro adesivo', 'forbici'],
      printable: { label: 'Scarica le sagome di Luna (PDF)', file: 'paper-pet/luna-sagome.pdf' },
      safety: [['adulto', 'La finestrella del servo è piccola: tagliala con un adulto.'], ['solo', 'Ritaglia, piega e incolla con la colla stick.'], ['solo', 'Attacca i coccodrilli ai fili del servo e alla stagnola.']],
    },
  },
];

export const LESSONS: LessonDef[] = [
  { n: 1, title: 'Primi passi', projects: [{ icon: 'gi:heart-beats', title: 'Il cuore che batte', level: 'cuore' }, { icon: 'gi:footprint', title: 'Il contapassi', level: 'contapassi' }, { icon: 'gi:moon', title: 'La luce notturna' }, { icon: 'gi:rock', title: 'Sasso, carta, forbice' }] },
  { n: 2, title: 'Il laboratorio dello scienziato', projects: [{ icon: 'gi:lightning-electron', title: 'Il tester dei conduttori' }, { icon: 'gi:wire-coil', title: 'Non toccare il filo!' }, { icon: 'gi:banana', title: 'Il piano di frutta' }] },
  { n: 3, title: 'Messaggi senza fili', projects: [{ icon: 'gi:walkie-talkie', title: 'Messaggi segreti' }, { icon: 'gi:open-treasure-chest', title: 'Caccia al tesoro' }] },
  { n: 4, title: 'Il servo e i materiali di riciclo', projects: [{ icon: 'gi:labrador-head', title: 'Luna che scodinzola', level: 'paperpet' }, { icon: 'gi:milk-carton', title: 'Il mostro del latte' }, { icon: 'gi:catapult', title: 'La catapulta' }] },
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
