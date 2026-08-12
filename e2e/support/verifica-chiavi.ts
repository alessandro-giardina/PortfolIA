/**
 * Il controllo che rende eseguibile la regola un-ISIN-per-file (US-040).
 *
 * Fino a US-040 la regola viveva in prosa — la testata di `titoli.ts` e il
 * `CLAUDE.md` — e l'appartenenza di ogni chiave era affermata in un commento
 * («Riservato a …») che nessuno verificava. Due chiavi risultavano condivise da
 * mesi, e la loro condivisione è il difetto peggiore che questa suite possa
 * avere: seminare-e-ripristinare è uno stack di undo, quindi due file che si
 * intrecciano sulla stessa chiave lasciano in archivio un residuo che nessun
 * ripristino condizionato può disfare — l'informazione su quale fosse lo stato
 * originale è già andata persa.
 *
 * Il modulo è diviso in due, e la divisione è il punto:
 *
 *  - `trovaViolazioni` è **pura**: riceve le voci del registro e i riferimenti di
 *    ogni file, e restituisce le violazioni. È lì che vivono le regole, ed è lì
 *    che i test unitari le mettono alla prova, senza filesystem né archivio.
 *  - il resto è il guscio: deriva il registro dagli export di `titoli.ts`, legge
 *    i `*.spec.ts`, stampa e esce con codice 1.
 *
 * Il registro si *deriva*, non si scrive: nessuna seconda lista da tenere
 * allineata, e dimenticarsi di registrare una costante nuova è impossibile per
 * costruzione.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as registro from './titoli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** La cartella dei file di spec, cioè ciò che il controllo sorveglia. */
export const CARTELLA_SPEC = join(__dirname, '..');

/**
 * Il formato di un ISIN: due lettere di paese, nove caratteri alfanumerici, una
 * cifra di controllo. La cifra non è verificata — non è compito di questo
 * controllo — ma la forma basta a distinguere un identificativo da una parola.
 */
const FORMATO_ISIN = /\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g;

/** Gli helper che *scrivono* in archivio: passare loro un letterale aggira il registro. */
const HELPER_CHE_MUTANO = ['seminaTitolo', 'rimuoviTitolo', 'seminaOsservazioni', 'rimuoviOsservazioni'];

/** Le importazioni dal registro, da cui si risolvono le costanti a ISIN. */
const IMPORT_DAL_REGISTRO = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*'\.\/support\/titoli\.js'/g;

/** Una chiave del registro, appiattita: la costante che la dichiara e chi la possiede. */
export interface VoceRegistro {
  /** Nome della costante che la dichiara, per poterla nominare nel messaggio d'errore. */
  costante: string;
  isin: string;
  /** Il file di spec proprietario: l'unico che può seminarla o rimuoverla. */
  file: string;
  /** I file che possono nominarla senza scrivere in archivio. */
  lettoDa: string[];
}

/** Ciò che un file di spec nomina, e come. */
export interface RiferimentiFile {
  file: string;
  /** Ogni ISIN che il file nomina: letterale nel sorgente o costante importata. */
  isin: string[];
  /** Gli ISIN passati come letterale a un helper che scrive in archivio. */
  seminatiComeLetterale: string[];
}

/** Quale regola è stata infranta. Le cinque sono documentate su `trovaViolazioni`. */
export type Regola = 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

/** Una violazione, già pronta da stampare. */
export interface Violazione {
  regola: Regola;
  isin: string;
  messaggio: string;
}

/** Riconosce una `ChiaveRiservata` fra gli export del registro. */
function eChiaveRiservata(valore: unknown): valore is { isin: string; file: string; lettoDa?: string[] } {
  if (typeof valore !== 'object' || valore === null) return false;
  const candidato = valore as Record<string, unknown>;
  return typeof candidato.isin === 'string' && typeof candidato.file === 'string';
}

/**
 * Deriva le voci del registro dagli export di `titoli.ts`, appiattendo gli array
 * (`TITOLI_US_035_OBSOLETI` e simili).
 *
 * Gli export che non sono chiavi riservate — `ISIN_CON_OSSERVAZIONI_E2E`, che è
 * un elenco di stringhe — sono ignorati per assenza dei campi, non per un elenco
 * di eccezioni da tenere aggiornato.
 */
export function raccogliVoci(modulo: Record<string, unknown>): VoceRegistro[] {
  const voci: VoceRegistro[] = [];
  for (const [costante, valore] of Object.entries(modulo)) {
    for (const elemento of Array.isArray(valore) ? valore : [valore]) {
      if (!eChiaveRiservata(elemento)) continue;
      voci.push({
        costante,
        isin: elemento.isin,
        file: elemento.file,
        lettoDa: elemento.lettoDa ?? [],
      });
    }
  }
  return voci;
}

