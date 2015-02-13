"use strict";

var os   = require("os");
var fs   = require('fs');
var path = require ('path');
var util = require ('util');

var EventEmitter = require('events').EventEmitter;

var common = require ('./common');

var nodeToJavaPlatform = {
	darwin: 'macos',
	win32: 'windows',
	linux: 'linux'
};

var javaToNodePlatform = {};
for (var platformName in nodeToJavaPlatform) {
	javaToNodePlatform[nodeToJavaPlatform[platformName]] = platformName;
}

var os = require ('os');

var javaPlatformName = nodeToJavaPlatform [os.platform()];

function KeyValue (data) {
	this.initWith (data);
}

KeyValue.prototype.initWith = function (data) {
	if (!data) return;
	for (var k in data) {
		if (data.hasOwnProperty(k)) {
			this[k] = data[k];
		}
	}
}

/**
 * key-value storage slice for keys begining with prefix
 * @param {String} prefix prefix must not contain . at end
 * @param {Boolean} withPrefix slice must contain keys with prefix
 */
KeyValue.prototype.slice = function (prefix, withPrefix, className) {
	if (!className) className = this.constructor;
	var result = new className ();
	for (var k in this) {
		if (this.hasOwnProperty(k) && k.indexOf (prefix) === 0) {
			// dot will be removed
			result[withPrefix ? k : k.substr (prefix.length + 1)] = this[k];
		}
	}
	return result;
}

/**
 * key-value storage slice for keys begining with prefix
 * @param {String} prefix prefix must not contain . at end
 * @param {Boolean} withPrefix slice must contain keys with prefix
 */
KeyValue.prototype.sliceAndRemove = function (prefix, withPrefix, className) {
	if (!className) className = this.constructor;
	var result = new className ();
	for (var k in this) {
		if (this.hasOwnProperty(k) && k.indexOf (prefix) === 0) {
			// dot will be removed
			result[withPrefix ? k : k.substr (prefix.length + 1)] = this[k];
			delete this[k];
		}
	}
	return result;
}

/**
 * key-value storage slice for keys begining with prefix
 * @param {String} prefix prefix must not contain . at end
 * @param {Boolean} withPrefix slice must contain keys with prefix
 */
KeyValue.prototype.sliceByFirstChunk = function (className) {
	if (!className) className = this.constructor;
	var result = {};
	for (var k in this) {
		if (!this.hasOwnProperty(k)) {
			continue;
		}
		var keyChunks = k.split (/\./);
		var firstChunk = keyChunks.shift();
		if (!result[firstChunk]) {
			result[firstChunk] = new className ();
		}
		result[firstChunk][keyChunks.join (".")] = this[k];
	}
	//	this.grouped = groupedData;
	return result;
}

var Arduino = function (customRuntimeFolders, customSketchesFolder, fromScratch, options) {

	// TODO: additional user dirs
	if (Arduino.instance && !fromScratch) {
		return Arduino.instance;
	}

	this.boardData   = {};
	this.hardware    = {};
	this.libraryData = {};

	this.folders = {};

	options = options || {};

	if (options.verbose) this.verbose = options.verbose;
	if (options.debug)   this.debug   = options.debug;

	// useful for reloading
	this.init (customRuntimeFolders, customSketchesFolder);


	this.on ('iodone', this.storeBoardsData.bind (this));
	this.on ('iodone', this.storeLibraryData.bind (this));

	this.on ('iodone', (function () {
		Arduino.instance = this;

		this.createAccessors ();

		this.acceptableRuntimes = [];
		this.acceptableVersions = [];

		// let's find runtime dir
		Object.keys (this.folders).forEach ((function (folderName) {
			if (this.folders[folderName].runtime && this.folders[folderName].modern) {
				this.acceptableRuntimes.push (folderName);
				this.acceptableVersions.push (this.folders[folderName].runtime);
			}
		}).bind (this));

		this.emit ('done');

		if (this.debug) console.log ('debug', "folders information", this.folders);
	}).bind (this));

}

util.inherits (Arduino, EventEmitter);

Arduino.runtimeFolders = {
	darwin: ["/Applications/Arduino.app"],
	win32:  ["C:/Program Files/Arduino", "C:/Program Files (x86)/Arduino"],
	linux:  ["/usr/share/arduino/"]
};

