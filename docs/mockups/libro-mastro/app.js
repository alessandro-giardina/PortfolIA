/* PortfolIA — Libro Mastro · interazioni leggere del prototipo */

// Scala temporale del grafico (solo stato visivo)
document.querySelectorAll('#scala button').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('#scala button').forEach(function (x) { x.classList.remove('attiva'); });
    b.classList.add('attiva');
  });
});

// Ricerca ISIN simulata: timbro di esito secondo il codice digitato
(function () {
  var bottone = document.getElementById('cerca');
  if (!bottone) return;
  var input = document.getElementById('isin');
  var esito = document.getElementById('esito');
  var noti = {
    'IT0003128367': ['ENEL S.p.A.', '€ 7,18'],
    'IE00BMVB5S82': ['iShares Core MSCI World', '€ 94,55'],
    'IE00BMVB5R75': ['iShares MSCI EM IMI', '€ 25,15']
  };
  bottone.addEventListener('click', function () {
    var v = (input.value || '').trim().toUpperCase();
    if (noti[v]) {
      esito.innerHTML = '<span class="timbro verde">Titolo trovato</span> ' +
        noti[v][0] + ' &middot; ' + noti[v][1];
    } else if (v.length === 12) {
      esito.innerHTML = '<span class="timbro mancante">Dato non disponibile</span> ' +
        'nessuna corrispondenza su Borsa Italiana';
    } else {
      esito.innerHTML = '<span class="timbro">ISIN non valido</span> ' +
        'il codice deve avere 12 caratteri';
    }
  });
})();
