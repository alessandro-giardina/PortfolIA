/* PortfolIA — US-007 · Ricerca titolo per ISIN (prototipo)
   Simula i tre stati: caricamento → trovato / non trovato.
   I dati sono fissi e provengono "da Borsa Italiana": nessun valore inventato. */

(function () {
  var bottone = document.getElementById('cerca');
  if (!bottone) return;

  var input = document.getElementById('isin');
  var esito = document.getElementById('esito');
  var anagrafica = document.getElementById('anagrafica');

  // Anagrafiche note (ordine = ordine dei campi richiesti dalla spec)
  var noti = {
    'IE00BMVB5S82': {
      Denominazione: 'iShares Core MSCI World UCITS ETF',
      'Prezzo attuale': '€ 94,55',
      Ticker: 'SWDA',
      'Tipo strumento': 'ETF azionario',
      'Commissioni totali annue': '0,20% (TER)',
      'Valuta di denominazione': 'EUR',
      Emittente: 'iShares (BlackRock)',
      Segmento: 'ETFplus',
      'Politica di distribuzione dividendi': 'ad accumulazione',
      ISIN: 'IE00BMVB5S82'
    },
    'IT0003128367': {
      Denominazione: 'ENEL S.p.A.',
      'Prezzo attuale': '€ 7,18',
      Ticker: 'ENEL',
      'Tipo strumento': 'Azione ordinaria',
      'Commissioni totali annue': null,           // non applicabile → assente
      'Valuta di denominazione': 'EUR',
      Emittente: 'ENEL S.p.A.',
      Segmento: 'Blue Chip (FTSE MIB)',
      'Politica di distribuzione dividendi': 'a distribuzione',
      ISIN: 'IT0003128367'
    },
    'IE00BMVB5R75': {
      Denominazione: 'iShares MSCI EM IMI UCITS ETF',
      'Prezzo attuale': '€ 25,15',
      Ticker: 'EIMI',
      'Tipo strumento': 'ETF azionario',
      'Commissioni totali annue': '0,18% (TER)',
      'Valuta di denominazione': 'USD',
      Emittente: 'iShares (BlackRock)',
      Segmento: 'ETFplus',
      'Politica di distribuzione dividendi': 'ad accumulazione',
      ISIN: 'IE00BMVB5R75'
    }
  };

  var ordine = [
    'Denominazione', 'Prezzo attuale', 'Ticker', 'Tipo strumento',
    'Commissioni totali annue', 'Valuta di denominazione', 'Emittente',
    'Segmento', 'Politica di distribuzione dividendi', 'ISIN'
  ];

  function riga(etichetta, valore) {
    var d = document.createElement('div');
    d.className = 'voce-def';
    var et = document.createElement('span');
    et.className = 'et';
    et.textContent = etichetta;
    var dato = document.createElement('span');
    if (valore === null || valore === undefined || valore === '') {
      dato.className = 'dato assente';
      dato.textContent = 'Dato non disponibile';
    } else {
      dato.className = 'dato';
      dato.textContent = valore;
    }
    d.appendChild(et);
    d.appendChild(dato);
    return d;
  }

  function mostraScheletro() {
    if (!anagrafica) return;
    anagrafica.innerHTML = '';
    ordine.forEach(function (et) {
      var d = document.createElement('div');
      d.className = 'voce-def';
      var s1 = document.createElement('span');
      s1.className = 'et'; s1.textContent = et;
      var s2 = document.createElement('span');
      s2.className = 'dato';
      var sk = document.createElement('span');
      sk.className = 'scheletro' + (et === 'Denominazione' ? ' lungo' : '');
      s2.appendChild(sk);
      d.appendChild(s1); d.appendChild(s2);
      anagrafica.appendChild(d);
    });
  }

  function mostraDati(rec) {
    if (!anagrafica) return;
    anagrafica.innerHTML = '';
    ordine.forEach(function (et) {
      anagrafica.appendChild(riga(et, rec[et]));
    });
  }

  function svuota() {
    if (anagrafica) anagrafica.innerHTML = '';
  }

  bottone.addEventListener('click', function () {
    var v = (input.value || '').trim().toUpperCase();

    if (v.length !== 12) {
      esito.innerHTML = '<span class="timbro">ISIN non valido</span> il codice deve avere 12 caratteri';
      svuota();
      return;
    }

    // Stato 2 — caricamento
    esito.innerHTML = '<span class="in-attesa"><span class="punto"></span> Interrogazione della fonte ufficiale in corso…</span>';
    bottone.disabled = true;
    bottone.textContent = 'Recupero…';
    mostraScheletro();

    setTimeout(function () {
      bottone.disabled = false;
      bottone.textContent = 'Recupera anagrafica';

      if (noti[v]) {
        // Stato 1 — trovato
        esito.innerHTML = '<span class="timbro verde">Titolo trovato</span> ' +
          noti[v].Denominazione + ' &middot; ' + noti[v]['Prezzo attuale'];
        mostraDati(noti[v]);
      } else {
        // Stato 3 — non trovato
        esito.innerHTML = '<span class="timbro mancante">Dato non disponibile</span> ' +
          'nessuna corrispondenza su Borsa Italiana per <b style="font-family:\'Courier Prime\';font-style:normal">' + v + '</b>';
        svuota();
      }
    }, 1100);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') bottone.click();
  });
})();
