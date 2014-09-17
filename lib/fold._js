/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

var ez = require('ez-streams');
var fsp = require("path");

function locationUrl(file, line, options) {
	var values = {
		fullpath: fsp.resolve(options.sourceRoot, file),
		relpath: file,
		line: line,
	};
	return options.sourceUrl.replace(/\{([^\}]*)\}/g, function(all, key) {
		return values[key];
	});
}

exports.fold = function(_, options) {
	options = options || {};
	var output = options.output ? ez.devices.file.text.writer(options.output) : ez.devices.std.out('utf8');
	var input = options.input ? ez.devices.file.binary.reader(options.input) : ez.devices.std.in();
	var nameattr = options.nameattr && ez.devices.file.text.writer(options.nameattr);
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
		result[key] = (result[key] || 0) + parseInt(line.substring(cut + 1), 10);
		key.split(';').forEach(function(loc) {
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

if (require.main === module) {
	var options = require('commander');

	options.version(require('../package.json').version)//
	.option('-i, --input [input]', 'input file')//
	.option('-o, --output [output]', 'output file')//
	.option('-n, --nameattr [nameattr]', 'name attributes file')//
	.option('-s, --source-root [sourceRoot]', 'source root')//
	.parse(process.argv);

	exports.fold(function(err) {
		if (err) throw err;
	}, options);
}