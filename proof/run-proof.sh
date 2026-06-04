#!/usr/bin/env bash
# CP-0 build/run proof runner. Executes the 7 reviewer commands against a real
# local Postgres, capturing full output + exit codes to proof/proof-run.log.
set -uo pipefail
cd "$(dirname "$0")/.."
LOG="proof/proof-run.log"
: > "$LOG"

run() {
  local label="$1"; shift
  {
    echo ""
    echo "==================================================================="
    echo "### $label"
    echo "### \$ $*"
    echo "### started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "==================================================================="
  } | tee -a "$LOG"
  "$@" >>"$LOG" 2>&1
  local code=$?
  echo "### exit code: $code  (finished $(date -u +%Y-%m-%dT%H:%M:%SZ))" | tee -a "$LOG"
  return $code
}

echo "VIGISCAM backend — CP-0 proof run  $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
node -v | tee -a "$LOG"; npm -v | tee -a "$LOG"

run "1/7 npm ci"            npm ci
run "2/7 npx prisma generate" npx prisma generate
run "3/7 npm run typecheck" npm run typecheck
run "4/7 npm test"          npm test
run "5/7 npm run build"     npm run build
run "6/7 npm run prisma:deploy" npm run prisma:deploy

echo "" | tee -a "$LOG"
echo "Commands 1-6 done. start:dev (7/7) is captured separately." | tee -a "$LOG"
