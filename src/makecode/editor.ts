// MakeCode di Microsoft integrato nella pagina (iframe), con la libreria open source
// della Micro:bit Educational Foundation (@microbit/makecode-embed, licenza MIT).
import { MakeCodeFrameDriver, createMakeCodeURL } from '@microbit/makecode-embed/vanilla';
import type { MakeCodeProject } from '@microbit/makecode-embed/vanilla';

export type EditorStatus = 'loading' | 'ready' | 'offline';

export interface CodeSpec {
  key: string;            // id stabile (livello)
  name: string;
  mainTs: string;
  mainBlocks?: string;
  namespaces: string[];   // [] = tutti i blocchi
  dependencies: Record<string, string>;
}

const MAKECODE = 'https://makecode.microbit.org';

function uuid() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function makeProject(spec: CodeSpec, id: string): MakeCodeProject {
  const now = Math.floor(Date.now() / 1000);
  const pxt = { name: spec.name, description: '', dependencies: spec.dependencies, files: ['main.blocks', 'main.ts', 'README.md'], preferredEditor: 'blocksprj' };
  return {
    header: {
      target: 'microbit', targetVersion: '7.1.2', name: spec.name, meta: {}, editor: 'blocksprj',
      pubId: '', pubCurrent: false, _rev: null, id, recentUse: now, modificationTime: now,
      cloudUserId: null, cloudCurrent: false, cloudVersion: null, cloudLastSyncTime: 0, isDeleted: false,
      githubCurrent: false, saveId: null,
    } as any,
    text: {
      'pxt.json': JSON.stringify(pxt, null, 4),
      'main.ts': spec.mainTs,
      'main.blocks': spec.mainBlocks ?? '',
      'README.md': ' ',
    },
  };
}

function filtersFor(ns: string[]) {
  if (!ns.length) return undefined;
  const namespaces: Record<string, number> = {};
  for (const n of ns) namespaces[n] = 1; // 1 = visibile
  return { namespaces, defaultState: 0 } as any; // 0 = nascosto
}

export class CodeEditor {
  iframe: HTMLIFrameElement | null = null;
  driver: MakeCodeFrameDriver | null = null;
  status: EditorStatus = 'loading';
  private project: MakeCodeProject | null = null;
  private spec: CodeSpec | null = null;
  private readyWait: Promise<void>;
  private readyResolve!: () => void;
  private timer = 0;
  onCode: (ts: string, project: MakeCodeProject) => void = () => {};
  onStatus: (s: EditorStatus) => void = () => {};
  onDownload: (hex: string, name: string) => void = () => {};

  constructor(private host: HTMLElement) {
    this.readyWait = new Promise(r => (this.readyResolve = r));
  }

  private setStatus(s: EditorStatus) { this.status = s; this.onStatus(s); }

  /** Apre il codice di un livello. Il primo avvio crea MakeCode (serve internet). */
  async open(spec: CodeSpec, saved?: MakeCodeProject | null) {
    this.spec = spec;
    const id = saved?.header?.id || localStorage.getItem('mcl-mkid-' + spec.key) || uuid();
    try { localStorage.setItem('mcl-mkid-' + spec.key, id); } catch { /* memoria piena o bloccata */ }
    this.project = saved?.text ? { header: { ...(makeProject(spec, id).header as any), ...(saved.header || {}), id }, text: saved.text } : makeProject(spec, id);
    if (!this.iframe) { this.create(); return; }
    if (this.status !== 'ready') return; // verrà caricato al primo avvio
    await this.driver!.importProject({ project: this.project, filters: filtersFor(spec.namespaces) });
  }

  private create() {
    const iframe = document.createElement('iframe');
    iframe.title = 'MakeCode: i blocchi per programmare il micro:bit';
    iframe.allow = 'usb; autoplay; camera; microphone;';
    iframe.className = 'mk-frame';
    iframe.src = createMakeCodeURL(MAKECODE, undefined, 'it', 2, { hidelanguage: '1', keyboardcontrols: '1', nocookiebanner: '1' });
    this.iframe = iframe;
    this.driver = new MakeCodeFrameDriver({
      controllerId: 'MakeAndCodeLab',
      initialProjects: async () => (this.project ? [this.project] : []),
      filters: this.spec ? filtersFor(this.spec.namespaces) : undefined,
      searchBar: false,
      onWorkspaceLoaded: () => { clearTimeout(this.timer); this.setStatus('ready'); this.readyResolve(); },
      onEditorContentLoaded: () => { clearTimeout(this.timer); if (this.status !== 'ready') { this.setStatus('ready'); this.readyResolve(); } },
      onWorkspaceSave: e => {
        const text = e.project?.text;
        if (!text || !e.project.header || e.project.header.id !== this.project?.header?.id) return;
        this.project = e.project;
        this.onCode(text['main.ts'] ?? '', e.project);
      },
      onDownload: d => this.onDownload(d.hex, d.name),
      onSave: d => this.onDownload(d.hex, d.name),
    }, () => this.iframe!);
    this.host.appendChild(iframe);
    this.driver.initialize();
    this.timer = window.setTimeout(() => { if (this.status !== 'ready') this.setStatus('offline'); }, 30000);
  }

  /** Chiede a MakeCode il file .hex da mandare al micro:bit vero. */
  async download() {
    if (!this.driver || this.status !== 'ready') throw new Error('MakeCode non è pronto');
    await this.driver.compile();
  }

  async whenReady() { return this.readyWait; }
}
