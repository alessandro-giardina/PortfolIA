/* ============================================================
   PortfolIA — Quadro strumenti · elenco portafogli
   Solo JavaScript semplice: tema, rivelazioni, righe cliccabili,
   demo del dialogo di scelta portafoglio e dei due stati del
   modulo di creazione. Nessuna dipendenza, nessun bundler.
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

  /* ---------- Righe cliccabili (elenco portafogli) ---------- */

  function avviaRigheCliccabili() {
    document.querySelectorAll('tr.cliccabile[data-vai]').forEach((riga) => {
      const vai = () => { window.location.href = riga.dataset.vai; };
      riga.addEventListener('click', vai);
      riga.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vai(); }
      });
    });
  }

  /* ---------- Stato vuoto vs elenco popolato (demo) ---------- */

  function avviaCommutaStatoElenco() {
    const bottone = document.querySelector('[data-azione="commuta-stato-elenco"]');
    const pannello = document.querySelector('[data-pannello="elenco-portafogli"]');
    if (!bottone || !pannello) return;

    bottone.addEventListener('click', () => {
      const vuoto = pannello.classList.toggle('mostra-vuoto');
      bottone.textContent = vuoto ? 'Mostra elenco popolato (demo)' : 'Mostra stato «nessun portafoglio» (demo)';
    });
  }

  /* ---------- Errore di validazione nel modulo di creazione (demo) ---------- */

  function avviaDemoErroreCreazione() {
    const form = document.querySelector('[data-form="nuovo-portafoglio"]');
    if (!form) return;
    const input = form.querySelector('input[type="text"]');
    const errore = form.querySelector('.errore-campo-quadro');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) {
        input.classList.add('con-errore');
        errore.hidden = false;
        input.focus();
      } else {
        input.classList.remove('con-errore');
        errore.hidden = true;
        input.value = '';
      }
    });

    input.addEventListener('input', () => {
      if (input.value.trim()) {
        input.classList.remove('con-errore');
        errore.hidden = true;
      }
    });
  }

  /* ---------- Dialogo di scelta portafoglio ---------- */

  function avviaDialogoScelta() {
    const overlay = document.querySelector('[data-dialogo="scelta-portafoglio"]');
    const apri = document.querySelector('[data-azione="apri-dialogo-scelta"]');
    if (!overlay || !apri) return;

    const chiudiPulsanti = overlay.querySelectorAll('[data-azione="chiudi-dialogo"]');
    const righe = overlay.querySelectorAll('.riga-scelta-portafoglio');
    const conferma = overlay.querySelector('[data-azione="conferma-dialogo"]');

    function chiudi() {
      overlay.classList.remove('aperto');
      apri.focus();
    }

    function apriDialogo() {
      overlay.classList.add('aperto');
      const primaRiga = overlay.querySelector('.riga-scelta-portafoglio');
      if (primaRiga) primaRiga.focus();
    }

    apri.addEventListener('click', apriDialogo);
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
    avviaRigheCliccabili();
    avviaCommutaStatoElenco();
    avviaDemoErroreCreazione();
    avviaDialogoScelta();
  });
})();
