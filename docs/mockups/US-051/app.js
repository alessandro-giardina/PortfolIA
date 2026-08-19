/* ============================================================
   PortfolIA — Quadro strumenti · comportamento del prototipo
   Solo JavaScript semplice: tema, rivelazioni, grafici SVG,
   comandi segmentati. Nessuna dipendenza, nessun bundler.
   MOCKUP — non è codice di produzione.
   ============================================================ */

(() => {
  'use strict';

  /* ---------- Formattatori ---------- */

  const euro = (n, dec = 2) =>
    n.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const conSegno = (n, dec = 2) => (n >= 0 ? '+' : '−') + euro(Math.abs(n), dec);

  /* ---------- Tema ---------- */

  const CHIAVE_TEMA = 'portfolia-quadro-tema';

  function applicaTema(tema) {
    document.documentElement.setAttribute('data-tema', tema);
    try {
      localStorage.setItem(CHIAVE_TEMA, tema);
    } catch (_) {
      /* pagina aperta da file:// con storage negato: il tema resta di sessione */
    }
  }

  function avviaTema() {
    let salvato = null;
    try {
      salvato = localStorage.getItem(CHIAVE_TEMA);
    } catch (_) { /* ignora */ }
    applicaTema(salvato || 'scuro');

    const bottone = document.querySelector('[data-azione="tema"]');
    if (!bottone) return;
    bottone.addEventListener('click', () => {
      const attuale = document.documentElement.getAttribute('data-tema');
      applicaTema(attuale === 'chiaro' ? 'scuro' : 'chiaro');
      ridisegnaTutto();
    });
  }

  /* ---------- Rivelazione in ingresso ---------- */

  function avviaRivelazioni() {
    const elementi = Array.from(document.querySelectorAll('.entra'));
    if (!elementi.length) return;

    const osservatore = new IntersectionObserver(
      (voci, self) => {
        voci.forEach((voce) => {
          if (!voce.isIntersecting) return;
          const indice = Number(voce.target.dataset.ritardo || 0);
          voce.target.style.animationDelay = `${Math.min(indice, 8) * 55}ms`;
          voce.target.classList.add('dentro');
          self.unobserve(voce.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    );

    elementi.forEach((el, i) => {
      if (!el.dataset.ritardo) el.dataset.ritardo = String(i % 6);
      osservatore.observe(el);
    });
  }

  /* ---------- Grafico a linee ---------- */

  const NS = 'http://www.w3.org/2000/svg';
  const el = (nome, attributi) => {
    const nodo = document.createElementNS(NS, nome);
    Object.entries(attributi || {}).forEach(([k, v]) => nodo.setAttribute(k, String(v)));
    return nodo;
  };

  const stile = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

  /**
   * Disegna una o più serie dentro un contenitore.
   * serie: [{ nome, colore, punti: number[], tratteggio?, area?, gradini? }]
   * opzioni: { etichette: string[], formato, riferimento?: { valore, testo, colore } }
   */
  function disegnaGrafico(contenitore, serie, opzioni) {
    const L = 960;
    const A = 320;
    const M = { su: 18, giu: 34, sx: 74, dx: 16 };
    const larghezza = L - M.sx - M.dx;
    const altezza = A - M.su - M.giu;

    const tutti = serie.flatMap((s) => s.punti).concat(opzioni.riferimento ? [opzioni.riferimento.valore] : []);
    const grezzoMin = Math.min(...tutti);
    const grezzoMax = Math.max(...tutti);
    const margine = (grezzoMax - grezzoMin) * 0.16 || grezzoMax * 0.1 || 1;
    const min = Math.max(0, grezzoMin - margine);
    const max = grezzoMax + margine;

    const n = opzioni.etichette.length;
    const px = (i) => M.sx + (n === 1 ? larghezza / 2 : (i / (n - 1)) * larghezza);
    const py = (v) => M.su + altezza - ((v - min) / (max - min)) * altezza;

    contenitore.textContent = '';
    const svg = el('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': opzioni.descrizione || 'Grafico' });

    const griglia = stile('--bordo');
    const inchiostro3 = stile('--testo-3');

    /* Righe orizzontali + scala verticale */
    const passi = 4;
    for (let i = 0; i <= passi; i += 1) {
      const v = min + ((max - min) * i) / passi;
      const y = py(v);
      svg.appendChild(el('line', { x1: M.sx, x2: L - M.dx, y1: y, y2: y, stroke: griglia, 'stroke-width': 1 }));
      const testo = el('text', {
        x: M.sx - 12,
        y: y + 4,
        'text-anchor': 'end',
        fill: inchiostro3,
        'font-size': 12,
        'font-family': 'IBM Plex Mono, monospace',
      });
      testo.textContent = opzioni.formato(v);
      svg.appendChild(testo);
    }

    /* Etichette dell'asse dei tempi — diradate su serie lunghe */
    const salto = Math.max(1, Math.ceil(n / 9));
    opzioni.etichette.forEach((etichetta, i) => {
      if (i % salto !== 0 && i !== n - 1) return;
      const testo = el('text', {
        x: px(i),
        y: A - 10,
        'text-anchor': i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle',
        fill: inchiostro3,
        'font-size': 12,
        'font-family': 'Manrope, sans-serif',
      });
      testo.textContent = etichetta;
      svg.appendChild(testo);
    });

    /* Riferimento orizzontale (prezzo medio di carico) */
    if (opzioni.riferimento) {
      const y = py(opzioni.riferimento.valore);
      svg.appendChild(
        el('line', {
          x1: M.sx, x2: L - M.dx, y1: y, y2: y,
          stroke: opzioni.riferimento.colore,
          'stroke-width': 1.5,
          'stroke-dasharray': '2 6',
          opacity: 0.9,
        }),
      );
      const eti = el('text', {
        x: M.sx + 8, y: y - 9, fill: opzioni.riferimento.colore, 'font-size': 12, 'font-weight': 700,
        'font-family': 'Manrope, sans-serif',
      });
      eti.textContent = opzioni.riferimento.testo;
      svg.appendChild(eti);
    }

    /* Serie */
    serie.forEach((s, indiceSerie) => {
      const d = s.punti
        .map((v, i) => {
          if (i === 0) return `M ${px(i)} ${py(v)}`;
          return s.gradini ? `H ${px(i)} V ${py(v)}` : `L ${px(i)} ${py(v)}`;
        })
        .join(' ');

      if (s.area) {
        const idGrad = `grad-${indiceSerie}-${Math.round(px(0))}`;
        const defs = el('defs');
        const grad = el('linearGradient', { id: idGrad, x1: 0, y1: 0, x2: 0, y2: 1 });
        grad.appendChild(el('stop', { offset: '0%', 'stop-color': s.colore, 'stop-opacity': 0.28 }));
        grad.appendChild(el('stop', { offset: '100%', 'stop-color': s.colore, 'stop-opacity': 0 }));
        defs.appendChild(grad);
        svg.appendChild(defs);
        svg.appendChild(
          el('path', {
            d: `${d} L ${px(s.punti.length - 1)} ${M.su + altezza} L ${px(0)} ${M.su + altezza} Z`,
            fill: `url(#${idGrad})`,
          }),
        );
      }

      svg.appendChild(
        el('path', {
          d,
          fill: 'none',
          stroke: s.colore,
          'stroke-width': s.tratteggio ? 2 : 2.6,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
          'stroke-dasharray': s.tratteggio || '',
        }),
      );

      if (!s.tratteggio && s.punti.length <= 14) {
        s.punti.forEach((v, i) => {
          svg.appendChild(el('circle', { cx: px(i), cy: py(v), r: 3.6, fill: stile('--superficie'), stroke: s.colore, 'stroke-width': 2 }));
        });
      }
    });

    /* Cursore + suggerimento */
    const cursore = el('line', {
      x1: 0, x2: 0, y1: M.su, y2: M.su + altezza,
      stroke: stile('--bordo-forte'), 'stroke-width': 1, opacity: 0,
    });
    svg.appendChild(cursore);
    const pallina = el('circle', { r: 5.5, fill: serie[0].colore, stroke: stile('--superficie'), 'stroke-width': 2.5, opacity: 0 });
    svg.appendChild(pallina);

    contenitore.appendChild(svg);

    const nota = document.createElement('div');
    nota.className = 'suggerimento';
    contenitore.appendChild(nota);

    const muovi = (evento) => {
      const rett = svg.getBoundingClientRect();
      const frazione = (evento.clientX - rett.left) / rett.width;
      const xVista = frazione * L;
      let indice = Math.round(((xVista - M.sx) / larghezza) * (n - 1));
      indice = Math.max(0, Math.min(n - 1, indice));

      const valore = serie[0].punti[indice];
      cursore.setAttribute('x1', px(indice));
      cursore.setAttribute('x2', px(indice));
      cursore.setAttribute('opacity', 1);
      pallina.setAttribute('cx', px(indice));
      pallina.setAttribute('cy', py(valore));
      pallina.setAttribute('opacity', 1);

      nota.innerHTML = `<span class="quando">${opzioni.etichette[indice]}</span><span class="quanto">${opzioni.formato(valore, true)}</span>`;
      nota.style.left = `${(px(indice) / L) * 100}%`;
      nota.style.top = `${(py(valore) / A) * 100}%`;
      nota.classList.add('visibile');
    };

    const esci = () => {
      cursore.setAttribute('opacity', 0);
      pallina.setAttribute('opacity', 0);
      nota.classList.remove('visibile');
    };

    svg.addEventListener('mousemove', muovi);
    svg.addEventListener('mouseleave', esci);
  }

  /* ---------- Ciambella della composizione ---------- */

  function disegnaCiambella(contenitore, fette) {
    const raggio = 70;
    const circonferenza = 2 * Math.PI * raggio;
    const totale = fette.reduce((s, f) => s + f.valore, 0);
    let scorso = 0;

    contenitore.textContent = '';
    const svg = el('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': 'Composizione del portafoglio' });
    svg.appendChild(el('circle', {
      cx: 100, cy: 100, r: raggio, fill: 'none',
      stroke: stile('--superficie-3'), 'stroke-width': 22,
    }));

    fette.forEach((fetta) => {
      const parte = (fetta.valore / totale) * circonferenza;
      const arco = el('circle', {
        cx: 100, cy: 100, r: raggio, fill: 'none',
        stroke: fetta.colore,
        'stroke-width': 22,
        'stroke-dasharray': `${parte - 3} ${circonferenza - parte + 3}`,
        'stroke-dashoffset': -scorso,
        transform: 'rotate(-90 100 100)',
        'stroke-linecap': 'butt',
      });
      arco.dataset.isin = fetta.isin;
      svg.appendChild(arco);
      scorso += parte;
    });

    contenitore.appendChild(svg);

    const centro = document.createElement('div');
    centro.className = 'centro';
    centro.innerHTML = `<span class="et">Valorizzato</span><span class="cifra">€ ${euro(totale)}</span>`;
    contenitore.appendChild(centro);
  }

  function collegaLegenda(contenitore, ciambella) {
    contenitore.querySelectorAll('.quota').forEach((riga) => {
      const accendi = () => {
        ciambella.classList.add('evidenzia');
        ciambella.querySelectorAll('circle[data-isin]').forEach((arco) => {
          arco.classList.toggle('acceso', arco.dataset.isin === riga.dataset.isin);
        });
      };
      const spegni = () => {
        ciambella.classList.remove('evidenzia');
        ciambella.querySelectorAll('circle[data-isin]').forEach((arco) => arco.classList.remove('acceso'));
      };
      riga.addEventListener('mouseenter', accendi);
      riga.addEventListener('focus', accendi);
      riga.addEventListener('mouseleave', spegni);
      riga.addEventListener('blur', spegni);
    });
  }

  /* ---------- Dati del prototipo ---------- */

  const SERIE_PORTAFOGLIO = {
    anno: {
      etichette: ['set 25', 'ott 25', 'nov 25', 'dic 25', 'gen 26', 'feb 26', 'mar 26', 'apr 26', 'mag 26', 'giu 26', 'lug 26', 'ago 26'],
      valore: [26120, 26980, 27540, 26890, 28310, 29240, 28870, 30110, 31240, 30880, 32460, 33374.4],
      carico: [24900, 24900, 26050, 26050, 26050, 28300, 28300, 28300, 31492.55, 31492.55, 31492.55, 31492.55],
    },
    cinque: {
      etichette: ['ago 24', 'nov 24', 'feb 25', 'mag 25', 'ago 25', 'nov 25', 'feb 26', 'mag 26', 'ago 26'],
      valore: [9120, 13260, 17840, 21930, 25680, 27540, 29240, 31240, 33374.4],
      carico: [8900, 12400, 16900, 21100, 24900, 26050, 28300, 31492.55, 31492.55],
    },
    tutto: {
      etichette: ['mar 24', 'set 24', 'mar 25', 'set 25', 'mar 26', 'ago 26'],
      valore: [3565, 11480, 19260, 26120, 28870, 33374.4],
      carico: [3565, 11200, 18600, 24900, 28300, 31492.55],
    },
  };

  const COMPOSIZIONE = [
    { nome: 'iShares Core MSCI World UCITS ETF', isin: 'IE00B4L5Y983', valore: 11058.0, colore: '#58a6ff' },
    { nome: 'Vanguard FTSE All-World UCITS ETF', isin: 'IE00BK5BQT80', valore: 10094.6, colore: '#b18cff' },
    { nome: 'Xtrackers MSCI Emerging Markets', isin: 'IE00BTJRMP35', valore: 9076.2, colore: '#4fd6d1' },
    { nome: 'SPDR MSCI ACWI IMI UCITS ETF', isin: 'IE00B3YLTY66', valore: 3145.6, colore: '#f2b544' },
  ];

  const QUANTITA_TITOLO = 120;

  const SERIE_TITOLO = {
    mese: {
      etichette: ['15 lug', '22 lug', '29 lug', '05 ago', '09 ago', '12 ago'],
      prezzi: [90.1, 90.85, 89.92, 90.44, 91.37, 92.15],
      quote: [120, 120, 120, 120, 120, 120],
      finestra: '12 lug 2026 → 12 ago 2026 · 31 giorni · 6 punti',
      variazione: { assoluta: 2.05, percento: 2.28, etichetta: 'ultimo mese' },
    },
    anno: {
      etichette: ['ago 25', 'set 25', 'ott 25', 'nov 25', 'dic 25', 'gen 26', 'feb 26', 'mar 26', 'apr 26', 'giu 26', 'lug 26', 'ago 26'],
      prezzi: [81.2, 82.65, 80.9, 83.4, 85.1, 84.3, 86.75, 88.2, 87.1, 89.6, 91.37, 92.15],
      quote: [120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120],
      finestra: '12 ago 2025 → 12 ago 2026 · 366 giorni · 12 punti',
      variazione: { assoluta: 10.95, percento: 13.49, etichetta: 'ultimo anno' },
    },
    cinque: {
      etichette: ['mar 24', 'giu 24', 'set 24', 'nov 24', 'feb 25', 'apr 25', 'ago 25', 'dic 25', 'apr 26', 'ago 26'],
      prezzi: [71.3, 74.5, 76.8, 79.95, 82.4, 88.24, 81.2, 83.4, 88.2, 92.15],
      quote: [50, 50, 50, 90, 90, 120, 120, 120, 120, 120],
      finestra: '14 mar 2024 → 12 ago 2026 · dal primo carico · 10 punti',
      variazione: { assoluta: 20.85, percento: 29.24, etichetta: 'ultimi 5 anni' },
    },
  };
  SERIE_TITOLO.tutto = SERIE_TITOLO.cinque;

  /* ---------- Montaggio delle pagine ---------- */

  let ridisegnaTutto = () => {};

  function montaRiepilogo() {
    const zona = document.querySelector('[data-grafico="portafoglio"]');
    if (!zona) return;

    let scala = 'anno';

    const disegna = () => {
      const dati = SERIE_PORTAFOGLIO[scala];
      disegnaGrafico(
        zona,
        [
          { nome: 'Valore attuale', colore: stile('--accento'), punti: dati.valore, area: true },
          { nome: 'Capitale investito', colore: stile('--testo-3'), punti: dati.carico, tratteggio: '6 5', gradini: true },
        ],
        {
          etichette: dati.etichette,
          descrizione: 'Andamento del valore del portafoglio confrontato con il capitale investito',
          formato: (v, esteso) => (esteso ? `€ ${euro(v)}` : `€ ${Math.round(v / 1000)}k`),
        },
      );
    };

    document.querySelectorAll('[data-scala-portafoglio]').forEach((bottone) => {
      bottone.addEventListener('click', () => {
        scala = bottone.dataset.scalaPortafoglio;
        document.querySelectorAll('[data-scala-portafoglio]').forEach((b) => b.setAttribute('aria-pressed', String(b === bottone)));
        disegna();
      });
    });

    const ciambella = document.querySelector('.ciambella');
    const elenco = document.querySelector('.elenco-quote');
    if (ciambella && elenco) {
      const totale = COMPOSIZIONE.reduce((s, f) => s + f.valore, 0);
      elenco.innerHTML = COMPOSIZIONE.map(
        (f) => `
        <div class="quota" data-isin="${f.isin}" tabindex="0">
          <span class="punto" style="background:${f.colore}"></span>
          <span class="nome"><strong>${f.nome}</strong><span>${f.isin}</span></span>
          <span class="valori"><b>€ ${euro(f.valore)}</b><span>${euro((f.valore / totale) * 100, 1)} %</span></span>
        </div>`,
      ).join('');
      disegnaCiambella(ciambella, COMPOSIZIONE);
      collegaLegenda(elenco, ciambella);
    }

    disegna();
    ridisegnaTutto = () => {
      disegna();
      if (ciambella) disegnaCiambella(ciambella, COMPOSIZIONE);
    };
  }

  function montaSchedaTitolo() {
    const zona = document.querySelector('[data-grafico="titolo"]');
    if (!zona) return;

    let scala = 'anno';
    let vista = 'prezzo';

    const scriviContesto = () => {
      const dati = SERIE_TITOLO[scala];
      const finestra = document.querySelector('[data-campo="finestra"]');
      if (finestra) finestra.textContent = dati.finestra;

      const ordinata = document.querySelector('[data-campo="ordinata"]');
      if (ordinata) {
        ordinata.textContent = vista === 'prezzo'
          ? 'prezzo di una singola quota'
          : 'controvalore delle quote possedute alla data';
      }

      const importo = document.querySelector('[data-campo="variazione-importo"]');
      const percento = document.querySelector('[data-campo="variazione-percento"]');
      const etichetta = document.querySelector('[data-campo="variazione-finestra"]');
      if (importo) importo.textContent = `${conSegno(dati.variazione.assoluta, 4)} €`;
      if (percento) percento.textContent = `${conSegno(dati.variazione.percento)} %`;
      if (etichetta) etichetta.textContent = dati.variazione.etichetta;
    };

    const disegna = () => {
      const dati = SERIE_TITOLO[scala];
      const punti = vista === 'prezzo' ? dati.prezzi : dati.prezzi.map((p, i) => p * dati.quote[i]);
      const riferimento = vista === 'prezzo'
        ? { valore: 78.42, testo: 'prezzo medio di carico € 78,4200', colore: stile('--ambra') }
        : { valore: 9410.4, testo: 'capitale investito € 9.410,40', colore: stile('--ambra') };

      disegnaGrafico(
        zona,
        [{ nome: vista === 'prezzo' ? 'Prezzo unitario' : 'Valore della posizione', colore: stile('--accento'), punti, area: true }],
        {
          etichette: dati.etichette,
          descrizione: 'Andamento del titolo',
          riferimento,
          formato: (v, esteso) =>
            vista === 'prezzo'
              ? `€ ${euro(v, esteso ? 4 : 2)}`
              : esteso ? `€ ${euro(v)}` : `€ ${Math.round(v / 1000)}k`,
        },
      );
      scriviContesto();
    };

    document.querySelectorAll('[data-scala-titolo]').forEach((bottone) => {
      bottone.addEventListener('click', () => {
        scala = bottone.dataset.scalaTitolo;
        document.querySelectorAll('[data-scala-titolo]').forEach((b) => b.setAttribute('aria-pressed', String(b === bottone)));
        disegna();
      });
    });

    document.querySelectorAll('[data-vista-titolo]').forEach((bottone) => {
      bottone.addEventListener('click', () => {
        vista = bottone.dataset.vistaTitolo;
        document.querySelectorAll('[data-vista-titolo]').forEach((b) => b.setAttribute('aria-pressed', String(b === bottone)));
        disegna();
      });
    });

    disegna();
    ridisegnaTutto = disegna;
  }

  /* ---------- Righe cliccabili ---------- */

  function avviaRigheCliccabili() {
    document.querySelectorAll('tr.cliccabile[data-vai]').forEach((riga) => {
      const vai = () => { window.location.href = riga.dataset.vai; };
      riga.addEventListener('click', vai);
      riga.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vai(); }
      });
    });
  }

  /* ---------- Avvio ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    avviaTema();
    avviaRivelazioni();
    avviaRigheCliccabili();
    montaRiepilogo();
    montaSchedaTitolo();
    void QUANTITA_TITOLO;
  });
})();
