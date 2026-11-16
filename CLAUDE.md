# Make & Code Lab — guida per lavorarci (per Claude e per chi contribuisce)

Simulatore 3D open source (MIT) di micro:bit V2, in italiano, per bambini dai 6 anni.
Segue il corso *Make & Code Lab* di The London Academy (Fidenza): 12 ragazzi, 6 lezioni da 90 minuti.
Repo `Thelondonacademy/make-and-code-lab`, online su https://thelondonacademy.github.io/make-and-code-lab/
Proprietario: Gaston Liotta (The London Academy). Lingua di lavoro: italiano.

## Come vuole lavorare Gaston (rispettarlo sempre)

- Risposte in italiano, corte e dirette. Feedback critico e onesto, senza dargli ragione per forza: dire chiaramente limiti e difetti.
- Consegne pronte per la produzione. Dirgli che è fatto **solo quando è fatto e testato** (test unitari + e2e + controllo visivo).
- Verifica live nel suo Chrome (Claude in Chrome) dopo ogni pubblicazione, **senza toccare i suoi progressi**: prima salvare le chiavi localStorage che si useranno, alla fine rimetterle identiche o togliere solo quelle create dal test (`mcl-v1-work-<livello>`, `mcl-mkid-<livello>`). Se Chrome non è raggiungibile (scrive dal telefono), dirlo in una riga e offrire di farlo dopo.
- Prima di proporre miglioramenti, fare simulazioni (Playwright: telefono 390×844, tablet 768×1024 / 1024×768, computer 1366×768, anche con il dito e tocchi imprecisi) e misurare.
- Mai mascotte (Luna è un progetto, non una guida). Niente colla a caldo né taglierino in classe: biadesivo spesso e nastro di carta; i coccodrilli li attacca l'adulto prima, con un giro di nastro isolante; servo alimentato dal micro:bit con 2 pile AAA (3 V).
- Le lezioni seguono i **copioni** degli episodi YouTube (file docx "Lezione N - Make Code Lab Copione Episodio N") e i progetti originali di micro:bit.org / MakeCode: se c'è un copione, seguirlo (meccanismo, codice, materiali, parole nuove). Confrontare sempre col copione prima di inventare.

## Come si costruisce un livello (lo schema di tutti i progetti)

