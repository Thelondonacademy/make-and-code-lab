# Make & Code Lab

Il laboratorio 3D, gratuito e open source, per costruire robot con il **micro:bit V2**, i **materiali di riciclo** (cartone, bicchieri, cannucce, stagnola) e **MakeCode**. È pensato per bambini dai 6 anni e segue il corso *Make & Code Lab* di [The London Academy](https://www.thelondonacademy.it) (Fidenza).

**Provalo:** https://thelondonacademy.github.io/make-and-code-lab/

## Cosa fa

- **Costruisci**: trascini sul banco il micro:bit, le pile, il servo, il LED e i materiali di riciclo. I materiali si attaccano al braccio del servo.
- **Collega**: unisci i pezzi con i cavi a coccodrillo. Un controllore spiega gli errori con parole semplici (micro:bit spento, servo senza energia, fili scambiati, LED al contrario, cortocircuito, pin sbagliato).
- **Programma**: MakeCode di Microsoft è dentro la pagina, in italiano. Premi **Prova!** e il robot si muove nel 3D.
- **Micro:bit vero**: con *Manda al micro:bit vero* il programma va sul micro:bit con il cavo USB (Chrome o Edge) oppure come file `.hex`.
- **Didattica e sicurezza**: ogni pezzo ha una scheda ("Cos'è? Come funziona? Sicurezza") con lettura ad alta voce, e un'etichetta: *Da solo*, *Con un adulto*, *Solo l'adulto*.
- I livelli seguono le lezioni del corso. Per ora: **Il cuore che batte**, **Il contapassi**, **La luce notturna** e **Sasso, carta, forbice** (lezione 1), **Luna che scodinzola** (lezione 4), più il **Laboratorio libero**.
- **Il contapassi**: dal progetto "Step counter" di micro:bit.org e MakeCode. Micro:bit e pile su una fascia alla caviglia; ogni passo (scuoti) aggiunge 1, al traguardo compare la faccina. Versione facile: il codice è pronto, si cambia solo il numero dei passi.
- **La luce notturna**: dal progetto "Nightlight" di micro:bit.org. Se la luce è sotto 100 si accendono tutte le lucine, altrimenti si spengono. Nel simulatore: "Spegni la luce" fa notte nella stanza, "Copri" è la mano sopra il micro:bit. Il micro:bit sta su un leggio di cartone.
- **Sasso, carta, forbice**: dal progetto di micro:bit.org/MakeCode. Scuoti: numero a caso 1-3 → quadratino (sasso), quadrato (carta), forbice. Nel simulatore un amico virtuale gioca contro e dice chi vince.
- **Il tester dei conduttori** (lezione 2): dal progetto "Conductivity tester" di micro:bit.org. Pin 1 e GND vanno a due graffette su un cartoncino; se l'oggetto appoggiato conduce, compare il cuore. Si provano moneta, banana, gomma, tappo e stagnola, anche con la prova accesa.
- **Luna che scodinzola**: un cagnolino di carta con il servo nella pancia e la stagnola sulla schiena. Accarezzi la stagnola (pin 1, tocco capacitivo del V2) e la coda scodinzola. Energia dal cavo USB o dalle pile. Le sagome da stampare sono in `public/paper-pet/luna-sagome.pdf` (disegni in `art/luna`; si rigenerano con `python3 scripts/process-luna-art.py` e poi `python3 scripts/build-paper-pet.py`).

I progetti si salvano solo nel browser: niente account, niente dati inviati.

## Per sviluppatori

```bash
npm install
npm run dev        # sviluppo
npm test           # test del simulatore (vitest)
npm run build      # sito statico in dist/
python3 tests/e2e.py http://localhost:4173/   # test nel browser (dopo npm run preview)
```

Struttura:

| Cartella | Cosa c'è |
| --- | --- |
| `src/sim/` | il simulatore: traduzione del codice MakeCode (`transpile.ts`), il micro:bit simulato (`runtime.ts`), il controllore dei collegamenti (`circuit.ts`), la fisica dei pezzi (`hardware.ts`) |
| `src/scene/` | la scena 3D con three.js |
| `src/data/` | il catalogo dei pezzi con le schede per i bambini (`parts.ts`) e i livelli (`levels.ts`) |
| `src/makecode/` | MakeCode integrato con `@microbit/makecode-embed` |
| `src/device/` | invio al micro:bit vero via WebUSB |
| `src/ui/` | le pagine e il laboratorio |

### Aggiungere un livello

Un livello è un oggetto in `src/data/levels.ts`: pezzi disponibili, pezzi di partenza, codice MakeCode iniziale, blocchi visibili, e i passi. Ogni passo ha un titolo, un testo corto e una funzione `goal` che dice quando è fatto.

### Come funziona il simulatore

Il codice JavaScript che MakeCode genera dai blocchi viene tradotto in JavaScript asincrono (ogni funzione diventa `async`, ogni chiamata ha `await`), così `basic.pause`, `forever` e gli eventi dei pulsanti funzionano come sul micro:bit vero e la prova si può fermare in qualsiasi momento. Il circuito è un grafo: i cavi uniscono i morsetti, e delle regole controllano energia, GND e segnali.

## Licenze

Codice: MIT © The London Academy S.C.S. ETS. MakeCode è di Microsoft; micro:bit è un marchio della Micro:bit Educational Foundation. Icone: Fluent Emoji (MIT), Phosphor (MIT), game-icons.net (CC BY 3.0). Carattere Lexend (OFL). Luna che scodinzola si ispira al Paper Pet di OKdo; personaggio, disegni e sagome sono originali.
