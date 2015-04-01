var path = require ('path');
var util = require ('util');
var fs   = require ('fs');

var exec = require ('child_process').exec;

var EventEmitter = require ('events').EventEmitter;

var common  = require ('./common');
var ArduinoData = require ('./data');

var serial = require ('./serial');

var sp;

var Arduino;

function ArduinoUploader (compiler, platformId, boardId, boardVariant, options) {

	// TODO: make use of instance property (instance populated on successful config read)
	Arduino = new ArduinoData ();

	this.platformId = platformId;

	var currentStage = "upload";

	var tool = common.createDict (Arduino, platformId, boardId, boardVariant, options, currentStage);

	tool['build.path'] = compiler.buildFolder;
	tool['build.project_name'] = compiler.projectName;

	if (tool['upload.params.verbose']) {
		if (options.verbose) {
			tool['upload.verbose'] = tool['upload.params.verbose']; // or quiet
		} else {
			tool['upload.verbose'] = tool['upload.params.quiet'];
		}
	} else {
		tool['upload.verbose'] = "";
	}

	var serialPort = tool['serial.port'] = tool['serial.port.file'] = options.serial.port;
	if (serialPort.indexOf ('/dev/') === 0) {
		tool['serial.port.file'] = serialPort.substr (5);
	}

	this.initSerial ();

//	if (!tool.upload.protocol) {
		// if no protocol is specified for this board, assume it lacks a
		// bootloader and upload using the selected programmer.
		// TODO: emit error
		// TODO: use programmer
//		return;
//	}


	if (options.haveCompiledHex) {
		var uploadFileRegexp = /\{build\.path\}\/\{build\.project_name\}\.hex/;
		if (tool['upload.pattern'].match (uploadFileRegexp)) {
			tool['upload.pattern'] = tool['upload.pattern'].replace (uploadFileRegexp, '{upload.precompiled_hex}');
			tool['upload.precompiled_hex'] = options.haveCompiledHex;
		} else {
			this.emit ('error', 'upload', new Error ('Current platform doesn\'t support precompiled hex upload. "upload.pattern"='+tool['upload.pattern']));
			return;
		}
	}

	// have event subscription issues without this
	process.nextTick (this.prepareCmd.bind (this, tool));
}

util.inherits (ArduinoUploader, EventEmitter);

ArduinoUploader.prototype.initSerial = function () {
	try {
		// https://github.com/voodootikigod/node-serialport
		// HOWTO built THAT on mac (got idea from https://github.com/jasonsanjose/brackets-sass/tree/master/node):
		// 1) cd <extension-folder>/node; npm install node-gyp node-pre-gyp serialport
		// 2) cd node_modules/serialport
		// 3) /Applications/devel/Brackets.app/Contents/MacOS/Brackets-node ../../node_modules/node-pre-gyp/bin/node-pre-gyp --arch=ia32 rebuild

		// current binaries got from http://node-serialport.s3.amazonaws.com
		sp = require("serialport");
	} catch (e) {
		console.log ("cannot load serialport module", e);
	}
}


ArduinoUploader.prototype.prepareCmd = function (tool) {
	var recipe = tool['upload.pattern'];

	this.emit ('log', 'upload', "using port: "+tool['serial.port']);

	if (this.debug) console.log (tool, recipe);

	var cmd = common.replaceDict (recipe, tool);

	if (this.verbose) console.log (cmd);

	if (tool['upload.use_1200bps_touch']) {
		this.emit ('log', 'upload', "dancing 1200 bod");
		this.danceSerial1200 (tool, this.runCmd.bind (this, cmd, tool));
	} else {
		this.runCmd (cmd, tool);
	}
}

ArduinoUploader.prototype.danceSerial1200 = function (tool, cb) {
	var port = new serial ({port: tool["serial.port"]});

	var waitForPort = tool['upload.wait_for_upload_port'];

	port.danceSerial1200 (waitForPort, function (err) {
		if (err) {
			this.emit ('error', 'upload', err);
			return;
		}
		this.emit ('log', 'upload', "dance done");
		cb ();
	}.bind (this));
}

ArduinoUploader.prototype.runCmd = function (cmd, tool) {
	var scope = 'upload';
	this.emit ('log', scope, cmd);

	var env = common.prepareEnv (
		path.resolve (tool['runtime.ide.path']),
		path.resolve (tool['runtime.platform.path'])
	);

	var child = exec(cmd, {env: env}, (function (error, stdout, stderr) {
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
		this.emit ('log', scope, 'done');
		this.emit ('done');
	}).bind (this));
}


module.exports = ArduinoUploader;
