/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

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
	var output = options.output || ez.devices.file.binary.writer(process.cwd() + '/perf-recorded.gz');

	var opts = ["sourceRoot", "sourceUrl", "rate"].reduce(function(opts, k) {
		opts[k] = options[k];
		return opts;
	}, {});

	function injectHeader(cb, reader, writer) {
		var header = "# streamline.js raw performance data\n" + //
		"#" + JSON.stringify(opts) + "\n";

		writer.write(function(err) {
			if (err) return cb(err);
			reader.pipe(cb, writer);
		}, header);
	}

	queue.reader.transform(injectHeader) //
	.nodeTransform(require('zlib').createGzip()) //
	.pipe(errorHandler, output);

	return queue;
}

function perfStack(f, cpu, options, io) {
	var stack = [];
	for (; f; f = f.prev) {
		var relpath = f.file.substring(options.sourceRoot.length + 1);
		stack.push(f.name + ' (' + relpath + ':' + f.line + ')');
	}
	var s = stack.reverse().join(';');
	if (io) s += ";io";
	var result = process.argv[0] + ';' + s + ' ' + cpu + '\n';
	return result;
}

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
		if (initDone) return;
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
		stop();
	});

	function start() {
		// set flag via setImmediate to skip orphan 'exit' events at the beginning
		setImmediate(function() {
			cpu = time();
			running = true;
			initEvents();

		});
		return that;
	}

	function stop() {
		if (running) queue && queue.end();
		setImmediate(function() {
			running = false;
		});
		return that;
	}
	var that = {
		start: start,
		stop: stop,
	};
	return that;
};