/**
 * PortfolIA — US-011 mockup · app.js
 * Prototipo interattivo: validazione form e aggiunta posizioni alla tabella.
 */

(function () {
  'use strict';

  /* ---- Riferimenti DOM ---- */
  const form        = document.getElementById('form-carico');
  const btnIscrive  = document.getElementById('btn-iscrive');
  const btnAnnulla  = document.getElementById('btn-annulla');
  const corpoTab    = document.getElementById('corpo-tabella');
  const piede       = document.getElementById('piede-tabella');
  const contatore   = document.getElementById('contatore');

  if (!form) return; // pagine senza form (con-errori.html statica, posizioni.html)

  /* ---- Stato locale ---- */
  const posizioni = [];

  /* ---- Validazione ---- */
  function validaCampo(id, campoDivId, rigaDivId, errId, fn) {
    const input   = document.getElementById(id);
    const campoEl = document.getElementById(campoDivId);
    const rigaEl  = document.getElementById(rigaDivId);
    const errEl   = document.getElementById(errId);
    const ok = fn(input.value);
    if (ok) {
      campoEl.classList.remove('con-errore');
      rigaEl.classList.remove('con-errore');
      errEl.classList.remove('visibile');
    } else {
      campoEl.classList.add('con-errore');
      rigaEl.classList.add('con-errore');
      errEl.classList.add('visibile');
    }
    return ok;
  }

  function valida() {
    const okIsin     = validaCampo('isin',        'campo-isin',     'riga-isin',     'err-isin',
      v => /^[A-Z0-9]{12}$/i.test(v.trim()));
    const okData     = validaCampo('data-carico', 'campo-data',     'riga-data',     'err-data',
      v => !!v);
    const okPrezzo   = validaCampo('prezzo',      'campo-prezzo',   'riga-prezzo',   'err-prezzo',
      v => parseFloat(v) > 0);
    const okQuantita = validaCampo('quantita',    'campo-quantita', 'riga-quantita', 'err-quantita',
      v => Number.isInteger(parseFloat(v)) && parseInt(v, 10) >= 1);
    return okIsin && okData && okPrezzo && okQuantita;
  }

  /* ---- Formattatori ---- */
  const MESI_ROM = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

  function dataRoma(isoStr) {
    const [y, m, d] = isoStr.split('-');
    return `${parseInt(d, 10)}.${MESI_ROM[parseInt(m, 10) - 1]}.${y}`;
  }

  function formattaEuro(n) {
    return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---- Aggiunta riga ---- */
  function aggiunciRiga(pos) {
    const diff = pos.attuale - pos.carico;
    const diffCls  = diff > 0 ? 'guadagno' : diff < 0 ? 'perdita' : '';
    const diffTxt  = diff === 0
      ? '<span style="color:var(--seppia);font-style:italic;">— invariato</span>'
      : `<span class="cifra ${diffCls}">${diff > 0 ? '▲ ' : '▼ '}${formattaEuro(Math.abs(diff))}</span>`;

    const tr = document.createElement('tr');
    tr.className = 'riga-nuova';
    tr.innerHTML = `
      <td>
        <span class="voce">
          ${pos.nome}
          <small>${pos.isin.toUpperCase()} &middot; titolo</small>
        </span>
      </td>
      <td class="cifra">${dataRoma(pos.data)}</td>
      <td class="cifra euro">${formattaEuro(pos.prezzoUnitario)}</td>
      <td class="cifra">${pos.quantita}</td>
      <td class="cifra euro">${formattaEuro(pos.carico)}</td>
      <td class="cifra euro">${formattaEuro(pos.attuale)}</td>
      <td>${diffTxt}</td>
    `;

    // Rimuovi riga-vuota se presente
    const vuota = corpoTab.querySelector('.riga-vuota');
    if (vuota) corpoTab.removeChild(vuota);

    corpoTab.appendChild(tr);

    // Aggiorna piede
    const totCarico  = posizioni.reduce((s, p) => s + p.carico, 0);
    const totAttuale = posizioni.reduce((s, p) => s + p.attuale, 0);
    const totDiff    = totAttuale - totCarico;
    const totDiffCls = totDiff > 0 ? 'guadagno' : totDiff < 0 ? 'perdita' : '';

    document.getElementById('tot-carico').innerHTML  = `<span class="euro cifra">${formattaEuro(totCarico)}</span>`;
    document.getElementById('tot-attuale').innerHTML = `<span class="euro cifra">${formattaEuro(totAttuale)}</span>`;
    document.getElementById('tot-diff').innerHTML    = totDiff === 0
      ? '<span style="color:var(--seppia);font-style:italic;">—</span>'
      : `<span class="cifra ${totDiffCls}">${totDiff > 0 ? '▲ ' : '▼ '}${formattaEuro(Math.abs(totDiff))}</span>`;

    piede.style.display = '';

    // Aggiorna contatore
    contatore.textContent = posizioni.length + (posizioni.length === 1 ? ' posizione' : ' posizioni');
  }

  /* ---- Mostra avviso successo ---- */
  function mostraSuccesso(isin, controvalore) {
    const avviso = document.createElement('div');
    avviso.className = 'avviso-successo';
    avviso.setAttribute('role', 'status');
    avviso.innerHTML = `
      <span class="timbro-ok">Iscritto</span>
      <p>
        Posizione <b>${isin.toUpperCase()}</b> iscritta nel registro con successo.
        Controvalore di carico: <b class="euro cifra">${formattaEuro(controvalore)}</b>.
      </p>
    `;
    // Inserisce sopra il riquadro modulo
    form.closest('.riquadro-modulo').before(avviso);

    // Rimuove dopo 5s
    setTimeout(() => {
      avviso.style.transition = 'opacity .4s';
      avviso.style.opacity = '0';
      setTimeout(() => avviso.remove(), 420);
    }, 5000);
  }

  /* ---- Reset form ---- */
  function resetForm() {
    form.reset();
    ['isin','data-carico','prezzo','quantita'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['campo-isin','campo-data','campo-prezzo','campo-quantita'].forEach(id => {
      document.getElementById(id)?.classList.remove('con-errore');
    });
    ['riga-isin','riga-data','riga-prezzo','riga-quantita'].forEach(id => {
      document.getElementById(id)?.classList.remove('con-errore');
    });
    ['err-isin','err-data','err-prezzo','err-quantita'].forEach(id => {
      document.getElementById(id)?.classList.remove('visibile');
    });
    if (btnIscrive) btnIscrive.disabled = false;
  }

  /* ---- Invio form ---- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!valida()) return;

    const isin    = document.getElementById('isin').value.trim().toUpperCase();
    const data    = document.getElementById('data-carico').value;
    const prezzo  = parseFloat(document.getElementById('prezzo').value);
    const qty     = parseInt(document.getElementById('quantita').value, 10);
    const carico  = prezzo * qty;

    const pos = {
      isin,
      nome: 'Titolo ' + isin,   // nome placeholder (senza lookup live nel mockup)
      data,
      prezzoUnitario: prezzo,
      quantita: qty,
      carico,
      attuale: carico,           // al momento del carico valore = prezzo pagato
    };

    posizioni.push(pos);
    aggiunciRiga(pos);
    mostraSuccesso(isin, carico);
    resetForm();

    // Scorri alla tabella
    corpoTab.closest('table')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  /* ---- Validazione in tempo reale (solo dopo primo tentativo submit) ---- */
  let tentato = false;
  form.addEventListener('submit', () => { tentato = true; });
  form.addEventListener('input', () => { if (tentato) valida(); });

  /* ---- Annulla ---- */
  if (btnAnnulla) {
    btnAnnulla.addEventListener('click', function () {
      resetForm();
      tentato = false;
    });
  }

})();
