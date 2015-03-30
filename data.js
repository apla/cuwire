"use strict";

var os   = require("os");
var fs   = require('fs');
var path = require ('path');
var util = require ('util');

var EventEmitter = require('events').EventEmitter;

var common = require ('./common');

var KeyValue = require ('./classes/key-value');

var Arduino = function (customRuntimeFolders, customSketchesFolder, fromScratch, options) {

	// TODO: additional user dirs
	if (Arduino.instance && !fromScratch) {
		return Arduino.instance;
	}

	this.hardware    = {};
	this.libraryData = {};

	this.folders = {};
	this.examples = {};

	options = options || {};

	if (options.verbose) this.verbose = options.verbose;
	if (options.debug)   this.debug   = options.debug;
	if (options.scanExamples) this.scanExamples   = options.scanExamples;

	// useful for reloading
	this.init (customRuntimeFolders, customSketchesFolder);


	this.on ('iodone', this.storeHWData.bind (this));
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

	if (this.debug)
		console.log ('runtime folders:', customRuntimeFolders);

	customRuntimeFolders = appendStandardLocations ('runtime',  customRuntimeFolders);

	if (this.debug)
		console.log ('runtime folders:', customRuntimeFolders);

	customSketchesFolder = appendStandardLocations ('sketches', customSketchesFolder);

	if (this.debug)
		console.log ('sketches folders:', customSketchesFolder);

	// actually, there is two types of runtimes: builtin into app and standalone.
	// TODO: if we found in description platform inheritance or runtime.ide expansion,
	// then count this hardware platform as dependent and in that case builtin runtime
	// is required

	this.processDirs ('runtime', customRuntimeFolders);
	this.processDirs ('sketches', customSketchesFolder);
	var packagesFolder = path.join (common.userLibraryFolder(), 'packages');
	fs.readdir (packagesFolder, this.processPackages.bind (this, packagesFolder));

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

var hwFileNames = "libraries|boards\\.txt|platform\\.txt|programmers\\.txt";
var hwWalkRegexp = new RegExp ('.*\\'+path.sep+'('+hwFileNames+')$', 'i');

var libFileNames = "examples|.+\\.cp{0,2}|.+\\.h";
var libWalkRegexp = new RegExp ('.*\\'+path.sep+'('+libFileNames+')$', 'i');

var exampleFileNames = ".+\\.ino|.+\\.pde";
var exampleWalkRegexp = new RegExp ('.*\\'+path.sep+'('+exampleFileNames+')$', 'i');


Arduino.prototype.processPackages = function (root, err, vendorFolders) {

	vendorFolders.forEach (function (dirStr) {
		var dir = path.join (root, dirStr);
		this.folders[dir] = {
			platform: {},
			boards: {},
			programmers: {}
		};

		var hwFolder = path.join (dir, 'hardware');

		common.pathWalk (hwFolder, this.hardwareFound.bind (this, dir, this.ioDone ('hardware', dir), dirStr), {
			nameMatch: hwWalkRegexp,
			readFiles: true,
			depth: 3
		});

		var toolsFolder = path.join (dir, 'tools');

		common.pathWalk (toolsFolder, this.toolsFound.bind (this, dir, this.ioDone ('tools', dir), undefined), {
			depth: 2
		});

		return;

	}.bind (this));
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

		var hwFolder = path.join (dir, 'hardware');

		common.pathWalk (hwFolder, this.hardwareFound.bind (this, dir, this.ioDone ('hardware', dir), undefined), {
			nameMatch: hwWalkRegexp,
			readFiles: true,
			depth: 3
		});

		var libFolder = path.join (dir, 'libraries');

		common.pathWalk (libFolder, this.librariesFound.bind (this, dir, this.ioDone ('libraries', dir), undefined), {
			nameMatch:  libWalkRegexp,
			dataFilter: this.parseLibNames.bind (this),
		});

		if (this.scanExamples) {
			var examplesFolder = path.join (dir, 'examples');

			common.pathWalk (examplesFolder, this.examplesFound.bind (this, dir, this.ioDone ('examples', dir), {}), {
				nameMatch:  exampleWalkRegexp,
			});
		}


//		if (os.platform () === 'darwin') {
//			var runtimeDir = path.resolve (dirStr.replace (/(Resources\/)?Java/, 'Info.plist'));
//			fs.stat (runtimeDir, self.parseMacOSXVersion.bind (self, runtimeDir, self.ioDone ('runtime', dir)));
			// search for
			//<key>CFBundleShortVersionString</key>
			//<string>1.5.8</string>
			// within Arduino.app/Contents/Info.plist
//		} else if (os.platform () === 'win32') {

	}.bind (this));
}

