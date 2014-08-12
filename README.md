[Flame graph](http://www.brendangregg.com/FlameGraphs/cpuflamegraphs.html) instrumentation for [streamline.js](https://github.com/Sage/streamlinejs), based on [Brendan Gregg's FlameGraph](https://github.com/brendangregg/FlameGraph)

![](examples/perf-full.png?raw=true)

## Installation

``` sh
npm install streamline-flamegraph
```

## Recording

First you need to instrument your code to record performance counters:

``` javascript
var recorder = require('streamline-flamegraph/lib/record').create().start();
```

This will start the recording and create a `perf-recorded.data` file in the current working directory of the process.

The recording can be stopped by calling `recorder.stop()` but you don't need to call it if you want to record till the process exits.

## Generating the flamegraph

Once you have recorded data, you need to transform it into a flame graph. This is done with a simple command:

```sh
bin/gen-graphs.sh
```

This will generate two flame graphs in the current directory:

* [perf-cpu.svg](examples/perf-cpu.png?raw=true): CPU only graph
* [perf-full.svg](examples/perf-full.png?raw=true): CPU+IO graph

## Gotchas

The flamegraph only displays streamline stacks (but it displays the _async_ stacks). If you want a complete graph including sync JS calls and C++ stacks, see https://gist.github.com/trevnorris/9616784).

The [3 main streamline modes (callbacks, fibers, generators)](https://github.com/Sage/streamlinejs#generation-options) are supported, but streamline's [fast mode](https://github.com/Sage/streamlinejs#fast-mode) must be off.

API may still evolve so I haven't documented it yet.


## Credits

Thanks to Brendan Gregg for the great Perl script (`deps/flamegraph.pl`).

## License

MIT (streamline.js) + CDDL (see `deps/flamegraph.pl`)
