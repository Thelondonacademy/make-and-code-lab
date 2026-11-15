// Costruisce i modelli 3D dei pezzi con forme semplici (stile "giocattolo").
import * as THREE from 'three';
import { MB, PARTS } from '../data/parts';

export const COLORS = {
  board: 0x2b292e, gold: 0xebbc4a, goldDark: 0xb8862a, ledOff: 0x3a2522, ledOn: 0xff3b1f,
  servo: 0x3b7dd8, servoDark: 0x2c63b3, white: 0xffffff, cardboard: 0xc98e55, cardboardDark: 0xa86f3c,
  cardboardLight: 0xdcae73, purple: 0x833ca3, orange: 0xf6520a, amber: 0xf7941d, metal: 0xb8bcc4,
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.emissive && matCache.has(key)) return matCache.get(key)!;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.0, ...opts });
  if (!opts.emissive) matCache.set(key, m);
  return m;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** Parallelepipedo con gli angoli arrotondati (visto dall'alto). */
export function roundedBox(w: number, h: number, d: number, r: number, m: THREE.Material) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(Math.PI / 2);
  g.translate(0, h, 0);
  return mesh(g, m);
}

/** Scritta piatta appoggiata sopra un pezzo. */
export function flatLabel(text: string, color = '#ffffff', heightCm = 0.5, weight = 700) {
  const c = document.createElement('canvas');
  const px = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = `${weight} ${px}px Lexend, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w; c.height = px + 16;
  const ctx2 = c.getContext('2d')!;
  ctx2.font = `${weight} ${px}px Lexend, sans-serif`;
  ctx2.fillStyle = color;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'middle';
  ctx2.fillText(text, w / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const hgt = heightCm;
  const wid = hgt * (c.width / c.height);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export interface Built {
  group: THREE.Group;
  setMounted?: (on: boolean) => void; // zampe: sparse attorno al corpo o raccolte sul foglio
  setLeads?: (ends: THREE.Vector3[] | null) => void; // servo: dove finiscono i 3 fili (null = posizione normale)
  leds?: THREE.Mesh[];
  buttons?: Record<string, THREE.Object3D>;
  logo?: THREE.Object3D;
  horn?: THREE.Group;
  ledLight?: THREE.PointLight;
  ledBulb?: THREE.Mesh;
}

function microbit(): Built {
  const g = new THREE.Group();
  const h = MB.h;
  g.add(roundedBox(MB.w, h, MB.d, 0.5, mat(COLORS.board, { roughness: 0.55 })));
  // LED 5×5
  const leds: THREE.Mesh[] = [];
  const ledGeo = new THREE.BoxGeometry(0.26, 0.12, 0.46);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const m = mesh(ledGeo, new THREE.MeshStandardMaterial({ color: COLORS.ledOff, emissive: 0x000000, roughness: 0.4 }), (x - 2) * 0.72, h + 0.06, -0.45 + (y - 2) * 0.72);
    m.userData.led = y * 5 + x;
    leds.push(m);
    g.add(m);
  }
  // pulsanti
  const buttons: Record<string, THREE.Object3D> = {};
  for (const [name, x] of [['A', -2.85], ['B', 2.85]] as const) {
    const base = mesh(new THREE.BoxGeometry(1.0, 0.18, 1.0), mat(0x55505a), x, h + 0.09, -0.45);
    const cap = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 20), mat(0x111014), x, h + 0.29, -0.45);
    cap.userData.button = name;
    base.userData.button = name;
    g.add(base, cap);
    const lab = flatLabel(name, '#E6DDD2', 0.55);
    lab.position.set(x, h + 0.02, 0.45);
    g.add(lab);
    buttons[name] = cap;
  }
  // logo (sensore di tocco)
  const logo = mesh(new THREE.TorusGeometry(0.42, 0.12, 8, 24), mat(COLORS.gold, { metalness: 0.6, roughness: 0.35 }), 0, h + 0.04, -2.55);
  logo.rotation.x = Math.PI / 2;
  logo.scale.set(1.5, 1, 1);
  logo.userData.logo = true;
  g.add(logo);
  // connettore a pettine con i 5 pin grandi
  g.add(mesh(new THREE.BoxGeometry(MB.w - 0.3, 0.04, 0.5), mat(COLORS.goldDark, { metalness: 0.5 }), 0, h + 0.01, MB.d / 2 - 0.3));
  const labels: Record<string, string> = { P0: '0', P1: '1', P2: '2', '3V': '3V', GND: 'GND' };
  for (const t of PARTS.microbit.terminals.filter(t => t.kind === 'pad')) {
    const ring = mesh(new THREE.TorusGeometry(0.42, 0.2, 10, 28), mat(COLORS.gold, { metalness: 0.65, roughness: 0.3 }), t.pos[0], h + 0.04, t.pos[2]);
    ring.rotation.x = Math.PI / 2;
    ring.userData.pad = t.id;
    g.add(ring);
    const lab = flatLabel(labels[t.id], '#FFFFFF', t.id === 'GND' ? 0.42 : 0.5);
    lab.position.set(t.pos[0], h + 0.02, t.pos[2] - 0.95);
    g.add(lab);
  }
  // presa delle pile (bianca)
  const sock = mesh(new THREE.BoxGeometry(1.0, 0.55, 0.65), mat(0xf2efea), 1.6, h + 0.27, -MB.d / 2 + 0.5);
  g.add(sock);
  const sl = flatLabel('pile', '#E6DDD2', 0.36, 600);
  sl.position.set(1.6, h + 0.02, -MB.d / 2 + 1.25);
  g.add(sl);
  const usb = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.55), mat(0xc0c4cc, { metalness: 0.7, roughness: 0.3 }), -1.4, h + 0.18, -MB.d / 2 + 0.45);
  g.add(usb);
  const ul = flatLabel('USB', '#E6DDD2', 0.34, 600);
  ul.position.set(-1.4, h + 0.02, -MB.d / 2 + 1.15);
  g.add(ul);
  const name = flatLabel('micro:bit', '#9A938C', 0.38, 600);
  name.position.set(-2.4, h + 0.02, -2.6);
  g.add(name);
  return { group: g, leds, buttons, logo };
}

function battery(): Built {
  const g = new THREE.Group();
  g.add(roundedBox(7, 1.4, 3.8, 0.35, mat(0x2b292e)));
  for (const z of [-0.85, 0.85]) {
    const cell = mesh(new THREE.CylinderGeometry(0.62, 0.62, 5.6, 20), mat(COLORS.gold, { roughness: 0.5 }), 0, 1.45, z);
    cell.rotation.z = Math.PI / 2;
    g.add(cell);
    const tip = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 12), mat(COLORS.metal, { metalness: 0.7 }), z < 0 ? 2.9 : -2.9, 1.45, z);
    tip.rotation.z = Math.PI / 2;
    g.add(tip);
  }
  // fili e spina
  const curve = (z: number) => new THREE.CatmullRomCurve3([new THREE.Vector3(3.5, 0.6, z), new THREE.Vector3(3.75, 0.8, z * 0.5), new THREE.Vector3(3.9, 0.9, z * 0.15)]);
  g.add(mesh(new THREE.TubeGeometry(curve(0.25), 8, 0.09, 6), mat(0xe5484d)));
  g.add(mesh(new THREE.TubeGeometry(curve(-0.25), 8, 0.09, 6), mat(0x1d1c1f)));
  const plug = mesh(new THREE.BoxGeometry(0.6, 0.45, 0.8), mat(0xf2efea), 4.1, 0.9, 0);
  g.add(plug);
  const lab = flatLabel('+ 3V', '#EBBC4A', 0.5);
  lab.position.set(-2.4, 1.42, 0);
  g.add(lab);
  return { group: g };
}

function servo(): Built {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(3.4, 3.2, 1.8), mat(COLORS.servo), 0, 1.6, 0);
  g.add(body);
  g.add(mesh(new THREE.BoxGeometry(4.8, 0.25, 1.8), mat(COLORS.servoDark), 0, 2.55, 0));
  g.add(mesh(new THREE.BoxGeometry(3.4, 0.3, 1.8), mat(0x5b9bea), 0, 3.35, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.45, 20), mat(COLORS.servoDark), -0.85, 3.7, 0));
  const lab = flatLabel('SG90', '#FFFFFF', 0.5);
  lab.rotation.set(0, 0, 0);
  lab.position.set(0.4, 1.4, 0.91);
  g.add(lab);
  // braccio (horn): ruota attorno all'asse verticale
  const horn = new THREE.Group();
  horn.position.set(-0.85, 3.95, 0);
  horn.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 20), mat(COLORS.white)));
  const arm = mesh(new THREE.BoxGeometry(2.6, 0.2, 0.55), mat(COLORS.white), 1.2, 0, 0);
  horn.add(arm);
  const tip = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), mat(COLORS.white), 2.5, 0, 0);
  horn.add(tip);
  horn.children.forEach(c => { c.userData.horn = true; });
  g.add(horn);
  // i 3 fili colorati (si possono far passare da un'altra parte, per esempio dal buco dietro il corpo di Luna)
  const leads = new THREE.Group();
  g.add(leads);
  const setLeads = (ends: THREE.Vector3[] | null) => {
    leads.clear();
    PARTS.servo.terminals.forEach((t, i) => {
      const end = ends ? ends[i] : new THREE.Vector3(...t.pos);
      const start = new THREE.Vector3(-1.7, 0.7, t.pos[2] * 0.35);
      const mid = ends ? start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, -0.6, 0)) : new THREE.Vector3(-3.0, 0.35, t.pos[2] * 0.8);
      const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, mid, end]), 16, 0.12, 6), mat(new THREE.Color(t.color!).getHex()));
      leads.add(tube);
      const cap = mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), mat(0x1d1c1f), end.x, end.y, end.z);
      leads.add(cap);
    });
    leads.traverse(o => { o.userData.partRoot = g; });
  };
  setLeads(null);
  return { group: g, horn, setLeads };
}

function led(): Built {
  const g = new THREE.Group();
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xd81e1e, emissive: 0x000000, transparent: true, opacity: 0.85, roughness: 0.25 });
  const bulb = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 20), bulbMat, 0, 1.1, 0);
  const dome = mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), bulbMat, 0, 1.55, 0);
  const rim = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 20), bulbMat, 0, 0.66, 0);
  g.add(bulb, dome, rim);
  for (const t of PARTS.led.terminals) {
    const x = t.pos[0];
    const pts = [new THREE.Vector3(x * 0.45, 0.66, 0), new THREE.Vector3(x * 0.6, t.id === 'A' ? 0.25 : 0.32, 0.2), new THREE.Vector3(x, t.pos[1], t.pos[2])];
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.05, 6), mat(COLORS.metal, { metalness: 0.7, roughness: 0.3 })));
  }
  const plus = flatLabel('+', '#B83A00', 0.55, 800);
  plus.position.set(-0.55, 0.14, 1.9);
  g.add(plus);
  const minus = flatLabel('−', '#2B292E', 0.55, 800);
  minus.position.set(0.55, 0.14, 1.9);
  g.add(minus);
  const light = new THREE.PointLight(0xff3020, 0, 6, 2);
  light.position.set(0, 1.6, 0);
  g.add(light);
  return { group: g, ledLight: light, ledBulb: dome };
}

function resistor(): Built {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.28, 1.2, 6, 14), mat(0xe8c9a0), 0, 0.42, 0);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (const [x, c] of [[-0.35, 0xd3201e], [0, 0xd3201e], [0.35, 0x7d4533]] as const) {
    const band = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16), mat(c), x, 0.42, 0);
    band.rotation.z = Math.PI / 2;
    g.add(band);
  }
  for (const s of [-1, 1]) {
    const pts = [new THREE.Vector3(s * 0.85, 0.42, 0), new THREE.Vector3(s * 1.7, 0.3, 0), new THREE.Vector3(s * 2.3, 0.12, 0)];
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.05, 6), mat(COLORS.metal, { metalness: 0.7 })));
  }
  return { group: g };
}

function cardboardBox(): Built {
  const g = new THREE.Group();
  const b = mesh(new THREE.BoxGeometry(10, 7, 7), mat(COLORS.cardboard, { roughness: 0.95 }), 0, 3.5, 0);
  g.add(b);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry), new THREE.LineBasicMaterial({ color: COLORS.cardboardDark }));
  edges.position.copy(b.position);
  g.add(edges);
  g.add(mesh(new THREE.BoxGeometry(10.02, 0.6, 0.12), mat(COLORS.cardboardLight), 0, 7.0, 0)); // nastro adesivo
  return { group: g };
}

function cardboardPanel(): Built {
  const g = new THREE.Group();
  const b = mesh(new THREE.BoxGeometry(10, 0.4, 7), mat(COLORS.cardboardLight, { roughness: 0.95 }), 0, 0.2, 0);
  g.add(b);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry), new THREE.LineBasicMaterial({ color: COLORS.cardboardDark }));
  edges.position.copy(b.position);
  g.add(edges);
  return { group: g };
}

function paperCup(): Built {
  const g = new THREE.Group();
  // capovolto: fa da testa o cappello
  const side = mesh(new THREE.CylinderGeometry(2.2, 3.0, 8, 28, 1, true), mat(COLORS.white, { side: THREE.DoubleSide, roughness: 0.9 }), 0, 4, 0);
  const top = mesh(new THREE.CircleGeometry(2.2, 28), mat(0xf3e7d8), 0, 8, 0);
  top.rotation.x = -Math.PI / 2;
  const band = mesh(new THREE.CylinderGeometry(2.62, 2.75, 1.0, 28, 1, true), mat(COLORS.amber, { side: THREE.DoubleSide }), 0, 2.6, 0);
  g.add(side, top, band);
  return { group: g };
}

function straw(): Built {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 13, 14), mat(COLORS.purple), 0, 6.5, 0));
  for (let i = 0; i < 6; i++) inner.add(mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.5, 14), mat(COLORS.white), 0, 1.2 + i * 2.1, 0));
  inner.name = 'straw-inner';
  g.add(inner);
  return { group: g };
}

function cardboardTube(): Built {
  const g = new THREE.Group();
  const t = mesh(new THREE.CylinderGeometry(2.2, 2.2, 10, 28, 1, true), mat(COLORS.cardboard, { side: THREE.DoubleSide, roughness: 0.95 }), 0, 2.2, 0);
  t.rotation.x = Math.PI / 2;
  g.add(t);
  return { group: g };
}

function foilBall(): Built {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(1.5, 1), mat(0xd4d8de, { metalness: 0.85, roughness: 0.35, flatShading: true }), 0, 1.5, 0));
  return { group: g };
}

// ---------- Luna (Paper Pet) ----------
const BASE = (import.meta as any).env?.BASE_URL || './';
const texCache = new Map<string, THREE.Texture>();
function tex(file: string) {
  if (!texCache.has(file)) {
    const t = new THREE.TextureLoader().load(BASE + 'paper-pet/' + file);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(file, t);
  }
  return texCache.get(file)!;
}
const paperMat = (file: string) => new THREE.MeshStandardMaterial({ map: tex(file), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.9 });

/** Misure del corpo di Luna (scala del banco: 1,5 × il vero, come gli altri pezzi). */
export const PET = { W: 6.9, L: 13.5, HF: 7.5, HB: 3.3, TOP: 6.0 };

function petBody(): Built {
  const g = new THREE.Group();
  const { W, L, HF, HB, TOP } = PET;
  // profilo visto di fianco: u dal davanti, h altezza
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(L, HB); s.lineTo(TOP, HF); s.lineTo(0, HF); s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);          // u → -z
  geo.translate(-W / 2, 0, L / 2);   // davanti a z = +L/2
  const body = mesh(geo, mat(0xeab554, { roughness: 0.95 }));
  g.add(body);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xb98a3a }));
  g.add(edges);
  // macchie del mantello e finestra del servo (decorazioni piatte sulla discesa)
  const slopeLen = Math.hypot(L - TOP, HF - HB);
  const ang = Math.atan2(HF - HB, L - TOP);
  const win = mesh(new THREE.PlaneGeometry(1.95, 3.5), mat(0x3d2a17));
  const t = 0.35;
  win.position.set(0, HF - t * (HF - HB) + 0.02, L / 2 - (TOP + t * (L - TOP)) - 0.01);
  win.rotation.set(-Math.PI / 2 + ang, 0, 0);
  g.add(win);
  // uscita dei cavi dietro
  const hole = mesh(new THREE.PlaneGeometry(1.8, 1.2), mat(0x3d2a17));
  hole.position.set(0, 0.6, -L / 2 - 0.02);
  hole.rotation.y = Math.PI;
  g.add(hole);
  void slopeLen;
  return { group: g };
}

/** Dove sta il servo infilato nel corpo: braccio fuori dalla discesa, a metà. */
export function petServoPose() {
  const { L, HF, HB, TOP } = PET;
  const t = 0.35;
  const P = new THREE.Vector3(0, HF - t * (HF - HB), L / 2 - (TOP + t * (L - TOP)));
  const d = new THREE.Vector3(0, HB - HF, -(L - TOP)).normalize();     // giù per la discesa
  const n = new THREE.Vector3(0, -d.z, d.y).multiplyScalar(-1);          // fuori dalla discesa, verso l'alto
  if (n.y < 0) n.negate();
  const X = d.clone();                // il braccio a 90° guarda giù per la discesa: la coda va indietro
  const Y = n.clone();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const target = P.clone().add(n.clone().multiplyScalar(0.25));
  const hornLocal = new THREE.Vector3(-0.85, 3.95, 0).applyQuaternion(q);
  return { pos: target.sub(hornLocal), quat: q };
}

/** Dove escono i 3 fili del servo quando è nel corpo: dal buco dietro. (Coordinate del corpo.) */
export function petLeadEnds() {
  const { L } = PET;
  return [-0.9, 0, 0.9].map(x => new THREE.Vector3(x, 0.25, -L / 2 - 2.6));
}

function petFace(): Built {
  const g = new THREE.Group();
  // misure vere × 0,15: faccia 52 mm, come nella sagoma
  const face = mesh(new THREE.PlaneGeometry(7.8, 7.8 * 1035 / 1254), paperMat('luna-face.png'));
  face.position.y = 3.0;
  face.castShadow = false;
  g.add(face);
  return { group: g };
}

function petTail(): Built {
  const g = new THREE.Group();
  const th = 4.65 * 1420 / 894; // coda 31 mm, come nella sagoma
  const tail = mesh(new THREE.PlaneGeometry(4.65, th), paperMat('luna-tail.png'));
  tail.name = 'tail-plane';
  tail.position.set(0, th / 2 - 0.3, 0);
  g.add(tail);
  return { group: g };
}

function petLegs(): Built {
  const g = new THREE.Group();
  const m = paperMat('luna-paw.png');
  const PW = 3.3, PH = 3.3 * 1082 / 1296; // zampa 22 mm, come nella sagoma
  const sheet = mesh(new THREE.PlaneGeometry(7.6, 6.4), mat(0xfbf8f1, { side: THREE.DoubleSide }), 0, 0.02, 0);
  sheet.rotation.x = -Math.PI / 2;
  sheet.castShadow = false;
  sheet.receiveShadow = true;
  g.add(sheet);
  const paws: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const p = mesh(new THREE.PlaneGeometry(PW, PH), m, 0, 0.05, 0);
    p.castShadow = false;
    paws.push(p);
    g.add(p);
  }
  const bench = [[-1.8, -1.5, 0], [1.8, -1.5, 0], [-1.8, 1.5, 0], [1.8, 1.5, 0]];
  const out = PET.L / 2 + PH / 2 - 0.3; // la linguetta è sotto la pancia, la zampa spunta fuori
  const body = [[-1.75, out, 0], [1.75, out, 0], [-1.75, -out, Math.PI], [1.75, -out, Math.PI]];
  const setMounted = (on: boolean) => {
    sheet.visible = !on;
    (on ? body : bench).forEach(([x, z, r], i) => { paws[i].position.set(x, 0.05, z); paws[i].rotation.set(-Math.PI / 2, 0, r); });
  };
  setMounted(false);
  return { group: g, setMounted };
}

function foilPatch(): Built {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(5.2, 3, 12, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.06);
  geo.computeVertexNormals();
  const f = mesh(geo, mat(0xe6e9ee, { metalness: 0.35, roughness: 0.3, emissive: 0x30343a, side: THREE.DoubleSide }), 0, 0.06, 0);
  f.rotation.x = -Math.PI / 2;
  g.add(f);
  return { group: g };
}

function usbLaptop(): Built {
  const g = new THREE.Group();
  g.add(roundedBox(9, 0.5, 6, 0.4, mat(0xa3a8b3, { metalness: 0.4, roughness: 0.4 })));
  g.add(mesh(new THREE.BoxGeometry(7.6, 0.04, 3.4), mat(0x3a3d45), 0, 0.52, 0.4));
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, -3);
  lid.rotation.x = -0.32;
  lid.add(mesh(new THREE.BoxGeometry(9, 5.8, 0.3), mat(0x3a3d45), 0, 2.9, 0));
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const x = c.getContext('2d')!;
  x.fillStyle = '#3454D1'; x.fillRect(0, 0, 320, 200);
  x.fillStyle = '#F5F0EA'; x.fillRect(0, 0, 320, 26);
  x.fillStyle = '#F7941D'; x.fillRect(110, 50, 120, 30);
  x.fillStyle = '#2E8B57'; x.fillRect(110, 92, 150, 30);
  x.fillStyle = '#833CA3'; x.fillRect(110, 134, 100, 30);
  x.fillStyle = '#1D1C1F'; x.fillRect(16, 50, 70, 56);
  x.fillStyle = '#F6520A'; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if ((i + j) % 2 === 0) x.fillRect(24 + i * 12, 56 + j * 10, 6, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 5.1), new THREE.MeshBasicMaterial({ map: t }));
  screen.position.set(0, 2.95, 0.16);
  lid.add(screen);
  g.add(lid);
  // cavo e spina USB a destra
  const pts = [new THREE.Vector3(4.5, 0.25, 1.5), new THREE.Vector3(5.1, 0.3, 1.5), new THREE.Vector3(5.6, 0.4, 1.5)];
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.12, 6), mat(0x55585f)));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.35, 0.5), mat(0xc0c4cc, { metalness: 0.6 }), 5.8, 0.4, 1.5));
  return { group: g };
}

// ---------- Contapassi: la fascia alla caviglia ----------
/** La gamba con la fascia: il piede guarda a sinistra (-x), la caviglia è in x = LEG.x. */
export const LEG = { x: 1.5, r: 3.2, band: 3.6, bandY: 9.6 };

function strap(): Built {
  const g = new THREE.Group();
  const shoe = roundedBox(15, 3, 7, 1.4, mat(0x3f6fb5, { roughness: 0.8 }));
  shoe.position.set(-2.5, 0, 0);
  g.add(shoe);
  const sole = roundedBox(15.4, 0.6, 7.4, 1.5, mat(0xf4f1ea));
  sole.position.set(-2.5, -0.05, 0);
  g.add(sole);
  for (const x of [-6, -4, -2]) g.add(mesh(new THREE.BoxGeometry(0.35, 0.2, 4.2), mat(0xffffff), x, 3.05, 0));
  // il calzino: bianco con due righe in alto
  const leg = mesh(new THREE.CylinderGeometry(LEG.r * 1.08, LEG.r, 14, 28), mat(0xf4f1ea, { roughness: 0.95 }), LEG.x, 9.5, 0);
  g.add(leg);
  for (const y of [14.3, 15.4]) g.add(mesh(new THREE.CylinderGeometry(LEG.r * 1.1, LEG.r * 1.1, 0.5, 28), mat(0x3f6fb5), LEG.x, y, 0));
  g.add(mesh(new THREE.CylinderGeometry(LEG.r * 1.1, LEG.r * 1.1, 0.4, 28), mat(0xd9d4ca), LEG.x, 16.4, 0));
  const band = mesh(new THREE.CylinderGeometry(LEG.band, LEG.band, 4.2, 40, 1, true), mat(0xf26b21, { roughness: 0.85, side: THREE.DoubleSide }), LEG.x, LEG.bandY, 0);
  g.add(band);
  const velcro = mesh(new THREE.BoxGeometry(1.6, 3.6, 0.3), mat(0xc4501a, { roughness: 1 }), LEG.x - LEG.band, LEG.bandY, 0);
  velcro.rotation.y = Math.PI / 2;
  g.add(velcro);
  return { group: g };
}

/** Dove sta un pezzo allacciato alla fascia. */
export function strapPose(type: string): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
  const basis = (X: number[], Y: number[], Z: number[]) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z)));
  switch (type) {
    // display verso di te, i pin in basso
    case 'microbit': return { pos: new THREE.Vector3(LEG.x, LEG.bandY, LEG.band + 0.05), quat: basis([1, 0, 0], [0, 0, 1], [0, -1, 0]) };
    // dietro, sul tallone
    case 'battery': return { pos: new THREE.Vector3(LEG.x + LEG.band + 0.05, LEG.bandY, 0), quat: basis([0, 0, 1], [1, 0, 0], [0, 1, 0]) };
    default: return null;
  }
}

// ---------- Luce notturna: il leggio di cartone ----------
export const STAND = { tilt: 0.26, h: 8.2, w: 9.2 };

function cardStand(): Built {
  const g = new THREE.Group();
  const card = mat(0xd9a660, { roughness: 0.95 });
  g.add(mesh(new THREE.BoxGeometry(STAND.w, 0.4, 9.4), card, 0, 0.2, -0.3));
  const { c, s, u, mid } = standFrame();
  const panel = mesh(new THREE.BoxGeometry(STAND.w, STAND.h, 0.4), card, mid.x, mid.y, mid.z);
  panel.rotation.x = -STAND.tilt;
  g.add(panel);
  // il bordino davanti che tiene fermo il micro:bit
  g.add(mesh(new THREE.BoxGeometry(STAND.w, 0.9, 0.4), mat(0xc48f4c), 0, 0.85, 1.75));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry), new THREE.LineBasicMaterial({ color: 0xa87b3f }));
  edges.position.copy(panel.position); edges.rotation.copy(panel.rotation);
  g.add(edges);
  void c; void s; void u;
  return { group: g };
}

function standFrame() {
  const c = Math.cos(STAND.tilt), s = Math.sin(STAND.tilt);
  const u = new THREE.Vector3(0, c, -s);            // su, lungo il pannello
  const n = new THREE.Vector3(0, s, c);             // fuori dal pannello, verso di te
  const bottom = new THREE.Vector3(0, 0.4, 1.2);
  const mid = bottom.clone().add(u.clone().multiplyScalar(STAND.h / 2));
  return { c, s, u, n, mid };
}

/** Dove sta un pezzo appoggiato al leggio. */
export function standPose(type: string): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
  const { c, s, n, u, mid } = standFrame();
  const basis = (X: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  switch (type) {
    // display verso di te, i pin in basso sul bordino
    case 'microbit': return { pos: mid.clone().add(n.clone().multiplyScalar(0.2)).add(u.clone().multiplyScalar(-0.7)), quat: basis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, s, c), new THREE.Vector3(0, -c, s)) };
    // dietro, sdraiate sulla base
    case 'battery': return { pos: new THREE.Vector3(0, 0.4, -2.6), quat: new THREE.Quaternion() };
    default: return null;
  }
}

// ---------- Tester dei conduttori ----------
function testPad(): Built {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(9, 0.3, 6), mat(0xd9a660, { roughness: 0.95 }), 0, 0.15, 0));
  const metal = mat(0xc9ced6, { metalness: 0.85, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    // graffetta: un anello allungato di filo di metallo, dal centro verso il bordo
    const path = new THREE.CurvePath<THREE.Vector3>();
    const pts = [[0.8, -0.45], [3.9, -0.45], [3.9, 0.45], [1.2, 0.45], [1.2, -0.15], [3.4, -0.15]].map(([x, z]) => new THREE.Vector3(sx * x, 0.42, z));
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    g.add(mesh(new THREE.TubeGeometry(path as any, 60, 0.09, 6), metal));
  }
  return { group: g };
}

function coin(): Built {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.25, 32), mat(0xc9a24a, { metalness: 0.8, roughness: 0.35 }), 0, 0.125, 0));
  g.add(mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 32), mat(0xb08a35, { metalness: 0.8 }), 0, 0.26, 0).rotateX(Math.PI / 2));
  return { group: g };
}

function banana(): Built {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-4, 0.9, 0.8), new THREE.Vector3(0, 0.9, -1.6), new THREE.Vector3(4, 0.9, 0.8));
  const geo = new THREE.TubeGeometry(curve, 30, 0.8, 10);
  // più sottile alle punte
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = Math.floor(i / 11) / 30;
    const k = 0.35 + 0.65 * Math.sin(Math.PI * t);
    const c = curve.getPoint(t);
    v.sub(c).multiplyScalar(k).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, mat(0xf2cf3b, { roughness: 0.7 })));
  for (const x of [-4, 4]) g.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(0x5a4320), x, 0.9, 0.8));
  return { group: g };
}

function eraser(): Built {
  const g = new THREE.Group();
  const a = roundedBox(2.2, 1, 2.2, 0.25, mat(0xf3a0b4, { roughness: 0.9 }));
  a.position.x = -0.9;
  const b = roundedBox(1.8, 1, 2.2, 0.25, mat(0x5b8fd6, { roughness: 0.9 }));
  b.position.x = 1.1;
  g.add(a, b);
  return { group: g };
}

function plasticCap(): Built {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.9, 28), mat(0x2f80d1, { roughness: 0.5 }), 0, 0.45, 0));
  return { group: g };
}

// ---------- Non toccare il filo ----------
function buzzWire(): Built {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(14, 0.4, 5.4), mat(0xd9a660, { roughness: 0.95 }), 0, 0.2, 0));
  const clay = mat(0x4fb06a, { roughness: 1 });
  for (const x of [-6, 6]) { const c = mesh(new THREE.SphereGeometry(1, 16, 12), clay, x, 0.9, 0); c.scale.set(1, 0.75, 1); g.add(c); }
  const metal = mat(0xc0c6cf, { metalness: 0.85, roughness: 0.3 });
  // il filo a onde, da una plastilina all'altra
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = -6 + 12 * t;
    pts.push(new THREE.Vector3(x, 1.2 + 2.2 * Math.sin(Math.PI * t) + 0.7 * Math.sin(3 * Math.PI * t), 1.1 * Math.sin(2 * Math.PI * t)));
  }
  pts.push(new THREE.Vector3(7.4, 0.5, 0)); // il capo del filo esce a destra: qui va il coccodrillo
  const wire = new THREE.CatmullRomCurve3(pts);
  g.add(mesh(new THREE.TubeGeometry(wire, 120, 0.12, 8), metal));
  // l'anello infilato sul filo, con il manico che esce verso di te
  const at = wire.getPoint(0.18);
  const ring = mesh(new THREE.TorusGeometry(0.75, 0.1, 8, 28), metal, at.x, at.y, at.z);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  const handleEnd = new THREE.Vector3(-4.6, 0.5, 4.2);
  const handle = new THREE.LineCurve3(new THREE.Vector3(at.x, at.y - 0.75, at.z), handleEnd);
  g.add(mesh(new THREE.TubeGeometry(handle as any, 8, 0.1, 6), metal));
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 12), mat(0xe5484d), handleEnd.x + 0.0, handleEnd.y + 0.3, handleEnd.z - 0.6).rotateX(Math.PI / 2.6));
  return { group: g };
}

// ---------- Il piano di frutta ----------
function fruitBall(color: number, rx: number, ry: number, rz: number, stem = true): Built {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(1, 24, 18), mat(color, { roughness: 0.55 }), 0, ry, 0);
  b.scale.set(rx, ry, rz);
  g.add(b);
  if (stem) {
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 6), mat(0x6b4a22), 0, ry * 2 + 0.15, 0));
    const leaf = mesh(new THREE.SphereGeometry(0.35, 8, 6), mat(0x4f9a3c), 0.3, ry * 2 + 0.25, 0);
    leaf.scale.set(1, 0.3, 0.55);
    g.add(leaf);
  }
  return { group: g };
}
const apple = () => fruitBall(0xd93a32, 1.6, 1.55, 1.6);
const orange = () => fruitBall(0xf28c1c, 1.65, 1.6, 1.65);
const lemon = () => fruitBall(0xf5d63d, 2, 1.25, 1.25, false);

/** Dove sta l'oggetto appoggiato sul piano di prova: sopra le due graffette. */
export function padPose(): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  return { pos: new THREE.Vector3(0, 0.5, 0), quat: new THREE.Quaternion() };
}

// ---------- Il mostro del latte e la catapulta ----------
/** Mette il servo in modo che il suo braccio stia in `hub` con gli assi dati (asse del braccio a 90° = X, asse di rotazione = Y). */
function servoAt(hub: THREE.Vector3, X: THREE.Vector3, Y: THREE.Vector3) {
  const Z = new THREE.Vector3().crossVectors(X, Y);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const hornLocal = new THREE.Vector3(-0.85, 3.95, 0).applyQuaternion(q);
  return { pos: hub.clone().sub(hornLocal), quat: q };
}

export const MILK = { W: 6, D: 6, H: 9, hubY: 5.0 };
function milkCarton(): Built {
  const g = new THREE.Group();
  const { W, D, H } = MILK;
  const white = mat(0xf4f7fb, { roughness: 0.8 });
  // pareti: quella davanti ha il buco della bocca
  const front = new THREE.Shape();
  front.moveTo(-W / 2, 0); front.lineTo(W / 2, 0); front.lineTo(W / 2, H); front.lineTo(-W / 2, H); front.lineTo(-W / 2, 0);
  const hole = new THREE.Path();
  hole.moveTo(-2.3, MILK.hubY - 3.2); hole.lineTo(2.3, MILK.hubY - 3.2); hole.lineTo(2.3, MILK.hubY); hole.lineTo(-2.3, MILK.hubY); hole.lineTo(-2.3, MILK.hubY - 3.2);
  front.holes.push(hole);
  const fg = new THREE.ExtrudeGeometry(front, { depth: 0.2, bevelEnabled: false });
  g.add(mesh(fg, white, 0, 0, D / 2 - 0.2));
  g.add(mesh(new THREE.BoxGeometry(W, H, 0.2), white, 0, H / 2, -D / 2 + 0.1));
  for (const x of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.2, H, D), white, x * (W / 2 - 0.1), H / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(W, 0.2, D), mat(0x2b1a1a), 0, 0.1, 0));
  // dentro la bocca: buio e una lingua
  g.add(mesh(new THREE.PlaneGeometry(W - 0.4, H - 0.4), mat(0x2b1a1a), 0, H / 2, -D / 2 + 0.22));
  g.add(mesh(new THREE.BoxGeometry(3, 0.2, 2.6), mat(0xe5484d), 0, MILK.hubY - 3.0, D / 2 - 1.6));
  // tetto a capanna
  const roof = new THREE.Shape();
  roof.moveTo(-D / 2, 0); roof.lineTo(D / 2, 0); roof.lineTo(0, 2.4); roof.lineTo(-D / 2, 0);
  const rg = new THREE.ExtrudeGeometry(roof, { depth: W, bevelEnabled: false });
  rg.rotateY(Math.PI / 2); rg.translate(-W / 2, H, 0);
  g.add(mesh(rg, mat(0xdce6f2, { roughness: 0.8 })));
  g.add(mesh(new THREE.BoxGeometry(W, 0.4, 1.0), white, 0, H + 2.5, 0));
  // striscia blu, occhi, denti di sopra
  g.add(mesh(new THREE.BoxGeometry(W + 0.04, 1.4, D + 0.04), mat(0x5b8fd6), 0, 0.75, 0));
  for (const x of [-1.4, 1.4]) {
    g.add(mesh(new THREE.CircleGeometry(0.8, 20), mat(0xffffff), x, 7.2, D / 2 + 0.02));
    g.add(mesh(new THREE.CircleGeometry(0.4, 16), mat(0x1d1c1f), x + 0.1, 7.1, D / 2 + 0.03));
  }
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Shape(); t.moveTo(-0.4, 0); t.lineTo(0.4, 0); t.lineTo(0, -0.6); t.lineTo(-0.4, 0);
    g.add(mesh(new THREE.ShapeGeometry(t), mat(0xffffff), -1.8 + i * 0.9, MILK.hubY, D / 2 + 0.03));
  }
  // la bocca: il cartone ritagliato, attaccato in alto (cerniera); il filo la tira su
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, MILK.hubY, D / 2 + 0.05);
  jaw.add(mesh(new THREE.BoxGeometry(4.6, 3.2, 0.15), white, 0, -1.6, 0));
  jaw.add(mesh(new THREE.BoxGeometry(4.4, 1.0, 0.16), mat(0x5b8fd6), 0, -2.6, 0));
  for (let i = 0; i < 5; i++) { const tooth = mesh(new THREE.ConeGeometry(0.28, 0.55, 4), mat(0xffffff), -1.8 + i * 0.9, -0.1, 0.05); jaw.add(tooth); }
  const knot = new THREE.Object3D();
  knot.name = 'jaw-knot';
  knot.position.set(1.7, -3.0, 0.1);
  jaw.add(knot);
  g.add(jaw);
  // il filo (si aggiorna quando il servo gira)
  const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xf2f2f2 }));
  string.name = 'string';
  string.visible = false;
  g.add(string);
  return { group: g };
}

/** Il servo sta sopra la testa, sul tetto (come nel Milky Monster: un filo tira la bocca). */
export function milkPose(type: string) {
  if (type !== 'servo') return null;
  return { pos: new THREE.Vector3(1.2, MILK.H + 2.7, 0), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)) };
}
/** Quanto è aperta la bocca (radianti) per un angolo del servo: 180 chiusa, 100 o meno tutta aperta. */
export function jawOpen(angle: number) { return Math.max(0, Math.min(1, (180 - angle) / 80)) * 1.15; }

function catapultBase(): Built {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(7, 3, 9), mat(0xd9a660, { roughness: 0.95 }), 0, 1.5, 0));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(7, 3, 9)), new THREE.LineBasicMaterial({ color: 0xa87b3f }));
  edges.position.y = 1.5;
  g.add(edges);
  // il fermo davanti: il braccio ci sbatte e la pallina parte
  g.add(mesh(new THREE.BoxGeometry(1.2, 2.2, 0.5), mat(0xc48f4c), -1.7, 4.1, -3.2));
  return { group: g };
}

/** Il servo sdraiato sulla scatola: a 0 il braccio guarda indietro, a 150 è quasi in avanti. */
export function catapultPose(type: string) {
  if (type !== 'servo') return null;
  return servoAt(new THREE.Vector3(-1.5, 3.95, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
}

function catapultArm(): Built {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(6.4, 0.25, 0.9), mat(0xe9c98e, { roughness: 0.9 }), 3.0, -0.1, 0));
  const cup = mesh(new THREE.CylinderGeometry(0.75, 0.6, 0.5, 18, 1, true), mat(0xe5484d, { side: THREE.DoubleSide }), 5.9, -0.4, 0);
  cup.rotation.z = Math.PI / 2;
  g.add(cup);
  g.add(mesh(new THREE.CircleGeometry(0.62, 18), mat(0xc63a3a), 5.65, -0.4, 0).rotateY(-Math.PI / 2));
  const ball = mesh(new THREE.IcosahedronGeometry(0.55, 1), mat(0xd4d8de, { metalness: 0.7, roughness: 0.35, flatShading: true }), 6.0, -0.95, 0);
  ball.name = 'ball';
  g.add(ball);
  return { group: g };
}

function bucket(): Built {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(2.5, 2.1, 2.6, 28, 1, true), mat(0x2f80d1, { side: THREE.DoubleSide, roughness: 0.6 }), 0, 1.3, 0));
  g.add(mesh(new THREE.CircleGeometry(2.1, 28), mat(0x1f5f9f), 0, 0.05, 0).rotateX(-Math.PI / 2));
  g.add(mesh(new THREE.TorusGeometry(2.5, 0.12, 8, 32), mat(0xffffff), 0, 2.6, 0).rotateX(Math.PI / 2));
  return { group: g };
}

/** Dove si mette un pezzo attaccato a un altro (corpo di Luna o fascia). */
export function hostPose(host: string, type: string) {
  return host === 'petBody' ? bodyPose(type) : host === 'strap' ? strapPose(type) : host === 'cardStand' ? standPose(type) : host === 'testPad' ? padPose() : host === 'milkCarton' ? milkPose(type) : host === 'catapultBase' ? catapultPose(type) : null;
}

const BUILDERS: Record<string, () => Built> = { microbit, battery, servo, led, resistor, cardboardBox, cardboardPanel, paperCup, straw, cardboardTube, foilBall, petBody, petFace, petTail, petLegs, foilPatch, usb: usbLaptop, strap, cardStand, testPad, coin, banana, eraser, plasticCap, buzzWire, apple, orange, lemon, milkCarton, catapultBase, catapultArm, bucket };

export function buildPart(type: string): Built {
  const b = BUILDERS[type]();
  b.group.traverse(o => { o.userData.partRoot = b.group; });
  return b;
}

/** Posizione e rotazione di un pezzo attaccato al corpo di Luna. */
export function bodyPose(type: string): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
  const { L, HF, TOP } = PET;
  const q = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  switch (type) {
    case 'servo': return petServoPose();
    case 'petFace': return { pos: new THREE.Vector3(0, 1.2, L / 2 + 0.04), quat: q(0, 0, 0) };
    case 'petLegs': return { pos: new THREE.Vector3(0, 0, 0).add(new THREE.Vector3(0, 0, 0)), quat: q(0, 0, 0) };
    case 'foilPatch': return { pos: new THREE.Vector3(0, HF + 0.01, L / 2 - TOP / 2), quat: q(0, 0, 0) };
    default: return null;
  }
}

/** Posizione e rotazione di un materiale quando è attaccato al braccio del servo. */
export function attachPose(type: string): { pos: [number, number, number]; rotZ: number; rotX?: number } {
  switch (type) {
    case 'petTail': return { pos: [1.4, 0.12, 0], rotZ: -0.6 };
    case 'straw': return { pos: [2.4, 0.1, 0], rotZ: -0.5 };
    case 'paperCup': return { pos: [0.6, 0.1, 0], rotZ: 0 };
    case 'cardboardPanel': return { pos: [1.3, 0.15, 0], rotZ: -Math.PI / 2 + 0.25 };
    case 'cardboardBox': return { pos: [0.6, 0.1, 0], rotZ: 0 };
    case 'cardboardTube': return { pos: [1.2, 0.1, 0], rotZ: 0 };
    case 'foilBall': return { pos: [2.5, 0.1, 0], rotZ: 0 };
    case 'catapultArm': return { pos: [0.1, 0.3, 0], rotZ: 0 };
    default: return { pos: [1, 0.1, 0], rotZ: 0 };
  }
}