function getUserSketchDir () {
	// default user folders:
	function getUserHome() {
		return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
	}

	// TODO: read preference file ~/Library/Arduino15/preferences.txt
	// TODO: read preference file ~/.arduino/preferences.txt
	var userSketchDir = path.join (getUserHome(), "Documents", "Arduino");
	if (os.platform() === 'linux') {
		userSketchDir = path.join (getUserHome(), "Arduino");
	}

	return userSketchDir;
}

Arduino.prototype.getUserSketchDir = getUserSketchDir;

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
			locations = JSON.parse (JSON.stringify (Arduino.runtimeFolders[os.platform()]));

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

	var userSketchDir = getUserSketchDir ();

	locations.push (userSketchDir);

//	console.log ('search for sketches within:', locations.join (", "));
	return locations;
}

Arduino.prototype.getAlias = function (alias, arch) {
	if (!alias) return;
	var aliasSplit = alias.split (':');
	if (aliasSplit.length !== 2) {
		return;
	}
	var aliasVendor = aliasSplit[0];
	return {hw: this.hardware[[aliasVendor, arch].join (':')], key: aliasSplit[1]};
}

Arduino.prototype.parseConfig = function (cb, section, err, data) {
	if (arguments.length === 1 && cb && typeof cb !== "function") {
		data = cb;
		cb   = undefined;
	}

	if (err) {
		cb && cb (err);
		return;
	}

	var keyValue = {};
	var haveRuntimeIde = false;

	data.toString ().split (/[\r\n]+/).forEach (function (line) {
		if (line.indexOf("#") === 0) return;
		if (line.length === 0) return;
		// console.log (line);
		var ref = line.substring (0, line.indexOf ('='));
		var value = line.substring (line.indexOf ('=')+1);
		haveRuntimeIde = haveRuntimeIde || value.match (/\{runtime\.ide\.path\}/);
		keyValue[ref] = value;
	});

	Object.defineProperty (keyValue, "haveRuntimeIde", {
		enumerable: false,
		value: haveRuntimeIde ? true : false
	})
//	console.log (Object.keys (boards));
	cb && cb (null, section, keyValue);

	return keyValue;
}

Arduino.prototype.toolsFound = function (instanceFolder, done, hwRef, err, files) {
	if (err && !files) {
		this.folders[instanceFolder].tools = {
			error: err.code
		};
		done ('tools');
		return;
	}

	if (hwRef === undefined) {
		hwRef = this;
	}

	var fullPath = path.join (instanceFolder, 'tools');

	var remains = Object.keys (files).length;

	this.tools = this.tools || {};

	Object.keys (files).forEach (function (fileName) {
		if (files[fileName].folder) {

			var relPath = path.relative (fullPath, fileName);
			if (path.dirname (relPath) === '.') {
				return;
			}

			this.tools[path.dirname (relPath)] = {
				path: fileName,
				mtime: files[fileName].stat.mtime / 1000
			};
			return;
		}
	}.bind (this));

	console.log (this.tools);

	done ('tools');
}


