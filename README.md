Brackets plugin for Arduino
====================

This is a [Brackets](http://brackets.io) plugin, which provides an [Arduino](http://arduino.cc)-like environement for editing, compiling and uploading sketches. The plugin was written by Ivan Baktsheev in 2014.

Brackets is a new generation code editor, based on HTML5 and JS. This plugin will provide same functionality as Arduino IDE to write code and upload it to the I/O board. The plugin was written in pure javascript, and it will probably runs on Windows, Mac OS X, and Linux (untested). A additional libraries, [serialport](https://github.com/voodootikigod/node-serialport) is used in this plugin, the codes are belonging to their own authors.

## Requirements
#### 1. [Brackets](http://brackets.io)
Developed under version 0.43

#### 2. [Arduino](http://arduino.cc/en/Main/Software)
You need an Arduino IDE version 1.5 and later

## Installation
Please install using plugin manager

// TODO: icon

After installation, infinity icon will appear on sidebar

## Set Arduino Install Location

Arduino default locations will be scanned automatically.

* On Mac OS X `/Applications/Arduino.app`

* On Windows `C:\Program Files\Arduino`

* User's `Documents` directory

Setting additional locations using preference pane will be added in future.

## Compilation and Upload
Not yet supported

## Serial Monitor
Not yet supported. Your code is automatically scanned for a proper baud rate.

##Settings
Coming soon!


## Issues
If you meet any problems, you can leave messages at [Issues](https://github.com/apla//issues).

#### Known Issues:

###### 1. Build Process

The build process is similar to [Arduino Build Process](http://arduino.cc/en/Hacking/BuildProcess). A number of things have to happen for your Arduino code to get onto the Arduino board. First, plugin performs some small transformations to make sure that the code is correct C or C++ (two common programming languages). It then gets passed to a compiler (avr-gcc), which turns the human readable code into machine readable instructions (or object files). Then, your code gets combined with (linked against), the standard Arduino libraries that provide basic functions like digitalWrite() or Serial.print(). The result is a single Intel hex file, which contains the specific bytes that need to be written to the program memory of the chip on the Arduino board. This file is then uploaded to the board: transmitted over the USB or serial connection via the bootloader already on the chip or with external programming hardware.

* Multi-file sketches

A sketch can contain multiple files with extensions of `.ino`, `.pde`, `.c`, `.cc`, `.cpp`, `.cxx` and `.h`. When your sketch is compiled, all files with extensions of are `.ino` and `.pde` concatenated together to form the "main sketch file". Files with `.c`, `.cc`, `.cpp` or `.cxx` extensions are compiled separately. To use files with a .h extension, you need to `#include` it (using "double quotes" not angle brackets).

* Transformations to the main sketch file

Plugin performs a few transformations to your main sketch file (the concatenation of all the files in the sketch with extensions of `.ino` and `.pde`) before passing it to the compiler.

First, `#include "Arduino.h"`, or for versions less than 1.0, `#include "WProgram.h"` is added to the top of your sketch. This header file (found in `<ARDUINO>/hardware/cores/<CORE>/`) includes all the defintions needed for the standard Arduino core.

Next, plugin searches for function definitions within your main sketch file and creates declarations (prototypes) for them. These are inserted after any comments or pre-processor statements (#includes or #defines), but before any other statements (including type declarations). This means that if you want to use a custom type as a function argument, you should declare it within a separate header file. Also, this generation isn't perfect: it won't create prototypes for functions that have default argument values, or which are declared within a namespace or class.

* Build process

First, plugin reads `<ARDUINO>/hardware/cores/boards.txt` and `<ARDUINO>/hardware/cores/programmers.txt` to generate all parameters according settings.

Next, plugin searches the file `<ARDUINO>/hardware/cores/platform.txt`, which defines the compilation commands. If this file does not exist, plugin will use the file in `compilation` folder. After reading compilation commands, plugin starts compilation.

###### 2. Add Libraries

Copy the library folder to the `<SKETCHBOOK>/libraries/` folder.

###### 3. Add Cores

Copy the core folder to the `<SKETCHBOOK>/hardware/` folder.

## License
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## About The Author
[apla.me](http://apla.me)

## Website
GitHub (http://github.com/apla/)

Sublime Text Plugin (https://github.com/Robot-Will/Stino)
