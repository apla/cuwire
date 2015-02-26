var path = require ('path');
var exec = require('child_process').exec;

var common = require ('./common');
var ArduinoData = require ('./data');
var ArduinoCompiler = require ('./compiler');

var paint = require ('./color');

paint.error   = paint.bind (paint, "red+white_bg");
paint.path    = paint.cyan.bind (paint);
paint.cuwire  = paint.green.bind (paint, "cuwire");

var arduino = new ArduinoData ("/Applications/devel/Arduino.app");

arduino.on ('done', (function () {

//	console.log (arduino.examples);

//	console.log (arduino.folders);

	for (var platformId in arduino.examples) {
		var board;

		console.log ('platform:', platformId);
		if (platformId === 'arduino:avr') {
			console.log ('getting uno as reference board');
			board = arduino.lookupBoard ('uno');

			iterateExamples (platformId, board);
		} else if (platformId === 'RFDuino:arm') {
			console.log ('getting rfduino as reference board');
			board = arduino.lookupBoard ('rfduino');

			iterateExamples (platformId, board);
		} else {
			continue;
		}

	}

}).bind (this));

function iterateExamples (platformId, board) {
	var platformExamples = arduino.examples[platformId];
	for (var exampleName in platformExamples) {

		var sketchFolder = getPathForExample (platformId, exampleName, platformExamples[exampleName]);
//		console.log ('example at:', sketchFolder);

		enqueueCompileTask (sketchFolder, {
			board: board
		});
	}
}

function getPathForExample (platformId, exampleName, exampleDesc) {
	var folder = '';
	if (platformId && arduino.hardware[platformId] && exampleDesc.rel) {
		folder = arduino.hardware[platformId]["folders.root"];
	}

	if (exampleDesc && exampleDesc.lib) {
		folder = path.join (folder, 'libraries', exampleDesc.lib, 'examples', exampleName);
	} else {
		folder = path.join (folder, exampleName);
	}
	return folder;
}

var queue = [];
var compileRunning = false;

var errorCount = 0;

function enqueueCompileTask (path, options) {
	if (!compileRunning) {
		compileSample (path, options, compileTaskDone);
		compileRunning = true;
	} else {
		queue.push ([path, options]);
	}
}

function compileTaskDone (err) {
	if (err) errorCount++;

	var child = exec('rm -rf ./build/*', function (error, stdout, stderr) {
//		console.log('stdout: ' + stdout);
//		console.log('stderr: ' + stderr);
		if (error !== null) {
			console.log('exec error: ' + error);
			return;
		}
		if (queue.length) {
			var po = queue.shift();
			compileSample (po[0], po[1], compileTaskDone);
		} else {
			if (errorCount) console.error (paint.error ('failed', errorCount, 'sketches'));
			console.log (paint.cuwire(), 'test complete');
		}
	});
}

function compileSample (path, options, cb) {

	// TODO: compile core once

	var compiler = new ArduinoCompiler (
		path,
		options.board.platform,
		options.board.board,
		options.board.model,
		{
			// build folder
			buildFolder: "./build",
			includes: options.includes
		}
	);

	compiler.verbose = options.verbose;

	console.log ('sketch folder:', paint.path (path));
	console.log ('build folder:', paint.path (compiler.buildFolder));

	compiler.on ('log', function (scope, message) {
//		console.log (paint.yellow (scope) + "\t", message.match (/^done/) ? paint.green (message) : message);
	});

	compiler.on ('error', function (error, message) {
		cb (error);
		if (error.files && error.files.length) {
			console.log (paint.cuwire(), 'compilation failed:')
			error.files.forEach (function (fileDesc) {
				console.log ('error in', paint.path (fileDesc[1])+(['',fileDesc[2], fileDesc[3]].join(':')), paint.error (fileDesc[4]));
			});
			console.log (paint.yellow ('command'), error.cmd)
			return;
		}
		console.log (paint.error (error) + "\t", message);
	});

	compiler.on ('done', function () {
		cb (null);
		console.log (paint.cuwire ("done"));
	});
}
