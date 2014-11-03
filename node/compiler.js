var Arduino;

var path = require ('path');
var util = require ('util');
var fs   = require ('fs');

var exec = require ('child_process').exec;

var EventEmitter = require ('events').EventEmitter;

function ArduinoCompiler (buildDir, boardsData, platformId, boardId, boardVariant) {

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
	pathToVar (conf, 'runtime.ide.path', Arduino.instance.runtimeDir);
	// TODO: get version from mac os x bundle or from windows revisions.txt
	pathToVar (conf, 'runtime.ide.version', "158");
	pathToVar (conf, 'build.path', this.buildDir);

	conf.compiler.path = replaceDict (conf.compiler.path, conf);

	"upload bootloader build".split (" ").forEach (function (stageName) {
		for (var buildK in board[stageName]) {
			if (!conf[stageName])
				conf[stageName] = {};
			conf[stageName][buildK] = board[stageName][buildK];
		}
	});

//	pathToVar (conf, 'build.arch', platformId.split ('/')[1]);
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

	this._done = {};
	this._queue = {};
}

util.inherits (ArduinoCompiler, EventEmitter);

ArduinoCompiler.prototype.setProjectName = function (name) {
	pathToVar (this.config, 'build.project_name', name);
	this.projectName = name;

}

ArduinoCompiler.prototype.runNext = function (scope, pos, length) {
	console.log ('['+scope+']', 'done', (pos+1)+'/'+length);
	this._done[scope] = true;

	if (scope === 'size') {
		console.log ('COMPILATION COMPLETE!');
//		console.log (this.platform.recipe.size.regex.data.toString ());
//		console.log (this.platform.recipe.size.regex.eeprom.toString ());
		this.emit ('compiled', this.compiledSize);
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
	}
}

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

ArduinoCompiler.prototype.enqueueCmd = function (scope, cmdLine, cb, description) {
	if (!this._queue[scope])
		this._queue[scope] = {length: 0, pos: -1, running: false};
	var thisQueue = this._queue[scope];
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
				this.emit ('log', '[' + scope + '] ' + cmdDesc);
			}

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
				if (cmdCb) {
					cmdCb (error, stdout, stderr);
				}
				cb (error);
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
			var compileCmd   = replaceDict (this.platform.recipe[ext].o.pattern, conf);

			this.enqueueCmd ('mkdir', this.ioMkdir (path.join (this.buildDir, libName)));

			var cmdDesc = [libName, '>', path.join (libName, libSrcFile)].join (" ");
			this.enqueueCmd ('libs', compileCmd, null, cmdDesc);

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
		var compileCmd = replaceDict (this.platform.recipe[ext].o.pattern, conf);

		this.enqueueCmd ('mkdir', this.ioMkdir (path.join (this.buildDir, 'core')));

		var cmdDesc = ['compile', srcFile].join (" ");
		this.enqueueCmd ('core', compileCmd, null, cmdDesc);

		conf.archive_file = 'core.a';
		var archiveCmd = replaceDict (this.platform.recipe.ar.pattern, conf);

		cmdDesc = ['archiving', srcFile].join (" ");
		this.enqueueCmd ('core', archiveCmd, null, cmdDesc);
//		archiveCmds.push (archiveCmd);

		if (Arduino.instance.verbose)
			console.log (compileCmd);
	}).bind (this));

	console.log (archiveCmds);

	archiveCmds.forEach ((function (archiveCmd) {
//		this.enqueueCmd ('core', archiveCmd, null, 'archiving core');

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

		var compileCmd = replaceDict (this.platform.recipe[ext].o.pattern, conf);

		this.enqueueCmd ('mkdir', this.ioMkdir (this.buildDir));

		var cmdDesc = [srcFile].join (" ");
		this.enqueueCmd ('project', compileCmd, null, cmdDesc);

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

	var linkCmd = replaceDict (this.platform.recipe.c.combine.pattern, conf);
	this.enqueueCmd ('link', linkCmd, null, 'all together');

	if (Arduino.instance.verbose)
		console.log (linkCmd);

}

ArduinoCompiler.prototype.objCopy = function () {
	var conf = this.getConfig ();

	var eepCmd = replaceDict (this.platform.recipe.objcopy.eep.pattern, conf);
	this.enqueueCmd ('obj-eep', eepCmd, null, 'objcopy eep');

	var hexCmd = replaceDict (this.platform.recipe.objcopy.hex.pattern, conf);
	this.enqueueCmd ('obj-hex', hexCmd, null, 'objcopy hex');
}

ArduinoCompiler.prototype.checkSize = function () {
	var conf = this.getConfig ();

	var sizeCmd = replaceDict (this.platform.recipe.size.pattern, conf);
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
		console.log ('[size]', 'text', size, 'data', sizeData, 'eeprom', sizeEeprom);

		this.compiledSize = {
			text: size,
			maxText: parseInt (conf.upload.maximum_size.toString ()),
			data: sizeData,
			maxData: parseInt (conf.upload.maximum_data_size.toString ()),
			eeprom: sizeEeprom
		};
	}).bind(this), 'determine compiled size');

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

function replaceDict (str, conf, count) {
	if (count !== undefined && count > 2) {
		throw "command still needs interpolation after 3 replacements:" + str;
	}
	var replacementRe = /{(\w+\.)*\w+}/g;
	var replacement = str.replace (replacementRe, function (match) {
		var varPath = match.substring (1, match.length - 1);
		var result = pathToVar (conf, varPath);
		if (result === undefined) {
			throw "no interpolation found for "+varPath
		} else if (result.constructor !== String && result.constructor !== Number) {
			throw "bad type for interpolate \'"+varPath + '\': ' + util.inspect (result)
		}

		return result;
	});

	if (replacement.match (replacementRe)) {
		replacement = replaceDict (replacement, conf, count === undefined ? 1 : count + 1)
	}

	return replacement;
}

// TODO: copypasted from arduino#parseConfig
function pathToVar (root, varPath, value) {
	var refs = varPath.split('.');

	for (var i = 0; i < refs.length; i ++) {
		var sec = refs[i];
		if (value !== undefined) {
			if (!root[sec]) {
				root[sec] = {};
			}
			if (i === refs.length - 1) {
				root[sec] = new String (value);

			}
		}
		if (root.constructor === String) {
			console.log ("bad config for:", varPath, root[sec].toString ());
		}
		root = root[sec];
	}
	return root;
}

module.exports = ArduinoCompiler;
