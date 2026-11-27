#!/bin/bash
# usage: drive-stress.sh <rev> <worktree> <N>
REV=$1; WT=$2; N=$3; TAG=${4:-$REV}; D=$(cd "$(dirname "$0")" && pwd); X=~/.kodus-qa-runs/2026-11-27/2628-retest/exec
export H_REV=$TAG H_WT=$WT H_N=$N H_STEP=2500 H_OUT=$X/stress-$TAG.jsonl H_E2B_LOG=$X/stress-$TAG-e2b.jsonl
rm -f $H_OUT $H_E2B_LOG
docker exec qa2628r-mongo mongosh --quiet --eval "db.getSiblingDB('qa2628r_stress_$TAG').dropDatabase()" >/dev/null
export H_T0=$(( $(date +%s) * 1000 + 25000 ))
cd $WT
for R in A B R1 R2; do H_ROLE=$R node $D/boot.js w-stress.ts $R > $X/stress-$TAG-$R.out 2>&1 & done
wait
docker exec qa2628r-mongo mongosh --quiet --eval "print(JSON.stringify(db.getSiblingDB('qa2628r_stress_$TAG').sandbox_leases.find().toArray()))" > $X/stress-$TAG-finaldocs.json 2>&1
echo done $TAG
