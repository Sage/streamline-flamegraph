/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

/// !doc
/// 
/// # Flamegraph utility to fold recordings
/// 
/// `var fgf = require('streamline-flamegraph/lib/fold')`  
/// 
/// ## API
/// 

var ez = require('ez-streams');
var fsp = require("path");

function locationUrl(file, line, options) {
	var values = {
		fullpath: file,
		relpath: fsp.relative(options.sourceRoot, file),
		line: line,
	};
	return options.sourceUrl.replace(/\{([^\}]*)\}/g, function(all, key) {
		return values[key];
	});
}

/// * `fgf.fold(_, options)`  
///   Folds recorded data. The options are the following:  
///   `input`: the recorded data, as a reader or a filename.  
///   `output`: the output for the folded data, as a writer or a filename.  
///   `nameattr`: optional file name where `fold` will write the function name map.    
exports.fold = function(_, options) {
	options = options || {};
	var output = options.output || ez.devices.std.out('utf8');
	if (typeof output === "string") output = ez.devices.file.text.writer(output);
	var input = options.input || ez.devices.std. in ();
	if (typeof input === "string") input = ez.devices.file.binary.reader(input);
	var nameattr = typeof options.nameattr === "string" ? ez.devices.file.text.writer(options.nameattr) : options.nameattr;

	input = input.nodeTransform(require('zlib').createGunzip()) //
	.map(ez.mappers.convert.stringify()) //
	.transform(ez.transforms.lines.parser()) //
	.map(ez.mappers.json.parse());

	var locations = {};
	var opts = input.read(_);
	options.sourceRoot = opts.sourceRoot || "";
	options.sourceUrl = opts.sourceUrl || "file://{fullpath}#{line}";

	var results = input.reduce(_, function(_, result, item) {
		// don't record idle waits on background pipes.
		if (item.stack.length < 6 && item.io && //
			/ez-streams\/lib\/reader\._js$/.test(item.stack[0].file)) return result;
		// record it
		var key = item.stack.reverse().map(function(frame) {
			var loc = frame.func + ' (' +  frame.file + ':' + frame.line + ')';
			locations[loc] = locations[loc] || locationUrl(frame.file, frame.line, options);
			return loc;
		}).join(';') + (item.io ? ';io' : '');
		result[key] = (result[key] || 0) + item.cpu;
		return result;
	}, {});

	ez.devices.array.reader(Object.keys(results).sort()) //
	.map(function(_, key) {
		return key + ' ' + results[key] + '\n';
	}) //
	.pipe(_, output);

	if (nameattr) ez.devices.array.reader(Object.keys(locations).sort()) //
	.map(function(_, key) {
		var loc = locations[key];
		return [key, 'href=' + loc, 'target=_blank'].join('\t') + '\n';
	}) //
	.pipe(_, nameattr);
};

/// * cvt = `fgf.converter(_, reader, options)`  
///   Folds recorded data coming from `reader`.  
///   Returns a function which can called as `cvt(_, full)` to obtain the SVG readers.  
///   `fullReader = cvt(_, true)` gives a reader which produces the full graph (with IO slices).  
///   `cpuReader = cvt(_, false)` gives a reader which produces the CPU graph (without IO slices).  
exports.converter = function(_, reader, options) {
	var tmpdir = process.env.TMPDIR || process.env.TMP || process.env.TEMP;
	var tmpbase = fsp.join(tmpdir, "SVG-" + process.pid + '-' + Math.floor(Math.random() * 1000000));
	var nameattr = tmpbase + "-attr.txt";
	var folded = tmpbase + "-folded-full.txt";
	var palette = tmpbase + "-palette.txt";

	// first pass: fold
	exports.fold(_, {
		input: reader,
		output: folded,
		nameattr: nameattr,
	});

	return function(_, full) {
		// second pass: transform with flamegraph.pl
		if (!full) {
			var cpuOnly = tmpbase + "-folded-cpu.txt";
			var lines = ez.transforms.lines;
			ez.devices.file.text.reader(folded).transform(lines.parser()).filter(function(_, line) {
				return !/;io \d+$/.test(line);
			}).transform(lines.formatter()).pipe(_, ez.devices.file.text.writer(cpuOnly));
		}
		require("fs").writeFile(palette, "io->rgb(0,255,255)", "utf8", ~_);
		var child = require('child_process').spawn(fsp.join(__dirname, '../deps/flamegraph.pl'), [ //
		"--nameattr", nameattr, //
		"--palette", palette, //
		"--cp", //
		full ? folded : cpuOnly]);
		return ez.devices.child_process.reader(child, {
			errorThrow: true,
		});
	}
};

/// 
/// ## Command line usage
/// 
/// This module may also be invoked from the command line. For usage, type:
/// 
/// ```sh
/// _node --cache streamline-flamegraph/lib/fold -h
/// ```
if (require.main === module) {
	var options = require('commander');

	options.version(require('../package.json').version) //
	.option('-i, --input [input]', 'input file') //
	.option('-o, --output [output]', 'output file') //
	.option('-n, --nameattr [nameattr]', 'name attributes file') //
	.option('-s, --source-root [sourceRoot]', 'source root') //
	.parse(process.argv);

	exports.fold(function(err) {
		if (err) throw err;
	}, options);
}