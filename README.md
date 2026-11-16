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
- **Non toccare il filo!** (lezione 2): il classico gioco del filo (GND al filo, pin 0 all'anello). Se si toccano: X e suono, altrimenti faccina felice. Nel simulatore c'è il minigioco: trascini l'anello lungo il filo con il dito o il mouse.
- **Il piano di frutta** (lezione 2): dal progetto "Banana keyboard" di MakeCode. GND all'arancia (da tenere in mano), pin 0/1/2 a banana, mela e limone: ogni frutto suona una nota (Do, Mi, Sol). Il simulatore spiega che senza il frutto al GND in mano il circuito non si chiude.
- **Il mostro del latte** (lezione 4): dal Milky Monster di MakeCode, come nel copione dell'episodio 4. Il micro:bit sotto la bocca è l'occhio: quando arriva un biscotto fa buio e il servo sul tappo tira lo spago, la bocca si apre. Si calibra il servo a 180 prima di legare lo spago.
- **La catapulta** (lezione 4): dalla catapulta di Instructables, come nel copione. Il servo è il grilletto: il fermo sul suo braccio tiene giù la catapulta carica, con A si sposta e l'elastico lancia. Si calibra a 90 prima di montare il fermo; si fa centro scegliendo quanti elastici usare; poi si cerca un angolo di sgancio tra 10 e 170.
- **Messaggi segreti** e **Caccia al tesoro** (lezione 3): la radio tra due micro:bit. Sul banco ci vanno due micro:bit con le loro pile: fanno girare lo stesso programma (il secondo è quello dell'amico, con i pulsanti viola). Il gruppo della radio è il canale segreto. Nella caccia al tesoro un micro:bit trasmette e l'altro misura la forza del segnale: nel minigioco trascini il cercatore in giardino.
- **Luna che scodinzola**: un cagnolino di carta con il servo nella pancia e la stagnola sulla schiena. Accarezzi la stagnola (pin 1, tocco capacitivo del V2) e la coda scodinzola. Energia dal cavo USB o dalle pile. Le sagome da stampare sono in `public/paper-pet/luna-sagome.pdf` (disegni in `art/luna`; si rigenerano con `python3 scripts/process-luna-art.py` e poi `python3 scripts/build-paper-pet.py`).

I progetti si salvano solo nel browser: niente account, niente dati inviati.

## A prova di dita piccole

Pensato per bambini di 6-8 anni su tablet e telefono, non solo al computer:

- **Collegare i cavi col dito**: i tre fili del servo si aprono a ventaglio, in Collega la vista si avvicina da sola ai pezzi con i cerchietti e, se il dito cade a metà tra due cerchietti, un fumetto chiede "Quale?" con i pulsanti grandi.
- **Pezzi**: ogni pezzo nuovo compare in un posto libero e visibile (mai sotto i pulsanti, mai davanti a un pezzo alto); un pezzo lasciato sopra un altro scivola accanto invece di sparirci dentro.
- **Vista**: un dito sul banco vuoto la fa scorrere (non la gira) e non si esce mai dal banco; per girarla ci sono due dita o il pulsante tondo; la casetta rimette tutto in vista. La vista scivola, non salta.
- **Misure**: pulsanti da almeno 44 px sul tocco, scritte da almeno 14 px, guida corta su telefono e tablet in verticale per lasciare spazio al banco.

## Un po' di fisica vera

- **Cavi**: escono dalla pinza, scendono e si appoggiano sul banco; se sulla strada c'è un pezzo ci passano sopra, non attraverso. Due cavi vicini non si sovrappongono.
- **Catapulta**: la forza è degli elastici (1, 2 o 3): più elastici, più lontano vola la pallina. Se manca il bersaglio la pallina rimbalza due volte e si ferma; se fa centro resta nel secchiello. I messaggi dicono "troppo corto" o "troppo lungo".
- **Luce**: la stanza ha tre luci (luna 10, lampadina 120, sole 250). Una mano o un biscotto davanti al sensore lasciano passare un po' di luce (il 12%), non zero: con il sole la soglia nel codice va cambiata, come nelle stanze vere.

## Per chi sta imparando a leggere

- **Una cosa alla volta**: ogni passo è diviso in azioni brevi (mai più di 16 parole). Si vede solo quella da fare adesso; fatta quella, compare la successiva.
- **Leggi da solo**: ogni passo e ogni azione nuova vengono letti ad alta voce. Si spegne dal riquadro del passo (utile in classe) e resta spento.
- **La manina**: se il bambino resta fermo 10 secondi, una manina mostra il gesto: quale pezzo toccare, cosa trascinare e dove, quali due cerchietti unire, quale pulsante premere.
- **L'elettricità si vede**: puntini gialli corrono nei cavi dove passa la corrente (pile, servo, LED acceso, oggetto che conduce), nel verso giusto.
- **La parola nuova**: alla fine di ogni progetto c'è una parola (Sensore, Conduttore, Servo, Calibrare...) con una domanda. Chi risponde giusto vince il distintivo, che resta in "Le mie parole" nella pagina del percorso.

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
