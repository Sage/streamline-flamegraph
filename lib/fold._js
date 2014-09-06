/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

var ez = require('ez-streams');

exports.fold = function(_, options) {
	options = options || {};
	var output = options.output ? ez.devices.file.text.writer(options.output) : ez.devices.std.out('utf8');
	var input = options.input ? ez.devices.file.binary.reader(options.input) : ez.devices.std.in();
	var nameattr = options.nameattr && ez.devices.file.text.writer(options.nameattr);
	input = input.nodeTransform(require('zlib').createGunzip()).map(ez.mappers.convert.stringify());
	var locations = {};
	var results = input.transform(ez.transforms.lines.parser()) //
	.reduce(_, function(_, result, line) {
		if (line[0] === '#' || line.length === 0) return result;
		var cut = line.lastIndexOf(' ');
		var key = line.substring(0, cut);
		result[key] = (result[key] || 0) + parseInt(line.substring(cut + 1), 10);
		key.split(';').forEach(function(loc) {
			var m = / \((.*)\)$/.exec(loc);
			if (!m) return;
				locations[loc] = m[1];
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
		var m = /^(.*):(\d+)$/.exec(loc);
		var file = (m && m[1]) || loc;
		var line = (m && m[2]) || 0;
		return [key, 'href=file://' + file + '#L' + line, 'target=_blank'].join('\t') + '\n';
	}) //
	.pipe(_, nameattr);
}

if (require.main === module) {
	var options = require('commander');

	options.version(require('../package.json').version)//
	.option('-i, --input [input]', 'input file')//
	.option('-o, --output [output]', 'output file')//
	.option('-n, --nameattr [nameattr]', 'name attributes file')//
	.parse(process.argv)

	exports.fold(function(err) {
		if (err) throw err;
	}, options);
}