// La scena 3D: il banco di lavoro con i pezzi, i cavi a coccodrillo e i comandi.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTS } from '../data/parts';
import { wirePath, type Obstacle } from './wirepath';
import type { PartInst, Wire } from '../sim/circuit';
import { buildPart, attachPose, bodyPose, hostPose, petLeadEnds, jawOpen, Built, mat, COLORS } from './builders';
import { WIRE_COLORS, mountOf, mountsOf } from '../data/parts';

export type SceneMode = 'build' | 'wire' | 'code';

export interface SceneCallbacks {
  onMove(moves: { id: string; x: number; z: number }[], attachTo: string | null): void;
  onSelect(ids: string[], wire: string | null, additive: boolean): void;
  onTerminal(ref: string): void;
  onChoose(refs: string[], clientX: number, clientY: number): void;
  onWireEnd(wireId: string, end: 'a' | 'b', newRef: string | null): void;
  onContext(kind: 'part' | 'wire' | 'none', id: string | null, clientX: number, clientY: number): void;
  onButton(name: 'A' | 'B', down: boolean, mbId?: string): void;
  onLogo(down: boolean): void;
  onPad(pin: string, down: boolean): void;
  onFoil(partId: string, down: boolean): void;
  onFrame(dt: number): void;
  onDrop(type: string, x: number, z: number): void;
}

interface PartObj { inst: PartInst; built: Built; terminals: Map<string, THREE.Object3D> }

export const TABLE = { w: 84, d: 54 };
const HOME_CAM = new THREE.Vector3(0, 36, 32);

type Drag =
  | { kind: 'parts'; ids: string[]; start: Map<string, THREE.Vector3>; startPt: THREE.Vector3; sx: number; sy: number; moved: boolean; additive: boolean }
  | { kind: 'wireEnd'; wireId: string; end: 'a' | 'b'; fixed: THREE.Vector3; sx: number; sy: number; moved: boolean; color: string; term?: string };

