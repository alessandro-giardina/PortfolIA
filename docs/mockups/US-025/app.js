/* US-025 — Mockup interattivo: selezione portafoglio e navigazione */

(function () {
  const overlay     = document.getElementById('overlay-portafogli');
  const btnAggiungi = document.getElementById('btn-aggiungi');
  const btnChiudi   = document.getElementById('btn-chiudi-dialog');
  const btnAnnulla  = document.getElementById('btn-annulla-dialog');
  const btnConferma = document.getElementById('btn-conferma-dialog');
  const righe       = document.querySelectorAll('.riga-portafoglio');

  if (!overlay) return; // pagina senza dialog (es. portafoglio-precompilato.html)

  /* Apri dialog */
  btnAggiungi && btnAggiungi.addEventListener('click', () => {
    overlay.classList.add('aperta');
    overlay.focus();
  });

  /* Chiudi dialog */
  function chiudi() {
    overlay.classList.remove('aperta');
  }
  btnChiudi && btnChiudi.addEventListener('click', chiudi);
  btnAnnulla && btnAnnulla.addEventListener('click', chiudi);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) chiudi();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('aperta')) chiudi();
  });

  /* Selezione riga portafoglio */
  let rigaSelezionata = document.querySelector('.riga-portafoglio.selezionata') || null;

  righe.forEach((riga) => {
    riga.addEventListener('click', () => {
      righe.forEach((r) => {
        r.classList.remove('selezionata');
        r.setAttribute('aria-selected', 'false');
      });
      riga.classList.add('selezionata');
      riga.setAttribute('aria-selected', 'true');
      rigaSelezionata = riga;
    });

    riga.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        riga.click();
      }
    });
  });

  /* Conferma: naviga verso il portafoglio selezionato */
  btnConferma && btnConferma.addEventListener('click', () => {
    if (!rigaSelezionata) return;
    const url = rigaSelezionata.dataset.url || 'portafoglio-precompilato.html';
    window.location.href = url;
  });
})();
