#!/usr/bin/env node
var ArduinoData = require ('./data');

var ArduinoCompiler = require ('./compiler');
var ArduinoUploader = require ('./uploader');
var CuwireSerial    = require ('./serial');

var argv = require ('yargs').argv;

var fs   = require ('fs');
var os   = require ('os');
var path = require ('path');

var paint = require ('./color');

paint.error   = paint.bind (paint, "red+white_bg");
paint.path    = paint.cyan.bind (paint);
paint.cuwire  = paint.green.bind (paint, "cuwire");

var yargs = require ("yargs");

var cliConfig = require ('./cli-options.json');

function getPrefsFile() {
	var home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
	var prefs = {
		darwin: 'Library/Application Support/cuwire.json',
		win32:  'AppData/Local/cuwire.json',
		linux:  '.cuwire.json'
	};
	return path.join (home, prefs[os.platform()]);
}

var cliConfig = require ('./cli-options.json');

var userConfig;
try {
	userConfig = require (getPrefsFile ());
} catch (e) {
	userConfig = {};
}

var sketchDir;

var fileNames = fs.readdirSync(process.cwd());
fileNames.forEach (function (fileName) {
	if (path.extname (fileName).match (/^\.(ino|pde)$/)) {
		sketchDir = process.cwd();
	}
});

cliConfig.sketch.default = sketchDir;

cliConfig.arduino.default = userConfig.arduino || ArduinoData.runtimeFolders [os.platform()];

function initOptions () {

	var yargsOptions = {};
	var commands = [];
	for (var optName in initOptions.cli) {
		if (!initOptions.cli[optName].description)
			continue;
		initOptions.cli[optName].run
			? commands.push ("   " + optName + "\t" + initOptions.cli[optName].description)
			: yargsOptions[optName] = initOptions.cli[optName];
	}


	yargs.usage (
		initOptions.cli.help.banner.concat (commands.sort()).join ("\n"),
		yargsOptions
	);
	yargs.help ('help', initOptions.cli.help.description);
	var options = yargs.parse (process.argv.slice (2));

	for (var k in initOptions.cli) {
		// clean up options a little
		var aliases = initOptions.cli[k].alias;
		if (aliases) {
			if (aliases.constructor !== Array)
				aliases = [aliases];
			aliases.forEach (function (aliasName) {
				if (aliasName in options && aliasName !== k) {
					options[k] = options[aliasName]; // not really needed, insurance for a yargs api changes
					delete options[aliasName];
				}
			});
		}
		if (!initOptions.cli[k].env)
			continue;
		if (options[k])
			continue;

		var envVars = initOptions.cli[k].env;
		if (envVars.constructor !== Array)
			envVars = [envVars];
		envVars.forEach (function (envVar) {
			if (process.env[envVar])
				options[k] = process.env[envVar];
		});
	}

	return options;
}

initOptions.cli = cliConfig;

function findCommand (options) {
	var haveCommand;
	var haveParams  = options._;
	for (var k in options) {
		if (!(k in cliConfig))
			continue;
		if (haveCommand && k !== '_' && cliConfig[k].run) {
			console.error (paint.cuwire (), 'you cannot launch two commands at once:', [
				paint.path (k), paint.path (haveCommand)
			].join (' and '));
			return;
		}
		if (k !== '_' && cliConfig[k].run) {
			haveCommand = k;
		}
	}

	// if we don't have a command, try first param
	// ino, leo and so on compatibility
	if (!haveCommand && haveParams[0] && cliConfig[haveParams[0]].run) {
		haveCommand = haveParams.shift();
		options[haveCommand] = true;
	}

	return haveCommand;
}