export class Scene3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mode: SceneMode = 'build';
  running = false;
  private objs = new Map<string, PartObj>();
  private wireGroup = new THREE.Group();
  private wireMeshes = new Map<string, THREE.Object3D>();
  private markers = new THREE.Group();
  private highlights: THREE.Mesh[] = [];
  private selRings = new THREE.Group();
  private pendingRef: string | null = null;
  private selected = new Set<string>();
  private selWire: string | null = null;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private drag: Drag | null = null;
  private tempWire: THREE.Mesh | null = null;
  private down: { x: number; y: number } | null = null;
  private rightDown: { x: number; y: number } | null = null;
  private pressed: { kind: 'button' | 'logo' | 'pad' | 'foil'; name: string; mb?: string } | null = null;
  private clock = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private wires: Wire[] = [];
  hoverRef: string | null = null;
  onHover: (ref: string | null, x: number, y: number) => void = () => {};

  constructor(private host: HTMLElement, private cb: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Banco di lavoro in 3D');
    this.renderer.domElement.tabIndex = 0;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
    this.camera.position.copy(HOME_CAM);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 1);
    this.controls.enableDamping = true;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 140;
    this.controls.maxPolarAngle = 1.38;
    // A prova di bambino: un dito (o il tasto sinistro) sul banco vuoto sposta la vista, non la gira.
    // Per girarla servono due dita, il tasto destro o il pulsante tondo.
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.screenSpacePanning = false; // si scorre lungo il banco, non in aria
    this.controls.addEventListener('start', () => { this.fly = null; });
    this.controls.addEventListener('change', () => this.keepOnTable());

    this.scene.background = new THREE.Color(0xf5f0ea);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xe6ddd2, 1.6);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    this.sun = sun;
    sun.position.set(-20, 40, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -46; sc.right = 46; sc.top = 32; sc.bottom = -32;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    this.scene.add(this.makeTable());
    this.scene.add(this.wireGroup, this.markers, this.selRings);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('contextmenu', this.onContextMenu);
    el.addEventListener('dragover', e => { e.preventDefault(); });
    el.addEventListener('drop', this.onDropEvt);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.loop();
  }

  private makeTable() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d')!;
    x.fillStyle = '#FBF8F4';
    x.fillRect(0, 0, 512, 512);
    x.strokeStyle = '#E6DDD2';
    x.lineWidth = 3;
    for (let i = 0; i <= 512; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(TABLE.w / 4, TABLE.d / 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const side = mat(0xd9c7b3);
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 1, TABLE.d), [side, side, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), side, side, side]);
    top.position.y = -0.5;
    top.receiveShadow = true;
    top.name = 'table';
    return top;
  }

  resize() {
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    // tempo vero: anche se il computer è lento il servo gira alla velocità giusta
    this.clock.update();
    const dt = Math.min(0.25, this.clock.getDelta());
    this.cb.onFrame(dt);
    const t = performance.now() / 1000;
    for (const h of this.highlights) { const s = 1 + 0.25 * Math.sin(t * 6); h.scale.set(s, s, s); }
    if (this.flying) {
      const f = this.flying, hop = f.hops[0], k = Math.min(1, (performance.now() - f.t0) / hop.dur);
      f.m.position.lerpVectors(hop.from, hop.to, k);
      f.m.position.y = hop.from.y + (hop.to.y - hop.from.y) * k + hop.h * 4 * k * (1 - k);
      f.m.rotation.x -= 0.25;
      if (k >= 1) { f.hops.shift(); f.t0 = performance.now(); if (!f.hops.length) { this.landed = f.m; this.flying = null; } }
    }
    for (const [id, t0] of this.bumps) {
      const o = this.objs.get(id);
      const k = (performance.now() - t0) / 350;
      if (!o || k >= 1) { this.bumps.delete(id); if (o) o.built.group.position.y = o.inst.attachedTo ? o.built.group.position.y : (o.inst.y ?? 0); continue; }
      o.built.group.position.y = (o.inst.y ?? 0) + Math.sin(k * Math.PI) * 1.6;
    }
    if (this.fly) {
      const f = this.fly, k = Math.min(1, (performance.now() - f.t0) / f.dur), e = k * k * (3 - 2 * k);
      this.controls.target.lerpVectors(f.t1, f.t2, e);
      this.camera.position.lerpVectors(f.p1, f.p2, e);
      if (k >= 1) this.fly = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- stato ----------

  setMode(m: SceneMode) {
    this.mode = m;
    this.pendingRef = null;
    this.updateMarkers();
  }

  setRunning(r: boolean) {
    this.running = r;
    if (r) this.setSelection([], null);
    this.updateMarkers();
  }

  setState(parts: PartInst[], wires: Wire[]) {
    const ids = new Set(parts.map(p => p.id));
    for (const [id, o] of this.objs) if (!ids.has(id)) { o.built.group.removeFromParent(); this.objs.delete(id); }
    // prima chi sta sul banco, poi chi è attaccato (anche a catena: servo nel corpo, coda sul servo)
    const byId = new Map(parts.map(p => [p.id, p]));
    const depth = (p: PartInst, n = 0): number => (p.attachedTo && byId.has(p.attachedTo) && n < 5 ? 1 + depth(byId.get(p.attachedTo)!, n + 1) : 0);
    const sorted = [...parts].sort((a, b) => depth(a) - depth(b));
    for (const p of sorted) {
      let o = this.objs.get(p.id);
      if (!o) {
        const built = buildPart(p.type);
        built.group.userData.partId = p.id;
        built.group.traverse(c => { c.userData.partId = p.id; });
        const terminals = new Map<string, THREE.Object3D>();
        for (const t of PARTS[p.type].terminals) {
          const anchor = new THREE.Object3D();
          anchor.position.set(...t.pos);
          built.group.add(anchor);
          terminals.set(t.id, anchor);
        }
        o = { inst: p, built, terminals };
        this.objs.set(p.id, o);
      }
      o.inst = p;
    }
    // prima i pezzi sul banco, poi quelli attaccati (così il servo è già al suo posto)
    for (const p of sorted) this.placeObj(this.objs.get(p.id)!);
    for (const o of this.objs.values()) if (o.inst.type === 'milkCarton') this.updateMilk(o);
    this.wires = wires;
    for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);
    if (this.selWire && !wires.some(w => w.id === this.selWire)) this.selWire = null;
    this.rebuildWires();
    this.updateMarkers();
    this.updateSelRings();
  }

  /** La scatola di un pezzo senza i materiali attaccati al suo braccio. */
  private ownBox(g: THREE.Object3D) {
    const box = new THREE.Box3();
    g.updateWorldMatrix(true, true);
    g.traverse(o => {
      if ((o as THREE.Mesh).isMesh && o.userData.partRoot === g) box.expandByObject(o, false);
    });
    return box;
  }

  private placeObj(o: PartObj) {
    const p = o.inst;
    const g = o.built.group;
    const hostObj = p.attachedTo ? this.objs.get(p.attachedTo) : null;
    const inner = g.getObjectByName('straw-inner');
    const bp = hostObj ? hostPose(hostObj.inst.type, p.type) : null;
    const horn = hostObj?.inst.type === 'servo' ? hostObj.built.horn : null;
    const inBody = !!bp && hostObj?.inst.type === 'petBody';
    if (p.type === 'servo') this.relead(o, bp && hostObj?.inst.type === 'petBody' ? 'petBody' : null);
    if (p.type === 'milkString') { g.getObjectByName('coil')!.visible = !horn; g.getObjectByName('knot')!.visible = !!horn; }
    o.built.setMounted?.(inBody);
    if (bp && hostObj) {
      if (g.parent !== hostObj.built.group) hostObj.built.group.add(g);
      g.position.copy(bp.pos);
      g.quaternion.copy(bp.quat);
    } else if (horn) {
      if (g.parent !== horn) horn.add(g);
      const pose = attachPose(p.type);
      g.position.set(...pose.pos);
      g.rotation.set(pose.rotX || 0, pose.rotY || 0, pose.rotZ);
      if (inner) { inner.rotation.set(0, 0, 0); inner.position.set(0, 0, 0); }
    } else {
      if (g.parent !== this.scene) this.scene.add(g);
      if (inner) { inner.rotation.set(0, 0, Math.PI / 2); inner.position.set(6.5, 0.35, 0); }
      // rot: giri da 45° attorno all'asse verticale; tilt: pezzo sdraiato su un fianco
      const flat = p.type === 'petFace' || p.type === 'petTail'; // figurine di carta: sul banco stanno sdraiate
      g.rotation.set(p.tilt || flat ? -Math.PI / 2 : 0, ((p.rot || 0) * Math.PI) / 4, 0, 'YXZ');
      g.position.set(p.x, 0, p.z);
      if (flat) { const b = this.ownBox(g); g.position.y = -b.min.y + 0.02; }
      if (p.tilt) {
        const b = this.ownBox(g);
        g.position.y = -b.min.y;
      } else g.position.y = p.y ?? 0;
    }
  }

  /** Il servo dentro Luna: i 3 fili escono dal buco dietro il corpo. */
  private relead(o: PartObj, host: string | null) {
    const set = o.built.setLeads;
    if (!set) return;
    if (!host) {
      set(null);
      for (const t of PARTS.servo.terminals) o.terminals.get(t.id)!.position.set(...t.pos);
      return;
    }
    const bp = hostPose(host, 'servo')!;
    const inv = new THREE.Matrix4().compose(bp.pos, bp.quat, new THREE.Vector3(1, 1, 1)).invert();
    const ends = petLeadEnds().map(v => v.applyMatrix4(inv));
    set(ends);
    PARTS.servo.terminals.forEach((t, i) => o.terminals.get(t.id)!.position.copy(ends[i]));
  }

  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  /** Notte nella stanza: le luci si abbassano e le lucine del micro:bit si vedono meglio. */
  /** La luce della stanza: 0 buio, 1 lampada (normale), 2 sole pieno. */
  setRoomLight(level: number) {
    this.hemi.intensity = [0.22, 1.6, 2.0][level] ?? 1.6;
    this.sun.intensity = [0.12, 1.8, 2.7][level] ?? 1.8;
    (this.scene.background as THREE.Color).set([0x2a2d45, 0xf5f0ea, 0xfff4d6][level] ?? 0xf5f0ea);
  }

  /** Catapulta: dov'è la pallina nel cucchiaio (in coordinate del banco). */
  ballWorld(baseId: string) {
    const b = this.objs.get(baseId)?.built.group.getObjectByName('ball');
    return b ? b.getWorldPosition(new THREE.Vector3()) : null;
  }
  /** Catapulta: angolo del braccio (0 = carico, 100 = scattato) e pallina nel cucchiaio. */
  setCatapult(baseId: string, deg: number, ball: boolean, bands = 2) { this.objs.get(baseId)?.built.setCatapult?.(deg, ball, bands); }
  /** Il biscotto davanti all'occhio del mostro. */
  setCookie(on: boolean) { for (const o of this.objs.values()) if (o.inst.type === 'milkCarton') { const c = o.built.group.getObjectByName('cookie'); if (c) c.visible = on; } }
  // la pallina in volo: una serie di salti (il lancio, poi i rimbalzi sempre più bassi)
  private flying: { m: THREE.Mesh; hops: { from: THREE.Vector3; to: THREE.Vector3; dur: number; h: number }[]; t0: number } | null = null;
  private landed: THREE.Mesh | null = null;
  /** Lancia la pallina. `inside`: cade dentro il bersaglio e ci resta; altrimenti tocca il banco e rimbalza due volte. */
  throwBall(from: THREE.Vector3, to: THREE.Vector3, inside = false, wall?: { x: number; z: number; r: number }) {
    this.landed?.removeFromParent();
    this.flying?.m.removeFromParent();
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), mat(0xf4f1ea, { roughness: 0.95, flatShading: true }));
    m.castShadow = true;
    m.position.copy(from);
    this.scene.add(m);
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const hops = [{ from: from.clone(), to: to.clone(), dur: 450 + d * 30, h: 3 + d * 0.35 }];
    if (!inside && d > 0.01) {
      const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
      let at = to.clone();
      for (const [len, h] of [[d * 0.22, 2.2], [d * 0.09, 0.8]]) {
        const next = at.clone().addScaledVector(dir, len);
        next.x = clamp(next.x, -TABLE.w / 2 + 1, TABLE.w / 2 - 1); next.z = clamp(next.z, -TABLE.d / 2 + 1, TABLE.d / 2 - 1);
        // il bersaglio è un muro: la pallina che rimbalza ci si ferma contro, non ci passa attraverso
        let stop = false;
        if (wall) for (let k = 0; k <= 1.0001; k += 0.1) {
          const px = at.x + (next.x - at.x) * k, pz = at.z + (next.z - at.z) * k;
          if (Math.hypot(px - wall.x, pz - wall.z) < wall.r + 0.6) { const kk = Math.max(0, k - 0.1); next.set(at.x + (next.x - at.x) * kk, next.y, at.z + (next.z - at.z) * kk); stop = true; break; }
        }
        hops.push({ from: at, to: next, dur: 240 + len * 40, h: stop ? h * 0.5 : h });
        at = next;
        if (stop) break;
      }
    }
    this.flying = { m, hops, t0: performance.now() };
  }
  clearBalls() { this.landed?.removeFromParent(); this.landed = null; this.flying?.m.removeFromParent(); this.flying = null; }

  private bumps = new Map<string, number>();
  /** Un passo: il pezzo fa un saltello (la gamba che cammina). */
  bump(id: string) {
    const o = this.objs.get(id);
    if (o && !o.inst.attachedTo) this.bumps.set(id, performance.now());
  }

  private angles = new Map<string, number>();
  setServo(id: string, angle: number) {
    const o = this.objs.get(id);
    const horn = o?.built.horn;
    this.angles.set(id, angle);
    if (horn) horn.rotation.y = ((angle - 90) * Math.PI) / 180;
    const host = o?.inst.attachedTo ? this.objs.get(o.inst.attachedTo) : null;
    if (host?.inst.type === 'milkCarton') this.updateMilk(host);
  }

  /** Mostro del latte: se lo spago è legato al servo sul tetto, il servo tira su la bocca. */
  private updateMilk(carton: PartObj) {
    const hg = carton.built.group;
    const jaw = hg.getObjectByName('jaw');
    const string = hg.getObjectByName('string') as THREE.Line | undefined;
    if (!jaw || !string) return;
    const sv = [...this.objs.values()].find(x => x.inst.type === 'servo' && x.inst.attachedTo === carton.inst.id);
    const st = sv && [...this.objs.values()].find(x => x.inst.type === 'milkString' && x.inst.attachedTo === sv.inst.id);
    if (!sv?.built.horn || !st) { jaw.rotation.x = 0; string.visible = false; return; }
    const angle = this.angles.get(sv.inst.id) ?? 90;
    jaw.rotation.x = -jawOpen(angle, st.inst.rest ?? 90);
    hg.updateWorldMatrix(true, true);
    const tip = sv.built.horn.localToWorld(new THREE.Vector3(2.5, 0, 0));
    const knot = jaw.getObjectByName('jaw-knot')!.getWorldPosition(new THREE.Vector3());
    const inv = hg.matrixWorld.clone().invert();
    (string.geometry as THREE.BufferGeometry).setFromPoints([tip.applyMatrix4(inv), knot.applyMatrix4(inv)]);
    string.visible = true;
  }

  setDisplay(id: string, leds: Uint8Array) {
    const l = this.objs.get(id)?.built.leds;
    if (!l) return;
    for (let i = 0; i < 25; i++) {
      const m = l[i].material as THREE.MeshStandardMaterial;
      const v = leds[i] / 255;
      m.color.setHex(v > 0 ? COLORS.ledOn : COLORS.ledOff);
      m.emissive.setHex(v > 0 ? COLORS.ledOn : 0x000000);
      m.emissiveIntensity = 1.6 * v;
    }
  }

  setLed(id: string, level: number) {
    const b = this.objs.get(id)?.built;
    if (!b?.ledBulb || !b.ledLight) return;
    const m = b.ledBulb.material as THREE.MeshStandardMaterial;
    m.emissive.setHex(level > 0 ? 0xff2a1a : 0x000000);
    m.emissiveIntensity = 2.2 * level;
    b.ledLight.intensity = 30 * level;
  }

  setButtonPressed(mb: string, name: string, down: boolean) {
    const btn = this.objs.get(mb)?.built.buttons?.[name];
    if (btn) btn.position.y = down ? 0.3 : 0.54;
  }

  highlight(refs: string[]) {
    for (const h of this.highlights) h.removeFromParent();
    this.highlights = [];
    for (const r of refs) {
      const p = this.termWorld(r);
      if (!p) continue;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: COLORS.orange }));
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(p).add(new THREE.Vector3(0, 0.25, 0));
      this.scene.add(ring);
      this.highlights.push(ring);
    }
  }

  /** Cambia la selezione (pezzi oppure un cavo) e avvisa il laboratorio. */
  setSelection(ids: string[], wire: string | null, notify = true, additive = false) {
    const changedWire = wire !== this.selWire;
    this.selected = new Set(ids);
    this.selWire = wire;
    if (changedWire) this.rebuildWires();
    this.updateSelRings();
    if (notify) this.cb.onSelect([...this.selected], this.selWire, additive);
  }

  getSelection() { return { ids: [...this.selected], wire: this.selWire }; }

  private updateSelRings() {
    this.selRings.clear();
    for (const id of this.selected) {
      const o = this.objs.get(id);
      if (!o || o.inst.attachedTo) continue;
      const b = this.ownBox(o.built.group);
      const size = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.z) / 2 + 0.6;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.3, 64), new THREE.MeshBasicMaterial({ color: COLORS.orange, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(c.x, 0.03, c.z);
      this.selRings.add(ring);
    }
  }

  /** Posizione sullo schermo (px, dentro il riquadro) sopra il primo pezzo o il cavo selezionato. */
  selectionAnchor(): { x: number; y: number; below?: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    let v: THREE.Vector3 | null = null;
    if (this.selWire) {
      const w = this.wires.find(w => w.id === this.selWire);
      const a = w && this.termWorld(w.a), b = w && this.termWorld(w.b);
      if (a && b) v = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, Math.min(6, 1.2 + a.distanceTo(b) * 0.18) * 0.75 + 1, 0));
    } else if (this.selected.size) {
      const box = new THREE.Box3();
      for (const id of this.selected) { const o = this.objs.get(id); if (o) box.union(this.ownBox(o.built.group)); }
      if (!box.isEmpty()) v = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 1, (box.min.z + box.max.z) / 2);
    }
    if (!v) return null;
    let low: THREE.Vector3 | null = null;
    if (!this.selWire) {
      const box = new THREE.Box3();
      for (const id of this.selected) { const o = this.objs.get(id); if (o) box.union(this.ownBox(o.built.group)); }
      low = new THREE.Vector3((box.min.x + box.max.x) / 2, Math.max(0, box.min.y), box.max.z).project(this.camera);
    }
    v.project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, below: low ? ((1 - low.y) / 2) * r.height : undefined };
  }

  termWorld(ref: string): THREE.Vector3 | null {
    const [pid, tid] = ref.split(':');
    const a = this.objs.get(pid)?.terminals.get(tid);
    if (!a) return null;
    a.updateWorldMatrix(true, false);
    return a.getWorldPosition(new THREE.Vector3());
  }

  setPending(ref: string | null) {
    this.pendingRef = ref;
    this.updateMarkers();
  }

  // ---------- fili ----------

  /** Gli ingombri dei pezzi sul banco: i cavi ci passano sopra, non attraverso. */
  private obstacles: (Obstacle & { id: string })[] = [];
  private scanObstacles() {
    this.obstacles = [];
    for (const o of this.objs.values()) {
      if (o.inst.attachedTo) continue;
      const box = new THREE.Box3().setFromObject(o.built.group);
      if (box.isEmpty() || box.max.y < 0.5) continue;
      this.obstacles.push({ id: o.inst.id, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, top: box.max.y });
    }
  }
  /** Il pezzo sul banco a cui appartiene un morsetto (risalendo: braccio → servo → cartone). */
  private rootOf(ref: string) {
    let o = this.objs.get(ref.split(':')[0]);
    while (o?.inst.attachedTo && this.objs.get(o.inst.attachedTo)) o = this.objs.get(o.inst.attachedTo);
    return o?.inst.id;
  }
  private wireCurve(a: THREE.Vector3, b: THREE.Vector3, refs?: [string, string | null], seed = 0) {
    const skip = new Set(refs ? [this.rootOf(refs[0]), refs[1] ? this.rootOf(refs[1]) : undefined] : []);
    const obs = refs ? this.obstacles.filter(o => !skip.has(o.id)) : [];
    const pts = wirePath([a.x, a.y, a.z], [b.x, b.y, b.z], obs, seed).map(p => new THREE.Vector3(p[0], p[1], p[2]));
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }
  private wireSeed(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

  private rebuildWires() {
    for (const m of this.wireMeshes.values()) m.removeFromParent();
    this.wireMeshes.clear();
    this.scanObstacles();
    for (const w of this.wires) {
      if (this.drag?.kind === 'wireEnd' && this.drag.wireId === w.id && this.drag.moved) continue;
      const a = this.termWorld(w.a), b = this.termWorld(w.b);
      if (!a || !b) continue;
      const g = new THREE.Group();
      g.userData.wireId = w.id;
      const sel = w.id === this.selWire;
      const isUsb = w.a.endsWith(':USBPLUG') || w.b.endsWith(':USBPLUG');
      const isPower = isUsb || w.a.endsWith(':PLUG') || w.b.endsWith(':PLUG');
      const curve = this.wireCurve(a, b, [w.a, w.b], this.wireSeed(w.id));
      if (isUsb) {
        const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, sel ? 0.2 : 0.14, 6), sel ? this.selMat(0x55585f) : mat(0x55585f));
        t.castShadow = true;
        t.userData.wireId = w.id;
        g.add(t);
        const plug = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.7), mat(0xc0c4cc, { metalness: 0.6 }));
        plug.position.copy(w.a.endsWith(':USB') ? a : b).add(new THREE.Vector3(0, 0.45, 0));
        plug.userData.wireId = w.id;
        g.add(plug);
      } else if (isPower) {
        for (const [off, col] of [[0.14, 0xe5484d], [-0.14, 0x1d1c1f]] as const) {
          const pts = curve.getPoints(24).map(p => p.clone().add(new THREE.Vector3(off, 0, off)));
          const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, sel ? 0.16 : 0.1, 6), sel ? this.selMat(col) : mat(col));
          t.castShadow = true;
          t.userData.wireId = w.id;
          g.add(t);
        }
        const plug = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.6), mat(0xf2efea));
        plug.position.copy(w.a.endsWith(':BAT') ? a : b).add(new THREE.Vector3(0, 0.55, 0));
        plug.userData.wireId = w.id;
        g.add(plug);
      } else {
        const hex = new THREE.Color(WIRE_COLORS.find(c => c.id === w.color)?.hex || '#E5484D').getHex();
        const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, sel ? 0.24 : 0.16, 8), sel ? this.selMat(hex) : mat(hex, { roughness: 0.5 }));
        t.castShadow = true;
        t.userData.wireId = w.id;
        g.add(t);
        g.add(this.clip(a, hex, w.id, 'a'), this.clip(b, hex, w.id, 'b'));
      }
      this.wireGroup.add(g);
      this.wireMeshes.set(w.id, g);
    }
  }

  private selMat(color: number) {
    return new THREE.MeshStandardMaterial({ color, emissive: COLORS.orange, emissiveIntensity: 0.55, roughness: 0.4 });
  }

  /** Pinza a coccodrillo: corpo colorato + becco di metallo. Si può prendere e spostare. */
  private clip(at: THREE.Vector3, hex: number, wireId: string, end: 'a' | 'b') {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.1, 10), mat(hex, { roughness: 0.45 }));
    body.position.y = 1.0;
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 8), mat(COLORS.metal, { metalness: 0.8, roughness: 0.3 }));
    jaw.rotation.x = Math.PI;
    jaw.position.y = 0.3;
    g.add(body, jaw);
    g.position.copy(at);
    g.traverse(o => { o.userData.wireId = wireId; o.userData.wireEnd = end; (o as THREE.Mesh).castShadow = true; });
    return g;
  }

  private showTempWire(from: THREE.Vector3, to: THREE.Vector3, color: string) {
    this.tempWire?.removeFromParent();
    const hex = new THREE.Color(WIRE_COLORS.find(c => c.id === color)?.hex || '#E5484D').getHex();
    this.tempWire = new THREE.Mesh(new THREE.TubeGeometry(this.wireCurve(from, to), 40, 0.2, 8), new THREE.MeshStandardMaterial({ color: hex, transparent: true, opacity: 0.8 }));
    this.scene.add(this.tempWire);
  }

  // ---------- segnaposto dei morsetti (modalità Collega) ----------

  private updateMarkers() {
    this.markers.clear();
    const dragging = this.drag?.kind === 'wireEnd' && this.drag.moved;
    if ((this.mode !== 'wire' && !dragging) || this.running) return;
    for (const o of this.objs.values()) {
      for (const t of PARTS[o.inst.type].terminals) {
        const ref = `${o.inst.id}:${t.id}`;
        const p = this.termWorld(ref);
        if (!p) continue;
        const pending = ref === this.pendingRef;
        const used = this.wires.some(w => w.a === ref || w.b === ref);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(pending ? 0.7 : 0.55, pending ? 0.16 : 0.1, 8, 32),
          new THREE.MeshBasicMaterial({ color: pending ? COLORS.orange : used ? 0x2e8b57 : COLORS.purple, transparent: true, opacity: 0.9 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(p).add(new THREE.Vector3(0, 0.2, 0));
        this.markers.add(ring);
      }
    }
  }

  // ---------- puntatore ----------

  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hit(e: { clientX: number; clientY: number }, objects: THREE.Object3D[]) {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    return this.ray.intersectObjects(objects, true);
  }

  private onTable(e: { clientX: number; clientY: number }) {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, p) ? p : null;
  }

  /** Il morsetto più vicino al puntatore (sullo schermo), per non dover essere precisi. */
  nearestTerminal(clientX: number, clientY: number, maxPx = 30, exclude?: string): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    let best: string | null = null, bestD = maxPx;
    for (const o of this.objs.values()) for (const t of PARTS[o.inst.type].terminals) {
      const ref = `${o.inst.id}:${t.id}`;
      if (ref === exclude) continue;
      const p = this.termWorld(ref);
      if (!p) continue;
      p.project(this.camera);
      const sx = r.left + ((p.x + 1) / 2) * r.width, sy = r.top + ((1 - p.y) / 2) * r.height;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestD) { bestD = d; best = ref; }
    }
    return best;
  }

  /** Tutti i morsetti vicini al dito, dal più vicino: se sono più di uno e alla pari, chiediamo al bambino quale voleva. */
  nearTerminals(clientX: number, clientY: number, maxPx: number): { ref: string; d: number }[] {
    const r = this.renderer.domElement.getBoundingClientRect();
    const out: { ref: string; d: number }[] = [];
    for (const o of this.objs.values()) for (const t of PARTS[o.inst.type].terminals) {
      const ref = `${o.inst.id}:${t.id}`;
      const p = this.termWorld(ref);
      if (!p) continue;
      p.project(this.camera);
      const d = Math.hypot(r.left + ((p.x + 1) / 2) * r.width - clientX, r.top + ((1 - p.y) / 2) * r.height - clientY);
      if (d < maxPx) out.push({ ref, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /** Dove si vede sullo schermo un punto del banco. */
  tableClient(x: number, z: number) { return this.toClient(new THREE.Vector3(x, 0, z)); }

  private toClient(v: THREE.Vector3) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = v.clone().project(this.camera);
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  terminalClient(ref: string) { const p = this.termWorld(ref); return p ? this.toClient(p) : null; }

  partClient(id: string) {
    const o = this.objs.get(id);
    return o ? this.toClient(this.ownBox(o.built.group).getCenter(new THREE.Vector3())) : null;
  }

  /** Un punto dentro un pezzo, anche se attaccato a un altro (per i test e la guida). */
  objectClient(id: string) {
    const o = this.objs.get(id);
    if (!o) return null;
    const b = new THREE.Box3();
    o.built.group.updateWorldMatrix(true, true);
    o.built.group.traverse(c => { if ((c as THREE.Mesh).isMesh && c.userData.partRoot === o.built.group) b.expandByObject(c, false); });
    return this.toClient(b.getCenter(new THREE.Vector3()));
  }

  hornTipClient(id: string) {
    const horn = this.objs.get(id)?.built.horn;
    if (!horn) return null;
    return this.toClient(horn.localToWorld(new THREE.Vector3(2.4, 0, 0)));
  }

  buttonClient(mb: string, name: string) {
    const b = this.objs.get(mb)?.built.buttons?.[name];
    return b ? this.toClient(b.getWorldPosition(new THREE.Vector3())) : null;
  }

  wireClient(id: string) {
    const w = this.wires.find(x => x.id === id);
    const a = w && this.termWorld(w.a), b = w && this.termWorld(w.b);
    if (!a || !b) return null;
    return this.toClient(this.wireCurve(a, b, [w.a, w.b], this.wireSeed(w.id)).getPoint(0.5));
  }

  clipClient(id: string, end: 'a' | 'b') {
    const w = this.wires.find(x => x.id === id);
    const p = w && this.termWorld(end === 'a' ? w.a : w.b);
    return p ? this.toClient(p.clone().add(new THREE.Vector3(0, 1.0, 0))) : null;
  }

  private partObjects() { return [...this.objs.values()].map(o => o.built.group); }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) { this.rightDown = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    this.down = { x: e.clientX, y: e.clientY };
    const hits = this.hit(e, this.partObjects());
    if (this.running) {
      const h = hits[0]?.object;
      if (h?.userData.button) { this.pressed = { kind: 'button', name: h.userData.button, mb: h.userData.partId }; this.cb.onButton(h.userData.button, true, h.userData.partId); this.controls.enabled = false; return; }
      if (h?.userData.logo) { this.pressed = { kind: 'logo', name: 'logo' }; this.cb.onLogo(true); this.controls.enabled = false; return; }
      if (h?.userData.pad && ['P0', 'P1', 'P2'].includes(h.userData.pad)) { this.pressed = { kind: 'pad', name: h.userData.pad }; this.cb.onPad(h.userData.pad, true); this.controls.enabled = false; return; }
      const fid = h?.userData.partId as string | undefined;
      const ftype = fid ? this.objs.get(fid)?.inst.type : undefined;
      const fruitKey = !!fid && ['banana', 'apple', 'lemon'].includes(ftype!) && this.wires.some(w => w.a === `${fid}:F` || w.b === `${fid}:F`);
      if (fid && (ftype === 'foilPatch' || fruitKey)) { this.pressed = { kind: 'foil', name: fid }; this.cb.onFoil(fid, true); this.controls.enabled = false; return; }
      // gli oggetti da provare si spostano anche con la prova accesa (tester dei conduttori)
      if (fid && this.mode === 'build' && mountsOf(this.objs.get(fid)!.inst.type).includes('testPad')) {
        const p = this.onTable(e);
        if (!p) return;
        const start = new Map([[fid, this.objs.get(fid)!.built.group.getWorldPosition(new THREE.Vector3())]]);
        this.drag = { kind: 'parts', ids: [fid], start, startPt: p, sx: e.clientX, sy: e.clientY, moved: false, additive: false };
        this.controls.enabled = false;
        this.renderer.domElement.setPointerCapture(e.pointerId);
      }
      return;
    }
    // in Collega conta il cerchietto più vicino: toccarlo inizia un cavo, trascinarlo sposta la pinza che c'è sopra
    const tubeHit = this.hit(e, [this.wireGroup])[0];
    const coarse = e.pointerType === 'touch' || e.pointerType === 'pen';
    // un cavo che passa sopra un cerchietto non deve "rubare" il tocco: vicino a un cerchietto vince il cerchietto
    const onTube = !!tubeHit && !tubeHit.object.userData.wireEnd && !this.nearTerminals(e.clientX, e.clientY, coarse ? 26 : 12).length;
    if (this.mode === 'wire' && !onTube) {
      if (coarse) {
        // con il dito non si è precisi: se due o tre cerchietti sono quasi alla stessa distanza, si sceglie da un fumetto con i pulsanti grandi
        const near = this.nearTerminals(e.clientX, e.clientY, 44);
        const tie = near.filter(n => n.d - near[0].d < 10 && n.d < 40).slice(0, 3);
        if (tie.length > 1) { this.controls.enabled = false; this.cb.onChoose(tie.map(n => n.ref), e.clientX, e.clientY); return; }
      }
      const ref = this.nearestTerminal(e.clientX, e.clientY, coarse ? 40 : 30);
      if (ref) {
        this.controls.enabled = false;
        const w = [...this.wires].reverse().find(x => x.a === ref || x.b === ref);
        if (!w) { this.cb.onTerminal(ref); return; }
        const end: 'a' | 'b' = w.a === ref ? 'a' : 'b';
        const power = /:(USB)?PLUG$/.test(w.a) || /:(USB)?PLUG$/.test(w.b);
        this.drag = { kind: 'wireEnd', wireId: w.id, end, fixed: this.termWorld(end === 'a' ? w.b : w.a)!, sx: e.clientX, sy: e.clientY, moved: false, color: power ? 'bianco' : w.color, term: ref };
        this.renderer.domElement.setPointerCapture(e.pointerId);
        return;
      }
    }
    // un cavo o una pinza a coccodrillo: si seleziona, oppure si trascina su un altro punto
    const wireHit = this.hit(e, [this.wireGroup])[0];
    const partDist = hits[0]?.distance ?? Infinity;
    if (wireHit && wireHit.distance <= partDist + 0.01 && this.mode !== 'code') {
      const id = wireHit.object.userData.wireId as string;
      const w = this.wires.find(x => x.id === id);
      if (w) {
        let end: 'a' | 'b' | undefined = wireHit.object.userData.wireEnd;
        if (!end) {
          const a = this.termWorld(w.a)!, b = this.termWorld(w.b)!;
          end = wireHit.point.distanceTo(a) < wireHit.point.distanceTo(b) ? 'a' : 'b';
        }
        const isPower = /:(USB)?PLUG$/.test(w.a) || /:(USB)?PLUG$/.test(w.b);
        const fixed = this.termWorld(end === 'a' ? w.b : w.a)!;
        this.drag = { kind: 'wireEnd', wireId: id, end, fixed, sx: e.clientX, sy: e.clientY, moved: false, color: isPower ? 'bianco' : w.color };
        this.controls.enabled = false;
        this.renderer.domElement.setPointerCapture(e.pointerId);
        return;
      }
    }
    if ((this.mode === 'build' || this.mode === 'wire') && hits.length) {
      const id = hits[0].object.userData.partId as string;
      if (!this.objs.has(id)) return;
      const p = this.onTable(e);
      if (!p) return;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      const ids = this.selected.has(id) && !additive ? [...this.selected] : [id];
      const start = new Map<string, THREE.Vector3>();
      for (const i of ids) { const o = this.objs.get(i); if (o) start.set(i, o.built.group.getWorldPosition(new THREE.Vector3())); }
      this.drag = { kind: 'parts', ids: [...start.keys()], start, startPt: p, sx: e.clientX, sy: e.clientY, moved: false, additive };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (d?.kind === 'parts') {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
      if (this.mode !== 'build') return; // in Collega i pezzi non si spostano per sbaglio
      if (!d.moved) {
        d.moved = true;
        for (const id of d.ids) {
          const o = this.objs.get(id)!;
          if (o.inst.attachedTo) {
            this.scene.add(o.built.group);
            o.built.group.rotation.set(0, 0, 0);
            const inner = o.built.group.getObjectByName('straw-inner');
            if (inner) { inner.rotation.set(0, 0, Math.PI / 2); inner.position.set(6.5, 0.35, 0); }
          }
        }
        this.selRings.clear();
      }
      const p = this.onTable(e);
      if (!p) return;
      const dx = p.x - d.startPt.x, dz = p.z - d.startPt.z;
      for (const id of d.ids) {
        const o = this.objs.get(id)!;
        const s = d.start.get(id)!;
        o.built.group.position.set(clamp(s.x + dx, -TABLE.w / 2 + 2, TABLE.w / 2 - 2), o.built.group.position.y, clamp(s.z + dz, -TABLE.d / 2 + 2, TABLE.d / 2 - 2));
      }
      this.rebuildWires();
      return;
    }
    if (d?.kind === 'wireEnd') {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
      if (!d.moved) { d.moved = true; this.rebuildWires(); this.updateMarkers(); }
      const near = this.nearestTerminal(e.clientX, e.clientY, 30);
      const to = (near && this.termWorld(near)) || this.onTable(e);
      if (to) this.showTempWire(d.fixed, to, d.color);
      const r = this.renderer.domElement.getBoundingClientRect();
      this.onHover(near, e.clientX - r.left, e.clientY - r.top);
      return;
    }
    if (this.mode === 'wire' && !this.running) {
      const ref = this.nearestTerminal(e.clientX, e.clientY);
      if (ref !== this.hoverRef) { this.hoverRef = ref; this.renderer.domElement.style.cursor = ref ? 'pointer' : ''; }
      const r = this.renderer.domElement.getBoundingClientRect();
      this.onHover(ref, e.clientX - r.left, e.clientY - r.top);
    } else if (this.hoverRef) {
      this.hoverRef = null;
      this.onHover(null, 0, 0);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.controls.enabled = true;
    if (e.button !== 0) return;
    const down = this.down;
    this.down = null;
    if (this.pressed) {
      const p = this.pressed;
      this.pressed = null;
      if (p.kind === 'button') this.cb.onButton(p.name as 'A' | 'B', false, p.mb);
      if (p.kind === 'logo') this.cb.onLogo(false);
      if (p.kind === 'pad') this.cb.onPad(p.name, false);
      if (p.kind === 'foil') this.cb.onFoil(p.name, false);
      return;
    }
    const d = this.drag;
    if (d?.kind === 'wireEnd') {
      this.drag = null;
      this.tempWire?.removeFromParent();
      this.tempWire = null;
      this.onHover(null, 0, 0);
      if (!d.moved) {
        // in Collega, toccare un cerchietto con una pinza vuol dire "parti da qui" (più cavi sullo stesso punto)
        if (d.term) { this.cb.onTerminal(d.term); return; }
        this.setSelection([], d.wireId); this.rebuildWires(); this.updateMarkers(); return;
      }
      const near = this.nearestTerminal(e.clientX, e.clientY, 30);
      this.rebuildWires();
      this.updateMarkers();
      this.cb.onWireEnd(d.wireId, d.end, near);
      return;
    }
    if (d?.kind === 'parts') {
      this.drag = null;
      if (!d.moved) {
        const id = d.ids[0];
        if (d.additive) {
          const s = new Set(this.selected);
          s.has(id) ? s.delete(id) : s.add(id);
          this.setSelection([...s], null, true, true);
        } else if (!this.selected.has(id) || this.selected.size !== 1 || this.selWire) this.setSelection([id], null);
        return;
      }
      const attach = d.ids.length === 1 ? this.attachTarget(d.ids[0]) : null;
      const moves = d.ids.map(id => { const g = this.objs.get(id)!.built.group.position; return { id, x: round1(g.x), z: round1(g.z) }; });
      this.cb.onMove(moves, attach);
      return;
    }
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && !this.running && e.target === this.renderer.domElement) {
      if (this.selected.size || this.selWire) this.setSelection([], null);
    }
  };

  /** Lasciato sopra un altro pezzo, si attacca? (al braccio del servo o al corpo di Luna) */
  private attachTarget(id: string): string | null {
    const o = this.objs.get(id);
    if (!o) return null;
    const mount = mountOf(o.inst.type);
    if (!mount) return null;
    const pos = o.built.group.position;
    const taken = (host: string, type: string) => [...this.objs.values()].some(x => x.inst.id !== id && x.inst.attachedTo === host && (this.objs.get(host)?.inst.type === 'testPad' || x.inst.type === type));
    if (mount === 'horn') {
      for (const s of this.objs.values()) {
        if (!s.built.horn || s.inst.id === id) continue;
        const tip = s.built.horn.localToWorld(new THREE.Vector3(1.4, 0, 0));
        // il braccio può essere in alto: conta anche il punto del banco "sotto" il braccio, visto dalla telecamera
        const c = this.camera.position, dir = tip.clone().sub(c);
        const proj = dir.y < -1e-3 ? c.clone().add(dir.multiplyScalar(-c.y / dir.y)) : tip;
        if (Math.min(Math.hypot(tip.x - pos.x, tip.z - pos.z), Math.hypot(proj.x - pos.x, proj.z - pos.z)) < 4.5) return s.inst.id;
      }
      return null;
    }
    const hosts = mountsOf(o.inst.type);
    for (const b of this.objs.values()) {
      if (!hosts.includes(b.inst.type as any) || b.inst.attachedTo) continue;
      const c = this.ownBox(b.built.group).getCenter(new THREE.Vector3());
      // un pezzo alto (il cartone del latte): conta anche il punto del banco "dietro" il suo centro, visto dalla telecamera
      const cam = this.camera.position, dir = c.clone().sub(cam);
      const proj = dir.y < -1e-3 ? cam.clone().add(dir.multiplyScalar(-cam.y / dir.y)) : c;
      const d = Math.min(Math.hypot(c.x - pos.x, c.z - pos.z), Math.hypot(proj.x - pos.x, proj.z - pos.z));
      if (d < (b.inst.type === 'petBody' ? 7.5 : b.inst.type === 'testPad' ? 4.5 : 9) && !taken(b.inst.id, o.inst.type)) return b.inst.id;
    }
    return null;
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const rd = this.rightDown;
    this.rightDown = null;
    if (this.running) return;
    if (rd && Math.hypot(e.clientX - rd.x, e.clientY - rd.y) > 5) return; // era uno spostamento della vista
    const wh = this.hit(e, [this.wireGroup])[0];
    const ph = this.hit(e, this.partObjects())[0];
    if (wh && (!ph || wh.distance <= ph.distance + 0.01)) {
      const id = wh.object.userData.wireId as string;
      this.setSelection([], id, false);
      this.cb.onContext('wire', id, e.clientX, e.clientY);
      this.cb.onSelect([], id, false);
      return;
    }
    if (ph) {
      const id = ph.object.userData.partId as string;
      if (!this.selected.has(id)) this.setSelection([id], null, false);
      this.cb.onSelect([...this.selected], null, false);
      this.cb.onContext('part', id, e.clientX, e.clientY);
      return;
    }
    this.cb.onContext('none', null, e.clientX, e.clientY);
  };

  private onDropEvt = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer?.getData('text/x-part');
    if (!type) return;
    const p = this.onTable(e);
    if (p) this.cb.onDrop(type, clamp(round1(p.x), -TABLE.w / 2 + 3, TABLE.w / 2 - 3), clamp(round1(p.z), -TABLE.d / 2 + 3, TABLE.d / 2 - 3));
  };

  tableAt(clientX: number, clientY: number) { return this.onTable({ clientX, clientY }); }

  isVisible(id: string) {
    const o = this.objs.get(id);
    if (!o) return true;
    const box = this.ownBox(o.built.group);
    const pts = [box.min, box.max, new THREE.Vector3(box.min.x, box.min.y, box.max.z), new THREE.Vector3(box.max.x, box.min.y, box.min.z)];
    return pts.every(p => { const v = p.clone().project(this.camera); return Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88; });
  }

  // ---------- vista ----------

  private fly: { t1: THREE.Vector3; t2: THREE.Vector3; p1: THREE.Vector3; p2: THREE.Vector3; t0: number; dur: number } | null = null;
  /** La vista scivola fino al punto nuovo, senza salti (i salti fanno perdere l'orientamento). */
  private flyTo(target: THREE.Vector3, pos: THREE.Vector3, smooth: boolean) {
    if (!smooth || this.reducedMotion) { this.fly = null; this.controls.target.copy(target); this.camera.position.copy(pos); return; }
    this.fly = { t1: this.controls.target.clone(), t2: target, p1: this.camera.position.clone(), p2: pos, t0: performance.now(), dur: 320 };
  }
  private reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  get moving() { return !!this.fly; }

  /** Il punto che guardi resta sempre sopra il banco: così non ci si perde. */
  private keepOnTable() {
    const t = this.controls.target;
    const x = clamp(t.x, -TABLE.w / 2, TABLE.w / 2), z = clamp(t.z, -TABLE.d / 2, TABLE.d / 2);
    if (x === t.x && z === t.z) return;
    this.camera.position.x += x - t.x; this.camera.position.z += z - t.z;
    t.x = x; t.z = z;
  }

  /** Inquadra i pezzi. `tight`: più da vicino (per collegare i cavi). I bordi coperti dai pulsanti non contano. */
  fit(parts: PartInst[], opts: { smooth?: boolean; tight?: boolean; pad?: { x: number; y: number } } = {}) {
    const box = new THREE.Box3();
    for (const p of parts) { const o = this.objs.get(p.id); if (o && !p.attachedTo) box.expandByObject(o.built.group); }
    if (box.isEmpty()) { this.homeView(opts.smooth); return; }
    box.expandByScalar(opts.tight ? 1.2 : 2.5);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = this.renderer.domElement.getBoundingClientRect();
    // ai lati ci sono i pulsanti della vista e i colori dei cavi; in alto il suggerimento
    const pad = opts.pad ?? { x: 128, y: 96 };
    const kx = r.width > 0 ? r.width / Math.max(r.width * 0.5, r.width - pad.x) : 1, ky = r.height > 0 ? r.height / Math.max(r.height * 0.5, r.height - pad.y) : 1;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const needW = (Math.max(size.x, opts.tight ? 10 : 14) / 2) / Math.tan(hFov / 2) * kx;
    // i pezzi alti (il mostro del latte con il servo sul tappo) vanno guardati un po' più da lontano e più in alto
    const tall = size.y > 18;
    const needD = (Math.max(size.z, opts.tight ? 7 : 10) / 2 + size.y * (tall ? 0.75 : 0.4)) / Math.tan(vFov / 2) * ky;
    const dist = clamp(Math.max(needW, needD) * 1.05, this.controls.minDistance, this.controls.maxDistance);
    const ty = tall ? size.y * 0.3 : 0;
    this.flyTo(new THREE.Vector3(c.x, ty, c.z), new THREE.Vector3(c.x, ty + dist * 0.76, c.z + dist * 0.65), !!opts.smooth);
  }
  zoom(f: number) {
    this.fly = null;
    const dir = this.camera.position.clone().sub(this.controls.target);
    const len = clamp(dir.length() * f, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(dir.setLength(len));
  }
  rotateView() {
    const dir = this.camera.position.clone().sub(this.controls.target);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    this.flyTo(this.controls.target.clone(), this.controls.target.clone().add(dir), true);
  }
  homeView(smooth = false) {
    this.flyTo(new THREE.Vector3(0, 0, 1), HOME_CAM.clone(), smooth);
  }
  focusOn(x: number, z: number, dist = 22) {
    this.flyTo(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, dist * 0.78, z + dist * 0.7), true);
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
