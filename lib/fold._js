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
var flows = require('streamline/lib/util/flows');

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
		var exclude = false;
		// record it
		var key = item.stack.reverse().filter(function(frame) {
			if (options.exclude && options.exclude.test(frame.file)) exclude = true;
			// discard internal streamline functions for stack frames
			return !/\/streamline\/lib\/(callbacks|fibers(-fast)?|generators(-fast)?)\//.test(frame.file);
		}).map(function(frame) {
			var loc = frame.func + ' (' +  frame.file + ':' + frame.line + ')';
			locations[loc] = locations[loc] || locationUrl(frame.file, frame.line, options);
			return loc;
		}).join(';') + (item.io ? ';io' : '');
		if (!exclude) result[key] = (result[key] || 0) + item.cpu;
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
exports.convert = function(_, streams, options) {
	options = options || {};
	var tmpdir = process.env.TMPDIR || process.env.TMP || process.env.TEMP;
	var tmpbase = fsp.join(tmpdir, "SVG-" + process.pid + '-' + Math.floor(Math.random() * 1000000));
	var nameattr = tmpbase + "-attr.txt";	
	var palette = tmpbase + "-palette.txt";

	// first pass: fold
	exports.fold(_, {
		input: streams.recordingReader,
		output: tmpbase + "-folded.txt",
		nameattr: nameattr,
		exclude: options.exclude,
	});

	function genGraph(_, input, output) {
		// second pass: transform with flamegraph.pl
		var child = require('child_process').spawn(fsp.join(__dirname, '../deps/flamegraph.pl'), [ //
		"--nameattr", nameattr, //
		"--palette", palette, //
		"--cp"]);
		flows.collect(_, [
			input.pipe(!_, ez.devices.child_process.writer(child)),
			ez.devices.child_process.reader(child, {
				errorThrow: true,
			}).pipe(!_, output),
		]);
	}

	function foldedReader(full, inverted) {
		var reader = ez.devices.file.text.reader(tmpbase + "-folded.txt");
		if (full && !inverted) return reader;
		reader = reader.transform(ez.transforms.lines.parser());
		if (!full) reader = reader.filter(function(_, line) {
			return !/;io \d+$/.test(line);			
		});
		if (inverted) reader = reader.map(function(_, line) {
			var cut = line.lastIndexOf(' ');
			return line.substring(0, cut).split(';').reverse().join(';') + line.substring(cut);
		});
		return reader.transform(ez.transforms.lines.formatter());
	}

	// process first one alone, to avoid concurrent writes to palette
	require("fs").writeFile(palette, "io->rgb(0,255,255)", "utf8", ~_);
	genGraph(_, foldedReader(true, false), streams.fullWriter);

	// process the other ones in parallel
	flows.collect(_, [
		genGraph(!_, foldedReader(false, false), streams.cpuWriter),
		genGraph(!_, foldedReader(true, true), streams.invertedFullWriter),
		genGraph(!_, foldedReader(false, true), streams.invertedCpuWriter),
	]);
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