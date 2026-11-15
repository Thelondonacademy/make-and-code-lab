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

const BUILDERS: Record<string, () => Built> = { microbit, battery, servo, led, resistor, cardboardBox, cardboardPanel, paperCup, straw, cardboardTube, foilBall, petBody, petFace, petTail, petLegs, foilPatch, usb: usbLaptop };

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
    default: return { pos: [1, 0.1, 0], rotZ: 0 };
  }
}
