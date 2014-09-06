#!/bin/sh

BASE_PATH="$(dirname $0)/.."

cat perf-recorded.data | _node --cache "$BASE_PATH/lib/collapse"  > perf-collapsed.data
[ -f palette.map ] || echo "io->rgb(0,255,255)" > palette.map
cat perf-collapsed.data | egrep -v -e '^node;pipe .*?;io \d+$' | "$BASE_PATH/deps/flamegraph.pl" --cp $* > perf-full.svg
cat perf-collapsed.data | egrep -v -e ';io \d+$' | "$BASE_PATH/deps/flamegraph.pl" --cp $* > perf-cpu.svg
