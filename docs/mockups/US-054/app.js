/* ============================================================
   PortfolIA — Quadro strumenti · iscrizione carichi e scarichi
   Solo JavaScript semplice: tema, rivelazioni, commutatore degli
   stati della schermata, giacenza del titolo scelto nel modulo di
   scarico, reazione della fascia dei lotti alla data di vendita e
   rettifica in linea di una riga del registro.
   Nessuna dipendenza, nessun bundler.
   MOCKUP — non è codice di produzione.
   ============================================================ */

(() => {
  'use strict';

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

  /* ---------- Commutatore degli stati della schermata ----------
     Ogni stato è marcato con `data-stato="…"` sul body; le sezioni portano
     `data-quando="stato1 stato2"` e restano montate solo negli stati che le
     nominano. Così ogni stato è ispezionabile senza il server, e la loro
     mutua esclusione si legge nel markup invece di essere sepolta nel JS. */

  const STATI = ['vuoto', 'precompilato', 'errori', 'iscritto', 'scarico', 'rettifica', 'senza-giacenze'];

  function applicaStato(stato) {
    document.body.dataset.stato = stato;

    document.querySelectorAll('[data-quando]').forEach((el) => {
      const ammessi = el.dataset.quando.split(/\s+/);
      el.hidden = !ammessi.includes(stato);
    });

    document.querySelectorAll('[data-stato-scelto]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.statoScelto === stato));
    });
  }

  function avviaCommutatoreStati() {
    const bottoni = document.querySelectorAll('[data-stato-scelto]');
    if (!bottoni.length) return;

    bottoni.forEach((b) => {
      b.addEventListener('click', () => applicaStato(b.dataset.statoScelto));
    });

    applicaStato(document.body.dataset.stato || STATI[0]);
  }

  /* ---------- Modulo di carico: errori di forma ----------
     La validazione del mockup è deliberatamente la stessa **forma** di quella
     dell'app (campo obbligatorio, prezzo positivo, quantità positiva con al
     più sei decimali) e non un abbozzo: serve a mostrare dove finiscono gli
     errori, non a essere autoritativa — l'autorità è del registro. */

  function avviaModuloCarico() {
    const form = document.querySelector('[data-form="carico"]');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dati = new FormData(form);
      const isin = String(dati.get('isin') || '').trim();
      const data = String(dati.get('data') || '').trim();
      const prezzo = parseFloat(String(dati.get('prezzo') || ''));
      const quantita = parseFloat(String(dati.get('quantita') || '').replace(',', '.'));

      const valido =
        isin.length === 12 &&
        data !== '' &&
        Number.isFinite(prezzo) && prezzo > 0 &&
        Number.isFinite(quantita) && quantita > 0 && Math.round(quantita * 1e6) / 1e6 === quantita;

      applicaStato(valido ? 'iscritto' : 'errori');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- Modulo di scarico: giacenza del titolo scelto ----------
     La cifra accanto alla `select` deve cambiare **con** la scelta: leggere la
     giacenza di un altro titolo accanto al titolo scelto sarebbe una cifra
     sbagliata al posto giusto, che è peggio di nessuna cifra. */

  function avviaScelaTitolo() {
    const select = document.querySelector('[data-campo="scarico-titolo"]');
    const giacenza = document.querySelector('[data-giacenza]');
    const isinFascia = document.querySelector('[data-isin-fascia]');
    if (!select || !giacenza) return;

    const aggiorna = () => {
      const opzione = select.selectedOptions[0];
      if (!opzione) return;
      giacenza.textContent = opzione.dataset.residuo || '—';
      if (isinFascia) isinFascia.textContent = opzione.value;
    };

    select.addEventListener('change', aggiorna);
    aggiorna();
  }

  /* ---------- La fascia dei lotti reagisce alla data di vendita ----------
     Il lotto successivo alla data scritta nel modulo non viene nascosto: viene
     dichiarato fuori data. È la stessa figura che spiega il rifiuto di una
     vendita antedatata, e averla *prima* dell'invio la rende una spiegazione
     anticipata invece che postuma. */

  function avviaFasciaLotti() {
    const campoData = document.querySelector('[data-campo="scarico-data"]');
    const lotti = Array.from(document.querySelectorAll('[data-lotto]'));
    const etichettaData = document.querySelector('[data-fascia-data]');
    if (!campoData || !lotti.length) return;

    const aggiorna = () => {
      const scelta = campoData.value;
      if (etichettaData) {
        etichettaData.textContent = scelta ? ` — lotti al ${scelta}` : ' — lotti';
      }

      lotti.forEach((lotto) => {
        const suaData = lotto.dataset.data || '';
        const fuori = scelta !== '' && suaData > scelta;
        lotto.classList.toggle('fuori-data', fuori);

        const barra = lotto.querySelector('.barra-lotto');
        const esito = lotto.querySelector('.esito-lotto');
        if (!barra || !esito) return;

        if (fuori) {
          barra.innerHTML =
            `<div class="quota futura" style="flex:1">non ancora avvenuto al ${scelta}</div>`;
          esito.classList.add('non-attribuibile');
          esito.innerHTML = 'fuori dalla data<b>non attribuibile</b>';
        } else {
          barra.innerHTML = lotto.dataset.barra || barra.innerHTML;
          esito.classList.remove('non-attribuibile');
          esito.innerHTML = lotto.dataset.esito || esito.innerHTML;
        }
      });
    };

    // La resa "in data" di ogni lotto è memorizzata alla partenza: è la sola
    // sorgente di verità del ripristino, e tenerla nel markup evita di
    // ricostruirla a mano ogni volta che la data cambia.
    lotti.forEach((lotto) => {
      const barra = lotto.querySelector('.barra-lotto');
      const esito = lotto.querySelector('.esito-lotto');
      if (barra) lotto.dataset.barra = barra.innerHTML;
      if (esito) lotto.dataset.esito = esito.innerHTML;
    });

    campoData.addEventListener('change', aggiorna);
    campoData.addEventListener('input', aggiorna);
    aggiorna();
  }

  /* ---------- Rettifica in linea di una riga del registro ---------- */

  function avviaRettifica() {
    document.querySelectorAll('[data-azione="rettifica"]').forEach((b) => {
      b.addEventListener('click', () => applicaStato('rettifica'));
    });
    document.querySelectorAll('[data-azione="annulla-rettifica"]').forEach((b) => {
      b.addEventListener('click', () => applicaStato('iscritto'));
    });
    document.querySelectorAll('[data-azione="salva-rettifica"]').forEach((b) => {
      b.addEventListener('click', () => applicaStato('iscritto'));
    });
  }

  /* ---------- Avvio ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    avviaTema();
    avviaRivelazioni();
    avviaCommutatoreStati();
    avviaModuloCarico();
    avviaScelaTitolo();
    avviaFasciaLotti();
    avviaRettifica();
  });
})();
