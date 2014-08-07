"use strict";

require('../lib/record').create().start();
// Extra closure is needed in fibers mode, to ensure that recording is initialized before creating
// wrappers for the hoisted functions.
// Normally this is not a problem because recorder should be created from a separate loader file. 
(function(_) {
	function busyWait(_, ms) {
		var t0 = Date.now();
		while (Date.now() - t0 < ms);
	}

	function idleWait(_, ms) {
		setTimeout(_, ms);
	}

	function f3(_) {
		busyWait(_, 20);
		idleWait(_, 30);
	}

	function f2(_) {
		f3(_);
	}

	function f1(_) {
		busyWait(_, 100);
		f2(_);
		f2(_);
		f3(_);
		idleWait(_, 500);
	}

	//for (var i = 0; i < 100; i++)
	f1(_);
	//f2(_);
})(function(err) {
	if (err) throw err;
});