var ArduinoCli = function (args) {
	var options = initOptions ();

	var haveCommand = findCommand (options);

	if (!haveCommand) {
		// TODO: show banner
		yargs.showHelp();
		return;
	}

	if (!cliConfig[haveCommand].arduino) {
//		console.log (cliConfig[haveCommand].run, this, this[cliConfig[haveCommand].run]);
		this.launchCommand (haveCommand, options);
		if (options.dryRun)
			return;
		return;
	}

	// TODO: store app folder in configuration data
	this.arduino = new ArduinoData (options.arduino);

	this.arduino.on ('done', (function () {

		var runtimeFound = [];
		for (var folderName in this.arduino.folders) {
			var folderData = this.arduino.folders[folderName];
			if (folderData.runtime && folderData.modern) {
				runtimeFound.push ([folderName, folderData]);
			}
		}

		if (runtimeFound.length) {
			if (runtimeFound.length > 1) {
				console.log (
					paint.cuwire (),
					// TODO: add error explantions to wiki
					paint.error ('found multiple runtimes #multipleRuntimesErr, cannot continue. runtime folders:'),
					runtimeFound.map (function (r) {return paint.error (r[0])}).join (',')
				);
				if (cliConfig[haveCommand].runtimeRequired)
					process.exit (1);
			}
			console.log (paint.cuwire (), 'using runtime from', paint.path (runtimeFound[0][0]));
		} else {
			// TODO: add error explantions to wiki
			console.log (paint.cuwire (), paint.error ('no runtimes found #noRuntimesErr'));
			if (cliConfig[haveCommand].runtimeRequired)
				process.exit (1);
		}

		if (options.board) {
			options.board = this.arduino.lookupBoard (options.board, options.model);
			if (!options.board)
				return;
		}

		this.launchCommand (haveCommand, options);
		if (options.dryRun)
			return;

	}).bind (this));

}

ArduinoCli.prototype.launchCommand = function (cmdName, options) {
	var cmdConf = cliConfig[cmdName];

	var methodNames = [].concat (cliConfig[cmdName].run);

	var launchIdx = -1;

	var launchNext = (function (err) {
		launchIdx ++;
		var methodName = methodNames[launchIdx];
		if (methodName)
			this[methodName](options, launchNext);
	}).bind(this);

	launchNext();

}

ArduinoCli.prototype.showPorts = function (options, cb) {
	// TODO: hilight port for board if board defined an port match usb pid/vid
	var matchBoard = false;
	var self  = this;
	var usbMatch;
	if (this.arduino) {
		usbMatch = this.arduino.boardUSBMatch || {};
		if (!options.ports) {

			if (options.port || !options.board) {
				cb();
				return;
			}

			matchBoard = true;

			// we call boards list from another command
			// if port not defined, but defined board name we
			// must guess port name by board name

		}
	}

	CuwireSerial.list (function (err, ports) {
		if (err) {
			if (!matchBoard) console.log (paint.cuwire(), 'serial ports enumeration error:');
			if (!matchBoard) console.log (paint.error (err));
			cb();
			return;
		}
		if (!ports || !ports.length) {
			if (!matchBoard) console.log (paint.cuwire(), 'no serial ports available');
			cb();
			return;
		}
		if (!matchBoard) console.log (paint.cuwire(), 'serial ports available:');
		ports.forEach (function (port) {
			var usbPair = [port.vendorId, port.productId].join (':');
			var deviceName, deviceId;
			if (usbMatch[usbPair]) {
				deviceName = usbMatch[usbPair].boardName;
				deviceId   = usbMatch[usbPair].board;
			}
			var portMessage = [
				paint.path (port.comName),
				(deviceName
				 ? deviceName + ' ('+paint.path (deviceId)+')'
				 : usbPair !== ':' ? usbPair : ''
				),
				port.serialNumber ? '#' + port.serialNumber : '',
				paint.yellow (port.manufacturer)
			];
			if (matchBoard && deviceId === options.board.board) {
				if (options.port) {
					console.error (paint.cuwire (), paint.error ('you must provide serial port name'));
					process.exit(2);
				}
				options.port = port.comName;
//				portMessage.unshift ('guessed serial port:');
//				console.log.apply (console, portMessage);
				return;
			}
			if (!matchBoard) console.log.apply (console, portMessage);
			//console.log(port.comName);
			//console.log(port.pnpId);
			//console.log(port.manufacturer);
		});
		cb();
	})

}

