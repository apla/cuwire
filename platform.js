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

// TODO: avoid copypaste from compiler.js
function mkdirParent (dirPath, mode, callback) {
	//Call the standard fs.mkdir
	if (!callback) {
		callback = mode;
		mode = undefined;
	}
	fs.mkdir(dirPath, mode, function(error) {
		//When it fail in this way, do the custom steps
		if (error && error.code === 'ENOENT') {
			//Create all the parents recursively
			mkdirParent (path.dirname (dirPath), mode, function (err) {
				//And then the directory
				mkdirParent (dirPath, mode, callback);
			});
			return;
		}
		//Manually run the callback since we used our own callback to do all these
		callback && callback(error);
	});
};

ArduinoPlatform.importFolder = function (platformId, folder) {

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


	if (platformId === 'energia') {
		var energiaUserFolder = path.join (userSketchDir, 'hardware', 'energia');
		mkdirParent (energiaUserFolder, function (err) {
			if (err && err.code !== 'EEXIST') {
				return console.error(err);
			}
			ncp (path.join (folder, 'hardware'), energiaUserFolder, function (err) {
				if (err) {
					return console.error(err);
				}
				ncp (path.join ('.', 'hardware', 'energia'), energiaUserFolder, function (err) {
					if (err) {
						return console.error(err);
					}
					console.log('done!');
				});
			});
		});
	} else if (platformId === 'intel') {
		var intelToolsFolder = path.join (userSketchDir, 'hardware', 'intel', 'tools');
		mkdirParent (intelToolsFolder, function (err) {
			if (err && err.code !== 'EEXIST') {
				return console.error(err);
			}
			ncp (path.join (folder, 'hardware', 'arduino'), path.dirname (intelToolsFolder), function (err) {
				if (err) {
					return console.error(err);
				}
				ncp (path.join (folder, 'hardware', 'tools'), intelToolsFolder, function (err) {
					if (err) {
						return console.error(err);
					}
					ncp (path.join ('.', 'hardware', 'intel'), path.dirname (intelToolsFolder), function (err) {
						if (err) {
							return console.error(err);
						}
						console.log('done!');
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