/**
 * Ricava da un sorgente gli ISIN che nomina: i letterali che ne hanno la forma,
 * più quelli delle costanti importate dal registro.
 *
 * I letterali sono cercati in tutto il file, commenti compresi. È deliberato: un
 * commento che nomina la chiave di un altro file è documentazione che invecchia
 * male esattamente come il codice, e qui interessa sapere che quel nome compare.
 */
export function riferimentiDi(file: string, sorgente: string, voci: VoceRegistro[]): RiferimentiFile {
  const perCostante = new Map<string, string[]>();
  for (const voce of voci) {
    const elenco = perCostante.get(voce.costante) ?? [];
    elenco.push(voce.isin);
    perCostante.set(voce.costante, elenco);
  }

  const isin = new Set<string>(sorgente.match(FORMATO_ISIN) ?? []);

  for (const blocco of sorgente.matchAll(IMPORT_DAL_REGISTRO)) {
    for (const voce of blocco[1].split(',')) {
      // `X as Y` conta come riferimento a X: l'alias non cambia la chiave nominata.
      const nome = voce.trim().split(/\s+as\s+/)[0].trim();
      for (const chiave of perCostante.get(nome) ?? []) isin.add(chiave);
    }
  }

  const seminatiComeLetterale = new Set<string>();
  for (const helper of HELPER_CHE_MUTANO) {
    const chiamata = new RegExp(`${helper}\\(\\s*'([A-Z0-9]{12})'`, 'g');
    for (const trovata of sorgente.matchAll(chiamata)) seminatiComeLetterale.add(trovata[1]);
  }

  return { file, isin: [...isin], seminatiComeLetterale: [...seminatiComeLetterale] };
}

/**
 * Applica le cinque regole e restituisce le violazioni, ordinate.
 *
 * | Regola | Cosa vieta | Perché |
 * |---|---|---|
 * | R1 | Due voci con lo stesso ISIN e proprietario diverso | È la collisione che intreccia i due stack di undo: l'ultimo a ripristinare torna allo stato lasciato dall'altro, e l'originale è già perduto |
 * | R2 | Un file che riferisce un ISIN non suo e in cui non compare fra i `lettoDa` | La premessa è ereditata da un altro file invece che costruita |
 * | R3 | Un ISIN presente in due o più file e assente dal registro | Senza questa, due file potrebbero inventarsi lo stesso letterale e sfuggire a R1 e R2 |
 * | R4 | Una voce il cui proprietario non esiste, o non la riferisce mai | Una riserva morta è una chiave che nessuno controlla più |
 * | R5 | Un letterale passato a un helper che scrive in archivio | È la scorciatoia che aggirerebbe tutto quanto sopra |
 */
export function trovaViolazioni(voci: VoceRegistro[], riferimenti: RiferimentiFile[]): Violazione[] {
  const violazioni: Violazione[] = [];

  const vociPerIsin = new Map<string, VoceRegistro[]>();
  for (const voce of voci) {
    vociPerIsin.set(voce.isin, [...(vociPerIsin.get(voce.isin) ?? []), voce]);
  }

  // ─── R1: due proprietari sulla stessa chiave ────────────────────────────────
  for (const [isin, condivise] of vociPerIsin) {
    const proprietari = [...new Set(condivise.map((v) => v.file))].sort();
    if (proprietari.length < 2) continue;
    const costanti = condivise.map((v) => v.costante).join(', ');
    violazioni.push({
      regola: 'R1',
      isin,
      messaggio:
        `${isin} è dichiarato da ${proprietari.length} file diversi (${proprietari.join(', ')}) ` +
        `tramite ${costanti}. Assegna a uno dei due una chiave nuova: seminare e ripristinare ` +
        `è uno stack di undo, e due file in parallelo si rimetterebbero a vicenda lo stato sbagliato.`,
    });
  }

  // ─── R2: premessa ereditata da un altro file ────────────────────────────────
  for (const riferimento of riferimenti) {
    for (const isin of riferimento.isin) {
      const dichiarate = vociPerIsin.get(isin);
      if (dichiarate === undefined) continue;
      const consentito = dichiarate.some(
        (voce) => voce.file === riferimento.file || voce.lettoDa.includes(riferimento.file),
      );
      if (consentito) continue;
      const proprietari = [...new Set(dichiarate.map((v) => v.file))].sort();
      violazioni.push({
        regola: 'R2',
        isin,
        messaggio:
          `${riferimento.file} nomina ${isin}, riservato a ${proprietari.join(', ')}. ` +
          `Dagli una chiave propria e falla seminare dal file, oppure — se il file non tocca mai ` +
          `l'archivio — aggiungilo ai \`lettoDa\` della voce.`,
      });
    }
  }

  // ─── R3: chiave condivisa e mai dichiarata ──────────────────────────────────
  const fileNonDichiarati = new Map<string, string[]>();
  for (const riferimento of riferimenti) {
    for (const isin of riferimento.isin) {
      if (vociPerIsin.has(isin)) continue;
      fileNonDichiarati.set(isin, [...(fileNonDichiarati.get(isin) ?? []), riferimento.file]);
    }
  }
  for (const [isin, file] of fileNonDichiarati) {
    if (file.length < 2) continue;
    violazioni.push({
      regola: 'R3',
      isin,
      messaggio:
        `${isin} compare in ${file.length} file (${[...file].sort().join(', ')}) e non è dichiarato ` +
        `in support/titoli.ts. Dichiaralo con un proprietario, così il controllo può sorvegliarlo.`,
    });
  }

  // ─── R4: riserva morta ──────────────────────────────────────────────────────
  const perFile = new Map(riferimenti.map((r) => [r.file, r]));
  for (const voce of voci) {
    const riferimento = perFile.get(voce.file);
    if (riferimento === undefined) {
      violazioni.push({
        regola: 'R4',
        isin: voce.isin,
        messaggio: `${voce.costante} si dichiara riservata a ${voce.file}, che non esiste.`,
      });
      continue;
    }
    if (riferimento.isin.includes(voce.isin)) continue;
    violazioni.push({
      regola: 'R4',
      isin: voce.isin,
      messaggio:
        `${voce.costante} si dichiara riservata a ${voce.file}, che non la nomina mai. ` +
        `Una riserva morta è una chiave che nessuno controlla più: togli la voce o correggi il proprietario.`,
    });
  }

  // ─── R5: letterale passato a un helper che scrive ───────────────────────────
  for (const riferimento of riferimenti) {
    for (const isin of riferimento.seminatiComeLetterale) {
      violazioni.push({
        regola: 'R5',
        isin,
        messaggio:
          `${riferimento.file} passa il letterale '${isin}' a un helper che scrive in archivio. ` +
          `Dichiara la chiave in support/titoli.ts e passa la costante: un letterale seminato ` +
          `sfugge a ogni altra regola.`,
      });
    }
  }

  return violazioni.sort(
    (a, b) => a.regola.localeCompare(b.regola) || a.isin.localeCompare(b.isin) || a.messaggio.localeCompare(b.messaggio),
  );
}

