---
layout: page
title: About
permalink: /about/
---

In late 2014 I tried to find a solution for a 3 tasks:

1. Compile sketch for ARM using command line;
1. Upload firmware binary to Arduino Due (ARM) using gui or cli;
1. Make RFduino works in any IDE, excluding lame Arduino IDE.

And found nothing!

## Command line

Arduino IDE provide cli interface, but only a few commands.

Exising solutions like [ino](http://inotool.org), [leo](https://github.com/AdamMagaluk/leo), [platformio](http://platformio.org) in barely working state.
And, if you use command line tool, you can get different results when compile code in GUI.

Many of this tools introduce new build systems instead of supporting existing ones.
Third party hardware specification not supported.

## GUI

GUI IDE is totally different thing. When you writing big project, you'll need to build arduino code
along with site pages or backend, mobile applications. Not so many IDE allows to do this in usable matter.

Currently I'm using Brackets because all my projects have Javascript/HTML/CSS involved,
such as node.js backend, pages frontend code and layout and it is useful to hack IDE on your needs.
Brackets is a modern IDE, have many good features, like QuickEdit. Adding Arduino support for Brackets is
natural extension of my workflow.

I've tried [embedXcode](http://embedxcode.weebly.com/), [Stino for Sublime Text](https://github.com/Robot-Will/Stino), [Eclipse Arduino plugin](http://www.baeyens.it/eclipse/),
but not satisfied. In most cases Arduino sketch compilation supported, but
if you have multiple projects/architectures, changing board is painful.
Python and Java not improve hackability at all.
