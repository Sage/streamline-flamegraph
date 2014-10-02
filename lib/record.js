/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

/// !doc
/// 
/// # Flamegraph recorder for streamline code
/// 
/// `var fg = require('streamline-flamegraph/lib/record')`  
/// 
var events = require('events');
var glob = require('streamline/lib/globals');
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

	queue.put({
		sourceRoot: options.sourceRoot,
		sourceUrl: options.sourceUrl,
		rate: options.rate,
		stamp: new Date(),
	});
	queue.reader = queue.reader.map(ez.mappers.json.stringify()).nodeTransform(require('zlib').createGzip());
	return queue;
}

function perfStack(f, cpu, options, io) {
	var stack = [];
	for (; f; f = f.prev) {
		stack.push({
			func: f.name,
			file: f.file,
			line: f.line,
		});
	}
	return {
		stack: stack,
		io: !!io,
		cpu: cpu,
	};
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
				var ioStack = perfStack(f, cpu - f.yielded, options, true);
				if (ioStack) queue && queue.put(ioStack);
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
				if (f.prev) queue && queue.put(perfStack(f.prev, now - cpu, options));
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
				queue && queue.put(perfStack(f, now - cpu, options));
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
				queue && queue.write(cb);
				queue = null;				
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