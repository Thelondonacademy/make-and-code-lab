import '@fontsource/lexend/400.css';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import '@fontsource/lexend/700.css';
import '@fontsource/lexend/800.css';
import './style.css';
import { homePage, safetyPage, creditsPage } from './ui/pages';
import { Workspace } from './ui/workspace';
import { levelById } from './data/levels';
import { el } from './ui/common';

const app = document.getElementById('app')!;
let ws: Workspace | null = null;

function route() {
  ws?.dispose();
  ws = null;
  document.querySelectorAll('.modal-back,.toast').forEach(n => n.remove());
  const h = location.hash.replace(/^#/, '') || '/';
  const m = /^\/livello\/([\w-]+)/.exec(h);
  if (m || h.startsWith('/libero')) {
    const lv = levelById(m ? m[1] : 'libero');
    if (lv) {
      if (!webglOk()) { app.replaceChildren(el(`<div class="page"><div class="wrap narrow"><h1>Serve un browser più nuovo</h1><p class="lead">Il banco 3D ha bisogno di WebGL. Prova con Chrome o Edge aggiornati.</p><a class="btn" href="#/">Torna al percorso</a></div></div>`)); return; }
      ws = new Workspace(lv, app);
      document.title = `${lv.title} · Make & Code Lab`;
      return;
    }
  }
  const page = h.startsWith('/sicurezza') ? safetyPage() : h.startsWith('/crediti') ? creditsPage() : homePage();
  app.replaceChildren(page);
  document.title = 'Make & Code Lab · The London Academy';
  window.scrollTo(0, 0);
}

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

window.addEventListener('hashchange', route);
route();
