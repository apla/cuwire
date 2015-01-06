var util = require ('util');

var CuwireSerial = require ('cuwire/console');

function CuwireSerialBrackets (options) {
}

util.inherits (CuwireSerialBrackets, CuwireSerial);

CuwireSerial.brackets = CuwireSerialBrackets;

var scope = "serial";

CuwireSerialBrackets.prototype.onOpen = function (sp, cb) {

	this.port = sp;

	this.emit ('log', scope, 'Console open, use Ctr-c to exit.\r\n');

	this.port.on ('data', (function (buf) {
		this.emit ('data', buf.toString());
	}).bind(this));

	cb && cb ();
}

module.exports = CuwireSerial;
