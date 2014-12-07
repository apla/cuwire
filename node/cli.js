var ArduinoData = require ('./data');

var ArduinoCompiler = require ('./compiler');
var ArduinoUploader = require ('./uploader');

var argv = require ('yargs').argv;

var paint = require ('./color');

paint.error   = paint.bind (paint, "red+white_bg");
paint.path    = paint.cyan.bind (paint);
paint.nodeino = paint.green.bind (paint, "nodeino");

var arduino;

var builds = {
	sensor: {
		sketch: "/Users/apla/work/com.domtale/arduino/Sensor",
		platformId: "arduino/avr",
		boardId: "pro",
		variant: {
			cpu: "16MHzatmega328"
		},
		includes: []
	},
	reprap: {
		sketch: "/Users/apla/work/3d/RepRapFirmware",
		platformId: "arduino/sam",
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
		platformId: "arduino/avr",
		boardId: "mega",
		variant: {
			cpu: "atmega2560"
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
	dryRun: {
		alias: ["n", "dry-run"],
		boolean: true,
		description: "just show commands, don't do anything",
		default: false
	},
	configFile: {
		alias: ["config"],
		description: "core config file to process",
		env: "CONF_FU"
	},
	upload: {
		description: "compile, then upload hex file to device",
		run: upload
	},
	boards: {
		description: "show available boards",
		run: showBoards,
		arduino: true
	},
	ports: {
		description: "show com ports",
		run: showPorts
	},
	compile: {
		description: "compile sketch",
		run: compile2Times,
		arduino: true
	},
	_: {
		anyway: true, // launch anyway, even if error is present
		run: compile2Times,
	},
	edit: {
		anyway: true, // launch anyway, even if validation fails
		description: "run default editor for config, `core` or `fixup`",
		run: function (options) {
			if (options.edit === "fixup") {
				runEditor (this.fixupFile.path);
			} else if (options.edit === "core") {
				runEditor (this.configFile.path);
			}
		}
	},
	help: {
		alias: "h",
		anyway: true, // anyway here has no effect
		banner: paint.nodeino () + " usage:"
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
			console.error (paint.nodeino (), 'you cannot launch two commands at once:', [
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

	if (haveCommand && !cliConfig[haveCommand].arduino) {
		cliConfig[haveCommand].run.apply (this, options);
		if (options.dryRun)
			return;
		return;
	}

	// TODO: use --arduino option to pass arduino app path
	arduino = new ArduinoData (["/Applications/devel/Arduino.app"]);

	arduino.on ('done', function () {
		if (haveCommand) {
			cliConfig[haveCommand].run.call (this, arduino, options);
			if (options.dryRun)
				return;
		}
	});

}

var cli = new ArduinoCli ();

function showPorts () {
	var sp = require("serialport");

	var err, result = [];
	sp.list (function (err, ports) {
		console.log (paint.nodeino(), 'serial ports available:');
		ports.forEach (function (port) {
			console.log (paint.path (port.comName));
			//console.log(port.comName);
			//console.log(port.pnpId);
			//console.log(port.manufacturer);
		});
	});
}

function showBoards (arduino) {
	var platforms = arduino.boardData;

	console.log (paint.nodeino(), 'boards available:');

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

function compile2Times () {

	var buildName = argv.template || "sensor";

	var buildMeta = builds[buildName];

	console.log (paint.nodeino(), 'compilation of', paint.path (buildMeta.sketch));

	var compiler = new ArduinoCompiler (
		buildMeta.sketch,
		buildMeta.platformId,
		buildMeta.boardId,
		buildMeta.variant,
		{
			// build folder
			buildFolder: "/Users/apla/Library/Application Support/Brackets/extensions/user/brackets-arduino/build",
			includes: buildMeta.includes
		}
	);

	compiler.on ('log', function (scope, message) {
		console.log (paint.yellow (scope) + "\t", message.match (/^done/) ? paint.green (message) : message);
	});

	compiler.on ('error', function (scope, message) {
		console.log (paint.error (scope) + "\t", message);
	});

	if (argv.test) {
		var secondRun = false;

		compiler.on ('compiled', function () {
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
					buildFolder: "/Users/apla/Library/Application Support/Brackets/extensions/user/brackets-arduino/build"
				}
			);
		});
	}
}

function upload () {
//	compiler.on ('compiled', function () {
//		upload (argv, buildMeta, compiler);
//	});
	var uploader = new ArduinoUploader (
		compiler,
		buildMeta.platformId,
		buildMeta.boardId,
		buildMeta.variant,
		{
			serial: {
				port: argv.upload
			},
			verbose: argv.verbose
		}
	);
}

