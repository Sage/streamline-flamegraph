
# Flamegraph utility to fold recordings

`var fgf = require('streamline-flamegraph/lib/fold')`  

## API

* `fgf.fold(_, options)`  
  Folds recorded data. The options are the following:  
  `input`: the recorded data, as a reader or a filename.  
  `output`: the output for the folded data, as a writer or a filename.  
  `nameattr`: optional file name where `fold` will write the function name map.    
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
