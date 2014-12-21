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
			if (root[sec] === undefined) {
				root[sec] = {};
			}
			if (i < refs.length - 1 && root[sec] && root[sec].constructor === String) {
				root[sec] = new String (root[sec]);
			}
			if (i === refs.length - 1) {
				root[sec] = value;
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

/*
	jQuery.extend extracted from the jQuery source & optimised for NodeJS
	Twitter: @FGRibreau / fgribreau.com

	Usage:
		var Extend = require('./Extend');


		// Extend
		var obj = Extend({opt1:true, opt2:true}, {opt1:false});

		// Deep Copy
		var clonedObject = Extend(true, {}, myObject);
		var clonedArray = Extend(true, [], ['a',['b','c',['d']]]);
*/
var toString = Object.prototype.toString,
	hasOwn = Object.prototype.hasOwnProperty,
	push = Array.prototype.push,
	slice = Array.prototype.slice,
	trim = String.prototype.trim,
	indexOf = Array.prototype.indexOf,

	// [[Class]] -> type pairs
	class2type = {};

// Populate the class2type map
"Boolean Number String Function Array Date RegExp Object".split(" ").forEach(function(name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function type(obj){
	return obj == null ?
		String( obj ) :
	class2type[ toString.call(obj) ] || "object";
}

function isPlainObject( obj ) {
	if ( !obj || type(obj) !== "object") {
		return false;
	}

	// Not own constructor property must be Object
	if ( obj.constructor &&
		!hasOwn.call(obj, "constructor") &&
		!hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.

	var key;
	for ( key in obj ) {}

	return key === undefined || hasOwn.call( obj, key );
}

function extend () {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && type(target) !== "function") {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( length === i ) {
		target = this;
		--i;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( isPlainObject(copy) || (copyIsArray = type(copy) === "array") ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && type(src) === "array" ? src : [];

					} else {
						clone = src && isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = extend( deep, clone, copy );

					// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

module.exports = {
	pathToVar: pathToVar,
	replaceDict: replaceDict,
	pathWalk: pathWalk,
	extend: extend
};
