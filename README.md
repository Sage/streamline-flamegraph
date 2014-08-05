Streamline flame graph generator based on Brendan Gregg's FlameGraph (https://github.com/brendangregg/FlameGraph)

## Installation

``` sh
npm install streamline-flamegraph -g
```

## Recording

First you need to instrument your code to record performance counters:

``` javascript
var stop = require('streamline-flamegraph/lib/record').start();
```

This call will create a `perf-recorded.data` file in the current working directory of the process.

The `stop` function can be called as `stop()` to stop recording but you don't need to call it if you want to record till the process is stopped.

## Generating the flamegraph

Once you have recorded data, you need to transform it into a flame graph. This is done with a simple command:

```sh
./gen-graph.sh
```

## Gotchas

The flamegraph only displays streamline stacks (but it displays the _async_ stacks). If you want a complete graph including sync JS calls and C++ stacks, see https://gist.github.com/trevnorris/9616784).

The recorder only works in _callbacks_ mode for now.

API may still evolve so I haven't documented it yet.


## Credits

Thanks to Brendan Gregg for great Perl script (`deps/flamegraph.pl`).

Thanks to @anodos for streamline's enter/exit hooks

## License

MIT (streamline.js) + CDDL (see `deps/flamegraph.pl`)
