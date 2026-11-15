// La scena 3D: il banco di lavoro con i pezzi, i cavi a coccodrillo e i comandi.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTS } from '../data/parts';
import type { PartInst, Wire } from '../sim/circuit';
import { buildPart, attachPose, Built, mat, COLORS } from './builders';
import { WIRE_COLORS } from '../data/parts';

export type SceneMode = 'build' | 'wire' | 'code';

export interface SceneCallbacks {
  onMove(id: string, x: number, z: number, attachTo: string | null): void;
  onSelect(id: string | null): void;
  onTerminal(ref: string): void;
  onWire(id: string): void;
  onButton(name: 'A' | 'B', down: boolean): void;
  onLogo(down: boolean): void;
  onPad(pin: string, down: boolean): void;
  onFrame(dt: number): void;
  onDrop(type: string, x: number, z: number): void;
}

interface PartObj { inst: PartInst; built: Built; terminals: Map<string, THREE.Object3D> }

const TABLE = { w: 46, d: 30 };
const HOME_CAM = new THREE.Vector3(0, 34, 30);

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
  private pendingRef: string | null = null;
  private selected: string | null = null;
  private selRing: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private drag: { id: string; offset: THREE.Vector3; startX: number; startY: number; moved: boolean } | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private pressed: { kind: 'button' | 'logo' | 'pad'; name: string } | null = null;
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

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
    this.camera.position.copy(HOME_CAM);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 1);
    this.controls.enableDamping = true;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 90;
    this.controls.maxPolarAngle = 1.38;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    this.scene.background = new THREE.Color(0xf5f0ea);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xe6ddd2, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-14, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -30; sc.right = 30; sc.top = 24; sc.bottom = -24;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 3;
    this.scene.add(sun);

    this.scene.add(this.makeTable());
    this.scene.add(this.wireGroup, this.markers);
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.07, 64), new THREE.MeshBasicMaterial({ color: COLORS.orange, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 0.03;
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('contextmenu', e => e.preventDefault());
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
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 1, TABLE.d), [
      mat(0xd9c7b3), mat(0xd9c7b3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), mat(0xd9c7b3), mat(0xd9c7b3), mat(0xd9c7b3),
    ]);
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
    // tempo vero (anche se il computer è lento il servo gira alla velocità giusta)
    this.clock.update();
    const dt = Math.min(0.25, this.clock.getDelta());
    this.cb.onFrame(dt);
    const t = performance.now() / 1000;
    for (const h of this.highlights) { const s = 1 + 0.25 * Math.sin(t * 6); h.scale.set(s, s, s); }
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
    if (r) this.select(null);
    this.updateMarkers();
  }

  setState(parts: PartInst[], wires: Wire[]) {
    const ids = new Set(parts.map(p => p.id));
    for (const [id, o] of this.objs) if (!ids.has(id)) { o.built.group.removeFromParent(); this.objs.delete(id); }
    // prima i pezzi normali, poi quelli attaccati ai servo
    const sorted = [...parts].sort((a, b) => Number(!!a.attachedTo) - Number(!!b.attachedTo));
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
      this.placeObj(o);
    }
    this.wires = wires;
    this.rebuildWires();
    this.updateMarkers();
    if (this.selected && !ids.has(this.selected)) this.select(null);
    this.updateSelRing();
  }

  private placeObj(o: PartObj) {
    const p = o.inst;
    const g = o.built.group;
    const host = p.attachedTo ? this.objs.get(p.attachedTo)?.built.horn : null;
    const inner = g.getObjectByName('straw-inner');
    if (host) {
      if (g.parent !== host) host.add(g);
      const pose = attachPose(p.type);
      g.position.set(...pose.pos);
      g.rotation.set(pose.rotX || 0, 0, pose.rotZ);
      if (inner) { inner.rotation.set(0, 0, 0); inner.position.set(0, 0, 0); }
    } else {
      if (g.parent !== this.scene) this.scene.add(g);
      g.position.set(p.x, p.y ?? 0, p.z);
      g.rotation.set(0, (p.rot || 0) * (Math.PI / 2), 0);
      if (inner) { inner.rotation.set(0, 0, Math.PI / 2); inner.position.set(6.5, 0.35, 0); }
    }
  }

  setServo(id: string, angle: number) {
    const horn = this.objs.get(id)?.built.horn;
    if (horn) horn.rotation.y = ((angle - 90) * Math.PI) / 180;
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

  /** Evidenzia (con un anello che pulsa) i punti dove c'è un problema. */
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

  select(id: string | null) {
    this.selected = id;
    this.updateSelRing();
    this.cb.onSelect(id);
  }

  private updateSelRing() {
    const o = this.selected ? this.objs.get(this.selected) : null;
    if (!o || o.inst.attachedTo) { this.selRing.visible = false; return; }
    const [w, , d] = PARTS[o.inst.type].size;
    const r = Math.max(w, d) / 2 + 0.6;
    this.selRing.scale.set(r, r, 1);
    this.selRing.position.set(o.inst.x, 0.03, o.inst.z);
    this.selRing.visible = true;
  }

  /** Posizione sullo schermo (px) di un pezzo, per mettere vicino i bottoni. */
  screenOf(id: string): { x: number; y: number } | null {
    const o = this.objs.get(id);
    if (!o) return null;
    const v = new THREE.Vector3();
    o.built.group.getWorldPosition(v);
    v.y += PARTS[o.inst.type].size[1] + 1;
    v.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
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

  private rebuildWires() {
    for (const m of this.wireMeshes.values()) m.removeFromParent();
    this.wireMeshes.clear();
    for (const w of this.wires) {
      const a = this.termWorld(w.a), b = this.termWorld(w.b);
      if (!a || !b) continue;
      const g = new THREE.Group();
      g.userData.wireId = w.id;
      const isPower = w.a.endsWith(':PLUG') || w.b.endsWith(':PLUG');
      const dist = a.distanceTo(b);
      const lift = Math.min(6, 1.2 + dist * 0.18);
      const mid1 = a.clone().lerp(b, 0.3).add(new THREE.Vector3(0, lift, 0));
      const mid2 = a.clone().lerp(b, 0.7).add(new THREE.Vector3(0, lift, 0));
      const curve = new THREE.CatmullRomCurve3([a.clone().add(new THREE.Vector3(0, 0.3, 0)), mid1, mid2, b.clone().add(new THREE.Vector3(0, 0.3, 0))]);
      if (isPower) {
        for (const [off, col] of [[0.14, 0xe5484d], [-0.14, 0x1d1c1f]] as const) {
          const pts = curve.getPoints(24).map(p => p.clone().add(new THREE.Vector3(off, 0, off)));
          const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.1, 6), mat(col));
          t.castShadow = true;
          t.userData.wireId = w.id;
          g.add(t);
        }
        const plug = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.6), mat(0xf2efea));
        const sock = w.a.endsWith(':BAT') ? a : b;
        plug.position.copy(sock).add(new THREE.Vector3(0, 0.55, 0));
        plug.userData.wireId = w.id;
        g.add(plug);
      } else {
        const hex = WIRE_COLORS.find(c => c.id === w.color)?.hex || '#E5484D';
        const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.16, 8), mat(new THREE.Color(hex).getHex(), { roughness: 0.5 }));
        t.castShadow = true;
        t.userData.wireId = w.id;
        g.add(t);
        for (const end of [a, b]) g.add(this.clip(end, hex, w.id));
      }
      this.wireGroup.add(g);
      this.wireMeshes.set(w.id, g);
    }
  }

  /** Pinza a coccodrillo: corpo colorato + becco di metallo. */
  private clip(at: THREE.Vector3, hex: string, wireId: string) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.0, 10), mat(new THREE.Color(hex).getHex(), { roughness: 0.45 }));
    body.position.y = 0.95;
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 8), mat(COLORS.metal, { metalness: 0.8, roughness: 0.3 }));
    jaw.rotation.x = Math.PI;
    jaw.position.y = 0.3;
    g.add(body, jaw);
    g.position.copy(at);
    g.traverse(o => { o.userData.wireId = wireId; (o as THREE.Mesh).castShadow = true; });
    return g;
  }

  // ---------- segnaposto dei morsetti (modalità Collega) ----------

  private updateMarkers() {
    this.markers.clear();
    if (this.mode !== 'wire' || this.running) return;
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

  private ndc(e: PointerEvent | DragEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hit(e: PointerEvent, objects: THREE.Object3D[]) {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    return this.ray.intersectObjects(objects, true);
  }

  private onTable(e: PointerEvent | DragEvent) {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, p) ? p : null;
  }

  /** Il morsetto più vicino al puntatore (sullo schermo), per non dover essere precisi. */
  nearestTerminal(clientX: number, clientY: number, maxPx = 30): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    let best: string | null = null, bestD = maxPx;
    for (const o of this.objs.values()) for (const t of PARTS[o.inst.type].terminals) {
      const ref = `${o.inst.id}:${t.id}`;
      const p = this.termWorld(ref);
      if (!p) continue;
      p.project(this.camera);
      const sx = r.left + ((p.x + 1) / 2) * r.width, sy = r.top + ((1 - p.y) / 2) * r.height;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestD) { bestD = d; best = ref; }
    }
    return best;
  }

  /** Coordinate sullo schermo (client) di un morsetto: usate dai test e dalla guida. */
  terminalClient(ref: string): { x: number; y: number } | null {
    const p = this.termWorld(ref);
    if (!p) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    p.project(this.camera);
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  partClient(id: string): { x: number; y: number } | null {
    const o = this.objs.get(id);
    if (!o) return null;
    const v = new THREE.Box3().setFromObject(o.built.group).getCenter(new THREE.Vector3());
    v.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  hornTipClient(id: string): { x: number; y: number } | null {
    const horn = this.objs.get(id)?.built.horn;
    if (!horn) return null;
    const v = new THREE.Vector3(2.4, 0, 0);
    horn.localToWorld(v);
    v.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  buttonClient(mb: string, name: string): { x: number; y: number } | null {
    const b = this.objs.get(mb)?.built.buttons?.[name];
    if (!b) return null;
    const v = new THREE.Vector3();
    b.getWorldPosition(v);
    v.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  private partObjects() { return [...this.objs.values()].map(o => o.built.group); }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    const hits = this.hit(e, this.partObjects());
    // durante la prova: pulsanti, logo, pin
    if (this.running) {
      const h = hits[0]?.object;
      if (h?.userData.button) { this.pressed = { kind: 'button', name: h.userData.button }; this.cb.onButton(h.userData.button, true); this.controls.enabled = false; return; }
      if (h?.userData.logo) { this.pressed = { kind: 'logo', name: 'logo' }; this.cb.onLogo(true); this.controls.enabled = false; return; }
      if (h?.userData.pad && ['P0', 'P1', 'P2'].includes(h.userData.pad)) { this.pressed = { kind: 'pad', name: h.userData.pad }; this.cb.onPad(h.userData.pad, true); this.controls.enabled = false; return; }
      return;
    }
    if (this.mode === 'wire') {
      const ref = this.nearestTerminal(e.clientX, e.clientY);
      if (ref) { this.controls.enabled = false; this.cb.onTerminal(ref); return; }
      const wh = this.hit(e, [this.wireGroup])[0];
      if (wh) { this.controls.enabled = false; this.cb.onWire(wh.object.userData.wireId); return; }
      return;
    }
    if (this.mode === 'build' && hits.length) {
      const id = hits[0].object.userData.partId as string;
      const o = this.objs.get(id);
      if (!o) return;
      const p = this.onTable(e);
      if (!p) return;
      const wp = new THREE.Vector3();
      o.built.group.getWorldPosition(wp);
      this.drag = { id, offset: new THREE.Vector3(wp.x - p.x, 0, wp.z - p.z), startX: e.clientX, startY: e.clientY, moved: false };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.drag) {
      const d = this.drag;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
      const o = this.objs.get(d.id)!;
      if (!d.moved) {
        d.moved = true;
        // si stacca dal servo mentre lo trascini
        if (o.inst.attachedTo) {
          const wp = new THREE.Vector3();
          o.built.group.getWorldPosition(wp);
          this.scene.add(o.built.group);
          o.built.group.rotation.set(0, 0, 0);
          const inner = o.built.group.getObjectByName('straw-inner');
          if (inner) { inner.rotation.set(0, 0, Math.PI / 2); inner.position.set(6.5, 0.35, 0); }
        }
      }
      const p = this.onTable(e);
      if (!p) return;
      const x = clamp(p.x + d.offset.x, -TABLE.w / 2 + 2, TABLE.w / 2 - 2);
      const z = clamp(p.z + d.offset.z, -TABLE.d / 2 + 2, TABLE.d / 2 - 2);
      o.built.group.position.set(x, 0.6, z);
      this.selRing.visible = false;
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
    if (this.pressed) {
      const p = this.pressed;
      this.pressed = null;
      if (p.kind === 'button') this.cb.onButton(p.name as 'A' | 'B', false);
      if (p.kind === 'logo') this.cb.onLogo(false);
      if (p.kind === 'pad') this.cb.onPad(p.name, false);
      return;
    }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      const o = this.objs.get(d.id);
      if (!o) return;
      if (!d.moved) { this.select(d.id); return; }
      const pos = o.built.group.position;
      let attach: string | null = null;
      if (PARTS[o.inst.type].material) {
        for (const s of this.objs.values()) {
          if (!s.built.horn || s.inst.id === d.id) continue;
          const tip = new THREE.Vector3(1.4, 0, 0);
          s.built.horn.localToWorld(tip);
          if (Math.hypot(tip.x - pos.x, tip.z - pos.z) < 4.5) { attach = s.inst.id; break; }
        }
      }
      this.cb.onMove(d.id, round1(pos.x), round1(pos.z), attach);
      return;
    }
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5 && this.mode === 'build' && !this.running) {
      if (e.target === this.renderer.domElement) this.select(null);
    }
    this.down = null;
  };

  private onDropEvt = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer?.getData('text/x-part');
    if (!type) return;
    const p = this.onTable(e);
    if (p) this.cb.onDrop(type, clamp(round1(p.x), -20, 20), clamp(round1(p.z), -13, 13));
  };

  /** Punto del banco sotto una posizione dello schermo (per i test e il trascinamento dalla tavolozza). */
  tableAt(clientX: number, clientY: number) {
    return this.onTable({ clientX, clientY } as PointerEvent);
  }

  // ---------- vista ----------

  zoom(f: number) {
    const dir = this.camera.position.clone().sub(this.controls.target);
    const len = clamp(dir.length() * f, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(dir.setLength(len));
  }
  rotateView() {
    const dir = this.camera.position.clone().sub(this.controls.target);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    this.camera.position.copy(this.controls.target).add(dir);
  }
  /** Il pezzo si vede tutto nel riquadro? */
  isVisible(id: string) {
    const o = this.objs.get(id);
    if (!o) return true;
    const box = new THREE.Box3().setFromObject(o.built.group);
    const pts = [box.min, box.max, new THREE.Vector3(box.min.x, box.min.y, box.max.z), new THREE.Vector3(box.max.x, box.min.y, box.min.z)];
    return pts.every(p => { const v = p.clone().project(this.camera); return Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88; });
  }

  /** Inquadra tutti i pezzi, qualunque sia la forma del riquadro. */
  fit(parts: PartInst[]) {
    const box = new THREE.Box3();
    for (const p of parts) { const o = this.objs.get(p.id); if (o && !p.attachedTo) box.expandByObject(o.built.group); }
    if (box.isEmpty()) { this.homeView(); return; }
    box.expandByScalar(2.5);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const needW = (Math.max(size.x, 14) / 2) / Math.tan(hFov / 2);
    const needD = (Math.max(size.z, 10) / 2 + size.y * 0.4) / Math.tan(vFov / 2);
    const dist = clamp(Math.max(needW, needD) * 1.05, this.controls.minDistance, this.controls.maxDistance);
    this.controls.target.set(c.x, 0, c.z);
    this.camera.position.set(c.x, dist * 0.76, c.z + dist * 0.65);
  }

  homeView() {
    this.camera.position.copy(HOME_CAM);
    this.controls.target.set(0, 0, 1);
  }
  focusOn(x: number, z: number, dist = 22) {
    this.controls.target.set(x, 0, z);
    this.camera.position.set(x, dist * 0.78, z + dist * 0.7);
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
