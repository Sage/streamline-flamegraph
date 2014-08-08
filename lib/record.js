/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

var events = require('events');
var glob = require('streamline/lib/globals');
var fs = require('fs');
var trace; // = console.log;
//if (!/^(callbacks|fibers)$/.test(glob.runtime)) throw new Error("cannot record performance counters - unsupported streamline mode: " + glob.runtime);
// fast writer - bufferizes up to options.bufSize before flushing

function Writer(options) {
	options = options || {};
	var path = options.output || (process.cwd() + '/perf-recorded.data');
	var bufSize = options.bufSize || 32000;
	var ready = false;
	var buf = "";

	var cb = function(err) {
			if (err) return console.error(err.stack);
			ready = true;
		};
	fs.writeFile(path, "# streamline.js raw performance data\n", "utf8", cb);

	this.write = function(text, sync) {
		buf += text;
		if (sync) {
			fs.appendFileSync(path, buf, "utf8");
			buf = "";
		} else if (ready && buf.length >= bufSize) {
			fs.appendFile(path, buf, "utf8", cb);
			buf = "";
		}
	}
}

function perfStack(f, cpu, io) {
	var stack = [];
	for (; f; f = f.prev) {
		stack.push(f.name + ' (' + f.file + ':' + f.line + ')');
	}
	var s = stack.reverse().join(';');
	if (io) s += ";io";
	var result = process.argv[0] + ';' + s + ' ' + cpu + '\n';
	return result;
}

exports.create = function(options) {
	options = options || {};
	var rate = options.rate > 0 ? options.rate : 1;
	var writer = new Writer(options);
	var running = false;

	function time() {
		return Math.floor(Date.now() / rate);
	}
	var cpu = time();

	var lastId = 0;

	function id(f) {
		return f.id = f.id || ++lastId;
	}

	glob.emitter = glob.emitter || new events.EventEmitter();
	glob.emitter.on('yield', function() {
		if (!running) return;
		var f = glob.frame;
		if (!f) return;
		trace && trace(time() + "\tid=" + id(f) + "\tYIELD\t" + f.name);
	});
	glob.emitter.on('resume', function() {
		if (!running) return;
		var f = glob.frame;
		if (!f) return;
		cpu = time();
		trace && trace(time() + "\tid=" + id(f) + "\tRESUME\t" + f.name + ' ' + (cpu - f.exited));
		if (f.exited < cpu) {
			writer.write(perfStack(f, cpu - f.exited, true));
		}
	});

	glob.emitter.on('enter', function() {
		if (!running) return;
		var now = time();
		var f = glob.frame;
		// recurse counter is necessary to handle calls that are trampolined
		if (!f) return;
		f.recurse = (f.recurse || 0) + 1;
		if (f.recurse > 1) return;
		trace && trace(time() + "\tid=" + id(f) + "\tENTER\t" + f.name + ' ' + (now - cpu));
		if (cpu < now) {
			if (f.prev) writer.write(perfStack(f.prev, now - cpu));
			cpu = now;
		}
	});
	glob.emitter.on('exit', function() {
		if (!running) return;
		var now = time();
		var f = glob.frame;
		if (!f) return;
		if (--f.recurse) return;
		trace && trace(time() + "\tid=" + id(f) + "\tEXIT\t" + f.name + ' ' + (now - cpu));
		if (cpu < now) {
			writer.write(perfStack(f, now - cpu));
			cpu = now;
		}
		f.exited = now;
	});
	process.on('exit', function() {
		if (running) writer.write('', true);
	});

	function start() {
		// set flag via setImmediate to skip orphan 'exit' events at the beginning
		setImmediate(function() {
			cpu = time();
			running = true;
		});
		return that;
	}

	function stop() {
		if (running) writer.write('', true);
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
}