Arduino.prototype.init = function (customRuntimeFolders, customSketchesFolder) {
	customRuntimeFolders = appendStandardLocations ('runtime',  customRuntimeFolders);
	customSketchesFolder = appendStandardLocations ('sketches', customSketchesFolder);

	// actually, there is two types of runtimes: builtin into app and standalone.
	// TODO: if we found in description platform inheritance or runtime.ide expansion,
	// then count this hardware platform as dependent and in that case builtin runtime
	// is required

	this.processDirs ('runtime', customRuntimeFolders);
	this.processDirs ('sketches', customSketchesFolder);
}

var ioWait = [];
var ioTimeout;
Arduino.prototype.ioDone = function (tag, dir) {
	var self = this;
	if (!ioWait[tag])
		ioWait[tag] = 0;
	ioWait[tag]++;

	var debug = this.debug;

	if (debug) console.log ('debug', 'ioWait++', ioWait[tag], tag || 'done', dir);
	return function () {
		ioWait[tag] --;
		if (debug) console.log ('debug', 'ioWait--', ioWait[tag], tag || 'done', dir);
		if (!ioWait[tag]) {
			if (ioTimeout) {
				clearTimeout (ioTimeout);
			}
			ioTimeout = setTimeout (function () {
				if (!ioWait[tag]) {
					// self.emit ('iodone-'+tag);
					var overall = 0;
					for (var everyTag in ioWait) {
						overall += ioWait[everyTag];
					}
					if (overall === 0) {
						self.emit ('iodone');
					}
				}
			}, 100);
		}
	}.bind (this);
}


// arduino version is not defined properly on windows and linux
// on mac

Arduino.prototype.getRuntimeVersion = function (runtimeFolder, done, err, versionBuf) {
	if (err || !versionBuf) {
		// console.log ('arduino runtime not found at', runtimeFolder);
		done('version');
		return;
	}

	// linux sometime have mad strings, like "1:1.0.5+dfsg2-2"
	var version = versionBuf.toString ().match (/\d+\.\d+\.\d+/);
	var modern  = version[0].match (/^1\.[56]\./);

	this.folders[runtimeFolder].runtime = version[0];
	this.folders[runtimeFolder].modern  = modern ? true : false;

	if (this.debug) console.log ('debug', runtimeFolder, 'version:', version[0], 'modern:', modern ? true : false);

	done ('version');

//	console.log (this.folders[runtimeFolder]);
}

Arduino.prototype.processDirs = function (type, dirs) {

	var self = this;

	dirs.forEach (function (dirStr) {
		var dir = path.resolve (dirStr);
		self.folders[dir] = {
			platform: {},
			boards: {},
			programmers: {}
		};
		fs.readFile (path.join (dir, 'lib', 'version.txt'), self.getRuntimeVersion.bind (self, path.join (dir), self.ioDone ('version', dir)));
		fs.stat (path.join (dir, 'hardware'),  self.enumerateHardware.bind  (self, path.join (dir, 'hardware'), self.ioDone ('hardware', dir)));
		fs.stat (path.join (dir, 'libraries'), self.enumerateLibraries.bind (self, path.join (dir, 'libraries'), self.ioDone ('libraries', dir)));
//		if (os.platform () === 'darwin') {
//			var runtimeDir = path.resolve (dirStr.replace (/(Resources\/)?Java/, 'Info.plist'));
//			fs.stat (runtimeDir, self.parseMacOSXVersion.bind (self, runtimeDir, self.ioDone ('runtime', dir)));
			// search for
			//<key>CFBundleShortVersionString</key>
			//<string>1.5.8</string>
			// within Arduino.app/Contents/Info.plist
//		} else if (os.platform () === 'win32') {

		// TODO: enumerateExamples
		//		fs.stat (path.join (dir, 'examples'),  self.enumerateExamples.bind  (self, path.join (dir, 'examples'), self.ioDone ()));
	});
}



