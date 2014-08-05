"use strict";
/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */

var events = require('events');
var glob = require('streamline/lib/globals');
var fs = require('fs');

if (glob.runtime !== 'callbacks') throw new Error("cannot record performance counters - unsupported streamline mode: " + glob.runtime);

function Writer(options) {
	options = options || {};
	options.path = options.path || (process.cwd() + '/perf-recorded.data');
	options.bufSize = options.bufSize || 32000;
	var ready = false;
	var buf = "";

	var cb = function(err) {
		if (err) return console.error(err.stack);
		ready = true;
	};
	fs.writeFile(options.path, "# streamline.js performance data\n", "utf8", cb);

	this.write = function(text, force) {
		buf += text;
		if (force || (ready && buf.length >= options.bufSize)) {
			fs.appendFile(options.path, buf, "utf8", cb);
			buf = "";
		}
	}
}

var pathIds = {};
var pathCount = 0;

function perfStack(config, count) {
	var stack = [];
	for (var f = glob.frame; f; f = f.prev) {
		stack.push(f.name + ' (' + f.file + ':' + f.line + ')');
	}
	return process.argv[0] + ';' + stack.reverse().join(';') + ' ' + count + '\n';
}

exports.start = function(config) {
	config = config || {};
	config.slice = config.slice > 0 ? config.slice : 1;
	var writer = new Writer(config.writer);
	var running = false;
	var times = [];
	function time() { return  Math.floor(Date.now() / config.slice);}
	running = true;

	glob.emitter = glob.emitter || new events.EventEmitter();
	glob.emitter.on('enter', function() {
		times.push(time());
	});
	glob.emitter.on('exit', function() {
		var t = times.pop();
		var now = time();
		var delta = now - t;
		if (delta > 0  && running) {
			for (var i = 0; i < times.length; i++) times[i] += delta;
			writer.write(perfStack(config, delta));
		}
	});
	process.on('exit', function(){
		if (running) writer.write('', true);
	});

	return function stop() {
		if (running) writer.write('', true);
		running = false;		
	}
}
