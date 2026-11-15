// La scheda di un pezzo: cos'è, come funziona, sicurezza, cosa serve nel mondo vero.
import { PARTS, CATEGORIES } from '../data/parts';
import { icon } from './icons';
import { esc, img, modal, safetyTag } from './common';
import { speak, canSpeak, stopSpeaking } from '../speech';

export function openCard(type: string) {
  const p = PARTS[type];
  if (!p) return;
  const cat = CATEGORIES.find(c => c.id === p.category)!;
  const c = p.card;
  const all = `${p.name}. ${c.cosa} ${c.come.join(' ')}`;
  const m = modal(`
  <div class="card">
    <div class="card-head">
      <div class="card-icon" style="background:${cat.bg}">${img(p.icon, 60, p.name)}</div>
      <div><span class="chip" style="background:${cat.bg};color:${cat.fg}">${cat.name}</span><h2>${esc(p.name)}</h2></div>
    </div>
    <div class="card-what"><h3>Cos'è?</h3><p>${esc(c.cosa)}</p></div>
    ${canSpeak() ? `<button class="btn btn-soft btn-listen">${icon('ph:speaker-high-fill', 22)}Ascolta la scheda</button>` : ''}
    <div><h3>Come funziona</h3><ul class="card-list">${c.come.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="card-safe"><h3>${icon('ph:shield-check-fill', 24, 'color:#2E8B57')}Sicurezza</h3>
      <ul>${c.sicurezza.map(([s, t]) => `<li>${safetyTag(s)}<span>${esc(t)}</span></li>`).join('')}</ul>
      ${c.attenzione ? `<p class="card-warn">${icon('ph:warning-fill', 20)}<span><b>Attenzione:</b> ${esc(c.attenzione)}</span></p>` : ''}</div>
    <div class="card-real">${icon('ph:shopping-bag-fill', 28, 'color:#EBBC4A')}<span>Nel mondo vero ti serve: <b>${esc(c.mondo)}</b>.</span></div>
  </div>`, { onClose: stopSpeaking });
  m.root.querySelector('.btn-listen')?.addEventListener('click', () => speak(all));
}
