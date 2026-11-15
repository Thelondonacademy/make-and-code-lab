// Dati del micro:bit: icone 5×5, frecce, carattere per scrivere, note musicali.

const rows = (s: string) => s.split(',').join('');

export const ICONS: Record<string, string> = {
  Heart: rows('01010,11111,11111,01110,00100'),
  SmallHeart: rows('00000,01010,01110,00100,00000'),
  Yes: rows('00000,00001,00010,10100,01000'),
  No: rows('10001,01010,00100,01010,10001'),
  Happy: rows('00000,01010,00000,10001,01110'),
  Sad: rows('00000,01010,00000,01110,10001'),
  Confused: rows('00000,01010,00000,01010,10101'),
  Angry: rows('10001,01010,00000,11111,10101'),
  Asleep: rows('00000,11011,00000,01110,00000'),
  Surprised: rows('01010,00000,00100,01010,00100'),
  Silly: rows('10001,00000,11111,00101,00111'),
  Fabulous: rows('11111,11011,00000,01010,01110'),
  Meh: rows('01010,00000,00010,00100,01000'),
  TShirt: rows('11011,11111,01110,01110,01110'),
  Rollerskate: rows('00011,00011,11111,11111,01010'),
  Duck: rows('01100,11100,01111,01110,00000'),
  House: rows('00100,01110,11111,01110,01010'),
  Tortoise: rows('00000,01110,11111,01010,00000'),
  Butterfly: rows('11011,11111,00100,11111,11011'),
  StickFigure: rows('00100,11111,00100,01010,10001'),
  Ghost: rows('11111,10101,11111,11111,10101'),
  Sword: rows('00100,00100,00100,01110,00100'),
  Giraffe: rows('11000,01000,01000,01110,01010'),
  Skull: rows('01110,10101,11111,01110,01110'),
  Umbrella: rows('01110,11111,00100,10100,01100'),
  Snake: rows('11000,11011,01010,01110,00000'),
  Rabbit: rows('10100,10100,11110,11010,11110'),
  Cow: rows('10001,10001,11111,01110,00100'),
  QuarterNote: rows('00100,00100,00100,11100,11100'),
  EigthNote: rows('00100,00110,00101,11100,11100'),
  EighthNote: rows('00100,00110,00101,11100,11100'),
  Pitchfork: rows('10101,10101,11111,00100,00100'),
  Target: rows('00100,01110,11011,01110,00100'),
  Triangle: rows('00000,00100,01010,11111,00000'),
  LeftTriangle: rows('10000,11000,10100,10010,11111'),
  Chessboard: rows('01010,10101,01010,10101,01010'),
  Diamond: rows('00100,01010,10001,01010,00100'),
  SmallDiamond: rows('00000,00100,01010,00100,00000'),
  Square: rows('11111,10001,10001,10001,11111'),
  SmallSquare: rows('00000,01110,01010,01110,00000'),
  Scissors: rows('11001,11010,00100,11010,11001'),
};

export const ARROWS: Record<string, string> = {
  North: rows('00100,01110,10101,00100,00100'),
  NorthEast: rows('00111,00011,00101,01000,10000'),
  East: rows('00100,00010,11111,00010,00100'),
  SouthEast: rows('10000,01000,00101,00011,00111'),
  South: rows('00100,00100,10101,01110,00100'),
  SouthWest: rows('00001,00010,10100,11000,11100'),
  West: rows('00100,01000,11111,01000,00100'),
  NorthWest: rows('11100,11000,10100,00010,00001'),
};

const F: Record<string, string> = {
  '0': '01100,10010,10010,10010,01100', '1': '00100,01100,00100,00100,01110', '2': '11100,00010,01100,10000,11110',
  '3': '11110,00010,00100,10010,01100', '4': '00110,01010,10010,11111,00010', '5': '11111,10000,11110,00001,11110',
  '6': '00010,00100,01110,10001,01110', '7': '11111,00010,00100,01000,10000', '8': '01110,10001,01110,10001,01110',
  '9': '01110,10001,01110,00100,01000',
  A: '01100,10010,11110,10010,10010', B: '11100,10010,11100,10010,11100', C: '01110,10000,10000,10000,01110',
  D: '11100,10010,10010,10010,11100', E: '11110,10000,11100,10000,11110', F: '11110,10000,11100,10000,10000',
  G: '01110,10000,10011,10001,01110', H: '10010,10010,11110,10010,10010', I: '11100,01000,01000,01000,11100',
  J: '11111,00010,00010,10010,01100', K: '10010,10100,11000,10100,10010', L: '10000,10000,10000,10000,11110',
  M: '10001,11011,10101,10001,10001', N: '10001,11001,10101,10011,10001', O: '01100,10010,10010,10010,01100',
  P: '11100,10010,11100,10000,10000', Q: '01100,10010,10010,01100,00110', R: '11100,10010,11100,10010,10001',
  S: '01110,10000,01100,00010,11100', T: '11111,00100,00100,00100,00100', U: '10010,10010,10010,10010,01100',
  V: '10001,10001,10001,01010,00100', W: '10001,10001,10101,11011,10001', X: '10010,10010,01100,10010,10010',
  Y: '10001,01010,00100,00100,00100', Z: '11110,00100,01000,10000,11110',
  '!': '01000,01000,01000,00000,01000', '?': '01110,10001,00110,00000,00100', '.': '00000,00000,00000,00000,01000',
  ',': '00000,00000,00000,01000,10000', '-': '00000,00000,11100,00000,00000', '+': '00000,01000,11100,01000,00000',
  ':': '00000,01000,00000,01000,00000', '=': '00000,11110,00000,11110,00000', "'": '01000,01000,00000,00000,00000',
};

