"use strict";

var os     = require("os");
var fs     = require('fs');
var path   = require ('path');
var util   = require ('util');
var crypto = require('crypto');

function prepareEnv () {
	var env = {};
	Object.keys (process.env).forEach (function (envName) {
		env[envName] = process.env[envName];
	});

	var pathKey = 'PATH' in env ? 'PATH' : 'Path';

	if (os.platform () === 'win32') {
	env[pathKey] = [].concat (
		[].slice.apply (arguments),
		env[pathKey]
	).join (path.delimiter);
		env.CYGWIN = 'nodosfilewarning';
	}
	return env;
}

function pathToVar (root, varPath, value) {
	var refs;
	if (varPath.constructor === Array) {
		refs = varPath;
		varPath = refs.join ('.');
	} else {
		refs = varPath.split('.');
	}

	if (varPath.match (/\.build\.mcu$/) && value === "atmega2560") {
		// TODO: fill an issue on github for this:
//		// For atmega2560, need --relax linker option to link larger
//		java/Compiler.java:    if (prefs.get("build.mcu").equals("atmega2560"))
		// TODO: can be overwritten, bad solution
		pathToVar (root, varPath.replace (/\.mcu$/, ".extra_flags"), "--relax");
	}

	for (var i = 0; i < refs.length; i ++) {
		var sec = refs[i];
		if (value !== undefined) {
			var emptyO = {};
			if (root[sec] === undefined) {
				root[sec] = emptyO;
			}
			if (i < refs.length - 1 && typeof root[sec] === "string") {
				root[sec] = new String (root[sec]);
			}
			if (i === refs.length - 1) {
				var backup = root[sec];
				if (backup === emptyO) {
					root[sec] = value;
				} else if (value.constructor === String) {
					root[sec] = new String (value);
					extend (true, root[sec], backup);
				}
			}
		}

//		if (varPath === 'build.variant.path')
//			console.log (root[sec], sec, i, refs.length - 1, value);

		if (root === undefined) {
			throw "no value for "+ varPath;
		}

		if (root.constructor === String) {
			// TODO: use key-value for that task
			console.log ("bad config for:", varPath, root[sec] ? root[sec].toString () : root);
		}
		root = root[sec];
	}
	return root;
}

function replaceDict (str, conf, count, meta) {
	if (count !== undefined && count > 2) {
		throw "command still needs interpolation after 3 replacements:" + str;
	}
	var replacementRe = /{(\w+\.)*\w+}/g;
	var replacement = str.replace (replacementRe, function (match) {
		var varPath = match.substring (1, match.length - 1);
		var result = conf[varPath];
		if (result === undefined) {
			throw "no interpolation found for '"+varPath + "' in '" + meta + "'"
		} else if (result.constructor !== String && result.constructor !== Number) {
			throw "bad type for interpolate \'"+varPath + '\': ' + util.inspect (result)
		}

		return result;
	});

	if (replacement.match (replacementRe)) {
		replacement = replaceDict (replacement, conf, count === undefined ? 1 : count + 1, meta)
	}

	return replacement;
}

function FileWithStat (path, stat) {
	this.path = path;
	this.stat = stat;
}

function pathWalk (dir, done, options) {
	options = options || {};

	var results = {};
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		var pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function(file) {
			file = path.join (dir, file);
			fs.lstat(file, function(err, stat) {

				var ok = false;
				if (err) {

				} else if ("nameMatch" in options && file.match (options.nameMatch)) {
					ok = true;
				} else if (stat && !stat.isSymbolicLink() && stat.isDirectory()) {
					pathWalk (file, function(err, res) {
						for (var newFile in res) {
							results[newFile] = res[newFile];
						}
						if (!--pending) done(null, results);
					}, options);
					return;
				} else if (!("nameMatch" in options)) {
					ok = true;
				}

				if (ok) {
					results[file] = {stat: stat};
					if (stat.isSymbolicLink()) {
						fs.readlink (file, function (err, linkName) {
							if (!err) results[file].linkedTo = linkName;
							if (!--pending) done(null, results);
						});
						return;
					} else if (stat.isFile() && (options.readFiles || options.dataFilter)) {
						fs.readFile (file, function (err, contents) {
							if (!err) {
								if (options.dataFilter) {
									results[file].filteredData = options.dataFilter (contents);
								} else {
									results[file].contents = contents;
								}
							}
							if (!--pending) done(null, results);
						});
						return;
					}
				}
				if (!--pending) done(null, results);
			});

		});
	});
};

