#!/bin/bash
# usage: run.sh <merge|parent> <script.ts> [args...]
W=$(cd "$(dirname "$0")" && pwd); REVDIR=$1; shift; S=$1; shift
rm -rf "$W/$REVDIR/harness" && cp -R "$W/harness" "$W/$REVDIR/harness"
cd "$W/$REVDIR" && REV=$REVDIR TS_NODE_TRANSPILE_ONLY=1 TS_NODE_SWC=1 TS_NODE_PROJECT=tsconfig.json exec node -r ts-node/register -r tsconfig-paths/register "harness/$S" "$@"
