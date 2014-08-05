"use strict";
/* Copyright (c) 2014 Bruno Jouhier <bruno.jouhier@sage.com> - MIT License */

var ez = require('ez-streams');

exports.collapse = function(_, options) {
	options = options || {};
	options.source = options.source || process.cwd() + '/perf-recorded.data';
	options.dest = options.dest || process.cwd() + '/perf-collapsed.data';
	var results = ez.devices.file.text.reader(options.source).transform(ez.transforms.lines.parser()).reduce(_, function(_, result, line) {
		if (line[0] === '#' || line.length === 0) return result;
		var cut = line.lastIndexOf(' ');
		var key = line.substring(0, cut);
		result[key] = (result[key] || 0) + parseInt(line.substring(cut + 1), 10);
		return result;
	}, {});
	ez.devices.array.reader(Object.keys(results).sort()).map(function(_, key) {
		return key + ' ' + results[key] + '\n';
	}).pipe(_, ez.devices.std.out('utf8'));
}

if (require.main === module) exports.collapse(function(err) {
	if (err) throw err;
}, {
	source: process.argv[2]
});