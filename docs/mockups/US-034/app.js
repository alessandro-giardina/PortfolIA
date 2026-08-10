/* US-034 — interazione minima del mockup.
   Un solo comando: toglie il colore alla tabella e al riquadro di
   conteggio, per mostrare che la marcatura sopravvive alla perdita del
   colore. Nessun'altra logica: il verdetto di obsolescenza è calcolato
   dal server, e qui è già scritto nell'HTML come lo sarebbe a schermo. */

(function () {
  var interruttore = document.getElementById('interruttore-grigi');
  if (!interruttore) return;

  var bersagli = [
    document.querySelector('.tabella-scroll'),
    document.querySelector('.riquadro-conteggio'),
  ].filter(Boolean);

  interruttore.addEventListener('click', function () {
    var acceso = bersagli[0].classList.toggle('prova-grigi');
    bersagli.slice(1).forEach(function (b) { b.classList.toggle('prova-grigi', acceso); });
    interruttore.textContent = acceso ? 'Rimetti il colore' : 'Togli il colore';
  });
})();
