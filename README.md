<img width="40px" src="assets/logo.svg"> cuwire: IDE for microcontrollers
====================

This is a [Brackets](http://brackets.io) plugin, which provides an [Arduino](http://arduino.cc)-like
environement for editing, compiling and uploading sketches. Current version supports
Arduino 3rd party hardware spec. The plugin was written by Ivan Baktsheev in 2014.

Brackets is a new generation code editor, based on HTML5 and JS. This plugin will provide same functionality
as Arduino IDE to write code and upload it to the microcontroller. The plugin was written in pure javascript,
and it will probably runs on Windows, Mac OS X, and Linux (untested). A additional libraries like
[serialport](https://github.com/voodootikigod/node-serialport) is used in this plugin,
the codes are belonging to their own authors. Precompiled versions of those libraries is included along with
plugin distribution.

## Requirements
#### 1. [Brackets](http://brackets.io)
Developed and tested under version 1.0

#### 2. [Arduino](http://arduino.cc/en/Main/Software)
You need an Arduino IDE version 1.5 and later

## Installation
Please install using plugin manager

After installation, coil icon ![logo](assets/logo.svg) will appear on sidebar

## Set Arduino Install Location

Arduino default locations for hardware and libraries will be scanned automatically.

* On Mac OS X `/Applications/Arduino.app`

* On Windows `C:\Program Files\Arduino`

* User's `Documents/Arduino` directory

You can add non-standard Arduino IDE location using preferences.

## Features

 * Compilation and Upload
 * Board images
 * Multiple sketches in one project
 *

## TODO

### Serial Monitor
Scan code for a proper baud rate.

### Settings
Setting custom location for IDE

### Examples
Searchable examples

### Libraries
Search and add libraries without IDE reload

### IDE features
Code completion, quick edit, compilation errors highlight in code

### External programmer support

### Bootloader burn

### Additional hardware toolchain installation

## Hardware supported

This project based on [Arduino IDE 3rd party hardware specification](https://github.com/arduino/Arduino/wiki/Arduino-IDE-1.5---3rd-party-Hardware-specification).

Compilation and upload is tested without issues on:

 * Atmel AVR: Arduino Uno, Arduino Mega 2560, Arduino Pro mini clone with USB-UART adapter;
 * Atmel ARM: Arduino Due
 * Nordic ARM: Rfduino ([HOWTO](https://github.com/apla/brackets-cuwire/wiki/platform:-RFDuino))

## Issues
If you meet any problems, you can leave messages at [Issues](https://github.com/apla/brackets-cuwire/issues).

#### Known Issues:

###### 1. Build Process

The build process is almost similar to [Arduino Build Process](http://arduino.cc/en/Hacking/BuildProcess).
A number of things have to happen for your Arduino code to get onto the Arduino board.
First, plugin performs some small transformations to make sure that the code is correct C or C++
(two common programming languages). It then gets passed to a compiler (avr-gcc),
which turns the human readable code into machine readable instructions (or object files).
Then, your code gets combined with (linked against), the standard Arduino libraries
that provide basic functions like digitalWrite() or Serial.print().
The result is a single hex file, which contains the specific bytes that need to be written
to the program memory of the chip on the Arduino board. This file is then uploaded to the board:
transmitted over the USB or serial connection via the bootloader already on the chip
or with external programming hardware.

* Multi-file sketches

A sketch can contain one `.ino` or `.pde` file and multiple files with extensions of `.c`, `.cpp` and `.h`.
Before your sketch is compiled, `.ino` or `.pde` file is transformed to form the "main sketch file".
Files with `.c`, `.cpp` or extensions are compiled separately. To use files with a .h extension,
you need to `#include` it (using "double quotes" not angle brackets).

* Transformations to the main sketch file

Plugin performs a few transformations to your main sketch file before passing it to the compiler.

First, `#include "Arduino.h"` is added just before first program statement. This header file
(found in `<ARDUINO>/hardware/cores/<CORE>/`) includes all the defintions needed for the standard Arduino core.

Next, plugin searches for function definitions within your main sketch file and creates declarations
(prototypes) for them. These are inserted just after `Arduino.h`. This means that if you want to use
a custom type as a function argument, you should declare it within a separate header file.
Also, this generation isn't perfect: it won't create prototypes for functions that have default argument values,
or which are declared within a namespace or class.

[Arduino IDE](http://arduino.cc) and [Stino plugin for SublimeText]() works slightly different.
Arduino IDE append every file without extension to the main sketch file, Stino does the same for
all files with `.ino` or `.pde` extension. This is bad practice, `cuwire` doesn't support that.
If you want to build a modular app, please use `.c*` and `.h` files, this behavior is supported in every IDE.

* Build process

First, plugin reads `boards.txt` and `platform.txt` within `<ARDUINO_APP>/hardware` and `<USER_DOCUMENTS>/Arduino/hardware`
folders to generate recipes for build and upload.

###### 2. Add libraries

Copy the library folder to the `<USER_DOCUMENTS>/Arduino/libraries/` folder.

###### 3. Add new hardware platforms

Copy the core folder to the `<USER_DOCUMENTS>/Arduino/hardware/` folder.

## License
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

## About The Author
[apla.me](http://apla.me)

## Website
GitHub (http://github.com/apla/)

Sublime Text Plugin (https://github.com/Robot-Will/Stino)
