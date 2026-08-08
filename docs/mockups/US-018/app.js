/* ============================================================
   PortfolIA — US-018 mockup interactions
   Scheda titolo: dettaglio completo di un titolo a portafoglio
   ============================================================ */

(function () {
  'use strict';

  /* Il timbro di provenienza si presenta con una breve rotazione:
     richiama il gesto del timbro appoggiato sulla pagina. */
  document.querySelectorAll('.timbro-fonte').forEach(function (timbro, i) {
    timbro.style.transition = 'transform .35s ease-out, opacity .35s ease-out';
    timbro.style.opacity = '0';
    timbro.style.transform = 'rotate(-9deg) scale(1.14)';
    setTimeout(function () {
      timbro.style.opacity = '1';
      timbro.style.transform = 'rotate(-1.2deg) scale(1)';
    }, 220 + i * 120);
  });

  /* Le caselle di posizione entrano in sequenza, da sinistra. */
  document.querySelectorAll('.orizzonte').forEach(function (casella, i) {
    casella.style.transition = 'opacity .3s ease-out';
    casella.style.opacity = '0';
    setTimeout(function () { casella.style.opacity = '1'; }, 60 * i);
  });
})();
