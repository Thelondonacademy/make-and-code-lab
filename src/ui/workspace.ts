// Il laboratorio: banco 3D, tavolozza dei pezzi, guida passo passo, MakeCode e "Prova!".
import { PARTS, CATEGORIES, WIRE_COLORS, PALETTE_ORDER } from '../data/parts';
import type { Level, Mode, LevelCtx } from '../data/levels';
import { analyze, canConnect, Issue, PartInst, Wire, Analysis } from '../sim/circuit';
import { MicrobitRuntime } from '../sim/runtime';
import { Hardware } from '../sim/hardware';
import { Scene3D } from '../scene/scene3d';
import { CodeEditor } from '../makecode/editor';
import { flashHex, saveHexFile, usbSupported } from '../device/usb';
import { icon } from './icons';
import { el, esc, header, img, modal, safetyTag, toast } from './common';
import { openCard } from './card';
import { speak, canSpeak, stopSpeaking } from '../speech';
import { tone, cheer } from '../audio';
import { loadWork, saveWork, clearWork, saveStars, loadProgress } from '../store';

const BLOCKING = new Set(['microbit-off', 'short', 'servo-reversed']);
const MODE_LABEL: Record<Mode, string> = { build: 'Costruisci', wire: 'Collega', code: 'Programma' };
const MODE_ICON: Record<Mode, string> = { build: 'ph:scissors-fill', wire: 'ph:plugs-connected-fill', code: 'ph:puzzle-piece-fill' };

let uid = 0;
const newId = (t: string) => `${t}-${Date.now().toString(36)}${(uid++).toString(36)}`;

export class Workspace {
  root: HTMLElement;
  parts: PartInst[] = [];
  wires: Wire[] = [];
  mode: Mode = 'build';
  step = 0;
  doneSteps = new Set<number>();
  code: string;
  codeChanged = false;
  ranChanged = false;
  running = false;
  wireColor = 'auto';
  pending: string | null = null;
  analysis!: Analysis;
  runtimeIssues: Issue[] = [];
  runError: Issue | null = null;
  issueIdx = 0;
  selected: string | null = null;
  private undoStack: string[] = [];
  private scene!: Scene3D;
  private rt: MicrobitRuntime;
  private hw: Hardware;
  private editor: CodeEditor;
  private mkProject: any = null;
  private advanceTimer = 0;
  private finished = false;
  private evalTimer = 0;
  private category: string = 'tutti';

  constructor(public level: Level, private host: HTMLElement) {
    this.code = level.code;
    const saved = loadWork(level.id);
    if (saved) {
      this.parts = saved.parts || [];
      this.wires = saved.wires || [];
      this.mkProject = saved.mk || null;
      if (saved.mk?.text?.['main.ts'] !== undefined) this.code = saved.mk.text['main.ts'];
      this.codeChanged = norm(this.code) !== norm(level.code);
      this.step = Math.min(saved.step || 0, Math.max(0, level.steps.length - 1));
      for (let i = 0; i < this.step; i++) this.doneSteps.add(i);
    } else {
      this.parts = structuredClone(level.start.parts);
      this.wires = structuredClone(level.start.wires);
    }
    if (level.steps[this.step]) this.mode = level.steps[this.step].mode;

    this.hw = new Hardware({
      display: (id, leds) => this.scene?.setDisplay(id, leds),
      servo: (id, a) => this.scene?.setServo(id, a),
      led: (id, l) => this.scene?.setLed(id, this.running ? l : 0),
      tone: (f, ms) => tone(f, ms),
      log: t => toast(`${icon('ph:info-fill', 20)}${esc(t)}`),
      error: (m, d) => { this.runError = { id: 'run-error', level: 'error', title: 'Il programma si è fermato', text: m, refs: [] }; if (d) console.warn('[programma]', d); this.setRunning(false); this.renderIssues(); },
      issue: i => { if (!this.runtimeIssues.some(x => x.id === i.id)) { this.runtimeIssues.push(i); this.issueIdx = 0; this.renderIssues(); } },
    });
    this.rt = new MicrobitRuntime(this.hw);
    this.root = this.render();
    host.replaceChildren(this.root);
    this.editor = new CodeEditor(this.root.querySelector('.mk-host')!);
    this.setupEditor();
    this.setupScene();
    this.sync();
    this.setMode(this.mode, false);
    (window as any).__mcl = this.testApi();
  }

  dispose() {
    this.rt.stop();
    stopSpeaking();
    clearTimeout(this.advanceTimer);
    clearInterval(this.evalTimer);
    this.scene.dispose();
  }

  // ---------- disegno della pagina ----------

