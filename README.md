# cuwire
cli tool for microcontroller firmware
====================

cuwire is a command line toolkit for working with microcontroller firmware.

Currently cuwire supports Arduino AVR/SAM and other hardware, compatible with
Arduino 3rd party hardware specification.

It allows you to:

 * Build a firmware from source
 * Upload the firmware to a device
 * Perform serial communication with a device (aka serial monitor)
 * Sister project, brackets-cuwire, is intended to give you a complete replacement for Arduino IDE.

## Features

 * Simple. No build scripts are necessary.
 * Out-of-source builds. Directories with source files are not cluttered with intermediate object files.
 * Support for `.ino` and `.pde` sketches as well as raw `.c` and `.cpp`.
 * Support for Arduino Software version 1.5.
 * Automatic dependency tracking. Referred libraries are automatically included in the build process. Changes in `.h` files lead to recompilation of sources which include them.
 * Pretty colorful output.
 * Support for all boards that are supported by Arduino IDE.
 * (WIP) Fast. Discovered tool paths and other stuff is cached across runs. If nothing has changed, nothing is build.
 * Flexible. Support for config file to setup machine-specific info like used Arduino model, Arduino distribution path, etc just once.

## Installation

Please install using npm

`npm install -g cuwire`

## Usage

``` sh
cuwire compile -b <board name>
cuwire upload -b <board name> -p
cuwire ports
cuwire boards
cuwire console
cuwire --help
```

## Similar tools

 * [inotool](https://github.com/amperka/ino)
 * [leo](https://github.com/AdamMagaluk/leo)

## Hardware supported

This project based on [Arduino IDE 3rd party hardware specification](https://github.com/arduino/Arduino/wiki/Arduino-IDE-1.5---3rd-party-Hardware-specification).

Compilation and upload is tested without issues on:

 * Atmel AVR: Arduino Uno, Arduino Mega 2560, Arduino Pro mini clone with USB-UART adapter;
 * Atmel ARM: Arduino Due
 * Nordic ARM: Rfduino ([HOWTO](https://github.com/apla/cuwire/wiki/PlatformsRFduino))

more platform information on a [wiki page](https://github.com/apla/cuwire/wiki/PlatformsRFduino)

## Issues
If you meet any problems, you can leave messages at [Issues](https://github.com/apla/cuwire/issues).

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

