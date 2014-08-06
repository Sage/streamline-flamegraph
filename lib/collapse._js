/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */
"use strict";

var ez = require('ez-streams');

exports.collapse = function(_, options) {
	options = options || {};
	var output = (options.output && options.output !== '-') ? ez.devices.file.text.writer(options.output) : ez.devices.std.out('utf8');
	var input = (options.input && options.input !== '-') ? ez.devices.file.text.reader(options.input) : ez.devices.std. in ('utf8');
	var results = input.transform(ez.transforms.lines.parser()) //
	.reduce(_, function(_, result, line) {
		if (line[0] === '#' || line.length === 0) return result;
		var cut = line.lastIndexOf(' ');
		var key = line.substring(0, cut);
		result[key] = (result[key] || 0) + parseInt(line.substring(cut + 1), 10);
		return result;
	}, {});
	ez.devices.array.reader(Object.keys(results).sort()) //
	.map(function(_, key) {
		return key + ' ' + results[key] + '\n';
	}) //
	.pipe(_, output);
}

if (require.main === module) exports.collapse(function(err) {
	if (err) throw err;
}, {
	input: process.argv[2] || '-'
});