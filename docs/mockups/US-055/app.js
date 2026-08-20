/* ============================================================
   PortfolIA — Quadro strumenti · ricerca titoli
   Solo JavaScript semplice: tema, rivelazioni, commutatore degli
   stati della ricerca (vuoto / attesa / trovato / non trovato /
   fonte muta / guardia), contatore dei caratteri dell'ISIN e demo
   del dialogo di scelta portafoglio.
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

  /* ---------- Commutatore degli stati della ricerca ----------
     Ogni stato della schermata è marcato con `data-stato="…"` sul body;
     le sezioni portano `data-quando="stato1 stato2"` e restano montate
     solo negli stati che le nominano. Così ogni stato è ispezionabile
     senza il server, e la loro mutua esclusione si legge nel markup. */

  const STATI = ['vuoto', 'attesa', 'trovato', 'non-trovato', 'fonte-muta', 'guardia', 'isin-invalido'];

  function applicaStato(stato) {
    document.body.dataset.stato = stato;

    document.querySelectorAll('[data-quando]').forEach((el) => {
      const ammessi = el.dataset.quando.split(/\s+/);
      el.hidden = !ammessi.includes(stato);
    });

    document.querySelectorAll('[data-stato-scelto]').forEach((b) => {
      const suo = b.dataset.statoScelto === stato;
      b.setAttribute('aria-pressed', String(suo));
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

  /* ---------- Contatore dei caratteri dell'ISIN ---------- */

  function avviaContatoreIsin() {
    const input = document.querySelector('[data-campo="isin"]');
    const contatore = document.querySelector('[data-contatore="isin"]');
    if (!input || !contatore) return;

    const aggiorna = () => {
      const n = input.value.trim().length;
      contatore.textContent = `${n}/12`;
      contatore.classList.toggle('completo', n === 12);
    };

    input.addEventListener('input', aggiorna);
    aggiorna();
  }

  /* ---------- Invio del modulo: mostra l'attesa, poi l'esito ---------- */

  function avviaModuloRicerca() {
    const form = document.querySelector('[data-form="ricerca-isin"]');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('[data-campo="isin"]');
      const valore = (input?.value || '').trim();

      if (valore.length !== 12) {
        applicaStato('isin-invalido');
        input?.focus();
        return;
      }

      applicaStato('attesa');
      window.setTimeout(() => applicaStato('trovato'), 1400);
    });
  }

  /* ---------- Dialogo di scelta portafoglio ---------- */

  function avviaDialogoScelta() {
    const overlay = document.querySelector('[data-dialogo="scelta-portafoglio"]');
    const aperture = document.querySelectorAll('[data-azione="apri-dialogo-scelta"]');
    if (!overlay || !aperture.length) return;

    const chiudiPulsanti = overlay.querySelectorAll('[data-azione="chiudi-dialogo"]');
    const righe = overlay.querySelectorAll('.riga-scelta-portafoglio');
    const conferma = overlay.querySelector('[data-azione="conferma-dialogo"]');
    let apertoDa = null;

    function chiudi() {
      overlay.classList.remove('aperto');
      if (apertoDa) apertoDa.focus();
    }

    apertureListener();

    function apertureListener() {
      aperture.forEach((b) => {
        b.addEventListener('click', () => {
          apertoDa = b;
          overlay.classList.add('aperto');
          const prima = overlay.querySelector('.riga-scelta-portafoglio');
          if (prima) prima.focus();
        });
      });
    }

    chiudiPulsanti.forEach((b) => b.addEventListener('click', chiudi));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) chiudi();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('aperto')) chiudi();
    });

    righe.forEach((riga) => {
      const seleziona = () => {
        righe.forEach((r) => { r.classList.remove('selezionata'); r.setAttribute('aria-selected', 'false'); });
        riga.classList.add('selezionata');
        riga.setAttribute('aria-selected', 'true');
        if (conferma) conferma.disabled = false;
      };
      riga.addEventListener('click', seleziona);
      riga.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleziona(); }
      });
    });

    if (conferma) {
      conferma.addEventListener('click', () => {
        if (conferma.disabled) return;
        chiudi();
      });
    }
  }

  /* ---------- Avvio ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    avviaTema();
    avviaRivelazioni();
    avviaCommutatoreStati();
    avviaContatoreIsin();
    avviaModuloRicerca();
    avviaDialogoScelta();
  });
})();
