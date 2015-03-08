#!/usr/bin/env node
var ArduinoData = require ('./data');

var ArduinoCompiler = require ('./compiler');
var ArduinoUploader = require ('./uploader');
var CuwireSerial    = require ('./serial');

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
	this.arduino = new ArduinoData (options.arduino, undefined, undefined, {
		verbose: options.verbose,
		debug:   options.debug
	});

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
		// probably need to stop on error?
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
			if (matchBoard && (options.board.board === deviceId || (usbMatch[usbPair] && usbMatch[usbPair].alt[options.board.board]))) {
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

	serialMon.on ('close', function (err) {
		console.log (paint.cuwire ('port is closed'));
		process.exit ();
	});

	serialMon.on ('error', function (err) {
		console.log (paint.cuwire ('port error:'), paint.error (err));
		process.exit (1);
	});
}

ArduinoCli.prototype.showBoards = function () {
	var platforms = this.arduino.hardware;

	console.log (paint.cuwire(), 'boards available:');

	Object.keys (platforms).sort().forEach (function (platformName) {
		if (!platforms.hasOwnProperty(platformName)) return;
		if (!platforms[platformName].platform) {
			console.error ("not a platform:", platformName);
			return;
		}
		var platformVer = platforms[platformName].platform.version;
		console.log (
			paint.yellow (platforms[platformName].platform.name) +' ('+platformName+')',
			platformVer ? platformVer.toString() : ''
		);

		var boards = platforms[platformName].boards;
		Object.keys (boards).sort().map (function (boardId) {
			if (!boards.hasOwnProperty(boardId)) return;
			var boardMeta = boards[boardId];
			if (!boardMeta.name) {
				console.error ("not a board:", boardId);
				return;
			}

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
		if (userConfig.sketch && userConfig.sketch[options.sketch]) {
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

	uploader.on ('log', function (scope, message) {
		console.log (paint.yellow (scope) + "\t", message.match (/^done/) ? paint.green (message) : message);
	});

	compiler.on ('error', this.errorHandler.bind (this, 'compilation'));

	compiler.on ('warning', function (warning) {
		console.log (paint.error (warning));
	});

	uploader.on ('done', console.log.bind (console, paint.yellow ('upload'), paint.green ('done')));
}


ArduinoCli.prototype.compile = function (options, cb) {

	var buildMeta = guessSketch (this.arduino, options);

	console.log (paint.cuwire(), 'compilation of', paint.path (buildMeta.folder), "cache core:", paint.yellow (options.cacheCore));

	var compiler = this.compiler = new ArduinoCompiler (
		buildMeta.folder,
		(options.board && options.board.platform) || buildMeta.platform,
		(options.board && options.board.board)    || buildMeta.board,
		(options.board && options.board.model)    || buildMeta.model,
		{
			// build folder
//			buildFolder: "/Users/apla/work/mcu/brackets-arduino/build",
			buildFolder: options.buildFolder,
			includes:    options.inc || buildMeta.includes,
			cacheCore:   options.cacheCore
		}
	);

	compiler.verbose = options.verbose;

	console.log ('build folder:', paint.path (compiler.buildFolder));

	compiler.on ('log', function (scope, message) {
		console.log (paint.yellow (scope) + "\t", message.match (/^done/) ? paint.green (message) : message);
	});

	compiler.on ('error', this.errorHandler.bind (this, 'compilation'));

	compiler.on ('warning', function (warning) {
		console.log (paint.error (warning));
	});

	compiler.on ('done', cb.bind (this, undefined, buildMeta.folder, compiler));

	compiler.on ('failed', function () {

		console.log (paint.cuwire (), paint.error ("failed:", buildMeta.folder));

		cb (true, buildMeta.folder, compiler);
	});

	compiler.start ();
}

ArduinoCli.prototype.errorHandler = function (stage, error, message) {

	console.log (paint.cuwire(), stage, 'failed:')

	if (error && error.files && error.files.length) {
		error.files.forEach (function (fileDesc) {
			console.log ('error in', paint.path (fileDesc[1])+(['',fileDesc[2], fileDesc[3]].join(':')), paint.error (fileDesc[4]));
		});
		console.log (paint.yellow ('command'), error.cmd)
	} else if (error && ("stderr" in error)) {
		console.log (paint.error (error.stderr || error.cmd));
	} else if (error && error.code) {
		if (error.code === "ENOENT") {
			console.log (paint.error ("File not found:"),  paint.path (error.path));
		}
	} else {
		console.log (paint.error (error) + "\t", message)
	}
}

ArduinoCli.prototype.iterateExamples = function (platformId, board, cache, filter) {
	var platformExamples = this.arduino.examples[platformId];
	var coreAlreadyBuilt = false;
	for (var exampleName in platformExamples) {

		var sketchFolder = this.getPathForExample (platformId, exampleName, platformExamples[exampleName]);

		if (filter && sketchFolder.indexOf (filter) !== 0) {
			return;
		}

		this.enqueueSketchTest ({
			sketch: sketchFolder,
			board: board,
			cacheCore: cache === undefined ? coreAlreadyBuilt : cache,
			buildFolder: "./build"
		});

		coreAlreadyBuilt = true;
	}
}

ArduinoCli.prototype.getPathForExample = function (platformId, exampleName, exampleDesc) {
	var folder = '';
	if (platformId && this.arduino.hardware[platformId] && exampleDesc.rel) {
		folder = this.arduino.hardware[platformId]["folders.root"];
	}

	if (exampleDesc && exampleDesc.lib) {
		folder = path.join (folder, 'libraries', exampleDesc.lib, 'examples', exampleName);
	} else {
		folder = path.join (folder, exampleName);
	}
	return folder;
}

var queueLimit = 0;

ArduinoCli.prototype.enqueueSketchTest = function (options) {
	if (this.testIndex === 0) {

		this.compile (options, this.sketchTestDone.bind (this));

		this.testIndex++;

	} else if (queueLimit && this.testQueue.length === queueLimit - 1) {
		if (this.verbose) console.log (path, 'skipped');
		return;
	} else {
		if (this.verbose) console.log (path, 'added');
		this.testQueue.push (options);
	}
}

ArduinoCli.prototype.sketchTestDone = function (err, sketch, compiler) {
	if (err) {
		this.testErrors.push (["sketch:", sketch, "build:", compiler.buildFolder].join (" "));
	}

	if (this.testQueue.length) {
		var options = this.testQueue.shift();
		this.compile (options, this.sketchTestDone.bind (this));
		this.testIndex++;
	} else {
		if (this.testErrors.length) {
			console.error (paint.error ("failed sketches:", [''].concat (this.testErrors).join ("\n")));
			console.log (paint.cuwire(), 'test complete, failed:', this.testErrors.length, 'of', this.testIndex);
		} else {
			console.log (paint.cuwire(), 'test complete, all ok');
		}

	}
}


ArduinoCli.prototype.runTestOnFileset = function (files, onlyPlatform, forceBoard) {

	this.testQueue   = [];
	this.testIndex   = 0;

	this.testErrors  = [];

	for (var platformId in files) {
		var board = forceBoard;

		if (onlyPlatform && onlyPlatform !== platformId) {
			continue;
		}

//		console.log ('platform:', platformId);
		if (platformId === 'arduino:avr') {
			if (this.verbose) console.log ('getting uno as reference board for', platformId);
			board = board || this.arduino.lookupBoard ('uno');

			this.iterateExamples (platformId, board);

		} else if (platformId === ':') {
			if (this.verbose) console.log ('getting uno as reference board for', platformId);
			board = board || this.arduino.lookupBoard ('uno');

			// this.iterateExamples (platformId, board, undefined, arduinoApp);
			// this.iterateExamples (platformId, board, undefined);

		} else if (platformId.match(/rfduino/i)) {
			if (this.verbose) console.log ('getting rfduino as reference board for', platformId);
			board = board || this.arduino.lookupBoard ('rfduino');

			this.iterateExamples (platformId, board, false);
			// this.iterateExamples (platformId, board); // does not work
		} else if (platformId === 'arduino:sam') {
			if (this.verbose) console.log ('getting due as reference board for', platformId);
			board = board || this.arduino.lookupBoard ('arduino_due_x');

			this.iterateExamples (platformId, board, false);
			// this.iterateExamples (platformId, board); // does not work
		} else if (platformId === 'Arduino_STM32:STM32F1') {
			if (this.verbose) console.log ('getting maple mini as reference board for', platformId);
			board = board || this.arduino.lookupBoard ('maple_mini');

			this.iterateExamples (platformId, board);

		} else if (platformId === "energia:lm4f") {
			if (this.verbose) console.log ('getting stellaris launchpad as reference board for', platformId);
			board = board || this.arduino.lookupBoard ("lplm4f120h5qr");

			this.iterateExamples (platformId, board);
		} else if (board) {
			this.iterateExamples (platformId, board);
		}
	}
}


ArduinoCli.prototype.test = function (options, cb) {

	var testParam = options.test === true ? options._[0] : options.test;

	var onlyPlatform;

	console.log ("testParam", testParam, "board", options.board);

	if (testParam === 'all') {
		// test every example we've found

		this.runTestOnFileset (this.arduino.examples);

	} else if ((!testParam || testParam === true) && options.board) {

		// run only tests for that platform/board
		onlyPlatform = options.board.platform;

		this.runTestOnFileset (this.arduino.examples, onlyPlatform, options.board);

	} else if (testParam && testParam !== true && options.board) {

		// walk folder, find sketches and run test for that sketches


	} else {
		console.log ("you must define test scope.", paint.path ("arduino:avr"), ', ', paint.path ('all'), "or sketches/libraries folder name with board param is ok.");
	}



	console.log (testParam);

}


var cli = new ArduinoCli ();