function appendStandardLocations (type, locations) {

	locations = locations || [];

	if (locations.constructor !== Array) {
		if (locations.constructor === String) {
			locations = [locations];
		} else {
			console.log (arguments);
			cb ("first argument must be a path string or an array of paths");
		}
	}

	// we add default application folders only when no locations provided
	// so, we can have only one runtime
	// cuwire doesn't need to support multiple runtimes
	if (type === 'runtime') {
		if (!locations.length)
			locations = Arduino.runtimeFolders [os.platform()];

		// postprocessing
		locations.forEach (function (location, idx) {
			if (os.platform () === 'darwin') {
				// 1.0 /Applications/Arduino.app/Contents/Resources/Java/hardware/arduino/boards.txt
				// 1.5 /Applications/Arduino.app/Contents/Java/hardware/arduino/avr/boards.txt
				// 1.6 /Applications/Arduino.app/Contents/Resources/Java/hardware/arduino/avr/boards.txt
				locations[idx] = location.replace (/\.app\/?$/, ".app/Contents/Java");
				locations.push (location.replace (/\.app\/?$/, ".app/Contents/Resources/Java"));
			}

		});


		if (!locations.length)
			return;

//		console.log ('search for runtime within:', locations.join (", "));
		return locations;
	}

	if (type !== 'sketches') {
		return;
	}

	// default user folders:
	function getUserHome() {
		return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
	}

	// TODO: read preference file ~/Library/Arduino15/preferences.txt
	// TODO: read preference file ~/.arduino/preferences.txt
	locations.push (path.join (getUserHome(), "Documents", "Arduino"));

//	console.log ('search for sketches within:', locations.join (", "));
	return locations;
}


Arduino.prototype.parseConfig = function (cb, section, err, data) {
	if (err) {
		cb (err);
		return;
	}

	var boards = {};
	var keyValue = {};

	data.toString ().split (/[\r\n]+/).forEach (function (line) {
		if (line.indexOf("#") === 0) return;
		if (line.length === 0) return;
		// console.log (line);
		var ref = line.substring (0, line.indexOf ('='));
		// TODO: menu handling
		if (ref.match (/^menu/)) return;
		var value = line.substring (line.indexOf ('=')+1);
		var refs = ref.split('.');
		keyValue[ref] = value;

		if (refs[refs.length-1] === javaPlatformName) {
			refs.pop ();
			ref = refs.join ('.');
		} else if (refs[refs.length-1] in javaToNodePlatform) {
			return;
		}

		var root = boards;
		if (refs.length === 4 && refs[1] === "menu") {
			ref += "."+refs[2] + '_modification';
		}
		common.pathToVar (root, ref, value);
	});
//	console.log (Object.keys (boards));
	cb (null, section, boards, keyValue);
}

Arduino.prototype.enumerateLibraries = function (fullPath, done, err, data) {

	// stinks
	var instanceFolder = fullPath.replace (new RegExp ('\\'+path.sep+'libraries'+'.*'), "");

	if (err) {
		this.folders[instanceFolder].libraries = {
			error: err.code
		};
		done ('libraries');
		return;
	}

	var walkRegexp = new RegExp ('.*\\'+path.sep+'(examples|.+\\.cp{0,2}|.+\\.h)$', 'i');

	common.pathWalk (fullPath, foundMeta, {
		nameMatch: walkRegexp
	});

	var self = this;

	var data = {};


	function foundMeta (err, files) {
		if (err && !files) {
			done ('libraries');
			return;
		}

		var remains = Object.keys (files).length;

		Object.keys (files).forEach (function (fileName) {
			if (fileName.match (/examples$/)) {
				remains --;
				// TODO: enumerateExamples
				//fs.stat (fileName,  self.enumerateExamples.bind  (self, fileName, self.ioDone ()));
				return;
			}
			var relativePath = fileName.substr (fullPath.length + 1);
//			console.log (relativePath.match (/[^\/]+/));
			var libName = relativePath.match (/[^\/\\]+/)[0];
//			console.log ('found lib', libName);
			// TODO: user and runtime can have libraries with same name. prefer user ones
			if (!self.libraryData[libName])
				self.libraryData[libName] = {
					files: {},
					requirements: {}
					// root: path.join (fullPath, libName)
				};
			if (relativePath.toLowerCase() === path.join (libName.toLowerCase(), libName.toLowerCase()+'.h')) {
				// Arduino 1.0 styled lib
				self.libraryData[libName].root = path.join (fullPath, libName);
				self.libraryData[libName].include = path.join (fullPath, libName);
			} else if (relativePath.toLowerCase() === path.join (libName.toLowerCase(), 'src', libName.toLowerCase()+'.h')) {
				self.libraryData[libName].root = path.join (fullPath, libName);
				self.libraryData[libName].include = path.join (fullPath, libName, 'src');
				self.libraryData[libName].version = '1.5';
			}
//			console.log ('library: relpath', relativePath, 'libname', libName, 'root', self.libraryData[libName].root);
			var relativeSrcPath = relativePath.substr (libName.length+1);
			self.libraryData[libName].files[relativeSrcPath] = true;
			fs.readFile (fileName, function (err, data) {
				remains --;

				// TODO: hackish solution by using prototype
				var libNames = Arduino.prototype.parseLibNames (data);

				libNames.forEach (function (req) {
					self.libraryData[libName].requirements[req] = true;
				});

				if (remains === 0)
					done ('libraries');
			});
		});
		if (remains === 0)
			done ('libraries');
	}
}