/**
 * Elenca i `*.spec.ts` sotto la cartella indicata, sottocartelle comprese.
 *
 * Ricorsivo di proposito: oggi le spec stanno tutte in `e2e/`, ma una lettura
 * piatta salterebbe *in silenzio* una spec messa in una sottocartella — e un
 * controllo che tace su ciò che non ha guardato dà una garanzia che non ha.
 */
function elencaSpec(cartella: string, prefisso = ''): string[] {
  const trovate: string[] = [];
  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    const relativo = prefisso === '' ? voce.name : `${prefisso}/${voce.name}`;
    if (voce.isDirectory()) {
      trovate.push(...elencaSpec(join(cartella, voce.name), relativo));
    } else if (voce.name.endsWith('.spec.ts')) {
      trovate.push(relativo);
    }
  }
  return trovate.sort();
}

/** Legge i riferimenti di ogni `*.spec.ts` della cartella indicata. */
export function leggiRiferimenti(cartella: string, voci: VoceRegistro[]): RiferimentiFile[] {
  return elencaSpec(cartella).map((nome) =>
    riferimentiDi(nome, readFileSync(join(cartella, nome), 'utf8'), voci),
  );
}

/** Esegue il controllo completo: registro derivato, file letti, regole applicate. */
export function verificaChiavi(cartella: string = CARTELLA_SPEC): Violazione[] {
  const voci = raccogliVoci(registro as unknown as Record<string, unknown>);
  return trovaViolazioni(voci, leggiRiferimenti(cartella, voci));
}

/** Rende le violazioni in un testo leggibile, una per riga con la regola infranta. */
export function formattaViolazioni(violazioni: Violazione[]): string {
  return violazioni.map((v) => `  [${v.regola}] ${v.messaggio}`).join('\n');
}

/** L'intestazione del rapporto: al singolare quando la violazione è una sola. */
export function intestazioneViolazioni(quante: number): string {
  return quante === 1
    ? '1 violazione della regola un-ISIN-per-file:'
    : `${quante} violazioni della regola un-ISIN-per-file:`;
}

// ─── Guscio CLI ───────────────────────────────────────────────────────────────
// Eseguito da `npm run check:chiavi`. Importato altrove (bonifica, test unitari)
// questo blocco non gira.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violazioni = verificaChiavi();
  if (violazioni.length === 0) {
    console.log('[chiavi] nessuna violazione: ogni chiave seminata appartiene a un solo file.');
  } else {
    console.error(`[chiavi] ${intestazioneViolazioni(violazioni.length)}\n`);
    console.error(formattaViolazioni(violazioni));
    console.error('\nLa regola e i casi leciti sono documentati in e2e/support/titoli.ts.');
    process.exit(1);
  }
}
