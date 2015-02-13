
# Flamegraph utility to fold recordings

`var fgf = require('streamline-flamegraph/lib/fold')`  

## API

* folded = `fgf.fold(_, input, options)`
 reads recorded stack trace information, condenses equal stack traces and sorts the stack traces by file name and code line
 The file names will be normalised as relative names with respect to the source root directory and will have slashes, no backslashes
 as path separators

input: the input stream (a text stream)
options: exclude: pattern for excluding file names (when file name is tested, it is not yet normalized)
         excludeInv: do not generate inverse stack frames
* cvt = `fgf.converter(_, reader, options)`  
  Folds recorded data coming from `reader`.  
  Returns a function which can called as `cvt(_, full)` to obtain the SVG readers.  
  `fullReader = cvt(_, true)` gives a reader which produces the full graph (with IO slices).  
  `cpuReader = cvt(_, false)` gives a reader which produces the CPU graph (without IO slices).  

## Command line usage

This module may also be invoked from the command line. For usage, type:

```sh
_node --cache streamline-flamegraph/lib/fold -h
```
