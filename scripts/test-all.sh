#!/bin/bash
# Release check: type check, both builds, every unit suite, the server suite and every browser suite (demo build, then
# the server build). Stops at the first failure. The server parts need PostgreSQL: TEST_PG=postgres://user@host:port/postgres
set -e
cd "$(dirname "$0")/.."
pnpm exec tsc -b
bash scripts/build-artifact.sh
bash scripts/build-server.sh
for t in phase1 points worklog gantt admin personal v14 release mdr; do echo "== unit $t"; node tests/run.mjs tests/$t.test.ts | tail -n 1; done
echo "== server"; node tests/run.mjs tests/server.test.ts | tail -n 1
for t in phase1 points worklog gantt admin personal v14 v15 v16 core; do echo "== e2e $t"; node tests/e2e-$t.cjs | tail -n 1; done
echo "== e2e release (desktop)"; PART=desktop node tests/e2e-release.cjs | tail -n 1
echo "== e2e release (mobile)"; PART=mobile node tests/e2e-release.cjs | tail -n 1
bash tests/e2e-server.sh core v16 phase1 v14 v15 admin personal points worklog gantt
