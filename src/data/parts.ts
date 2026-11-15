// Catalogo dei pezzi: componenti elettronici, materiali di riciclo e attrezzi.
// Le schede ("card") sono scritte per bambini di 6-8 anni: frasi corte, parole semplici.

export type Mount = 'horn' | 'petBody' | 'strap' | 'cardStand' | 'testPad' | 'milkCarton' | 'catapultBase';
export type Category = 'cervello' | 'energia' | 'movimento' | 'luci' | 'collegamenti' | 'materiali' | 'attrezzi';
export type Safety = 'solo' | 'adulto' | 'soloAdulto';
export type TerminalKind = 'pad' | 'lead' | 'socket' | 'plug';

export interface TerminalDef {
  id: string;
  label: string;      // come lo chiamiamo con i bambini
  kind: TerminalKind;
  color?: string;     // colore del filo (servo, LED)
  fits?: string;      // per le spine: in quale presa entra
  pos: [number, number, number]; // posizione nel pezzo (cm)
}

export interface CardText {
  cosa: string;           // Cos'è?
  come: string[];         // Come funziona (2-3 frasi)
  sicurezza: [Safety, string][];   // chi fa cosa
  attenzione?: string;            // un divieto o un pericolo
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
  mountOn?: Mount;
  mountAlso?: Mount | Mount[]; // altri posti dove si può attaccare
  conductive?: boolean; // fa passare l'elettricità (tester dei conduttori) // dove si attacca quando lo trascini sopra (predefinito per i materiali: il braccio del servo)
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
    type: 'microbit', name: 'micro:bit V2', category: 'cervello', icon: 'microbit.svg', mountOn: 'strap', mountAlso: ['cardStand', 'milkCarton'],
    size: [MB.w, MB.h, MB.d],
    terminals: [
      { id: 'P0', label: 'pin 0', kind: 'pad', pos: [-3.05, MB.h, padZ] },
      { id: 'P1', label: 'pin 1', kind: 'pad', pos: [-1.5, MB.h, padZ] },
      { id: 'P2', label: 'pin 2', kind: 'pad', pos: [0.05, MB.h, padZ] },
      { id: '3V', label: '3V', kind: 'pad', pos: [1.6, MB.h, padZ] },
      { id: 'GND', label: 'GND', kind: 'pad', pos: [3.1, MB.h, padZ] },
      { id: 'BAT', label: 'presa delle pile', kind: 'socket', pos: [1.6, MB.h + 0.35, -MB.d / 2 + 0.5] },
      { id: 'USB', label: 'presa USB', kind: 'socket', pos: [-1.4, MB.h + 0.3, -MB.d / 2 + 0.45] },
    ],
    card: {
      cosa: 'È il cervello del robot. È un piccolo computer.',
      come: [
        'Ha 25 lucine per disegnare, due pulsanti A e B e tanti sensori.',
        'Tu gli scrivi le istruzioni con i blocchi. Lui le fa, una dopo l\'altra.',
        'Con i pin 0, 1 e 2 manda messaggi agli altri pezzi.',
      ],
      sicurezza: [['solo', 'Toccarlo e programmarlo.'], ['adulto', 'Collegarlo al computer con il cavo USB.']],
      attenzione: 'Non bagnarlo e non toccarlo con le mani bagnate.',
      mondo: 'un micro:bit V2 e il cavo USB',
    },
  },
  battery: {
    type: 'battery', name: 'Pile 2×AAA', category: 'energia', icon: 'battery.svg', safety: 'adulto', mountOn: 'strap', mountAlso: 'cardStand',
    size: [7, 2.2, 3.8],
    terminals: [{ id: 'PLUG', label: 'spina', kind: 'plug', fits: 'BAT', pos: [3.9, 0.9, 0] }],
    card: {
      cosa: 'Le pile danno l\'energia. Senza energia il micro:bit dorme.',
      come: [
        'Due pile piccole insieme fanno 3 volt.',
        'La spina bianca va nella presa in alto del micro:bit.',
      ],
      sicurezza: [['adulto', 'Mettere le pile per il verso giusto: + con +.'], ['soloAdulto', 'Buttare le pile scariche nel contenitore giusto.']],
      attenzione: 'Le pile non si aprono e non si mettono in bocca.',
      mondo: 'un portapile per 2 pile AAA con la spina, e 2 pile AAA',
    },
  },
  usb: {
    type: 'usb', name: 'Computer e cavo USB', category: 'energia', icon: 'usb-laptop.svg', safety: 'adulto',
    size: [10, 6, 7],
    terminals: [{ id: 'USBPLUG', label: 'cavo USB', kind: 'plug', fits: 'USB', pos: [5.6, 0.4, 1.5] }],
    card: {
      cosa: 'Il computer manda il programma al micro:bit e gli dà l\'energia con il cavo USB.',
      come: [
        'Il cavo USB va nella presa piccola in alto sul micro:bit.',
        'Con il cavo attaccato non servono le pile.',
      ],
      sicurezza: [['adulto', 'Attaccare e staccare il cavo USB.'], ['solo', 'Programmare con i blocchi.']],
      attenzione: 'Tira il cavo dalla spina, mai dal filo.',
      mondo: 'un computer e un cavo micro USB',
    },
  },
  servo: {
    type: 'servo', name: 'Servo', category: 'movimento', icon: 'servo.svg', mountOn: 'petBody', mountAlso: ['milkCarton', 'catapultBase'],
    size: [4.8, 4.6, 1.9],
    terminals: [
      { id: 'GND', label: 'filo marrone', kind: 'lead', color: '#7A4A22', pos: [-4.5, 0.25, 2.0] },
      { id: 'VCC', label: 'filo rosso', kind: 'lead', color: '#E5484D', pos: [-5.1, 0.25, 0] },
      { id: 'SIG', label: 'filo arancione', kind: 'lead', color: '#F7941D', pos: [-4.5, 0.25, -2.0] },
    ],
    card: {
      cosa: 'Un piccolo motore che gira fino a un punto preciso e poi si ferma.',
      come: [
        'Il micro:bit gli dice un numero da 0 a 180. Il braccio gira fin lì.',
        'Rosso e marrone portano l\'energia. L\'arancione porta il messaggio.',
      ],
      sicurezza: [['adulto', 'Attaccare i coccodrilli ai fili, con un giro di nastro isolante.'], ['solo', 'Fissare il servo con il biadesivo spesso.']],
      attenzione: 'Non girare il braccio con le mani: dentro ci sono ingranaggi piccoli che si rompono.',
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
      sicurezza: [['solo', 'Collegarlo con i coccodrilli.']],
      attenzione: 'Le gambe sono a punta: attenzione alle dita.',
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
    type: 'foilBall', name: 'Pallina di stagnola', category: 'materiali', icon: 'foil.svg', material: true, mountAlso: 'testPad', conductive: true,
    size: [3, 3, 3], terminals: [],
    card: {
      cosa: 'Carta stagnola appallottolata. Diventa un occhio, una pallina da lanciare...',
      come: ['La stagnola è di metallo: lascia passare l\'elettricità!', 'Per questo è utile per fare pulsanti fatti in casa.'],
      sicurezza: [['solo', 'Appallottolarla con le mani.']],
      mondo: 'un foglio di carta stagnola',
    },
  },
  petBody: {
    type: 'petBody', name: 'Corpo di Luna', category: 'materiali', icon: 'luna.png', material: true,
    size: [7, 7.5, 13.5], terminals: [],
    card: {
      cosa: 'Il corpo di carta di Luna. Dentro ci va il servo che muove la coda.',
      come: ['Lo stampi, lo ritagli e lo pieghi lungo le righe.', 'Sulla discesa c\'è una finestra: lì esce il braccio del servo.', 'Dietro c\'è un buco per far uscire i cavi.'],
      sicurezza: [['solo', 'Piegare e incollare con la colla stick.'], ['soloAdulto', 'Ritagliare la finestra del servo con il taglierino.']],
      mondo: 'la sagoma di Luna stampata su un cartoncino leggero',
    },
  },
  petLegs: {
    type: 'petLegs', name: 'Zampe di Luna', category: 'materiali', icon: 'luna-paw.png', material: true, mountOn: 'petBody',
    size: [7.6, 0.3, 6.4], terminals: [],
    card: {
      cosa: 'Quattro zampe di carta. Si incollano sotto la pancia.',
      come: ['Due zampe davanti e due dietro.', 'Trascinale sul corpo di Luna: si attaccano da sole.'],
      sicurezza: [['solo', 'Ritagliare e incollare.']],
      mondo: 'le zampe della sagoma, forbici e colla stick',
    },
  },
  petFace: {
    type: 'petFace', name: 'Faccia di Luna', category: 'materiali', icon: 'luna.png', material: true, mountOn: 'petBody',
    size: [7.8, 6.5, 0.3], terminals: [],
    card: {
      cosa: 'La faccia di Luna. Puoi usare quella a colori o colorarla tu.',
      come: ['Si incolla sul davanti del corpo.', 'Trascinala sul corpo di Luna: si attacca da sola.'],
      sicurezza: [['solo', 'Colorare, ritagliare e incollare.']],
      mondo: 'la faccia della sagoma, pennarelli, forbici e colla stick',
    },
  },
  petTail: {
    type: 'petTail', name: 'Coda di Luna', category: 'materiali', icon: 'luna-tail.png', material: true, mountOn: 'horn',
    size: [4.7, 0.3, 7.5], terminals: [],
    card: {
      cosa: 'La coda di carta. Ha una tasca che si infila sul braccio del servo.',
      come: ['Quando il servo gira, la coda scodinzola!', 'Trascinala sul braccio bianco del servo.'],
      sicurezza: [['solo', 'Ritagliare la coda e piegare la tasca.']],
      mondo: 'la coda della sagoma, forbici e un po\' di colla',
    },
  },
  foilPatch: {
    type: 'foilPatch', name: 'Stagnola', category: 'materiali', icon: 'foil.svg', material: true, mountOn: 'petBody',
    size: [5.2, 0.2, 3],
    terminals: [{ id: 'F', label: 'stagnola', kind: 'pad', pos: [2.9, 0.12, 0] }],
    card: {
      cosa: 'Un pezzo di carta stagnola. È di metallo: lascia passare l\'elettricità.',
      come: ['La incolli sulla schiena di Luna e la colleghi al pin 1 con un coccodrillo.', 'Quando la tocchi, il micro:bit lo sente: è un pulsante fatto in casa!'],
      sicurezza: [['solo', 'Ritagliare un pezzo da 3,5 × 2 cm e incollarlo.']],
      mondo: 'carta stagnola (oppure nastro di rame) e un cavo a coccodrillo',
    },
  },
  strap: {
    type: 'strap', name: 'Fascia per la caviglia', category: 'materiali', icon: 'socks.svg',
    size: [15.5, 16, 7.5], terminals: [],
    card: {
      cosa: 'Una fascia elastica da mettere alla caviglia. Tiene fermi il micro:bit e le pile.',
      come: ['Il micro:bit va fuori, con le lucine verso di te. Le pile dietro.', 'Quando cammini la gamba si muove: il micro:bit lo sente e conta un passo.'],
      sicurezza: [['solo', 'Allacciare la fascia: comoda, non troppo stretta.'], ['adulto', 'Fissare il portapile con il nastro, se serve.']],
      attenzione: 'Cammina piano e guarda dove vai.',
      mondo: 'un elastico largo, una fascia con il velcro, oppure un calzino lungo e un po\' di nastro',
    },
  },
  cardStand: {
    type: 'cardStand', name: 'Leggio di cartone', category: 'materiali', icon: 'package.svg',
    size: [9.5, 8.5, 9.5], terminals: [],
    card: {
      cosa: 'Un cartoncino piegato a leggio. Tiene in piedi il micro:bit vicino al letto.',
      come: ['Il micro:bit si appoggia davanti, con le lucine verso di te. Le pile stanno dietro.', 'Così il sensore di luce guarda la stanza.'],
      sicurezza: [['adulto', 'Tagliare il cartoncino.'], ['solo', 'Piegarlo e attaccarlo con il nastro.']],
      mondo: 'il cartone di una scatola di cereali e un po\' di nastro adesivo',
    },
  },
  testPad: {
    type: 'testPad', name: 'Piano di prova', category: 'materiali', icon: 'paperclip.svg',
    size: [9, 0.6, 6],
    terminals: [
      { id: 'A', label: 'graffetta sinistra', kind: 'pad', pos: [-3.7, 0.45, 0] },
      { id: 'B', label: 'graffetta destra', kind: 'pad', pos: [3.7, 0.45, 0] },
    ],
    card: {
      cosa: 'Un cartoncino con due graffette. Ci appoggi sopra l\'oggetto da provare.',
      come: ['Un cavo va dal pin 1 a una graffetta. Un altro cavo va dal GND all\'altra.', 'Se l\'oggetto fa passare l\'elettricità da una graffetta all\'altra, il circuito si chiude.'],
      sicurezza: [['solo', 'Infilare le graffette nel cartoncino e attaccare i coccodrilli.']],
      attenzione: 'Non collegare mai il 3V con il GND.',
      mondo: 'un cartoncino e due graffette di metallo (oppure tieni l\'oggetto tra le due pinze)',
    },
  },
  coin: {
    type: 'coin', name: 'Moneta', category: 'materiali', icon: 'coin.svg', mountOn: 'testPad', conductive: true,
    size: [3, 0.3, 3], terminals: [],
    card: { cosa: 'Una moneta. È di metallo.', come: ['Proviamola sul piano di prova: il cuore si accende?'], sicurezza: [['solo', 'Usarla per l\'esperimento.']], mondo: 'una moneta qualsiasi' },
  },
  banana: {
    type: 'banana', name: 'Banana', category: 'materiali', icon: 'banana.svg', mountOn: 'testPad', conductive: true,
    size: [8, 2, 3], terminals: [{ id: 'F', label: 'banana', kind: 'pad', pos: [4.3, 0.9, 0.8] }],
    card: { cosa: 'Una banana. Dentro è piena di acqua e sali.', come: ['Secondo te fa passare l\'elettricità? Provala!'], sicurezza: [['solo', 'Usarla per l\'esperimento (poi puoi mangiarla).']], mondo: 'una banana' },
  },
  eraser: {
    type: 'eraser', name: 'Gomma', category: 'materiali', icon: 'eraser.svg', mountOn: 'testPad',
    size: [4, 1.2, 2.2], terminals: [],
    card: { cosa: 'Una gomma per cancellare.', come: ['Secondo te fa passare l\'elettricità? Provala!'], sicurezza: [['solo', 'Usarla per l\'esperimento.']], mondo: 'una gomma' },
  },
  plasticCap: {
    type: 'plasticCap', name: 'Tappo di plastica', category: 'materiali', icon: 'cap.svg', mountOn: 'testPad',
    size: [2.8, 1, 2.8], terminals: [],
    card: { cosa: 'Il tappo di una bottiglia. È di plastica.', come: ['Secondo te fa passare l\'elettricità? Provalo!'], sicurezza: [['solo', 'Usarlo per l\'esperimento.']], mondo: 'il tappo di una bottiglia di plastica' },
  },
  buzzWire: {
    type: 'buzzWire', name: 'Gioco del filo', category: 'materiali', icon: 'buzzwire.svg',
    size: [14, 4.5, 6],
    terminals: [
      { id: 'W', label: 'filo', kind: 'pad', pos: [7.4, 0.5, 0] },
      { id: 'L', label: 'anello', kind: 'pad', pos: [-4.6, 0.5, 4.2] },
    ],
    card: {
      cosa: 'Un filo di metallo piegato a onde e un anello con il manico. Devi portare l\'anello da una parte all\'altra senza toccare il filo!',
      come: ['Il filo va al GND. L\'anello va al pin 0.', 'Se l\'anello tocca il filo, il circuito si chiude: il micro:bit lo sente e fa BZZZ.'],
      sicurezza: [['adulto', 'Piegare e tagliare il filo di metallo (le punte pungono).'], ['solo', 'Fermare il filo nella plastilina e attaccare i coccodrilli.']],
      attenzione: 'Le punte del filo pungono: un adulto le piega o le copre con il nastro.',
      mondo: 'un filo di metallo spesso (va bene una gruccia o filo da giardino), plastilina, 2 cavi a coccodrillo',
    },
  },
  apple: {
    type: 'apple', name: 'Mela', category: 'materiali', icon: 'red-apple.svg', conductive: true,
    size: [3.4, 3.6, 3.4], terminals: [{ id: 'F', label: 'mela', kind: 'pad', pos: [1.75, 1.6, 0] }],
    card: { cosa: 'Una mela. Dentro c\'è tanta acqua: fa passare un po\' di elettricità.', come: ['Attacchi un coccodrillo alla mela. Quando la tocchi, il micro:bit lo sente e suona.'], sicurezza: [['solo', 'Attaccare il coccodrillo alla frutta.']], mondo: 'una mela (poi la puoi mangiare)' },
  },
  lemon: {
    type: 'lemon', name: 'Limone', category: 'materiali', icon: 'lemon.svg', conductive: true,
    size: [4, 2.6, 2.6], terminals: [{ id: 'F', label: 'limone', kind: 'pad', pos: [2.2, 1.3, 0] }],
    card: { cosa: 'Un limone. È pieno di succo: conduce bene!', come: ['Attacchi un coccodrillo al limone. Quando lo tocchi, il micro:bit suona.'], sicurezza: [['solo', 'Attaccare il coccodrillo alla frutta.']], mondo: 'un limone' },
  },
  orange: {
    type: 'orange', name: 'Arancia (da tenere in mano)', category: 'materiali', icon: 'tangerine.svg', conductive: true,
    size: [3.4, 3.4, 3.4], terminals: [{ id: 'F', label: 'arancia', kind: 'pad', pos: [1.75, 1.6, 0] }],
    card: { cosa: 'Un\'arancia collegata al GND. La tieni in mano mentre suoni.', come: ['Con una mano tieni l\'arancia, con l\'altra tocchi la frutta.', 'L\'elettricità passa dalla frutta, attraverso il tuo corpo, fino all\'arancia: il circuito si chiude!'], sicurezza: [['solo', 'Tenere l\'arancia e suonare. La corrente è piccolissima: non si sente.']], mondo: 'un\'arancia e un coccodrillo dal GND' },
  },
  milkCarton: {
    type: 'milkCarton', name: 'Cartone del latte', category: 'materiali', icon: 'milk.svg',
    size: [10, 19.5, 10], terminals: [],
    card: {
      cosa: 'Un cartone del latte vuoto e pulito: diventa la testa del mostro!',
      come: ['Il servo sta sul tappo. Uno spago va dal suo braccio alla bocca: quando il braccio gira, tira lo spago e la bocca si apre.', 'Sotto la bocca c\'è il micro:bit: è l\'occhio del mostro. Sente la luce e capisce quando arriva un biscotto.'],
      sicurezza: [['adulto', 'Ritagliare la bocca nel cartone: lo fa l\'adulto prima.'], ['solo', 'Incollare il modello, disegnare occhi e denti.']],
      mondo: 'un cartone del latte con il tappo a vite, lavato e asciutto',
    },
  },
  milkString: {
    type: 'milkString', name: 'Spago e graffetta', category: 'materiali', icon: 'string.svg', material: true,
    size: [3.4, 0.8, 3.4], terminals: [],
    card: {
      cosa: 'Uno spago con una graffetta. Collega la bocca del mostro al braccio del servo.',
      come: ['Un capo è attaccato alla bocca, dietro. L\'altro si lega al braccio del servo.', 'Prima calibra: servo a 180, bocca chiusa. Solo dopo lega lo spago.'],
      sicurezza: [['solo', 'Legare lo spago e fermarlo con il nastro di carta.']],
      mondo: 'uno spago (va bene quello di una bustina di tè) e una graffetta',
    },
  },
  catapultBase: {
    type: 'catapultBase', name: 'Catapulta', category: 'materiali', icon: 'catapult-base.svg',
    size: [9, 4, 13], terminals: [],
    card: {
      cosa: 'Una catapulta di cartone e bastoncini. Un elastico tira il braccio verso l\'alto.',
      come: ['Per caricarla tiri giù il braccio. Il fermo sul servo lo tiene giù.', 'Quando il servo sposta il fermo, l\'elastico fa scattare il braccio e la pallina vola!'],
      sicurezza: [['adulto', 'Caricare la catapulta, se il servo non ce la fa a sganciarla.'], ['solo', 'Costruirla con biadesivo e nastro di carta.']],
      attenzione: 'Elastico morbido, solo palline di carta, e mai verso le persone.',
      mondo: 'i materiali del tutorial, un elastico morbido, palline di carta o pon pon',
    },
  },
  catapultLatch: {
    type: 'catapultLatch', name: 'Fermo (il grilletto)', category: 'materiali', icon: 'catapult-latch.svg', material: true,
    size: [6, 0.6, 1.2], terminals: [],
    card: {
      cosa: 'Un pezzo di bastoncino del gelato sul braccio del servo. È il grilletto della catapulta.',
      come: ['Quando è sopra il braccio della catapulta, lo tiene giù, carico.', 'Il servo gira, il fermo si sposta e... via!'],
      sicurezza: [['solo', 'Fissarlo al braccio del servo con il biadesivo.']],
      mondo: 'mezzo bastoncino del gelato',
    },
  },
  bucket: {
    type: 'bucket', name: 'Bersaglio', category: 'materiali', icon: 'bucket.svg',
    size: [5, 2.5, 5], terminals: [],
    card: {
      cosa: 'Una scatola o un bicchiere grande: il bersaglio da colpire.',
      come: ['Mettilo dove cade la pallina. Riesci a fare centro?'],
      sicurezza: [['solo', 'Spostare il bersaglio per rendere il gioco più facile o più difficile.']],
      mondo: 'una scatola aperta o un cestino',
    },
  },
  tape: {
    type: 'tape', name: 'Biadesivo e nastro di carta', category: 'attrezzi', icon: 'tape.svg', safety: 'solo', tool: true,
    size: [0, 0, 0], terminals: [],
    card: {
      cosa: 'Il biadesivo spesso e il nastro di carta tengono insieme cartone, servo e spago.',
      come: ['Il biadesivo spesso attacca il servo al cartone.', 'Il nastro di carta ferma lo spago e i coccodrilli. Si stacca senza rompere niente.'],
      sicurezza: [['solo', 'Usare il biadesivo e il nastro di carta.']],
      mondo: 'un rotolo di biadesivo spesso e uno di nastro di carta',
    },
  },
  glueStick: {
    type: 'glueStick', name: 'Colla stick e nastro', category: 'attrezzi', icon: 'glue-stick.svg', safety: 'solo', tool: true,
    size: [0, 0, 0], terminals: [],
    card: {
      cosa: 'La colla stick e il nastro adesivo tengono insieme la carta.',
      come: ['Metti la colla solo sulle linguette gialle.', 'Tieni premuto qualche secondo finché non si attacca.'],
      sicurezza: [['solo', 'Usare la colla stick e il nastro.']],
      mondo: 'una colla stick e un rotolo di nastro adesivo',
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
      sicurezza: [['soloAdulto', 'Usare la pistola e la colla.'], ['solo', 'Dire all\'adulto dove mettere la colla.']],
      attenzione: 'La punta e la colla bruciano: non toccarle, neanche quando sembrano fredde.',
      mondo: 'una pistola per colla a caldo (la usa l\'adulto)',
    },
  },
};