Arduino.prototype.librariesFound = function (instanceFolder, done, hwRef, err, files) {
	if (err && !files) {
		this.folders[instanceFolder].libraries = {
			error: err.code
		};
		done ('libraries');
		return;
	}

	if (hwRef === undefined) {
		hwRef = this;
	}

	var fullPath = path.join (instanceFolder, 'libraries');

	var remains = Object.keys (files).length;

	Object.keys (files).forEach (function (fileName) {
		if (files[fileName].folder) {
			remains --;
			return;
		}
		if (fileName.match (/examples$/)) {
			remains --;

			if (!this.scanExamples) {
				return;
			}

			var examplesFolder = fileName;

			var examplesParent = path.dirname (fileName);
			common.pathWalk (examplesFolder, this.examplesFound.bind (this, examplesParent, this.ioDone ('examples', examplesParent), {
				arch:   hwRef["folders.arch"],
				vendor: hwRef["folders.vendor"]
			}), {
				nameMatch:  exampleWalkRegexp,
			});

//			this.folders[instanceFolder].examples = true;
			// TODO: enumerateExamples
			//fs.stat (fileName,  self.enumerateExamples.bind  (self, fileName, self.ioDone ()));
			return;
		}

		var relativePath = fileName.substr (fullPath.length + 1);
		//			console.log (relativePath.match (/[^\/]+/));
		var libName = relativePath.substr (0, relativePath.indexOf (path.sep));
		//			console.log ('found lib', libName);
		var libData = hwRef.libraryData[libName];
		var headers = hwRef.headers = hwRef.headers || {};

		// TODO: user and runtime can have libraries with same name. prefer user ones
		if (!libData) {
			var libRoot = path.join (fullPath, libName);
			libData = hwRef.libraryData[libName] = {
				files: {},
				requirements: {},
				root: libRoot,
				name: libName,
				mtime: files[libRoot] ? files[libRoot].stat.mtime / 1000 : null
			};
		}

		if (relativePath.toLowerCase() === path.join (libName.toLowerCase(), libName.toLowerCase()+'.h')) {
			// Arduino 1.0 styled lib

			libData.include = path.join (fullPath, libName);
		} else if (relativePath.toLowerCase() === path.join (libName.toLowerCase(), 'src', libName.toLowerCase()+'.h')) {
			// TODO: add all arch dependent folders
			libData.include = path.join (fullPath, libName, 'src');
			libData.version = '1.5';
		}

		var headerName = path.basename (relativePath);
		if (path.extname (relativePath) === '.h') {
		if (
			(path.dirname (relativePath) === path.join (libName, 'src') && libData.version === '1.5') ||
			path.dirname (relativePath) === libName
		) {
			var headerNameData = headers[headerName] = headers[headerName] || [];
			headerNameData.push (libData);
		}
		}

		// console.log ('library: relpath', relativePath, 'libname', libName, 'root', libData.root);
		var relativeSrcPath = relativePath.substr (libName.length+1);
		libData.files[relativeSrcPath] = parseInt(files[fileName].stat.mtime / 1000);
		var libNames = files[fileName].filteredData || [];

		// TODO: remove obvious requirements from same directory
		libNames.forEach (function (req) {
			libData.requirements[req] = true;
		});
	}.bind (this));

	if (this.debug) console.log ("debug libs at", fullPath, Object.keys (hwRef.libraryData).join (', '));

	done ('libraries');
}

Arduino.prototype.examplesFound = function (instanceFolder, done, options, err, files) {
	if (err && !files) {
		this.folders[instanceFolder].examples = {
			error: err.code
		};
		done ('examples');
		return;
	}

	options = options || {};

	var platformId = [options.vendor || '', options.arch || ''].join (':');

	if (!this.examples[platformId]) {
		this.examples[platformId] = {};
	}

	var platformFolder = this.hardware[platformId] ? this.hardware[platformId]["folders.root"] : undefined;

//	console.log ('PLTFRM ROOT', platformFolder);

	var withLibraryRegexp = new RegExp ('libraries\\'+path.sep+'([^\\'+path.sep+']+)\\'+path.sep+'examples\\'+path.sep+'(.*)');
	Object.keys (files).forEach (function (fileName) {
		if (files[fileName].folder) {
			return;
		}
		var fileExt = path.extname (fileName).substr(1);
		var dirName = path.basename (path.dirname (fileName));
		if (fileExt !== 'ino' && fileExt !== 'pde') {
			return;
		}

		if (path.basename (fileName) === (dirName + '.' + fileExt)) {
			// removed ino/pde
			fileName = path.dirname (fileName);
		}
//			console.log ('ino file is', instanceFolder, fileName);
		var relFileName = fileName;
		var relFile;
		var withLibrary;

		if (relFileName.indexOf (platformFolder) === 0) {
			relFileName = path.relative (platformFolder, fileName);
			relFile = true;
			withLibrary = relFileName.match(withLibraryRegexp);
			if (withLibrary) {
				relFileName = withLibrary[2];
				withLibrary = withLibrary[1];
			}
		}
		var exampleDesc = this.examples[platformId][relFileName] = {};
		if (withLibrary) exampleDesc.lib = withLibrary;
		if (relFile) exampleDesc.rel = relFile;
	}.bind (this));

	done ('examples');
}