  private render() {
    const L = this.level;
    const lab = L.id === 'libero';
    const tabs = (['build', 'wire', 'code'] as Mode[]).map((m, i) =>
      `<button class="tab" data-mode="${m}"><span class="tab-n">${i + 1}</span>${icon(MODE_ICON[m], 22)}${MODE_LABEL[m]}</button>`).join('');
    const stars = Object.values(loadProgress().stars).reduce((a, b) => a + b, 0);
    const root = el(`<div class="ws">
      ${header(`
        <div class="pill-level" title="${esc(L.title)}">${icon(L.icon, 20)}<span>${lab ? 'Laboratorio libero' : `Lezione ${L.lesson} · ${esc(L.title)}`}</span></div>
        <nav class="tabs" aria-label="Fasi del progetto">${tabs}</nav>
        <div class="top-right">
          <div class="stars" title="Le tue stelle">${img('star.svg', 28)}<b class="stars-n">${stars}</b></div>
          <button class="btn btn-go" data-act="run">${icon('ph:play-fill', 24)}<span>Prova!</span></button>
        </div>`)}
      <div class="ws-body">
        <aside class="palette" aria-label="I miei pezzi">
          <h2>I miei pezzi</h2>
          <div class="chips"></div>
          <div class="parts-grid"></div>
          <p class="palette-help">Trascina un pezzo sul banco, oppure toccalo.</p>
        </aside>
        <main class="stage">
          <div class="canvas-wrap">
            <div class="hint" hidden></div>
            <div class="wire-colors" hidden><span>Colore del cavo</span></div>
            <div class="tip" hidden></div>
            <div class="sel-tools" hidden>
              <button class="btn btn-small" data-act="rotate">${icon('ph:arrow-clockwise-bold', 18)}Gira</button>
              <button class="btn btn-small" data-act="info">${icon('ph:question-fill', 18)}Cos'è?</button>
              <button class="btn btn-small btn-danger" data-act="delete">${icon('ph:trash-fill', 18)}Togli</button>
            </div>
            <div class="view-btns">
              <button class="round" data-act="undo" aria-label="Annulla l'ultima mossa">${icon('ph:arrow-counter-clockwise-bold', 26)}</button>
              <button class="round" data-act="fit" aria-label="Guarda tutto il banco">${icon('ph:cube-fill', 26)}</button>
              <button class="round" data-act="view" aria-label="Gira la vista">${icon('ph:arrow-clockwise-bold', 26)}</button>
              <button class="round" data-act="zin" aria-label="Avvicina">${icon('ph:magnifying-glass-plus-bold', 26)}</button>
              <button class="round" data-act="zout" aria-label="Allontana">${icon('ph:magnifying-glass-minus-bold', 26)}</button>
            </div>
            <div class="sensors" hidden>
              <div class="sensors-title">${icon('ph:hand-tap-fill', 20)}Prova i sensori</div>
              <label>${icon('ph:sun-fill', 20)}Luce<input type="range" min="0" max="255" value="128" data-sensor="light"></label>
              <label>${icon('ph:thermometer-fill', 20)}Caldo<input type="range" min="-5" max="45" value="21" data-sensor="temperature"></label>
              <label>${icon('ph:speaker-high-fill', 20)}Rumore<input type="range" min="0" max="255" value="40" data-sensor="sound"></label>
              <button class="btn btn-small" data-act="shake">${icon('ph:vibrate-fill', 18)}Scuoti</button>
              <p>Tocca i pulsanti A e B sul micro:bit!</p>
            </div>
          </div>
          <div class="issue-bar" hidden></div>
        </main>
        <aside class="guide" aria-label="Guida del progetto"></aside>
        <section class="code-panel" aria-label="Programma">
          <div class="code-head">
            <div class="code-step"></div>
            <div class="code-actions">
              <button class="btn btn-soft" data-act="download">${icon('ph:usb-fill', 22)}Manda al micro:bit vero</button>
            </div>
          </div>
          <div class="mk-host"><div class="mk-loading">${img('robot.svg', 64)}<p>Sto aprendo MakeCode…</p></div></div>
          <div class="mk-offline" hidden>
            <h3>MakeCode non si apre</h3>
            <p>Serve internet. Puoi comunque provare il robot con il codice di questo livello, oppure scrivere il codice JavaScript qui sotto.</p>
            <textarea spellcheck="false" aria-label="Codice JavaScript"></textarea>
            <button class="btn btn-soft" data-act="usecode">${icon('ph:check-bold', 20)}Usa questo codice</button>
          </div>
        </section>
      </div>
    </div>`);
    // categorie
    const chips = root.querySelector('.chips')!;
    const cats = [{ id: 'tutti', name: 'Tutti', bg: '', fg: '', bd: '' }, ...CATEGORIES.filter(c => this.level.palette.some(t => PARTS[t].category === c.id))];
    for (const c of cats) {
      const b = el(`<button class="chip-btn" data-cat="${c.id}" style="${c.bg ? `--bg:${c.bg};--fg:${c.fg};--bd:${c.bd}` : ''}">${c.name}</button>`);
      b.addEventListener('click', () => { this.category = c.id; this.renderPalette(); });
      chips.appendChild(b);
    }
    // colori dei cavi
    const wc = root.querySelector('.wire-colors')!;
    const auto = el(`<button class="swatch swatch-auto" data-color="auto" aria-label="Colore automatico" title="Automatico: nero per GND, rosso per 3V">A</button>`);
    auto.addEventListener('click', () => { this.wireColor = 'auto'; this.renderWireColors(); });
    wc.appendChild(auto);
    for (const c of WIRE_COLORS) {
      const b = el(`<button class="swatch" data-color="${c.id}" aria-label="Cavo ${c.name}" title="${c.name}" style="background:${c.hex}"></button>`);
      b.addEventListener('click', () => { this.wireColor = c.id; this.renderWireColors(); });
      wc.appendChild(b);
    }
    // azioni
    root.addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest('[data-act],[data-mode]') as HTMLElement | null;
      if (!t) return;
      if (t.dataset.mode) { this.setMode(t.dataset.mode as Mode); return; }
      this.action(t.dataset.act!);
    });
    for (const inp of root.querySelectorAll<HTMLInputElement>('[data-sensor]')) {
      inp.addEventListener('input', () => this.rt.setSensor(inp.dataset.sensor as any, Number(inp.value)));
    }
    return root;
  }

  private q<T extends HTMLElement = HTMLElement>(s: string) { return this.root.querySelector(s) as T; }

  private renderPalette() {
    const grid = this.q('.parts-grid');
    grid.replaceChildren();
    for (const c of this.root.querySelectorAll<HTMLElement>('.chip-btn')) c.classList.toggle('on', c.dataset.cat === this.category);
    const order = PALETTE_ORDER.filter(t => this.level.palette.includes(t) && (this.category === 'tutti' || PARTS[t].category === this.category));
    for (const t of order) {
      const p = PARTS[t];
      const cat = CATEGORIES.find(c => c.id === p.category)!;
      const b = el(`<div class="part" role="button" tabindex="0" draggable="${!p.tool}" data-type="${t}" style="--bd:${cat.bd};--bg:${cat.bg}">
        ${img(p.icon, 46, '')}<span class="part-name">${esc(p.name)}</span>${p.safety ? safetyTag(p.safety) : ''}
        <button class="part-info" aria-label="Cos'è ${esc(p.name)}?">${icon('ph:question-fill', 18)}</button>
      </div>`);
      b.addEventListener('dragstart', e => { e.dataTransfer!.setData('text/x-part', t); e.dataTransfer!.effectAllowed = 'copy'; });
      b.addEventListener('click', e => {
        if ((e.target as HTMLElement).closest('.part-info') || p.tool) { openCard(t); return; }
        this.addPart(t);
      });
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.tool ? openCard(t) : this.addPart(t); } });
      grid.appendChild(b);
    }
  }

  private renderWireColors() {
    for (const s of this.root.querySelectorAll<HTMLElement>('.swatch')) s.classList.toggle('on', s.dataset.color === this.wireColor);
  }

  // ---------- scena ----------

  private setupScene() {
    this.scene = new Scene3D(this.q('.canvas-wrap'), {
      onMove: (id, x, z, attachTo) => {
        const p = this.parts.find(p => p.id === id);
        if (!p) return;
        this.pushUndo();
        const was = p.attachedTo;
        p.x = x; p.z = z;
        p.attachedTo = attachTo || undefined;
        if (attachTo && !was) toast(`${img('fire.svg', 22)}Attaccato al servo! Nel mondo vero lo incolla l'adulto con la colla a caldo.`, { kind: 'ok', ms: 4500 });
        this.sync();
      },
      onSelect: id => { this.selected = id; this.positionSelTools(); },
      onTerminal: ref => this.clickTerminal(ref),
      onWire: id => this.removeWire(id),
      onButton: (b, down) => { this.rt.pressButton(b, down); for (const mb of this.parts.filter(p => p.type === 'microbit')) this.scene.setButtonPressed(mb.id, b, down); },
      onLogo: down => this.rt.touchLogo(down),
      onPad: (pin, down) => this.rt.touchPin(pin, down),
      onFrame: dt => { this.hw.step(dt); if (this.selected) this.positionSelTools(); },
      onDrop: (type, x, z) => this.addPart(type, x, z),
    });
    this.scene.onHover = (ref, x, y) => {
      const tip = this.q('.tip');
      if (!ref) { tip.hidden = true; return; }
      tip.hidden = false;
      tip.textContent = this.termLabel(ref);
      tip.style.left = x + 18 + 'px';
      tip.style.top = y - 12 + 'px';
    };
    for (const s of this.parts.filter(p => p.type === 'servo')) this.scene.setServo(s.id, this.hw.servoAngle.get(s.id) ?? 90);
    this.renderPalette();
    this.renderWireColors();
  }

  private termLabel(ref: string) {
    const [pid, tid] = ref.split(':');
    const p = this.parts.find(x => x.id === pid);
    if (!p) return '';
    const t = PARTS[p.type].terminals.find(t => t.id === tid);
    return p.type === 'microbit' ? `micro:bit: ${t?.label}` : `${PARTS[p.type].name}: ${t?.label}`;
  }

  private positionSelTools() {
    const tools = this.q('.sel-tools');
    const p = this.selected ? this.parts.find(x => x.id === this.selected) : null;
    if (!p || this.mode !== 'build' || this.running) { tools.hidden = true; return; }
    const s = this.scene.screenOf(p.id);
    if (!s) { tools.hidden = true; return; }
    tools.hidden = false;
    (tools.querySelector('[data-act=rotate]') as HTMLElement).hidden = !!p.attachedTo;
    tools.style.left = Math.round(s.x) + 'px';
    tools.style.top = Math.max(8, Math.round(s.y) - 56) + 'px';
  }

  // ---------- azioni ----------

  private action(a: string) {
    switch (a) {
      case 'run': this.running ? this.stopRun() : this.run(); break;
      case 'undo': this.undo(); break;
      case 'view': this.scene.rotateView(); break;
      case 'fit': this.scene.fit(this.parts); break;
      case 'zin': this.scene.zoom(0.8); break;
      case 'zout': this.scene.zoom(1.25); break;
      case 'rotate': this.rotateSel(); break;
      case 'info': { const p = this.parts.find(x => x.id === this.selected); if (p) openCard(p.type); break; }
      case 'delete': if (this.selected) this.removePart(this.selected); break;
      case 'shake': this.rt.gesture('Shake'); break;
      case 'download': void this.download(); break;
      case 'usecode': {
        const ta = this.q<HTMLTextAreaElement>('.mk-offline textarea');
        this.setCode(ta.value);
        toast(`${icon('ph:check-bold', 20)}Codice pronto. Premi Prova!`, { kind: 'ok' });
        break;
      }
      case 'prev': this.goStep(this.step - 1); break;
      case 'next': this.goStep(this.step + 1); break;
      case 'listen': { const s = this.level.steps[this.step]; if (s) speak(`${s.title}. ${s.text}`); break; }
      case 'show-issue': this.showIssue(); break;
      case 'listen-issue': { const i = this.currentIssues()[this.issueIdx]; if (i) speak(`${i.title}. ${i.text}`); break; }
      case 'next-issue': this.issueIdx++; this.renderIssues(); break;
      case 'restart': this.restart(); break;
    }
  }

  setMode(m: Mode, user = true) {
    if (m !== 'code' && this.mode === 'code') this.scene.resize();
    this.mode = m;
    this.root.classList.remove('mode-build', 'mode-wire', 'mode-code');
    this.root.classList.add('mode-' + m);
    for (const t of this.root.querySelectorAll<HTMLElement>('.tab')) {
      t.classList.toggle('on', t.dataset.mode === m);
      t.setAttribute('aria-pressed', String(t.dataset.mode === m));
    }
    this.pending = null;
    this.scene.setPending(null);
    this.scene.setMode(m);
    this.q('.wire-colors').hidden = m !== 'wire' || this.running;
    this.positionSelTools();
    this.renderHint();
    this.q('.tip').hidden = true;
    requestAnimationFrame(() => { this.scene.resize(); this.scene.fit(this.parts); });
    if (user) this.evaluate();
  }

  addPart(type: string, x?: number, z?: number) {
    const def = PARTS[type];
    if (!def || def.tool) { openCard(type); return; }
    if (this.running) { toast('Prima ferma la prova, poi aggiungi i pezzi.'); return; }
    if (type === 'microbit' && this.parts.some(p => p.type === 'microbit')) { toast('Il micro:bit c\'è già: per questi progetti ne basta uno.'); return; }
    this.pushUndo();
    const pos = x === undefined ? this.freeSpot(type) : { x, z: z! };
    const id = newId(type);
    this.parts.push({ id, type, x: pos.x, z: pos.z, rot: type === 'servo' ? 0 : 0 });
    if (this.mode !== 'build') this.setMode('build', false);
    this.sync();
    this.scene.select(id);
    if (!this.scene.isVisible(id)) this.scene.fit(this.parts);
  }

  private freeSpot(type: string) {
    const [w, , d] = PARTS[type].size;
    const r = Math.max(w, d) / 2 + 1;
    const cand: { x: number; z: number }[] = [];
    for (let zz = 2; zz >= -10; zz -= 5) for (let xx = 0; xx <= 18; xx += 5) { cand.push({ x: xx, z: zz }, { x: -xx, z: zz }); }
    cand.push({ x: 0, z: 9 }, { x: 8, z: 9 }, { x: -8, z: 9 });
    for (const c of cand) {
      const ok = this.parts.filter(p => !p.attachedTo).every(p => {
        const [pw, , pd] = PARTS[p.type].size;
        return Math.hypot(p.x - c.x, p.z - c.z) > r + Math.max(pw, pd) / 2;
      });
      if (ok) return c;
    }
    return { x: 0, z: 0 };
  }

  private removePart(id: string) {
    if (this.running) return;
    this.pushUndo();
    this.parts = this.parts.filter(p => p.id !== id);
    for (const p of this.parts) if (p.attachedTo === id) { p.attachedTo = undefined; }
    this.wires = this.wires.filter(w => !w.a.startsWith(id + ':') && !w.b.startsWith(id + ':'));
    this.selected = null;
    this.sync();
  }

  private rotateSel() {
    const p = this.parts.find(x => x.id === this.selected);
    if (!p || p.attachedTo) return;
    this.pushUndo();
    p.rot = ((p.rot || 0) + 1) % 4;
    this.sync();
  }

  private clickTerminal(ref: string) {
    if (!this.pending) {
      this.pending = ref;
      this.scene.setPending(ref);
      this.renderHint();
      tone(880, 40);
      return;
    }
    if (this.pending === ref) { this.pending = null; this.scene.setPending(null); this.renderHint(); return; }
    const a = this.pending, b = ref;
    const err = canConnect(this.parts, this.wires, a, b);
    if (err) {
      toast(`${icon('ph:warning-fill', 20)}${esc(err)}`, { kind: 'warn' });
      tone(220, 120);
      this.pending = null;
      this.scene.setPending(null);
      this.renderHint();
      return;
    }
    this.pushUndo();
    const plug = a.endsWith(':PLUG') || b.endsWith(':PLUG') || a.endsWith(':BAT') || b.endsWith(':BAT');
    this.wires.push({ id: newId('w'), a, b, color: plug ? 'bianco' : this.pickColor(a, b) });
    this.pending = null;
    this.scene.setPending(null);
    tone(1175, 60);
    this.sync();
  }

  /** Colore automatico come fanno i maker: nero per il GND, rosso per il 3V, giallo per i segnali. */
  private pickColor(a: string, b: string) {
    if (this.wireColor !== 'auto') return this.wireColor;
    const t = [a, b].map(r => r.split(':')[1]);
    if (t.includes('GND') || t.includes('K')) return 'nero';
    if (t.includes('3V') || t.includes('VCC')) return 'rosso';
    return 'giallo';
  }

  private removeWire(id: string) {
    if (this.running) return;
    const w = this.wires.find(w => w.id === id);
    if (!w) return;
    this.pushUndo();
    this.wires = this.wires.filter(x => x.id !== id);
    this.sync();
    toast(`${icon('ph:trash-fill', 20)}Cavo tolto.`, { action: 'Rimettilo', onAction: () => this.undo() });
  }

  private pushUndo() {
    this.undoStack.push(JSON.stringify({ parts: this.parts, wires: this.wires }));
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  undo() {
    if (this.running) return;
    const s = this.undoStack.pop();
    if (!s) { toast('Non c\'è niente da annullare.'); return; }
    const v = JSON.parse(s);
    this.parts = v.parts;
    this.wires = v.wires;
    this.sync();
  }

  private restart() {
    const m = modal(`<h2>Ricominciare il progetto?</h2><p class="lead">Il banco torna come all'inizio e il codice torna quello del livello.</p>
      <div class="row"><button class="btn btn-danger" data-x="yes">${icon('ph:arrow-counter-clockwise-bold', 20)}Sì, ricomincia</button><button class="btn" data-x="no">No</button></div>`);
    m.root.querySelector('[data-x=no]')!.addEventListener('click', m.close);
    m.root.querySelector('[data-x=yes]')!.addEventListener('click', () => {
      m.close();
      this.stopRun();
      clearWork(this.level.id);
      this.parts = structuredClone(this.level.start.parts);
      this.wires = structuredClone(this.level.start.wires);
      this.doneSteps.clear();
      this.step = 0;
      this.finished = false;
      this.codeChanged = false;
      this.ranChanged = false;
      this.mkProject = null;
      this.setCode(this.level.code, false);
      void this.editor.open(this.codeSpec(), null);
      this.sync();
      this.setMode(this.level.steps[0]?.mode || 'build');
    });
  }

  // ---------- codice ----------

  private codeSpec() {
    return { key: this.level.id, name: this.level.title, mainTs: this.level.code, namespaces: this.level.namespaces, dependencies: this.level.dependencies };
  }

  private setupEditor() {
    this.editor.onStatus = s => {
      this.q('.mk-host').classList.toggle('ready', s === 'ready');
      this.q('.mk-offline').hidden = s !== 'offline';
      if (s === 'offline') this.q<HTMLTextAreaElement>('.mk-offline textarea').value = this.code;
    };
    this.editor.onCode = (ts, project) => {
      this.mkProject = project;
      this.setCode(ts);
    };
    this.editor.onDownload = (hex, name) => void this.flash(hex, name);
    void this.editor.open(this.codeSpec(), this.mkProject);
  }

  setCode(ts: string, persist = true) {
    const changed = norm(ts) !== norm(this.code);
    this.code = ts;
    if (norm(ts) !== norm(this.level.code)) this.codeChanged = true;
    if (persist) this.persist();
    if (changed && this.running) { this.run(); }
  }

  private async download() {
    if (this.editor.status !== 'ready') {
      modal(`<h2>Serve MakeCode</h2><p class="lead">Per mandare il programma al micro:bit vero, MakeCode deve essere aperto. Controlla di essere collegato a internet.</p>`);
      return;
    }
    try {
      toast(`${icon('ph:gear-six-fill', 20)}Preparo il programma…`, { ms: 6000 });
      await this.editor.download();
    } catch {
      toast('Non sono riuscito a preparare il programma. Riprova tra un attimo.', { kind: 'warn' });
    }
  }

  private async flash(hex: string, name: string) {
    const usb = usbSupported();
    const m = modal(`<div class="flash">
      <h2>${icon('ph:usb-fill', 30)} Manda al micro:bit vero</h2>
      <ol class="flash-steps">
        <li>Collega il micro:bit al computer con il cavo USB.</li>
        <li>${usb ? 'Premi <b>Collega e manda</b> e scegli il micro:bit nella finestra.' : 'Premi <b>Salva il file</b>, poi trascinalo sul disco MICROBIT.'}</li>
        <li>Aspetta che la lucina smetta di lampeggiare. Fatto!</li>
      </ol>
      <div class="flash-bar" hidden><div></div></div>
      <p class="flash-msg"></p>
      <div class="row">
        ${usb ? `<button class="btn btn-go" data-x="usb">${icon('ph:usb-fill', 22)}Collega e manda</button>` : ''}
        <button class="btn" data-x="file">${icon('ph:download-simple-bold', 22)}Salva il file</button>
      </div>
      <p class="small">Un adulto ti aiuta la prima volta. Funziona con Chrome o Edge sul computer.</p>
    </div>`);
    const bar = m.root.querySelector('.flash-bar') as HTMLElement;
    const msg = m.root.querySelector('.flash-msg') as HTMLElement;
    m.root.querySelector('[data-x=file]')!.addEventListener('click', () => { saveHexFile(hex, name || this.level.title); msg.textContent = 'File salvato. Trascinalo sul disco MICROBIT.'; });
    m.root.querySelector('[data-x=usb]')?.addEventListener('click', async () => {
      bar.hidden = false;
      msg.textContent = 'Mi collego…';
      try {
        await flashHex(hex, (pct, stage) => {
          (bar.firstElementChild as HTMLElement).style.width = pct + '%';
          msg.textContent = /Flash/i.test(stage) ? `Mando il programma… ${pct}%` : 'Mi collego…';
        });
        (bar.firstElementChild as HTMLElement).style.width = '100%';
        msg.innerHTML = `${icon('ph:check-bold', 20)} Fatto! Il programma è sul micro:bit.`;
        cheer();
      } catch (e: any) {
        const code = e?.code || e?.message || '';
        msg.textContent = /no-device|not-found|NotFound|cancel/i.test(String(code))
          ? 'Non ho trovato il micro:bit. Controlla il cavo e riprova.'
          : 'Qualcosa non ha funzionato. Stacca e riattacca il cavo, poi riprova. Puoi anche usare "Salva il file".';
        console.warn('[usb]', e);
      }
    });
  }

  // ---------- prova ----------

  run() {
    this.rt.stop();
    this.runError = null;
    this.runtimeIssues = [];
    this.issueIdx = 0;
    this.analysis = analyze(this.parts, this.wires);
    const blocking = this.analysis.issues.filter(i => BLOCKING.has(i.id));
    if (!this.parts.some(p => p.type === 'microbit')) {
      this.runError = { id: 'no-mb', level: 'error', title: 'Manca il micro:bit', text: 'Trascina il micro:bit sul banco: è il cervello del robot.', refs: [] };
      this.renderIssues();
      tone(220, 150);
      return;
    }
    if (blocking.length) {
      this.issueIdx = 0;
      this.renderIssues(true);
      tone(220, 150);
      this.shakeIssueBar();
      return;
    }
    this.hw.setCircuit(this.parts, this.wires);
    this.hw.reset();
    const err = this.rt.start(this.code);
    if (err) return;
    if (this.codeChanged) this.ranChanged = true;
    this.setRunning(true);
    this.renderIssues();
  }

  stopRun() {
    this.rt.stop();
    this.setRunning(false);
  }

  private setRunning(r: boolean) {
    this.running = r;
    this.root.classList.toggle('running', r);
    const btn = this.q('[data-act=run]');
    btn.innerHTML = r ? `${icon('ph:stop-fill', 24)}<span>Ferma</span>` : `${icon('ph:play-fill', 24)}<span>Prova!</span>`;
    btn.classList.toggle('btn-stop', r);
    this.q('.sensors').hidden = !r;
    this.q('.wire-colors').hidden = this.mode !== 'wire' || r;
    this.scene.setRunning(r);
    if (!r) {
      for (const mb of this.parts.filter(p => p.type === 'microbit')) this.scene.setDisplay(mb.id, new Uint8Array(25));
      for (const l of this.parts.filter(p => p.type === 'led')) this.scene.setLed(l.id, 0);
      this.runtimeIssues = [];
    } else {
      this.hw.updateLeds();
      for (const [id, lvl] of this.hw.ledLevel) this.scene.setLed(id, lvl);
    }
    this.positionSelTools();
    this.renderHint();
    this.renderIssues();
    this.evaluate();
  }

  // ---------- problemi ----------

  private currentIssues(): Issue[] {
    const order = { error: 0, warning: 1, tip: 2 };
    const list = [...(this.runError ? [this.runError] : []), ...this.runtimeIssues, ...(this.analysis?.issues || [])];
    // senza micro:bit acceso gli altri errori confondono: prima si accende
    const filtered = list.filter(i => !(i.id === 'microbit-off' && !this.running && !this.triedRun));
    return filtered.sort((a, b) => order[a.level] - order[b.level]);
  }
  private triedRun = false;

  private renderIssues(fromRun = false) {
    if (fromRun) this.triedRun = true;
    const bar = this.q('.issue-bar');
    let list = this.currentIssues();
    // durante la costruzione mostriamo solo i problemi dei collegamenti già fatti
    if (!this.running && !fromRun && !this.runError) {
      list = list.filter(i => i.level !== 'tip' && (i.id !== 'microbit-off' || this.triedRun) && this.issueRelevant(i));
    }
    if (!list.length) { bar.hidden = true; this.scene.highlight([]); return; }
    if (this.issueIdx >= list.length) this.issueIdx = 0;
    const i = list[this.issueIdx];
    bar.hidden = false;
    bar.className = `issue-bar issue-${i.level}`;
    bar.innerHTML = `<div class="issue-icon">${icon(i.level === 'tip' ? 'ph:lightbulb-fill' : 'ph:warning-fill', 26)}</div>
      <div class="issue-text"><b>${esc(i.title)}</b><span>${esc(i.text)}</span></div>
      <div class="issue-actions">
        ${i.refs.length ? `<button class="btn btn-small" data-act="show-issue">${icon('ph:eye-fill', 18)}Fammi vedere</button>` : ''}
        ${canSpeak() ? `<button class="btn btn-small" data-act="listen-issue" aria-label="Ascolta">${icon('ph:speaker-high-fill', 18)}</button>` : ''}
        ${list.length > 1 ? `<button class="btn btn-small" data-act="next-issue">${this.issueIdx + 1} di ${list.length} ${icon('ph:arrow-right-bold', 16)}</button>` : ''}
      </div>`;
    this.scene.highlight(i.refs);
  }

  /** Durante la costruzione un errore conta solo se riguarda un pezzo che ha già almeno un filo. */
  private issueRelevant(i: Issue) {
    if (['short', 'servo-reversed', 'led-reversed', 'servo-vcc-pin', 'servo-sig-power'].includes(i.id)) return true;
    if (i.id === 'microbit-off' || i.id === 'run-error') return true;
    return this.mode === 'wire' && i.refs.some(r => this.wires.some(w => w.a.split(':')[0] === r.split(':')[0] || w.b.split(':')[0] === r.split(':')[0]));
  }

  private showIssue() {
    const i = this.currentIssues()[this.issueIdx];
    if (!i?.refs.length) return;
    const p = this.scene.termWorld(i.refs[0]);
    if (p) this.scene.focusOn(p.x, p.z, 20);
    const needWire = /filo|collega|spina|GND|3V|pin/i.test(i.text);
    if (needWire && !this.running && this.mode !== 'wire') this.setMode('wire');
  }

  private shakeIssueBar() {
    const bar = this.q('.issue-bar');
    bar.classList.remove('shake');
    void bar.offsetWidth;
    bar.classList.add('shake');
  }

  // ---------- guida passo passo ----------

  private ctx(): LevelCtx {
    return {
      parts: this.parts, wires: this.wires, analysis: this.analysis, running: this.running,
      stats: this.running ? this.rt.stats : null, servoMoves: this.hw.servoMoves, code: this.code,
      codeChangedSinceStart: this.codeChanged, ranChangedCode: this.ranChanged,
    };
  }

  private evaluate() {
    const steps = this.level.steps;
    if (!steps.length || this.finished) return;
    const s = steps[this.step];
    if (!s || this.doneSteps.has(this.step)) return;
    if (!s.goal(this.ctx())) return;
    this.doneSteps.add(this.step);
    cheer();
    this.renderGuide();
    const last = this.step === steps.length - 1;
    clearTimeout(this.advanceTimer);
    this.advanceTimer = window.setTimeout(() => {
      if (last) this.finish();
      else this.goStep(this.step + 1);
    }, last ? 1800 : 1400);
  }

  goStep(n: number) {
    const steps = this.level.steps;
    if (n < 0 || n >= steps.length) return;
    if (n > this.step && !this.doneSteps.has(this.step)) return; // prima si finisce il passo
    clearTimeout(this.advanceTimer);
    this.step = n;
    this.persist();
    const m = steps[n].mode;
    if (m !== this.mode) this.setMode(m, false);
    this.renderGuide();
    this.renderHint();
    this.evaluate();
  }

  private renderGuide() {
    const g = this.q('.guide');
    const L = this.level;
    if (!L.steps.length) {
      g.innerHTML = `<h2>Laboratorio libero</h2>
        <p class="lead">Inventa quello che vuoi! Ecco qualche idea:</p>
        <ul class="ideas"><li>Una lanterna: un LED dentro il rotolo di cartone.</li><li>Un mostro che apre la bocca: il cartone sul servo.</li><li>Una faccina che cambia quando premi A.</li></ul>
        <p class="lead">Tocca il ${icon('ph:question-fill', 16)} su un pezzo per sapere a cosa serve.</p>
        <button class="btn btn-soft" data-act="restart">${icon('ph:arrow-counter-clockwise-bold', 20)}Banco vuoto</button>`;
      this.q('.code-step').innerHTML = `<b>Programma il tuo robot</b><span>Usa i blocchi, poi premi Prova!</span>`;
      return;
    }
    const s = L.steps[this.step];
    const done = this.doneSteps.has(this.step);
    const dots = L.steps.map((_, i) => `<span class="dot ${this.doneSteps.has(i) ? 'done' : i === this.step ? 'now' : ''}"></span>`).join('');
    const list = s.checklist?.(this.ctx());
    g.innerHTML = `
      <div class="guide-top"><span class="step-n">Passo ${this.step + 1} di ${L.steps.length}</span><span class="dots">${dots}</span></div>
      <h2>${esc(s.title)}</h2>
      <p class="lead">${esc(s.text)}</p>
      ${canSpeak() ? `<button class="btn btn-soft" data-act="listen">${icon('ph:speaker-high-fill', 22)}Ascolta</button>` : ''}
      ${list ? `<ul class="check">${list.map((c, i) => `<li class="${c.done ? 'ok' : ''}"><span class="ck">${c.done ? icon('ph:check-bold', 18) : i + 1}</span>${c.color ? `<span class="sw" style="background:${c.color}"></span>` : ''}<span>${esc(c.label)}</span></li>`).join('')}</ul>` : ''}
      ${done ? `<div class="bravo">${img('party-popper.svg', 34)}<b>Bravo!</b></div>` : ''}
      ${s.why ? `<details class="why"><summary>${esc(s.why.q)}</summary><p>${esc(s.why.a)}</p></details>` : ''}
      <div class="guide-nav">
        <button class="btn" data-act="prev" ${this.step === 0 ? 'disabled' : ''}>${icon('ph:arrow-left-bold', 20)}Indietro</button>
        <button class="btn btn-next" data-act="next" ${done && this.step < L.steps.length - 1 ? '' : 'disabled'}>Avanti${icon('ph:arrow-right-bold', 20)}</button>
      </div>
      <button class="link-btn" data-act="restart">${icon('ph:arrow-counter-clockwise-bold', 16)}Ricomincia il progetto</button>`;
    this.q('.code-step').innerHTML = `<span class="step-n">Passo ${this.step + 1} di ${L.steps.length}</span><b>${esc(s.title)}</b><span>${esc(s.text)}</span>
      ${canSpeak() ? `<button class="btn btn-small" data-act="listen" aria-label="Ascolta">${icon('ph:speaker-high-fill', 18)}</button>` : ''}`;
  }

  private renderHint() {
    const h = this.q('.hint');
    let html = '';
    if (this.running) html = `${img('light-bulb.svg', 30)}<span>Il robot è acceso! Tocca i pulsanti <b>A</b> e <b>B</b> sul micro:bit.</span>`;
    else if (this.mode === 'wire' && this.pending) html = `${img('crocodile.svg', 30)}<span>Ora tocca dove va il cavo: <b>${esc(this.termLabel(this.pending))}</b> → ?</span>`;
    else if (this.mode === 'wire') html = `${img('crocodile.svg', 30)}<span>Tocca un cerchietto, poi un altro: il cavo a coccodrillo li unisce.</span>`;
    h.hidden = !html;
    h.innerHTML = html;
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    saveStars(this.level.id, 3);
    const total = Object.values(loadProgress().stars).reduce((a, b) => a + b, 0);
    this.q('.stars-n').textContent = String(total);
    const R = this.level.real;
    const m = modal(`<div class="finale">
      ${img('party-popper.svg', 72)}
      <h2>Ce l'hai fatta!</h2>
      <div class="finale-stars">${img('star.svg', 48)}${img('star.svg', 56)}${img('star.svg', 48)}</div>
      <p class="lead">Hai finito <b>${esc(this.level.title)}</b>. Ora costruiscilo davvero!</p>
      <div class="finale-cols">
        <div><h3>${icon('ph:shopping-bag-fill', 22, 'color:#B8862A')}Ti serve</h3><ul>${R.materials.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><h3>${icon('ph:shield-check-fill', 22, 'color:#2E8B57')}Sicurezza</h3><ul class="safe">${R.safety.map(([s, t]) => `<li>${safetyTag(s as any)}<span>${esc(t)}</span></li>`).join('')}</ul></div>
      </div>
      <div class="row">
        <button class="btn btn-go" data-x="dl">${icon('ph:usb-fill', 22)}Manda al micro:bit vero</button>
        <a class="btn" href="#/">${icon('ph:flag-fill', 20)}Torna al percorso</a>
        <button class="btn" data-x="stay">Resta qui e gioca</button>
      </div></div>`, { wide: true });
    m.root.querySelector('[data-x=stay]')!.addEventListener('click', m.close);
    m.root.querySelector('[data-x=dl]')!.addEventListener('click', () => { m.close(); this.setMode('code'); void this.download(); });
    m.root.querySelector('a')!.addEventListener('click', m.close);
  }

  // ---------- sincronizzazione ----------

  private sync() {
    this.analysis = analyze(this.parts, this.wires);
    this.hw.setCircuit(this.parts, this.wires);
    this.scene.setState(this.parts, this.wires);
    for (const s of this.parts.filter(p => p.type === 'servo')) this.scene.setServo(s.id, this.hw.servoAngle.get(s.id) ?? 90);
    this.renderIssues();
    this.renderGuide();
    this.positionSelTools();
    this.persist();
    this.evaluate();
    clearInterval(this.evalTimer);
    this.evalTimer = window.setInterval(() => { if (this.running) this.evaluate(); }, 300);
  }

  private persist() {
    saveWork(this.level.id, { parts: this.parts, wires: this.wires, mk: this.mkProject || { text: { 'main.ts': this.code } }, step: this.step });
  }

  // ---------- comandi per i test automatici ----------

  private testApi() {
    return {
      ws: this,
      add: (type: string, x?: number, z?: number) => { this.addPart(type, x, z); return this.parts.at(-1)!.id; },
      connect: (a: string, b: string) => { this.pending = null; this.clickTerminal(a); this.clickTerminal(b); return this.wires.length; },
      attach: (id: string, servo: string) => { const p = this.parts.find(p => p.id === id)!; p.attachedTo = servo; this.sync(); },
      code: (ts: string) => this.setCode(ts),
      run: () => this.run(),
      stop: () => this.stopRun(),
      press: (b: 'A' | 'B') => { this.rt.pressButton(b, true); this.rt.pressButton(b, false); },
      mode: (m: Mode) => this.setMode(m),
      state: () => ({
        parts: this.parts.map(p => ({ id: p.id, type: p.type, attachedTo: p.attachedTo })), wires: this.wires.length,
        step: this.step, done: [...this.doneSteps], running: this.running, mode: this.mode,
        issues: this.currentIssues().map(i => i.id), servo: Object.fromEntries(this.hw.servoAngle),
        leds: Array.from(this.rt.leds).map(v => (v ? 1 : 0)).join(''), finished: this.finished, editor: this.editor.status,
        code: this.code,
      }),
      termClient: (ref: string) => this.scene.terminalClient(ref),
      partClient: (id: string) => this.scene.partClient(id),
      hornClient: (id: string) => this.scene.hornTipClient(id),
      buttonClient: (mb: string, b: string) => this.scene.buttonClient(mb, b),
    };
  }
}

const norm = (s: string) => (s || '').replace(/\s+/g, '');
