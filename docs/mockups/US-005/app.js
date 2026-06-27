/* ============================================================
   PortfolIA — US-005 Mockup: app.js
   Interazioni prototipo per dashboard-con-portafogli.html
   e dashboard-vuota.html
   ============================================================ */

(function () {
  'use strict';

  // Portafogli già esistenti (simulati)
  const CONTI_ESISTENTI = [
    'conto lungo periodo',
    'conto etf globale',
    'conto speculativo',
  ];

  const input       = document.getElementById('nome-portafoglio');
  const erroreEl    = document.getElementById('errore-nome');
  const campoEl     = document.getElementById('campo-nome');
  const rigaEl      = document.getElementById('riga-nome');
  const btnRegistra = document.getElementById('btn-registra');
  const btnAnnulla  = document.getElementById('btn-annulla');

  if (!input) return; // non siamo su una pagina con il modulo

  function mostraErrore(msg) {
    erroreEl.textContent = msg;
    erroreEl.classList.add('visibile');
    campoEl.classList.add('con-errore');
    rigaEl.classList.add('con-errore');
    input.setAttribute('aria-invalid', 'true');
  }

  function nascondErrore() {
    erroreEl.textContent = '';
    erroreEl.classList.remove('visibile');
    campoEl.classList.remove('con-errore');
    rigaEl.classList.remove('con-errore');
    input.removeAttribute('aria-invalid');
  }

  function validaERegistra() {
    const nome = input.value.trim();

    if (!nome) {
      mostraErrore('Il nome del conto non può essere vuoto');
      input.focus();
      return;
    }

    if (CONTI_ESISTENTI.includes(nome.toLowerCase())) {
      mostraErrore('Esiste già un conto con questa denominazione');
      input.focus();
      return;
    }

    // Successo: naviga al dettaglio del nuovo portafoglio (simulazione)
    nascondErrore();
    const nomeEncoded = encodeURIComponent(nome);
    const idFinto = Math.floor(Math.random() * 900) + 100;
    window.location.href = `dettaglio-portafoglio-placeholder.html?nome=${nomeEncoded}&id=${idFinto}`;
  }

  btnRegistra.addEventListener('click', validaERegistra);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') validaERegistra();
  });

  input.addEventListener('input', function () {
    if (this.value.trim()) nascondErrore();
  });

  if (btnAnnulla) {
    btnAnnulla.addEventListener('click', function () {
      input.value = '';
      nascondErrore();
      input.focus();
    });
  }

  // Ancora "Apri il tuo primo conto" → scroll al modulo
  document.querySelectorAll('a[href="#modulo-nuovo-conto"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      const modulo = document.getElementById('modulo-nuovo-conto');
      if (modulo) {
        e.preventDefault();
        modulo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(function () { input.focus(); }, 400);
      }
    });
  });

})();
