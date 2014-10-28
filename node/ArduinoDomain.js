/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, node: true */
/*global */

(function () {
	"use strict";

	var os = require("os");
	var fs   = require('fs');
	var path = require ('path');

	var _domainManager;

	var Arduino = require ('./arduino');

	var theArduino;

	function getBoardsMeta (locations) {

		var cb = arguments[arguments.length-1];

		if (!theArduino) {
			theArduino = new Arduino (locations);

			theArduino.on ('done', function () {
				cb (null, theArduino.boardData);
			});
		} else {
			cb (null, theArduino.boardData);
		}
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

	function compile (params) {
		var currentFilePath = params.shift ();
		var platformName    = params.shift ();
		var boardId         = params.shift ();
		var boardVariation  = params.shift ();
		var options         = params.shift ();

		var cb = arguments[arguments.length-1];

		if (!theArduino) {
			// show error
			// cb
			return;
		}

		theArduino.compile (
			// "sketch" folder
			"/Users/apla/work/com.domtale/arduino/Sensor",
			// platform name
			platformName,
			// board id
			boardId,
			// boardVariation (e.g. cpu menu selection)
			{
				cpu: '16MHzatmega328'
			},
			// options (e.g. custom build folder)
			{
				// build folder
				buildFolder: "/Users/apla/Library/Application Support/Brackets/extensions/user/brackets-arduino/build"
			}
		);
		theArduino.on ('compiled', function (size) {
			console.log ('arduino domain: compiled', arguments);
			cb (null, size);
		});
		theArduino.on ('log', function (message) {
			console.log (message);
			_domainManager.emitEvent ('arduino', 'log', message);
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
		_domainManager = domainManager;
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
		domainManager.registerCommand(
			"arduino",     // domain name
			"compile",     // command name
			compile,       // command handler function
			true,          // this command is asynchronous in Node
			"compile current sketch",
			[{
				name: "currentFilePath",
				type: "string",
				description: "current file path — to find a ino sketch"
			}, {
				name: "platformName",
				type: "string",
				description: "arduino platform name"
			}, {
				name: "boardId",
				type: "string",
				description: "board identifier"
			}, {
				name: "menus",
				type: "object",
				description: "menus"

			}],
			[{name: "size", // return values
			  type: "object",
			  description: "compiled code size"}]
		);
		domainManager.registerEvent(
			"arduino",     // domain name
			"log",         // event name
			[{
				name: "string",
				type: "string",
				description: "log string"
			}]
		);
	}

	exports.init = init;

}());
