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


module.exports = {
	pathToVar: pathToVar,
	replaceDict: replaceDict
};
