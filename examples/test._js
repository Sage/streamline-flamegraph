"use strict";

require('../lib/record').create().start();
// Extra closure is needed in fibers mode, to ensure that recording is initialized before creating
// wrappers for the hoisted functions.
// Normally this is not a problem because recorder should be created from a separate loader file. 
function test(_) {
	function busyWait(_, ms) {
		var t0 = Date.now();
		while (Date.now() - t0 < ms);

		// Strange: if we don't flush with a dummy timeout after busyWait we get incorrect wait times (too long)
		// in the following setTimeout call.
		// see https://github.com/joyent/node/issues/8105#issuecomment-51568352
		var t1 = Date.now();
		setTimeout(function() {
			var delta = Date.now() - t1;
			if (delta) console.log("!! BUSY CATCHUP: " + delta);
		}, 0);
	}

	function invisibleWait(ms) {
		var t0 = Date.now();
		while (Date.now() - t0 < ms);
	}

	function idleWait(_, ms) {
		setTimeout(_, ms);
	}

	function f3(_) {
		busyWait(_, 20);
		invisibleWait(10);
		idleWait(_, 30);
	}

	function f2(_) {
		f3(_);
	}

	function f1(_) {
		busyWait(_, 100);
		f2(_);
		invisibleWait(50);
		f2(_);
		f3(_);
		idleWait(_, 500);
	}

	var funnel = require('streamline/lib/util/flows').funnel(1);

	function g1(_) {
		return funnel(_, f1);
	}

	//f1(_);
	g1(_);
	// Graceful end for flame recorder. We can also simply call the stop() function of the flame recorder.
	process.emit("SIGINT");
}

// Handle SIGINT for windows
if (process.platform === "win32") {
	require("readline").createInterface({
		input: process.stdin,
		output: process.stdout
	}).on("SIGINT", function() {
		process.emit("SIGINT");
	});
}

process.on('SIGINT', function() {
	setTimeout(process.exit, 100);
});

setImmediate(function() {
	test(function(err) {
		if (err) throw err;
	});
});