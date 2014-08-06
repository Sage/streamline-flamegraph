Streamline [flame graph](http://www.brendangregg.com/FlameGraphs/cpuflamegraphs.html) generator based on [Brendan Gregg's FlameGraph](https://github.com/brendangregg/FlameGraph)

## Installation

``` sh
npm install streamline-flamegraph
```

## Recording

First you need to instrument your code to record performance counters:

``` javascript
var recorder = require('streamline-flamegraph/lib/record').create();
recorder.start();
```

This will start the recording and create a `perf-recorded.data` file in the current working directory of the process.

The recording can be stopped by calling `recorder.stop()` but you don't need to call it if you want to record till the process exits.

## Generating the flamegraph

Once you have recorded data, you need to transform it into a flame graph. This is done with a simple command:

```sh
bin/gen-graphs.sh
```

This will generate two flame graphs in the current directory:

* `perf-cpu.svg`: CPU only graph
* `perf-full.svg`: CPU+IO graph

## Gotchas

The flamegraph only displays streamline stacks (but it displays the _async_ stacks). If you want a complete graph including sync JS calls and C++ stacks, see https://gist.github.com/trevnorris/9616784).

The recorder only works in _callbacks_ mode for now.

API may still evolve so I haven't documented it yet.


## Credits

Thanks to Brendan Gregg for the great Perl script (`deps/flamegraph.pl`).

Thanks to @anodos for streamline's enter/exit hooks

## License

MIT (streamline.js) + CDDL (see `deps/flamegraph.pl`)
