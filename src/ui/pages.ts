// Pagine: il percorso del corso, la sicurezza, i crediti.
import { LESSONS, LEVELS, levelById } from '../data/levels';
import { icon } from './icons';
import { el, esc, header, img, safetyTag } from './common';
import { loadProgress, getName, setName, getUnlockAll, setUnlockAll } from '../store';

const NAV = (page: string) => `<nav class="nav" aria-label="Sezioni">
  <a href="#/" ${page === 'home' ? 'aria-current="page"' : ''}>${icon('ph:flag-fill', 20)}Il percorso</a>
  <a href="#/libero">${img('toolbox.svg', 24)}Laboratorio libero</a>
  <a href="#/sicurezza" ${page === 'safe' ? 'aria-current="page"' : ''}>${icon('ph:shield-check-fill', 22, 'color:#2E8B57')}Sicurezza</a>
  <a href="#/crediti" ${page === 'credits' ? 'aria-current="page"' : ''}>${icon('ph:info-fill', 22)}Crediti</a>
</nav>`;

const COLORS = ['#F6520A', '#833CA3', '#F7941D', '#F6520A', '#833CA3', '#F7941D'];

export function homePage(): HTMLElement {
  const prog = loadProgress();
  const total = Object.values(prog.stars).reduce((a, b) => a + b, 0);
  const done = Object.keys(prog.stars).length;
  const name = getName();
  const unlockAll = getUnlockAll();
  // i livelli si aprono in ordine: finisci uno e si apre il successivo
  const lockedBy = (id: string): string | null => {
    if (unlockAll) return null;
    const i = LEVELS.findIndex(l => l.id === id);
    if (i <= 0) return null;
    const prev = LEVELS[i - 1];
    return prog.stars[prev.id] ? null : prev.title;
  };
  const lessons = LESSONS.map((l, i) => {
    const playable = l.projects.some(p => p.level && !lockedBy(p.level));
    const finished = l.projects.filter(p => p.level).every(p => prog.stars[p.level!]);
    const status = !playable ? `<span class="status status-soon">${icon('ph:lock-simple-fill', 14)}${l.projects.some(p => p.level) ? 'Bloccata' : 'In arrivo'}</span>`
      : finished ? `<span class="status status-done">${icon('ph:check-bold', 14)}Fatto</span>`
        : `<span class="status status-open">${icon('ph:play-fill', 14)}Aperta</span>`;
    const tiles = l.projects.map(p => {
      const lv = p.level ? levelById(p.level) : null;
      const stars = p.level ? prog.stars[p.level] || 0 : 0;
      if (!lv) return `<div class="tile tile-lock" aria-disabled="true" title="Questo progetto non è ancora pronto"><span class="badge" style="background:#E9E4DE;color:#8A847D">${icon(p.icon, 36)}</span><span class="tile-name">${esc(p.title)}</span><span class="tile-foot">${icon('ph:gear-six-fill', 14)}In costruzione</span></div>`;
      const lock = lockedBy(lv.id);
      if (lock) return `<div class="tile tile-lock" aria-disabled="true"><span class="badge" style="background:#E9E4DE;color:#8A847D">${icon(p.icon, 36)}</span><span class="tile-name">${esc(p.title)}</span><span class="tile-foot">${icon('ph:lock-simple-fill', 14)}Prima finisci «${esc(lock)}»</span></div>`;
      return `<a class="tile" href="#/livello/${lv.id}"><span class="badge" style="background:${COLORS[i]}">${icon(p.icon, 36)}</span><span class="tile-name">${esc(p.title)}</span>
        <span class="tile-foot">${stars ? `<span class="mini-stars">${img('star.svg', 18)}${img('star.svg', 18)}${img('star.svg', 18)}</span>` : `<span class="go">Gioca</span>`}</span></a>`;
    }).join('');
    return `<section class="lesson ${playable && !finished ? 'lesson-open' : ''}">
      <div class="lesson-head"><span class="lesson-n" style="background:${playable ? COLORS[i] : '#E9E4DE'};color:${playable ? '#fff' : '#5E5A60'}">${l.n}</span>
      <div><small>LEZIONE ${l.n}</small><h2>${esc(l.title)}</h2></div>${status}</div>
      <div class="tiles" style="grid-template-columns:repeat(${l.projects.length},minmax(0,1fr))">${tiles}</div></section>`;
  }).join('');

  const root = el(`<div class="page">
    ${header(NAV('home'))}
    <div class="wrap">
      <div class="hello">
        ${img('dog-face.svg', 76)}
        <div>
          <h1>${name ? `Ciao ${esc(name)}!` : 'Ciao!'} Oggi si costruisce.</h1>
          <p>Ogni progetto lo fai prima qui, sul banco, poi davvero con il cartone e il micro:bit.</p>
          ${name ? '' : `<form class="name-form"><label>Come ti chiami? <input name="n" maxlength="20" autocomplete="off"></label><button class="btn btn-small">Ok</button></form>`}
        </div>
        <div class="score-col">
          <div class="score">${img('star.svg', 36)}<div><b>${total} stelle</b><small>${done} ${done === 1 ? 'progetto finito' : 'progetti finiti'}</small></div></div>
          <button class="btn btn-small btn-unlock" data-unlock="${unlockAll ? '0' : '1'}">${icon(unlockAll ? 'ph:lock-simple-fill' : 'ph:check-bold', 16)}${unlockAll ? 'Blocca di nuovo i livelli' : 'Sblocca tutti i livelli'}</button>
        </div>
      </div>
      <div class="lessons">${lessons}</div>
      <a class="free" href="#/libero">${img('toolbox.svg', 56)}<div><b>Laboratorio libero</b><span>Inventa il tuo robot con tutti i pezzi.</span></div><span class="btn">Inizia a inventare</span></a>
      <p class="foot">Make &amp; Code Lab è un progetto open source di The London Academy · <a href="https://github.com/Thelondonacademy/make-and-code-lab" target="_blank" rel="noopener">codice su GitHub</a></p>
    </div></div>`);
  root.querySelector('.btn-unlock')!.addEventListener('click', e => {
    setUnlockAll((e.currentTarget as HTMLElement).dataset.unlock === '1');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  root.querySelector('.name-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const v = (root.querySelector('.name-form input') as HTMLInputElement).value.trim();
    if (v) { setName(v); location.hash = '#/'; window.dispatchEvent(new HashChangeEvent('hashchange')); }
  });
  return root;
}

export function safetyPage(): HTMLElement {
  const rule = (s: any, t: string, d: string) => `<li>${safetyTag(s)}<div><b>${esc(t)}</b><span>${esc(d)}</span></div></li>`;
  return el(`<div class="page">${header(NAV('safe'))}<div class="wrap narrow">
    <h1>${icon('ph:shield-check-fill', 40, 'color:#2E8B57')} Le regole del bravo maker</h1>
    <p class="lead">Ogni pezzo e ogni attrezzo ha un'etichetta. Guardala sempre prima di usarlo.</p>
    <ul class="rules">
      ${rule('solo', 'Da solo', 'Lo puoi fare tu: costruire col cartone, attaccare i coccodrilli, programmare.')}
      ${rule('adulto', 'Con un adulto', 'Lo fai tu, ma con un adulto vicino: le forbici, le pile, il cavo USB.')}
      ${rule('soloAdulto', "Solo l'adulto", 'Lo fa solo l\'adulto: la colla a caldo e il taglierino. Tu gli dici cosa fare.')}
    </ul>
    <div class="box">
      <h2>Per i bambini</h2>
      <ul class="plain">
        <li>Il micro:bit usa poca energia: 3 volt. Le prese di casa ne hanno 230: non si toccano mai.</li>
        <li>Se senti caldo o puzza di bruciato, stacca subito le pile e chiama un adulto.</li>
        <li>Le pile non si aprono e non vanno in bocca.</li>
        <li>Mai i coccodrilli tra 3V e GND: è un cortocircuito.</li>
      </ul>
    </div>
    <div class="box box-adult">
      <h2>Per gli adulti</h2>
      <ul class="plain">
        <li>I pin del micro:bit lavorano a 3,3 V e reggono pochi milliampere: niente motori collegati direttamente ai pin.</li>
        <li>Un servo piccolo (SG90) senza carico si può alimentare dal 3V con 2 pile AAA, come nei progetti del corso. Con più servo, o con un carico, serve una batteria esterna con il GND in comune.</li>
        <li>I sensori a 5 V (per esempio l'HC-SR04) vanno alimentati a parte; il segnale che torna al micro:bit va ridotto con un partitore (1 kΩ + 2 kΩ).</li>
        <li>Colla a caldo e taglierino: solo l'adulto, lontano dai bambini mentre si raffreddano.</li>
        <li>Mai collegare progetti alla rete elettrica (230 V).</li>
      </ul>
    </div></div></div>`);
}

export function creditsPage(): HTMLElement {
  return el(`<div class="page">${header(NAV('credits'))}<div class="wrap narrow">
    <h1>Crediti</h1>
    <p class="lead">Make &amp; Code Lab è open source (licenza MIT): puoi usarlo, copiarlo e migliorarlo. È fatto da The London Academy S.C.S. ETS, Fidenza.</p>
    <div class="box"><h2>Con l'aiuto di</h2><ul class="plain">
      <li><b>MakeCode</b> di Microsoft, per programmare con i blocchi. Il micro:bit è della Micro:bit Educational Foundation.</li>
      <li><b>makecode-embed</b> e <b>microbit-connection</b> della Micro:bit Educational Foundation (MIT).</li>
      <li><b>three.js</b> per il 3D (MIT).</li>
      <li>Icone colorate <b>Fluent Emoji</b> di Microsoft (MIT).</li>
      <li>Icone <b>Phosphor</b> (MIT).</li>
      <li>Icone dei progetti da <b>game-icons.net</b> (CC BY 3.0) di Lorc, Delapouite e altri autori.</li>
      <li>Carattere <b>Lexend</b> (SIL Open Font License).</li>
    </ul></div>
    <div class="box"><h2>Privacy</h2><p>Il laboratorio salva i tuoi progetti solo in questo browser. Non ci sono account e non mandiamo dati a nessuno. MakeCode viene caricato dai server di Microsoft.</p></div>
    <p><a class="btn" href="https://github.com/Thelondonacademy/make-and-code-lab" target="_blank" rel="noopener">${icon('ph:code-bold', 20)}Il codice su GitHub</a></p>
  </div></div>`);
}
