#!/usr/bin/env bash
# Stop hook: se ci sono modifiche non committate o commit non pushati,
# chiede a Claude di PROPORRE all'utente commit e/o push prima di fermarsi.
# Si auto-disattiva quando è già in corso una continuazione causata da questo
# hook (stop_hook_active), così non entra mai in loop.

input=$(cat)

# Già in continuazione per via di questo hook → lascia fermare.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$dir" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

dirty=$(git status --porcelain)
ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)

msg=""
[ -n "$dirty" ] && msg="Ci sono modifiche non committate nel working tree."
if [ "$ahead" -gt 0 ] 2>/dev/null; then
  msg="$msg Ci sono $ahead commit locali non ancora pushati su origin."
fi

[ -z "$msg" ] && exit 0

jq -n --arg r "$msg PROPONI esplicitamente all'utente di fare commit e/o push (chiedendo conferma prima di eseguire), poi fermati. Se l'utente ha già deciso di non farlo in questo turno, rispetta la scelta." \
  '{decision: "block", reason: $r}'
exit 0
