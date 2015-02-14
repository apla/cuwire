
/**
 * simple key-value inmemory storage
 * @param {Object} data plain object with data
 */
function KeyValue (data) {
	this.initWith (data);
}

/**
 * copy data into storage
 * @param {Object} data plain object with data
 */
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


module.exports = KeyValue;
