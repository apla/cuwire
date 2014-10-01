"use strict";

var os   = require("os");
var fs   = require('fs');
var path = require ('path');
var util = require ('util');

var EventEmitter = require('events').EventEmitter;

var Arduino = function (userDirs) {

	// useful for reloading
	this.init (userDirs);

	this.boardData = {};
	this.libraryData = {};

	this.on ('done', this.storeBoardsData.bind (this));
	this.on ('done', this.storeLibraryData.bind (this));

}

util.inherits (Arduino, EventEmitter);

Arduino.prototype.init = function (userDirs) {
	userDirs = appendStandardLocations ('runtime', userDirs);
	userDirs = appendStandardLocations ('user',    userDirs);

	// we must find correct arduino ide location.
	// we assume [arduino ide]/hardware/tools contains avr-gcc and so on
	// TODO: linux path resolve

	this.processDirs ('all', userDirs);
}

var ioWait = 0;
Arduino.prototype.ioDone = function (tag) {
	var self = this;
	ioWait++;
	//console.log ('ioWait++', dirsToProcess);
	return function () {
		ioWait --;
		//console.log ('ioWait--', dirsToProcess);
		if (!ioWait)
			setTimeout (function () {
				if (!ioWait)
					self.emit (tag || 'done');
			}, 100);
	}.bind (this);
}


Arduino.prototype.processDirs = function (type, dirs) {

	var self = this;

	dirs.forEach (function (dir) {
		fs.stat (path.join (dir, 'hardware'),  self.enumerateHardware.bind  (self, path.join (dir, 'hardware'), self.ioDone ()));
		fs.stat (path.join (dir, 'libraries'), self.enumerateLibraries.bind (self, path.join (dir, 'libraries'), self.ioDone ()));
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

	// 1.0 /Applications/Arduino.app/Contents/Resources/Java/hardware/arduino/boards.txt
	// 1.5 /Applications/Arduino.app/Contents/Java/hardware/arduino/avr/boards.txt

	// default application folders:
	if (type === 'runtime') {
		if (os.platform () === 'darwin') {
			locations.forEach (function (location, idx) {
				locations[idx] = location.replace (/Arduino\.app\/?$/, "Arduino.app/Contents/Java")
			});
			locations.push ("/Applications/Arduino.app/Contents/Java");
		} else if (os.platform () === 'win32') {
			locations.push ("C:/Program Files/Arduino");
		}

		if (!locations.length)
			return;

		return locations;
	}

	if (type !== 'user') {
		return;
	}

	// default user folders:
	function getUserHome() {
		return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
	}

	// TODO: read preference file ~/Library/Arduino15/preferences.txt
	locations.push (path.join (getUserHome(), "Documents/Arduino"));

	return locations;
}


Arduino.prototype.parseConfig = function (cb, section, err, data) {
	if (err) {
		cb (err);
		return;
	}

	var boards = {};

	data.toString().split('\n').forEach(function(line){
		if(line.indexOf("#") == 0) return;
		if(line.length == 0) return;
		// console.log (line);
		var ref = line.substring (0, line.indexOf ('='));
		if (ref === "menu.cpu") return;
		var value = line.substring (line.indexOf ('=')+1);
		var refs = ref.split('.');

		var root = boards;
		if (refs.length === 4 && refs[1] === "menu" && refs[2] === "cpu")
			refs.push ("cpu_variant_name");
		for(var i=0; i<refs.length; i++) {
			var sec = refs[i];
			if(!root[sec]) {
				root[sec] = {};
			}
			if(i == refs.length-1) {
				root[sec] = value;
			}
			root = root[sec];
		}
	});
	cb (null, section, boards);
}


function walk (dir, done, options) {
	var results = [];
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		var pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function(file) {
			file = dir + '/' + file;
			fs.lstat(file, function(err, stat) {
				if ("nameMatch" in options && file.match (options.nameMatch)) {
					results.push (file);
					if (!--pending) done(null, results);
				} else if (stat && !stat.isSymbolicLink() && stat.isDirectory()) {
					walk (file, function(err, res) {
						results = results.concat(res);
						if (!--pending) done(null, results);
					}, options);
				} else {
					if (!("nameMatch" in options)) {
						results.push(file);
					}
					if (!--pending) done(null, results);
				}
			});

		});
	});
};

