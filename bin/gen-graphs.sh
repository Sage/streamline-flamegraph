#!/bin/sh

BASE_PATH="$(dirname $0)/.."

cat perf-recorded.gz | _node --cache "$BASE_PATH/lib/fold"  -o perf-folded.txt -n perf-attr.txt
[ -f palette.map ] || echo "io->rgb(0,255,255)" > palette.map
cat perf-folded.txt | egrep -v -e '^node;pipe .*?;io \d+$' | "$BASE_PATH/deps/flamegraph.pl" --nameattr perf-attr.txt --cp $* > perf-full.svg
cat perf-folded.txt | egrep -v -e ';io \d+$' | "$BASE_PATH/deps/flamegraph.pl" --nameattr perf-attr.txt --cp $* > perf-cpu.svg
