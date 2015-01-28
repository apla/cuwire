# cuwire
cli tool for microcontroller firmware


## user settings

where does cuwire keep settings data?

cuwire stores settings in a user-specific directory called the user data directory. The name and location of this directory varies depending on the operating system:

 * Windows Vista, Windows 7, Windows 8 or newer `<user home folder>\AppData\Local\cuwire.json`
 * Linux `<user home folder>/.cuwire.json`
 * Mac OS X `<user home folder>/Library/Application Support/cuwire.json`

supported preferences (please take a look to my own [prefs file](https://gist.github.com/apla/6fe7410fd5de58a8ee71)):

 * arduino: non-standard Arduino IDE location
 * sketches: predefined sketches configuration