Arduino.prototype.enumerateHardware = function (fullPath, done, err, data) {
	// stinks
	var instanceFolder = fullPath.replace (new RegExp ('\\'+path.sep+'hardware'+'.*'), "");

	if (err) {
		this.folders[instanceFolder].hardware = {
			error: err.code
		};

		done ('hardware');
		return;
	}

	var fileNames = "libraries|boards\\.txt|platform\\.txt|programmers\\.txt";
	var walkRegexp = new RegExp ('.*\\'+path.sep+'('+fileNames+')$', 'i');

	common.pathWalk (fullPath, foundMeta, {
		nameMatch: walkRegexp
	});

	var self = this;

	var remains = 0;

	function foundMeta (err, files) {
		if (err && !files) {
			done ('hardware');
			return;
		}

		// boards.txt and platform.txt is required
		var filesToProcess = [];

		Object.keys (files).some (function (fileName) {
			var relativePath = fileName.substr (fullPath.length + 1);
			var pathChunks = relativePath.split (path.sep);
			var vendor     = pathChunks[0];
			var arch       = pathChunks[1];
			var localFile  = pathChunks[2];
			if (pathChunks.length === 3) {
				filesToProcess.push ({
					vendor:    vendor,
					arch:      arch,
					localFile: localFile,
					fileName:  fileName
				});
				return;
			}

			// Arduino 1.0.x have no arch directory
			// so every file is located under arduino subfolder
			if (vendor === 'arduino' && pathChunks.length === 2) {
				console.log ('found Arduino 1.0.x file:', fullPath, relativePath);
				filesToProcess = [];
				done ('hardware');
				return true;
			}
		});

//		console.log (Object.keys (files).join ("\n"));
		filesToProcess.forEach (function (fileMeta) {
			var localFile = fileMeta.localFile;
			var vendor    = fileMeta.vendor;
			var arch      = fileMeta.arch;
			var fileName  = fileMeta.fileName;

			var platformId = [vendor, arch].join (':');
			if (!self.boardData[platformId])
				self.boardData[platformId] = {
					folders: {
						root: path.join (fullPath, vendor, arch),
						arch: arch,
						vendor: vendor
					},
					libraryData: {}
				};
			self.hardware[platformId] = new KeyValue ({
				"folders.root": path.join (fullPath, vendor, arch),
				"folders.arch": arch,
				"folders.vendor": vendor,
				libraryData: {}
			});

			if (localFile === 'libraries') {
				// TODO: little hackish
				// TODO: self.hardware...libraryData not populated
				fs.stat (fileName,  self.enumerateLibraries.bind  (self.boardData[platformId], fileName, self.ioDone ('libraries', fileName)));
				return;
			}
			var type = localFile.replace ('.txt', '');
			var readCb = function (err, type, fileData, keyValue) {
				remains --;
				if (err) {
					console.log ('read error for', fileName);
					return;
				}

				self.boardData[platformId][type] = fileData;
				var data;
				if (type === "boards") {
					data = new BoardsConf (keyValue);
				} else if (type === "platform") {
					data = new PlatformConf (keyValue);
				} else {
					// TODO: no special processing for programmers.txt at this time
					data = new KeyValue (keyValue);
				}
				self.hardware[platformId][type]  = data;

				self.folders[instanceFolder][type][vendor+":"+arch] = true;

				var currentHw = self.hardware[platformId][type];

				if (type === 'platform') {
					common.pathToVar (
						self.boardData[platformId][type],
						"build.system.path",
						path.join (fullPath, vendor, arch, 'system')
					);
					currentHw["build.system.path"] =
						path.join (fullPath, vendor, arch, 'system');
					common.pathToVar (
						self.boardData[platformId][type],
						"build.core.path",
						path.join (fullPath, vendor, arch, 'cores')
					);
					currentHw["build.core.path"] =
						path.join (fullPath, vendor, arch, 'cores');
					common.pathToVar (
						self.boardData[platformId][type],
						"build.variant.path",
						path.join (fullPath, vendor, arch, 'variants')
					);
					currentHw["build.variant.path"] =
						path.join (fullPath, vendor, arch, 'variants');
					common.pathToVar (
						self.boardData[platformId][type],
						"runtime.platform.path",
						path.join (fullPath, vendor, arch)
					);
					currentHw["runtime.platform.path"] =
						path.join (fullPath, vendor, arch);
					common.pathToVar (
						self.boardData[platformId][type],
						"runtime.hardware.path",
						path.join (fullPath, vendor)
					);
					currentHw["runtime.hardware.path"] =
						path.join (fullPath, vendor);
				}

				if (remains)
					return;
				// self.boardData = data;
				done ('hardware');
				//					arduinoBoardsDone (cb, data);
			};
			fs.readFile (fileName, self.parseConfig.bind (self, readCb, type));
			remains ++;

		});
	}
}



