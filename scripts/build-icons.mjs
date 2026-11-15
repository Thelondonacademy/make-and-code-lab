// Estrae solo le icone usate dalle librerie open source e genera src/ui/icons.ts
// Phosphor (MIT), game-icons.net (CC BY 3.0). Le icone colorate Fluent Emoji (MIT) vanno in public/icons.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('@iconify-json/ph/icons.json');
const G = require('@iconify-json/game-icons/icons.json');
const F = require('@iconify-json/fluent-emoji-flat/icons.json');

const ph = ['play-fill','stop-fill','speaker-high-fill','arrow-counter-clockwise-bold','arrow-clockwise-bold','magnifying-glass-plus-bold','magnifying-glass-minus-bold','check-bold','lock-simple-fill','warning-fill','x-bold','flag-fill','shield-check-fill','user-fill','users-fill','warning-octagon-fill','scissors-fill','plugs-connected-fill','puzzle-piece-fill','chalkboard-teacher-fill','question-fill','arrow-left-bold','arrow-right-bold','shopping-bag-fill','trash-fill','arrow-u-up-left-bold','house-fill','usb-fill','download-simple-bold','sun-fill','thermometer-fill','hand-tap-fill','vibrate-fill','info-fill','gear-six-fill','code-bold','eye-fill','sparkle-fill','lightbulb-fill','cube-fill','moon-fill'];
const gi = ['heart-beats','footprint','moon','rock','lightning-electron','wire-coil','banana','walkie-talkie','open-treasure-chest','milk-carton','catapult','tv-remote','race-car','radar-sweep','podium-winner','labrador-head'];
const close = s => s.replace(/<(\w+)([^>]*?)\/>/g, '<$1$2></$1>');
const out = {};
for (const n of ph) { const i = P.icons[n]; if (!i) throw new Error('ph ' + n); out['ph:' + n] = { w: i.width || P.width, h: i.height || P.height, b: close(i.body) }; }
for (const n of gi) { const i = G.icons[n]; if (!i) throw new Error('gi ' + n); out['gi:' + n] = { w: i.width || G.width, h: i.height || G.height, b: close(i.body) }; }
fs.writeFileSync('src/ui/icons.ts', `// File generato da scripts/build-icons.mjs — non modificare a mano.
// Icone: Phosphor Icons (MIT), game-icons.net (CC BY 3.0, autori Lorc, Delapouite e altri).
const ICONS: Record<string, { w: number; h: number; b: string }> = ${JSON.stringify(out)};

/** Icona SVG in linea, colorata con il colore del testo. */
export function icon(name: string, size = 24, extraStyle = ''): string {
  const i = ICONS[name];
  if (!i) throw new Error('Icona mancante: ' + name);
  return \`<svg class="ico" width="\${size}" height="\${size}" viewBox="0 0 \${i.w} \${i.h}" fill="currentColor" aria-hidden="true" style="\${extraStyle}">\${i.b}</svg>\`;
}
`);
const fl = ['red-circle','sparkles','party-popper','thinking-face','grinning-face-with-big-eyes','socks','footprints','raised-fist','raised-hand','victory-hand','paperclip','coin','banana','red-apple','lemon','tangerine','musical-keyboard','compass','satellite-antenna','love-letter'];
for (const n of fl) { const i = F.icons[n]; if (!i) throw new Error('fl ' + n); const w = i.width || F.width, h = i.height || F.height;
  fs.writeFileSync('public/icons/' + n + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${i.body}</svg>`); }
console.log('icone:', Object.keys(out).length);
