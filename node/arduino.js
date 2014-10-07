"use strict";

var os   = require("os");
var fs   = require('fs');
var path = require ('path');
var util = require ('util');

var EventEmitter = require('events').EventEmitter;

var ArduinoCompiler = require ('./compiler');

var Arduino = function (userDirs) {

	// useful for reloading
	this.init (userDirs);

	this.boardData = {};
	this.libraryData = {};

	this.on ('done', this.storeBoardsData.bind (this));
	this.on ('done', this.storeLibraryData.bind (this));

	this.on ('done', (function () {
		Arduino.instance = this;
	}).bind (this));
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
			var libName = relativePath.match (/[^\/]+/)[0].toLowerCase();
//			console.log ('found lib', libName);
			// TODO: user and runtime can have libraries with same name. prefer user ones
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



function processIno (sketchFolder, compiler) {
	var sketchName = sketchFolder.substring (sketchFolder.lastIndexOf ('/') + 1);
	var inoFile = path.join (sketchFolder, sketchName + '.ino');

//	console.log (inoFile);

	fs.readFile (inoFile, (function (err, data) {
		if (err) {
			console.log ('ino parsing failed');
			cb (err);
			return;
		}

		var inoContents = data.toString ();

		// let's find all #includes
		var includeRe = /^#include <([^>]+)\.h>/gm;
		var matchArray;
		var libNames = [];

		while ((matchArray = includeRe.exec(inoContents)) !== null) {
			libNames.push (matchArray[1]);
		}

		// var firstStatementRe = /(\s*(\/\*[^*]*\*\/|\/\/.*?$|#([^#])*)\n)*/gm;

//		console.log (inoContents.split (firstStatementRe));

		fs.writeFile (inoFile+'.cpp', "#include <Arduino.h>\n" + inoContents, function (err, done) {
			compiler.setProjectFiles (null, [inoFile+'.cpp'], true);
			compiler.setLibNames (libNames);
		});

		// TODO: process ino at compiler

	}).bind (this));
}

Arduino.prototype.findLib = function (platformId, libName) {
//	console.log (this.libraryData, this.boardData[platformId].libraryData, platformId, libName);
	libName = libName.toLowerCase();
	return this.libraryData[libName] || this.boardData[platformId].libraryData[libName];
}

Arduino.prototype.compile = function (sketchFolder, buildFolder, platformId, boardId, cpuId) {

	var platform = this.boardData[platformId].platform;
	var board = this.boardData[platformId].boards[boardId];

	var boardBuild = board.build;
	var cpu = board.menu.cpu[cpuId];

	var compiler = this.compiler = new ArduinoCompiler (this.boardData[platformId], platformId, boardId, cpuId);

	processIno (sketchFolder, compiler);

	walk (sketchFolder, compiler.setProjectFiles.bind (compiler), {
		nameMatch: /[^\/]+\.c(pp)?$/i
	});

	walk (this.boardData[platformId].folders.root + '/cores/' + board.build.core, compiler.setCoreFiles.bind (compiler), {
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

Arduino.prototype.compile.executeShell = function () {

}

module.exports = Arduino;
