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
		fullpath: options.sourceRoot + '/' + file,
		relpath: file,
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

	input = input.nodeTransform(require('zlib').createGunzip()).map(ez.mappers.convert.stringify());
	var locations = {};
	var linesReader = input.transform(ez.transforms.lines.parser());
	linesReader.read(_); // skip header line
	var opts = JSON.parse(linesReader.read(_).substring(1));
	options.sourceRoot = opts.sourceRoot || "";
	options.sourceUrl = opts.sourceUrl || "file://{fullpath}#{line}";

	var results = linesReader.reduce(_, function(_, result, line) {
		if (line[0] === '#' || line.length === 0) return result;
		var cut = line.lastIndexOf(' ');
		var key = line.substring(0, cut);
		var frames = key.split(';');
		// don't record idle waits on background pipes.
		if (frames.length < 6 && frames[frames.length - 1] === 'io' && //
			/ez-streams\/lib\/reader\._js:/.test(frames[frames.length - 2])) return result;
		// record it
		result[key] = (result[key] || 0) + parseInt(line.substring(cut + 1), 10);
		frames.forEach(function(loc, i) {
			var m = / \((.*):(\d+)\)$/.exec(loc);
			if (!m) return;
			locations[loc] = locations[loc] || locationUrl(m[1], m[2], options);
		});
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