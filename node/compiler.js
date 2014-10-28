var Arduino;

var path = require ('path');
var util = require ('util');
var fs   = require ('fs');

var exec = require ('child_process').exec;

var EventEmitter = require ('events').EventEmitter;

function ArduinoCompiler (buildDir, boardsData, platformId, boardId, menus) {

	if (!Arduino)
		Arduino = require ('./arduino');

	var platform = boardsData.platform;
	var board = JSON.parse (JSON.stringify (boardsData.boards[boardId]));

	var boardBuild = board.build;

	this.boardsData = boardsData;

	this.platformId = platformId;

	// TODO: replace by temporary folder
	this.buildDir = buildDir || '';

	this.platform = platform;

	this.objectFiles = [];

	this.coreIncludes = [
		boardsData.folders.root + '/cores/' + board.build.core,
		boardsData.folders.root + '/variants/' + board.build.variant
	];

	"upload bootloader build".split (" ").forEach (function (stageName) {
		for (var menuKey in menus) {
			var fixup = board.menu[menuKey][menus[menuKey]];
			if (!fixup[stageName])
				return;
			for (var stageKey in fixup[stageName]) {
				board[stageName][stageKey] = fixup[stageName][stageKey];
			}
		}
	});


	// build stage
	var currentStage = "build";

	var conf = JSON.parse (JSON.stringify (platform));
	pathToVar (conf, 'runtime.ide.path', Arduino.instance.runtimeDir);
	pathToVar (conf, 'runtime.ide.version', "158");
	pathToVar (conf, 'build.path', this.buildDir);

	conf.compiler.path = conf.compiler.path.replaceDict (conf);

	for (var buildK in board.build) {
		conf.build[buildK] = board.build[buildK];
	}

	pathToVar (conf, 'build.arch', platformId.split ('/')[1].toUpperCase ());

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
}

util.inherits (ArduinoCompiler, EventEmitter);

ArduinoCompiler.prototype.setProjectName = function (name) {
	pathToVar (this.config, 'build.project_name', name);
	this.projectName = name;

}

ArduinoCompiler.prototype.runNext = function (scope, pos, length) {
	console.log ('['+scope+']', 'done', (pos+1)+'/'+length);
	this.runNext.done[scope] = true;

	if (scope === 'size') {
		console.log ('COMPILATION COMPLETE!');
//		console.log (this.platform.recipe.size.regex.data.toString ());
//		console.log (this.platform.recipe.size.regex.eeprom.toString ());
		this.emit ('compiled', this.compiledSize);
	} else if (scope === 'obj-eep' || scope === 'obj-hex') {
		// whe we achieved obj-* stage, no more steps remaining
		if (this.runNext.done['obj-eep'] && this.runNext.done['obj-hex']) {
			this.checkSize ();
		}
	} else if (this.runNext.done['link']) {
		this.objCopy ();
	} else if (this.runNext.done['core'] && this.runNext.done['libs'] && this.runNext.done['project']) {
		// TODO: anything else
		this.linkAll ();
	}
}

ArduinoCompiler.prototype.runNext.done = {};

ArduinoCompiler.prototype.ioMkdir = function (folder) {

	var result = {
		io: true,
		cb: [],
		done: function (cb) {
			if (cb)
				this.cb.push (cb);
			if (!this.ready) {
				return;
			}
			var allCb = this.cb;
			this.cb = [];
			allCb.forEach ((function (theCb) {
				theCb (this.error);
			}).bind(this));
		}
	};

	function callback (err, done) {
		result.error = err;
		if (err && err.code === 'EEXIST') {
			result.error = null;
		}
		result.ready = true;
		result.done ();
	}

	fs.mkdirParent (folder, null, callback);

	return result;
}

ArduinoCompiler.prototype.enqueueCmd = function (scope, cmdLine, cb) {
	if (!this.enqueueCmd.queue[scope])
		this.enqueueCmd.queue[scope] = {length: 0, pos: -1, running: false};
	var thisQueue = this.enqueueCmd.queue[scope];
	thisQueue[thisQueue.length++] = [cmdLine, cb];
	this.runCmd (scope);
//	console.log (cmdLine);
}

ArduinoCompiler.prototype.enqueueCmd.queue = {};

