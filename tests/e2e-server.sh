#!/bin/bash
# Runs browser suites against the server version: for each suite a fresh database with the sample data, a server on
# a free port, then the suite with PAGE pointing at it. Needs PostgreSQL (TEST_PG admin URL) and `bash scripts/build-server.sh`.
set -e
cd "$(dirname "$0")/.."
ADMIN="${TEST_PG:-postgres://taraz@127.0.0.1:54329/postgres}"
PORT="${PORT:-8093}"
SUITES="${*:-core v16}"
for s in $SUITES; do
  node -e "const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.argv[1]});await c.connect();await c.query('DROP DATABASE IF EXISTS taraz_e2e WITH (FORCE)');await c.query('CREATE DATABASE taraz_e2e');await c.end()})()" "$ADMIN"
  DATABASE_URL="${ADMIN%/*}/taraz_e2e" TARAZ_SEED=demo PORT=$PORT TARAZ_SYNC_SCHEDULE=off node server-dist/main.mjs > /tmp/taraz-e2e-server.log 2>&1 &
  SRV=$!
  for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.5; done
  echo "== e2e $s (server)"
  set +e
  PAGE="http://127.0.0.1:$PORT/" node tests/e2e-$s.cjs | tail -n 25
  code=${PIPESTATUS[0]}
  set -e
  kill $SRV; wait $SRV 2>/dev/null || true
  [ "$code" = "0" ] || { echo "suite $s failed (server log: /tmp/taraz-e2e-server.log)"; exit 1; }
done