Arduino.prototype.enumerateLibraries = function (fullPath, done, err, data) {

	if (err) {
		done();
		return;
	}

	walk (fullPath, foundMeta, {
		nameMatch: /.*\/(examples|.+\.cp{0,2}|.+\.h)$/i
	});

	var self = this;

	var data = {};
	var remains = 0;

	function foundMeta (err, files) {
		if (err && !files) {
			done ();
			return;
		}
		files.forEach (function (fileName) {
			if (fileName.match (/examples$/)) {
				// TODO: enumerateExamples
				//fs.stat (fileName,  self.enumerateExamples.bind  (self, fileName, self.ioDone ()));
				return;
			}
			var relativePath = fileName.substr (fullPath.length + 1);
//			console.log (relativePath.match (/[^\/]+/));
			var libName = relativePath.match (/[^\/]+/)[0];
//			console.log ('found lib', libName);
			// TODO: user and runtime can have librarieswith same name. prefer user ones
			if (!self.libraryData[libName])
				self.libraryData[libName] = {
					files: {},
					root: path.join (fullPath, libName)
				};
			self.libraryData[libName].files[relativePath.substr (libName.length+1)] = true;
		});
		done ();
	}
}

Arduino.prototype.enumerateHardware = function (fullPath, done, err, data) {

	if (err) {
		done();
		return;
	}

	walk (fullPath, foundMeta, {
		nameMatch: /.*\/(tools|libraries|boards.txt|platform.txt)$/i
	});

	var self = this;

	var remains = 0;

	function foundMeta (err, files) {
		if (err && !files) {
			done ();
			return;
		}
		files.forEach (function (fileName) {
			var relativePath = fileName.substr (fullPath.length + 1);
			// var libName = relativePath.match (/[^\/]+/)[0];
//			console.log (relativePath, relativePath.match (/[^\/]+\/[^\/]+\/libraries/));
			if (relativePath === "tools") {
				self.runtimeDir = fullPath.replace ('\/hardware', "");
				return;
			}
			var pathChunks = relativePath.split ('/');
			if (pathChunks.length > 3) {
				// something wrong
				console.log ('SOMETHING WRONG');
			}
			var vendor     = pathChunks[0];
			var arch       = pathChunks[1];
			var localFile  = pathChunks[2];

			var platformId = path.join (vendor, arch);
			if (!self.boardData[platformId])
				self.boardData[platformId] = {
					folders: {
						root: path.join (fullPath, platformId),
						arch: arch,
						vendor: vendor
					},
					libraryData: {}
				};

			if (localFile === 'libraries') {
				// TODO: little hackish
				fs.stat (fileName,  self.enumerateLibraries.bind  (self.boardData[platformId], fileName, self.ioDone ()));
				return;
			}
			var type = localFile.replace ('.txt', '');
			var readCb = function (err, type, fileData) {
				remains --;
				if (err) {
					return;
				}

				self.boardData[platformId][type] = fileData;

				if (remains)
					return;
				// self.boardData = data;
				done ();
				//					arduinoBoardsDone (cb, data);
			};
			fs.readFile (fileName, self.parseConfig.bind (self, readCb, type))
			remains ++;

		});
	}
}



Arduino.prototype.storeBoardsData = function () {
	fs.writeFile (
		path.join (__dirname, "../arduino.json"),
		JSON.stringify (this.boardData, null, '\t'),
		function (err) {}
	);
}

