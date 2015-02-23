// This program is based on flamegraph.pl by Brendan Gregg, 2011, with the 
// flamegraph generating algorithm improved and an additional format for
// stack frames implemented.
//
// This takes stack samples and renders a call graph, allowing hot functions
// and codepaths to be quickly identified.  Stack samples can be generated using
// tools such as DTrace, perf, SystemTap, and Instruments.
//
// USAGE: node flamegraph.js [options] input.txt > graph.svg
//
// Options are listed in the usage message (--help).
//
// The input is stack frames and sample counts formatted as single lines.  Each
// frame in the stack is semicolon separated, with a space and count at the end
// of the line.  These can be generated using DTrace with stackfold.pl,
// and other tools using the stackfold variants.
//
// The output graph shows relative presence of functions in stack samples.  The
// ordering on the x-axis has no meaning; since the data is samples, time order
// of events is not known.
//
// When you run it standalone, the script will take as input a file with the JSON content 
// of the output of the "fold" function from "fold._js". When you specify --port=...,
// the program will listen on that port and you can do drill down in the flamegraph
// (unless --href is set) by clicking on an entry. This entry will have an asterisk in 
// the next flamegraph (which shows also the stack frames above so that you can drill up again).
// You can also set --href to set a different link, --inv=1 for having inverse flamegraph
// (each stack frame is inverted), --io=0 for having no stack traces with "io".
// You can use --title to set the title to reflect the content, and --countname
// to change "samples" to "bytes" etc.
// There are a few different palettes, selectable using --color.  Functions
// called "-" will be printed gray, which can be used for stack separators (eg,
// between user and kernel stacks).
// Coloring: --hash=0 means random colouring, --hash=1 means coloring by a hash of function name,
//  --hash=2 means colouring by module name using a djb2 hash function.
//
// HISTORY
//
// This was inspired by Neelakanth Nadgir's excellent function_call_graph.rb
// program, which visualized function entry and return trace events.  As Neel
// wrote: "The output displayed is inspired by Roch's CallStackAnalyzer which
// was in turn inspired by the work on vftrace by Jan Boerhout".  See:
// https://blogs.oracle.com/realneel/entry/visualizing_callstacks_via_dtrace_and
//
// Copyright 2011 Joyent, Inc.  All rights reserved.
// Copyright 2011 Brendan Gregg.  All rights reserved.
//
// CDDL HEADER START
//
// The contents of this file are subject to the terms of the
// Common Development and Distribution License (the "License").
// You may not use this file except in compliance with the License.
//
// You can obtain a copy of the license at docs/cddl1.txt or
// http://opensource.org/licenses/CDDL-1.0.
// See the License for the specific language governing permissions
// and limitations under the License.
//
// When distributing Covered Code, include this CDDL HEADER in each
// file and include the License file at docs/cddl1.txt.
// If applicable, add the following below this CDDL HEADER, with the
// fields enclosed by brackets "[]" replaced with your own identifying
// information: Portions Copyright [yyyy] [name of copyright owner]
//
// CDDL HEADER END
// 11-Feb-2015  Eric Mueller     Converted to JavaScript, improved flamegraph algorithm 
// 21-Nov-2013   Shawn Sterling  Added consistent palette file option
// 17-Mar-2013   Tim Bunce       Added options and more tunables.
// 15-Dec-2011	Dave Pacheco	Support for frames with whitespace.
// 10-Sep-2011	Brendan Gregg	Created this.

