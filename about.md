---

layout: page
title: About
permalink: /about/

---

In late 2014 I tried to find a solution for 3 tasks:

1. Compile sketch for ARM using command line;
1. Upload firmware binary to Arduino Due (ARM) using gui or cli;
1. Make RFduino work in any IDE, excluding lame Arduino IDE.

And found nothing!

## Command line

Arduino IDE provides cli interface, but only few commands.

Existing solutions like [ino](http://inotool.org), [leo](https://github.com/AdamMagaluk/leo), [platformio](http://platformio.org) are in barely working state.
And, if you use command line tool, you can get results different to those when compiling code in GUI.

Many of these tools introduce new build systems instead of supporting existing ones.
Third party hardware specification is not supported.

## GUI

GUI IDE is totally different thing. When you are writing a big project, you'll need to build arduino code
along with site pages or backend, mobile applications. Not so many IDEs allow doing this in usable manner.

Currently I use Brackets because all my projects have Javascript/HTML/CSS involved,
such as node.js backend, pages frontend code and layout, and it is useful to hack IDE for your needs.
Brackets is a modern IDE, has many good features, like QuickEdit. Adding Arduino support for Brackets is a natural extension of my workflow.

I've tried [embedXcode](http://embedxcode.weebly.com/), [Stino for Sublime Text](https://github.com/Robot-Will/Stino), [Eclipse Arduino plugin](http://www.baeyens.it/eclipse/),
but wasn’t satisfied. In most cases Arduino sketch compilation is supported, but
if you have multiple projects/architectures, changing boards is painful.

## cuwire

So, I decided to start my own project. **cuwire** is an opensource attempt to build better microconroller IDE.
On the current milestone, only Arduino sketches are supported. When project matures other build systems will be added.
As for now, many hardware platforms are added and tested, test suite has proved reliability by example sketch
compilation.

What's next:

 * IDE code completion;
 * Board images with pin functions;
 * Library management;
 * Platform management;
 * Debugger support.