Arduino.prototype.hardwareFound = function (instanceFolder, done, forceVendor, err, files) {
	if (err && !files) {
		this.folders[instanceFolder].hardware = {
			error: err.code
		};
		done ('hardware');
		return;
	}

	var fullPath = path.join (instanceFolder, 'hardware');

	// boards.txt and platform.txt is required
	var filesToProcess = [];
	var vendorArchFolder;

	Object.keys (files).some (function (fileName) {
		if (files[fileName].folder) {
			return;
		}
		var relativePath = fileName.substr (fullPath.length + 1);
		var pathChunks = relativePath.split (path.sep);
		var vendor     = pathChunks[0];
		var arch       = pathChunks[1];
		if (forceVendor) {
			vendor = forceVendor;
			arch   = pathChunks[0];
			vendorArchFolder = path.dirname (path.relative (fullPath, fileName));
		}
		var localFile  = pathChunks[2];
		if (pathChunks.length === 3) {
			filesToProcess.push ({
				vendor:    vendor,
				arch:      arch,
				localFile: localFile,
				fileName:  fileName,
				contents:  files[fileName].contents,
				vendorArchFolder: vendorArchFolder
			});
			return;
		}

		// Arduino 1.0.x have no arch directory
		// so every file is located under arduino subfolder
		if (vendor === 'arduino' && pathChunks.length === 2) {
			console.log ('found Arduino 1.0.x file:', fullPath, relativePath);
			filesToProcess = [];
			// done ('hardware');
			return true;
		}
	});

	//		console.log (Object.keys (files).join ("\n"));
	filesToProcess.forEach (function (fileMeta) {
		var localFile = fileMeta.localFile;
		var vendor    = fileMeta.vendor;
		var arch      = fileMeta.arch;
		var fileName  = fileMeta.fileName;

		var platformId   = [vendor, arch].join (':');
		var platformRoot = fileMeta.vendorArchFolder ? path.join (fullPath, fileMeta.vendorArchFolder) : path.join (fullPath, vendor, arch);
		var hardwareRoot = fileMeta.vendorArchFolder ? fullPath : path.dirname (platformRoot);
		if (!this.hardware[platformId])
			this.hardware[platformId] = new KeyValue ({
				"folders.root": platformRoot,
				"folders.arch": arch,
				"folders.vendor": vendor,
				libraryData: {}
			});

		if (localFile === 'libraries') {
			var parentDir = path.dirname (fileName);

			common.pathWalk (fileName, this.librariesFound.bind (this, parentDir, this.ioDone ('libraries', parentDir), this.hardware[platformId]), {
				nameMatch: libWalkRegexp,
				dataFilter: this.parseLibNames.bind (this)
			});

			return;
		}

		var type = localFile.replace ('.txt', '');

		var keyValue = this.parseConfig (fileMeta.contents);
		var requireArduino = keyValue.haveRuntimeIde;

		var data;
		if (type === "boards") {
			data = new BoardsConf (keyValue, vendor, arch);
		} else if (type === "platform") {
			data = new PlatformConf (keyValue, vendor, arch);
		} else {
			// TODO: no special processing for programmers.txt at this time
			data = new KeyValue (keyValue);
		}
		this.hardware[platformId][type]  = data;

		this.folders[instanceFolder][type][vendor+":"+arch] = requireArduino ? 'require "runtime.ide.path"' : "autonomous";

		var currentHw = this.hardware[platformId][type];

		if (type === 'platform') {
			currentHw["build.system.path"]     = path.join (platformRoot, 'system');
			currentHw["runtime.platform.path"] = platformRoot;
			currentHw["runtime.hardware.path"] = hardwareRoot;
		}

	}.bind (this));

	done ('hardware');
}

Arduino.prototype.storeHWData = function (evt) {
	var hwCacheFile = common.cacheFileName ('hardware');
	fs.mkdir (path.dirname (hwCacheFile), function (err) {
		if (err && err.code !== 'EEXIST') {
			console.log ("cannot save hardware cache:", err);
			return;
		}
		fs.writeFile (
			hwCacheFile,
			JSON.stringify (this.hardware, null, '\t'),
			function (err) {}
		);
	}.bind (this));

}

