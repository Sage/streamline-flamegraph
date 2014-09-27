[Flame graph](http://www.brendangregg.com/FlameGraphs/cpuflamegraphs.html) instrumentation for [streamline.js](https://github.com/Sage/streamlinejs), based on [Brendan Gregg's FlameGraph](https://github.com/brendangregg/FlameGraph)

![](examples/perf-full.png?raw=true)

<a name="installation"/>
## Installation

``` sh
npm install streamline-flamegraph
```

<a name="recording"/>
## Recording

First you need to instrument your code to record performance counters:

``` javascript
var recorder = require('streamline-flamegraph/lib/record').create(options).run();
```

This will start the recording and create a `perf-recorded.gz` file in the current working directory of the process.

The recording can be stopped by calling `recorder.stop()` but you don't need to call it if you want to record till the process exits.

The `options` argument allows you to pass configuration parameters (see [below](#configuration))

<a name="gen-graph"/>
## Generating the flamegraph

Once you have recorded data, you need to transform it into a flame graph. This is done with a simple command:

```sh
bin/gen-graphs.sh
```

This will generate two flame graphs in the current directory:

* [perf-cpu.svg](examples/perf-cpu.png?raw=true): CPU only graph
* [perf-full.svg](examples/perf-full.png?raw=true): CPU+IO graph

<a name="configuration"/>
## Configuration

You can pass the following configuration options to the `create` call.

``` javascript
{
	// sampling rate, in milliseconds, 1 by default
	rate: 1,
	// root of source tree (will be trimmed from full file names to get relative paths)
	// by default: ""
	sourceRoot: __dirname,
	// pattern for source link URLs
	// by default: "file://{fullpath}#{line}"
	sourceUrl: "https://github.com/Sage/streamline-flamegraph/tree/master/{relpath}#L{line}",
}
```

The `sourceUrl` option allows you to create hyperlinks to the your github repository, or to open your favorite source editor (for example `"subl://open/?url=file://{fullpath}&line={line}"` for Sublime Text with `subl://` URL handler extension).

## Gotchas

The flamegraph only displays streamline stacks (but it displays the _async_ stacks). If you want a complete graph including sync JS calls and C++ stacks, see https://gist.github.com/trevnorris/9616784).

The [3 main streamline modes (callbacks, fibers, generators)](https://github.com/Sage/streamlinejs#generation-options) are supported, but streamline's [fast mode](https://github.com/Sage/streamlinejs#fast-mode) must be off.

API may still evolve so I haven't documented it yet.


## Credits

Thanks to Brendan Gregg for the great Perl script (`deps/flamegraph.pl`).

## License

MIT (streamline.js) + CDDL (see `deps/flamegraph.pl`)
