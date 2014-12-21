var path = require ('path');
var util = require ('util');
var fs   = require ('fs');

var exec = require ('child_process').exec;

var EventEmitter = require ('events').EventEmitter;

var common  = require ('./common');
var ArduinoData = require ('./data');

var Arduino;

function ArduinoCompiler (sketchFolder, platformId, boardId, boardVariant, options) {

	// TODO: make use of instance property (instance populated on successful config read)
	Arduino = new ArduinoData ();

	var boardsData = Arduino.boardData[platformId];

	var platform = boardsData.platform;
	var board = JSON.parse (JSON.stringify (boardsData.boards[boardId]));

	var boardBuild = board.build;

	this.boardsData = boardsData;

	this.platformId = platformId;

	// TODO: replace by temporary folder
	this.buildFolder = options.buildFolder || '';

	this.platform = platform;

	this.objectFiles = [];

	this.coreIncludes = [
		boardsData.folders.root + '/cores/' + board.build.core,
		boardsData.folders.root + '/variants/' + board.build.variant
	];

	this.coreIncludes = this.coreIncludes.concat (options.includes);

//	console.log (this.coreIncludes);

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

	// build stage
	var currentStage = "build";

	var conf = JSON.parse (JSON.stringify (platform));
	common.pathToVar (conf, 'runtime.ide.path', Arduino.runtimeDir);
	// TODO: get version from mac os x bundle or from windows revisions.txt
	common.pathToVar (conf, 'runtime.ide.version', "158");
	common.pathToVar (conf, 'software', "ARDUINO");
	common.pathToVar (conf, 'build.path', this.buildFolder);

	conf.compiler.path = common.replaceDict (conf.compiler.path, conf, null, "compiler.path");

	"upload bootloader build".split (" ").forEach (function (stageName) {
		for (var buildK in board[stageName]) {
			if (!conf[stageName])
				conf[stageName] = {};
			conf[stageName][buildK] = board[stageName][buildK];
		}
	});

//	common.pathToVar (conf, 'build.arch', platformId.split (':')[1]);
	common.pathToVar (conf, 'build.arch', platformId.split (':')[1].toUpperCase ());

	//	console.log ('BUILD', conf.build, platform.recipe.cpp.o.pattern);

	//	The uno.build.board property is used to set a compile-time variable ARDUINO_{build.board}
	//	to allow use of conditional code between #ifdefs. The Arduino IDE automatically generate
	//	a build.board value if not defined. In this case the variable defined at compile time will
	//	be ARDUINO_AVR_UNO.

	this.config = conf;

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

util.inherits (ArduinoCompiler, EventEmitter);

ArduinoCompiler.prototype.setProjectName = function (name) {
	common.pathToVar (this.config, 'build.project_name', name);
	this.projectName = name;

}

ArduinoCompiler.prototype.runNext = function (scope, pos, length) {
	this.emit ('log', scope, 'done '+(pos+1)+'/'+length);
//	console.log ('['+scope+']', 'done', (pos+1)+'/'+length);
	this._done[scope] = true;

	if (scope === 'size') {
		this.emit ('log', 'all', 'done');
//		console.log ('COMPILATION COMPLETE!');
//		console.log (this.platform.recipe.size.regex.data.toString ());
//		console.log (this.platform.recipe.size.regex.eeprom.toString ());
		this.emit ('done', this.compiledSize);
	} else if (scope === 'obj-eep' || scope === 'obj-hex') {
		// whe we achieved obj-* stage, no more steps remaining
		if (this._done['obj-eep'] && this._done['obj-hex']) {
			this.checkSize ();
		}
	} else if (this._done['link']) {
		this.objCopy ();
	} else if (this._done['core'] && this._done['libs'] && this._done['project']) {
		// TODO: anything else
		this.linkAll ();
		this.sketchProcessed = false;
	} else if (this._done['libs']) {
		if (!this.sketchProcessed) {
			this.processSketch ();
			this.sketchProcessed = true;
		}
	}
}

// simple promise replacement
ArduinoCompiler.prototype.ioAction = function () {
	var result = {
		io: true,
		listeners: [],
		done: function (cb) {
			if (cb)
				this.listeners.push (cb);
			if (!this.ready) {
				return;
			}
			var allCb = this.listeners;
			this.listeners = [];
			allCb.forEach ((function (theCb) {
				theCb (this.error);
			}).bind(this));
		},
		callback: function (err, done) {
			result.error = err;
			if (err && err.code === 'EEXIST') {
				result.error = null;
			}
			result.ready = true;
			result.done ();
		}
	};

	return result;
}

ArduinoCompiler.prototype.ioMkdir = function (folder) {

	var action = this.ioAction ();

	mkdirParent (folder, null, action.callback);

	return action;
}

ArduinoCompiler.prototype.enqueueCmd = function (scope, cmdLine, cb, description) {
	if (!this._queue[scope])
		this._queue[scope] = {length: 0, pos: -1, running: false};
	if (scope in this._done)
		delete this._done[scope];
	var thisQueue = this._queue[scope];

	if (cmdLine === undefined) {
		console.log ('tracing scope:', scope);
		console.trace ();
	}

	thisQueue[thisQueue.length++] = [cmdLine, cb, description];
	this.runCmd (scope);
//	console.log (cmdLine);
}

ArduinoCompiler.prototype.runCmd = function (scope) {
	var thisQueue = this._queue[scope];
	if (thisQueue.pos + 1 === thisQueue.length) {
		// TODO: emit done
		this.emit ('queue-completed', scope, thisQueue.pos, thisQueue.length);
		return;
	}
	if (!thisQueue.running && thisQueue.pos + 1 < thisQueue.length) {
		thisQueue.running = true;
		var cb = (function (err, done) {
			if (err) {
				this.emit ('queue-failed', scope, err);
				return;
			}
			thisQueue.pos ++;
			thisQueue.running = false;
			this.emit ('queue-progress', scope, thisQueue.pos, thisQueue.length);
			this.runCmd (scope);
		}).bind (this);


		var cmdMeta = thisQueue[thisQueue.pos + 1];
		var cmd     = cmdMeta[0];
		var cmdCb   = cmdMeta[1];
		var cmdDesc = cmdMeta[2];

		// assume shell command
		if (cmd.constructor === String) {
			if (cmdDesc) {
				this.emit ('log', scope, cmdDesc);
			}

			var child = exec (cmd, (function (error, stdout, stderr) {
				// The callback gets the arguments (error, stdout, stderr).
				// On success, error will be null. On error, error will be an instance
				// of Error and error.code will be the exit code of the child process,
				// and error.signal will be set to the signal that terminated the process.
				// console.log('stdout: ' + stdout);
				// console.log('stderr: ' + stderr);
				if (error !== null) {
					error.scope  = scope;
					error.cmd    = cmd;
					error.stderr = stderr;
					this.emit ('error', error);
//					console.log ('******************', scope.toUpperCase(), cmd);
//					console.log ('******************', scope.toUpperCase(), 'exec error: ', error, 'stderr', stderr);
				}
				if (cmdCb) {
					cmdCb (error, stdout, stderr);
				}

				cb (error);
			}).bind (this));

		} else if (cmd.io) {
			cmd.done (function (err) {
				if (err !== null) {
					console.log('!!!!!!!!!!!!!!!!!!!!!!!!!', 'exec error: ', err);
				}
				cb (err);
			});
		}
	}

}

ArduinoCompiler.prototype.getConfig = function () {
	// speed doesn't matter here
	return JSON.parse (JSON.stringify (this.config));
}

ArduinoCompiler.prototype.setLibNames = function (libNames) {
	if (!this.libCompile)
		this.libCompile = {};
	// TODO: analyse source
	var self = this;
	if (libNames.constructor !== Array) {
		libNames = Object.keys (libNames);
	}
	if (!libNames.length)
		return;
//	console.log (libNames);
	libNames.forEach ((function (libName) {
		if (this.libCompile[libName])
			return;

		var libMeta = Arduino.findLib (this.platformId, libName);
		if (!libMeta || !libMeta.root) {
			console.log ('cannot find library', libName);
		}

//		console.log ('found lib', libName);

		// requirement by requirement not supported
		for (var req in libMeta.requirements) {
			var libMeta2 = Arduino.findLib (this.platformId, req);
			if (!libMeta2 || !libMeta2.root) {
				// console.log ('cannot find library', req);
			} else if (!this.libCompile[req]) {
				this.libCompile[req] = libMeta2;
			}

		}

		this.libCompile[libName] = libMeta;
		// libIncludes.push (libDir.root);
	}).bind (this));

	// we can compile libs, core and current sources at same time
	// in a ideal case this is 3x speedup
	// also, core do not need a rebuild

	var conf = this.getConfig ();

	// console.log (Object.keys (this.libCompile));

	var allIncludes = [];

	// TODO: add any library found in included source files
	for (var libName in this.libCompile) {
		allIncludes.push (this.libCompile[libName].include);
	}

//	console.log (allIncludes);

	for (var libName in this.libCompile) {
		var libMeta = this.libCompile[libName];

		if (libMeta.processed) {
			continue;
		}

		this.libCompile[libName].processed = true;

		var libIncludes = [""].concat (this.coreIncludes, allIncludes).join (" -I")
		+ ' -I' + libMeta.include
		+ (libMeta.version === '1.5' ? '' : ' -I' + libMeta.include + '/utility');

//		console.log (libIncludes);

		for (var libSrcFile in libMeta.files) {
			if (!libSrcFile.match (/\.c(pp)?$/))
				continue;
			var ext = libSrcFile.substring (libSrcFile.lastIndexOf ('.')+1);
			var localName = libSrcFile.substring (libSrcFile.lastIndexOf ('/') + 1, libSrcFile.lastIndexOf ('.'));
			conf.source_file = path.join (libMeta.root, libSrcFile);
			// TODO: build dir
//			console.log (libSrcFile);
			conf.object_file = path.join (this.buildFolder, libName, localName + '.o');
			conf.includes    = libIncludes;

			var compileCmd   = common.replaceDict (this.platform.recipe[ext].o.pattern, conf, null, "platform.recipe."+ext+".o.pattern");

			this.enqueueCmd ('mkdir', this.ioMkdir (path.join (this.buildFolder, libName)));

			var cmdDesc = ["compile", libName, libSrcFile].join (" ");
			this.enqueueCmd ('libs', compileCmd, null, cmdDesc);

			this.objectFiles.push (conf.object_file);

			if (Arduino.verbose)
				console.log (compileCmd);

		}
	}

	this.emit ('includes-set');
}

ArduinoCompiler.prototype.setCoreFiles = function (err, coreFileList) {
	if (err) {
		console.log (err);
		this.error = 'core.files';
		return;
	}

	var conf = this.getConfig ();

	Object.keys (coreFileList).forEach ((function (srcFile) {
		var ext = srcFile.substring (srcFile.lastIndexOf ('.')+1);
		var localName = srcFile.substring (srcFile.lastIndexOf ('/') + 1, srcFile.lastIndexOf ('.'));
		conf.source_file = srcFile;
		// TODO: build dir
		conf.object_file = path.join (this.buildFolder, 'core', localName + '.o');
		conf.includes = [""].concat (this.coreIncludes).join (" -I");
		var compileCmd = common.replaceDict (this.platform.recipe[ext].o.pattern, conf, null, "platform.recipe."+ext+".o.pattern");

		this.enqueueCmd ('mkdir', this.ioMkdir (path.join (this.buildFolder, 'core')));

		var cmdDesc = ['compile', this.platformId, localName + '.' + ext].join (" ");
		this.enqueueCmd ('core', compileCmd, null, cmdDesc);

		conf.archive_file = 'core.a';
		var archiveCmd = common.replaceDict (this.platform.recipe.ar.pattern, conf, null, "platform.recipe.ar.pattern");

		cmdDesc = ['archive', this.platformId, localName + '.' + ext].join (" ");
		this.enqueueCmd ('core', archiveCmd, null, cmdDesc);

		if (Arduino.verbose)
			console.log (compileCmd);
	}).bind (this));

	// after all, we need to make core.a file
}

ArduinoCompiler.prototype.processSketch = function () {
	var conf = this.getConfig ();

	Object.keys (this.sketchFiles).forEach ((function (srcFile) {
		var ext = srcFile.substring (srcFile.lastIndexOf ('.') + 1);
		var localName = srcFile.substring (srcFile.lastIndexOf ('/') + 1, srcFile.lastIndexOf ('.'));
		conf.source_file = srcFile;
		conf.object_file = path.join (this.buildFolder, localName + '.o');

		var allIncludes = [];

		// TODO: add any library found in included source files
		for (var libName in this.libCompile) {
			allIncludes.push (this.libCompile[libName].include);
		}

		var includes = [""].concat (this.coreIncludes, allIncludes).join (" -I");
		conf.includes = includes;

		if (!(ext in this.platform.recipe))
			return;

		var compileCmd = common.replaceDict (this.platform.recipe[ext].o.pattern, conf, null, "platform.recipe."+ext+".o.pattern");

		// this.enqueueCmd ('mkdir', this.ioMkdir (this.buildFolder));

		var cmdDesc = ["compile", localName + '.' + ext].join (" ");
		this.enqueueCmd ('project', compileCmd, null, cmdDesc);

		this.objectFiles.push (conf.object_file);

		if (Arduino.verbose)
			console.log (compileCmd);

	}).bind (this));

}

ArduinoCompiler.prototype.setSketchFile = function (srcFile) {

	if (!this.sketchFiles) {
		this.sketchFiles = {};
	}

	this.sketchFiles[srcFile] = true;

}

ArduinoCompiler.prototype.setProjectFiles = function (err, files, dontCompile) {
	if (err) {
		// TODO: what errors we expects here, what's error recovery strategy?
		console.log (err);
		return;
	}

	// ok, we just got sources. now, we need to find libs from .h,
	// copy all sources to the build folder and generate cpp from ino/pde file

	// TODO: if we found any ino files, symlinked onto cpp file, ignore that cpp
	// this is a RepRap config

	Object.keys (files).forEach ((function (fileName) {
		var fileObject = files[fileName];
		var extname = path.extname (fileName).substring (1);
		if (
			extname === 'cpp'
			&& (this.projectName + '.' + extname) === fileName
		) {
			var inoFile = files[this.projectName + '.ino'] || files[this.projectName + '.pde'];
			if (
				inoFile.stat.isSymbolicLink()
				&& inoFile.linkedTo === fileName
			) {
				// nothing to do, horrible project configuration
			}
			return;
		}
		if (extname.match (/^(c|cpp|h|ino|pde)$/)) {
			this.filePreProcessor (fileName);
		}

	}).bind(this));

// TODO
	//	if (!this.libIncludes) {
//		this.on ('includes-set', this.processProjectFiles.bind (this));
//	} else {
//		this.processProjectFiles();
//	}
}

ArduinoCompiler.prototype.filePreProcessor = function (fileName) {
	var extname = path.extname (fileName).substring (1);
	if (extname === 'ino' || extname === 'pde') {
		this.processIno (fileName);
	} else if (extname.match (/c(?:pp)?|h/)) {
		this.processCpp (fileName);
	}
}

ArduinoCompiler.prototype.processIno = function (inoFile) {
	// read ino
	fs.readFile (inoFile, (function (err, data) {
		if (err) {
			this.emit ('error', 'project', ['file read failed', inoFile, err.code].join (' '));
//			console.log ('read failed', err);
			cb (err);
			return;
		}
		var inoContents = data.toString ();

		// search for libraries
		var libNames = Arduino.parseLibNames (inoContents, this.platformId);
		// search for a function declarations

		if (libNames.length) {
//			console.log (path.relative (this.sketchFolder, inoFile), 'contains libs', libNames);
		}

		var commentOrInstruction = /\s*(\/\*[\s\S]*?\*\/|\/\/[^\n\r]*|#[^#\n\r]*)/gm;

		var funcs        = [];
		var instructions = [];
		var comments     = [];
		var matchArray   = [];

		var firstStatementOffset;
		var lastMatchOffset;

		var lastInstructionOffset = 0;
		var ifInstruction         = 0;
		var ifInstructionOffset   = 0;

		while ((matchArray = commentOrInstruction.exec (inoContents)) !== null) {
			//		console.log (matchArray.index, lastMatchOffset, matchArray[1]);
			if (
				lastMatchOffset !== undefined &&
				lastMatchOffset !== matchArray.index &&
				firstStatementOffset === undefined
			) {
				// first statement found. but this statement can be within #ifdef
				if (ifInstruction > 0) {
					firstStatementOffset = ifInstructionOffset;
				} else {
					firstStatementOffset = lastInstructionOffset;
				}
			}

			lastMatchOffset = matchArray.index + matchArray[0].length;

			if (matchArray[1][0] === '/') {
				comments.push ([matchArray.index, matchArray.index + matchArray[0].length]);
			} else {
				if (matchArray[1].match (/#ifdef/)) {
					ifInstruction ++;
					if (ifInstruction === 1) {
						ifInstructionOffset = matchArray.index;
					}
				} else if (matchArray[1].match (/#endif/)) {
					ifInstruction --;
				}
				instructions.push ([matchArray.index, matchArray.index + matchArray[0].length]);
				lastInstructionOffset = matchArray.index + matchArray[0].length;
			}
		}

		// we found comments and instructions

		var functionRe = /^[\s\n\r]*((unsigned|signed|static)[\s\n\r]+)?(void|int|char|short|long|float|double|word)[\s\n\r]+(\w+)[\s\n\r]*\(([^\)]*)\)[\s\n\r]*\{/gm;
		while ((matchArray = functionRe.exec (inoContents)) !== null) {
			// matchArray.index
			funcs.push ([(matchArray[1] || "") + matchArray[3], matchArray[4], '('+matchArray[5]+')'].join (" "));
			//			console.log (matchArray[1] || "", matchArray[3], matchArray[4], '(', matchArray[5], ');');
		}

		// write temp file:

		// TODO: copy all of .h files from sketch and then generate main file in buildFolder
		// instead of sketchFolder
//		console.log (this.buildFolder, '_' + this.projectName + '_generated.cpp');
		var projectFile = path.join (this.buildFolder, '_' + this.projectName + '_generated.cpp');
		fs.writeFile (
			projectFile,
			[inoContents.substr (0, firstStatementOffset),
			"\n#include \"Arduino.h\"\n" + funcs.join (";\n") + ";",
			inoContents.substr (firstStatementOffset)].join ("\n"),
			(function (err, done) {
				if (err) {
					this.emit ('error', 'project', ['file write failed', projectFile, err.code].join (' '));
//					console.log ('cannot write to the ', inoFile);
					return;
				}
				// this.setProjectFiles (null, [projectFile], true);
				this.setLibNames (libNames);
				this.setSketchFile (projectFile);
		}).bind (this));



		// function declarations
		// actual ino file contents
	}).bind (this));

}

ArduinoCompiler.prototype.processCpp = function (cppFile) { // also for a c, h files
	// read file

	fs.readFile (cppFile, (function (err, data) {
		if (err) {
//			console.log ('read failed', err);
			this.emit ('error', 'project', ['file read failed', cppFile, err.code].join (' '));
			cb (err);
			return;
		}

		var cppContents = data.toString ();

		// search for libraries
		var libNames = Arduino.parseLibNames (cppContents, this.platformId);
		// search for a function declarations

//		if (libNames.length)
//			console.log (path.relative (this.sketchFolder, cppFile), 'contains libs', libNames);


//		var functions = [];
//
//		var matchArray = [];
//
//		var functionRe = /^[\s\n\r]*((unsigned|signed|static)[\s\n\r]+)?(void|int|char|short|long|float|double|word)[\s\n\r]+(\w+)[\s\n\r]*\(([^\)]*)\)[\s\n\r]*\{/gm;
//		while ((matchArray = functionRe.exec(inoContents)) !== null) {
//			functions.push ([matchArray[1] || "", matchArray[3], matchArray[4], '('+matchArray[5]+')'].join (" "));
//			//			console.log (matchArray[1] || "", matchArray[3], matchArray[4], '(', matchArray[5], ');');
//		}

		// TODO: create subdirs if any
		var cppRelPath = path.relative (this.sketchFolder, cppFile);
		var cppFolder = path.join (this.buildFolder, path.dirname (cppRelPath));


		// TODO: something wrong: mkdirParent not working
		mkdirParent (cppFolder, (function (err) {
			if (err && err.code !== 'EEXIST') {
//				console.trace ('cannot create folder', cppFolder, err.code);
				this.emit ('error', 'mkdir', ['cannot create folder', cppFolder, err.code].join (' '));
				return;
			}
			var sourceFile = path.join (this.buildFolder, cppRelPath);
			fs.writeFile (
				sourceFile,
				cppContents,
				(function (err, done) {
					if (err) {
						console.log ('cannot write to the ', sourceFile);
						return;
					}
					// this.setProjectFiles (null, [projectFile], true);
					this.setLibNames (libNames);

					this.setSketchFile (sourceFile);
				}).bind (this));



			// function declarations
			// actual ino file contents

		}).bind (this));
	}).bind (this));

	// search for libraries
	// write file to the build directory
}



/*

		// Java Compiler version 1.5.7

		// TODO: Make the --relax thing in configuration files.

		// For atmega2560, need --relax linker option to link larger
		// programs correctly.
		String optRelax = "";
		if (prefs.get("build.mcu").equals("atmega2560"))
			optRelax = ",--relax";

		String flags = dict.get("compiler.c.elf.flags") + optRelax;
		dict.put("compiler.c.elf.flags", flags);
		*/


ArduinoCompiler.prototype.linkAll = function () {

	var conf = this.getConfig ();

	conf.archive_file = 'core.a';

	conf.object_files = '"' + this.objectFiles.join ("\" \"") + '"';
	//		dict.put("ide_version", "" + Base.REVISION);

	var linkCmd = common.replaceDict (this.platform.recipe.c.combine.pattern, conf, null, "platform.recipe.c.combine.pattern");
	this.enqueueCmd ('link', linkCmd, null, 'all together');

	if (Arduino.verbose)
		console.log (linkCmd);

}

ArduinoCompiler.prototype.objCopy = function () {
	var conf = this.getConfig ();

	var eepCmd = common.replaceDict (this.platform.recipe.objcopy.eep.pattern, conf, null, "platform.recipe.objcopy.eep.pattern");
	this.enqueueCmd ('obj-eep', eepCmd, null, 'objcopy eep');

	var hexCmd = common.replaceDict (this.platform.recipe.objcopy.hex.pattern, conf, null, "platform.recipe.objcopy.hex.pattern");
	this.enqueueCmd ('obj-hex', hexCmd, null, 'objcopy hex');
}

ArduinoCompiler.prototype.checkSize = function () {
	var conf = this.getConfig ();

	var sizeCmd = common.replaceDict (this.platform.recipe.size.pattern, conf, null, "platform.recipe.size.pattern");
	var sizeRegexp = new RegExp (this.platform.recipe.size.regex.toString (), 'gm');
	var sizeDataRegexp, sizeEepromRegexp;
	if (this.platform.recipe.size.regex.data)
		sizeDataRegexp = new RegExp (this.platform.recipe.size.regex.data.toString (), 'gm');
	if (this.platform.recipe.size.regex.eeprom)
		sizeEepromRegexp = new RegExp (this.platform.recipe.size.regex.eeprom.toString (), 'gm');
	this.enqueueCmd ('size', sizeCmd, (function (error, stdout, stderr) {
		// console.log ('[size]', stdout);
		var size = 0, sizeData = 0, sizeEeprom = 0;
		var matches;
		while ((matches = sizeRegexp.exec (stdout)) !== null) {
			size += parseInt (matches[1]);
		}
		if (sizeDataRegexp)
			while ((matches = sizeDataRegexp.exec (stdout)) !== null) {
				sizeData += parseInt (matches[1]);
			}
		if (sizeEepromRegexp)
			while ((matches = sizeEepromRegexp.exec (stdout)) !== null) {
				sizeEeprom += parseInt (matches[1]);
			}
		// console.log (sizeRegexp.exec (stdout));
		this.emit ('log', 'size', ['text', size, 'data', sizeData, 'eeprom', sizeEeprom].join (' '));
//		console.log ('[size]', 'text', size, 'data', sizeData, 'eeprom', sizeEeprom);

		this.compiledSize = {
			text: size,
			maxText: parseInt (conf.upload.maximum_size.toString ()),
			data: sizeData,
			maxData: parseInt (conf.upload.maximum_data_size.toString ()),
			eeprom: sizeEeprom
		};
	}).bind(this), 'determine compiled size');

}


function mkdirParent (dirPath, mode, callback) {
	//Call the standard fs.mkdir
	fs.mkdir(dirPath, mode, function(error) {
		//When it fail in this way, do the custom steps
//		console.log (error && error.code);
		if (error && error.code === 'ENOENT') {
			//Create all the parents recursively
			mkdirParent (path.dirname (dirPath), mode, function (err) {
				//And then the directory
				mkdirParent (dirPath, mode, callback);
			});
			return;
		}
		//Manually run the callback since we used our own callback to do all these
		callback && callback(error);
	});
};

module.exports = ArduinoCompiler;
