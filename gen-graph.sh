#!/bin/sh
_node lib/collapse perf-recorded.data > perf-collapsed.data
./deps/flamegraph.pl perf-collapsed.data > perf-graph.svg
