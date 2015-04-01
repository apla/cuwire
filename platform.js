var path = require ('path');
var util = require ('util');
var fs   = require ('fs');
var os   = require ('os');

var exec = require ('child_process').exec;

var EventEmitter = require ('events').EventEmitter;

var common  = require ('./common');
var ArduinoData = require ('./data');

var serial = require ('./serial');

var ncp = require ('ncp').ncp;

var sp;

var Arduino;

function ArduinoPlatform () {
}

util.inherits (ArduinoPlatform, EventEmitter);


ArduinoPlatform.prototype.importFolder = function (platformId, folder) {

	var arduino = new ArduinoData ();

	var userSketchDir = arduino.getUserSketchDir ();

	if (os.platform () === 'darwin') {
		// 1.0 /Applications/Arduino.app/Contents/Resources/Java/hardware/arduino/boards.txt
		// 1.5 /Applications/Arduino.app/Contents/Java/hardware/arduino/avr/boards.txt
		// 1.6 /Applications/Arduino.app/Contents/Resources/Java/hardware/arduino/avr/boards.txt
		// locations[idx] = location.replace (/\.app\/?$/, ".app/Contents/Java");
		// I don't need to support import from 1.5.x for now
		folder = folder.replace (/\.app\/?$/, ".app/Contents/Resources/Java");
	}

	// TODO: check folder actual contents for ide version and so on
	// linux sometime have mad strings, like "1:1.0.5+dfsg2-2"
	// var version = versionBuf.toString ().match (/\d+\.\d+\.\d+/);
	// var modern  = version[0].match (/^1\.[56]\./);

	var self = this;

	if (platformId === 'energia') {
		var energiaUserFolder = path.join (userSketchDir, 'hardware', 'energia');
		common.mkdirParent (energiaUserFolder, function (err) {
			if (err && err.code !== 'EEXIST') {
				self.emit ('error', err);
				return;
			}
			ncp (path.join (folder, 'hardware'), energiaUserFolder, function (err) {
				if (err) {
					self.emit ('error', err);
					return;
				}
				ncp (path.join ('.', 'hardware', 'energia'), energiaUserFolder, function (err) {
					if (err) {
						self.emit ('error', err);
						return;
					}
					self.emit ('done');
				});
			});
		});
	} else if (platformId === 'intel') {
		var intelToolsFolder = path.join (userSketchDir, 'hardware', 'intel', 'tools');
		common.mkdirParent (intelToolsFolder, function (err) {
			if (err && err.code !== 'EEXIST') {
				self.emit ('error', err);
				return;
			}
			ncp (path.join (folder, 'hardware', 'arduino'), path.dirname (intelToolsFolder), function (err) {
				if (err) {
					self.emit ('error', err);
					return;
				}
				ncp (path.join (folder, 'hardware', 'tools'), intelToolsFolder, function (err) {
					if (err) {
						self.emit ('error', err);
						return;
					}
					ncp (path.join ('.', 'hardware', 'intel'), path.dirname (intelToolsFolder), function (err) {
						if (err) {
							self.emit ('error', err);
							return;
						}
						self.emit ('done');
					});
				});

			});

		});

	} else {

	}
}


ArduinoPlatform.importFolderEnergia = function (folder) {

}

ArduinoPlatform.importFolderIntel = function (folder) {

}

module.exports = ArduinoPlatform;
