/**
 * Le cinque regole del controllo delle chiavi, messe alla prova una per una.
 *
 * `trovaViolazioni` è pura di proposito — riceve voci e riferimenti, non tocca il
 * filesystem — ed è per questo che le regole si possono provare qui invece che
 * facendo fallire la suite E2E vera. Il caso R1 è la prova negativa che il campo
 * *Dimostra* di US-040 richiede: due file che dichiarano la stessa chiave devono
 * produrre una violazione.
 */
import { describe, expect, it } from 'vitest';
import {
  raccogliVoci,
  riferimentiDi,
  trovaViolazioni,
  type RiferimentiFile,
  type VoceRegistro,
} from './verifica-chiavi.js';

/** Una voce di registro, con i campi non interessanti già riempiti. */
function voce(parziale: Partial<VoceRegistro> & Pick<VoceRegistro, 'isin' | 'file'>): VoceRegistro {
  return { costante: 'TITOLO_DI_PROVA', lettoDa: [], ...parziale };
}

/** I riferimenti di un file, con i campi non interessanti già riempiti. */
function riferimenti(
  parziale: Partial<RiferimentiFile> & Pick<RiferimentiFile, 'file'>,
): RiferimentiFile {
  return { isin: [], seminatiComeLetterale: [], ...parziale };
}

const REGOLE = (violazioni: { regola: string }[]) => violazioni.map((v) => v.regola);