ArduinoCli.prototype.console = function (options) {
	// TODO: connect to port defined by board if board defined and port not
	// TODO: get baudrate from project

	var serialMon = new CuwireSerial.stdio ();

	serialMon.open (options.port, options.baudrate);

	serialMon.on ('close', function () {
		process.exit ();
	});

	serialMon.on ('error', function () {
		process.exit (1);
	});
}

ArduinoCli.prototype.showBoards = function () {
	var platforms = this.arduino.hardware;

	console.log (paint.cuwire(), 'boards available:');

	Object.keys (platforms).sort().forEach (function (platformName) {
		var platformVer = platforms[platformName].platform.version;
		console.log (
			paint.yellow (platforms[platformName].platform.name) +' ('+platformName+')',
			platformVer ? platformVer.toString() : ''
		);

		var boards = platforms[platformName].boards;
		Object.keys (boards).sort().map (function (boardId) {
			var boardMeta = boards[boardId];

			var boardDesc = boardMeta.name + ' (' + paint.path (boardId);
			if ("models" in boardMeta) {
				var models = [];
				for (var modType in boardMeta.models) {
					for (var modK in boardMeta.models[modType]) {
						models.push (paint.yellow(modType+':'+modK) + ' [' + boardMeta.models[modType][modK][''] + ']');
					}
				}

				if (models.length) {
					boardDesc += ', models: ' + models.join (", ");
				}

			}
			boardDesc += ')';

			console.log (boardDesc);
		});
	});
}

function guessSketch (arduino, options) {
	// sketch can be:
	// 1) path to the sketch dir
	// 2) key to describe sketch config in ~/.cuwire.json file

	var result = {};

	if (options.sketch) {
		if (userConfig.sketch[options.sketch]) {
		// sketch template
		result = userConfig.sketch[options.sketch];
		} else {
			result.folder = options.sketch.replace (/[^.\/]+?\.(pde|ino)/, '');
		}
	}

	if (!result.board && !options.board) {
		console.error (paint.cuwire(), paint.error ('you must provide board name for compilation and upload'));
		process.exit (1);
	}

	if (!result.folder) {
		console.error (paint.cuwire(), paint.error ('you must provide sketch folder'));
		process.exit (2);
	}

	return result;
}

ArduinoCli.prototype.compile = function (options, cb) {

	var buildMeta = guessSketch (this.arduino, options);

	console.log (paint.cuwire(), 'compilation of', paint.path (buildMeta.folder));

	var compiler = this.compiler = new ArduinoCompiler (
		buildMeta.folder,
		options.board.platform || buildMeta.platform,
		options.board.board    || buildMeta.board,
		options.board.model    || buildMeta.model,
		{
			// build folder
//			buildFolder: "/Users/apla/work/mcu/brackets-arduino/build",
			includes: buildMeta.includes
		}
	);

	compiler.verbose = options.verbose;

	console.log ('build folder:', paint.path (compiler.buildFolder));

	compiler.on ('log', function (scope, message) {
		console.log (paint.yellow (scope) + "\t", message.match (/^done/) ? paint.green (message) : message);
	});

	compiler.on ('error', function (scope, message) {
		console.log (paint.error (scope) + "\t", message);
	});

	compiler.on ('done', cb);
}

ArduinoCli.prototype.upload = function (options, cb) {
	var buildMeta = guessSketch (this.arduino, options);

	console.log (
		paint.cuwire(),
		'upload', paint.path (buildMeta.folder),
		'using port', paint.path (options.port)
	);

	var uploader = new ArduinoUploader (
		this.compiler,
		options.board.platform || buildMeta.platform,
		options.board.board    || buildMeta.board,
		options.board.model    || buildMeta.model,
		{
			serial: {
				port: options.port
			},
			verbose: options.verbose
		}
	);

	uploader.on ('done', console.log.bind (console, paint.yellow ('upload'), paint.green ('done')));
}

var cli = new ArduinoCli ();
