/* ============================================================
   PortfolIA — US-017 mockup interactions
   Tabella titoli portafoglio
   ============================================================ */

(function () {
  'use strict';

  /* Riga cliccabile: simulazione navigazione alla scheda titolo */
  document.querySelectorAll('.mastro tbody tr.cliccabile').forEach(function (tr) {
    tr.setAttribute('tabindex', '0');
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', 'Apri scheda titolo');

    tr.addEventListener('click', function () {
      /* In prototipo — nessuna navigazione reale */
      tr.style.outline = '2px solid var(--ottone)';
      setTimeout(function () { tr.style.outline = ''; }, 800);
    });

    tr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tr.click();
      }
    });
  });

  /* Rinomina portafoglio: feedback visivo */
  var btnRinomina = document.querySelector('.bottone.ottone-btn');
  var inputNome   = document.getElementById('nome-portafoglio');
  if (btnRinomina && inputNome) {
    btnRinomina.addEventListener('click', function () {
      var nome = (inputNome.value || '').trim();
      if (!nome) return;
      /* Aggiorna il titolo nella testata a titolo di demo */
      var titoloCorsivo = document.querySelector('.testata h1 .corsivo');
      if (titoloCorsivo) {
        titoloCorsivo.textContent = nome;
      }
      btnRinomina.textContent = 'Rinominato ✓';
      btnRinomina.disabled = true;
      setTimeout(function () {
        btnRinomina.textContent = 'Rinomina';
        btnRinomina.disabled = false;
      }, 2000);
    });
  }

  /* Elimina portafoglio: conferma */
  var btnElimina = document.querySelector('.bottone.pericoloso');
  if (btnElimina) {
    btnElimina.addEventListener('click', function () {
      if (confirm('Eliminare definitivamente questo portafoglio e tutte le sue posizioni?')) {
        btnElimina.textContent = 'Eliminato —';
        btnElimina.disabled = true;
      }
    });
  }

})();