/** Restituisce le colonne (5 bit ciascuna, dall'alto) di un testo, con 1 colonna vuota tra le lettere. */
export function textColumns(text: string): number[][] {
  const cols: number[][] = [];
  for (const raw of text) {
    if (raw === ' ') { cols.push([0, 0, 0, 0, 0], [0, 0, 0, 0, 0]); continue; }
    const ch = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const g = F[ch] ?? F['?'];
    const r = g.split(',');
    let width = 0;
    for (let c = 0; c < 5; c++) for (let y = 0; y < 5; y++) if (r[y][c] === '1') width = Math.max(width, c + 1);
    for (let c = 0; c < Math.max(width, 1); c++) cols.push(r.map(row => (row[c] === '1' ? 1 : 0)));
    cols.push([0, 0, 0, 0, 0]);
  }
  return cols;
}

/** Note con nome → frequenza (Hz). */
const NOTE_INDEX: Record<string, number> = { C: 0, CSharp: 1, Db: 1, D: 2, DSharp: 3, Eb: 3, E: 4, F: 5, FSharp: 6, Gb: 6, G: 7, GSharp: 8, Ab: 8, A: 9, ASharp: 10, Bb: 10, B: 11 };
export const NOTE: Record<string, number> = {};
for (const [n, i] of Object.entries(NOTE_INDEX)) {
  for (let oct = 3; oct <= 5; oct++) {
    const f = Math.round(440 * Math.pow(2, (i + (oct - 4) * 12 - 9) / 12));
    if (oct === 4) NOTE[n] = f;
    NOTE[n + oct] = f;
  }
}

/** Frequenza da nota scritta come in music.playMelody: "C5", "E", "F#4", "R" (pausa). */
export function noteFreq(token: string, octaveDefault = 4): number {
  const m = /^([A-Ga-gRr])(#|b)?(\d)?$/.exec(token.trim());
  if (!m) return 0;
  if (m[1].toUpperCase() === 'R') return 0;
  const names = 'C_D_EF_G_A_B';
  let i = names.indexOf(m[1].toUpperCase());
  if (m[2] === '#') i++;
  if (m[2] === 'b') i--;
  const oct = m[3] ? Number(m[3]) : octaveDefault;
  return Math.round(440 * Math.pow(2, (i + (oct - 4) * 12 - 9) / 12));
}

/** Melodie incorporate (versioni brevi). */
export const MELODIES: Record<string, string> = {
  Dadadadum: 'G4:2 G G Eb:8 R:2 F F F D:8',
  Entertainer: 'D4:1 D# E C5:2 E4:1 C5:2 E4:1 C5:6',
  Prelude: 'C4:1 E G C5 E G4 C5 E',
  Ode: 'E4 E F G G F E D C C D E E:6 D:2 D:8',
  Nyan: 'F#5:2 G#5 C#5:1 D#5:2 B4:1 D5:1 C#5 B4:2',
  Ringtone: 'C4:1 D E:2 G D:1 E F:2 A',
  Funk: 'C2:2 C C D C C2 R',
  Blues: 'C4:2 E G A A# A G E',
  Birthday: 'C4:3 C:1 D:4 C:4 F E:8 C:3 C:1 D:4 C:4 G F:8',
  Wedding: 'C4:4 F:3 F:1 F:8 C:4 G:3 E:1 F:8',
  Funeral: 'C3:4 C:3 C:1 C:4 Eb:3 D:1 D:3 C:1 C:3 B2:1 C3:4',
  Punchline: 'C4:3 G3:1 F#3 G G#:3 G R B C4',
  Baddy: 'G3:1 R D4:2 R G3 R D4 R',
  Chase: 'A4:1 B C5 B4 A B C5 B4',
  BaDing: 'B5:1 E6:3',
  Wawawawaa: 'E3:3 R:1 D#:3 R:1 D:4 R:1 C#:8',
  JumpUp: 'C5:1 D E F G',
  JumpDown: 'G5:1 F E D C',
  PowerUp: 'G4:1 C5 E G:2 E:1 G:3',
  PowerDown: 'G5:1 D#5 C5 G4 B4:2 C5:3',
};
