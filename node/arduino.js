"use strict";

var os   = require("os");
var fs   = require('fs');
var path = require ('path');
var util = require ('util');

var EventEmitter = require('events').EventEmitter;

var Arduino = function (runtimeDirs, userDirs) {

	// useful for reloading
	this.init (runtimeDirs, userDirs);

	this.boardData = {};
	this.libraryData = {};

	this.on ('done', this.storeBoardsData.bind (this));
	this.on ('done', this.storeLibraryData.bind (this));
}

util.inherits (Arduino, EventEmitter);

Arduino.prototype.init = function (runtimeDirs, userDirs) {
	runtimeDirs = appendStandardLocations ('runtime', runtimeDirs);
	userDirs    = appendStandardLocations ('user',    userDirs);

	// we must find correct arduino ide location.
	// we assume [arduino ide]/hardware/tools contains avr-gcc and so on
	// TODO: linux path resolve

	this.processDirs ('runtime', runtimeDirs);
	this.processDirs ('user',    userDirs);
}

var dirsToProcess = 0;
Arduino.prototype.ioDone = function () {
	var self = this;
	dirsToProcess++;
//	console.log ('dirsToProcess++', dirsToProcess);
	return function () {
		dirsToProcess --;
//		console.log ('dirsToProcess--', dirsToProcess);
		if (!dirsToProcess)
			setTimeout (function () {
				if (!dirsToProcess)
					self.emit ('done');
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

Arduino.prototype.storeLibraryData = function () {
	fs.writeFile (
		path.join (__dirname, "../libraries.json"),
		JSON.stringify (this.libraryData, null, '\t'),
		function (err) {}
	);
}

Arduino.prototype.compile = function (platformId, boardId, cpuId) {

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
			return pathToVar (conf, varPath);
		})
	}


	// build stage
	var currentStage = "build";

	// TODO: enumerate libraries
	///Applications/devel/Arduino.app/Contents/Java/hardware/tools/avr/bin/avr-g++
	//-c -g -Os -w -fno-exceptions -ffunction-sections -fdata-sections -MMD -mmcu=atmega328p
	//-DF_CPU=16000000L -DARDUINO=157 -DARDUINO_AVR_PRO -DARDUINO_ARCH_AVR
	//-I/Applications/devel/Arduino.app/Contents/Java/hardware/arduino/avr/cores/arduino
	//-I/Applications/devel/Arduino.app/Contents/Java/hardware/arduino/avr/variants/eightanaloginputs
	//-I/Applications/devel/Arduino.app/Contents/Java/hardware/arduino/avr/libraries/SPI
	//-I/Users/apla/Documents/Arduino/libraries/RF24
	//-I/Users/apla/Documents/Arduino/libraries/BTLE
	///var/folders/r4/d4l8c_ts4rsdc670pdkbtr0m0000gn/T/build4558466746462003224.tmp/btle_send.cpp
	//-o /var/folders/r4/d4l8c_ts4rsdc670pdkbtr0m0000gn/T/build4558466746462003224.tmp/btle_send.cpp.o

	// TODO: use located runtime dir
	var conf = platform;
	pathToVar (conf, 'runtime.ide.path', this.runtimeDir);

	platform.compiler.path = platform.compiler.path.replaceDict (conf);

	var cppCompile = platform.recipe.cpp.o.pattern.replaceDict (conf)
	+ '=' + board.build.mcu
	+ ' -DF_CPU=' + board.build.f_cpu
	+ ' -DARDUINO=157' // version?
	+ ' -DARDUINO_'+ board.build.board
	+ ' -DARDUINO_ARCH_' + 'AVR' // TODO: extract from folder name
	+ ' -I' + this.boardData[platformId].folders.root + '/cores/' + board.build.core
	+ ' -I' + this.boardData[platformId].folders.root + '/variants/' + board.build.variant;

	var self = this;
	"SPI RF24 BTLE".split (" ").forEach (function (libName) {
		var libDir = self.libraryData[libName] || self.boardData[platformId].libraryData[libName];
		if (!libDir || !libDir.root) {
			console.log ('cannot find library', libName);
		}
		cppCompile += ' -I' + libDir.root
	});

	console.log (cppCompile);

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