Arduino.prototype.storeBoardsData = function (evt) {
	fs.writeFile (
		path.join (__dirname, "../generated/arduino.json"),
		JSON.stringify (this.boardData, null, '\t'),
		function (err) {}
	);
}

Arduino.prototype.loadBoardsData = function () {
	fs.readFile (path.join (__dirname, "../generated/arduino.json"), (function (err, data) {
		if (err) {
			this.emit ('error', err);
			return;
		}
		try {
			this.boardData = JSON.parse (data.toString());
		} catch (e) {
			this.emit ('error', e);
		}
	}).bind (this));
}


Arduino.prototype.storeLibraryData = function (evt) {
	fs.writeFile (
		path.join (__dirname, "../generated/libraries.json"),
		JSON.stringify (this.libraryData, null, '\t'),
		function (err) {}
	);
}

Arduino.prototype.loadLibraryData = function () {
	fs.readFile (path.join (__dirname, "../generated/libraries.json"), (function (err, data) {
		if (err) {
			this.emit ('error', err);
			return;
		}
		try {
			this.boardData = JSON.parse (data.toString());
		} catch (e) {
			this.emit ('error', e);
		}
	}).bind (this));
}

function createTempFile (cb) {

	var crypto = require('crypto');
	var fileName = path.join (os.tmpdir (), 'me.apla.arduino.'+crypto.randomBytes(4).readUInt32LE(0));

	fs.mkdir (fileName, function (err) {
		// TODO: make something on error
		if (err) {
			return;
		}
		cb ();
	});

}




Arduino.prototype.findLib = function (platformId, libName) {
//	console.log (this.libraryData, this.boardData[platformId].libraryData, platformId, libName);
//	libName = libName.toLowerCase();
	var libMeta = this.libraryData[libName] || this.boardData[platformId].libraryData[libName];
//	if (!libMeta) {
//		console.log ('can\'t find library', libName, 'in library folders (TODO: show library folder names)');
//	}
	if (!libMeta) return libMeta;
	var libMetaClone = JSON.parse (JSON.stringify (libMeta));
	return libMetaClone;
}

Arduino.prototype.parseLibNames = function (fileContents, platformId) {
	// let's find all #includes
	var includeRe = /^\s*#include\s+["<]([^>"]+)\.h[">]/gm;
	var matchArray;
	var libNames = [];

	while ((matchArray = includeRe.exec (fileContents)) !== null) {
		var libName = matchArray[1];
		if (platformId === undefined) {
			libNames.push (libName);
		} else if (this.findLib (platformId, libName)) {
			libNames.push (libName);
		}

	}
	return libNames;
}

Arduino.prototype.validateBoardVariant = function (platformId, boardId, variant) {

}

