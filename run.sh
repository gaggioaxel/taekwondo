#!/usr/bin/env bash
# Avvia la pagina Taekwondo Comic Challenge in locale.
#
# Uso:
#   ./run.sh              # dev server (Vite + API) su http://localhost:3000
#   ./run.sh 4000         # porta diversa
#   ./run.sh --prod       # build di produzione e serve da dist/
#   PORT=4000 ./run.sh --prod
#
# La chiave Gemini (necessaria solo per lo scanner del kit) va in .env.local o .env:
#   GEMINI_API_KEY="..."
set -euo pipefail

cd "$(dirname "$0")"

MODE=dev
PORT="${PORT:-3000}"
for arg in "$@"; do
  case "$arg" in
    --prod) MODE=prod ;;
    ''|*[!0-9]*) echo "Argomento sconosciuto: $arg" >&2; exit 1 ;;
    *) PORT="$arg" ;;
  esac
done

if ! command -v npm >/dev/null 2>&1; then
  echo "npm non trovato: installa Node.js (>= 20)." >&2
  exit 1
fi

# Carica le variabili d'ambiente (server.ts legge solo .env, il README indica .env.local)
for f in .env .env.local; do
  if [[ -f "$f" ]]; then
    set -a; source "$f"; set +a
  fi
done

if [[ -z "${GEMINI_API_KEY:-}" || "${GEMINI_API_KEY}" == "MY_GEMINI_API_KEY" ]]; then
  echo "⚠  GEMINI_API_KEY non impostata: la pagina parte, ma lo scanner del kit non funzionerà."
  echo "   Aggiungila in .env.local (vedi .env.example)."
fi

# Installa le dipendenze se mancano o se package.json è più recente
if [[ ! -d node_modules || package.json -nt node_modules ]]; then
  echo "→ Installo le dipendenze…"
  npm install
  touch node_modules
fi

if [[ "$MODE" == prod ]]; then
  echo "→ Build di produzione…"
  npm run build
  export NODE_ENV=production
else
  export NODE_ENV=development
fi

echo "→ Avvio su http://localhost:${PORT}  (Ctrl+C per fermare)"
exec npx tsx server.ts --port "$PORT"
