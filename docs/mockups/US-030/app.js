/* ============================================================
   PortfolIA — US-030 mockup interactions
   Aggiornare i dati di un titolo dalla sua scheda
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

  /* Dimostrazione del comando nella scheda completa: premendolo si vede il
     ciclo "in corso → riuscito", con il cambio di fonte e il nuovo istante.
     È solo il mockup che finge; nel prodotto è la fonte a rispondere. */
  var riga = document.querySelector('.corpo > .riga-fonte');
  if (!riga) return;
  var comando = riga.querySelector('.bottone-minuto');
  if (!comando) return;

  var glifo = '<span class="glifo">↻</span> ';

  comando.addEventListener('click', function () {
    if (comando.disabled) return;

    var esitoPrecedente = document.querySelector('.corpo > .esito-aggiornamento');
    if (esitoPrecedente) esitoPrecedente.remove();

    comando.disabled = true;
    comando.classList.add('in-corso');
    comando.innerHTML = glifo + 'Aggiornamento…';

    var attesa = document.createElement('div');
    attesa.className = 'esito-aggiornamento';
    attesa.innerHTML =
      '<span class="timbro-esito">In attesa</span>' +
      '<span>Interrogazione della fonte in corso…</span>';
    riga.insertAdjacentElement('afterend', attesa);

    setTimeout(function () {
      comando.disabled = false;
      comando.classList.remove('in-corso');
      comando.innerHTML = glifo + 'Aggiorna dati';

      riga.classList.add('di-backup');
      riga.querySelector('.timbro-fonte').classList.add('di-backup');
      riga.querySelectorAll('span')[1].innerHTML = 'Fonte: <b>MorningStar (backup)</b>';
      riga.querySelectorAll('span')[2].innerHTML =
        'Rilevato il <b class="appena-aggiornato">08.VIII.2026 &middot; 11:04</b>';

      attesa.innerHTML =
        '<span class="timbro-esito">Dati aggiornati</span>' +
        '<span>Ha risposto <b>MorningStar</b>: Borsa Italiana non ha trovato il titolo. ' +
        'Prezzo ora <b>€ 129,7200</b>.</span>';
    }, 1600);
  });
})();
