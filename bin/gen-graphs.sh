#!/bin/sh
cat perf-recorded.data | _node --cache lib/collapse  > perf-collapsed.data
[ -f palette.map ] || echo "io->rgb(0,255,255)" > palette.map
cat perf-collapsed.data | egrep -v -e '^node;pipe .*?;io \d+$' | ./deps/flamegraph.pl --cp $* > perf-full.svg
cat perf-collapsed.data | egrep -v -e ';io \d+$' | ./deps/flamegraph.pl --cp $* > perf-cpu.svg