function createDictOld (arduino, platformId, boardId, boardVariant, options, currentStage) {

	var boardsData = arduino.boardData[platformId];

	var platform = boardsData.platform;
	var board = extend (true, {}, boardsData.boards[boardId]);

	var boardBuild = board.build;

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

	var conf;
	if (currentStage === 'upload') {
		var toolName = board.upload.tool;
		conf = extend (true, {}, platform.tools[toolName]); // arduino/avr.platform.tools.<toolName>
		// TODO: remove
		pathToVar (conf, 'runtime.platform.path', boardsData.folders.root);
		pathToVar (conf, 'runtime.hardware.path', path.dirname (boardsData.folders.root));

	} else if (currentStage === 'build') {
		conf = extend (true, {}, platform);
	}

	// if we have runtimeFolder, it is accessible via arduino.acceptableRuntimes[0]
	var runtimeFolder = arduino.acceptableRuntimes[0];

	pathToVar (conf, 'runtime.ide.path', runtimeFolder);
	// TODO: get version from mac os x bundle or from windows revisions.txt
	pathToVar (conf, 'runtime.ide.version', arduino.acceptableVersions[0].replace (/\./g, ""));
	pathToVar (conf, 'software', "ARDUINO");

	//	Preferences.set("runtime.platform.path", platformFolder.getAbsolutePath());
	//	Preferences.set("runtime.hardware.path", platformFolder.getParentFile().getAbsolutePath());

	if (conf.compiler) {
		// TODO: move to if (currentStage === 'build')
		conf.compiler.path = replaceDict (conf.compiler.path, conf, null, "compiler.path");
	}


	"upload bootloader build".split (" ").forEach (function (stageName) {
		for (var buildK in board[stageName]) {
			//			var debugFlag = false;
			//			if (conf[stageName] && conf[stageName][buildK]){
			//				console.log ("key '"+stageName+"."+buildK+"' will be overwritten:", conf[stageName][buildK], " => ", board[stageName][buildK]);
			//				debugFlag = true;
			//			}
			pathToVar (conf, [stageName, buildK], board[stageName][buildK]);
			//			if (debugFlag){
			//				console.log (conf[stageName][buildK], conf[stageName][buildK].path);
			//			}
		}
	});

	// bad, ugly arduino config
	pathToVar (conf, 'build.variant.path', "" + boardsData.folders.root + '/variants/' + conf.build.variant);

	//	common.pathToVar (conf, 'build.arch', platformId.split (':')[1]);
	pathToVar (conf, 'build.arch', platformId.split (':')[1].toUpperCase ());

	return conf;
}

function createDict (arduino, platformId, boardId, boardModel, options, currentStage) {

	var dict = {};

	var hwNode = arduino.hardware[platformId];
	var hwPlatform = arduino.hardware[platformId].platform;
	var hwBoard = arduino.hardware[platformId].boards[boardId];

	if (currentStage === 'upload') {
		var toolName = hwBoard['upload.tool'];
		var tool = hwPlatform.tools[toolName]; // arduino:avr platform.txt tools.<toolName>
		// TODO: remove
		dict['runtime.platform.path'] = hwNode['folders.root'];
		dict['runtime.hardware.path'] = path.dirname (hwNode['folders.root']);
		for (var toolK in tool) {
			// TODO: better solution to get real keys
			if (typeof tool[toolK] === 'string')
				dict[toolK] = tool[toolK];
		}
	} else if (currentStage === 'build') {
		for (var platformK in hwPlatform) {
			// TODO: better solution to get real keys
			if (typeof hwPlatform[platformK] === 'string')
				dict[platformK] = hwPlatform[platformK];
		}
	}

	for (var boardK in hwBoard) {
		// TODO: better solution to get real keys
		if (typeof hwBoard[boardK] === 'string')
			dict[boardK] = hwBoard[boardK];
	}

	if (boardModel) {
		for (var modelScope in boardModel) {
			if (!hwBoard.models[modelScope]) {
				// TODO: probably it is a program error, no need to say something to user
				console.log ('brackets-arduino error:', boardId, 'doesn\'t have a', modelScope, 'models');
				console.log ('ignored for now, can continue');
				continue;
			}
			var fixup = hwBoard.models[modelScope][boardModel[modelScope]];
			for (var modelKey in fixup) {
				dict[modelKey] = fixup[modelKey];
			}
		}
	}

	// if we have runtimeFolder, it is accessible via arduino.acceptableRuntimes[0]
	var runtimeFolder = arduino.acceptableRuntimes[0];

	dict['runtime.ide.path'] = runtimeFolder;
	dict['runtime.ide.version'] = arduino.acceptableVersions[0].replace (/\./g, "");
	dict['software'] = "ARDUINO"; // found this key in RFduino

	//	Preferences.set("runtime.platform.path", platformFolder.getAbsolutePath());
	//	Preferences.set("runtime.hardware.path", platformFolder.getParentFile().getAbsolutePath());

//	if (conf.compiler) {
//		// TODO: move to if (currentStage === 'build')
//		conf.compiler.path = replaceDict (conf.compiler.path, conf, null, "compiler.path");
//	}


	var arch = hwNode['folders.arch'];
	dict['build.arch'] = arch.toUpperCase();

	["variant", "core"].forEach (function (aliasK) {

		var folder;
		if (aliasK === "variant") {
			folder = "variants";
			if (!dict['build.'+aliasK]) {
				dict['build.'+aliasK+'.path'] = "";
				return;
			}
		} else if (aliasK === "core") {
			folder = "cores";
		}

		var alias = arduino.getAlias (dict['build.'+aliasK], arch);

		if (!alias) {
			dict['build.'+aliasK+'.path'] = [hwNode['folders.root'], folder, dict['build.'+aliasK]].join ('/');
		} else {
			dict['build.'+aliasK+'.path'] = [alias.hw['folders.root'], folder, alias.key].join ('/');
		}
	});

	return dict;
}

function buildFolder (sketchFolder, cb) {
	var sketchName = path.basename (sketchFolder);

	var hash = crypto.createHash('md5').update(sketchFolder).digest('hex');
//	console.log(hash); // 9b74c9897bac770ffc029102a200c5de

	var buildFolder = path.join (os.tmpdir(), sketchName + '-cuwire-' + hash.substr (0, 8));

	return buildFolder;
}

module.exports = {
	pathToVar: pathToVar,
	replaceDict: replaceDict,
	createDict: createDict,
	pathWalk: pathWalk,
	buildFolder: buildFolder,
	prepareEnv: prepareEnv
};
