/* ============================================================
   US-035 — simulazione della corsa di aggiornamento.

   Il mockup è servito FERMO sul fotogramma «2 di 3»: è lo stato che
   la spec chiede di mostrare, e una pagina che parte da sola lo
   perderebbe dopo un secondo. Il fotogramma però non è una fotografia
   morta: questa piccola macchina a stati lo adotta come istante
   corrente e tenuto in pausa, così che «Interrompi» funzioni davvero
   e «Rigioca la corsa» possa rifare il percorso dall'inizio.

   Nessuna logica di dominio: gli esiti sono decisi in tabella qui
   sotto, come lo sarebbero dalle fonti. Ciò che il mockup dimostra è
   soltanto CHE COSA si riscrive e QUANDO — riga per riga, non a fine
   lavoro.
   ============================================================ */

(function () {
  'use strict';

  /* Un secondo e mezzo per titolo: nella realtà la fonte di backup ne
     chiede una decina, e la nota nella riga di lavoro lo dichiara. */
  var PASSO = 1500;

  var TOTALI_INIZIALI = { valore: '114.225,90', differenza: '+22.549,35' };

  /* I tre titoli obsoleti, nell'ordine in cui sono interrogati (quello
     della tabella). `prima` è il dato d'archivio, `dopo` quello che la
     fonte restituisce; `totali` sono i totali di portafoglio DOPO che
     quel titolo è stato chiuso — il secondo fallisce, e infatti
     ripete i totali del primo. */
  var TITOLI = [
    {
      isin: 'IE00BK5BQT80',
      esito: 'ok',
      prima: { prezzo: '118,7400', istante: '04/08/2026 17:31', valore: '11.280,30', differenza: '+2.526,05' },
      dopo:  { prezzo: '121,3800', istante: '08/08/2026 11:12', valore: '11.531,10', differenza: '+2.776,85' },
      totali: { valore: '114.476,70', differenza: '+22.800,15' }
    },
    {
      isin: 'LU1681045370',
      esito: 'fallito',
      ragione: 'nessuna fonte ha trovato il titolo',
      prima: { prezzo: '22,8600', istante: '31/07/2026 17:29', valore: '3.200,40', differenza: '+341,60' },
      dopo:  null,
      totali: { valore: '114.476,70', differenza: '+22.800,15' }
    },
    {
      isin: 'IE00BFY0GT14',
      esito: 'ok',
      prima: { prezzo: '52,4000', istante: '03/08/2026 17:30', valore: '2.882,00', differenza: '+374,00' },
      dopo:  { prezzo: '53,1000', istante: '08/08/2026 11:13', valore: '2.920,50', differenza: '+412,50' },
      totali: { valore: '114.515,20', differenza: '+22.838,65' }
    }
  ];

  var TOTALE_TITOLI = 11;

  /* ---------- Riferimenti ---------- */
  var comando      = document.getElementById('comando-aggiorna');
  var rigaLavoro   = document.getElementById('riga-lavoro');
  var riquadro     = document.querySelector('.riquadro-conteggio');
  var frase        = document.querySelector('[data-ruolo="frase-conteggio"]');
  var rinvio       = document.querySelector('.riquadro-conteggio .rinvio');
  var azione       = document.querySelector('.azione-conteggio');
  var rigioca      = document.getElementById('rigioca');
  var grigi        = document.getElementById('interruttore-grigi');

  if (!comando || !rigaLavoro) return;

  /* ---------- Stato ----------
     All'apertura la pagina è già dentro la corsa, al secondo titolo,
     con il primo chiuso positivamente: è il fotogramma scritto
     nell'HTML. `inPausa` lo tiene fermo finché non si interviene. */
  var indice = 1;
  var esiti = ['ok'];
  var corsaAttiva = true;
  var inPausa = true;
  var fermataChiesta = false;
  var timer = null;

  /* ============================================================
     Riscrittura del registro
     ============================================================ */

  function impostaTotali(t) {
    ognuno('[data-tot="valore"]', function (el) { el.textContent = t.valore; });
    ognuno('[data-tot="differenza"]', function (el) { el.textContent = t.differenza; });
    ognuno('[data-tot="differenza-testata"]', function (el) {
      el.textContent = t.differenza.replace(/^\+/, '');
    });
  }

  function ognuno(selettore, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selettore), fn);
  }

  /* Le quattro fasi di una riga: in attesa del turno, interrogata in
     questo istante, rilevata, non rilevata. Solo «rilevata» cambia le
     cifre; le altre tre lasciano a schermo il dato d'archivio, e lo
     dichiarano. */
  function impostaRiga(i, fase) {
    var t = TITOLI[i];
    var riga = document.querySelector('tr[data-isin="' + t.isin + '"]');
    if (!riga) return;

    var dati = (fase === 'rilevata') ? t.dopo : t.prima;
    var celle = {
      prezzo: riga.querySelector('[data-campo="prezzo"]'),
      rilevamento: riga.querySelector('[data-campo="rilevamento"]'),
      valore: riga.querySelector('[data-campo="valore"]'),
      differenza: riga.querySelector('[data-campo="differenza"]')
    };

    celle.prezzo.textContent = dati.prezzo;
    celle.valore.textContent = dati.valore;
    celle.differenza.textContent = dati.differenza;

    var postilla = '';
    var segnato = ' segnato';
    if (fase === 'corrente') {
      postilla = '<small class="marca-rilevamento in-lavorazione">in aggiornamento</small>';
    } else if (fase === 'rilevata') {
      segnato = '';
    } else {
      postilla = '<small class="marca-rilevamento obsoleto">da aggiornare</small>';
    }
    celle.rilevamento.innerHTML =
      '<span class="istante' + segnato + '">' + dati.istante + '</span>' + postilla;

    riga.classList.toggle('in-lavorazione', fase === 'corrente');

    if (fase === 'rilevata') alone([celle.prezzo, celle.rilevamento, celle.valore, celle.differenza]);
  }

  /* Alone d'inchiostro fresco sulle celle appena riscritte (US-030).
     La classe va tolta e rimessa dopo un reflow, altrimenti
     l'animazione non riparte al secondo giro. */
  function alone(celle) {
    celle.forEach(function (c) {
      c.classList.remove('appena-aggiornato');
      void c.offsetWidth;
      c.classList.add('appena-aggiornato');
    });
  }

  /* ============================================================
     Il riquadro di conteggio (US-034) e il suo comando
     ============================================================ */

  function quantiRilevati() {
    return esiti.filter(function (e) { return e === 'ok'; }).length;
  }

  function aggiornaConteggio() {
    var restano = TITOLI.length - quantiRilevati();
    if (restano === 0) {
      riquadro.classList.add('allineato');
      frase.innerHTML = 'Tutti gli <b>' + TOTALE_TITOLI + '</b> titoli sono allineati all’ultima sessione di borsa.';
      rinvio.textContent = 'nessuna postilla in tabella';
    } else {
      riquadro.classList.remove('allineato');
      frase.innerHTML = '<b>' + restano + '</b> ' + (restano === 1 ? 'titolo' : 'titoli') +
        ' su <b>' + TOTALE_TITOLI + '</b> con rilevamento obsoleto.';
      rinvio.textContent = restano === 1 ? '† segnato in tabella' : '† segnati in tabella';
    }
    return restano;
  }

  /* Due sole condizioni per il comando: in corso (disabilitato,
     glifo che gira) e pronto. A zero il pronto diventa inattivo e
     porta scritta la ragione accanto — non solo il grigio. */
  function aggiornaComando() {
    var restano = TITOLI.length - quantiRilevati();
    var vecchioMotivo = azione.querySelector('.motivo-inattivo');
    if (vecchioMotivo) vecchioMotivo.remove();

    if (corsaAttiva) {
      comando.disabled = true;
      comando.setAttribute('aria-busy', 'true');
      comando.classList.add('in-corso');
      comando.classList.remove('inattivo');
      comando.querySelector('.etichetta').textContent = 'Aggiornamento in corso…';
      return;
    }

    comando.removeAttribute('aria-busy');
    comando.classList.remove('in-corso');
    comando.querySelector('.etichetta').textContent = 'Aggiorna i titoli obsoleti (' + restano + ')';

    if (restano === 0) {
      comando.disabled = true;
      comando.classList.add('inattivo');
      var motivo = document.createElement('span');
      motivo.className = 'motivo-inattivo';
      motivo.textContent = 'Nessun titolo da aggiornare: ogni rilevamento è già allineato all’ultima sessione di borsa.';
      azione.insertBefore(motivo, comando);
    } else {
      comando.disabled = false;
      comando.classList.remove('inattivo');
    }
  }

  /* ============================================================
     La riga di lavoro
     ============================================================ */

  function tacche(marchi) {
    return '<span class="tacche" aria-hidden="true">' +
      marchi.map(function (m) { return '<i class="tacca ' + m + '"></i>'; }).join('') +
      '</span>';
  }

  /* Un marchio per titolo, nell'ordine di interrogazione: chiuso
     positivamente, non riuscito, in corso, non interrogato, in coda. */
  function marchiCorrenti(chiusa) {
    return TITOLI.map(function (t, i) {
      if (i < indice) return esiti[i] === 'ok' ? 'fatta' : 'fallita';
      if (i === indice && !chiusa) return 'corrente';
      return chiusa ? 'saltata' : '';
    });
  }

  /* L'accordo al singolare non è un vezzo: «I 1 titoli rimanenti» è la
     frase che tradisce un'interfaccia composta da concatenazioni. */
  function fraseRimanenti(quanti) {
    if (quanti === 0) return 'Era l’ultimo titolo della corsa: non ne resta nessun altro da interrogare.';
    if (quanti === 1) return 'Il titolo rimanente non sarà interrogato.';
    return 'I <b>' + quanti + '</b> titoli rimanenti non saranno interrogati.';
  }

  function disegnaLavoro() {
    var t = TITOLI[indice];
    rigaLavoro.hidden = false;

    if (fermataChiesta) {
      rigaLavoro.className = 'riga-lavoro fermata';
      rigaLavoro.innerHTML =
        '<span class="timbro-lavoro">Interruzione richiesta</span>' +
        '<span class="testo-lavoro">Attendo la risposta di <b>' + t.isin + '</b>, poi il lavoro si ferma. ' +
          '&mdash; <b>' + (indice + 1) + '</b> di <b>' + TITOLI.length + '</b>.</span>' +
        tacche(marchiCorrenti(false)) +
        '<span class="azione-lavoro">' +
          '<button type="button" class="bottone-minuto fermata" disabled>' +
          '<span class="glifo">■</span> Interruzione in corso…</button></span>' +
        '<p class="nota-lavoro">Il titolo già chiesto alla fonte non viene abbandonato: la sua risposta ' +
          'sarà registrata. ' + fraseRimanenti(TITOLI.length - indice - 1) + '</p>';
      return;
    }

    rigaLavoro.className = 'riga-lavoro in-corso';
    rigaLavoro.innerHTML =
      '<span class="timbro-lavoro">In corso</span>' +
      '<span class="testo-lavoro">Rilevamento di <b>' + t.isin + '</b> &mdash; ' +
        '<b>' + (indice + 1) + '</b> di <b>' + TITOLI.length + '</b>.</span>' +
      tacche(marchiCorrenti(false)) +
      '<span class="azione-lavoro">' +
        '<button type="button" id="comando-interrompi" class="bottone-minuto fermata">' +
        '<span class="glifo">■</span> Interrompi</button></span>' +
      '<p class="nota-lavoro">I titoli sono interrogati <b>uno alla volta</b>: la fonte di backup può richiedere ' +
        '<b>una decina di secondi</b> per titolo. Gli altri <b>' + (TOTALE_TITOLI - TITOLI.length) + '</b> titoli non ' +
        'vengono richiesti alla fonte: il loro rilevamento è già allineato all’ultima sessione.</p>';
  }

  /* Il consuntivo non è un altro riquadro: è lo stesso cassetto, che
     smette di dire «sto lavorando» e comincia a dire «ho fatto». */
  function disegnaConsuntivo(interrotto) {
    var rilevati = quantiRilevati();
    var falliti = TITOLI.slice(0, indice).filter(function (t, i) { return esiti[i] !== 'ok'; });
    var nonInterrogati = TITOLI.slice(indice);

    var classi = 'riga-lavoro consuntivo';
    if (interrotto) classi += ' interrotto';
    else if (falliti.length) classi += ' parziale';
    if (rilevati === 0) classi += ' nulla';

    var testo = 'Aggiornati <b>' + rilevati + '</b> ' + (rilevati === 1 ? 'titolo' : 'titoli') +
      ' su <b>' + TITOLI.length + '</b>.';
    if (interrotto && nonInterrogati.length) {
      testo += ' <b>' + nonInterrogati.length + '</b> ' +
        (nonInterrogati.length === 1 ? 'non è stato interrogato' : 'non sono stati interrogati') + '.';
    }

    var elenco = '';
    if (falliti.length || nonInterrogati.length) {
      elenco = '<ul class="elenco-esiti">' +
        '<li class="capo">Titoli non aggiornati</li>' +
        falliti.map(function (t) {
          return '<li><span class="segno">†</span><span class="isin">' + t.isin + '</span>' +
                 '<span class="ragione">' + t.ragione + '</span></li>';
        }).join('') +
        nonInterrogati.map(function (t) {
          return '<li class="non-interrogato"><span class="segno">·</span><span class="isin">' + t.isin + '</span>' +
                 '<span class="ragione">non interrogato: il lavoro è stato interrotto prima del suo turno</span></li>';
        }).join('') +
        '</ul>';
    }

    rigaLavoro.className = classi;
    rigaLavoro.innerHTML =
      '<span class="timbro-lavoro">' + (interrotto ? 'Lavoro interrotto' : 'Lavoro concluso') + '</span>' +
      '<span class="testo-lavoro">' + testo + '</span>' +
      tacche(marchiCorrenti(true)) +
      '<span class="azione-lavoro">' +
        '<button type="button" id="comando-chiudi" class="bottone-minuto congedo">Chiudi il consuntivo</button></span>' +
      (interrotto
        ? '<p class="nota-lavoro">I titoli già rilevati conservano i valori appena letti: l’interruzione non ' +
          'annulla il lavoro fatto. Il conteggio qui sopra è già ricalcolato, e dice quanto resta.</p>'
        : '') +
      elenco;
  }

  /* ============================================================
     La corsa
     ============================================================ */

  function passo() {
    impostaRiga(indice, 'corrente');
    disegnaLavoro();
    programmaEsito();
  }

  function programmaEsito() {
    var t = TITOLI[indice];
    timer = setTimeout(function () {
      esiti[indice] = t.esito;
      impostaRiga(indice, t.esito === 'ok' ? 'rilevata' : 'non-rilevata');
      impostaTotali(t.totali);
      aggiornaConteggio();
      indice += 1;

      if (fermataChiesta) { concludi(true); return; }
      if (indice >= TITOLI.length) { concludi(false); return; }
      passo();
    }, PASSO);
  }

  function concludi(interrotto) {
    corsaAttiva = false;
    inPausa = false;
    disegnaConsuntivo(interrotto);
    aggiornaConteggio();
    aggiornaComando();
  }

  function avvia() {
    if (corsaAttiva) return;
    corsaAttiva = true;
    inPausa = false;
    fermataChiesta = false;
    indice = 0;
    esiti = [];
    aggiornaConteggio();
    aggiornaComando();
    passo();
  }

  function interrompi() {
    if (!corsaAttiva || fermataChiesta) return;
    fermataChiesta = true;
    disegnaLavoro();
    /* Se la pagina era ferma sul fotogramma, l'interruzione la
       rimette in moto: il titolo in corso va comunque atteso. */
    if (inPausa) { inPausa = false; programmaEsito(); }
  }

  function azzera() {
    clearTimeout(timer);
    corsaAttiva = false;
    inPausa = false;
    fermataChiesta = false;
    indice = 0;
    esiti = [];
    TITOLI.forEach(function (t, i) { impostaRiga(i, 'in-attesa'); });
    impostaTotali(TOTALI_INIZIALI);
    aggiornaConteggio();
    aggiornaComando();
    rigaLavoro.hidden = true;
  }

  /* ============================================================
     Ascolti
     ============================================================ */

  /* «Interrompi» e «Chiudi» vivono dentro la riga di lavoro, che
     viene riscritta a ogni passo: l'ascolto sta sul contenitore. */
  rigaLavoro.addEventListener('click', function (e) {
    var bersaglio = e.target.closest ? e.target.closest('button') : null;
    if (!bersaglio) return;
    if (bersaglio.id === 'comando-interrompi') interrompi();
    if (bersaglio.id === 'comando-chiudi') rigaLavoro.hidden = true;
  });

  comando.addEventListener('click', avvia);

  if (rigioca) {
    rigioca.addEventListener('click', function () {
      azzera();
      setTimeout(avvia, 450);
    });
  }

  if (grigi) {
    var bersagli = ['.riquadro-valore-totale', '.riquadro-conteggio', '#riga-lavoro', '.tabella-scroll'];
    grigi.addEventListener('click', function () {
      var acceso = document.querySelector('.tabella-scroll').classList.toggle('prova-grigi');
      bersagli.forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.classList.toggle('prova-grigi', acceso);
      });
      grigi.textContent = acceso ? 'Rimetti il colore' : 'Togli il colore';
    });
  }
})();
