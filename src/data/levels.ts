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
  real: { materials: string[]; safety: [string, string][] };
}

export interface LessonDef {
  n: number;
  title: string;
  projects: { icon: string; title: string; level?: string }[];
}

const has = (c: LevelCtx, type: string) => c.parts.some(p => p.type === type);
const powered = (c: LevelCtx) => c.analysis.powered.size > 0;
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
    id: 'cagnolino',
    lesson: 4,
    title: 'Il cagnolino che scodinzola',
    icon: 'gi:sitting-dog',
    intro: 'Costruiamo un cagnolino di cartone. Quando premi A, muove la coda!',
    palette: ['microbit', 'battery', 'servo', 'cardboardBox', 'paperCup', 'straw', 'cardboardPanel', 'scissors', 'hotGlue'],
    start: {
      parts: [
        { id: 'mb1', type: 'microbit', x: -9, z: 4, rot: 0 },
        { id: 'bat1', type: 'battery', x: -9, z: -5, rot: 0 },
      ],
      wires: [{ id: 'w-pow', a: 'bat1:PLUG', b: 'mb1:BAT', color: 'bianco' }],
    },
    code: `servos.P0.setAngle(90)
basic.showIcon(IconNames.Happy)
input.onButtonPressed(Button.A, function () {
    for (let index = 0; index < 4; index++) {
        servos.P0.setAngle(45)
        basic.pause(300)
        servos.P0.setAngle(135)
        basic.pause(300)
    }
    servos.P0.setAngle(90)
})
`,
    namespaces: ['basic', 'input', 'music', 'loops', 'servos'],
    dependencies: { core: '*', servo: '*' },
    steps: [
      { title: 'Prendi il servo', mode: 'build', text: 'Trascina il servo sul banco. È il motore che muove la coda.', goal: c => has(c, 'servo') },
      {
        title: 'Fai la coda', mode: 'build', text: 'Trascina la cannuccia sopra il braccio bianco del servo. Si attacca da sola.',
        goal: c => c.parts.some(p => p.type === 'straw' && !!p.attachedTo),
        why: { q: 'Nel mondo vero come si attacca?', a: 'Con la colla a caldo. Brucia: la usa solo l\'adulto. Tu gli dici dove metterla.' },
      },
      { title: 'Fai il corpo e la testa', mode: 'build', text: 'Aggiungi la scatola per il corpo e il bicchiere per la testa.', goal: c => has(c, 'cardboardBox') && has(c, 'paperCup') },
      {
        title: 'Collega il servo', mode: 'wire', text: 'Il servo ha 3 fili. Tocca la fine di un filo, poi il suo posto sul micro:bit.',
        goal: servoOk,
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
        title: 'Fallo scodinzolare', mode: 'code', text: 'Premi Prova! Poi tocca il pulsante A del micro:bit.',
        goal: c => c.running && c.servoMoves >= 2,
        why: { q: 'Cosa vogliono dire 45 e 135?', a: 'Sono le posizioni del braccio. 90 è dritto. 45 è da una parte, 135 dall\'altra.' },
      },
      {
        title: 'Cambialo tu!', mode: 'code', text: 'Fai scodinzolare la coda più veloce: metti un numero più piccolo nelle pause. Poi premi Prova! e A.',
        goal: c => c.runInStep && pauses(c.code).length > 0 && Math.min(...pauses(c.code)) < 300 && c.servoMoves >= 2,
      },
    ],
    real: {
      materials: ['un micro:bit V2 e 2 pile AAA', 'un servo SG90', '3 cavi a coccodrillo', 'una scatola di cartone, un bicchiere di carta e una cannuccia', 'colla a caldo (la usa l\'adulto)'],
      safety: [['soloAdulto', 'La colla a caldo la usa solo l\'adulto.'], ['adulto', 'Il taglio del cartone si fa con un adulto.'], ['solo', 'Attacca i coccodrilli ai fili del servo.']],
    },
  },
];

export const LESSONS: LessonDef[] = [
  { n: 1, title: 'Primi passi', projects: [{ icon: 'gi:heart-beats', title: 'Il cuore che batte', level: 'cuore' }, { icon: 'gi:footprint', title: 'Il contapassi' }, { icon: 'gi:moon', title: 'La luce notturna' }, { icon: 'gi:rock', title: 'Sasso, carta, forbice' }] },
  { n: 2, title: 'Il laboratorio dello scienziato', projects: [{ icon: 'gi:lightning-electron', title: 'Il tester dei conduttori' }, { icon: 'gi:wire-coil', title: 'Non toccare il filo!' }, { icon: 'gi:banana', title: 'Il piano di frutta' }] },
  { n: 3, title: 'Messaggi senza fili', projects: [{ icon: 'gi:walkie-talkie', title: 'Messaggi segreti' }, { icon: 'gi:open-treasure-chest', title: 'Caccia al tesoro' }] },
  { n: 4, title: 'Il servo e i materiali di riciclo', projects: [{ icon: 'gi:sitting-dog', title: 'Il cagnolino che scodinzola', level: 'cagnolino' }, { icon: 'gi:milk-carton', title: 'Il mostro del latte' }, { icon: 'gi:catapult', title: 'La catapulta' }] },
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