function BoardsConf (data) {
	var grouped = new KeyValue (data).sliceByFirstChunk ();

	for (var boardId in grouped) {
		if (!grouped.hasOwnProperty(boardId)) {
			continue;
		}
		this[boardId] = grouped[boardId];
		var model = {};
		var menus = this[boardId].sliceAndRemove ('menu').sliceByFirstChunk();
		for (var menuSection in menus) {
			model[menuSection] = menus[menuSection].sliceByFirstChunk();
		}
		if (Object.keys (model).length)
			this[boardId].models = model;
		if (boardId !== boardId.toLowerCase())
			Object.defineProperty(this, boardId.toLowerCase(), {
				value: this[boardId]
			});
	}
}

BoardsConf.prototype.validateModel = function (boardName, model) {
	// model can be ["option:value", "option2:value"]
	var modelFixup = {};
	var modelOptions = {};

	if (!model) {
		model = [];
	}
	if (model.constructor !== Array) {
		model = [model];
	}

	model.forEach (function (option) {
		var optionSplit = option.split (':');
		modelOptions[optionSplit[0]] = optionSplit[1];
	});

	if (this[boardName].models)
		for (var option in this[boardName].models) {
			if (!(option in modelOptions) || this[boardName].models[modelOptions[option]]) {
				console.log (
					'model of', option, "not defined for board",
					boardName + '. available options:',
					Object.keys (this[boardName].models[option]).join (", ")
				);
				console.log ("please define", option, "model as -m", option + ':' + Object.keys(this[boardName].models[option])[0]);
				return;
			}
			var fixup = this[boardName].models[modelOptions[option]];
			for (var k in fixup) {
				// TODO: overwrite error handling
				modelFixup[k] = fixup[k];
			}
		}

	return [modelFixup, modelOptions];
}

function PlatformConf (data) {
	this.initWith (data);

	this.tools = this.sliceAndRemove ('tools', undefined, KeyValue).sliceByFirstChunk();

	this.recipe = this.sliceAndRemove ('recipe', undefined, KeyValue);
}

util.inherits (PlatformConf, KeyValue);

PlatformConf.prototype.parse = function () {

	for (var k in this) {
		if (!this.hasOwnProperty(k)) {
			continue;
		}
		var keyChunks = k.split (/\./);
	}
}

Arduino.prototype.createAccessors = function () {

	var hw = this.hardware;

	var boardNameMatch = {};
	var boardUSBMatch  = {};

	for (var platformId in hw) {
		if (!hw.hasOwnProperty(platformId)) {
			continue;
		}
		for (var boardId in hw[platformId].boards) {
			if (!hw[platformId].boards.hasOwnProperty(boardId)) {
				continue;
			}

			var boardConfig = hw[platformId].boards[boardId];

			var boardDesc = {
				platform: platformId,
				board: boardId,
				boardName: boardConfig.name
			};

			var boardIdLC = boardId.toLowerCase();
			if (!boardNameMatch[boardIdLC])
				boardNameMatch[boardIdLC] = [];
			boardNameMatch[boardIdLC].push (boardDesc);

			var usbIdIdx = 0;
			while (boardConfig["vid."+usbIdIdx]) {
				var usbPair = [boardConfig["vid."+usbIdIdx], boardConfig["pid."+usbIdIdx]].join (':');
				boardUSBMatch[usbPair] = boardDesc;
				usbIdIdx ++;
			}
		}
	}

	this.boardNameMatch = boardNameMatch;
	this.boardUSBMatch  = boardUSBMatch;
}


Arduino.prototype.lookupBoard = function (boardName, model) {
	var platform, name, match;

	var hw = this.hardware;

	if (match = boardName.match (/^(\w+\:\w+)\:(\w+)$/)) {
		match = [{
			platform: match[1],
			name:     match[2]
		}];
	} else if (match = this.boardNameMatch[boardName]) {
//		platform = match.platform;
//		name     = match.board;
	} else {

	}

	if (!match || !match.length) {
		console.log ("no boards found for name:", boardName);
		return null;
	} else if (match.length > 1) {
		console.log ("multiple board match name", boardName, ". please select one of:");
		match.forEach (function (boardDesc) {
			console.log ("\t", [boardDesc.platform, boardDesc.name].join (':'));
		});
		return null;
	} else {
		// result contains modelFixup and modelOptions
		var result = hw[match[0].platform].boards.validateModel (match[0].board, model);

		if (!result) {
			return null;
		}

		match[0].model = result[1];

		return match[0];
	}
}

// TODO: use memoize
Arduino.prototype.platformPath = function (platformId) {
	return path.join (platformId.split (':'));
}

module.exports = Arduino;
