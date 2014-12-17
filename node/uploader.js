var path = require ('path');
var util = require ('util');
var fs   = require ('fs');

var exec = require ('child_process').exec;

var EventEmitter = require ('events').EventEmitter;

var common  = require ('./common');
var ArduinoData = require ('./data');

var sp = require("serialport");

var Arduino;

function ArduinoUploader (compiler, platformId, boardId, boardVariant, options) {

	// TODO: make use of instance property (instance populated on successful config read)
	Arduino = new ArduinoData ();

	var boardsData = Arduino.boardData[platformId];

	var platform = boardsData.platform; // arduino:avr.platform
	var board = JSON.parse (JSON.stringify (boardsData.boards[boardId])); // arduino:avr.boards.uno

	var boardBuild = board.build; // arduino:avr.boards.uno.build

	this.boardsData = boardsData;

	this.platformId = platformId;

	this.platform = platform; // arduino:avr.platform

	var stageName = "upload";

	"upload bootloader build".split (" ").forEach (function (stageName) {
		for (var variantKey in boardVariant) {
			if (!board.menu[variantKey]) {
				// TODO: probably it is a program error, no need to say something to user
				console.log ('brackets-arduino error:', boardId, 'doesn\'t have a', variantKey, 'variants');
				console.log ('ignored for now, can continue');
				continue;
			}
			var fixup = board.menu[variantKey][boardVariant[variantKey]];
			if (!fixup[stageName])
				return;
			for (var stageKey in fixup[stageName]) {
				board[stageName][stageKey] = fixup[stageName][stageKey];
			}
		}
	});

	delete (board.menu);

	// let's find upload tool

	var toolName = board.upload.tool;
	var tool = JSON.parse (JSON.stringify (platform.tools[toolName])); // arduino/avr.platform.tools.<toolName>


	common.pathToVar (tool, 'runtime.ide.path', Arduino.runtimeDir);
	// TODO: get version from mac os x bundle or from windows revisions.txt
	common.pathToVar (tool, 'runtime.ide.version', "158");

	// conf.compiler.path = common.replaceDict (tool.compiler.path, conf);

	"upload bootloader build".split (" ").forEach (function (stageName) {
		for (var buildK in board[stageName]) {
			if (!tool[stageName])
				tool[stageName] = {};
			tool[stageName][buildK] = board[stageName][buildK];
		}
	});

	// arduino/avr.boards.uno.build

	//	common.pathToVar (conf, 'build.arch', platformId.split (':')[1]);
	common.pathToVar (tool, 'build.arch', platformId.split (':')[1].toUpperCase ());

//	console.log (conf.upload);
//
//	console.log (conf.tools[conf.upload.tool]);

//	console.log (tool);

	if (tool.upload.params && tool.upload.params.verbose) {
		if (options.verbose) {
			tool.upload.verbose = tool.upload.params.verbose; // or quiet
		} else {
			tool.upload.verbose = tool.upload.params.quiet;
		}
	}

	common.pathToVar (tool, 'serial.port', options.serial.port);

	tool.build.project_name = compiler.projectName;
	tool.build.path         = compiler.buildFolder;

	this.prepareCmd (tool);

	if (!tool.upload.protocol) {
		// if no protocol is specified for this board, assume it lacks a
		// bootloader and upload using the selected programmer.
		// TODO: emit error
		// TODO: use programmer
		return;
	}

	return this;



	this.on ('queue-completed', this.runNext.bind (this));
	// TODO: emit something to arduino
	this.on ('queue-progress', function (scope, pos, length) {
		//		console.log (scope, pos + '/' + length);
	});
	this.on ('queue-failed', function (scope, err) {
		console.log (scope, 'failed:', err);
	});

	this._done = {};
	this._queue = {};

	var projectName = path.basename (sketchFolder);
	this.setProjectName (projectName);

	this.sketchFolder = sketchFolder;

	common.pathWalk (sketchFolder, this.setProjectFiles.bind (this), {
		nameMatch: /[^\/]+\.(c(?:pp)|h|ino|pde)?$/i
	});

	common.pathWalk (boardsData.folders.root + '/cores/' + board.build.core, this.setCoreFiles.bind (this), {
		nameMatch: /[^\/]+\.c(pp)?$/i
	});

	// for each library add [lib folder]/utility

	//	var cppCompile = platform.recipe.cpp.o.pattern.replaceDict (conf);

	// original arduino compile routine
	// https://github.com/arduino/Arduino/blob/3a8ad75bcef5932cfc81c4746a87ddbdbd7e6402/app/src/processing/app/debug/Compiler.java

	// docs
	// https://github.com/arduino/Arduino/wiki/Arduino-IDE-1.5---3rd-party-Hardware-specification

	//	console.log (cppCompile);

}

util.inherits (ArduinoUploader, EventEmitter);

ArduinoUploader.prototype.prepareCmd = function (tool) {
	var recipe = tool.upload.pattern;

	console.log (recipe);

	var cmd = common.replaceDict (recipe, tool);

	console.log (cmd);

	if (tool.upload.use_1200bps_touch) {
		this.danceSerial1200 (tool, this.runCmd.bind (this, cmd));
	} else {
		this.runCmd (cmd);
	}
}

ArduinoUploader.prototype.danceSerial1200 = function (tool, cb) {
	var timeout = 400;
	// taken from electon ide
	sp.list (function (err, list1) {
		console.log("list 1 is ",list1);
		//open port at 1200 baud
		var port = new sp.SerialPort (tool.serial.port, { baudrate: 1200 });
		port.on ('open', function() {
			console.log ("opened at 1200bd");
			//close port
			port.flush (function () {
				port.close (function () {
					console.log ("did a successful close");
					console.log ("closed at 1200bd");
					//wait 300ms
					if (tool.upload.wait_for_upload_port) {
						setTimeout (function() {
							console.log ("doing a second list");
							//scan for ports again
							scanForPortReturn (list1, function(ppath) {
								console.log("got new path",ppath);

								cb();
							})
						}, timeout);
					} else {
						cb ();
					}
				})
			});

		});

	});

}

ArduinoUploader.prototype.runCmd = function (cmd) {
	var scope = 'upload';
	this.emit ('log', '[' + scope + '] ' + cmd);

	var child = exec(cmd, (function (error, stdout, stderr) {
		// The callback gets the arguments (error, stdout, stderr).
		// On success, error will be null. On error, error will be an instance
		// of Error and error.code will be the exit code of the child process,
		// and error.signal will be set to the signal that terminated the process.
		// console.log('stdout: ' + stdout);
		// console.log('stderr: ' + stderr);
		if (error !== null) {
//			console.log ('******************', scope.toUpperCase(), cmd);
//			console.log ('******************', scope.toUpperCase(), 'exec error: ', error, 'stderr', stderr);
			error.scope  = scope;
			error.cmd    = cmd;
			error.stderr = stderr;
			this.emit ('error', error);
			return;
		}
		this.emit ('done');
	}).bind (this));
}


module.exports = ArduinoUploader;
