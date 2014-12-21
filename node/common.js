"use strict";

var os   = require("os");
var fs   = require('fs');
var path = require ('path');
var util = require ('util');

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
		if (root === undefined) {
			throw "no value for "+ varPath;
		}

		if (root.constructor === String) {
			console.log ("bad config for:", varPath, root[sec].toString ());
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
		var result = pathToVar (conf, varPath);
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
	var results = {};
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		var pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function(file) {
			file = path.join (dir, file);
			fs.lstat(file, function(err, stat) {

				var ok = false;
				if ("nameMatch" in options && file.match (options.nameMatch)) {
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
					}
				}
				if (!--pending) done(null, results);
			});

		});
	});
};

module.exports = {
	pathToVar: pathToVar,
	replaceDict: replaceDict,
	pathWalk: pathWalk
};
