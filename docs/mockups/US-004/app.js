/* ============================================================
   PortfolIA — US-004 Mockup: app.js
   Interazione prototipo per index.html
   ============================================================ */

(function () {
  'use strict';

  // Portafogli già esistenti (simulati)
  const CONTI_ESISTENTI = [
    'conto lungo periodo',
    'conto etf globale',
    'conto speculativo',
  ];

  const input      = document.getElementById('nome-portafoglio');
  const erroreEl   = document.getElementById('errore-nome');
  const campoEl    = document.getElementById('campo-nome');
  const rigaEl     = document.getElementById('riga-nome');
  const btnRegistra = document.getElementById('btn-registra');
  const btnAnnulla  = document.getElementById('btn-annulla');

  if (!input) return; // non siamo su index.html

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

    // 1. Nome vuoto
    if (!nome) {
      mostraErrore('Il nome del conto non può essere vuoto');
      input.focus();
      return;
    }

    // 2. Nome duplicato
    if (CONTI_ESISTENTI.includes(nome.toLowerCase())) {
      mostraErrore('Esiste già un conto con questa denominazione');
      input.focus();
      return;
    }

    // 3. Successo: naviga alla schermata di conferma
    nascondErrore();
    window.location.href = 'successo.html';
  }

  btnRegistra.addEventListener('click', validaERegistra);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') validaERegistra();
  });

  // Pulisce l'errore mentre l'utente digita
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

})();