"Versione facile" del progetto originale: il **codice è già pronto**, il bambino costruisce, collega, preme Prova! e alla fine cambia **un solo numero o disegno** ("Cambialo tu!").
Passi tipici: Costruisci (trascina pezzi) → Collega (cavi) → Programma (Prova!) → Cambialo tu!. Ogni passo:
- `text` corto; `acts` = una cosa alla volta (**max 16 parole per azione**, c'è un test). "Premi Prova! Poi…" e "Premi Ferma. Poi…" si dividono da soli (`actsOf`).
- `show` = dove va la manina (`{ add }`, `{ drag: [pezzo, host|'horn'] }`, `{ wire: [['servo:GND','microbit:GND'], …] }`). Per cambiare un numero nei blocchi la manina non c'è.
- `checklist` per i cavi (Marrone → GND, Rosso → 3V, Arancione → pin 0), `why` = "Perché?" con spiegazione da bambino.
- `word` del livello: parola nuova + significato + domanda a 3 risposte (distintivo in "Le mie parole").
- `real`: materiali veri e sicurezza (`adulto` / `solo` / `soloAdulto`), `printable` se c'è da stampare.
- `rev`: alzarlo quando un livello cambia tanto (i lavori salvati prima ripartono da capo).
- In `LESSONS` collegare la tessera del progetto al livello (`level: 'id'`).

## Livelli esistenti (ordine = ordine di sblocco)

Lezione 1: `cuore` (Programma), `contapassi` (Variabile; fascia alla caviglia, Fai un passo), `lucenotte` (Sensore; leggio di cartone, luna/lampadina/sole), `sasso` (A caso; amico virtuale).
Lezione 2: `tester` (Conduttore; cartoncino con graffette, moneta/banana/gomma/tappo), `filo` (Circuito; minigioco del filo), `frutta` (Nota; GND all'arancia in mano, banana/mela/limone su P0/P1/P2).
Lezione 3: `messaggi` (Radio; due micro:bit, il secondo è "dell'amico" coi pulsanti viola), `tesoro` (Segnale; minigioco in giardino, forza del segnale).
Lezione 4 (servo, copione ep. 4): `paperpet` = Luna che scodinzola (Servo; Paper Pet di OKdo con Luna golden retriever, stagnola su P1, USB o pile, sagome A4 in `public/paper-pet/luna-sagome.pdf`), `mostro` = Milky Monster (Calibrare; micro:bit sotto la bocca = occhio, sensore di luce < 20 → servo 100 bocca aperta, 180 chiusa; si calibra a 180 prima di legare lo spago), `catapulta` (Angolo; servo = grilletto che sposta il fermo, la forza è dell'elastico: 1/2/3 elastici; calibrazione a 90; Cambialo tu 0 → 20, con 60 il fermo non sgancia).
Lezioni 5 (macchinina robot: telecomando, slalom) e 6 (robot che evita i muri, la grande Expo): **da fare**, tessere "In costruzione".
Più `libero` (Laboratorio libero).

## Architettura

- Vite + TypeScript, three.js, MakeCode embed (`@microbit/makecode-embed`), WebUSB.
- `src/data/levels.ts` livelli, passi, LESSONS; `src/data/parts.ts` pezzi (terminali, scheda didattica, sicurezza, `mountOn`/`mountAlso` per attaccarsi a un host: `strap`, `cardStand`, `petBody`, `testPad`, `milkCarton`, `catapultBase`, `horn`).
- `src/sim/` transpiler + runtime (fibers), `circuit.ts` (reti union-find, analisi errori), `hardware.ts` (servo, LED, sensori).
- `src/scene/builders.ts` modelli 3D di ogni pezzo e pose sugli host; `scene3d.ts` scena, telecamera, scelta morsetti, cavi, palla, puntini dell'elettricità; `wirepath.ts` percorso dei cavi (si appoggiano al banco, passano sopra i pezzi).
- `src/ui/workspace.ts` il laboratorio (passi, azioni, manina, festa finale, catapulta, luce, radio, minigiochi); `pages.ts` percorso a tappe, Le mie parole, Sicurezza, Crediti; `handhint.ts` manina; `buzzgame.ts`, `huntgame.ts` minigiochi.
- Icone: `npm run icons` (`scripts/build-icons.mjs`, Phosphor `ph:*`, Game Icons `gi:*`, Fluent Emoji) + icone fatte a mano in `public/icons/*.svg`.
- Salvataggi solo nel browser: `mcl-v1-progress` (stelle, parole), `mcl-v1-work-<livello>`, `mcl-mkid-<livello>`, `mcl-v1-autoread`, `mcl-v1-unlock-all`, `mcl-v1-name`.
- Hook di test `window.__mcl` (add, attach, connect, run, stop, press, code, state, partsFull, termClient, objClient, hornClient, cover, setRoom, light, bands, loadCata, ws, …).

## Design (non cambiarlo senza chiedere)

Palette The London Academy: arancio `#F6520A` (azione principale, Prova!), viola `#833CA3` (secondario, Ascolta, parole), ambra `#F7941D`, oro `#EBBC4A`, verde `#2E8B57` (fatto), crema `#F5F0EA` sfondo, inchiostro `#1D1C1F`. Font Lexend. Bottoni grandi con ombra sotto, angoli molto arrotondati, icone vere (non disegnate a mano).
Regole per dita piccole: bersagli ≥ 44 px, testo ≥ 14 px, un dito sposta la vista (non la gira; due dita o pulsante per girare), mai uscire dal banco, pezzi nuovi in posto libero e visibile, niente sovrapposizioni, fumetto "Quale?" quando il dito cade tra due cerchietti, guida corta su telefono. Rispettare `prefers-reduced-motion`.
Percorso a tappe in home (strada verde, "Tocca a te!", distintivo d'oro per lezione), festa finale (stelle una alla volta + suono, coriandoli), "Leggi da solo" acceso di default.

## Comandi

```bash
npm install
npm run dev                         # sviluppo
npm test                            # vitest (test unitari)
npm run build && npx vite preview --port 4173
python3 tests/e2e.py                # e2e Playwright (Chrome /usr/bin/google-chrome, swiftshader), ~20 minuti, deve finire con "RISULTATO: TUTTO OK"
OUT=/tmp/dist-deploy ./scripts/deploy-pages.sh   # pubblica su gh-pages
```
Commit come "The London Academy", poi `git push`, poi deploy, poi aspettare ~1-2 minuti che GitHub Pages aggiorni (controllare il nome del file `assets/index-*.js`) e verificare live.
Per un e2e veloce: copiare solo la sezione interessata di `tests/e2e.py` in un file a parte (testa del file + sezione + piede con RISULTATO).

## Gotcha già incontrati

- I pezzi alti (cartone del latte) e il braccio del servo in alto: l'aggancio usa anche la proiezione dalla telecamera; la vista si allarga se il pezzo esce dalla scena.
- Nei test e2e aspettare con `wait_until`, non con pause fisse; chiudere i riquadri del passo (`pop`).
- La manina e i riquadri del passo usano coordinate dello schermo: dopo un cambio di scheda aspettare due frame.
- MakeCode deve decompilare il codice in blocchi italiani: usare API standard (`pins.servoWritePin`, `input.lightLevel`, `radio.*`).
- Chi aveva un salvataggio vecchio di un livello rifatto: alzare `rev`.
