
# Flamegraph recorder for streamline code

`var fg = require('streamline-flamegraph/lib/record')`  

* `recorder = fg.create(options)`  
  Creates a flamegraph recorder.  
  The following options can be set:  
  `rate`: the sampling rate, in milliseconds. 1 by default.  
  `sourceRoot`: the root directory for source files.  
  `output`: the output stream or filename. Used only by `recorder.run()`  

## Recorder methods

If you want to capture a complete process run 
you can just call `recorder.run()` at the beginning of your process:

* `recorder.run()`: runs a recording task in the background.   
  
The following calls allow you to control a recorder:

* `recorder.start()`: starts recording.  
* `recorder.stop()`: stops recording.  
* `recorder.pause()`: pauses recording.  
* `recorder.resume()`: resumes a paused recording.  
* `reader = recorder.reader`: returns the recorder's output as an ez-streams reader.  
  If you don't use `run()`, you must consume (pipe) this reader.    
