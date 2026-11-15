// Catalogo dei pezzi: componenti elettronici, materiali di riciclo e attrezzi.
// Le schede ("card") sono scritte per bambini di 6-8 anni: frasi corte, parole semplici.

export type Category = 'cervello' | 'energia' | 'movimento' | 'luci' | 'collegamenti' | 'materiali' | 'attrezzi';
export type Safety = 'solo' | 'adulto' | 'soloAdulto';
export type TerminalKind = 'pad' | 'lead' | 'socket' | 'plug';

export interface TerminalDef {
  id: string;
  label: string;      // come lo chiamiamo con i bambini
  kind: TerminalKind;
  color?: string;     // colore del filo (servo, LED)
  pos: [number, number, number]; // posizione nel pezzo (cm)
}

export interface CardText {
  cosa: string;           // Cos'è?
  come: string[];         // Come funziona (2-3 frasi)
  sicurezza: [Safety, string][];
  mondo: string;          // Nel mondo vero ti serve...
}

export interface PartDef {
  type: string;
  name: string;
  category: Category;
  icon: string;          // file in public/icons
  safety?: Safety;       // etichetta mostrata nella tavolozza
  terminals: TerminalDef[];
  material?: boolean;    // materiale di riciclo: si può attaccare al braccio del servo
  tool?: boolean;        // attrezzo: solo scheda, non va sul banco
  size: [number, number, number]; // ingombro (cm) per posizionare e trascinare
  card: CardText;
}

export const CATEGORIES: { id: Category; name: string; bg: string; fg: string; bd: string }[] = [
  { id: 'cervello', name: 'Cervello', bg: '#F3E9F8', fg: '#833CA3', bd: '#E2CCEE' },
  { id: 'energia', name: 'Energia', bg: '#FBF2DA', fg: '#6B4E00', bd: '#F1D98F' },
  { id: 'movimento', name: 'Movimento', bg: '#FBEDEC', fg: '#B83A00', bd: '#F6C9BF' },
  { id: 'luci', name: 'Luci', bg: '#FFF1DD', fg: '#8A4B00', bd: '#F8D3A0' },
  { id: 'materiali', name: 'Materiali', bg: '#F3E7D8', fg: '#6B3F12', bd: '#E3CBB0' },
  { id: 'attrezzi', name: 'Attrezzi', bg: '#F1EEEA', fg: '#2B292E', bd: '#E6DDD2' },
];

// Le dimensioni dei componenti sono un po' più grandi del vero, così si vedono e si cliccano meglio.
export const MB = { w: 8, h: 0.25, d: 6.4 };
const padZ = MB.d / 2 - 0.45;

