/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

var events = require('events');
var glob = require('streamline/lib/globals');
var fs = require('fs');

if (glob.runtime !== 'callbacks') throw new Error("cannot record performance counters - unsupported streamline mode: " + glob.runtime);

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

	this.write = function(text, force) {
		buf += text;
		if (force || (ready && buf.length >= bufSize)) {
			fs.appendFile(path, buf, "utf8", cb);
			buf = "";
		}
	}
}

function perfStack(options, now) {
	var stack = [];
	var f = glob.frame;
	var count = now - f.enter;
	var wait = f.wait;
	for (; f; f = f.prev) {
		stack.push(f.name + ' (' + f.file + ':' + f.line + ')');
		f.enter = now;
	}
	var s = stack.reverse().join(';');
	var result = process.argv[0] + ';' + s + ' ' + count + '\n';
	if (wait) result += process.argv[0] + ';' + s + ';io ' + wait + '\n';
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
	running = true;

	glob.emitter = glob.emitter || new events.EventEmitter();
	glob.emitter.on('enter', function() {
		if (!running) return;
		var now = time();
		var f = glob.frame;
		if (f.enter) f.wait += now - f.enter;
		else f.wait = 0;
		f.enter = now;
	});
	glob.emitter.on('exit', function() {
		if (!running) return;
		var t = glob.frame.enter;
		var now = time();
		var delta = now - t;
		if (delta > 0 && running) {
			writer.write(perfStack(options, now));
		}
	});
	process.on('exit', function() {
		if (running) writer.write('', true);
	});

	function start() {
		running = true;
		return that;
	}
	function stop() {
		if (running) writer.write('', true);
		running = false;
		return that;
	}
	var that = {
		start: start,
		stop: stop,
	};
	return that;
}