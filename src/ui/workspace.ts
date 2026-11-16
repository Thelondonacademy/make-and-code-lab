// Il laboratorio: banco 3D, tavolozza dei pezzi, guida passo passo, MakeCode e "Prova!".
import { PARTS, CATEGORIES, WIRE_COLORS, PALETTE_ORDER, mountsOf } from '../data/parts';
import type { Level, Mode, LevelCtx } from '../data/levels';
import { actsOf, LESSONS } from '../data/levels';
import { HandHint } from './handhint';
import { analyze, canConnect, Issue, PartInst, Wire, Analysis, PIN_PADS } from '../sim/circuit';
import { MicrobitRuntime, RadioBus, Bridge } from '../sim/runtime';
import { Hardware } from '../sim/hardware';
import { Scene3D } from '../scene/scene3d';
import { CodeEditor } from '../makecode/editor';
import { flashHex, saveHexFile, usbSupported } from '../device/usb';
import { icon } from './icons';
import { el, esc, header, img, modal, safetyTag, toast } from './common';
import { openCard } from './card';
import { BuzzGame } from './buzzgame';
import { HuntGame } from './huntgame';
import { speak, canSpeak, stopSpeaking } from '../speech';
import { tone, cheer, fanfare } from '../audio';
import { loadWork, saveWork, clearWork, saveStars, loadProgress, saveWord, getAutoRead, setAutoRead } from '../store';
const FRUITS = new Set(['banana', 'apple', 'lemon', 'orange']);
const PUB: string = (import.meta as any).env?.BASE_URL || './';

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
  selIds: string[] = [];
  selWire: string | null = null;
  get selected() { return this.selIds[0] ?? null; }
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
  private stepEpoch = 0;
  private runEpoch = -1;
  private runCode = '';
  private shown: Issue[] = [];

  constructor(public level: Level, private host: HTMLElement) {
    this.code = level.code;
    const saved0 = loadWork(level.id);
    const saved = saved0 && (saved0.rev ?? 1) === (level.rev ?? 1) ? saved0 : null; // livello rifatto: si riparte da capo
    if (saved) {
      this.parts = (saved.parts || []).filter(p => PARTS[p.type]);
      const ids = new Set(this.parts.map(p => p.id));
      this.wires = (saved.wires || []).filter(w => ids.has(w.a.split(':')[0]) && ids.has(w.b.split(':')[0]));
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
      error: (m, d) => { this.runError = { id: 'run-error', level: 'error', title: this.running ? 'Il programma si è fermato' : 'C\'è un errore nel codice', text: m, refs: [] }; if (d) console.warn('[programma]', d); this.setRunning(false); this.renderIssues(); },
      issue: i => { if (!this.runtimeIssues.some(x => x.id === i.id)) { this.runtimeIssues.push(i); this.issueIdx = 0; this.renderIssues(); } },
    });
    this.rt = new MicrobitRuntime(this.hw);
    this.rt.bus = this.bus;
    this.root = this.render();
    host.replaceChildren(this.root);
    this.editor = new CodeEditor(this.root.querySelector('.mk-host')!);
    this.setupEditor();
    this.setupScene();
    this.sync();
    this.setMode(this.mode, false);
    window.addEventListener('keydown', this.onKey);
    (window as any).__mcl = this.testApi();
    if (this.level.steps.length) setTimeout(() => this.openStepPop(false), 400);
    // la manina: riparte da zero ogni volta che il bambino tocca qualcosa
    const awake = () => { this.idleAt = performance.now(); if (this.hand.active) this.hand.hide(); };
    this.root.addEventListener('pointerdown', awake, true);
    this.root.addEventListener('keydown', awake, true);
    this.tickTimer = window.setInterval(() => this.tick(), 500);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    this.closeBuzz();
    this.hunt?.close();
    this.stopFriends();
    this.rt.stop();
    stopSpeaking();
    clearInterval(this.tickTimer);
    this.hand.dispose();
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
            <div class="sel-tools" hidden></div>
            <div class="term-choose" hidden role="dialog" aria-label="Quale volevi toccare?"></div>
            <div class="ctx-menu" role="menu" hidden></div>
            <div class="view-btns">
              <button class="round" data-act="undo" aria-label="Annulla l'ultima mossa">${icon('ph:arrow-counter-clockwise-bold', 26)}</button>
              <button class="round round-home" data-act="fit" aria-label="Torna a vedere tutto">${icon('ph:house-fill', 26)}</button>
              <button class="round" data-act="view" aria-label="Gira la vista">${icon('ph:arrow-clockwise-bold', 26)}</button>
              <button class="round" data-act="zin" aria-label="Avvicina">${icon('ph:magnifying-glass-plus-bold', 26)}</button>
              <button class="round" data-act="zout" aria-label="Allontana">${icon('ph:magnifying-glass-minus-bold', 26)}</button>
            </div>
            <div class="sensors" hidden>
              <button class="sensors-title" data-act="sensors" aria-expanded="false">${icon('ph:hand-tap-fill', 20)}Prova i sensori</button>
              <label>${icon('ph:sun-fill', 20)}Luce<input type="range" min="0" max="255" value="128" data-sensor="light"></label>
              <label>${icon('ph:thermometer-fill', 20)}Caldo<input type="range" min="-5" max="45" value="21" data-sensor="temperature"></label>
              <label>${icon('ph:speaker-high-fill', 20)}Rumore<input type="range" min="0" max="255" value="40" data-sensor="sound"></label>
              <button class="btn btn-small" data-act="shake">${icon('ph:vibrate-fill', 18)}Scuoti</button>
            </div>
          </div>
          <div class="issue-bar" hidden></div>
        </main>
        <aside class="guide" aria-label="Guida del progetto"></aside>
        <div class="step-pop" hidden></div>
        <section class="code-panel" aria-label="Programma">
          <div class="code-head">
            <div class="code-step"></div>
            <div class="code-actions">
              <button class="btn btn-soft" data-act="download" aria-label="Manda al micro:bit vero">${icon('ph:usb-fill', 22)}<span class="hide-xs">Manda al micro:bit vero</span></button>
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
      const wc = (e.target as HTMLElement).closest('[data-wcolor]') as HTMLElement | null;
      if (wc) { this.recolorWire(wc.dataset.wcolor!); return; }
      const t = (e.target as HTMLElement).closest('[data-act],[data-mode]') as HTMLElement | null;
      if (!t) { if (!(e.target as HTMLElement).closest('.ctx-menu')) this.hideCtx(); return; }
      if (t.closest('.ctx-menu')) this.hideCtx();
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
    this.q('.palette').classList.toggle('few', this.level.palette.length <= 12);
    for (const c of this.root.querySelectorAll<HTMLElement>('.chip-btn')) c.classList.toggle('on', c.dataset.cat === this.category);
    const order = PALETTE_ORDER.filter(t => this.level.palette.includes(t) && (this.category === 'tutti' || PARTS[t].category === this.category));
    for (const t of order) {
      const p = PARTS[t];
      const cat = CATEGORIES.find(c => c.id === p.category)!;
      const b = el(`<div class="part${mountsOf(t).includes('testPad') ? ' part-live' : ''}" role="button" tabindex="0" draggable="${!p.tool}" data-type="${t}" style="--bd:${cat.bd};--bg:${cat.bg}">
        ${img(p.icon, 46, '')}<span class="part-name">${esc(p.name)}</span>${p.safety ? safetyTag(p.safety) : ''}
        <button class="part-info" aria-label="Cos'è ${esc(p.name)}?">${icon('ph:question-fill', 18)}</button>
      </div>`);
      b.addEventListener('dragstart', e => { e.dataTransfer!.setData('text/x-part', t); e.dataTransfer!.effectAllowed = 'copy'; });
      b.addEventListener('click', e => {
        if ((e.target as HTMLElement).closest('.part-info') || p.tool) { openCard(t); return; }
        this.addPart(t);
      });
      b.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if ((e.target as HTMLElement).closest('.part-info') || p.tool) openCard(t); else this.addPart(t);
      });
      grid.appendChild(b);
    }
  }

  private renderWireColors() {
    for (const s of this.root.querySelectorAll<HTMLElement>('.swatch')) s.classList.toggle('on', s.dataset.color === this.wireColor);
  }

  // ---------- scena ----------

  private setupScene() {
    this.scene = new Scene3D(this.q('.canvas-wrap'), {
      onMove: (moves, attachTo) => {
        this.pushUndo();
        let attachedNow: PartInst | null = null;
        for (const m of moves) {
          const p = this.parts.find(p => p.id === m.id);
          if (!p) continue;
          const was = p.attachedTo;
          p.x = m.x; p.z = m.z;
          p.attachedTo = moves.length === 1 ? attachTo || undefined : undefined;
          if (p.attachedTo !== was) this.markRest(p);
          if (p.attachedTo && !was) attachedNow = p;
          // lasciato sopra un altro pezzo senza attaccarsi: scivola accanto, così non sparisce dentro
          if (!p.attachedTo && moves.length === 1 && this.overlaps(p, p.x, p.z)) {
            const free = this.nearestFree(p);
            if (free) { p.x = free.x; p.z = free.z; toast(`${icon('ph:info-fill', 20)}Lì c'è già un altro pezzo: l'ho messo accanto.`, { ms: 2600 }); }
          }
        }
        if (attachedNow) toast(this.attachMsg(attachedNow), { kind: 'ok', ms: 4500 });
        this.sync();
        // attaccato in alto (servo sul cartone del latte): se esce dalla vista, la vista si allarga
        if (attachedNow && this.parts.some(p => p.type === 'milkCarton') && !this.scene.isVisible(attachedNow.id)) this.frame();
      },
      onSelect: (ids, wire) => { this.selIds = ids; this.selWire = wire; this.hideCtx(); this.renderSelTools(); },
      onTerminal: ref => { this.closeChoose(); if (this.selIds.length || this.selWire) this.scene.setSelection([], null); this.clickTerminal(ref); },
      onChoose: (refs, x, y) => this.openChoose(refs, x, y),
      onWireEnd: (id, end, ref) => this.moveWireEnd(id, end, ref),
      onContext: (kind, id, x, y) => this.openCtx(kind, id, x, y),
      onButton: (b, down, mbId) => {
        const fr = mbId ? this.friends.get(mbId) : undefined;
        (fr ?? this.rt).pressButton(b, down);
        const ids = fr || (mbId && this.friends.size) ? [mbId!] : this.parts.filter(p => p.type === 'microbit' && !this.friends.has(p.id)).map(p => p.id);
        for (const id of ids) this.scene.setButtonPressed(id, b, down);
      },
      onLogo: down => this.rt.touchLogo(down),
      onPad: (pin, down) => this.rt.touchPin(pin, down),
      onFoil: (id, down) => this.touchFoil(id, down),
      onFrame: dt => { this.hw.step(dt); this.catapultFrame(dt); if (this.selIds.length || this.selWire) this.positionSelTools(); },
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

  /** I bottoni che compaiono sopra a ciò che hai selezionato (pezzi o un cavo). */
  private renderSelTools() {
    const tools = this.q('.sel-tools');
    tools.innerHTML = this.selWire ? this.wireActions() : this.selIds.length ? this.partActions() : '';
    this.positionSelTools();
  }

  private partActions(menu = false) {
    const parts = this.selIds.map(id => this.parts.find(p => p.id === id)).filter(Boolean) as PartInst[];
    if (!parts.length) return '';
    const one = parts.length === 1 ? parts[0] : null;
    const cls = menu ? 'ctx-item' : 'btn btn-small';
    const b = (act: string, ic: string, label: string, extra = '') => `<button class="${cls} ${extra}" data-act="${act}" role="${menu ? 'menuitem' : ''}">${icon(ic, 18)}${label}${menu && KEYS[act] ? `<kbd>${KEYS[act]}</kbd>` : ''}</button>`;
    const loose = parts.some(p => !p.attachedTo);
    return [
      menu && parts.length > 1 ? `<div class="ctx-title">${parts.length} pezzi selezionati</div>` : '',
      loose ? b('rotate', 'ph:arrow-clockwise-bold', 'Gira') : '',
      one && TILTABLE.has(one.type) && !one.attachedTo ? b('tilt', 'ph:cube-fill', one.tilt ? 'Alza' : 'Sdraia') : '',
      one?.attachedTo ? b('detach', 'ph:arrow-u-up-left-bold', 'Stacca dal servo') : '',
      b('duplicate', 'ph:sparkle-fill', 'Duplica'),
      one ? b('info', 'ph:question-fill', "Cos'è?") : '',
      b('delete', 'ph:trash-fill', 'Togli', 'btn-danger'),
    ].join('');
  }

  private wireActions(menu = false) {
    const w = this.wires.find(x => x.id === this.selWire);
    if (!w) return '';
    const power = w.a.endsWith(':PLUG') || w.b.endsWith(':PLUG');
    const sw = power ? '' : `<div class="ctx-swatches">${WIRE_COLORS.map(c => `<button class="swatch swatch-s ${c.id === w.color ? 'on' : ''}" data-wcolor="${c.id}" aria-label="Cavo ${c.name}" style="background:${c.hex}"></button>`).join('')}</div>`;
    const cls = menu ? 'ctx-item btn-danger' : 'btn btn-small btn-danger';
    return `${menu ? `<div class="ctx-title">${power ? 'Cavo delle pile' : 'Cavo a coccodrillo'}</div>` : ''}${sw}<button class="${cls}" data-act="delete" role="${menu ? 'menuitem' : ''}">${icon('ph:trash-fill', 18)}Togli${menu ? '<kbd>Canc</kbd>' : ''}</button>`;
  }

  private positionSelTools() {
    const tools = this.q('.sel-tools');
    if ((!this.selIds.length && !this.selWire) || this.running || this.mode === 'code' || !tools.innerHTML || !this.q('.ctx-menu').hidden) { tools.hidden = true; return; }
    const s = this.scene.selectionAnchor();
    if (!s) { tools.hidden = true; return; }
    tools.hidden = false;
    const wrap = this.q('.canvas-wrap').getBoundingClientRect();
    const half = tools.offsetWidth / 2;
    tools.style.left = Math.round(Math.max(half + 6, Math.min(wrap.width - half - 6, s.x))) + 'px';
    // sopra o sotto il pezzo: dove c'è posto e dove non copre né lui né gli altri pezzi
    const th = tools.offsetHeight, cx = parseFloat(tools.style.left);
    const others = this.parts.filter(p => !p.attachedTo).map(p => { const c = this.scene.tableClient(p.x, p.z); return { x: c.x - wrap.left, y: c.y - wrap.top }; });
    const cost = (top: number) => (top < 8 || top + th > wrap.height - 8 ? 100 : 0) + others.filter(o => Math.abs(o.x - cx) < half + 16 && o.y > top - 22 && o.y < top + th + 22).length;
    const above = Math.round(s.y) - th - 10, below = s.below !== undefined ? Math.round(s.below + 12) : above;
    tools.style.top = Math.max(8, Math.min(wrap.height - th - 8, cost(below) < cost(above) ? below : above)) + 'px';
  }

  private openCtx(kind: 'part' | 'wire' | 'none', _id: string | null, x: number, y: number) {
    const menu = this.q('.ctx-menu');
    let html = '';
    if (kind === 'part') html = this.partActions(true);
    else if (kind === 'wire') html = this.wireActions(true);
    else html = `<button class="ctx-item" data-act="fit" role="menuitem">${icon('ph:cube-fill', 18)}Guarda tutto il banco</button>
      <button class="ctx-item" data-act="undo" role="menuitem">${icon('ph:arrow-counter-clockwise-bold', 18)}Annulla<kbd>Ctrl+Z</kbd></button>
      <button class="ctx-item" data-act="redo" role="menuitem">${icon('ph:arrow-clockwise-bold', 18)}Ripeti<kbd>Ctrl+Y</kbd></button>`;
    if (!html) return;
    menu.innerHTML = html;
    menu.hidden = false;
    const wrap = this.q('.canvas-wrap').getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x - wrap.left, wrap.width - mw - 6) + 'px';
    menu.style.top = Math.min(y - wrap.top, wrap.height - mh - 6) + 'px';
    this.q('.sel-tools').hidden = true;
    (menu.querySelector('button') as HTMLElement | null)?.focus();
  }

  private hideCtx() { const m = this.root.querySelector<HTMLElement>('.ctx-menu'); if (m) m.hidden = true; }

  // ---------- azioni ----------

  private action(a: string) {
    switch (a) {
      case 'run': this.running ? this.stopRun() : this.run(); break;
      case 'undo': this.undo(); break;
      case 'view': this.scene.rotateView(); break;
      case 'fit': this.frame(); break;
      case 'zin': this.scene.zoom(0.8); break;
      case 'zout': this.scene.zoom(1.25); break;
      case 'rotate': this.rotateSel(); break;
      case 'tilt': this.tiltSel(); break;
      case 'detach': this.detachSel(); break;
      case 'duplicate': this.duplicateSel(); break;
      case 'info': { const p = this.parts.find(x => x.id === this.selected); if (p) openCard(p.type); break; }
      case 'delete': this.deleteSel(); break;
      case 'redo': this.redo(); break;
      case 'step-ok': this.closeStepPop(); break;
      case 'step-open': this.openStepPop(true); break;
      case 'shake': this.rt.gesture('Shake'); break;
      case 'sensors': { const b = this.q('.sensors'); const open = !b.classList.contains('open'); b.classList.toggle('open', open); this.q('.sensors-title').setAttribute('aria-expanded', String(open)); break; }
      case 'download': void this.download(); break;
      case 'usecode': {
        const ta = this.q<HTMLTextAreaElement>('.mk-offline textarea');
        this.setCode(ta.value);
        toast(`${icon('ph:check-bold', 20)}Codice pronto. Premi Prova!`, { kind: 'ok' });
        break;
      }
      case 'prev': this.goStep(this.step - 1); break;
      case 'next': this.goStep(this.step + 1); break;
      case 'listen': { const s = this.level.steps[this.step]; if (s) speak(`${s.title}. ${this.stepText()}`); break; }
      case 'autoread': { const on = !getAutoRead(); setAutoRead(on); if (!on) stopSpeaking(); else this.readStep(); this.renderGuide(); if (!this.q('.step-pop').hidden) this.openStepPop(true); break; }
      case 'show-issue': this.showIssue(); break;
      case 'listen-issue': { const i = this.shown[this.issueIdx]; if (i) speak(`${i.title}. ${i.text}`); break; }
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
    if (this.selIds.length || this.selWire) this.scene.setSelection([], null);
    this.scene.setMode(m);
    this.q('.wire-colors').hidden = m !== 'wire' || this.running;
    this.positionSelTools();
    this.renderHint();
    this.q('.tip').hidden = true;
    this.closeChoose();
    requestAnimationFrame(() => { this.scene.resize(); this.frame(this.framedOnce); this.framedOnce = true; });
    if (user) this.evaluate();
  }

  addPart(type: string, x?: number, z?: number) {
    const def = PARTS[type];
    if (!def || def.tool) { openCard(type); return; }
    if (this.running && !mountsOf(type).includes('testPad')) { toast('Prima ferma la prova, poi aggiungi i pezzi.'); return; }
    const maxMb = /radio\./.test(this.code) || this.level.id === 'libero' ? 2 : 1;
    if (type === 'microbit' && this.parts.filter(p => p.type === 'microbit').length >= maxMb) { toast(maxMb === 1 ? 'Il micro:bit c\'è già: per questi progetti ne basta uno.' : 'Ci sono già due micro:bit: il tuo e quello dell\'amico.'); return; }
    this.pushUndo();
    const pos = x === undefined ? this.freeSpot(type) : { x, z: z! };
    const id = newId(type);
    this.parts.push({ id, type, x: pos.x, z: pos.z, rot: 0 });
    if (this.mode !== 'build') this.setMode('build', false);
    this.sync();
    this.scene.setSelection([id], null);
    if (!this.scene.isVisible(id) || this.covered_(pos.x, pos.z)) this.frame();
  }

  private framedOnce = false;
  private hasTerminals(p: PartInst): boolean { return PARTS[p.type].terminals.length > 0 || this.parts.some(c => c.attachedTo === p.id && this.hasTerminals(c)); }
  /** Inquadra quello che serve adesso: in Collega solo i pezzi con i cerchietti, più da vicino. */
  private frame(smooth = true) {
    if (!this.scene) return;
    // quanto banco coprono i pulsanti ai lati e il suggerimento in alto
    const wrap = this.q('.canvas-wrap').getBoundingClientRect();
    const vis = (sel: string) => { const e = this.root.querySelector<HTMLElement>(sel); const r = e && !e.hidden ? e.getBoundingClientRect() : null; return r && r.width ? r : null; };
    const col = vis('.wire-colors'), vb = vis('.view-btns'), hint = vis('.hint');
    const side = vb && vb.height > vb.width;
    const pad = {
      x: 16 + 2 * Math.max(col ? col.right - wrap.left : 0, vb && side ? wrap.right - vb.left : 0),
      y: 16 + (hint ? hint.bottom - wrap.top : 0) + (vb && !side ? wrap.bottom - vb.top : 0),
    };
    if (this.mode === 'wire' && !this.running) {
      const roots = this.parts.filter(p => !p.attachedTo && this.hasTerminals(p));
      if (roots.length) { this.scene.fit(roots, { smooth, tight: true, pad }); return; }
    }
    this.scene.fit(this.parts, { smooth, pad });
  }

  /** Un punto del banco è coperto dai pulsanti sopra il banco, o è fuori dallo schermo? */
  private covered_(x: number, z: number) {
    const wrap = this.q('.canvas-wrap').getBoundingClientRect();
    if (wrap.width < 50) return false;
    const c = this.scene.tableClient(x, z);
    const m = 34;
    if (c.x < wrap.left + m || c.x > wrap.right - m || c.y < wrap.top + m || c.y > wrap.bottom - m) return true;
    for (const sel of ['.view-btns', '.wire-colors', '.hint', '.sensors']) {
      const e = this.root.querySelector<HTMLElement>(sel);
      if (!e || e.hidden) continue;
      const r = e.getBoundingClientRect();
      if (r.width && c.x > r.left - m && c.x < r.right + m && c.y > r.top - m && c.y < r.bottom + m) return true;
    }
    return false;
  }

  /** L'ingombro sul banco (mezzi lati), tenendo conto di come è girato. */
  private half(p: PartInst) {
    const [w, , d] = PARTS[p.type].size;
    const r = (p.rot || 0) % 4;
    return r === 0 ? { hw: w / 2, hd: d / 2 } : r === 2 ? { hw: d / 2, hd: w / 2 } : { hw: Math.max(w, d) / 2, hd: Math.max(w, d) / 2 };
  }
  /** Il pezzo `p`, messo in (x, z), finisce dentro un altro pezzo? I materiali leggeri possono stare uno sull'altro. */
  private overlaps(p: PartInst, x: number, z: number, gap = -0.6) {
    const a = this.half(p);
    return this.parts.some(o => {
      if (o.id === p.id || o.attachedTo || (LOOSE.has(p.type) && LOOSE.has(o.type))) return false;
      const b = this.half(o);
      return Math.abs(o.x - x) < a.hw + b.hw + gap && Math.abs(o.z - z) < a.hd + b.hd + gap;
    });
  }
  /** Il posto libero più vicino a dove hai lasciato il pezzo. */
  private nearestFree(p: PartInst) {
    for (let r = 1; r <= 40; r += 1) for (let k = 0; k < 16; k++) {
      const an = (k / 16) * Math.PI * 2;
      const x = Math.round((p.x + Math.cos(an) * r) * 10) / 10, z = Math.round((p.z + Math.sin(an) * r) * 10) / 10;
      if (Math.abs(x) > 39 || Math.abs(z) > 24) continue;
      if (!this.overlaps(p, x, z, 0.4)) return { x, z };
    }
    return null;
  }

  /** Dove mettere un pezzo nuovo: in un posto libero, che si vede e che non sta sotto i pulsanti. */
  private freeSpot(type: string) {
    const ghost: PartInst = { id: '', type, x: 0, z: 0, rot: 0 };
    const cand: { x: number; z: number }[] = [];
    for (let zz = 2; zz >= -18; zz -= 5) for (let xx = 0; xx <= 34; xx += 5) { cand.push({ x: xx, z: zz }, { x: -xx, z: zz }); }
    for (let xx = 0; xx <= 34; xx += 6) cand.push({ x: xx, z: 9 }, { x: -xx, z: 9 }, { x: xx, z: 16 }, { x: -xx, z: 16 });
    const free = cand.filter(c => !this.overlaps(ghost, c.x, c.z, 1.2));
    if (this.scene) {
      // tra i posti che si vedono, il più vicino al centro di quello che stai guardando
      const wrap = this.q('.canvas-wrap').getBoundingClientRect();
      const mid = this.scene.tableAt(wrap.left + wrap.width / 2, wrap.top + wrap.height * 0.55);
      const seen = free.filter(c => !this.covered_(c.x, c.z));
      // ...ma non davanti o dietro a un pezzo alto: da dove guardi, uno coprirebbe l'altro
      const g = this.half(ghost), gh = PARTS[type].size[1];
      const hides = (c: { x: number; z: number }) => this.parts.some(o => {
        if (o.attachedTo) return false;
        const h = this.half(o), oh = PARTS[o.type].size[1];
        if (Math.abs(o.x - c.x) >= g.hw + h.hw) return false;
        const dz = c.z - o.z, reach = g.hd + h.hd;
        return dz > 0 ? gh > 3 && dz < gh * 1.2 + reach : oh > 3 && -dz < oh * 1.2 + reach;
      });
      const score = (c: { x: number; z: number }) => Math.hypot(c.x - mid!.x, c.z - mid!.z) + (hides(c) ? 1000 : 0);
      if (seen.length && mid) return seen.sort((a, b) => score(a) - score(b))[0];
    }
    return free[0] ?? { x: 0, z: 0 };
  }

  // ---------- "Quale volevi toccare?" (con il dito due cerchietti vicini si confondono) ----------
  private openChoose(refs: string[], cx: number, cy: number) {
    const box = this.q('.term-choose');
    const wrap = this.q('.canvas-wrap').getBoundingClientRect();
    const btn = (ref: string) => {
      const [pid, tid] = ref.split(':');
      const part = this.parts.find(x => x.id === pid);
      const t = part && PARTS[part.type].terminals.find(t => t.id === tid);
      const sw = t?.color ? `<span class="sw" style="background:${t.color}"></span>` : `<span class="sw sw-pad"></span>`;
      return `<button class="btn tc-btn" data-ref="${esc(ref)}">${sw}${esc(t?.label ?? tid)}</button>`;
    };
    // nell'ordine in cui stanno sul pezzo (pin 0, pin 1, pin 2...), non in ordine di distanza
    const ord = (ref: string) => { const [pid, tid] = ref.split(':'); const part = this.parts.find(x => x.id === pid); return (part ? this.parts.indexOf(part) : 0) * 100 + (part ? PARTS[part.type].terminals.findIndex(t => t.id === tid) : 0); };
    refs = [...refs].sort((a, b) => ord(a) - ord(b));
    box.innerHTML = `<b>Quale?</b>${refs.slice(0, 4).map(btn).join('')}<button class="icon-btn tc-x" aria-label="Chiudi">${icon('ph:x-bold', 18)}</button>`;
    box.hidden = false;
    const w = box.offsetWidth, h = box.offsetHeight;
    const x = Math.max(8, Math.min(wrap.width - w - 8, cx - wrap.left - w / 2));
    const above = cy - wrap.top - h - 34;
    box.style.left = Math.round(x) + 'px';
    box.style.top = Math.round(above > 8 ? above : Math.min(wrap.height - h - 8, cy - wrap.top + 34)) + 'px';
    this.scene.highlight(refs);
    box.querySelector('.tc-x')!.addEventListener('click', () => this.closeChoose());
    for (const b of box.querySelectorAll<HTMLElement>('.tc-btn')) b.addEventListener('click', () => {
      const ref = b.dataset.ref!;
      this.closeChoose();
      if (this.selIds.length || this.selWire) this.scene.setSelection([], null);
      this.clickTerminal(ref);
    });
  }
  private closeChoose() {
    const box = this.root.querySelector<HTMLElement>('.term-choose');
    if (!box || box.hidden) return;
    box.hidden = true;
    this.scene?.highlight([]);
  }

  private deleteSel() {
    if (this.running) { toast('Prima ferma la prova.'); return; }
    if (this.selWire) { this.removeWire(this.selWire); return; }
    if (!this.selIds.length) return;
    this.pushUndo();
    const del = new Set(this.selIds);
    // i materiali attaccati a un servo tolto restano sul banco
    for (const p of this.parts) if (p.attachedTo && del.has(p.attachedTo) && !del.has(p.id)) {
      const host = this.parts.find(h => h.id === p.attachedTo)!;
      p.attachedTo = undefined; delete p.rest; p.x = host.x + 4; p.z = host.z;
    }
    this.parts = this.parts.filter(p => !del.has(p.id));
    this.wires = this.wires.filter(w => !del.has(w.a.split(':')[0]) && !del.has(w.b.split(':')[0]));
    const n = del.size;
    this.scene.setSelection([], null);
    this.sync();
    toast(`${icon('ph:trash-fill', 20)}${n === 1 ? 'Pezzo tolto.' : `${n} pezzi tolti.`}`, { action: 'Rimettili', onAction: () => this.undo() });
  }

  private rotateSel() {
    const list = this.selIds.map(id => this.parts.find(x => x.id === id)).filter(p => p && !p.attachedTo) as PartInst[];
    if (!list.length || this.running) return;
    this.pushUndo();
    for (const p of list) p.rot = ((p.rot || 0) + 1) % 8;
    this.sync();
  }

  private tiltSel() {
    const p = this.parts.find(x => x.id === this.selected);
    if (!p || p.attachedTo || !TILTABLE.has(p.type) || this.running) return;
    this.pushUndo();
    p.tilt = p.tilt ? 0 : 1;
    this.sync();
  }

  private detachSel() {
    const p = this.parts.find(x => x.id === this.selected);
    if (!p?.attachedTo || this.running) return;
    this.pushUndo();
    const host = this.parts.find(h => h.id === p.attachedTo);
    p.attachedTo = undefined;
    delete p.rest;
    if (host) { p.x = host.x + 5; p.z = host.z + 3; }
    this.sync();
  }

  private duplicateSel() {
    if (this.running) return;
    const list = this.selIds.map(id => this.parts.find(x => x.id === id)).filter(Boolean) as PartInst[];
    const copyable = list.filter(p => p.type !== 'microbit');
    if (!copyable.length) { toast('Il micro:bit c\'è già: per questi progetti ne basta uno.'); return; }
    this.pushUndo();
    const ids: string[] = [];
    for (const p of copyable) {
      const host = p.attachedTo ? this.parts.find(h => h.id === p.attachedTo) : null;
      const id = newId(p.type);
      this.parts.push({ id, type: p.type, x: Math.min(38, (host?.x ?? p.x) + 6), z: Math.min(24, (host?.z ?? p.z) + 4), rot: p.rot || 0, tilt: p.tilt });
      ids.push(id);
    }
    if (copyable.length < list.length) toast('Il micro:bit non si duplica: ne basta uno.');
    this.sync();
    this.scene.setSelection(ids, null);
    if (ids.some(id => !this.scene.isVisible(id))) this.scene.fit(this.parts);
  }

  private recolorWire(color: string) {
    const w = this.wires.find(x => x.id === this.selWire);
    if (!w || this.running || w.color === color) return;
    this.pushUndo();
    w.color = color;
    this.sync();
    this.scene.setSelection([], w.id, false);
    this.renderSelTools();
  }

  /** Hai preso la pinza di un cavo e l'hai portata su un altro punto. */
  private moveWireEnd(id: string, end: 'a' | 'b', ref: string | null) {
    const w = this.wires.find(x => x.id === id);
    if (!w || this.running) return;
    this.pending = null;
    this.scene.setPending(null);
    this.renderHint();
    const fixed = end === 'a' ? w.b : w.a;
    const old = end === 'a' ? w.a : w.b;
    if (!ref || ref === old) { if (!ref) toast('Porta la pinza sopra un cerchietto per collegarla.'); return; }
    const err = canConnect(this.parts, this.wires.filter(x => x.id !== id), fixed, ref);
    if (err) { toast(`${icon('ph:warning-fill', 20)}${esc(err)}`, { kind: 'warn' }); tone(220, 120); return; }
    this.pushUndo();
    if (end === 'a') w.a = ref; else w.b = ref;
    tone(1175, 60);
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
    this.scene.setSelection([], null);
    this.sync();
    toast(`${icon('ph:trash-fill', 20)}Cavo tolto.`, { action: 'Rimettilo', onAction: () => this.undo() });
  }

  private redoStack: string[] = [];
  private snap() { return JSON.stringify({ parts: this.parts, wires: this.wires }); }
  private pushUndo() {
    this.undoStack.push(this.snap());
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.running) { toast('Prima ferma la prova, poi puoi annullare.'); return; }
    const s = this.undoStack.pop();
    if (!s) { toast('Non c\'è niente da annullare.'); return; }
    this.redoStack.push(this.snap());
    const v = JSON.parse(s);
    this.parts = v.parts;
    this.wires = v.wires;
    this.scene.setSelection([], null);
    this.sync();
  }

  redo() {
    if (this.running) { toast('Prima ferma la prova.'); return; }
    const s = this.redoStack.pop();
    if (!s) { toast('Non c\'è niente da ripetere.'); return; }
    this.undoStack.push(this.snap());
    const v = JSON.parse(s);
    this.parts = v.parts;
    this.wires = v.wires;
    this.scene.setSelection([], null);
    this.sync();
  }

  /** Tasti rapidi come nei programmi di disegno. */
  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (document.querySelector('.modal-back')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.buzz?.root.isConnected) { this.closeBuzz(); return; }
      if (this.hunt?.isOpen()) { this.hunt.close(); return; }
      if (!this.q('.step-pop').hidden) { this.closeStepPop(); return; }
      this.hideCtx(); this.pending = null; this.scene.setPending(null); this.renderHint(); this.scene.setSelection([], null); return;
    }
    if (this.mode === 'code') return;
    if (k === 'delete' || k === 'backspace') { if (this.selIds.length || this.selWire) { e.preventDefault(); this.deleteSel(); } return; }
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); return; }
    if (ctrl && k === 'd') { e.preventDefault(); this.duplicateSel(); return; }
    if (ctrl && k === 'a') { e.preventDefault(); this.scene.setSelection(this.parts.filter(p => !p.attachedTo).map(p => p.id), null); return; }
    if (!ctrl && k === 'r') { this.rotateSel(); return; }
  };

  private restart() {
    const m = modal(`<h2>Ricominciare il progetto?</h2><p class="lead">Il banco torna come all'inizio e il codice torna quello del livello.</p>
      <div class="row"><button class="btn btn-danger" data-x="yes">${icon('ph:arrow-counter-clockwise-bold', 20)}Sì, ricomincia</button><button class="btn" data-x="no">No</button></div>`);
    m.root.querySelector('[data-x=no]')!.addEventListener('click', m.close);
    m.root.querySelector('[data-x=yes]')!.addEventListener('click', () => {
      m.close();
      this.stopRun();
      this.tested = {};
      this.game = { touches: 0, finished: false, played: false, throws: 0, hits: 0 };
      this.cata.clear(); this.bands = 2;
      clearWork(this.level.id);
      this.parts = structuredClone(this.level.start.parts);
      this.wires = structuredClone(this.level.start.wires);
      this.doneSteps.clear();
      this.step = 0;
      this.finished = false;
      this.codeChanged = false;
      this.ranChanged = false;
      this.mkProject = null;
      this.undoStack = [];
      this.redoStack = [];
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
    const ta = this.root.querySelector<HTMLTextAreaElement>('.mk-offline textarea');
    if (ta && document.activeElement !== ta) ta.value = ts;
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
    this.game.finished = false; // ogni prova nuova: il gioco (filo, tesoro, catapulta) si rifà da capo
    this.game.throws = 0; this.game.hits = 0;
    this.scene.clearBalls();
    this.startFriends();
    if (this.codeChanged) this.ranChanged = true;
    this.runEpoch = this.stepEpoch;
    this.runCode = this.code;
    this.setRunning(true);
    this.renderIssues();
  }

  stopRun() {
    this.rt.stop();
    this.setRunning(false);
  }

  // ---------- radio: il micro:bit dell'amico ----------
  friends = new Map<string, MicrobitRuntime>();
  hunt: HuntGame | null = null;
  /** Forza del segnale tra due micro:bit: nel gioco della caccia dalla mappa, altrimenti dalla distanza sul banco. */
  private signal(from: string, to: string): number {
    if (this.hunt?.isOpen()) return this.hunt.strength(from, to);
    const a = this.parts.find(p => p.id === from), b = this.parts.find(p => p.id === to);
    if (!a || !b) return -128;
    const pos = (p: PartInst) => { const h = p.attachedTo ? this.parts.find(x => x.id === p.attachedTo) : null; return h ? h : p; };
    const d = Math.hypot(pos(a).x - pos(b).x, pos(a).z - pos(b).z);
    return d > 60 ? -128 : -42 - 53 * Math.max(0, Math.min(1, (d - 4) / 56));
  }
  private rtId(r: MicrobitRuntime) { return r === this.rt ? this.hw.mbId : [...this.friends].find(([, x]) => x === r)?.[0] ?? null; }
  bus: RadioBus = {
    send: (from, p) => {
      const fromId = this.rtId(from);
      if (!fromId) return;
      const all: [string, MicrobitRuntime][] = [...(this.hw.mbId ? [[this.hw.mbId, this.rt] as [string, MicrobitRuntime]] : []), ...this.friends];
      for (const [id, r] of all) {
        if (r === from) continue;
        const s = this.signal(fromId, id);
        if (s < -95) continue; // troppo lontano: non arriva
        setTimeout(() => r.receive(p, s), 8);
      }
    },
  };
  /** Gli altri micro:bit accesi fanno girare lo stesso programma (come quando l'amico carica il tuo codice). */
  private startFriends() {
    this.stopFriends();
    if (!/radio\./.test(this.code)) return;
    for (const mb of this.parts.filter(p => p.type === 'microbit' && p.id !== this.hw.mbId && this.analysis.powered.has(p.id))) {
      const id = mb.id;
      const br: Bridge = {
        display: l => this.scene.setDisplay(id, l),
        digitalWrite: () => {}, analogWrite: () => {}, servoWrite: () => {},
        digitalRead: () => 0, analogRead: () => 0,
        tone: (f, ms) => tone(f, ms), log: () => {},
        error: m => toast(`${icon('ph:warning-fill', 20)}Il micro:bit dell'amico: ${esc(m)}`, { kind: 'warn' }),
      };
      const r = new MicrobitRuntime(br);
      r.bus = this.bus;
      if (r.start(this.code) === null) this.friends.set(id, r);
    }
  }
  /** Caccia al tesoro: il tesoro è il micro:bit che mostra il rombo, il cercatore è l'altro. */
  openHunt() {
    if (!this.running) return;
    const all: [string, MicrobitRuntime][] = [...(this.hw.mbId ? [[this.hw.mbId, this.rt] as [string, MicrobitRuntime]] : []), ...this.friends];
    const t = all.find(([, r]) => r.stats.iconsShown.has('Diamond'));
    const sk = all.find(([id]) => id !== t?.[0]);
    if (!t || !sk) { toast(`${icon('ph:info-fill', 20)}Prima premi A sul micro:bit che fa da tesoro: mostra il rombo.`, { kind: 'warn', ms: 4000 }); return; }
    const seeker = sk[1];
    this.hunt?.close();
    this.hunt = new HuntGame(t[0], sk[0], {
      seekerLeds: () => seeker.leds,
      seekerIcon: () => seeker.lastIcon,
      onFinish: () => { this.game.finished = true; toast(`${img('trophy.svg', 26)}Tesoro trovato! Il segnale radio ti ha portato fin lì.`, { kind: 'ok', ms: 3500 }); this.evaluate(); },
    });
    this.game.played = true;
    this.game.finished = false;
    this.hunt.show(document.body);
  }

  private stopFriends() {
    for (const [id, r] of this.friends) { r.stop(); this.scene?.setDisplay(id, new Uint8Array(25)); }
    this.friends.clear();
  }

  /** Spago o fermo legato al braccio del servo: ricorda a che angolo era il servo (è la calibrazione). */
  private markRest(p: PartInst) {
    const host = p.attachedTo ? this.parts.find(h => h.id === p.attachedTo) : null;
    if (host?.type === 'servo') p.rest = Math.round(this.hw.servoAngle.get(host.id) ?? 90);
    else delete p.rest;
  }

  // ---------- la catapulta ----------
  // Il servo non lancia: è il grilletto. Il fermo sul suo braccio tiene giù la catapulta carica;
  // quando il servo gira abbastanza, il fermo si sposta e l'elastico fa scattare il braccio.
  private cata = new Map<string, { loaded: boolean; deg: number; firing: boolean; told: boolean }>();
  private cataParts(base: PartInst) {
    const servo = this.parts.find(p => p.type === 'servo' && p.attachedTo === base.id);
    const latch = servo && this.parts.find(p => p.type === 'catapultLatch' && p.attachedTo === servo.id);
    return { servo, latch };
  }
  /** Il fermo è sopra il braccio? (entro 35° da dove l'hai montato) */
  private latchClosed(base: PartInst) {
    const { servo, latch } = this.cataParts(base);
    if (!servo || !latch) return false;
    return Math.abs((this.hw.servoAngle.get(servo.id) ?? 90) - (latch.rest ?? 90)) < 35;
  }
  private cataState(base: PartInst) {
    let st = this.cata.get(base.id);
    if (!st) { st = { loaded: false, deg: 100, firing: false, told: false }; this.cata.set(base.id, st); this.scene.setCatapult(base.id, 100, false, this.bands); }
    return st;
  }
  private catapultFrame(dt: number) {
    if (!this.scene) return; // il primo fotogramma arriva mentre la scena si sta ancora creando
    for (const base of this.parts.filter(p => p.type === 'catapultBase')) {
      const st = this.cataState(base);
      if (st.firing) {
        st.deg = Math.min(100, st.deg + dt * 1100);
        this.scene.setCatapult(base.id, st.deg, true, this.bands);
        if (st.deg >= 100) { st.firing = false; this.launch(base); }
        continue;
      }
      if (!st.loaded || !this.running) continue;
      if (!this.latchClosed(base)) { st.loaded = false; st.firing = true; st.told = false; continue; }
      // il servo si è mosso ed è arrivato, ma il fermo è ancora sopra il braccio
      const { servo, latch } = this.cataParts(base);
      const a = this.hw.servoAngle.get(servo!.id) ?? 90, target = this.hw.servoTarget.get(servo!.id) ?? a;
      const moved = Math.abs(target - (latch!.rest ?? 90)) > 2;
      if (moved && Math.abs(target - a) < 0.5 && !st.told) {
        st.told = true;
        toast(`${img('catapult-latch.svg', 26)}Il fermo si è mosso, ma troppo poco: il braccio è ancora bloccato. Fai girare il servo di più.`, { kind: 'info', ms: 4000 });
      }
      if (!moved) st.told = false;
    }
  }
  /** Quanti elastici tirano il braccio (1, 2 o 3): più elastici, più forza, più lontano va la pallina. */
  bands = 2;
  setBands(n: number) {
    this.bands = Math.max(1, Math.min(3, n));
    for (const base of this.parts.filter(p => p.type === 'catapultBase')) { const st = this.cataState(base); if (!st.firing) this.scene.setCatapult(base.id, st.loaded ? 0 : 100, st.loaded, this.bands); }
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-bands]')) b.classList.toggle('on', Number(b.dataset.bands) === this.bands);
  }
  /** Il braccio sbatte sulla sbarra: la pallina vola in avanti. La spinge l'elastico, non il servo. */
  private launch(base: PartInst) {
    const from = this.scene.ballWorld(base.id);
    this.scene.setCatapult(base.id, 100, false, this.bands);
    if (!from) return;
    const ang = ((base.rot || 0) * Math.PI) / 4;
    let fwd = { x: -Math.sin(ang), z: -Math.cos(ang) }; // davanti alla catapulta (verso -z)
    const bk = this.parts.find(p => p.type === 'bucket');
    let far = 0, ahead = false;
    if (bk) {
      // se il bersaglio è più o meno davanti, la catapulta è puntata verso di lui
      const bx = bk.x - from.x, bz = bk.z - from.z, bl = Math.hypot(bx, bz) || 1;
      far = bl;
      if ((bx * fwd.x + bz * fwd.z) / bl > Math.cos((60 * Math.PI) / 180)) { fwd = { x: bx / bl, z: bz / bl }; ahead = true; }
    }
    const D = [7, 12, 17][this.bands - 1];
    const land = new (from.constructor as any)(from.x + fwd.x * D, 0.6, from.z + fwd.z * D);
    const hit = !!bk && Math.hypot(land.x - bk.x, land.z - bk.z) < 2.6;
    this.scene.throwBall(from, land, hit, bk ? { x: bk.x, z: bk.z, r: 2.5 } : undefined);
    this.game.throws++;
    if (hit) this.game.hits++;
    const msg = hit ? `${img('bullseye.svg', 26)}Centro! La pallina è nel bersaglio.`
      : !bk ? `${img('catapult-base.svg', 26)}Via! Metti un bersaglio dove cade la pallina.`
      : !ahead ? `${img('bucket.svg', 26)}Il bersaglio non è davanti alla catapulta: spostalo davanti.`
      : D < far ? `${img('catapult-base.svg', 26)}Troppo corto! ${this.bands < 3 ? 'Metti un elastico in più' : 'Avvicina il bersaglio'}.`
      : `${img('catapult-base.svg', 26)}Troppo lungo! ${this.bands > 1 ? 'Togli un elastico' : 'Allontana il bersaglio'}.`;
    setTimeout(() => toast(msg, { kind: hit ? 'ok' : 'info', ms: 3200 }), 900);
    this.evaluate();
  }
  /** "Carica": tiri giù il braccio. Resta giù solo se il fermo è al suo posto. */
  loadCatapult() {
    const base = this.parts.find(p => p.type === 'catapultBase');
    if (!base) return;
    const st = this.cataState(base);
    const { servo, latch } = this.cataParts(base);
    if (st.firing) return;
    if (st.loaded) { toast(`${img('catapult-base.svg', 26)}È già carica: premi A!`); return; }
    if (!servo) { toast(`${img('servo.svg', 26)}Manca il servo: senza il grilletto il braccio non resta giù.`); return; }
    if (!latch) { toast(`${img('catapult-latch.svg', 26)}Manca il fermo sul braccio del servo: il braccio torna su da solo.`); return; }
    if (!this.latchClosed(base)) { toast(`${img('catapult-latch.svg', 26)}Il fermo non è sopra il braccio: il servo deve tornare dove l'hai calibrato.`); return; }
    st.loaded = true; st.deg = 0; st.told = false;
    this.scene.setCatapult(base.id, 0, true, this.bands);
    toast(`${img('catapult-base.svg', 26)}Carica! Il fermo tiene giù il braccio. Ora premi A.`, { kind: 'ok', ms: 3000 });
  }

  // ---------- gioco del filo ----------
  game: LevelCtx['game'] = { touches: 0, finished: false, played: false, throws: 0, hits: 0 };
  private buzz: BuzzGame | null = null;
  /** L'anello tocca il filo: chiude il circuito tra il pin collegato e il GND, se i cavi sono giusti. */
  private buzzTouch(on: boolean) {
    const a = this.analysis;
    const bw = this.parts.find(p => p.type === 'buzzWire');
    if (!a || !bw) return;
    const W = `${bw.id}:W`, L = `${bw.id}:L`;
    for (const mb of this.parts.filter(p => p.type === 'microbit')) for (const pin of PIN_PADS) {
      const P = `${mb.id}:${pin}`, G = `${mb.id}:GND`;
      if ((a.nets.same(P, L) && a.nets.same(G, W)) || (a.nets.same(P, W) && a.nets.same(G, L))) this.rt.touchPin(pin, on);
    }
  }
  openBuzz() {
    if (!this.running) return;
    this.buzz ??= new BuzzGame({
      onTouch: on => { this.buzzTouch(on); if (on) this.game.touches++; },
      onFinish: n => { this.game.finished = true; toast(`${img('trophy.svg', 26)}${n ? `Arrivato! Hai toccato il filo ${n} ${n === 1 ? 'volta' : 'volte'}.` : 'Arrivato senza toccare il filo: mano fermissima!'}`, { kind: 'ok', ms: 3500 }); this.evaluate(); },
      leds: () => this.rt.leds,
    });
    this.game.played = true;
    this.buzz.open(document.body);
    this.buzz.root.querySelector('.buzz-x')!.addEventListener('click', () => this.closeBuzz(), { once: true });
  }
  closeBuzz() { this.buzz?.close(); }

  // ---------- tester dei conduttori ----------
  tested: Record<string, boolean> = {};
  private padTouch = new Map<string, boolean>();
  /** I pin collegati al GND attraverso un oggetto che conduce (sul piano di prova) risultano "toccati". */
  private updateTouches() {
    const a = this.analysis;
    if (!a) return;
    const find = (r: string) => a.nets.find(r);
    const extra = new Map<string, string>(); // unioni in più: graffetta A ↔ graffetta B se l'oggetto conduce
    for (const pad of this.parts.filter(p => p.type === 'testPad')) {
      const obj = this.parts.find(o => o.attachedTo === pad.id);
      if (obj && PARTS[obj.type]?.conductive) extra.set(find(`${pad.id}:A`), find(`${pad.id}:B`));
    }
    const root = (r: string) => { const x = find(r); return extra.get(x) ?? x; };
    for (const mb of this.parts.filter(p => p.type === 'microbit')) {
      const g = root(`${mb.id}:GND`);
      for (const pin of PIN_PADS) {
        const on = this.running && root(`${mb.id}:${pin}`) === g;
        const key = mb.id + pin;
        if ((this.padTouch.get(key) ?? false) !== on) { this.padTouch.set(key, on); this.rt.touchPin(pin, on); }
      }
    }
    // cosa abbiamo provato: oggetto sul piano, collegato tra un pin e il GND, con la prova accesa
    if (!this.running) return;
    for (const pad of this.parts.filter(p => p.type === 'testPad')) {
      const obj = this.parts.find(o => o.attachedTo === pad.id);
      if (!obj) continue;
      const A = find(`${pad.id}:A`), B = find(`${pad.id}:B`);
      const wired = this.parts.some(mb => mb.type === 'microbit' && PIN_PADS.some(pin => {
        const P = find(`${mb.id}:${pin}`), G = find(`${mb.id}:GND`);
        return (P === A && G === B) || (P === B && G === A);
      }));
      if (wired) this.tested[obj.type] = !!PARTS[obj.type]?.conductive;
    }
  }

  // ---------- luce della stanza (luce notturna) ----------
  // 0 buio, 1 lampada, 2 sole. Una mano o un biscotto davanti al sensore lasciano passare poca luce, non zero:
  // con il sole pieno il "buio" del biscotto è più chiaro, e la soglia nel codice va cambiata. Proprio come nelle stanze vere.
  private roomLight = 1;
  private covered = false;
  lightNow() { return Math.round([10, 120, 250][this.roomLight] * (this.covered ? 0.12 : 1)); }
  private applyLight() {
    const v = this.lightNow();
    this.rt.setSensor('light', v);
    for (const f of this.friends.values()) f.setSensor('light', v);
    const sl = this.root.querySelector<HTMLInputElement>('[data-sensor=light]');
    if (sl) sl.value = String(v);
    this.scene.setRoomLight(this.roomLight);
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-light]')) b.classList.toggle('on', Number(b.dataset.light) === this.roomLight);
  }
  setRoom(level: number) { this.roomLight = Math.max(0, Math.min(2, level)); this.applyLight(); }
  toggleRoom() { this.setRoom(this.roomLight === 0 ? 1 : 0); }
  cover(on: boolean) { this.covered = on; this.applyLight(); this.scene.setCookie(on); this.q<HTMLElement>('.mb-cover')?.classList.toggle('down', on); }

  private setRunning(r: boolean) {
    if (r !== this.running) { this.roomLight = 1; this.covered = false; this.applyLight(); this.scene.setCookie(false); }
    this.running = r;
    if (!r) { this.closeBuzz(); this.hunt?.close(); this.stopFriends(); }
    this.padTouch.clear();
    if (r) queueMicrotask(() => this.updateTouches());
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
    // con la prova compare la barra dei pulsanti: se finisce sopra un pezzo, la vista si sistema
    requestAnimationFrame(() => requestAnimationFrame(() => { if (this.scene && this.parts.some(p => !p.attachedTo && this.covered_(p.x, p.z))) this.frame(); }));
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
    this.shown = list;
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
    const i = this.shown[this.issueIdx];
    if (!i?.refs.length) return;
    const needWire = /filo|collega|spina|GND|3V|pin/i.test(i.text);
    if (needWire && !this.running && this.mode !== 'wire') this.setMode('wire');
    const p = this.scene.termWorld(i.refs[0]);
    // dopo il cambio di scheda, altrimenti l'inquadratura della scheda nuova cancella questa
    if (p) requestAnimationFrame(() => requestAnimationFrame(() => this.scene.focusOn(p.x, p.z, 20)));
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
      runInStep: this.running && this.runEpoch === this.stepEpoch && norm(this.runCode) === norm(this.code),
      icon: this.running ? this.rt.lastIcon : '', tested: this.tested,
      game: Object.assign(this.game, { bands: this.bands, loaded: [...this.cata.values()].some(c => c.loaded) }),
      friend: this.running ? [...this.friends.values()][0]?.stats ?? null : null,
      angles: Object.fromEntries(this.hw.servoAngle),
    };
  }

  private evaluate() {
    const steps = this.level.steps;
    if (!steps.length || this.finished) return;
    const s = steps[this.step];
    if (!s || this.doneSteps.has(this.step)) return;
    const c = this.ctx();
    this.refreshAct(c);
    if (!s.goal(c)) return;
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
    this.stepEpoch++;
    this.persist();
    this.actIdx = this.actNow();
    this.idleAt = performance.now();
    const m = steps[n].mode;
    if (m !== this.mode) this.setMode(m, false);
    else if (!this.running) this.frame(); // la vista segue il passo: torna a far vedere i pezzi che servono
    this.renderGuide();
    this.renderHint();
    this.openStepPop(false, this.doneSteps.has(n - 1));
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
      <div class="guide-title"><h2>${esc(s.title)}</h2><button class="icon-btn guide-help" data-act="step-open" aria-label="Cosa devo fare?">${icon('ph:question-fill', 22)}</button></div>
      <p class="lead lead-act">${esc(this.stepText())}</p>${this.pips()}
      ${canSpeak() ? `<button class="btn btn-soft" data-act="listen">${icon('ph:speaker-high-fill', 22)}Ascolta</button>` : ''}
      ${list ? `<ul class="check">${list.map((c, i) => `<li class="${c.done ? 'ok' : ''}"><span class="ck">${c.done ? icon('ph:check-bold', 18) : i + 1}</span>${c.color ? `<span class="sw" style="background:${c.color}"></span>` : ''}<span>${esc(c.label)}</span></li>`).join('')}</ul>` : ''}
      ${done ? `<div class="bravo">${img('party-popper.svg', 34)}<b>Bravo!</b></div>` : ''}
      ${s.why ? `<details class="why"><summary>${esc(s.why.q)}</summary><p>${esc(s.why.a)}</p></details>` : ''}
      <div class="guide-nav">
        <button class="btn" data-act="prev" ${this.step === 0 ? 'disabled' : ''}>${icon('ph:arrow-left-bold', 20)}Indietro</button>
        <button class="btn btn-next" data-act="next" ${done && this.step < L.steps.length - 1 ? '' : 'disabled'}>Avanti${icon('ph:arrow-right-bold', 20)}</button>
      </div>
      ${L.real.printable ? `<a class="link-btn link-print" href="${PUB + L.real.printable.file}" download target="_blank" rel="noopener">${icon('ph:download-simple-bold', 16)}${esc(L.real.printable.label)}</a>` : ''}
      <button class="link-btn" data-act="restart">${icon('ph:arrow-counter-clockwise-bold', 16)}Ricomincia il progetto</button>`;
    this.q('.code-step').innerHTML = `<span class="code-step-n">${this.step + 1}</span><div class="code-step-txt"><b>${esc(s.title)}</b><span class="lead-act">${esc(this.stepText())}</span>${this.pips()}</div>
      ${canSpeak() ? `<button class="btn btn-small" data-act="listen" aria-label="Ascolta">${icon('ph:speaker-high-fill', 18)}</button>` : ''}
      <button class="btn btn-small" data-act="step-open">${icon('ph:question-fill', 18)}<span class="hide-xs">Cosa devo fare?</span></button>`;
  }

  /** Il passo nuovo, grande e al centro dello schermo: i bambini piccoli non leggono la colonna a destra. */
  openStepPop(force: boolean, bravo = false) {
    const st = this.level.steps[this.step];
    const pop = this.q('.step-pop');
    if (!st || (this.finished && !force)) return;
    const MODE_IMG: Record<Mode, string> = { build: 'package.svg', wire: 'crocodile.svg', code: 'microbit.svg' };
    pop.innerHTML = `<div class="step-card" role="dialog" aria-label="Passo ${this.step + 1}">
      ${bravo ? `<div class="step-bravo">${img('party-popper.svg', 30)}Bravo! Ora il passo dopo:</div>` : ''}
      <div class="step-head">${img(MODE_IMG[st.mode], 54)}<div><span class="step-n">Passo ${this.step + 1} di ${this.level.steps.length} · ${MODE_LABEL[st.mode]}</span><h2>${esc(st.title)}</h2></div></div>
      <p class="lead-act">${esc(this.stepText())}</p>${this.pips()}
      <div class="row">
        ${canSpeak() ? `<button class="btn btn-soft" data-act="listen">${icon('ph:speaker-high-fill', 22)}Ascolta</button>` : ''}
        <button class="btn btn-go" data-act="step-ok">Ok, ci provo!</button>
      </div>
      ${canSpeak() ? `<button class="link-btn autoread" data-act="autoread" aria-pressed="${getAutoRead()}">${icon(getAutoRead() ? 'ph:speaker-high-fill' : 'ph:speaker-slash-fill', 18)}Leggi da solo: ${getAutoRead() ? 'sì' : 'no'}</button>` : ''}
      </div>`;
    pop.hidden = false;
    if (!force) this.readStep(bravo);
    (pop.querySelector('[data-act=step-ok]') as HTMLElement).focus();
  }

  closeStepPop() { this.q('.step-pop').hidden = true; this.idleAt = performance.now(); }

  // ---------- l'elettricità che scorre ----------
  /** In quali cavi passa la corrente adesso, e in che verso (1 = da `a` verso `b`). Solo quando il circuito funziona davvero. */
  private flowKey = '';
  private updateFlows() {
    const a = this.analysis;
    const flows = new Map<string, number>();
    if (a) {
      const mbOf = (ref: string) => this.parts.find(p => p.id === ref.split(':')[0])?.type === 'microbit';
      const live = (id: string) => a.powered.has(id);
      for (const w of this.wires) {
        const ta = w.a.split(':')[1], tb = w.b.split(':')[1];
        // la spina delle pile o del computer: l'energia va verso il micro:bit
        if (ta === 'PLUG' || ta === 'USBPLUG' || tb === 'PLUG' || tb === 'USBPLUG') {
          const mb = mbOf(w.a) ? w.a : w.b;
          if (live(mb.split(':')[0])) flows.set(w.id, mb === w.b ? 1 : -1);
          continue;
        }
        if (!this.running) continue;
        for (const [self, other, term] of [[w.a, w.b, ta], [w.b, w.a, tb]] as const) {
          const part = this.parts.find(p => p.id === self.split(':')[0]);
          if (!part) continue;
          const toPart = self === w.b ? 1 : -1;
          if (part.type === 'servo') {
            const sv = a.servos.find(x => x.id === part.id);
            if (sv?.powered && sv.grounded && sv.sig) flows.set(w.id, term === 'GND' ? -toPart : toPart);
          } else if (part.type === 'led' && (this.hw.ledLevel.get(part.id) ?? 0) > 0) {
            flows.set(w.id, term === 'K' ? -toPart : toPart);
          } else if (part.type === 'microbit' && PIN_PADS.includes(term as any) && this.padTouch.get(part.id + term) && !flows.has(w.id)) {
            flows.set(w.id, -toPart); // un pin toccato: la corrente esce dal pin, passa dall'oggetto e torna al GND
          } else if (part.type === 'microbit' && term === 'GND' && !flows.has(w.id) && PIN_PADS.some(pin => this.padTouch.get(part.id + pin)) && !this.parts.some(p => p.id === other.split(':')[0] && (p.type === 'servo' || p.type === 'led' || p.type === 'resistor'))) {
            flows.set(w.id, toPart);
          }
        }
      }
    }
    const key = [...flows].map(([k, v]) => k + v).join('|');
    if (key === this.flowKey) return;
    const first = !this.flowKey && key && this.running;
    this.flowKey = key;
    this.scene.setFlows(flows);
    try {
      if (first && [...flows.keys()].length > 1 && !sessionStorage.getItem('mcl-flow')) { sessionStorage.setItem('mcl-flow', '1'); toast(`${icon('ph:lightning-fill', 20)}Guarda i puntini gialli: è l'elettricità che corre nei cavi!`, { ms: 4200 }); }
    } catch { /* */ }
  }

  // ---------- una cosa alla volta ----------
  private actIdx = 0;
  private acts() { const s = this.level.steps[this.step]; return s ? actsOf(s) : []; }
  /** La prima azione del passo non ancora fatta. */
  private actNow(c = this.ctx()) { const a = this.acts(); let i = 0; while (i < a.length - 1 && a[i].done(c)) i++; return i; }
  private stepText() { const a = this.acts(); return a.length ? a[Math.min(this.actIdx, a.length - 1)].text : ''; }
  private pips() {
    const a = this.acts();
    return a.length > 1 ? `<span class="pips" aria-label="Azione ${this.actIdx + 1} di ${a.length}">${a.map((_, i) => `<i class="${i < this.actIdx ? 'done' : i === this.actIdx ? 'now' : ''}"></i>`).join('')}</span>` : '';
  }
  /** Fatta un'azione, compare quella dopo (e, se "Leggi da solo" è acceso, viene letta). */
  private refreshAct(c?: LevelCtx) {
    if (!this.level.steps.length || this.finished || this.doneSteps.has(this.step)) return;
    const i = this.actNow(c);
    if (i === this.actIdx) return;
    const forward = i > this.actIdx;
    this.actIdx = i;
    this.idleAt = performance.now();
    this.renderGuide();
    const pop = this.q('.step-pop');
    if (!pop.hidden) { const p = pop.querySelector('.lead-act'); if (p) p.textContent = this.stepText(); }
    for (const e of this.root.querySelectorAll<HTMLElement>('.lead-act')) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }
    if (forward) { tone(880, 70); if (getAutoRead()) speak(this.stepText()); }
  }
  private readStep(bravo = false) {
    const s = this.level.steps[this.step];
    if (s && getAutoRead() && canSpeak()) speak(`${bravo ? 'Bravo! ' : ''}${s.title}. ${this.stepText()}`);
  }

  // ---------- la manina che mostra il gesto ----------
  private hand = new HandHint();
  private idleAt = performance.now();
  private tickTimer = 0;
  private tick() {
    if (!this.scene) return;
    this.refreshAct();
    this.updateFlows();
    if (this.hand.active || performance.now() - this.idleAt < 10000) return;
    if (!this.level.steps.length || this.finished || this.doneSteps.has(this.step) || !this.q('.step-pop').hidden) return;
    if (document.querySelector('.modal-back, .buzz, .hunt') || document.hidden) return;
    const h = this.hintPoints();
    this.idleAt = performance.now() + 5000; // dopo averlo mostrato, aspetta un po' di più
    if (h) void this.hand.show(h.pts, h.drag);
  }
  private center(sel: string) {
    const e = this.root.querySelector<HTMLElement>(sel);
    if (!e || e.hidden || (e as HTMLButtonElement).disabled) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'center' });
    const r = e.getBoundingClientRect();
    return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }
  /** Dove deve andare la manina per l'azione di adesso. `null` = non lo sappiamo mostrare (es. cambiare un numero nei blocchi). */
  hintPoints(): { pts: { x: number; y: number }[]; drag?: boolean } | null {
    const s = this.level.steps[this.step];
    if (!s) return null;
    const one = (sel: string) => { const p = this.center(sel); return p ? { pts: [p] } : null; };
    const t = this.stepText();
    // un pulsante da premere: lo dice il testo dell'azione
    const press: [RegExp, () => string | null][] = [
      [/^Premi Prova!/, () => this.running ? null : '[data-act=run]'],
      [/^Premi Ferma/, () => this.running ? '[data-act=run]' : null],
      [/^Premi Carica, poi A/, () => this.game.loaded ? '.hint [data-btn=A]' : '.mb-load'],
      [/^Premi Carica/, () => '.mb-load'],
      [/^Premi A\b/, () => '.hint [data-btn=A]'],
      [/Biscotto/, () => '.mb-cover'],
      [/[Pp]remi la luna/, () => '.hint [data-light="0"]'],
      [/[Pp]remi la lampadina/, () => '.hint [data-light="1"]'],
      [/3 elastici/, () => '.hint [data-bands="3"]'],
      [/Fai un passo/, () => '.hint .mb-step'],
      [/"Gioca"/, () => '.mb-buzz'],
    ];
    for (const [re, sel] of press) if (re.test(t)) { const q = sel(); return q ? one(q) : null; }
    if (/^(Cambia|Nel blocco|Nel codice|In un blocco|Rendi|Fai scodinzolare)/.test(t)) return null;
    const sh = s.show;
    if (!sh || this.running) return null;
    if (s.mode !== this.mode) return one(`.tab[data-mode=${s.mode}]`);
    const inst = (type: string) => this.parts.filter(p => p.type === type);
    if ('add' in sh) {
      const miss = (Array.isArray(sh.add) ? sh.add : [sh.add]).find(ty => !inst(ty).length);
      return miss ? one(`.part[data-type=${miss}]`) : null;
    }
    if ('drag' in sh) {
      const pairs = (Array.isArray(sh.drag[0]) ? sh.drag : [sh.drag]) as [string, string][];
      for (const [a, b] of pairs) {
        const hostType = (p: PartInst) => this.parts.find(h => h.id === p.attachedTo)?.type;
        if (inst(a).some(p => hostType(p) === (b === 'horn' ? 'servo' : b))) continue;
        const pa = inst(a)[0];
        if (!pa) return one(`.part[data-type=${a}]`);
        let to: { x: number; y: number } | null = null;
        if (b === 'horn') { const sv = inst('servo').find(x => x.attachedTo) ?? inst('servo')[0]; to = sv ? this.scene.hornTipClient(sv.id) : null; }
        else { const pb = inst(b)[0]; if (!pb) return one(`.part[data-type=${b}]`); to = this.scene.objectClient(pb.id); }
        const from = this.scene.objectClient(pa.id);
        return from && to ? { pts: [from, to], drag: true } : null;
      }
      return null;
    }
    const a = this.analysis;
    if (!a) return null;
    for (const [ra, rb] of sh.wire) {
      const [ta, na] = ra.split(':'), [tb, nbs] = rb.split(':');
      const alts = nbs.split('|');
      for (const pa of inst(ta)) {
        const ref = `${pa.id}:${na}`;
        const targets = inst(tb).flatMap(pb => alts.map(n => `${pb.id}:${n}`));
        if (!targets.length || targets.some(r => a.nets.same(ref, r))) continue;
        const used = (r: string) => this.wires.some(w => w.a === r || w.b === r);
        const dest = targets.find(r => !used(r)) ?? targets[0];
        const p1 = this.scene.terminalClient(ref), p2 = this.scene.terminalClient(dest);
        if (!p1 || !p2) return null;
        return this.pending === ref ? { pts: [p2] } : { pts: [p1, p2] };
      }
    }
    return null;
  }

  /** Cosa succede nel mondo vero quando un pezzo si attacca a un altro. */
  private attachMsg(p: PartInst): string {
    const host = this.parts.find(h => h.id === p.attachedTo)?.type;
    if (host === 'petBody') {
      if (p.type === 'servo') return `${img('luna.png', 24)}Il servo è nella pancia di Luna! Il braccio bianco esce dalla schiena.`;
      if (p.type === 'foilPatch') return `${img('luna.png', 24)}Stagnola sulla schiena! Nel mondo vero la incolli con la colla stick.`;
      return `${img('glue-stick.svg', 24)}Attaccato a Luna! Nel mondo vero lo incolli con la colla stick.`;
    }
    if (host === 'testPad') return `${img('paperclip.svg', 24)}Sul piano di prova! Tocca le due graffette.`;
    if (host === 'cardStand') return `${img('package.svg', 24)}Appoggiato al leggio! Nel mondo vero lo fermi con un po' di nastro.`;
    if (host === 'strap') return `${img('socks.svg', 24)}Allacciato alla fascia! Nel mondo vero lo tieni fermo con l'elastico o il velcro.`;
    if (host === 'milkCarton') return p.type === 'microbit' ? `${img('milk.svg', 24)}Il micro:bit è sotto la bocca: è l'occhio del mostro! Nel mondo vero lo fermi con il nastro di carta.` : `${img('tape.svg', 24)}Servo sul tappo! Nel mondo vero lo fissi con il biadesivo spesso.`;
    if (host === 'catapultBase') return `${img('tape.svg', 24)}Servo accanto al braccio! Nel mondo vero lo fissi con il biadesivo spesso.`;
    if (p.type === 'milkString') return (p.rest ?? 90) >= 170 ? `${img('string.svg', 24)}Spago legato con il servo a 180: la bocca è chiusa. Calibrato!` : `${img('string.svg', 24)}Spago legato, ma il servo non era a 180: la bocca non si chiude bene. Stacca lo spago, premi Prova! e legalo di nuovo.`;
    if (p.type === 'catapultLatch') return Math.abs((p.rest ?? 90) - 90) < 10 ? `${img('catapult-latch.svg', 24)}Fermo montato con il servo a 90: sta sopra il braccio. Calibrato!` : `${img('catapult-latch.svg', 24)}Fermo montato, ma il servo non era a 90. Staccalo, premi Prova! e montalo di nuovo.`;
    if (p.type === 'petTail') return `${img('luna-tail.png', 24)}Coda infilata! La tasca di carta tiene la coda sul braccio del servo.`;
    return `${img('fire.svg', 22)}Attaccato al servo! Nel mondo vero lo incolla l'adulto con la colla a caldo.`;
  }

  /** C'è un frutto collegato al GND da tenere in mano (piano di frutta). */
  private holdingGnd() {
    const a = this.analysis;
    return !!a && this.parts.some(f => FRUITS.has(f.type) && this.parts.some(mb => mb.type === 'microbit' && a.nets.same(`${f.id}:F`, `${mb.id}:GND`)));
  }
  /** I tasti del piano: frutti collegati a un pin. */
  private fruitKeys() {
    return this.parts.filter(f => ['banana', 'apple', 'lemon'].includes(f.type) && this.foilPins(f.id).length);
  }

  /** I pin del micro:bit collegati (con i fili) alla stagnola. */
  private foilPins(id: string): string[] {
    const a = this.analysis;
    if (!a) return [];
    const out: string[] = [];
    for (const mb of this.parts.filter(p => p.type === 'microbit')) for (const pin of PIN_PADS) if (a.nets.same(`${id}:F`, `${mb.id}:${pin}`)) out.push(pin);
    return out;
  }

  private touchFoil(id: string, down: boolean) {
    const p = this.parts.find(x => x.id === id);
    if (p && FRUITS.has(p.type) && down && !this.holdingGnd()) {
      toast(`${img('tangerine.svg', 26)}Con l'altra mano tieni un frutto collegato al GND, come l'arancia: così il circuito si chiude!`, { kind: 'warn', ms: 4000 });
      return;
    }
    for (const pin of this.foilPins(id)) this.rt.touchPin(pin, down);
    this.q<HTMLElement>('.mb-pet')?.classList.toggle('down', down);
  }

  /** Un passo: la gamba si muove, il micro:bit sente uno "scuoti". */
  takeStep() {
    this.rt.lastIcon = '';
    this.rt.gesture('Shake');
    const legs = this.parts.filter(p => p.type === 'strap');
    for (const p of legs.length ? legs : this.parts.filter(p => p.type === 'microbit')) this.scene.bump(p.id);
    if (/IconNames\.Scissors/.test(this.code) && /randint/.test(this.code)) setTimeout(() => this.friendPlays(), 250);
  }

  /** Sasso, carta, forbice: l'amico virtuale gioca contro il disegno del micro:bit. */
  private friendPlays() {
    if (!this.running || !this.rt.lastIcon) return;
    const HANDS = [
      { id: 'sasso', img: 'raised-fist.svg', name: 'sasso' },
      { id: 'carta', img: 'raised-hand.svg', name: 'carta' },
      { id: 'forbice', img: 'victory-hand.svg', name: 'forbice' },
    ];
    const mine = this.rt.lastIcon === 'Square' ? 'carta' : this.rt.lastIcon === 'Scissors' ? 'forbice' : 'sasso';
    const friend = HANDS[Math.floor(Math.random() * 3)];
    const beats: Record<string, string> = { sasso: 'forbice', forbice: 'carta', carta: 'sasso' };
    const res = mine === friend.id ? 'Pareggio! Scuoti ancora.' : beats[mine] === friend.id ? 'Hai vinto tu!' : 'Ha vinto l\'amico!';
    toast(`${img(friend.img, 30)}<span>L'amico fa <b>${friend.name}</b>. Tu: <b>${mine}</b>. ${res}</span>`, { kind: beats[mine] === friend.id ? 'ok' : 'info', ms: 2600 });
  }

  private wiredFoil(): string | null {
    return this.parts.find(p => p.type === 'foilPatch' && this.foilPins(p.id).length)?.id ?? null;
  }

  private renderHint() {
    const h = this.q('.hint');
    let html = '';
    if (this.running) html = `<span class="mb-label">${this.friends.size ? 'Il tuo micro:bit' : 'Pulsanti del micro:bit'}</span>
      <button class="mb-btn" data-btn="A" aria-label="Pulsante A">A</button><button class="mb-btn" data-btn="B" aria-label="Pulsante B">B</button><button class="mb-btn mb-ab" data-btn="AB" aria-label="Pulsanti A e B insieme">A+B</button>${this.fruitKeys().map(f => `<button class="mb-btn mb-pet mb-fruit" data-fruit="${f.id}" aria-label="Tocca: ${esc(PARTS[f.type].name)}">${img(PARTS[f.type].icon, 26)}${esc(PARTS[f.type].name.split(' ')[0])}</button>`).join('')}${this.parts.some(p => p.type === 'buzzWire') ? `<button class="mb-btn mb-pet mb-buzz" aria-label="Gioca: non toccare il filo">${img('buzzwire.svg', 26)}Gioca</button>` : ''}${/input\.lightLevel/.test(this.code) ? `<span class="mb-seg" role="group" aria-label="Luce della stanza"><button class="mb-segb ${this.roomLight === 0 ? 'on' : ''}" data-light="0" aria-label="Buio">${icon('ph:moon-fill', 24)}</button><button class="mb-segb ${this.roomLight === 1 ? 'on' : ''}" data-light="1" aria-label="Lampada">${icon('ph:lightbulb-fill', 24)}</button><button class="mb-segb ${this.roomLight === 2 ? 'on' : ''}" data-light="2" aria-label="Sole">${icon('ph:sun-fill', 24)}</button></span>${this.parts.some(p => p.type === 'milkCarton') ? `<button class="mb-btn mb-pet mb-cover" aria-label="Avvicina il biscotto (tieni premuto)">${img('cookie.svg', 26)}Biscotto</button>` : `<button class="mb-btn mb-pet mb-cover" aria-label="Copri con la mano">${icon('ph:hand-tap-fill', 24)}Copri</button>`}` : ''}${this.parts.some(p => p.type === 'catapultBase') ? `<span class="mb-seg" role="group" aria-label="Quanti elastici"><span class="mb-segl">Elastici</span>${[1, 2, 3].map(n => `<button class="mb-segb ${this.bands === n ? 'on' : ''}" data-bands="${n}" aria-label="${n} ${n === 1 ? 'elastico' : 'elastici'}">${n}</button>`).join('')}</span><button class="mb-btn mb-pet mb-load" aria-label="Carica la catapulta">${img('catapult-base.svg', 26)}Carica</button>` : ''}${/Gesture\.Shake/.test(this.code) ? (this.parts.some(p => p.type === 'strap') ? `<button class="mb-btn mb-pet mb-step" aria-label="Fai un passo">${img('footprints.svg', 28)}Fai un passo</button>` : `<button class="mb-btn mb-pet mb-step" aria-label="Scuoti">${icon('ph:vibrate-fill', 24)}Scuoti</button>`) : ''}${this.friends.size ? `<span class="mb-label">Il micro:bit dell'amico</span><button class="mb-btn mb-friend" data-fbtn="A" aria-label="Pulsante A dell'amico">A</button><button class="mb-btn mb-friend" data-fbtn="B" aria-label="Pulsante B dell'amico">B</button>` : ''}${/RadioPacketProperty\.SignalStrength/.test(this.code) && this.friends.size ? `<button class="mb-btn mb-pet mb-hunt" aria-label="Gioca alla caccia al tesoro">${img('compass.svg', 26)}Cerca il tesoro</button>` : ''}${this.wiredFoil() ? `<button class="mb-btn mb-pet" data-foil="${this.wiredFoil()}" aria-label="Accarezza Luna">${img('luna.png', 30)}Accarezza</button>` : ''}`;
    else if (this.mode === 'wire' && this.pending) html = `${img('crocodile.svg', 30)}<span>Ora tocca dove va il cavo: <b>${esc(this.termLabel(this.pending))}</b> → ?</span>`;
    else if (this.mode === 'wire') html = `${img('crocodile.svg', 30)}<span>Tocca un cerchietto, poi un altro: il cavo a coccodrillo li unisce.</span>`;
    h.hidden = !html;
    h.innerHTML = html;
    h.classList.toggle('hint-run', this.running);
    for (const b of h.querySelectorAll<HTMLElement>('[data-light]')) b.addEventListener('click', () => this.setRoom(Number(b.dataset.light)));
    for (const b of h.querySelectorAll<HTMLElement>('[data-bands]')) b.addEventListener('click', () => this.setBands(Number(b.dataset.bands)));
    h.querySelector<HTMLElement>('.mb-buzz')?.addEventListener('click', () => this.openBuzz());
    h.querySelector<HTMLElement>('.mb-load')?.addEventListener('click', () => this.loadCatapult());
    for (const fb of h.querySelectorAll<HTMLElement>('.mb-fruit')) {
      const fid = fb.dataset.fruit!;
      const press = (d: boolean) => { this.touchFoil(fid, d); fb.classList.toggle('down', d); };
      fb.addEventListener('pointerdown', e => { e.preventDefault(); fb.setPointerCapture(e.pointerId); press(true); });
      fb.addEventListener('pointerup', () => press(false));
      fb.addEventListener('pointercancel', () => press(false));
      fb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(true); setTimeout(() => press(false), 150); } });
    }
    const cov = h.querySelector<HTMLElement>('.mb-cover');
    if (cov) {
      cov.addEventListener('pointerdown', e => { e.preventDefault(); cov.setPointerCapture(e.pointerId); this.cover(true); });
      cov.addEventListener('pointerup', () => this.cover(false));
      cov.addEventListener('pointercancel', () => this.cover(false));
    }
    const stepBtn = h.querySelector<HTMLElement>('.mb-step');
    stepBtn?.addEventListener('click', () => this.takeStep());
    const pet = h.querySelector<HTMLElement>('.mb-pet[data-foil]');
    if (pet) {
      const fid = pet.dataset.foil!;
      pet.addEventListener('pointerdown', e => { e.preventDefault(); pet.setPointerCapture(e.pointerId); this.touchFoil(fid, true); });
      pet.addEventListener('pointerup', () => this.touchFoil(fid, false));
      pet.addEventListener('pointercancel', () => this.touchFoil(fid, false));
      pet.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.touchFoil(fid, true); setTimeout(() => this.touchFoil(fid, false), 1200); } });
    }
    h.querySelector<HTMLElement>('.mb-hunt')?.addEventListener('click', () => this.openHunt());
    for (const fbtn of h.querySelectorAll<HTMLElement>('.mb-friend')) {
      const name = fbtn.dataset.fbtn as 'A' | 'B';
      const fid = [...this.friends.keys()][0];
      const press = (d: boolean) => { this.friends.get(fid)?.pressButton(name, d); this.scene.setButtonPressed(fid, name, d); fbtn.classList.toggle('down', d); };
      fbtn.addEventListener('pointerdown', e => { e.preventDefault(); fbtn.setPointerCapture(e.pointerId); press(true); });
      fbtn.addEventListener('pointerup', () => press(false));
      fbtn.addEventListener('pointercancel', () => press(false));
      fbtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(true); press(false); } });
    }
    for (const b of h.querySelectorAll<HTMLElement>('.mb-btn:not(.mb-pet):not(.mb-friend)')) {
      const name = b.dataset.btn as 'A' | 'B' | 'AB';
      const press = (down: boolean) => {
        this.rt.pressButton(name, down);
        for (const mb of this.parts.filter(p => p.type === 'microbit' && !this.friends.has(p.id))) for (const n of name === 'AB' ? ['A', 'B'] : [name]) this.scene.setButtonPressed(mb.id, n, down);
        b.classList.toggle('down', down);
      };
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); press(true); });
      b.addEventListener('pointerup', () => press(false));
      b.addEventListener('pointercancel', () => press(false));
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(true); press(false); } });
    }
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    const firstTime = !loadProgress().stars[this.level.id];
    saveStars(this.level.id, 3);
    const stars = loadProgress().stars;
    const total = Object.values(stars).reduce((a, b) => a + b, 0);
    this.q('.stars-n').textContent = String(total);
    this.q('.stars-n').parentElement?.classList.add('bump');
    // con questo progetto è finita tutta la lezione? Allora si vince anche il distintivo della lezione
    const lesson = LESSONS.find(l => l.projects.some(p => p.level === this.level.id));
    const medal = firstTime && !!lesson && lesson.projects.every(p => p.level && stars[p.level]);
    const R = this.level.real, W = this.level.word;
    this.hand.hide();
    const m = modal(`<div class="finale">
      ${img('party-popper.svg', 72)}
      <h2>Ce l'hai fatta!</h2>
      <div class="finale-stars">${img('star.svg', 48)}${img('star.svg', 56)}${img('star.svg', 48)}</div>
      <p class="lead">Hai finito <b>${esc(this.level.title)}</b>.${W ? '' : ' Ora costruiscilo davvero!'}</p>
      ${medal ? `<div class="finale-medal">${icon('ph:trophy-fill', 40)}<div><b>Distintivo della Lezione ${lesson!.n}</b><span>Hai finito tutta la lezione «${esc(lesson!.title)}»!</span></div></div>` : ''}
      ${W ? `<div class="word-card">
        <span class="word-k">${icon('ph:medal-fill', 20)}Parola nuova</span>
        <h3>${esc(W.term)}</h3>
        <p>${esc(W.means)}</p>
        ${canSpeak() ? `<button class="btn btn-soft btn-small" data-x="say">${icon('ph:speaker-high-fill', 20)}Ascolta</button>` : ''}
      </div>
      <div class="quiz">
        <p class="quiz-q">${esc(W.quiz.q)}</p>
        <div class="quiz-opts">${W.quiz.options.map((o, i) => `<button class="btn quiz-opt" data-opt="${i}">${esc(o)}</button>`).join('')}</div>
        <p class="quiz-msg" aria-live="polite"></p>
        <button class="link-btn quiz-skip" data-x="skip">Salta la domanda</button>
      </div>` : ''}
      <div class="finale-more" ${W ? 'hidden' : ''}>
      <p class="lead">Ora costruiscilo davvero!</p>
      <div class="finale-cols">
        <div><h3>${icon('ph:shopping-bag-fill', 22, 'color:#B8862A')}Ti serve</h3><ul>${R.materials.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><h3>${icon('ph:shield-check-fill', 22, 'color:#2E8B57')}Sicurezza</h3><ul class="safe">${R.safety.map(([s, t]) => `<li>${safetyTag(s as any)}<span>${esc(t)}</span></li>`).join('')}</ul></div>
      </div>
      ${R.printable ? `<p><a class="btn btn-soft" href="${PUB + R.printable.file}" download target="_blank" rel="noopener">${icon('ph:download-simple-bold', 22)}${esc(R.printable.label)}</a></p>` : ''}
      <div class="row">
        <button class="btn btn-go" data-x="dl">${icon('ph:usb-fill', 22)}Manda al micro:bit vero</button>
        <a class="btn" href="#/">${icon('ph:flag-fill', 20)}Torna al percorso</a>
        <button class="btn" data-x="stay">Resta qui e gioca</button>
      </div></div></div>`, { wide: true, onClose: stopSpeaking });
    this.closeStepPop();
    fanfare();
    confetti(m.root.querySelector<HTMLElement>('.modal')!);
    m.root.querySelector('[data-x=stay]')!.addEventListener('click', m.close);
    m.root.querySelector('[data-x=dl]')!.addEventListener('click', () => { m.close(); this.setMode('code'); void this.download(); });
    m.root.querySelector('a[href="#/"]')!.addEventListener('click', m.close);
    if (W) {
      const say = () => speak(`Parola nuova: ${W.term}. ${W.means} ${W.quiz.q}`);
      const more = m.root.querySelector<HTMLElement>('.finale-more')!, msg = m.root.querySelector<HTMLElement>('.quiz-msg')!;
      const reveal = () => { more.hidden = false; m.root.querySelector<HTMLElement>('.quiz-skip')!.hidden = true; };
      m.root.querySelector('[data-x=say]')?.addEventListener('click', say);
      m.root.querySelector('[data-x=skip]')!.addEventListener('click', reveal);
      for (const b of m.root.querySelectorAll<HTMLButtonElement>('.quiz-opt')) b.addEventListener('click', () => {
        if (Number(b.dataset.opt) === W.quiz.answer) {
          b.classList.add('right');
          for (const o of m.root.querySelectorAll<HTMLButtonElement>('.quiz-opt')) o.disabled = true;
          saveWord(this.level.id);
          msg.innerHTML = `${icon('ph:medal-fill', 22)}Giusto! Hai vinto il distintivo <b>${esc(W.term)}</b>.`;
          msg.className = 'quiz-msg ok';
          cheer();
          if (getAutoRead()) speak(`Giusto! Hai vinto il distintivo ${W.term}.`);
          reveal();
          more.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          b.classList.add('wrong'); b.disabled = true;
          msg.textContent = 'Quasi! Rileggi la parola nuova e riprova.';
          msg.className = 'quiz-msg';
          tone(220, 160);
        }
      });
      if (getAutoRead()) say();
    }
  }

  // ---------- sincronizzazione ----------

  private sync() {
    this.analysis = analyze(this.parts, this.wires);
    this.hw.setCircuit(this.parts, this.wires);
    this.scene.setState(this.parts, this.wires);
    this.updateTouches();
    for (const s of this.parts.filter(p => p.type === 'servo')) this.scene.setServo(s.id, this.hw.servoAngle.get(s.id) ?? 90);
    this.renderIssues();
    this.renderGuide();
    this.positionSelTools();
    this.persist();
    this.evaluate();
    clearInterval(this.evalTimer);
    this.evalTimer = window.setInterval(() => { if (this.running) { this.updateTouches(); this.evaluate(); } }, 300);
  }

  private persist() {
    saveWork(this.level.id, { parts: this.parts, wires: this.wires, mk: this.mkProject || { text: { 'main.ts': this.code } }, step: this.step, rev: this.level.rev });
  }

  // ---------- comandi per i test automatici ----------

  private testApi() {
    return {
      ws: this,
      add: (type: string, x?: number, z?: number) => { this.addPart(type, x, z); return this.parts.at(-1)!.id; },
      connect: (a: string, b: string) => { this.pending = null; this.clickTerminal(a); this.clickTerminal(b); return this.wires.length; },
      attach: (id: string, servo: string) => { const p = this.parts.find(p => p.id === id)!; p.attachedTo = servo; this.markRest(p); this.sync(); },
      loadCata: () => this.loadCatapult(),
      cataState: () => Object.fromEntries(this.cata),
      cover: (on: boolean) => this.cover(on),
      code: (ts: string) => this.setCode(ts),
      run: () => this.run(),
      stop: () => this.stopRun(),
      press: (b: 'A' | 'B') => { this.rt.pressButton(b, true); this.rt.pressButton(b, false); },
      step: () => this.takeStep(),
      room: () => this.toggleRoom(),
      setRoom: (n: number) => this.setRoom(n),
      light: () => this.lightNow(),
      bands: (n: number) => this.setBands(n),
      buzz: () => this.openBuzz(),
      fruit: (id: string, d: boolean) => this.touchFoil(id, d),
      friendPress: (b: 'A' | 'B') => { const r = [...this.friends.values()][0]; r?.pressButton(b, true); r?.pressButton(b, false); },
      friendState: () => { const [id, r] = [...this.friends][0] ?? []; return r ? { id, leds: Array.from(r.leds).map(v => (v ? 1 : 0)).join(''), icons: [...r.stats.iconsShown] } : null; },
      hunt: () => this.openHunt(),
      huntState: () => this.hunt?.testState() ?? null,
      huntMove: (x: number, y: number) => this.hunt?.testMove(x, y),
      huntClose: () => this.hunt?.close(),
      servoAngles: () => Object.fromEntries(this.hw.servoAngle),
      buzzPath: () => this.buzz?.clientPath() ?? [],
      buzzClose: () => this.closeBuzz(),
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
      objClient: (id: string) => this.scene.objectClient(id),
      buttonClient: (mb: string, b: string) => this.scene.buttonClient(mb, b),
      wireClient: (id: string) => this.scene.wireClient(id),
      clipClient: (id: string, end: 'a' | 'b') => this.scene.clipClient(id, end),
      select: (ids: string[], wire: string | null = null) => this.scene.setSelection(ids, wire),
      wiresList: () => this.wires.map(w => ({ ...w })),
      partsFull: () => this.parts.map(p => ({ ...p })),
    };
  }
}

