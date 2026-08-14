#!/bin/bash
#
# Eseguibile di PortfolIA.app. Non lanciarlo da qui: crea-launcher.sh ne scrive
# una copia dentro il bundle sostituendo i due segnaposto qui sotto.
#
# Un solo clic fa la cosa giusta in tutti e tre i casi:
#   - app ferma      -> avvia backend e frontend, attende, apre il browser
#   - app già attiva -> chiede se aprire la finestra o fermare l'applicazione
#   - build vecchia  -> ricostruisce prima di avviare (utile dopo un `git pull`)

set -uo pipefail

REPO="@@REPO@@"
PERCORSO_NODE="@@NODE_BIN@@"

URL="http://localhost:4173"
SALUTE="http://localhost:3200/health"
PORTE=(4173 3200)
CARTELLA_LOG="$HOME/Library/Logs/PortfolIA"
LOG="$CARTELLA_LOG/portfolia.log"

mkdir -p "$CARTELLA_LOG"

# --- dialoghi -----------------------------------------------------------------
# `activate` porta in primo piano il processo osascript: senza, la finestra
# resterebbe dietro, perché il bundle non ha un event loop Cocoa proprio.

errore() {
  /usr/bin/osascript -e 'activate' \
    -e "display alert \"PortfolIA\" message \"$1\" as critical" >/dev/null 2>&1
  exit 1
}

chiedi() {
  # Scorciatoia per l'uso da terminale e per le prove: PORTFOLIA_AZIONE=ferma
  # (o =apri) decide al posto del dialogo.
  if [ -n "${PORTFOLIA_AZIONE:-}" ]; then
    case "$PORTFOLIA_AZIONE" in
      ferma) echo "Ferma" ;;
      apri)  echo "Apri" ;;
      *)     echo "" ;;
    esac
    return
  fi
  /usr/bin/osascript -e 'activate' \
    -e 'display dialog "PortfolIA è già in esecuzione." with title "PortfolIA" buttons {"Ferma", "Apri"} default button "Apri" with icon note' \
    2>/dev/null | /usr/bin/sed -n 's/.*button returned:\(.*\)/\1/p'
}

# --- ambiente -----------------------------------------------------------------
# Le app lanciate dal Finder non ereditano il PATH della shell: senza questo,
# `node` installato con nvm risulterebbe introvabile.

export PATH="$PERCORSO_NODE:$PATH"

if ! command -v node >/dev/null 2>&1; then
  # Il percorso inciso alla creazione non c'è più (tipicamente: nvm ha
  # cambiato versione di Node). Secondo tentativo passando da nvm.
  # shellcheck disable=SC1090
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  command -v node >/dev/null 2>&1 || errore "Node.js non è stato trovato. Riesegui 'npm run launcher' nel progetto per aggiornare il collegamento."
fi

[ -d "$REPO" ] || errore "La cartella del progetto non esiste più: $REPO"

# --- già in esecuzione? -------------------------------------------------------

ferma() {
  for porta in "${PORTE[@]}"; do
    pids=$(/usr/sbin/lsof -ti "tcp:$porta" -sTCP:LISTEN 2>/dev/null)
    [ -n "$pids" ] && kill $pids 2>/dev/null
  done
  # concurrently esce da solo quando cadono i due figli; se qualcosa resta
  # appeso alle porte dopo il periodo di grazia, si insiste.
  sleep 3
  for porta in "${PORTE[@]}"; do
    pids=$(/usr/sbin/lsof -ti "tcp:$porta" -sTCP:LISTEN 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  done
  exit 0
}

if /usr/bin/curl -sf --max-time 2 "$SALUTE" >/dev/null 2>&1; then
  case "$(chiedi)" in
    Ferma) ferma ;;
    Apri)  open "$URL"; exit 0 ;;
    *)     exit 0 ;;  # finestra chiusa con Esc
  esac
fi

# --- build assente o superata dal codice --------------------------------------

cd "$REPO" || errore "Non riesco a entrare in $REPO"

ricostruisci=0
[ -f "client/dist/index.html" ] || ricostruisci=1
[ -f "shared/dist/types/index.js" ] || ricostruisci=1
if [ "$ricostruisci" -eq 0 ]; then
  piu_recente=$(find client/src shared/types shared/domain -type f \
    -newer client/dist/index.html -print -quit 2>/dev/null)
  [ -n "$piu_recente" ] && ricostruisci=1
fi

{
  echo ""
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') avvio da PortfolIA.app"
} >>"$LOG"

if [ "$ricostruisci" -eq 1 ]; then
  echo "--- build" >>"$LOG"
  npm run build >>"$LOG" 2>&1 || errore "La build è fallita. Dettagli in $LOG"
fi

# --- avvio --------------------------------------------------------------------
# nohup + background: alla fine di questo script i due server restano vivi,
# adottati da launchd, e l'icona sparisce dal Dock.

nohup npm start >>"$LOG" 2>&1 &

for _ in $(seq 1 60); do
  if /usr/bin/curl -sf --max-time 2 "$SALUTE" >/dev/null 2>&1 \
    && /usr/bin/curl -sf --max-time 2 "$URL" >/dev/null 2>&1; then
    open "$URL"
    exit 0
  fi
  sleep 1
done

errore "PortfolIA non è partita entro un minuto. Dettagli in $LOG"