ArduinoCompiler.prototype.runCmd = function (scope) {
	var thisQueue = this.enqueueCmd.queue[scope];
	if (thisQueue.pos + 1 === thisQueue.length) {
		// TODO: emit done
		this.emit ('queue-completed', scope);
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


		var cmdDesc = thisQueue[thisQueue.pos + 1];
		var cmd = cmdDesc[0];

		// assume shell command
		if (cmd.constructor === String) {
			var child = exec(cmd, function (error, stdout, stderr) {
				// The callback gets the arguments (error, stdout, stderr).
				// On success, error will be null. On error, error will be an instance
				// of Error and error.code will be the exit code of the child process,
				// and error.signal will be set to the signal that terminated the process.
				// console.log('stdout: ' + stdout);
				// console.log('stderr: ' + stderr);
				if (error !== null) {
					console.log ('******************', scope.toUpperCase(), cmd);
					console.log ('******************', scope.toUpperCase(), 'exec error: ', error, 'stderr', stderr);
				}
				cb (error);
				if (cmdDesc[1]) {
					cmdDesc[1] (error, stdout, stderr);
				}
			});

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
	this.libNames = libNames;
	if (!this.libIncludes)
		this.libIncludes = [];
	if (!this.libCompile)
		this.libCompile = {};
	// TODO: analyse source
	var self = this;
	libNames.forEach ((function (libName) {
		var libMeta = Arduino.instance.findLib (this.platformId, libName);
		if (!libMeta || !libMeta.root) {
			console.log ('cannot find library', libName);
		}
		this.libCompile[libName] = libMeta;
		// libIncludes.push (libDir.root);
	}).bind (this));

	// we can compile libs, core and current sources at same time
	// in a ideal case this is 3x speedup
	// also, core do not need a rebuild

	var conf = this.getConfig ();

	// console.log (Object.keys (this.libCompile));

	// TODO: add any library found in included source files
	for (var libName in this.libCompile) {
		this.libIncludes.push (this.libCompile[libName].root);
	}

	for (var libName in this.libCompile) {
		var libMeta = this.libCompile[libName];
		var libIncludes = [""].concat (this.coreIncludes, this.libIncludes).join (" -I")
		+ ' -I' + libMeta.root
		+ ' -I' + libMeta.root + '/utility';
		for (var libSrcFile in libMeta.files) {
			if (!libSrcFile.match (/\.c(pp)?$/))
				continue;
			var ext = libSrcFile.substring (libSrcFile.lastIndexOf ('.')+1);
			var localName = libSrcFile.substring (libSrcFile.lastIndexOf ('/') + 1, libSrcFile.lastIndexOf ('.'));
			conf.source_file = path.join (libMeta.root, libSrcFile);
			// TODO: build dir
//			console.log (libSrcFile);
			conf.object_file = path.join (this.buildDir, libName, localName + '.o');
			conf.includes    = libIncludes;
			var compileCmd   = this.platform.recipe[ext].o.pattern.replaceDict (conf);
			console.log ('[libs]', libName, '>', path.join (libName, libSrcFile));
			this.enqueueCmd ('mkdir', this.ioMkdir (path.join (this.buildDir, libName)));
			this.enqueueCmd ('libs', compileCmd);

			this.objectFiles.push (conf.object_file);

			if (Arduino.instance.verbose)
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

	var archiveCmds = [];

	coreFileList.forEach ((function (srcFile) {
		var ext = srcFile.substring (srcFile.lastIndexOf ('.')+1);
		var localName = srcFile.substring (srcFile.lastIndexOf ('/') + 1, srcFile.lastIndexOf ('.'));
		conf.source_file = srcFile;
		// TODO: build dir
		conf.object_file = path.join (this.buildDir, 'core', localName + '.o');
		conf.includes = [""].concat (this.coreIncludes).join (" -I");
		var compileCmd = this.platform.recipe[ext].o.pattern.replaceDict (conf);
		console.log ('[core]', srcFile);
		this.enqueueCmd ('mkdir', this.ioMkdir (path.join (this.buildDir, 'core')));
		this.enqueueCmd ('core', compileCmd);

		conf.archive_file = 'core.a';
		var archiveCmd = this.platform.recipe.ar.pattern.replaceDict (conf);
		archiveCmds.push (archiveCmd);

		if (Arduino.instance.verbose)
			console.log (compileCmd);
	}).bind (this));

	archiveCmds.forEach ((function (archiveCmd) {
		this.enqueueCmd ('core', archiveCmd);

		if (Arduino.instance.verbose)
			console.log (archiveCmd);
	}).bind(this));

	// after all, we need to make core.a file
}

ArduinoCompiler.prototype.processProjectFiles = function () {

	var conf = this.getConfig ();

	var uniqueProjectFiles = [];
	this.projectFiles.sort ().forEach (function (item, pos) {
		if (uniqueProjectFiles[uniqueProjectFiles.length - 1] !== item)
			uniqueProjectFiles.push (item);
	})

	uniqueProjectFiles.forEach ((function (srcFile) {

		var ext = srcFile.substring (srcFile.lastIndexOf ('.') + 1);
		var localName = srcFile.substring (srcFile.lastIndexOf ('/') + 1, srcFile.lastIndexOf ('.'));
		conf.source_file = srcFile;
		conf.object_file = path.join (this.buildDir, localName + '.o');
		var includes = [""].concat (this.coreIncludes, this.libIncludes).join (" -I");
		conf.includes = includes;

		var compileCmd = this.platform.recipe[ext].o.pattern.replaceDict (conf);
		console.log ('[project]', srcFile);
		this.enqueueCmd ('mkdir', this.ioMkdir (this.buildDir));
		this.enqueueCmd ('project', compileCmd);

		this.objectFiles.push (conf.object_file);

		if (Arduino.instance.verbose)
			console.log (compileCmd);
	}).bind (this));

}

ArduinoCompiler.prototype.setProjectFiles = function (err, files, dontCompile) {
	if (err) {
		console.log (err);
		return;
	}

	if (!this.projectFiles)
		this.projectFiles = [];
	this.projectFiles = this.projectFiles.concat (files);

	if (dontCompile)
		return;

	if (!this.libIncludes) {
		this.on ('includes-set', this.processProjectFiles.bind (this));
	} else {
		this.processProjectFiles();
	}
}

ArduinoCompiler.prototype.linkAll = function () {

	var conf = this.getConfig ();

	this.objectFiles.forEach ((function (fileName) {

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

		var conf = this.getConfig ();

		conf.archive_file = 'core.a';
		conf.object_files = '"' + this.objectFiles.join ("\" \"") + '"';
//		dict.put("ide_version", "" + Base.REVISION);

		var linkCmd = this.platform.recipe.c.combine.pattern.replaceDict (conf);
		this.enqueueCmd ('link', linkCmd);

		if (Arduino.instance.verbose)
			console.log (linkCmd);
	}).bind (this));
}

ArduinoCompiler.prototype.objCopy = function () {
	var conf = this.getConfig ();

	var eepCmd = this.platform.recipe.objcopy.eep.pattern.replaceDict (conf);
	this.enqueueCmd ('obj-eep', eepCmd);

	var hexCmd = this.platform.recipe.objcopy.hex.pattern.replaceDict (conf);
	this.enqueueCmd ('obj-hex', hexCmd);
}

ArduinoCompiler.prototype.checkSize = function () {
	var conf = this.getConfig ();

	var sizeCmd = this.platform.recipe.size.pattern.replaceDict (conf);
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
		console.log ('[size]', 'text', size);
		console.log ('[size]', 'data', sizeData);
		console.log ('[size]', 'eeprom', sizeEeprom);
		this.compiledSize = {
			text: size,
			data: sizeData,
			eeprom: sizeEeprom
		};
	}).bind(this));

	console.log (this.platform.recipe.size.regex.data.toString ());
	console.log (this.platform.recipe.size.regex.eeprom.toString ());

}


fs.mkdirParent = function(dirPath, mode, callback) {
	//Call the standard fs.mkdir
	fs.mkdir(dirPath, mode, function(error) {
		//When it fail in this way, do the custom steps
		if (error && error.code === 'ENOENT') {
			//Create all the parents recursively
			fs.mkdirParent(path.dirname(dirPath), mode, callback);
			//And then the directory
			fs.mkdirParent(dirPath, mode, callback);
		}
		//Manually run the callback since we used our own callback to do all these
		callback && callback(error);
	});
};


// TODO: remove method for core object
String.prototype.replaceDict = function (conf) {
	return this.replace (/{(\w+\.)*\w+}/g, function (match) {
		var varPath = match.substring (1, match.length - 1);
		var result = pathToVar (conf, varPath);
		if (result === undefined) {
			throw "no interpolation found for "+varPath
		} else if (result.constructor !== String && result.constructor !== Number) {
			throw "bad type for interpolate \'"+varPath + '\': ' + util.inspect (result)
		}

			return result;
	})
}

function pathToVar (root, varPath, value) {
	varPath.split ('.').forEach (function (chunk, index, chunks) {
		// pathChunks[index] = chunk;
		var newRoot = root[chunk];
		if (index === chunks.length - 1) {
			if (value !== undefined)
				root[chunk] = value;
		} else if (!newRoot) {
			root[chunk] = {};
			newRoot = root[chunk];
		}
		root = newRoot;
	});
	return root;
}

module.exports = ArduinoCompiler;