exports.makesvg = function(data, options) {
	// Generate flamegraph SVG
	var options = options || {};
	var encoding = options.encoding;
	var fonttype = "Verdana";
	var imagewidth = 1200;          // max width, pixels
	var frameheight = 16;           // max height is dynamic
	var fontsize = 12;              // base text size
	var fontwidth = 0.59;           // avg width relative to fontsize
	var minwidth = 0.1;             // min function width, pixels
	var titletext = options.titletext || "Flame Graph "; // centered heading
	var nametype = "Function:";     // what are the names in the data?
	var countname = options.countname || "samples";      // what are the counts in the data?
	var colors = options.colors || "hot"; // color theme
	var bgcolor1 = "#eeeeee";       // background color gradient start
	var bgcolor2 = "#eeeeb0";       // background color gradient stop
	var timemax = options.timemax;  // (override the) sum of the counts
	var factor = 1;                 // factor to scale counts by
	var hash = options.hash;        // 0: random colors, 1: color by function name, 2: color by module number
	var palette_map = options.palette || {}; // palette map hash
	var frames = options.frames; // entries of stack frames will be translated via this array
	var codes = options.codes; // code files of stack frames will be translated via this array (then the entries of frames must start with the number of the code file
	var frameformat = options.frameformat; // output format for frames. Placeholders {0}, ... will be replaced with corresponding parts of frame (separated by ";"). {0} will be replaced with full code file name if options.codes is present
	if (frameformat && (!codes || !frames)) throw new Error("No frameformat without codes and frames");
	if (hash === 2 && (!frames || !codes)) hash = 1;

	// internals
	var ypad1 = fontsize * 4;      // pad top, include title
	var ypad2 = fontsize * 2 + 20; // pad bottom, include labels
	var xpad = 10;                  // pad left and right
	var depthmax = 0; // this will contain the number of levels
	var g_nameattr = {};




	function Svg() {
		this.svg = '';
	}

	var _svgProto = Svg.prototype;

	_svgProto.header = function (w, h) {
		var enc_attr = encoding ? ' encoding="'+encoding+'"' : '';
		this.svg += '<?xml version="1.0"'+enc_attr+' standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'+
		'<svg version="1.1" width="'+w+'" height="'+h+'" onload="init(evt)" viewBox="0 0 '+w+' '+h+'" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n';
	}

	_svgProto.include = function(content) {
		this.svg += content;
	}


	_svgProto.group_start = function(attr) {
		var g_attr = [];
		["class", "style", "onmouseover", "onmouseout"].forEach(function(item) {
			if (attr[item]) g_attr.push(item+'="'+attr[item]+'"');		
		})
		if (attr.g_extra) g_attr.push(attr.g_extra);
		this.svg += '<g '+g_attr.join(" ")+'>\n';
		if (attr.title) this.svg += '<title>'+attr.title+'</title>'; // should be first element within g container
		
		if (attr.href) {
			var a_attr = [];
			a_attr.push('xlink:href="'+attr.href+'"');
		    // default target=_top else links will open within SVG <object>
			a_attr.push('target="'+(attr.target || "_top")+'"');
			if (attr.a_extra) a_attr.push(attr.a_extra);
			this.svg += '<a '+a_attr.join(" ")+'>';		
		}
	}

	_svgProto.group_end = function(attr) {
		if (attr.href) this.svg += '</a>\n';
		this.svg += '</g>\n';
	}

	_svgProto.filledRectangle = function(x1, y1, x2, y2, fill, extra) {
		x1 = x1.toFixed(1);
		x2 = x2.toFixed(1);
		var w = +x2-x1;
		var h = +y2-y1;
		w = w.toFixed(1);
		h = h.toFixed(1);
		extra = extra || "";
		this.svg += '<rect x="'+x1+'" y="'+y1+'" width="'+w+'" height="'+h+'" fill="'+fill+'" '+extra+' />\n';
	}

	_svgProto.stringTTF = function(color, font, size, angle, x, y, str, loc, extra) {
		loc = (loc === undefined ? "left" : loc);
		extra = (extra === undefined ? "" : extra);
		this.svg += '<text text-anchor="'+loc+'" x="'+x+'" y="'+y+'" font-size="'+size+'" font-family="'+font+'" fill="'+color+'" '+extra+' >'+str+'</text>\n';
	}
		
	_svgProto.getsvg = function() {
		return this.svg+'</svg>\n';
	}

	// djb2 algorithm for hashing of Dan Bernstein, see http://www.cse.yorku.ca/~oz/hash.html.
	function djb2(name) {
		var hash = 5381;
		for (var i = 0; i<name.length; i++) {
			hash = ((hash << 5) + hash)+name.charCodeAt(i);
		}
		return hash;
	}
	
	function namehash(name) {
		// Generate a vector hash for the name string, weighting early over
		// later characters. We want to pick the same colors for function
		// names across different flame graphs.
		name = name || "";
		var vector = 0;
		var weight = 1;
		var max = 1;
		var mod = 10;
		// if module name present, trunk to 1st char
		name = name.replace(/.(.*?)`/, "");
		for (var j = 0; j < name.length; j++) {
			var i = name.charCodeAt(j) % mod;
			vector += (i/(mod++ - 1))*weight;
			max += 1*weight;
			weight *= 0.7;
			if (mod > 12) break;
		}
		return (1-vector/max);	
	}

	function colorAllocate(r,g,b) {
		return "rgb("+r+","+g+","+b+")";
	}

	
	function htmlEscape(text) {
		return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	function color(type, hash, name, code) {
		var v1;
		var v2;
		var v3;
		if (hash) {
			if (hash === 2) {
				var h = Math.abs(djb2(code));
				v1 = (h % 257) / 257.0;
				v2 = (h % 101) / 101.0;
				v3 = (h % 61) / 61.0;
			} else {
				name = name || "";
				v1 = namehash(name);
				v2 = v3 = namehash(name.split("").reverse().join(""));				
			}
		} else {
			v1 = Math.random();
			v2 = Math.random();
			v3 = Math.random();
		};
		var r = 0;
		var g = 0;
		var b = 0;
		if (type === "hot") {
			r = 205+Math.floor(50*v3);
			g = 0+Math.floor(230*v1);
			b = 0+Math.floor(55*v2);
		}
		if (type === "mem") {
			r = 0;
			g = 190+Math.floor(50*v2);
			b = 0+Math.floor(210*v1);
		}
		if (type === "io") {
			r = 80+Math.floor(60*v2);
			g = r;
			b = 190+Math.floor(55*v1);
		}
		return colorAllocate(r, g, b);
	}

	function color_map(colors, hash, func, code) {
		if (func in palette_map) return palette_map[func];
		else {
			palette_map[func] = color(colors, hash, func, code);
			return palette_map[func];
		}
	}


	var tmpTime = []; // beginning time of entry (stored here until entry has been finished) 
	var tmpFrame = []; // stack frame of entry
	var maxTime = []; // max time of entry of that level
	var contents = []; // array of arrays: interior arrays have content of rectangle, start time and duration as entries

	var level = 0; // number of tmpTime and tmpFrame entries which store relevant information
	var timeCount = 0;

	var marklevel = options.marklevel; // level at which last restriction was called
	
	var include = options.include;
	var exclude = options.exclude;
	var total = 0;

	function addEntry(level) {
		var diff = (timeCount-tmpTime[level]); // compute total time of that rectangle
		contents[level].push([tmpFrame[level], timeCount, diff, tmpFrame.slice(0, level+1).join(";")])
		if (diff > maxTime[level]) maxTime[level] = diff; // maximal time for any rectangle of that level;
	}


	data.forEach(function(item) {
		if (include && !include.test(item) || exclude && exclude.test(item)) return;
		var parts = item.split(";");
		var size = parts.length-1;
		// find out what has changed
		var bound1 = Math.min(size, level);
		var equalCnt = 0; // number of elements which are equal to previous sample
		while (equalCnt < bound1 && parts[equalCnt] == tmpFrame[equalCnt]) { equalCnt++ };
		while (level > equalCnt) {		
			level--;		
			// add a new entry for that level using the data from tmpFrame and tmpTime
			addEntry(level);
		}
		// add new parts
		while (level < size) {
			tmpFrame[level] = +parts[level];
			tmpTime[level++] = timeCount;
		}
		timeCount += +parts[size];
		// contents of that level must be pre-filled with array
		while (depthmax <= size) {
			contents.push([]);
			maxTime[depthmax++] = 0;
		}
		if (item) total += +item.substr(item.lastIndexOf(";")+1);
	})
	// close all entries
	while (--level >= 0) {
		addEntry(level);
	}
	// compute minimum time for entry
	if (timemax && timemax < total) {
		if (timemax/total > 0.02) console.error("Specified timemax is less than actual total time, so ignored");
		timemax = total;
	}
	timemax = timemax || total;

	var widthpertime = (imagewidth-2*xpad) /timemax; 
	var minimumTime = minwidth/widthpertime;
	// determine image height
	while (maxTime[depthmax-1] < minimumTime) { // do not draw items which are too narrow: when maxTime of a level is too small, then no entry of that level need to be painted
		depthmax--;
		contents[depthmax] = undefined; // help for garbage collection	
	}

	//draw canvas
	var imageheight = depthmax*frameheight+ypad1+ypad2;
	var im = new Svg();
	im.header(imagewidth, imageheight);
	im.include('<defs >\n'+
	'	<linearGradient id="background" y1="0" y2="1" x1="0" x2="0" >\n'+
	'		<stop stop-color="'+bgcolor1+'" offset="5%" />\n'+
	'		<stop stop-color="'+bgcolor2+'" offset="95%" />\n'+
	'	</linearGradient>\n'+
	'</defs>\n'+
	'<style type="text/css">\n'+
	'	.func_g:hover { stroke:black; stroke-width:0.5; }\n'+
	'</style>\n'+
	'<script type="text/ecmascript">\n'+
	'<![CDATA[\n'+
	'	var details;\n'+
	'	function init(evt) { details = document.getElementById("details").firstChild; }\n'+
	'	function s(info) { details.nodeValue = "'+nametype+' " + info; }\n'+
	'	function c() { details.nodeValue = \' \'; }\n'+
	']]>\n'+
	'</script>\n');

	im.filledRectangle(0, 0, imagewidth, imageheight, 'url(#background)');
	var white = colorAllocate(255, 255, 255);
	var black = colorAllocate(0, 0, 0);
	var vvdgrey = colorAllocate(40, 40, 40);
	var vdgrey = colorAllocate(160, 160, 160);
	im.stringTTF(black, fonttype, fontsize+5, 0.0, Math.floor(imagewidth/2), fontsize*2, titletext, "middle");
	im.stringTTF(black, fonttype, fontsize, 0.0, xpad, imageheight-(ypad2/2), " ", "", 'id="details"');
	var depth = -1; 
	function drawItem(item) {
			var diff = item[2];
			if (diff < minimumTime) return; // do not draw items which are too narrow
			var func = item[0];
			var x2 = xpad+widthpertime*item[1];
			var x1 = x2-diff*widthpertime;
			var samples = Math.round(diff*factor);
			var info;
			var text = func || "";
			var text_escaped;
			var parts;
			var code = "";
			if (func !== undefined) {
				if (frameformat) {
					var tmp = frames[+func];
					if (tmp) {
						parts = tmp.split(";");
						code = codes[parts[0]];
						if (code) {
							parts[0] = code;
							text = frameformat.replace(/\{(\d)\}/g, function(m, p1) { return (parts[p1] || ""); });
						} else {
							text = tmp;
						}
					}
				}
				text_escaped = htmlEscape(text);				
			} else {
				text_escaped = "";
			}
			if (func === undefined) {
				info = "all ("+samples+" "+countname+", 100%)";
			} else {
				var pct = ((100*samples)/(total*factor)).toFixed(2);
				info = text_escaped+" ("+samples+" "+countname+", "+pct+"%)";			
			}
			var nameattr = {};
			var tmpAttr = g_nameattr[func];
			if (tmpAttr) { // when there are name attributes for this function, shallow clone them
				for (var t in tmpAttr) {
					nameattr[t] = tmpAttr[t];
				};		
			}
			nameattr.class = nameattr.class || "func_g";
			nameattr.onmouseover = nameattr.onmouseover || "s('"+info+"')";
			nameattr.onmouseout = nameattr.onmouseout || "c()";
			nameattr.title = nameattr.title || info;
			if (options.href) {
				if (options.href === "drill") { // special mode: drill
					nameattr.href = item[3] ? "/"+depth+"?inc=S"+item[3] : "/";					
				} else if (parts) {
					nameattr.href = options.href.replace(/\{(\d)\}/g, function(m, p1) { return (parts[p1] || ""); });
					nameattr.target = options.target;
				}
			}			
			im.group_start(nameattr);
			
			if (palette_map) {
				im.filledRectangle(x1, y1, x2, y2, color_map(colors, hash, text, code), 'rx="2" ry="2"');
			} else {
				var color0 = (func === "-" ? vdgrey : color(colors, hash, text, code));
				im.filledRectangle(x1, y1, x2, y2, color0, 'rx="2" ry="2"');
			}
			if (depth === marklevel) {
				text = "* "+text;
				text_escaped = htmlEscape(text);
			}
			var chars = Math.floor((x2-x1)/(fontsize*fontwidth));
			if (chars >= 3) { // room for one char plus two dots
				if (chars < text.length) {
					text = text.substr(0, chars-2)+"..";
					text_escaped = htmlEscape(text);
				}
				im.stringTTF(black, fonttype, fontsize, 0.0, x1 + 3, 3 + (y1 + y2) / 2, text_escaped, "");
			}
			im.group_end(nameattr);
	}


	// draw frames. -1 is a pseudo level for "all"
	for (; depth < depthmax; depth++) {
		// y1, y2 the same for all frames in that level
		var y2 = imageheight-ypad2-(depth+1)*frameheight;
		var y1 = y2-frameheight+1;
		if (depth < 0) drawItem([undefined, total, total]);
		else contents[depth].forEach(drawItem)
	}
	return im.getsvg();
	
}

if (require.main === module) {
	var fs = require('fs');
	var palette = { "io": "rgb(0,255,255)"};
	var port;
	var io = true;
	var inv = false;
	var data;
	var filename;
	var hash = 2;
	var href;
	var title;
	var countname;
	var color;

	process.argv.slice(2).forEach(function(item) {
		var r = /^--(\w+)=(\S+)/.exec(item);
		if (r) {
			switch (r[1]) {
			case 'inv':
				if (r[2] !== "false" && r[2] !== "0") inv = true;
				break;
			case 'io':
				if (r[2] === "false" || r[2] === "0") io = false;
				break;
			case 'port':
				port = r[2];
				break;
			case 'hash':
				hash = r[2];
				break;
			case 'href':
				href = r[2];
				break;
			case 'title':
				title = r[2];
				break;
			case 'countname':
				countname = r[2];
				break;
			case 'color':
				color = r[2];
				break;
			default: throw new Error("Wrong option "+r[1] );
			}
		} else {
			if (filename) throw new Error("Data already read");		
			filename = item;
		}
	})

	if (!filename) { console.error("No data"); process.exit(1);}
	var samples = load(filename);
	var titletext;

	function load(filename) {
		data = JSON.parse(fs.readFileSync(filename, "utf8"));
		// transformations
		var samples0 = data.res;
		if (!io || inv) {
			var samples0 = [];
			data.res.forEach(function(item) {
				if (!io && /\b0+;/.test(item)) {
					return;
				}
				if (inv) {
					var parts = item.split(";");
					var maxindex = parts.length-1;
					var cnt = parts[maxindex];
					parts = parts.slice(0, maxindex).reverse();
					parts.push(cnt);
					samples0.push(parts.join(";"));	
				} else {
					samples0.push(item);
				};
			});
			if (inv) samples0 = samples0.sort();
		}
		titletext = title || "Flame Graph "+new Date();  
		return samples0;
	}

	if (port) {
		var http = require('http');
		http.createServer(function (req, res) {
		  res.writeHead(200, {'Content-Type': 'image/svg+xml'});
		  var include = undefined;
		  var exclude = undefined;
		  var marklevel = -1000;
		  if (req.url.substr(0,7) === "/reload") {
			  var opts = /inv=(\w+)/.exec(req.url);
			  if (opts) {
				  inv = (opts[1] === "1" || opts[1] === "true");
			  }
			  var opts = /io=(\w+)/.exec(req.url);
			  if (opts) {
				  io = (opts[1] === "1" || opts[1] === "true");
			  }
			  samples = load(filename);		  
		  } else {
			  var restr = /(\d+)\?inc\=(.*)/.exec(req.url);
			  if (restr) {
				  var include = restr[2].replace("S", "^0*").replace(/;/g, ";0*");
				  include = new RegExp(include+";");
				  marklevel = +restr[1];
			  }		  
		  }
		  res.end(exports.makesvg(samples, {palette: palette, frames: data.frames, frameformat: "{2}({0}:{1})", codes: data.codes,hash: hash, href: href || "drill", include: include, exclude: exclude, marklevel: marklevel, titletext: titletext, countname: countname, colors:color}));
		}).listen(+port, '127.0.0.1');
		console.log('Server running at http://127.0.0.1:'+port);
	} else {
		console.log(exports.makesvg(samples, {palette: palette, frames: data.frames, frameformat: "{2}({0}:{1})", codes: data.codes,hash: hash,
			href: href,
			target: "_blank",
			titletext: title,
			countname: countname,
			colors: color
		}));		
	}
}