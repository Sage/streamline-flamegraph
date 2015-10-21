/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

/// !doc
/// 
/// # Flamegraph recorder for streamline code
/// 
/// `var fg = require('streamline-flamegraph/lib/record')`  
/// 
var events = require('events');
var glob = require('streamline-runtime').globals;
var fs = require('fs');
var fsp = require("path");
var trace; // = console.log;
//if (!/^(callbacks|fibers)$/.test(glob.runtime)) throw new Error("cannot record performance counters - unsupported streamline mode: " + glob.runtime);

function errorHandler(err) {
	if (err) console.error(err.stack);
}

function outputQueue(options) {
	options = options || {};
	// this is called from setImmediate so we can require ez-streams.
	var ez = require('ez-streams');
	var queue = ez.devices.queue();
	// in new format only pass JSON for first configuration and strings for remaining data		
	queue.put(JSON.stringify({
			sourceRoot: options.sourceRoot,
			sourceUrl: options.sourceUrl,
			rate: options.rate,
			condensed: true,
			stamp: new Date(),
	}));
	return queue;
}

/// * `recorder = fg.create(options)`  
///   Creates a flamegraph recorder.  
///   The following options can be set:  
///   `rate`: the sampling rate, in milliseconds. 1 by default.  
///   `sourceRoot`: the root directory for source files.  
///   `output`: the output stream or filename. Used only by `recorder.run()`  
exports.create = function(options) {
	options = options || {};
	options.sourceRoot = options.sourceRoot || "";
	var rate = options.rate > 0 ? options.rate : 1;
	var queue = outputQueue(options);
	var running = false;

	function time() {
		return Math.floor(Date.now() / rate);
	}
	var cpu = time();
	// Output is a list of lines starting with "F;" for a file name, e. g. F;/temp/foo.txt.
	// the files are put into an array and then referenced by an index (first file will have index 0, second index 1, ...)
	// or "S;" for a stack frame, e. g. "S;2;25;bar" means stack frame of file number 2 (as above), line 25, function name "bar"
	// the files are put into an array and then referenced by an index (first frame will have index 0, second index 1, ...)
	// a special entry "io" marks the time when a function has been yielded
	// or "T;" for a stack trace consisting of the stack frame numbers, e. g. "T;5;7;99" for a stack trace consisting of frames 5, 7, 99.
	// The stack frames and files will be transferred before they are referred to, so even for an incomplete stream, all stack traces
	// can be translated into the full stack trace information with line, file name and function name
	
	// mapping of source file names to numbers
	var sourcesCnt = 0;
	var sources = {};
	// special type of stack frame for io: "io" with number 0.
	// mapping of stack trace entries to numbers
	var stacklines = {};
	stacklines.io = 0;
	var stacklinesCnt = 1; // already count "io" stack frame
	queue.put("\nS;io"); // put data for special io stack frame
	function stackfun(f, cpu, io) {
			var result = "\nT;";
			if (io) result += "0;";
			for (; f; f = f.prev) {
				var cnt = sources[f.file];
				// new source file?
				if (cnt === undefined) {
					var file = f.file;
					// exclude Streamline code
					if (/[\/\\]streamline[\/\\]lib[\/\\](callbacks|fibers(-fast)?|generators(-fast)?)[\/\\]/.test(f.file)) {
						sources[file] = -1;
						continue; // do not include this stack frame 
					}
					// totally exclude
					if (options.exclude && options.exclude.test(file)) {
						sources[file] = -2;
						return undefined; // totally omit this stack trace 							
					}
					cnt = sources[file] = sourcesCnt++;
					queue.put("\nF;"+file)
				} else if (cnt < 0) {
					if (cnt == -2) return; // can already exclude total stack trace
					continue; // omit this stack frame
				}
				var stackline = cnt+";"+f.line+";"+f.name;
				cnt = stacklines[stackline];
				if (cnt === undefined) {
					cnt = stacklines[stackline] = stacklinesCnt++;
					queue.put("\nS;"+stackline);
				}
				result += cnt+";";
			}
			queue.put(result+cpu);
		};
	
	
	var lastId = 0;

	function id(f) {
		return f.id = f.id || ++lastId;
	}

	var initDone = false;
	function initEvents() {
		initDone = true;
		glob.emitter = glob.emitter || new events.EventEmitter();
		glob.emitter.on('yield', function(f) {
			if (!running) return;
			if (!f) return;
			trace && trace(time() + "\tid=" + id(f) + "\tYIELD\t" + f.name);
			f.yielded = time();
		});
		glob.emitter.on('resume', function(f) {
			if (!running) return;
			if (!f) return;
			cpu = time();
			trace && trace(time() + "\tid=" + id(f) + "\tRESUME\t" + f.name + ' ' + (cpu - f.yielded));
			if (f.yielded && f.yielded < cpu) {
				if (queue) {
					stackfun(f, cpu - f.yielded, true);
				}
			}
		});

		glob.emitter.on('enter', function(f) {
			if (!running) return;
			var now = time();
			// recurse counter is necessary to handle calls that are trampolined
			if (!f) return;
			f.recurse = (f.recurse || 0) + 1;
			if (f.recurse > 1) return;
			trace && trace(time() + "\tid=" + id(f) + "\tENTER\t" + f.name + ' ' + (now - cpu));
			if (cpu < now) {
				if (queue && f.prev) {
					stackfun(f.prev, now - cpu);
				}
				cpu = now;
			}
		});
		glob.emitter.on('exit', function(f) {
			if (!running) return;
			var now = time();
			if (!f) return;
			if (--f.recurse) return;
			trace && trace(time() + "\tid=" + id(f) + "\tEXIT\t" + f.name + ' ' + (now - cpu));
			if (cpu < now) {
				if (queue) {
					stackfun(f, now - cpu)
				}
				cpu = now;
			}
		});
	}
	process.on('SIGINT', function() {
		stop(errorHandler);
	});

	function start() {
		// set flag via setImmediate to skip orphan 'exit' events at the beginning
		setImmediate(function() {
			cpu = time();
			if (!initDone) initEvents();
			running = true;
		});
		return that;
	}

	function stop(cb) {
		setImmediate(function() {
			running = false;
			setImmediate(function() {
				try {
				if (queue) {
					queue.put("\n");
				}
				queue && queue.write(cb);
				queue = null;
				} catch (e) {
					console.error("ERROR "+e.stack)
				}
			});
		});
	}

	function pause() {
		setImmediate(function() {
			running = false;
		});
		return that;
	}

	function resume() {
		setImmediate(function() {
			running = true;
		});
		return that;
	}

	function run() {
		var ez = require('ez-streams');
		var output = options.output || ez.devices.file.binary.writer(process.cwd() + '/perf-recorded.gz');
		that.reader.pipe(errorHandler, output);
		that.start();
		return that;
	}

	/// 
	/// ## Recorder methods
	/// 
	/// If you want to capture a complete process run 
	/// you can just call `recorder.run()` at the beginning of your process:
	/// 
	/// * `recorder.run()`: runs a recording task in the background.   
	///   
	/// The following calls allow you to control a recorder:
	/// 
	/// * `recorder.start()`: starts recording.  
	/// * `recorder.stop()`: stops recording.  
	/// * `recorder.pause()`: pauses recording.  
	/// * `recorder.resume()`: resumes a paused recording.  
	/// * `reader = recorder.reader`: returns the recorder's output as an ez-streams reader.  
	///   If you don't use `run()`, you must consume (pipe) this reader.    
	var that = {
		start: start,
		stop: stop,
		pause: pause,
		resume: resume,
		run: run,
		reader: queue.reader,
	};
	
	return that;
};