export const PALETTE_ORDER = ['microbit', 'battery', 'usb', 'servo', 'led', 'resistor', 'petBody', 'petLegs', 'petFace', 'petTail', 'foilPatch', 'strap', 'cardStand', 'testPad', 'coin', 'banana', 'eraser', 'plasticCap', 'buzzWire', 'apple', 'lemon', 'orange', 'milkCarton', 'milkString', 'catapultBase', 'catapultLatch', 'bucket', 'cardboardBox', 'cardboardPanel', 'paperCup', 'straw', 'cardboardTube', 'foilBall', 'glueStick', 'tape', 'scissors', 'hotGlue'];

/** Dove si attacca un pezzo trascinato sopra un altro. */
export const mountOf = (type: string): Mount | null => PARTS[type]?.mountOn ?? (PARTS[type]?.material ? 'horn' : null);
/** Tutti i posti dove un pezzo si può attaccare (il micro:bit va sia sulla fascia sia sul leggio). */
export const mountsOf = (type: string): Mount[] => [mountOf(type), ...([] as (Mount | undefined)[]).concat(PARTS[type]?.mountAlso ?? [])].filter((m): m is Mount => !!m);

export const SAFETY_LABEL: Record<Safety, string> = { solo: 'Da solo', adulto: 'Con un adulto', soloAdulto: "Solo l'adulto" };

export const WIRE_COLORS = [
  { id: 'rosso', name: 'Rosso', hex: '#E5484D' },
  { id: 'nero', name: 'Nero', hex: '#2B292E' },
  { id: 'giallo', name: 'Giallo', hex: '#EBBC4A' },
  { id: 'verde', name: 'Verde', hex: '#2E8B57' },
  { id: 'bianco', name: 'Bianco', hex: '#F2EFEA' },
];
