/* ============================================================
   PortfolIA — US-009 mockup interactions
   Storico prezzi osservati in fondo alla scheda titolo
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

  /* Le tacche del pettine si alzano una per volta, dalla più vecchia alla più
     recente: è l'ordine in cui le osservazioni sono state registrate. Nessuna
     linea le congiunge, perché fra due rilevazioni non c'è nulla di osservato. */
  document.querySelectorAll('.pettine-osservazioni i').forEach(function (tacca, i) {
    var altezza = getComputedStyle(tacca).height;
    tacca.style.height = '0';
    tacca.style.transition = 'height .3s ease-out';
    setTimeout(function () { tacca.style.height = altezza; }, 380 + 90 * i);
  });
})();