Arduino.prototype.loadHWData = function () {
	fs.readFile (common.cacheFileName ('hardware'), (function (err, data) {
		if (err) {
			this.emit ('error', err);
			return;
		}
		try {
			this.hardware = JSON.parse (data.toString());
		} catch (e) {
			this.emit ('error', e);
		}
	}).bind (this));
}


Arduino.prototype.storeLibraryData = function (evt) {
	var libCacheFile = common.cacheFileName ('libraries');
	fs.mkdir (path.dirname (libCacheFile), function (err) {
		if (err && err.code !== 'EEXIST') {
			console.log ("cannot save library cache:", err);
			return;
		}
		fs.writeFile (
			libCacheFile,
			JSON.stringify (this.libraryData, null, '\t'),
			function (err) {}
		);
	}.bind (this));
}

Arduino.prototype.loadLibraryData = function () {
	fs.readFile (common.cacheFileName ('libraries'), (function (err, data) {
		if (err) {
			this.emit ('error', err);
			return;
		}
		try {
			this.libraryData = JSON.parse (data.toString());
		} catch (e) {
			this.emit ('error', e);
		}
	}).bind (this));
}

function createTempFile (cb) {

	var crypto = require('crypto');
	var fileName = path.join (os.tmpdir (), 'me.apla.cuwire.'+crypto.randomBytes(4).readUInt32LE(0));

	fs.mkdir (fileName, function (err) {
		// TODO: make something on error
		if (err) {
			return;
		}
		cb ();
	});

}

Arduino.prototype.findLib = function (platformId, headerName, core) {
//	console.log (this.libraryData, this.boardData[platformId].libraryData, platformId, libName);
	var libName = path.basename (headerName, path.extname (headerName));
	var arch  = this.hardware[platformId]['folders.arch'];
	var alias = this.getAlias (core, arch);
	var aliasLibData = {};
	var aliasHeaders = [];
	if (alias && alias.hw) {
		aliasLibData = alias.hw.libraryData || {};
		aliasHeaders = alias.hw.headers || {};
	}
	var libMeta =
		this.hardware[platformId].libraryData[libName]
		|| aliasLibData[libName]
		|| this.libraryData[libName];
	if (!libMeta) {
		var libMetaFromHeaders = this.hardware[platformId].headers[headerName]
		|| aliasHeaders[headerName]
		|| this.headers[headerName];
		if (libMetaFromHeaders) {
			if (libMetaFromHeaders.length > 1) {
				console.log ('We found multiple libraries to match header', headerName);
			}
//			console.log ('found header', headerName);
			libMeta = libMetaFromHeaders[0];
		}
	}
	if (!libMeta) {
//		console.log ('can\'t find library', libName, 'in library folders');
//		console.log (platformId, libName, core, arch);
//		console.log (
//			this.hardware[platformId].headers,
//			this.headers
//		);
	}
	if (!libMeta) return libMeta;
	var libMetaClone = JSON.parse (JSON.stringify (libMeta));
	return libMetaClone;
}

Arduino.prototype.parseLibNames = function (fileContents, platformId, core) {
	// let's find all #includes
	var includeRe = /^\s*#include\s+["<]([^\.]+\.h)[">]/gm;
	var matchArray;
	var libNames = [];

	while ((matchArray = includeRe.exec (fileContents)) !== null) {
		var libName = matchArray[1];
		if (platformId === undefined) {
			libNames.push (libName);
		} else if (this.findLib (platformId, libName, core)) {
			libNames.push (libName);
		}

	}
	return libNames;
}

function BoardsConf (data, vendor, arch) {
	var dataKV = new KeyValue (data);
	var modelMenus = dataKV.sliceAndRemove ('menu') || {};
	var grouped = dataKV.sliceByFirstChunk ();

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
		if (Object.keys (model).length) {
			this[boardId].models = model;
			this[boardId].menuNames = modelMenus;
		}

		if (!this[boardId]["build.board"]) {
			this[boardId]["build.board"] = [arch, boardId].join ('_').toUpperCase();
			if (this.verbose)
				console.log (
					"board %s:%s:%s doesn't define a 'build.board' preference. auto-set to %s",
					vendor, arch, boardId, this[boardId]["build.board"]
				);
		}

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
				if (boardUSBMatch[usbPair]) {
					boardUSBMatch[usbPair].alt[boardId] = boardDesc;
				} else {
					boardUSBMatch[usbPair] = boardDesc;
					boardUSBMatch[usbPair].alt = {};
				}

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
