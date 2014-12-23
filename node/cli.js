var ArduinoData = require ('./data');

var ArduinoCompiler = require ('./compiler');
var ArduinoUploader = require ('./uploader');

var argv = require ('yargs').argv;

var paint = require ('./color');

paint.error   = paint.bind (paint, "red+white_bg");
paint.path    = paint.cyan.bind (paint);
paint.cuwire = paint.green.bind (paint, "cuwire");

var builds = {
	sensor: {
		sketch: "/Users/apla/work/com.domtale/arduino/Sensor",
		platformId: "arduino:avr",
		boardId: "pro",
		variant: {
			cpu: "16MHzatmega328"
		},
		includes: []
	},
	reprap: {
		sketch: "/Users/apla/work/3d/RepRapFirmware",
		platformId: "arduino:sam",
		boardId: "arduino_due_x_dbg",
		variant: {
		},
		includes: [
			"/Users/apla/work/3d/RepRapFirmware/network",
			"/Users/apla/Documents/Arduino/libraries/Lwip",
			"/Users/apla/Documents/Arduino/libraries/EMAC"
		]
	},
	marlin: {
		sketch: "/Users/apla/work/3d/Marlin/Marlin",
		platformId: "arduino:avr",
		boardId: "mega",
		variant: {
			cpu: "atmega2560"
		},
		includes: []
	},
	rfduinoled: {
		sketch: "/Users/apla/work/mcu/rfduino/LedButton",
		platformId: "RFDuino:RFDuino",
		boardId: "RFduino",
		variant: {
		},
		includes: []
	}

};

var yargs = require ("yargs");

function runEditor (fileName) {
	var child_process = require ('child_process');

	var editor = process.env.EDITOR || 'vim';

	var child = child_process.spawn(editor, [fileName], {
		stdio: 'inherit'
	});

	child.on('exit', function (e, code) {
		console.log("finished");
	});
}

var cliConfig = {
	verbose: {
		alias: "v",
		boolean: true,
		description: "verbose output",
		default: false
	},
	arduino: {
		description: "arduino app location",
		env: "ARDUINO_APP"
	},
	dryRun: {
		alias: ["n", "dry-run"],
		boolean: true,
		description: "just show commands, don't do anything",
		default: false
	},
	upload: {
		description: "compile, then upload hex file using provided port",
		run: ["compile", "upload"],
		arduino: true
	},
	boards: {
		description: "show available boards",
		run: "showBoards",
		arduino: true
	},
	ports: {
		description: "show com ports",
		run: "showPorts"
	},
	compile: {
		description: "compile sketch in provided dir",
		run: "compile",
		arduino: true
	},
	compile3: {
		description: "compile 3 times for testing purposes",
		run: ["compile", "compile", "compile"],
		arduino: true
	},
	_: {
		anyway: true, // launch anyway, even if error is present
		run: "compile",
	},
//	edit: {
//		anyway: true, // launch anyway, even if validation fails
//		description: "run default editor for config, `core` or `fixup`",
//		run: function (options) {
//			if (options.edit === "fixup") {
//				runEditor (this.fixupFile.path);
//			} else if (options.edit === "core") {
//				runEditor (this.configFile.path);
//			}
//		}
//	},
	help: {
		alias: "h",
		anyway: true, // anyway here has no effect
		banner: paint.cuwire () + " usage:"
	}
};


function initOptions () {

	yargs.usage (initOptions.cli.help.banner, initOptions.cli);
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
	return haveCommand;
}

var ArduinoCli = function (args) {
	var options = initOptions ();

	var haveCommand = findCommand (options);

	if (!haveCommand) {
		// TODO: show banner
		return;
	}

	if (!cliConfig[haveCommand].arduino) {
//		console.log (cliConfig[haveCommand].run, this, this[cliConfig[haveCommand].run]);
		this.launchCommand (haveCommand, options);
		if (options.dryRun)
			return;
		return;
	}

	// TODO: use --arduino option to pass arduino app path
	this.arduino = new ArduinoData ([options.arduino || "/Applications/devel/Arduino.app"]);

	this.arduino.on ('done', (function () {

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

ArduinoCli.prototype.showPorts = function () {
	var sp = require("serialport");

	var err, result = [];
	sp.list (function (err, ports) {
		console.log (paint.cuwire(), 'serial ports available:');
		ports.forEach (function (port) {
			console.log (paint.path (port.comName));
			//console.log(port.comName);
			//console.log(port.pnpId);
			//console.log(port.manufacturer);
		});
	});
}

ArduinoCli.prototype.showBoards = function () {
	var platforms = this.arduino.boardData;

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
			if ("menu" in boardMeta) {
				boardDesc += ', modifications: ';
				var modTypes = [];
				for (var modType in boardMeta.menu) {
					var mods = [];
					for (var modK in boardMeta.menu[modType]) {
						mods.push (boardMeta.menu.cpu[modK][modType + '_modification']);
					}
					modTypes.push (paint.yellow(modType) + ': ' + mods.join (", "));

				}

				boardDesc += modTypes.join (", ");
			}
			boardDesc += ')';

			console.log (boardDesc);
		});
	});
}

ArduinoCli.prototype.compile = function (options, cb) {

	var buildName = options.compile || "sensor";

	var buildMeta = builds[buildName];

	console.log (paint.cuwire(), 'compilation of', paint.path (buildMeta.sketch));

	var compiler = this.compiler = new ArduinoCompiler (
		buildMeta.sketch,
		buildMeta.platformId,
		buildMeta.boardId,
		buildMeta.variant,
		{
			// build folder
			buildFolder: "/Users/apla/work/mcu/brackets-arduino/build",
			includes: buildMeta.includes
		}
	);

	compiler.on ('log', function (scope, message) {
		console.log (paint.yellow (scope) + "\t", message.match (/^done/) ? paint.green (message) : message);
	});

	compiler.on ('error', function (scope, message) {
		console.log (paint.error (scope) + "\t", message);
	});

	compiler.on ('done', cb);

	if (argv.test) {
		var secondRun = false;

		compiler.on ('done', function () {
			if (secondRun)
				return;
			secondRun = true;
			compiler = new ArduinoCompiler (
				buildMeta.sketch,
				buildMeta.platformId,
				buildMeta.boardId,
				buildMeta.variant,
				{
					// build folder
					buildFolder: "/Users/apla/work/mcu/brackets-arduino/build"
				}
			);
		});
	}
}

ArduinoCli.prototype.upload = function (options) {
//	compiler.on ('done', function () {
//		upload (argv, buildMeta, compiler);
//	});

	var buildName = argv.template || "sensor";

	var buildMeta = builds[buildName];

	console.log (paint.cuwire(), 'upload ', paint.path (buildMeta.sketch));

	var uploader = new ArduinoUploader (
		this.compiler,
		buildMeta.platformId,
		buildMeta.boardId,
		buildMeta.variant,
		{
			serial: {
				port: options.upload
			},
			verbose: options.verbose
		}
	);
}

var cli = new ArduinoCli ();
