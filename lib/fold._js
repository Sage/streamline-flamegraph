/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

var flamegraph_js = require('./flamegraph');
var util = require('util');

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

/// * folded = `fgf.fold(_, input, options)`
///  reads recorded stack trace information, condenses equal stack traces and sorts the stack traces by file name and code line
///  The file names will be normalised as relative names with respect to the source root directory and will have slashes, no backslashes
///  as path separators
/// 
/// input: the input stream (a text stream)
/// options: exclude: pattern for excluding file names (when file name is tested, it is not yet normalized)
///          excludeInv: do not generate inverse stack frames
exports.fold = function(_, input, options) {
	options = options || {};
	var excludeInv = options.excludeInv;
	var nameattr = typeof options.nameattr === "string" ? ez.devices.file.text.writer(options.nameattr) : options.nameattr;
	input = input.transform(ez.transforms.lines.parser());
	var locations = {};
	var result = {};
	var opts = input.read(_);
	// first line contains configuration options
	opts = JSON.parse(opts);
	if (!opts.condensed) throw new Error("Wrong data format");
	
	options.sourceRoot = opts.sourceRoot || "";
	options.sourceUrl = opts.sourceUrl || "file://{fullpath}#{line}";
	var item;
	var frames = [];
	var frameCnt = 0;
	var aux = []; // Auxiliary array for stack frames: for each frame contain the frame text, the index in aux, the code file name and the line number
	              // this allows for sorting by module name and line number
	var files = [];
	while (item = input.read(_)) {
		switch (item[0]) {
		case 'F':
			item = item.substr(2);
			if (options.exclude && options.exclude.test(item)) files.push("");
			else files.push(fsp.relative(options.sourceRoot, item).replace(/\\/g, '/'));
			break;
		case 'S':
			item = item.substr(2);
			var parts = item.split(";");
			var code = files[parts[0]]
			if (code) { // code is available and has not been excluded
				aux.push([item, frameCnt, code, +parts[1]]);
			} else if (code === undefined) { // code has does not exist: special entry
				aux.push([item, frameCnt, "", 0]);
			}
			frameCnt++;
			break;
		case 'T':
			var index = item.lastIndexOf(";");
			var cnt = item.substr(index+1);
			var key = item.substring(2, index); // must be substring, not substr
			result[key] = (result[key] || 0) + (+cnt);
			break;
		default:
			throw new Error("Wrong entry in data: "+item);
		}
	}
	// stack frames must be renumbered so that they are sorted by module name and line number
	aux = aux.sort(function(a, b) {
		return (a[2].localeCompare(b[2]) || (a[3]-b[3]));		
	})
	// write new sorted array for frames
	var frames = aux.map(function(item) { return item[0];});
	// make index translation table to get new frame index from old frame index
	var trans = [];
	var i = aux.length;
	// fill in zeros at the beginning to enable lexicographical sorting
	var zeros = "";
	var threshold = 1;
	for (var j = (""+i).length-2; j >= 0; j--) threshold *=10;
	while (--i >= 0) {
		if (i < threshold && i > 0) {
			threshold /= 10;
			zeros += "0";
		}
		trans[aux[i][1]] = zeros+i;
	}
	aux = undefined;
	// take new numbering
	var result1 = [];
	var result1inv = [];
	Object.keys(result).forEach(function(key) {
		var parts = key.split(";");
		var suffix = "; "+result[key];
		var i = parts.length;
		var res1 = [];
		while (--i >= 0) {
			var tr = trans[parts[i]];
			if (tr === undefined) {
				return; // stack in total has been excluded
			}
			res1[i] = tr;
		}
		if (!excludeInv) result1inv.push(res1.join(";")+suffix)
		result1.push(res1.reverse().join(";")+suffix)
	})
	var result = {res: result1.sort(), frames: frames, codes: files};
	if (!excludeInv) result.resinv = result1inv.sort();
	return result;
}

/// * cvt = `fgf.converter(_, reader, options)`  
///   Folds recorded data coming from `reader`.  
///   Returns a function which can called as `cvt(_, full)` to obtain the SVG readers.  
///   `fullReader = cvt(_, true)` gives a reader which produces the full graph (with IO slices).  
///   `cpuReader = cvt(_, false)` gives a reader which produces the CPU graph (without IO slices).  
exports.convert = function(_, input, outputs, options) {
	options = options || {};
	var data = exports.fold(_, input, {exclude: options.exclude}, true);
	// full graph
	var opt = {hash: options.hash || 1, codes: data.codes, frames: data.frames, frameformat: "{2} ({0}:{1})", palette: { "io": "rgb(0,255,255)"}, href: options.sourceUrl, target: options.target};
	outputs.invertedFullWriter.write(_, flamegraph_js.makesvg(data.resinv, opt));
	outputs.invertedFullWriter.write(_);
	outputs.fullWriter.write(_, flamegraph_js.makesvg(data.res, opt));
	outputs.fullWriter.write(_);
	// exclude IO
	opt.exclude =/\b0+;/;
	outputs.invertedCpuWriter.write(_, flamegraph_js.makesvg(data.resinv, opt));
	outputs.invertedCpuWriter.write(_);
	outputs.cpuWriter.write(_, flamegraph_js.makesvg(data.res, opt));
	outputs.cpuWriter.write(_);
	return;
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

	var input = options.input ? ez.devices.file.text.reader(options.input) : ez.devices.std.in();

	exports.fold(function(err) {
		if (err) throw err;
	}, input, options);
}