Arduino.prototype.loadBoardsData = function () {
	fs.readFile (path.join (__dirname, "../arduino.json"), (function (err, data) {
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


Arduino.prototype.storeLibraryData = function () {
	fs.writeFile (
		path.join (__dirname, "../libraries.json"),
		JSON.stringify (this.libraryData, null, '\t'),
		function (err) {}
	);
}

Arduino.prototype.loadLibraryData = function () {
	fs.readFile (path.join (__dirname, "../libraries.json"), (function (err, data) {
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

function createTempFile (fileName) {

	var temp = require('temp'),
		exec = require('child_process').exec;

	// Automatically track and cleanup files at exit
	temp.track();

	// For use with ConTeXt, http://wiki.contextgarden.net
	var myData = "\\starttext\nHello World\n\\stoptext";

	temp.mkdir('pdfcreator', function(err, dirPath) {
		var inputPath = path.join(dirPath, 'input.tex')
		fs.writeFile(inputPath, myData, function(err) {
			if (err) throw err;
			process.chdir(dirPath);
			exec("texexec '" + inputPath + "'", function(err) {
				if (err) throw err;
				fs.readFile(path.join(dirPath, 'input.pdf'), function(err, data) {
					if (err) throw err;
					sys.print(data);
				});
			});
		});
	});
}



Arduino.prototype.compile = function (sketchFolder, platformId, boardId, cpuId) {

	var platform = this.boardData[platformId].platform;
	var board = this.boardData[platformId].boards[boardId];

	var boardBuild = board.build;
	var cpu = board.menu.cpu[cpuId];

	"upload bootloader build".split (" ").forEach (function (stageName) {
		if (!cpu[stageName])
			return;
		for (var stageKey in cpu[stageName]) {
			board[stageName][stageKey] = cpu[stageName][stageKey];
		}
	});

	String.prototype.replaceDict = function (conf) {
		return this.replace (/{(\w+\.)*\w+}/g, function (match) {
			var varPath = match.substring (1, match.length - 1);
			var result = pathToVar (conf, varPath);
			if (result === undefined)
				throw "no interpolation found for "+varPath
			return result;
		})
	}

	// build stage
	var currentStage = "build";

	var conf = JSON.parse (JSON.stringify (platform));
	pathToVar (conf, 'runtime.ide.path', this.runtimeDir);
	pathToVar (conf, 'runtime.ide.version', "1.5.7");

	platform.compiler.path = platform.compiler.path.replaceDict (conf);

	for (var buildK in board.build) {
		conf.build[buildK] = board.build[buildK];
	}

	pathToVar (conf, 'build.arch', platformId.split ('/')[1].toUpperCase ());

//	console.log ('BUILD', conf.build, platform.recipe.cpp.o.pattern);

//	The uno.build.board property is used to set a compile-time variable ARDUINO_{build.board}
//	to allow use of conditional code between #ifdefs. The Arduino IDE automatically generate
//	a build.board value if not defined. In this case the variable defined at compile time will
//	be ARDUINO_AVR_UNO.

	var coreIncludes =
		' -I' + this.boardData[platformId].folders.root + '/cores/' + board.build.core
		+ ' -I' + this.boardData[platformId].folders.root + '/variants/' + board.build.variant;

	var includes = coreIncludes;
	var libCompile = {};
	// TODO: analyse source
	var self = this;
	"SPI RF24 BTLE".split (" ").forEach (function (libName) {
		var libDir = self.libraryData[libName] || self.boardData[platformId].libraryData[libName];
		if (!libDir || !libDir.root) {
			console.log ('cannot find library', libName);
		}
		libCompile[libName] = libDir;
		includes += ' -I' + libDir.root
	});

	// we can compile libs, core and current sources at same time
	// in a ideal case this is 3x speedup
	// also, core do not need a rebuild

	for (var libName in libCompile) {
		var libIncludes = includes + ' -I' + libCompile[libName].root + '/utility';
		for (var libSrcFile in libCompile[libName].files) {
			if (!libSrcFile.match (/\.c(pp)?$/))
				return;
			var ext = libSrcFile.substring (libSrcFile.lastIndexOf ('.')+1);
			conf.source_file = libSrcFile;
			// TODO: build dir
			conf.object_file = libSrcFile + '.o';
			conf.includes    = libIncludes;
			var compileCmd   = platform.recipe[ext].o.pattern.replaceDict (conf);
		}
	}

	walk (sketchFolder, foundProjectFile, {
		nameMatch: /[^\/]+\.c(pp)?$/i
	});

	walk (this.boardData[platformId].folders.root + '/cores/' + board.build.core, foundCoreFile, {
		nameMatch: /[^\/]+\.c(pp)?$/i
	});

	function foundProjectFile (err, files) {
		if (err) {
			console.log (err);
			return;
		}

		files.forEach (function (srcFile) {
			var ext = srcFile.substring (srcFile.lastIndexOf ('.')+1);
			conf.source_file = srcFile;
			// TODO: build dir
			conf.object_file = srcFile + '.o';
			conf.includes    = includes;
			var compileCmd   = platform.recipe[ext].o.pattern.replaceDict (conf);
			console.log (compileCmd);
		});
	}

	function foundCoreFile (err, files) {
		if (err) {
			console.log (err);
			return;
		}

		files.forEach (function (srcFile) {
			var ext = srcFile.substring (srcFile.lastIndexOf ('.')+1);
			conf.source_file = srcFile;
			// TODO: build dir
			conf.object_file = srcFile + '.o';
			conf.includes = coreIncludes;
			var compileCmd = platform.recipe[ext].o.pattern.replaceDict (conf);
			console.log (compileCmd);
		});

		// after all, we need to make core.a file
	}

	// for each library add [lib folder]/utility

//	var cppCompile = platform.recipe.cpp.o.pattern.replaceDict (conf);

	// original arduino compile routine
	// https://github.com/arduino/Arduino/blob/3a8ad75bcef5932cfc81c4746a87ddbdbd7e6402/app/src/processing/app/debug/Compiler.java

	// docs
	// https://github.com/arduino/Arduino/wiki/Arduino-IDE-1.5---3rd-party-Hardware-specification

//	console.log (cppCompile);

}

Arduino.prototype.compile.executeShell = function () {

}

function pathToVar (root, varPath, value) {
	varPath.split ('.').forEach (function (chunk, index, chunks) {
		// pathChunks[index] = chunk;
		var newRoot = root[chunk];
		if (index === chunks.length - 1) {
			if (value !== undefined) {
				root[chunk] = value;
			} else {
				root[chunk];
			}
		} else if (!newRoot) {
			root[chunk] = {};
			newRoot = root[chunk];
		}
		root = newRoot;
	});
	return root;
}

module.exports = Arduino;
