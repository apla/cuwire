---
layout: page
title: Getting started
permalink: /install/
---

## Environment

cuwire installation requires [Arduino IDE 1.5.8](http://arduino.cc/en/Main/Software) or later installed.

## Install how to

cuwire can be installed for command line usage and as plugin for Brackets IDE.

### Command line usage

Please install [nodejs](http://nodejs.org) if you don't have it installed already.
Then, open terminal app and launch

``` sh
npm install -g cuwire
```

Basic commands is `compile`, `upload`, `ports`, `boards`

For example, to compile and upload your sketch to plugged in Arduino Uno,
go to sketch folder and run:

``` sh
cuwire upload -b uno
```

You can see detailed guide and more examples at [Cli guide]({{ site.baseurl }}/cli/Usage)
section of documentation

### Plugin for Brackets IDE

Please install [Brackets](http://brackets.io) if you don't have it installed already.

![install plugin]({{ site.baseurl }}/images/brackets-plugin-install.png)

After installation, you'll see round orange icon on brackets sidebar.
Click on this icon and you will get an access to cuwire panel.

![cuwire panel]({{ site.baseurl }}/images/brackets-plugin-panel.png)

Using this panel you can select target board to compile sketch and
target port to upload firmware. Gear icon allow you to set custom location
for Arduino IDE and some other params.

You can see detailed guide at [GUI guide]({{ site.baseurl }}/gui/Usage)
section of documentation