export const PARTS: Record<string, PartDef> = {
  microbit: {
    type: 'microbit', name: 'micro:bit V2', category: 'cervello', icon: 'microbit.svg',
    size: [MB.w, MB.h, MB.d],
    terminals: [
      { id: 'P0', label: 'pin 0', kind: 'pad', pos: [-3.05, MB.h, padZ] },
      { id: 'P1', label: 'pin 1', kind: 'pad', pos: [-1.5, MB.h, padZ] },
      { id: 'P2', label: 'pin 2', kind: 'pad', pos: [0.05, MB.h, padZ] },
      { id: '3V', label: '3V', kind: 'pad', pos: [1.6, MB.h, padZ] },
      { id: 'GND', label: 'GND', kind: 'pad', pos: [3.1, MB.h, padZ] },
      { id: 'BAT', label: 'presa delle pile', kind: 'socket', pos: [1.6, MB.h + 0.35, -MB.d / 2 + 0.5] },
    ],
    card: {
      cosa: 'È il cervello del robot. È un piccolo computer.',
      come: [
        'Ha 25 lucine per disegnare, due pulsanti A e B e tanti sensori.',
        'Tu gli scrivi le istruzioni con i blocchi. Lui le fa, una dopo l\'altra.',
        'Con i pin 0, 1 e 2 manda messaggi agli altri pezzi.',
      ],
      sicurezza: [['solo', 'Toccarlo e programmarlo.'], ['adulto', 'Non bagnarlo e non toccare i pin con le dita bagnate.']],
      mondo: 'un micro:bit V2 e il cavo USB',
    },
  },
  battery: {
    type: 'battery', name: 'Pile 2×AAA', category: 'energia', icon: 'battery.svg', safety: 'adulto',
    size: [7, 2.2, 3.8],
    terminals: [{ id: 'PLUG', label: 'spina', kind: 'plug', pos: [3.9, 0.9, 0] }],
    card: {
      cosa: 'Le pile danno l\'energia. Senza energia il micro:bit dorme.',
      come: [
        'Due pile piccole insieme fanno 3 volt.',
        'La spina bianca va nella presa in alto del micro:bit.',
      ],
      sicurezza: [['adulto', 'Mettere le pile per il verso giusto: + con +.'], ['soloAdulto', 'Le pile non si aprono e non si mettono in bocca.']],
      mondo: 'un portapile per 2 pile AAA con la spina, e 2 pile AAA',
    },
  },
  servo: {
    type: 'servo', name: 'Servo', category: 'movimento', icon: 'servo.svg',
    size: [4.8, 4.6, 1.9],
    terminals: [
      { id: 'GND', label: 'filo marrone', kind: 'lead', color: '#7A4A22', pos: [-4.4, 0.25, 0.75] },
      { id: 'VCC', label: 'filo rosso', kind: 'lead', color: '#E5484D', pos: [-4.4, 0.25, 0] },
      { id: 'SIG', label: 'filo arancione', kind: 'lead', color: '#F7941D', pos: [-4.4, 0.25, -0.75] },
    ],
    card: {
      cosa: 'Un piccolo motore che gira fino a un punto preciso e poi si ferma.',
      come: [
        'Il micro:bit gli dice un numero da 0 a 180. Il braccio gira fin lì.',
        'Rosso e marrone portano l\'energia. L\'arancione porta il messaggio.',
      ],
      sicurezza: [['solo', 'Attaccare i coccodrilli ai fili.'], ['soloAdulto', 'Incollare il servo con la colla a caldo.'], ['adulto', 'Non girare il braccio con le mani: si rompe.']],
      mondo: 'un servo SG90 e 3 cavi a coccodrillo',
    },
  },
  led: {
    type: 'led', name: 'LED', category: 'luci', icon: 'led.svg',
    size: [1.4, 2.2, 1.4],
    terminals: [
      { id: 'A', label: 'gamba lunga (+)', kind: 'lead', color: '#B8BCC4', pos: [-0.55, 0.12, 1.3] },
      { id: 'K', label: 'gamba corta (−)', kind: 'lead', color: '#B8BCC4', pos: [0.55, 0.12, 1.3] },
    ],
    card: {
      cosa: 'Una lucina che si accende quando passa l\'energia.',
      come: [
        'Ha una gamba lunga (+) e una corta (−).',
        'La gamba lunga va verso il pin. La corta va al GND.',
        'Se lo metti al contrario non si accende.',
      ],
      sicurezza: [['solo', 'Collegarlo con i coccodrilli.'], ['adulto', 'Le gambe sono a punta: attenzione alle dita.']],
      mondo: 'un LED rosso, una resistenza e 3 cavi a coccodrillo',
    },
  },
  resistor: {
    type: 'resistor', name: 'Resistenza', category: 'luci', icon: 'resistor.svg',
    size: [4.6, 0.6, 0.8],
    terminals: [
      { id: 'A', label: 'gamba 1', kind: 'lead', color: '#B8BCC4', pos: [-2.3, 0.12, 0] },
      { id: 'B', label: 'gamba 2', kind: 'lead', color: '#B8BCC4', pos: [2.3, 0.12, 0] },
    ],
    card: {
      cosa: 'È come un rubinetto: lascia passare poca energia.',
      come: [
        'Si mette prima del LED, così il LED non si stanca.',
        'Non ha un verso: puoi girarla come vuoi.',
      ],
      sicurezza: [['solo', 'Collegarla con i coccodrilli.']],
      mondo: 'una resistenza da 220 Ω (righe rosso, rosso, marrone)',
    },
  },
  cardboardBox: {
    type: 'cardboardBox', name: 'Scatola di cartone', category: 'materiali', icon: 'package.svg', material: true,
    size: [10, 7, 7], terminals: [],
    card: {
      cosa: 'Una scatola vuota. Diventa il corpo del tuo robot.',
      come: ['Puoi tagliarla, dipingerla e attaccarci i pezzi.', 'Dentro puoi nascondere il micro:bit e le pile.'],
      sicurezza: [['adulto', 'Per tagliare il cartone usa le forbici con un adulto.'], ['soloAdulto', 'Il taglierino lo usa solo l\'adulto.']],
      mondo: 'una scatola di cartone (va benissimo quella delle scarpe o dei biscotti)',
    },
  },
  cardboardPanel: {
    type: 'cardboardPanel', name: 'Pezzo di cartone', category: 'materiali', icon: 'panel.svg', material: true,
    size: [10, 0.4, 7], terminals: [],
    card: {
      cosa: 'Un pezzo piatto di cartone. Diventa orecchie, ali, bocca...',
      come: ['Si taglia con le forbici.', 'Se lo attacchi al braccio del servo, si muove!'],
      sicurezza: [['adulto', 'Tagliare con le forbici.']],
      mondo: 'un pezzo di cartone grande come un quaderno',
    },
  },
  paperCup: {
    type: 'paperCup', name: 'Bicchiere di carta', category: 'materiali', icon: 'cup.svg', material: true,
    size: [6, 8, 6], terminals: [],
    card: {
      cosa: 'Un bicchiere leggero. Diventa una testa, un cappello, un naso...',
      come: ['È leggero: il servo lo muove senza fatica.', 'Puoi disegnarci sopra gli occhi.'],
      sicurezza: [['solo', 'Colorarlo e disegnarci sopra.']],
      mondo: 'un bicchiere di carta pulito',
    },
  },
  straw: {
    type: 'straw', name: 'Cannuccia', category: 'materiali', icon: 'straw.svg', material: true,
    size: [0.7, 13, 0.7], terminals: [],
    card: {
      cosa: 'Un tubicino leggero e lungo. Diventa una coda, un braccio, un\'antenna.',
      come: ['Attaccata al braccio del servo, si muove avanti e indietro.'],
      sicurezza: [['solo', 'Usarla per costruire.'], ['soloAdulto', 'Incollarla con la colla a caldo.']],
      mondo: 'una cannuccia di carta',
    },
  },
  cardboardTube: {
    type: 'cardboardTube', name: 'Rotolo di cartone', category: 'materiali', icon: 'roll-of-paper.svg', material: true,
    size: [4.4, 4.4, 10], terminals: [],
    card: {
      cosa: 'Il tubo che resta quando finisce la carta. Diventa gambe, torri, cannocchiali.',
      come: ['È forte e leggero.', 'Puoi metterlo in piedi o sdraiato.'],
      sicurezza: [['solo', 'Usarlo per costruire.']],
      mondo: 'un rotolo di cartone della carta da cucina',
    },
  },
  foilBall: {
    type: 'foilBall', name: 'Pallina di stagnola', category: 'materiali', icon: 'foil.svg', material: true,
    size: [3, 3, 3], terminals: [],
    card: {
      cosa: 'Carta stagnola appallottolata. Diventa un occhio, una pallina da lanciare...',
      come: ['La stagnola è di metallo: lascia passare l\'elettricità!', 'Per questo è utile per fare pulsanti fatti in casa.'],
      sicurezza: [['solo', 'Appallottolarla con le mani.']],
      mondo: 'un foglio di carta stagnola',
    },
  },
  scissors: {
    type: 'scissors', name: 'Forbici', category: 'attrezzi', icon: 'scissors.svg', safety: 'adulto', tool: true,
    size: [0, 0, 0], terminals: [],
    card: {
      cosa: 'Servono per tagliare carta e cartone.',
      come: ['Taglia lontano dalle dita.', 'Quando le passi a un amico, tieni tu le punte.'],
      sicurezza: [['adulto', 'Usare le forbici con le punte arrotondate.']],
      mondo: 'forbici con le punte arrotondate',
    },
  },
  hotGlue: {
    type: 'hotGlue', name: 'Colla a caldo', category: 'attrezzi', icon: 'fire.svg', safety: 'soloAdulto', tool: true,
    size: [0, 0, 0], terminals: [],
    card: {
      cosa: 'Una pistola che scioglie la colla. Attacca forte il cartone e il servo.',
      come: ['La punta e la colla diventano caldissime.', 'Nel laboratorio, quando attacchi un pezzo al servo, immagina che lo faccia l\'adulto.'],
      sicurezza: [['soloAdulto', 'La usa solo l\'adulto. Brucia!'], ['solo', 'Tu dici all\'adulto dove mettere la colla.']],
      mondo: 'una pistola per colla a caldo (la usa l\'adulto)',
    },
  },
};

export const PALETTE_ORDER = ['microbit', 'battery', 'servo', 'led', 'resistor', 'cardboardBox', 'cardboardPanel', 'paperCup', 'straw', 'cardboardTube', 'foilBall', 'scissors', 'hotGlue'];

export const SAFETY_LABEL: Record<Safety, string> = { solo: 'Da solo', adulto: 'Con un adulto', soloAdulto: "Solo l'adulto" };

export const WIRE_COLORS = [
  { id: 'rosso', name: 'Rosso', hex: '#E5484D' },
  { id: 'nero', name: 'Nero', hex: '#2B292E' },
  { id: 'giallo', name: 'Giallo', hex: '#EBBC4A' },
  { id: 'verde', name: 'Verde', hex: '#2E8B57' },
  { id: 'bianco', name: 'Bianco', hex: '#F2EFEA' },
];
