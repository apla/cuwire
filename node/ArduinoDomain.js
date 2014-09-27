/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, node: true */
/*global */

(function () {
	"use strict";

	var os = require("os");
	var fs   = require('fs');
	var path = require ('path');


	function parseArduinoConf (cb, section, err, data) {
		if (err) {
			cb (err);
			return;
		}

		var boards = {};

		data.toString().split('\n').forEach(function(line){
			if(line.indexOf("#") == 0) return;
			if(line.length == 0) return;
			// console.log (line);
			var parts = line.split('=');
			var ref = parts[0];
			if (ref === "menu.cpu") return;
			var value = parts[1];
			var refs = ref.split('.');

			var root = boards;
			if (refs.length === 4 && refs[1] === "menu" && refs[2] === "cpu")
				refs.push ("cpu_variant_name");
			for(var i=0; i<refs.length; i++) {
				var sec = refs[i];
				if(!root[sec]) {
					root[sec] = {};
				}
				if(i == refs.length-1) {
					root[sec] = value;
				}
				root = root[sec];
			}
		});
		cb (null, section, boards);

	}

	function appendStandardLocations (locations) {
		// 1.0 /Applications/Arduino.app/Contents/Resources/Java/hardware/arduino/boards.txt
		// 1.5 /Applications/Arduino.app/Contents/Java/hardware/arduino/avr/boards.txt

		// default application folders:
		locations.push ("/Applications/Arduino.app");
		locations.push ("C:/Program Files/Arduino");

		// default user folders:
		function getUserHome() {
			return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
		}
		// TODO: read preference file ~/Library/Arduino15/preferences.txt
		locations.push (path.join (getUserHome(), "Documents/Arduino"));

		// TODO: author's module location - use preferences for this
		locations.push ("/Applications/devel/Arduino.app");

	}

	function getBoardsMeta (locations) {

		var cb = arguments[arguments.length-1];

		if (locations.constructor !== Array) {
			if (locations.constructor === String) {
				locations = [locations];
			} else {
				console.log (arguments);
				cb ("first argument must be a path string or an array of paths");
			}
		}

		appendStandardLocations (locations);

		var hwFolders = [];
		[
			"Contents/Java/hardware",
			"hardware"
		].forEach (function (append) {
			locations.forEach (function (location) {
				if (!location || location.constructor !== String) {
					cb ("every location must be string");
				}
				hwFolders.push (path.join (location, append));
			});
		});

		console.log (hwFolders);

		var data = {};
		var remains = 0;
		var processed = false;
		// WTF spaghetti
		hwFolders.forEach (function (hwFolder, hwFolderIdx) {
			// ok, got hardware folder. now we must iterate over vendor folders
			// and the by devices folders
			fs.readdir (hwFolder, function (err, vendorDirs) {
				if (err) {
					if (hwFolderIdx === hwFolders.length - 1)
						processed = true;
					return;
				}
				vendorDirs.forEach (function (vendorDir, vendorIdx) {
					fs.readdir (path.join (hwFolder, vendorDir), function (err, deviceDirs) {
						if (err) {
							if (vendorIdx === vendorDirs.length - 1)
								processed = true;
							return;
						}
						deviceDirs.forEach (function (deviceDir, deviceIdx) {
							var readCb = function (err, type, fileData) {
								remains --;
								if (err) {
									return;
								}

								if (!data[vendorDir+": "+deviceDir])
									data[vendorDir+": "+deviceDir] = {};
								data[vendorDir+": "+deviceDir][type] = fileData;
								// TODO: probably race condition: we can achieve no more remains
								// but still unread folders
								// console.log ("processed:", processed, "remains:", remains);
								if (!processed)
									return;
								if (remains)
									return;
								arduinoBoardsDone (cb, data);
							};
							var deviceBoardsFile   = path.join (hwFolder, vendorDir, deviceDir, 'boards.txt');
							var devicePlatformFile = path.join (hwFolder, vendorDir, deviceDir, 'platform.txt');
							remains += 2;

							// console.log ("reading", deviceBoardsFile);
							fs.readFile (deviceBoardsFile, parseArduinoConf.bind (this, readCb, 'boards'));
							// console.log ("reading", devicePlatformFile);
							fs.readFile (devicePlatformFile, parseArduinoConf.bind (this, readCb, 'platform'));

							if (
								(hwFolderIdx === hwFolders.length - 1) &&
								(vendorIdx === vendorDirs.length - 1) &&
								(deviceIdx === deviceDirs.length - 1)
							) {
								processed = true;
							}
						});
					});
				});
			});
		});
	}

	function arduinoBoardsDone (cb, boards) {
		fs.writeFile (
			path.join (__dirname, "../arduino.json"),
			JSON.stringify (boards, null, '\t'),
			function (err) {
				if (err) cb (err);
				cb (null, boards);
			});
	}

	/**
	 * function to enumerate serial ports
	 * @return {array} path names
	 */
	function enumerateSerialPorts () {
//		console.log (os);

		var cb = arguments[arguments.length-1];

		var serialport;
		try {
			// https://github.com/voodootikigod/node-serialport
			// HOWTO built THAT on mac (got idea from https://github.com/jasonsanjose/brackets-sass/tree/master/node):
			// 1) cd <extension-folder>/node; npm install node-gyp node-pre-gyp serialport
			// 2) cd node_modules/serialport
			// 3) /Applications/devel/Brackets.app/Contents/MacOS/Brackets-node ../../node_modules/node-pre-gyp/bin/node-pre-gyp --arch=ia32 rebuild
			serialport = require("serialport");
		} catch (e) {
			cb ("cannot load serialport module"+e);
			return;
		}

		var err, result = [];
		serialport.list(function (err, ports) {
			ports.forEach(function(port) {
				result.push (port.comName);
//				console.log(port.comName);
//				console.log(port.pnpId);
//				console.log(port.manufacturer);
			});
			cb (err, result);
		});

//		var SerialPort = serialport.SerialPort;
//		var serialPort = new SerialPort("/dev/tty-usbserial1", {
//			baudrate: 57600
//		});

	}

	/**
	* Initializes the domain
	* @param {DomainManager} domainManager The DomainManager for the server
	*/
	function init(domainManager) {
		if (!domainManager.hasDomain("arduino")) {
			domainManager.registerDomain("arduino", {major: 0, minor: 1});
		}
		domainManager.registerCommand(
			"arduino",       // domain name
			"enumerateSerialPorts",    // command name
			enumerateSerialPorts,   // command handler function
			true,          // this command is asynchronous in Node
			"Enumerate all serial ports",
			[],
			[{name: "ports", // return values
			  type: "array",
			  description: "serial port path names"}]
		);
		domainManager.registerCommand(
			"arduino",       // domain name
			"getBoardsMeta",    // command name
			getBoardsMeta,   // command handler function
			true,          // this command is asynchronous in Node
			"get arduino boards metadata",
			[{
				name: "dirs",
				type: "array",
				description: "directory list to search within"
			}],
			[{name: "boards", // return values
			  type: "object",
			  description: "board data"}]
		);
	}

	exports.init = init;

}());