describe('trovaViolazioni', () => {
  it('non trova nulla quando ogni file possiede e nomina le proprie chiavi', () => {
    const voci = [
      voce({ costante: 'TITOLO_A', isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts' }),
      voce({ costante: 'TITOLO_B', isin: 'IE00B5BMR087', file: 'US-002__b.spec.ts' }),
    ];
    const rif = [
      riferimenti({ file: 'US-001__a.spec.ts', isin: ['IE00B4L5Y983'] }),
      riferimenti({ file: 'US-002__b.spec.ts', isin: ['IE00B5BMR087'] }),
    ];

    expect(trovaViolazioni(voci, rif)).toEqual([]);
  });

  it('R1: due file che dichiarano la stessa chiave producono una violazione', () => {
    const voci = [
      voce({ costante: 'TITOLO_A', isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts' }),
      voce({ costante: 'TITOLO_B', isin: 'IE00B4L5Y983', file: 'US-002__b.spec.ts' }),
    ];
    const rif = [
      riferimenti({ file: 'US-001__a.spec.ts', isin: ['IE00B4L5Y983'] }),
      riferimenti({ file: 'US-002__b.spec.ts', isin: ['IE00B4L5Y983'] }),
    ];

    const violazioni = trovaViolazioni(voci, rif);

    expect(REGOLE(violazioni)).toEqual(['R1']);
    expect(violazioni[0].isin).toBe('IE00B4L5Y983');
    // Il messaggio nomina entrambi i proprietari: è ciò che serve per sciogliere
    // la collisione senza andare a cercarli a mano.
    expect(violazioni[0].messaggio).toContain('US-001__a.spec.ts');
    expect(violazioni[0].messaggio).toContain('US-002__b.spec.ts');
  });

  it('R2: un file che nomina una chiave altrui produce una violazione', () => {
    const voci = [voce({ isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts' })];
    const rif = [
      riferimenti({ file: 'US-001__a.spec.ts', isin: ['IE00B4L5Y983'] }),
      riferimenti({ file: 'US-002__b.spec.ts', isin: ['IE00B4L5Y983'] }),
    ];

    const violazioni = trovaViolazioni(voci, rif);

    expect(REGOLE(violazioni)).toEqual(['R2']);
    expect(violazioni[0].messaggio).toContain('US-002__b.spec.ts');
  });

  it('R2: la lettura dichiarata con lettoDa resta lecita', () => {
    const voci = [
      voce({ isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts', lettoDa: ['US-002__b.spec.ts'] }),
    ];
    const rif = [
      riferimenti({ file: 'US-001__a.spec.ts', isin: ['IE00B4L5Y983'] }),
      riferimenti({ file: 'US-002__b.spec.ts', isin: ['IE00B4L5Y983'] }),
    ];

    expect(trovaViolazioni(voci, rif)).toEqual([]);
  });

  it('R3: una chiave presente in due file e mai dichiarata produce una violazione', () => {
    const rif = [
      riferimenti({ file: 'US-001__a.spec.ts', isin: ['IE00B4L5Y983'] }),
      riferimenti({ file: 'US-002__b.spec.ts', isin: ['IE00B4L5Y983'] }),
    ];

    const violazioni = trovaViolazioni([], rif);

    expect(REGOLE(violazioni)).toEqual(['R3']);
    expect(violazioni[0].isin).toBe('IE00B4L5Y983');
  });

  it('R3: una chiave presente in un solo file e mai dichiarata è ammessa', () => {
    // Un ISIN di stub servito solo con `route.fulfill()` in un file solo non
    // rischia nulla: non c'è un secondo file con cui intrecciare lo stack di undo.
    const rif = [riferimenti({ file: 'US-001__a.spec.ts', isin: ['IE00B4L5Y983'] })];

    expect(trovaViolazioni([], rif)).toEqual([]);
  });

  it('R4: una voce il cui proprietario non esiste produce una violazione', () => {
    const voci = [voce({ isin: 'IE00B4L5Y983', file: 'US-999__sparito.spec.ts' })];

    const violazioni = trovaViolazioni(voci, [riferimenti({ file: 'US-001__a.spec.ts' })]);

    expect(REGOLE(violazioni)).toEqual(['R4']);
    expect(violazioni[0].messaggio).toContain('non esiste');
  });

  it('R4: una voce che il proprietario non nomina mai produce una violazione', () => {
    const voci = [voce({ isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts' })];

    const violazioni = trovaViolazioni(voci, [riferimenti({ file: 'US-001__a.spec.ts' })]);

    expect(REGOLE(violazioni)).toEqual(['R4']);
    expect(violazioni[0].messaggio).toContain('non la nomina mai');
  });

  it('R5: un letterale passato a un helper che scrive produce una violazione', () => {
    const voci = [voce({ isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts' })];
    const rif = [
      riferimenti({
        file: 'US-001__a.spec.ts',
        isin: ['IE00B4L5Y983'],
        seminatiComeLetterale: ['IE00B4L5Y983'],
      }),
    ];

    const violazioni = trovaViolazioni(voci, rif);

    // Anche quando il file è il proprietario: seminare per letterale è la
    // scorciatoia che, su una chiave *non* dichiarata, aggirerebbe R1 e R2.
    expect(REGOLE(violazioni)).toEqual(['R5']);
  });
});

describe('riferimentiDi', () => {
  const voci = [
    voce({ costante: 'TITOLO_A', isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts' }),
    voce({ costante: 'TITOLI_MULTIPLI', isin: 'IE00B5BMR087', file: 'US-002__b.spec.ts' }),
    voce({ costante: 'TITOLI_MULTIPLI', isin: 'LU1781541179', file: 'US-002__b.spec.ts' }),
  ];

  it('riconosce i letterali che hanno la forma di un ISIN', () => {
    const sorgente = "await page.fill('#isin', 'IE00B4L5Y983');";

    expect(riferimentiDi('US-001__a.spec.ts', sorgente, voci).isin).toEqual(['IE00B4L5Y983']);
  });

  it('non scambia per ISIN una parola qualunque in maiuscolo', () => {
    const sorgente = "const MODIFICATORE = 'AUTOINCREMENTO';";

    expect(riferimentiDi('US-001__a.spec.ts', sorgente, voci).isin).toEqual([]);
  });

  it('risolve le costanti importate dal registro, array compresi', () => {
    const sorgente = "import { TITOLI_MULTIPLI } from './support/titoli.js';";

    expect(riferimentiDi('US-002__b.spec.ts', sorgente, voci).isin.sort()).toEqual([
      'IE00B5BMR087',
      'LU1781541179',
    ]);
  });

  it('risolve anche le importazioni su più righe', () => {
    const sorgente = [
      'import {',
      '  TITOLO_A,',
      '  TITOLI_MULTIPLI,',
      "} from './support/titoli.js';",
    ].join('\n');

    expect(riferimentiDi('US-001__a.spec.ts', sorgente, voci).isin.sort()).toEqual([
      'IE00B4L5Y983',
      'IE00B5BMR087',
      'LU1781541179',
    ]);
  });

  it('segnala i letterali passati agli helper che scrivono in archivio', () => {
    const sorgente = [
      "archivio.seminaTitolo('IE00B4L5Y983', {});",
      "archivio.rimuoviOsservazioni('IE00B5BMR087');",
      "archivio.leggiTitolo('LU1781541179');",
    ].join('\n');

    const trovati = riferimentiDi('US-001__a.spec.ts', sorgente, voci).seminatiComeLetterale;

    // `leggiTitolo` non scrive: non è fra gli helper sorvegliati.
    expect(trovati.sort()).toEqual(['IE00B4L5Y983', 'IE00B5BMR087']);
  });
});

describe('raccogliVoci', () => {
  it('appiattisce gli array e ignora gli export che non sono chiavi riservate', () => {
    const modulo = {
      TITOLO_SINGOLO: { isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts', campi: {} },
      TITOLI_MULTIPLI: [
        { isin: 'IE00B5BMR087', file: 'US-002__b.spec.ts', campi: {} },
        { isin: 'LU1781541179', file: 'US-002__b.spec.ts', campi: {} },
      ],
      ISIN_CON_OSSERVAZIONI_E2E: ['IE00B4L5Y983'],
      unaFunzione: () => 'niente',
    };

    expect(raccogliVoci(modulo)).toEqual([
      { costante: 'TITOLO_SINGOLO', isin: 'IE00B4L5Y983', file: 'US-001__a.spec.ts', lettoDa: [] },
      { costante: 'TITOLI_MULTIPLI', isin: 'IE00B5BMR087', file: 'US-002__b.spec.ts', lettoDa: [] },
      { costante: 'TITOLI_MULTIPLI', isin: 'LU1781541179', file: 'US-002__b.spec.ts', lettoDa: [] },
    ]);
  });
});
