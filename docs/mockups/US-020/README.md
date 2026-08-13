# US-020 — Selezionare la scala temporale del grafico del portafoglio

Mockup della traversa delle cinque scale applicata al grafico del valore del
portafoglio (EP-006, FR-016, ADR-003), e — soprattutto — della **doppia
dimensione di copertura** che un aggregato ha e un singolo titolo no.

Il tracciato è **lo stesso** di US-019, la traversa è **la stessa** di US-037:
`shared.css` è quello di US-019, esteso in coda con la sola sezione «US-020»
(`.doppio-regolo`, `.regolo`, `.barra-copertura`, `.sigillo-due-dimensioni`,
`.invito-scala`, `.matrice-copertura`). Nessuna regola preesistente è stata
riscritta, e `.barra-scala` / `.scala-temporale` arrivano già da US-037
attraverso quel file: le cinque scale non si ricopiano, né nel CSS né nel
dominio.

## File

| File | Cosa mostra | Criterio |
|---|---|---|
| `index.html` | «Ultimi 10 anni» su un portafoglio la cui storia comincia il 19.IX.2025: l'asse resta lungo dieci anni e dichiara i **3.325 giorni fuori dall'archivio**, mentre il **doppio regolo** misura separatamente il tempo (328 giorni coperti su 3.653) e il perimetro (completo dal 3.VI.2026, 71 giorni su 328). | **1**, **2**, **3**, **5**, **6** |
| `finestra-vuota.html` | «Ultimo mese» su un portafoglio la cui ultima rilevazione è del 3.VI.2026: al posto della cornice, «dato non disponibile» con la scala più stretta che comprenda almeno un punto. Il secondo regolo dichiara **non misurabile**, non «parziale». | **4**, **6** |
| `due-dimensioni.html` | I quattro incroci fra copertura nel tempo e copertura del perimetro, il quinto caso (finestra vuota) che non ci sta dentro, e le tre letture sbagliate che un verdetto solo produrrebbe. | **6** |
| `shared.css` | `US-019/shared.css` + sezione US-020. |

## Perché i verdetti sono due

Per un titolo la copertura è una domanda sola: la finestra chiesta è coperta dai
dati d'archivio, oppure no. Per un aggregato le domande sono **due e
indipendenti**:

| Dimensione | Domanda | Denominatore | Rimedio |
|---|---|---|---|
| **I — tempo** | quanta parte della finestra chiesta l'archivio possiede | i giorni della **finestra chiesta** (3.653) | una scala più stretta |
| **II — perimetro** | quanti titoli *detenuti* erano valorizzati alle date coperte | i giorni **coperti dall'archivio** (328) | aggiornare i prezzi (US-035) |

I denominatori sono diversi perché la seconda domanda si misura **dentro** la
prima: fuori dai giorni che l'archivio copre non ci sono date su cui contare i
titoli valorizzati. È per questo che i due numeri non si mediano — una media di
due frazioni con denominatori diversi non corrisponde ad alcun fatto — e che
entrambi i denominatori sono scritti accanto alla propria barra.

Ne segue anche il caso limite di `finestra-vuota.html`: con zero punti in
finestra la prima dimensione è **assente** e la seconda è **senza oggetto**.
Dichiararla «piena» sarebbe vero solo vacuamente («ogni titolo detenuto», su un
insieme vuoto di date, non trova eccezioni) e a schermo si leggerebbe come una
rassicurazione sopra un riquadro che non mostra nulla.

## Le due campiture, deliberatamente diverse

| Campitura | Significato |
|---|---|
| puntinata, seppia (`#fuoriArchivio`) | fuori dall'archivio: a quelle date **non esiste alcun dato**, per nessun titolo |
| obliqua, ottone (`#perimetroParziale`) | dentro l'archivio, ma **non ogni titolo detenuto** ha un prezzo noto |

Un'unica trama farebbe leggere due assenze diverse come una sola, e i due rimedi
sono opposti.

## Che cosa questa spec non fa

- **non definisce le scale**: le legge da `SCALE_TEMPORALI` /
  `SCALA_PREDEFINITA` (`shared/domain/serieTitolo.ts`, US-037). Il «giorno
  precedente» di FR-016 resta escluso per la ragione già data lì: su uno storico
  rado per costruzione (FR-018) dichiarerebbe «dato non disponibile» quasi
  sempre;
- **non nomina il titolo** che tiene il perimetro incompleto: dichiara *quanti*.
  Il *quale*, con la data d'inizio copertura, è US-016;
- **non tocca la fonte**: cambiare scala è *ritagliare* un array già in memoria,
  mai *infittire* l'archivio. Nessuna richiesta di rete parte dalla traversa;
- **non aggiunge un commutatore di vista**: per un portafoglio il prezzo unitario
  non ha significato, e US-039 resta della sola scheda titolo.
