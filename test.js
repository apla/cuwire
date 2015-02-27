var path = require ('path');
var exec = require('child_process').exec;

var common = require ('./common');
var ArduinoData = require ('./data');
var ArduinoCompiler = require ('./compiler');

var paint = require ('./color');

paint.error   = paint.bind (paint, "red+white_bg");
paint.path    = paint.cyan.bind (paint);
paint.cuwire  = paint.green.bind (paint, "cuwire");

var queueLimit = 0;

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

			iterateExamples (platformId, board, false);
//			iterateExamples (platformId, board); // does not work
		} else if (platformId === 'Arduino_STM32:STM32F1') {
			console.log ('getting maple mini as reference board');
			board = arduino.lookupBoard ('maple_mini');

			iterateExamples (platformId, board);

		} else if (platformId === "energia:lm4f") {
			console.log ('getting stellaris launchpad as reference board');
			board = arduino.lookupBoard ("lplm4f120h5qr");

//			iterateExamples (platformId, board);
		} else {
			continue;
		}

	}

}).bind (this));

function iterateExamples (platformId, board, cache) {
	var platformExamples = arduino.examples[platformId];
	var coreAlreadyBuilt = false;
	for (var exampleName in platformExamples) {

		var sketchFolder = getPathForExample (platformId, exampleName, platformExamples[exampleName]);
//		console.log ('example at:', sketchFolder);

		enqueueCompileTask (sketchFolder, {
			board: board,
			cacheCore: cache === undefined ? coreAlreadyBuilt : cache
		});

		coreAlreadyBuilt = true;
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

var errors = [];

function enqueueCompileTask (path, options) {
	if (!compileRunning) {
		compileSample (path, options, compileTaskDone);
		compileRunning = true;
	} else if (queueLimit && queue.length === queueLimit - 1) {
		console.log (path, 'skipped');
		return;
	} else {
		console.log (path, 'added');
		queue.push ([path, options]);
	}
}

function compileTaskDone (err, sketch) {
	if (err) errors.push (sketch);

	if (queue.length) {
		var po = queue.shift();
		compileSample (po[0], po[1], compileTaskDone);
	} else {
		if (errors.length)
			console.error (paint.error ('failed sketches:', errors.join ("\n")));
		console.log (paint.cuwire(), 'test complete');
	}
}

var afterError = false;

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
			includes: options.includes,
			cacheCore: options.cacheCore === undefined ? true : options.cacheCore
		}
	);

	compiler.verbose = options.verbose;

	console.log ('sketch folder:', paint.path (path));
//	console.log ('build folder:', paint.path (compiler.buildFolder));


	compiler.on ('log', function (scope, message) {
		// console.log (paint.yellow (scope) + "\t", message.match (/^done/) ? paint.green (message) : message);
	});

	compiler.on ('error', function (error, message) {
		// process.nextTick (cb.bind (this, error, path));
		// afterError = true;
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

		console.log (paint.cuwire (), "finished:", paint.path (path));

		cb (null);
	});

	compiler.on ('failed', function () {

		console.log (paint.cuwire (), paint.error ("failed:", path));

		cb (path);
	});
}