const norm = (s: string) => (s || '').replace(/\s+/g, '');
/** Coriandoli che cadono dall'alto della finestra (niente coriandoli se il dispositivo chiede meno movimento). */
function confetti(host: HTMLElement) {
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  const colors = ['#F6520A', '#833CA3', '#F7941D', '#2E8B57', '#FFD95A', '#2F80D1'];
  for (let i = 0; i < 44; i++) {
    const c = document.createElement('i');
    c.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};--dx:${(Math.random() * 2 - 1) * 90}px;--rot:${(Math.random() * 2 - 1) * 720}deg;animation-delay:${Math.random() * 0.9}s;animation-duration:${1.8 + Math.random() * 1.4}s;${i % 3 === 0 ? 'border-radius:50%;' : ''}`;
    box.appendChild(c);
  }
  host.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

/** Materiali leggeri: possono stare uno sopra l'altro (un LED dentro il rotolo, una pallina nel bicchiere). */
const LOOSE = new Set(['led', 'resistor', 'cardboardBox', 'cardboardPanel', 'paperCup', 'straw', 'cardboardTube', 'foilBall']);
const TILTABLE = new Set(['servo', 'cardboardBox', 'cardboardPanel', 'paperCup', 'cardboardTube', 'battery']);
const KEYS: Record<string, string> = { rotate: 'R', duplicate: 'Ctrl+D', delete: 'Canc' };
